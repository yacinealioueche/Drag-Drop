
<!-- File name: decompressrtf.js -->
<script>
(function () {
  'use strict';

  function decodeCP1252(bytes) {
    if (typeof TextDecoder !== 'undefined') {
      try { return new TextDecoder('windows-1252').decode(bytes); }
      catch (_) { return new TextDecoder('latin1').decode(bytes); }
    }
    var s = '';
    for (var i = 0; i < bytes.length; i++) s += String.fromCharCode(bytes[i] & 0xff);
    return s;
  }

  function arrayBufferFromString(str) {
    var buf = new ArrayBuffer(str.length);
    var view = new Uint8Array(buf);
    for (var i = 0; i < str.length; i++) view[i] = str.charCodeAt(i) & 0xff;
    return buf;
  }

  function decompressRTF(input /* Uint8Array */) {
    // Header: cbSize (0..3), cbRawSize (4..7), dwMagic (8..11), dwCRC (12..15)
    var buf = input.buffer.slice(input.byteOffset, input.byteOffset + input.byteLength);
    var dv = new DataView(buf);
    var cbSize = dv.getUint32(0, true);
    var cbRawSize = dv.getUint32(4, true);
    var dwMagic = dv.getUint32(8, true);
    // var dwCRC  = dv.getUint32(12, true);

    var LZFU = 0x75465a4c; // 'LZFu'
    var MELA = 0x414c454d; // 'MELA'

    // If already uncompressed (MELA), the stream body is plain RTF
    if (dwMagic === MELA) {
      var raw = new Uint8Array(buf, 16, cbRawSize);
      return {
        rtfString: decodeCP1252(raw),
        rtfBytes: raw
      };
    }
    if (dwMagic !== LZFU) {
      throw new Error('Not a compressed RTF stream: missing LZFu/MELA header');
    }

    // Pre-seeded dictionary per MS-OXRTFCP/freeutils notes
    var PREBUF_STR =
      "{\\rtf1\\ansi\\mac\\deff0\\deftab720{\\fonttbl;}{\\f0\\fnil \\froman \\fswiss \\fmodern \\fscript \\fdecor MS Sans SerifSymbolArialTimes New RomanCourier{\\colortbl\\red0\\green0\\blue0\n\r\\par \\pard\\plain\\f0\\fs20\\b\\i\\u\\tab\\tx ";
    var dict = new Uint8Array(4096);
    dict.fill(0);
    for (var i = 0; i < PREBUF_STR.length; i++) dict[i] = PREBUF_STR.charCodeAt(i) & 0xff;
    var dictPos = PREBUF_STR.length & 0x0fff;

    var out = new Uint8Array(cbRawSize);
    var outPos = 0;
    var src = 16; // after header

    while (outPos < cbRawSize && src < input.length) {
      var flags = input[src++];

      for (var bit = 0; bit < 8 && outPos < cbRawSize && src < input.length; bit++) {
        if (((flags >> bit) & 1) === 0) {
          // literal byte
          var b = input[src++];
          out[outPos++] = b;
          dict[dictPos] = b; dictPos = (dictPos + 1) & 0x0fff;
        } else {
          // two bytes: 12-bit offset, 4-bit length (+2)
          var b1 = input[src++], b2 = input[src++];
          var offset = ((b1 << 4) | (b2 >> 4)) & 0x0fff;
          var len = (b2 & 0x0f) + 2;
          for (var k = 0; k < len && outPos < cbRawSize; k++) {
            var bb = dict[(offset + k) & 0x0fff];
            out[outPos++] = bb;
            dict[dictPos] = bb; dictPos = (dictPos + 1) & 0x0fff;
          }
        }
      }
    }

    return {
      rtfString: decodeCP1252(out),
      rtfBytes: out
    };
  }

  // Expose API on window for LWC loadScript usage
  window.DecompressRTF = {
    decompressRTF: decompressRTF,
    arrayBufferFromString: arrayBufferFromString
  };
})();
</script>
