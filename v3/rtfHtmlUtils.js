//how to use it 

import { rtfToOriginalHtml } from 'c/rtfHtmlUtils';

// rtf is your decompressed string shown above
const htmlRaw = rtfToOriginalHtml(rtf, { unescapeHtmlEntities: true });

// Sanity check:
console.log(htmlRaw.slice(0, 400));




/**
 * Extract original HTML from RTF that encapsulates HTML using {\*\htmltag ...} groups.
 * LWC-ready, dependency-free.
 *
 * References:
 *  - [MS-OXRTFEX] Extracting Encapsulated HTML from RTF — copy CONTENT of HTMLTAG groups, decode escapes. 
 *  - [MS-OXRTFEX] Encoding HTML into RTF — producers set \fromhtml/\htmlrtf and emit {\*\htmltag...} groups.
 * (See documentation links in comments of the previous message.)
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

// Optional: unescape a safe subset of HTML entities commonly seen in the RTF payloads
function decodeBasicHtmlEntities(s) {
    return s
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .replace(/&amp;/g, '&')
        .replace(/&quot;/g, '"')
        .replace(/&#39;|&apos;/g, "'");
}

/**
 * Extract encapsulated HTML by concatenating ALL {\*\htmltag ...} groups.
 * @param {string} rtfString  Decompressed RTF string
 * @param {Object} [opts]
 * @param {boolean} [opts.unescapeHtmlEntities=false]  convert &lt;&gt;&amp;… to literal chars
 * @returns {string}
 */
export function rtfToOriginalHtml(rtfString, { unescapeHtmlEntities = false } = {}) {
    if (!rtfString || typeof rtfString !== 'string') return '';

    const len = rtfString.length;
    let i = 0;
    const fragments = [];

    // Detect global \ucN from header (affects how many fallback chars to skip after \uN)
    let ucSkip = 1;
    const ucMatch = rtfString.slice(0, 2048).match(/\\uc(-?\d+)/);
    if (ucMatch) {
        const n = parseInt(ucMatch[1], 10);
        if (!Number.isNaN(n) && n >= 0) ucSkip = n;
    }

    function readHtmltagGroupAt(startIndex) {
        // Precondition: rtfString[startIndex] === '{'
        const n = len;
        let j = startIndex + 1;

        // optional whitespace
        while (j < n && /\s/.test(rtfString[j])) j++;
        // must be \*
        if (!(rtfString[j] === '\\' && rtfString[j + 1] === '*')) return null;
        j += 2;
        while (j < n && /\s/.test(rtfString[j])) j++;
        // must be \htmltag
        if (rtfString[j] !== '\\') return null;
        j++;
        if (!rtfString.startsWith('htmltag', j)) return null;
        j += 'htmltag'.length;

        // optional numeric parameter (tag code) and optional delimiting space
        while (j < n && /[-0-9]/.test(rtfString[j])) j++;
        if (rtfString[j] === ' ') j++;

        // Now collect text until the matching '}' for this group
        let depth = 1;
        let k = j;
        const out = [];

        function emit(s) { if (s) out.push(s); }

        while (k < n && depth > 0) {
            const ch = rtfString[k];

            if (ch === '{') { depth++; k++; continue; }
            if (ch === '}') { depth--; k++; continue; }

            if (ch === '\\') {
                k++;
                const c2 = rtfString[k];

                // Escaped literals
                if (c2 === '\\' || c2 === '{' || c2 === '}') {
                    emit(c2); k++; continue;
                }

                // Hex byte: \'hh
                if (c2 === "'") {
                    const hex = rtfString.substr(k + 1, 2);
                    if (/^[0-9a-fA-F]{2}$/.test(hex)) {
                        emit(decodeCp1252Byte(parseInt(hex, 16)));
                        k += 3;
                    } else {
                        emit('\uFFFD'); k++;
                    }
                    continue;
                }

                // Control word with optional numeric param
                let w = '';
                while (k < n && /[a-zA-Z]/.test(rtfString[k])) w += rtfString[k++];
                let sign = 1, hasNum = false, num = '';
                if (rtfString[k] === '-') { sign = -1; hasNum = true; k++; }
                while (k < n && /[0-9]/.test(rtfString[k])) { num += rtfString[k++]; hasNum = true; }
                if (rtfString[k] === ' ') k++; // delimiter if present

                if (w === 'u' && hasNum) {
                    let cp = sign * parseInt(num || '0', 10);
                    if (cp < 0) cp = 0x10000 + cp;
                    emit((cp >= 0 && cp <= 0x10FFFF) ? String.fromCodePoint(cp) : '\uFFFD');

                    // Skip ucSkip fallback chars
                    let skipped = 0;
                    while (skipped < ucSkip && k < n) {
                        if (rtfString[k] === '\\' && rtfString[k + 1] === "'") { k += 4; skipped++; continue; }
                        if (rtfString[k] === '{' || rtfString[k] === '}') break;
                        k++; skipped++;
                    }
                } else if (w === 'par' || w === 'line') {
                    emit('\n');
                } else if (w === 'tab') {
                    emit('\t');
                } else {
                    // Ignore all other control words within HTMLTAG group
                }
                continue;
            }

            // Literal character
            emit(ch);
            k++;
        }

        return { endIndex: k, text: out.join('') };
    }

    while (i < len) {
        if (rtfString[i] === '{') {
            const group = readHtmltagGroupAt(i);
            if (group) {
                fragments.push(group.text);
                i = group.endIndex; // continue after the group
                continue;
            }
        }
        i++;
    }

    let html = fragments.join('');
    if (unescapeHtmlEntities) html = decodeBasicHtmlEntities(html);
    return html;
}
