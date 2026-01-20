
/*! RTF Encapsulated HTML De-Encapsulator (UMD, browser-friendly)
 *  Purpose: Extract the original HTML embedded by Outlook/Word inside RTF
 *  Algorithm: Follows MS-OXRTFEX de-encapsulation guidance for HTMLTAG destinations.
 *  - Copy text inside {\*\htmltag ...} groups (CONTENT) and decode RTF escapes.
 *  - Ignore non-HTMLTAG content outside those groups (suppressed by \htmlrtf).
 *  - Handle \uN with \ucN fallback, \'hh bytes as CP-1252, and escaped \ { }.
 *  References: MS-OXRTFEX (HTMLTAG & Extracting Encapsulated HTML)
 *    https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxrtfex/906fbb0f-2467-490e-8c3e-bdc31c5e9d35
 *    https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxrtfex/752835a4-ad5e-49e3-acce-6b654b828de5
 */
(function (root, factory) {
  if (typeof define === 'function' && define.amd) {
    define([], function () { return factory(root); });
  } else if (typeof module === 'object' && module.exports) {
    module.exports = factory(globalThis || global || {});
  } else {
    root.RtfStreamParser = factory(root);
  }
}(typeof self !== 'undefined' ? self : this, function (root) {
  'use strict';

  // ---- CP-1252 map for control range 0x80..0x9F ----
  const CP1252_MAP = {
    0x80: 0x20AC, 0x82: 0x201A, 0x83: 0x0192, 0x84: 0x201E, 0x85: 0x2026,
    0x86: 0x2020, 0x87: 0x2021, 0x88: 0x02C6, 0x89: 0x2030, 0x8A: 0x0160,
    0x8B: 0x2039, 0x8C: 0x0152, 0x8E: 0x017D, 0x91: 0x2018, 0x92: 0x2019,
    0x93: 0x201C, 0x94: 0x201D, 0x95: 0x2022, 0x96: 0x2013, 0x97: 0x2014,
    0x98: 0x02DC, 0x99: 0x2122, 0x9A: 0x0161, 0x9B: 0x203A, 0x9C: 0x0153,
    0x9E: 0x017E, 0x9F: 0x0178
  };

  function decodeCp1252Byte(b) {
    if (b >= 0x00 && b <= 0x7F) return String.fromCharCode(b);
    if (b >= 0xA0 && b <= 0xFF) return String.fromCharCode(b);
    const cp = CP1252_MAP[b];
    return cp ? String.fromCodePoint(cp) : '\uFFFD';
  }

  // ---- Encoding helpers for browser ----
  function normalizeEncoding(enc) {
    if (!enc) return 'utf-8';
    const s = String(enc).toLowerCase();
    if (s === 'cp0') return 'windows-1252'; // fallback if producer wrote cp0
    return s
      .replace(/^cp(\d+)$/, 'windows-$1')
      .replace(/^ansi(\d+)$/, 'windows-$1');
  }

  /** Browser decoder using TextDecoder (no iconv-lite needed). */
  function browserDecode(buf, enc) {
    const label = normalizeEncoding(enc);
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    // fatal=false: replace invalid sequences rather than throwing
    return new TextDecoder(label, { fatal: false }).decode(u8);
  }

  // ---- Core parser: walk the RTF and extract all {\*\htmltag ...} groups ----
  function deEncapsulateHtmlString(rtf, options) {
    const opts = options || {};
    // Return empty string on bad input
    if (!rtf || typeof rtf !== 'string') return '';

    let i = 0;
    const n = rtf.length;
    const htmlFragments = [];

    // Track \ucN (Unicode fallback count). Spec allows changes per group; we
    // keep a stack of states to handle inheritance correctly.
    let ucSkip = 1;
    let inIgnorable = false;
    let inHtmlTag = false;

    const stack = []; // push { ucSkip, inIgnorable, inHtmlTag }

    // Utility
    const peek = () => (i < n ? rtf[i] : '');
    const next = () => (i < n ? rtf[i++] : '');

    function skipFallback(count) {
      let skipped = 0;
      while (skipped < count && i < n) {
        const ch = peek();
        if (ch === '\\') {
          const ahead = rtf.slice(i, i + 4);
          if (/^\\'[0-9a-fA-F]{2}/.test(ahead)) {
            i += 4; skipped += 1; continue;
          }
          // consume backslash and next token minimally
          next();
          if (i < n) next();
          skipped += 1;
        } else if (ch === '{' || ch === '}') {
          // stop at group boundary
          break;
        } else {
          next(); skipped += 1;
        }
      }
    }

    function emitText(text) {
      if (!text) return;
      if (inHtmlTag) htmlFragments.push(text);
    }

    function readControl() {
      // pre: current char is '\'
      next();
      const c = peek();
      if (!c) return null;

      // Escaped literal characters
      if (c === '\\' || c === '{' || c === '}') {
        next();
        return { type: 'escaped', char: c };
      }

      // Control symbol
      if (!/[a-zA-Z]/.test(c)) {
        const sym = next();
        if (sym === "'") {
          const hex = rtf.slice(i, i + 2);
          if (/^[0-9a-fA-F]{2}$/.test(hex)) {
            i += 2;
            const b = parseInt(hex, 16);
            return { type: 'text', text: decodeCp1252Byte(b) };
          }
          return { type: 'text', text: '\uFFFD' };
        }
        switch (sym) {
          case '~': return { type: 'text', text: '\u00A0' }; // NBSP
          case '-': return { type: 'text', text: '\u00AD' }; // soft hyphen
          case '_': return { type: 'text', text: '\u2011' }; // NB hyphen
          case '*': return { type: 'dest', name: '*' };      // ignorable marker
          default:  return { type: 'noop' };
        }
      }

      // Control word [letters][optional sign/number][optional delim space]
      let word = '';
      while (/[a-zA-Z]/.test(peek())) word += next();

      let hasParam = false, sign = 1, num = '';
      if (peek() === '-') { sign = -1; hasParam = true; next(); }
      while (/[0-9]/.test(peek())) { num += next(); hasParam = true; }
      const param = hasParam ? sign * parseInt(num || '0', 10) : undefined;

      if (peek() === ' ') next(); // consume delimiting space

      return { type: 'control', word, hasParam, param };
    }

    while (i < n) {
      const ch = peek();

      if (ch === '{') {
        next();
        stack.push({ ucSkip, inIgnorable, inHtmlTag });
        // New group inherits; flags will update as we read controls inside
      }
      else if (ch === '}') {
        next();
        const st = stack.pop() || {};
        ucSkip = st.ucSkip ?? ucSkip;
        inIgnorable = st.inIgnorable ?? false;
        inHtmlTag = st.inHtmlTag ?? false;
      }
      else if (ch === '\\') {
        const tok = readControl();
        if (!tok) continue;

        if (tok.type === 'escaped') {
          emitText(tok.char);
        }
        else if (tok.type === 'text') {
          emitText(tok.text);
        }
        else if (tok.type === 'dest') {
          inIgnorable = true;
        }
        else if (tok.type === 'control') {
          const { word, hasParam, param } = tok;

          if (word === 'uc' && hasParam && param >= 0) {
            ucSkip = param;
            continue;
          }

          if (word === 'u' && hasParam) {
            let cp = param;
            if (cp < 0) cp = 0x10000 + cp;
            emitText((cp >= 0 && cp <= 0x10FFFF) ? String.fromCodePoint(cp) : '\uFFFD');
            skipFallback(ucSkip);
            continue;
          }

          // Enter HTMLTAG destination when we see \htmltag inside an ignorable group
          if (inIgnorable && word === 'htmltag') {
            inHtmlTag = true;
            continue;
          }

          // Within HTMLTAG, map simple whitespace controls
          if (inHtmlTag) {
            if (word === 'par' || word === 'line') emitText('\n');
            else if (word === 'tab') emitText('\t');
            // Ignore formatting controls etc.
          }
          // Outside HTMLTAG: ignore (de-encapsulation wants only encapsulated HTML)
        }
      }
      else {
        // Literal char
        emitText(next());
      }
    }

    // Optional: unescape basic entities if the producer encoded tags as &lt; &gt; &amp;
    const unescapeEntities = opts.unescapeHtmlEntities === true;
    let html = htmlFragments.join('');
    if (unescapeEntities) {
      html = html
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'");
    }
    return html;
  }

  /** Compatibility API mirroring popular libs: returns { mode, text }. */
  function deEncapsulateSync(input, _opts) {
    // Accept string; if a Buffer/Uint8Array is passed, convert to string assuming UTF-8
    let rtf = '';
    if (typeof input === 'string') {
      rtf = input;
    } else if (input instanceof Uint8Array) {
      rtf = new TextDecoder('utf-8').decode(input);
    } else {
      rtf = String(input || '');
    }
    const html = deEncapsulateHtmlString(rtf, { unescapeHtmlEntities: true });
    if (!html) {
      // If no HTMLTAG groups found, we return "text" empty to be explicit
      return { mode: 'html', text: '' };
    }
    return { mode: 'html', text: html };
  }

  // Public API
  return {
    deEncapsulateHtmlString,
    deEncapsulateSync,
    browserDecode
  };
}));
