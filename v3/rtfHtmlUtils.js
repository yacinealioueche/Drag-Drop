
/**
 * RTF Encapsulated HTML → Original HTML (LWC-ready, no dependencies)
 *
 * This extracts the original HTML that Outlook/Word stored inside RTF
 * "HTMLTAG" destination groups (e.g., {\*\htmltag ...}).
 *
 * It follows the MS-OXRTFEX de-encapsulation rules at a practical level:
 *  - Only content inside HTMLTAG destination groups contributes to output.
 *  - The immediate text run after the \htmltagN control word (the
 *    HTMLTagParameter fragment) is ignored.
 *  - CONTENT fragments within the HTMLTAG group are copied after decoding
 *    RTF escapes (\uN with \ucN fallback skipping, and \'hh CP-1252 bytes).
 *  - Outside of HTMLTAG groups, content is ignored for HTML de-encapsulation.
 *
 * Note: Assumes the RTF is already decompressed if it came from Outlook's
 * "compressed RTF" transport.
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

/**
 * Extract original HTML from RTF that contains HTMLTAG destinations.
 * @param {string} rtfString - decompressed RTF string
 * @returns {string} - original HTML (best effort)
 */
export function rtfToOriginalHtml(rtfString) {
    if (!rtfString || typeof rtfString !== 'string') return '';

    let i = 0;
    const len = rtfString.length;

    // Output HTML fragments gathered from HTMLTAG CONTENT fragments
    const htmlOut = [];

    // Current state (inherits via stack on groups)
    let ucSkip = 1;         // \ucN fallback skip count after \uN
    let inIgnorable = false;// group marked with \* (ignorable destination)
    let inHtmlTag = false;  // inside {\*\htmltag ...} destination group
    let skipParamRun = false;// skip the first text run after \htmltagN (parameter fragment)
    let seenHtmltagControlInGroup = false;

    const stack = [];

    const peek = () => (i < len ? rtfString[i] : '');
    const next = () => (i < len ? rtfString[i++] : '');

    function skipFallback(n) {
        let skipped = 0;
        while (skipped < n && i < len) {
            const ch = peek();
            if (ch === '\\') {
                // If hex escape (\'hh), consume 4 chars as 1 fallback char.
                const ahead = rtfString.slice(i, i + 4);
                if (/^\\'[0-9a-fA-F]{2}/.test(ahead)) {
                    i += 4;
                    skipped += 1;
                    continue;
                }
                // Otherwise consume the backslash and next token minimally
                next();
                if (i < len) next();
                skipped += 1;
            } else if (ch === '{' || ch === '}') {
                // Don't cross group boundaries when skipping fallback
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

        if (ch === '\\' || ch === '{' || ch === '}') {
            next();
            return { type: 'escaped', char: ch };
        }

        if (!/[a-zA-Z]/.test(ch)) {
            const sym = next();
            if (sym === "'") {
                const hex = rtfString.slice(i, i + 2);
                if (/^[0-9a-fA-F]{2}$/.test(hex)) {
                    i += 2;
                    const b = parseInt(hex, 16);
                    return { type: 'text', text: decodeCp1252Byte(b) };
                }
                return { type: 'text', text: '\uFFFD' };
            }
            // Symbol controls that sometimes appear in HTML fragments
            switch (sym) {
                case '~': return { type: 'text', text: '\u00A0' };
                case '-': return { type: 'text', text: '\u00AD' };
                case '_': return { type: 'text', text: '\u2011' };
                case '*': return { type: 'dest', name: '*' };
                default:  return { type: 'noop' };
            }
        }

        let word = '';
        while (/[a-zA-Z]/.test(peek())) word += next();

        let hasParam = false, sign = 1, numStr = '';
        if (peek() === '-') { sign = -1; hasParam = true; next(); }
        while (/[0-9]/.test(peek())) { numStr += next(); hasParam = true; }
        const param = hasParam ? sign * parseInt(numStr || '0', 10) : undefined;

        if (peek() === ' ') next(); // delimiter space

        return { type: 'control', word, param, hasParam };
    }

    function maybeEmit(text) {
        if (!text) return;
        // Only collect when inside {\*\htmltag ...} and past the parameter fragment
        if (inHtmlTag && !skipParamRun) {
            htmlOut.push(text);
        }
    }

    while (i < len) {
        const ch = peek();

        if (ch === '{') {
            next();
            // Push group state
            stack.push({
                ucSkip, inIgnorable, inHtmlTag,
                skipParamRun, seenHtmltagControlInGroup
            });

            // On new group, inherit state; inHtmlTag remains false until we detect \*\htmltag
            skipParamRun = false;
            seenHtmltagControlInGroup = false;

        } else if (ch === '}') {
            next();
            // Pop state
            const st = stack.pop() || {};
            ucSkip = st.ucSkip ?? ucSkip;
            inIgnorable = st.inIgnorable ?? false;
            inHtmlTag = st.inHtmlTag ?? false;
            skipParamRun = st.skipParamRun ?? false;
            seenHtmltagControlInGroup = st.seenHtmltagControlInGroup ?? false;

        } else if (ch === '\\') {
            const tok = readControl();
            if (!tok) continue;

            if (tok.type === 'escaped') {
                // Literal \ { }
                maybeEmit(tok.char);

            } else if (tok.type === 'text') {
                // Hex decoded or symbol mapped to text
                maybeEmit(tok.text);

                // If we were skipping the HTMLTAG parameter, a successful text run counts as that parameter
                if (inHtmlTag && seenHtmltagControlInGroup && skipParamRun) {
                    // We consider one contiguous text token as the parameter.
                    // Stop skipping further content after this token.
                    skipParamRun = false;
                }

            } else if (tok.type === 'dest') {
                // \* marks an ignorable destination ahead
                inIgnorable = true;

            } else if (tok.type === 'control') {
                const { word, hasParam, param } = tok;

                if (word === 'uc' && hasParam && param >= 0) {
                    ucSkip = param;
                    continue;
                }

                if (word === 'u' && hasParam) {
                    // Unicode \uN (signed 16-bit)
                    let cp = param;
                    if (cp < 0) cp = 0x10000 + cp;
                    const char = (cp >= 0 && cp <= 0x10FFFF) ? String.fromCodePoint(cp) : '\uFFFD';
                    maybeEmit(char);
                    skipFallback(ucSkip);
                    continue;
                }

                // Detect start of {\*\htmltag ...} destination
                if (inIgnorable && word === 'htmltag') {
                    inHtmlTag = true;
                    seenHtmltagControlInGroup = true;
                    // Per spec, the "HTMLTagParameter" fragment comes right after this control word.
                    // We skip exactly the first subsequent text run in this group.
                    skipParamRun = true;
                    continue;
                }

                // Within HTMLTAG content, ignore most control words except those that produce characters
                if (inHtmlTag) {
                    switch (word) {
                        case 'par':
                        case 'line':
                            // HTML fragments may intentionally include newlines; preserve them.
                            maybeEmit('\n');
                            break;
                        case 'tab':
                            maybeEmit('\t');
                            break;
                        // Formatting and other RTF controls are ignored for de-encapsulation
                        default:
                            break;
                    }
                }

                // Otherwise: ignore control words
            }

        } else {
            // Plain literal character
            const c = next();

            if (inHtmlTag) {
                if (skipParamRun && seenHtmltagControlInGroup) {
                    // We're still skipping the HTMLTAG parameter; consume contiguous text,
                    // but do not emit. When a non-text token arrives later, skipParamRun will end.
                    // If this literal is whitespace, we still count it towards the "one run".
                    // To keep it simple, we end "skipParamRun" when we first encounter a control token,
                    // handled above. Here we keep skipping.
                    continue;
                }
                maybeEmit(c);
            }
            // Outside HTMLTAG: ignore
        }
    }

    return htmlOut.join('');
}
