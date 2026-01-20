
import { LightningElement } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import RTF_PARSER from '@salesforce/resourceUrl/rtf_parser_umd';

export default class RtfToHtml extends LightningElement {
  ready = false;
  async connectedCallback() {
    if (!this.ready) {
      await loadScript(this, RTF_PARSER);
      this.ready = true;
    }
  }

  extractHtml(rtfString) {
    const { deEncapsulateHtmlString } = window.RtfStreamParser;
    return deEncapsulateHtmlString(rtfString); // original HTML incl. text
  }
}
``


/*! RTF Encapsulated HTML De-Encapsulator (UMD, browser-friendly)
 *  Copies HTML from {\*\htmltag ...} and text outside when enabled by \htmlrtf0.
 *  Decodes \uN (with \ucN fallback), \'hh (CP-1252), and escaped \ { }.
 *  MS-OXRTFEX references:
 *    - HTMLTAG destination structure
 *      https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxrtfex/752835a4-ad5e-49e3-acce-6b654b828de5
 *    - Extracting encapsulated HTML (copy HTMLTAG + outside text when not suppressed by HTMLRTF)
 *      https://learn.microsoft.com/en-us/openspecs/exchange_server_protocols/ms-oxrtfex/906fbb0f-2467-490e-8c3e-bdc31c5e9d35
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

  function normalizeEncoding(enc) {
    if (!enc) return 'utf-8';
    const s = String(enc).toLowerCase();
    if (s === 'cp0') return 'windows-1252';
    return s
      .replace(/^cp(\d+)$/, 'windows-$1')
      .replace(/^ansi(\d+)$/, 'windows-$1');
  }

  function browserDecode(buf, enc) {
    const label = normalizeEncoding(enc);
    const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
    return new TextDecoder(label, { fatal: false }).decode(u8);
  }

  function deEncapsulateHtmlString(rtf, options) {
    const opts = options || {};
    if (!rtf || typeof rtf !== 'string') return '';

    let i = 0, n = rtf.length;
    const out = [];

    // State (inherited with groups)
    let ucSkip = 1;            // \ucN fallback count after \uN
    let inIgnorable = false;   // group started with \*
    let inHtmlTag = false;     // inside {\*\htmltag ...}
    let copyOutside = false;   // copy text outside HTMLTAG when \htmlrtf0 is active

    const stack = []; // push/pop { ucSkip, inIgnorable, inHtmlTag, copyOutside }

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
          next(); if (i < n) next();
          skipped += 1;
        } else if (ch === '{' || ch === '}') {
          break;
        } else { next(); skipped += 1; }
      }
    }

    function shouldEmit() {
      return inHtmlTag || copyOutside;
    }

    function emit(text) {
      if (text && shouldEmit()) out.push(text);
    }

    function readControl() {
      next(); // consume '\'
      const c = peek();
      if (!c) return null;

      // Escaped literals
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
            return { type: 'text', text: decodeCp1252Byte(parseInt(hex, 16)) };
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

      // Control word
      let word = '';
      while (/[a-zA-Z]/.test(peek())) word += next();

      let hasParam = false, sign = 1, num = '';
      if (peek() === '-') { sign = -1; hasParam = true; next(); }
      while (/[0-9]/.test(peek())) { num += next(); hasParam = true; }
      const param = hasParam ? sign * parseInt(num || '0', 10) : undefined;

      if (peek() === ' ') next(); // delimiter space

      return { type: 'control', word, hasParam, param };
    }

    while (i < n) {
      const ch = peek();

      if (ch === '{') {
        next();
        stack.push({ ucSkip, inIgnorable, inHtmlTag, copyOutside });
      }
      else if (ch === '}') {
        next();
        const st = stack.pop() || {};
        ucSkip = st.ucSkip ?? ucSkip;
        inIgnorable = st.inIgnorable ?? false;
        inHtmlTag = st.inHtmlTag ?? false;
        copyOutside = st.copyOutside ?? false;
      }
      else if (ch === '\\') {
        const tok = readControl();
        if (!tok) continue;

        if (tok.type === 'escaped') {
          emit(tok.char);
        }
        else if (tok.type === 'text') {
          emit(tok.text);
        }
        else if (tok.type === 'dest') {
          inIgnorable = true;
        }
        else if (tok.type === 'control') {
          const { word, hasParam, param } = tok;

          // Unicode fallback count
          if (word === 'uc' && hasParam && param >= 0) {
            ucSkip = param; continue;
          }

          // Unicode character
          if (word === 'u' && hasParam) {
            let cp = param;
            if (cp < 0) cp = 0x10000 + cp;
            emit((cp >= 0 && cp <= 0x10FFFF) ? String.fromCodePoint(cp) : '\uFFFD');
            skipFallback(ucSkip);
            continue;
          }

          // Enter HTMLTAG destination inside ignorable group
          if (inIgnorable && word === 'htmltag') {
            inHtmlTag = true; continue;
          }

          // HTMLRTF toggle (outside HTMLTAG): param==0 => allow copy; else suppress
          if (word === 'htmlrtf') {
            copyOutside = (hasParam && param === 0);
            continue;
          }

          // Whitespace controls
          if (word === 'par' || word === 'line') { emit('\n'); continue; }
          if (word === 'tab') { emit('\t'); continue; }

          // Ignore other controls here
        }
      }
      else {
        emit(next());
      }
    }

    // Optional: unescape basic entities if producer encoded tags as &lt; &gt; &amp;
    const unescape = opts.unescapeHtmlEntities === true;
    let html = out.join('');
    if (unescape) {
      html = html
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'");
    }
    return html;
  }

  function deEncapsulateSync(input, _opts) {
    let rtf = '';
    if (typeof input === 'string') rtf = input;
    else if (input instanceof Uint8Array) rtf = new TextDecoder('utf-8').decode(input);
    else rtf = String(input || '');

    const html = deEncapsulateHtmlString(rtf, { unescapeHtmlEntities: true });
    return { mode: 'html', text: html || '' };
  }

  return {
    deEncapsulateHtmlString,
    deEncapsulateSync,
    browserDecode
  };
}));
