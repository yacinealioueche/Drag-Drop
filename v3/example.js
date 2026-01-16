
import { LightningElement } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';

// Upload these as Static Resources with these names:
import DecompressRTF from '@salesforce/resourceUrl/DecompressRTF';
import RTF2HTML_Lite from '@salesforce/resourceUrl/RTF2HTML_Lite';

export default class CompressedRtfViewer extends LightningElement {
  b64 = '';
  libsLoaded = false;

  renderedCallback() {
    if (this.libsLoaded) return;
    Promise.all([
      loadScript(this, DecompressRTF),
      loadScript(this, RTF2HTML_Lite)
    ]).then(() => {
      this.libsLoaded = true;
    }).catch(e => console.error('Failed to load libs', e));
  }

  onInput = (e) => { this.b64 = e.target.value || ''; };

  convert = () => {
    if (!this.libsLoaded || !this.b64) return;

    // base64 -> Uint8Array
    const bin = atob(this.b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i) & 0xff;

    try {
      // 1) Decompress LZFu -> RTF string
      const { rtfString } = window.DecompressRTF.decompressRTF(bytes);

      // 2) RTF -> HTML (lite)
      const html = window.RTF2HTML_Lite.rtfToHtml(rtfString);

      // Inject into container
      const el = this.template.querySelector('[data-output]');
      el.innerHTML = html;
    } catch (err) {
      console.error(err);
      const el = this.template.querySelector('[data-output]');
      el.innerHTML = '<p class="slds-text-color_error">Failed to convert RTF.</p>';
    }
  };
}




function isValidRtfHeader(rtfStr) {
    return rtfStr.trim().startsWith("{\\rtf");
}



function hasBalancedBraces(rtfStr) {
    let count = 0;
    for (let ch of rtfStr) {
        if (ch === '{') count++;
        if (ch === '}') count--;
        if (count < 0) return false; // closing before opening
    }
    return count === 0;
}



function hasBasicRtfGroups(rtfStr) {
    return rtfStr.includes("\\rtf1") &&
           rtfStr.includes("\\fonttbl");
}


function containsNullBytes(rtfStr) {
    for (let i = 0; i < rtfStr.length; i++) {
        if (rtfStr.charCodeAt(i) === 0) return true;
    }
    return false;
}


function validateRtf(rtfStr) {
    const results = {
        header: rtfStr.trim().startsWith("{\\rtf"),
        balanced: hasBalancedBraces(rtfStr),
        groups: hasBasicRtfGroups(rtfStr),
        nullBytes: containsNullBytes(rtfStr)
    };

    const isValid = 
        results.header &&
        results.balanced &&
        results.groups &&
        !results.nullBytes;

    return { isValid, results };
}





// 1 — extract expected uncompressed size from LZFu header
function getExpectedCbRawSize(compressed) {
    const dv = new DataView(
        compressed.buffer,
        compressed.byteOffset,
        compressed.byteLength
    );
    return dv.getUint32(4, true); // cbRawSize
}

// 2 — decompress
const compressed = bytes; // Uint8Array from msgreader
const expectedCbRawSize = getExpectedCbRawSize(compressed);
const { rtfString, rtfBytes } = window.DecompressRTF.decompressRTF(compressed);

// 3 — get actual output size
const rawBytesLength = rtfBytes.length;

// 4 — compare
console.log({
    expectedCbRawSize,
    rawBytesLength
});

if (rawBytesLength !== expectedCbRawSize) {
    console.error("❌ Decompression incomplete — RTF is truncated.");
} else {
    console.log("✅ Decompression size OK — RTF is complete.");
}






