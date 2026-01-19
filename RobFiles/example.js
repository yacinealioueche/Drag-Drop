
import { LightningElement } from 'lwc';
import msgReaderLib from '@salesforce/resourceUrl/msgreader';
import decompressRtfLib from '@salesforce/resourceUrl/decompressrtf';
import rtfParserLib from '@salesforce/resourceUrl/rtf_stream_parser';
import rtfJsLib from '@salesforce/resourceUrl/rtfjs';
import { loadScript } from 'lightning/platformResourceLoader';

export default class MsgToHtml extends LightningElement {
    libsLoaded = false;

    async connectedCallback() {
        await this.loadLibs();
    }

    async loadLibs() {
        if (this.libsLoaded) return;

        await Promise.all([
            loadScript(this, msgReaderLib),
            loadScript(this, decompressRtfLib),
            loadScript(this, rtfParserLib),
            loadScript(this, rtfJsLib)
        ]);

        this.libsLoaded = true;
    }

    async parseMsgToHtml(arrayBuffer) {
        // 1. Parse MSG file
        const reader = new MSGReader(arrayBuffer);
        const msg = reader.getFileData();

        // msg.bodyRTF contains the RTF
        let rtf = msg.bodyRTF;

        // 2. Decompress RTF if needed
        if (window.decompressRTF && window.decompressRTF.isCompressed(rtf)) {
            rtf = window.decompressRTF.decompress(rtf);
        }

        // 3. Detect HTML encapsulation
        const hasHtmlEncapsulation =
            rtf.includes('\\fromhtml') ||
            rtf.includes('{\\*\\htmltag');

        if (hasHtmlEncapsulation) {
            // 4. De-encapsulate HTML
            const parser = new RtfParser();
            let extractedHtml = '';

            parser.on('destination', (dest) => {
                if (dest === 'html') {
                    extractedHtml += parser.getText();
                }
            });

            parser.parse(rtf);
            return extractedHtml;
        } else {
            // 5. Convert raw RTF → HTML using rtf.js
            const doc = new RTFJS.Document(rtf);
            const html = await doc.render();
            return html;
        }
    }
}
