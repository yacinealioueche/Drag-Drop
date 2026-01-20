//how to use it 

import { rtfToOriginalHtml } from 'c/rtfHtmlUtils';

// rtf is your decompressed string shown above
const htmlRaw = rtfToOriginalHtml(rtf, { unescapeHtmlEntities: true });

// Sanity check:
console.log(htmlRaw.slice(0, 200));



/**
 * Extract original HTML from RTF that encapsulates HTML using {\*\htmltag ...} groups.
 * LWC-ready, no dependencies.
 *
 * Based on MS-OXRTFEX de-encapsulation behavior:
 * - Copy text inside HTMLTAG destination groups to rebuild the HTML.
 * - Decode RTF escapes (\'hh CP-1252, \uN with \ucN fallback, and escaped braces/backslash).
 * - Ignore non-HTMLTAG RTF content (which is suppressed by \htmlrtf for de-encapsulation).
 *
 * References:
 *  - [MS-OXRTFEX] Extracting Encapsulated HTML from RTF (de-encapsulation) — Microsoft Learn
 *  - [MS-OXRTFEX] Encoding HTML into RTF (producer behavior) — Microsoft Learn
 */

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

// Optional: unescape a tiny, safe subset of HTML entities
function decodeBasicHtmlEntities(s) {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'");
}

/**
 * Extract encapsulated HTML from decompressed RTF.
 * @param {string} rtfString - decompressed RTF
 * @param {Object} [opts]
 * @param {boolean} [opts.unescapeHtmlEntities=false] - convert &lt; &gt; &amp; etc. to literal chars
 * @returns {string} original HTML (best effort)
 */
export function rtfToOriginalHtml(rtfString, { unescapeHtmlEntities = false } = {}) {
    if (!rtfString || typeof rtfString !== 'string') return '';

    let i = 0;
    const len = rtfString.length;
    const out = [];

    // State (per RTF spec, inherited via stack for groups)
    let ucSkip = 1;          // \ucN fallback count after \uN
    let inIgnorable = false; // group starts with \*
    let inHtmlTag = false;   // currently inside {\*\htmltag ...}
    const stack = [];

    const peek = () => (i < len ? rtfString[i] : '');
    const next = () => (i < len ? rtfString[i++] : '');

    function skipFallback(n) {
        let skipped = 0;
        while (skipped < n && i < len) {
            const ch = peek();
            if (ch === '\\') {
                const ahead = rtfString.slice(i, i + 4);
                if (/^\\'[0-9a-fA-F]{2}/.test(ahead)) {
                    i += 4;
                    skipped += 1;
                    continue;
                }
                next();
                if (i < len) next();
                skipped += 1;
            } else if (ch === '{' || ch === '}') {
                break;
            } else {
                next();
                skipped += 1;
            }
        }
    }

    function readControl() {
        next(); // consume '\'
        const ch = peek();
        if (!ch) return null;

        // Escaped literal characters
        if (ch === '\\' || ch === '{' || ch === '}') {
            next();
            return { type: 'escaped', char: ch };
        }

        // Control symbol
        if (!/[a-zA-Z]/.test(ch)) {
            const sym = next();
            if (sym === "'") {
                const hex = rtfString.slice(i, i + 2);
                if (/^[0-9a-fA-F]{2}$/.test(hex)) {
                    i += 2;
                    return { type: 'text', text: decodeCp1252Byte(parseInt(hex, 16)) };
                }
                return { type: 'text', text: '\uFFFD' };
            }
            switch (sym) {
                case '~': return { type: 'text', text: '\u00A0' };
                case '-': return { type: 'text', text: '\u00AD' };
                case '_': return { type: 'text', text: '\u2011' };
                case '*': return { type: 'dest', name: '*' };
                default:  return { type: 'noop' };
            }
        }

        // Control word
        let word = '';
        while (/[a-zA-Z]/.test(peek())) word += next();

        // Optional signed integer parameter
        let hasParam = false, sign = 1, numStr = '';
        if (peek() === '-') { sign = -1; hasParam = true; next(); }
        while (/[0-9]/.test(peek())) { numStr += next(); hasParam = true; }
        const param = hasParam ? sign * parseInt(numStr || '0', 10) : undefined;

        if (peek() === ' ') next(); // delimiter

        return { type: 'control', word, hasParam, param };
    }

    function emit(text) {
        if (inHtmlTag && text) out.push(text);
    }

    while (i < len) {
        const ch = peek();

        if (ch === '{') {
            next();
            stack.push({ ucSkip, inIgnorable, inHtmlTag });
            // New group inherits, flags update when we see \* or \htmltag below

        } else if (ch === '}') {
            next();
            const st = stack.pop() || {};
            ucSkip = st.ucSkip ?? ucSkip;
            inIgnorable = st.inIgnorable ?? false;
            inHtmlTag = st.inHtmlTag ?? false;

        } else if (ch === '\\') {
            const tok = readControl();
            if (!tok) continue;

            if (tok.type === 'escaped') {
                emit(tok.char);

            } else if (tok.type === 'text') {
                emit(tok.text);

            } else if (tok.type === 'dest') {
                // Group is ignorable (destination) — needed to detect {\*\htmltag ...}
                inIgnorable = true;

            } else if (tok.type === 'control') {
                const { word, hasParam, param } = tok;

                // Set \ucN for unicode fallback handling
                if (word === 'uc' && hasParam && param >= 0) {
                    ucSkip = param;
                    continue;
                }

                // Unicode escape \uN
                if (word === 'u' && hasParam) {
                    let cp = param;
                    if (cp < 0) cp = 0x10000 + cp;
                    emit((cp >= 0 && cp <= 0x10FFFF) ? String.fromCodePoint(cp) : '\uFFFD');
                    skipFallback(ucSkip);
                    continue;
                }

                // Enter HTMLTAG destination when we see \htmltag inside an ignorable group
                if (inIgnorable && word === 'htmltag') {
                    inHtmlTag = true;
                    continue;
                }

                // Within HTMLTAG groups, map common whitespace controls
                if (inHtmlTag) {
                    if (word === 'par' || word === 'line') emit('\n');
                    else if (word === 'tab') emit('\t');
                    // formatting controls are ignored
                }

                // Outside HTMLTAG: ignore (de-encapsulation wants only encapsulated HTML)
            }

        } else {
            // Plain literal character
            const c = next();
            emit(c);
        }
    }

    const html = out.join('');
    return unescapeHtmlEntities ? decodeBasicHtmlEntities(html) : html;
}
