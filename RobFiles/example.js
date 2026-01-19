ROB EXAMPLE

import { LightningElement, api, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import MSG_READER from '@salesforce/resourceUrl/msgReaderLib';
import RTF_TOOLS from '@salesforce/resourceUrl/rtfToolsBrowserify';
import RTF_DECOMPRESSOR from '@salesforce/resourceUrl/rtfDecompressorBrowserify';
import RTFJS_BUNDLE from '@salesforce/resourceUrl/RTFJSBundleJS';
import createEmailShell from '@salesforce/apex/EmailMsgController.createEmailShell';
import uploadAttachment from '@salesforce/apex/EmailMsgController.uploadAttachment';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class MsgUploader extends LightningElement {
    isLoaded = false;
    @api recordId;
    // UI State
    @track isLoading = false;
    @track progress = 0;
    @track statusText = 'Waiting for file...';
    @track successMessage = '';
    @track errorMessage = '';
    
async renderedCallback() {
  if (this.isLoaded) return;

  try {
    await Promise.all([
      loadScript(this, MSG_READER),
      loadScript(this, RTFJS_BUNDLE),
      loadScript(this, RTF_DECOMPRESSOR),
      loadScript(this, RTF_TOOLS)
    ]);

    this.isLoaded = true;

    // sanity checks (optional)
    console.error('MsgReader global:', window.MsgReader || window.MsgReaderLib || window.MsgReader?.default);
    console.error('DeCompressRTF global:', window.DeCompressRTF);
    console.error('RTFJS global:', window.RTFJS);

  } catch (e) {
    console.error(e);
    this.showToast('Error', 'Could not load required libraries', 'error');
  }
}


    handleFileChange(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.resetState();
        this.isLoading = true;
        this.statusText = 'Reading file...';
        this.progress = 5;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.processMsgFile(e.target.result);
            } catch (error) {
                this.handleError(error);
            }
        };
        reader.readAsArrayBuffer(file);
    }

async processMsgFile(buffer) {
        try {
            this.progress = 15;
            this.statusText = 'Parsing .msg structure...';
            
            // @ts-ignore
            const msgReader = new MsgReader(buffer);
            const fileData = msgReader.getFileData();

            if (!fileData) throw new Error('Could not parse .msg file.');

            // 🌟 JS DEBUG: Log the RAW parsed data from the library
            console.log('--- RAW PARSED FILE DATA ---');
            console.log(JSON.parse(JSON.stringify(fileData)));
            let htmlArrayAsString = new TextDecoder("utf-8").decode(fileData.html);
            console.log(htmlArrayAsString);
            console.log('------------------------------');

            let rtfAsHtml;
            if (fileData.compressedRtf) {
                const rtfBytes = this.decompressCompressedRtf(fileData.compressedRtf);
                const rtf = this.rtfBytesToString(rtfBytes);
                // console.log('RTF starts with:', rtf?.slice(0, 20)); // should include "{\rtf"
                // console.error(rtf);
                console.error('rtf');
                console.error(rtf);
                if (rtf) {
                    console.error('converting rtf to html');
                    rtfAsHtml = await this.rtfToHtml(rtf);
                    console.error(rtfAsHtml);
                // const { mode, content } = this.deEncapsulateFromRtf(rtf);

                //     if (mode === 'html') {
                //         // console.log('De-encapsulated HTML length:', content.length);
                //         // Use this as your HtmlBody / EmailMessage.HtmlBody, etc.
                //         // e.g. emailWrapper.htmlBody = content;
                //     } else {
                //         // console.log('De-encapsulated TEXT length:', content.length);
                //         // e.g. emailWrapper.textBody = content;
                //     }
                //     console.error('mode: ' + mode);
                //     console.error('content below');
                //     console.error(content);
                }
            }

            // 1. Prepare Email Metadata
            const emailWrapper = {
                subject: fileData.subject || '(No Subject)',
                senderName: fileData.senderName || '',
                senderEmail: fileData.senderSmtpAddress || '',
                toRecipients: this.formatRecipients(fileData.recipients),
                textBody: fileData.body || '',
                htmlBody: htmlArrayAsString || rtfAsHtml || ''
            };
            
            // 🌟 JS DEBUG: Log the data prepared for Apex shell creation
            console.log('--- EMAIL SHELL DATA SENDING TO APEX ---');
            console.log(emailWrapper);
            console.log('------------------------------------------');

            // 2. Upload Shell
            this.progress = 30;
            this.statusText = 'Creating Email Record...';
            const emailId = await createEmailShell({ emailData: emailWrapper, parentId: this.recordId });
            
            console.log(`Email Shell ID received: ${emailId}`);

            // 3. Handle Attachments
            if (fileData.attachments && fileData.attachments.length > 0) {
                await this.uploadAttachmentsSequentially(msgReader, fileData.attachments, emailId);
            }

            // ... (finish logic remains the same)

        } catch (error) {
            this.handleError(error);
        } finally {
            this.isLoading = false;
        }
    }

         decompressCompressedRtf(compressedRtf) {
        if (!window.DeCompressRTF?.decompressRTF) {
            throw new Error('DeCompressRTF not loaded. Expected window.DeCompressRTF.decompressRTF');
        }

        const input = this.toUint8Array(compressedRtf);
        if (!input || input.length === 0) return null;

        // DeCompressRTF API: decompressRTF(inputArray) -> outputArray (bytes) [3](https://codesandbox.io/examples/package/rtf-stream-parser)[4](https://stackoverflow.com/questions/79185295/rtf-stream-parser-npm-super-expression-must-either-be-null-or-a-function-error)
        const output = window.DeCompressRTF.decompressRTF(input);

        // Output might be number[] or Uint8Array depending on the bundle;
        // normalize again so downstream code is consistent:
        return this.toUint8Array(output);
    }


    rtfBytesToString(rtfBytes) {
    if (!rtfBytes) return null;
    return new TextDecoder('ascii').decode(rtfBytes);
    }


    
toUint8Array(maybeBytes) {
  if (!maybeBytes) return null;

  if (maybeBytes instanceof Uint8Array) return maybeBytes;
  if (maybeBytes instanceof ArrayBuffer) return new Uint8Array(maybeBytes);
  if (Array.isArray(maybeBytes)) return new Uint8Array(maybeBytes);

  // Browserify Buffer is a Uint8Array subclass; this catches those too
  if (maybeBytes?.buffer && maybeBytes?.byteLength != null) {
    return new Uint8Array(maybeBytes.buffer, maybeBytes.byteOffset || 0, maybeBytes.byteLength);
  }

  throw new Error(`Unsupported byte container: ${Object.prototype.toString.call(maybeBytes)}`);
}


/**
 * De-encapsulates HTML or text from a decompressed RTF string.
 * Requires Browserified rtf-stream-parser loaded as window.RtfStreamParser.
 *
 * Returns:
 *   { mode: 'html'|'text', content: string }
 */
deEncapsulateFromRtf(rtfString) {
  if (!window.RtfStreamParser?.deEncapsulateSync) {
    throw new Error('rtf-stream-parser not loaded. Expected window.RtfStreamParser.deEncapsulateSync');
  }

  // rtf-stream-parser expects a decode(buf, enc) callback because RTF often uses ANSI codepages. [2](https://www.npmjs.com/package/browserify?activeTab=versions)
  const decode = (buf, enc) => this.decodeWithTextDecoder(buf, enc);

  // Try HTML first; if message is encapsulated as plain text, fall back to text.
  try {
    const result = window.RtfStreamParser.deEncapsulateSync(rtfString, {
      decode,
      mode: 'html'
    });
    // result: { mode: "html", text: "<html>..." } [2](https://www.npmjs.com/package/browserify?activeTab=versions)
    return { mode: result.mode, content: result.text };
  } catch (eHtml) {
    const result = window.RtfStreamParser.deEncapsulateSync(rtfString, {
      decode,
      mode: 'text'
    });
    // result: { mode: "text", text: "..." } [2](https://www.npmjs.com/package/browserify?activeTab=versions)
    return { mode: result.mode, content: result.text };
  }
}


/**
   * Convert an RTF string (decompressed) to an HTML string using rtf.js
   * Returns HTML markup you can store in EmailMessage.HtmlBody or similar.
   */
  async rtfToHtml(rtfString) {
    if (!window.RTFJS) {
      throw new Error('RTFJS not loaded yet. Ensure renderedCallback has completed.');
    }

    // rtf.js Getting Started converts string -> ArrayBuffer of bytes [1](https://github.com/HiraokaHyperTools/DeCompressRTF)
    const rtfBuffer = this.stringToArrayBuffer(rtfString);

    const doc = new window.RTFJS.Document(rtfBuffer);

    // Render returns an array of HTML elements (per Getting Started) [1](https://github.com/HiraokaHyperTools/DeCompressRTF)
    const htmlElements = await doc.render();

    // Convert elements to a single HTML string
    const container = document.createElement('div');
    htmlElements.forEach(el => container.appendChild(el));

    return container.innerHTML;
  }

  /**
   * Matches rtf.js guide approach: encode each JS char as a byte in ArrayBuffer. [1](https://github.com/HiraokaHyperTools/DeCompressRTF)
   * Works well for typical decompressed RTF (mostly ASCII / ANSI control words).
   */
  stringToArrayBuffer(str) {
    const buffer = new ArrayBuffer(str.length);
    const view = new Uint8Array(buffer);
    for (let i = 0; i < str.length; i++) {
      view[i] = str.charCodeAt(i) & 0xff;
    }
    return buffer;
  }

normalizeRtfEncoding(enc) {
  if (!enc) return 'windows-1252';

  const e = String(enc).toLowerCase().trim();

  // rtf-stream-parser commonly passes enc like "cp1252". [2](https://www.npmjs.com/package/browserify?activeTab=versions)
  if (e.startsWith('cp')) return `windows-${e.slice(2)}`;
  if (e === 'ansi') return 'windows-1252';

  // already an IANA encoding name
  return e;
}

decodeWithTextDecoder(buf, enc) {
  const iana = this.normalizeRtfEncoding(enc);

  // Browserify Buffer is a Uint8Array subclass, so this is safe:
  const u8 = buf instanceof Uint8Array ? buf : new Uint8Array(buf);

  try {
    return new TextDecoder(iana).decode(u8);
  } catch (err) {
    // Fallback (common Outlook default)
    return new TextDecoder('windows-1252').decode(u8);
  }
}

    
   
    
    async uploadAttachmentsSequentially(msgReader, attachments, emailId) {
        const total = attachments.length;
        
        // Loop sequentially (not parallel) to conserve Heap
        for (let i = 0; i < total; i++) {
            const attData = attachments[i];
            const attObj = msgReader.getAttachment(i);
            
            // Update UI
            const currentNum = i + 1;
            this.progress = 30 + Math.floor((currentNum / total) * 60); // Scale progress 30-90%
            this.statusText = `Uploading attachment ${currentNum} of ${total}: ${attData.fileName || 'Untitled'}`;

            if (attObj && attObj.content) {
                const base64 = this.arrayBufferToBase64(attObj.content);
                
                // Call Apex for this specific file
                await uploadAttachment({
                    linkedEntityId: emailId,
                    fileName: attData.fileName || `attachment_${i}`,
                    base64Content: base64
                });
            }
        }
    }

    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        const len = bytes.byteLength;
        for (let i = 0; i < len; i++) {
            binary += String.fromCharCode(bytes[i]);
        }
        return window.btoa(binary);
    }

    formatRecipients(recipients) {
        if (!recipients || !Array.isArray(recipients)) return '';
        return recipients.map(r => r.smtpAddress).join('; ');
    }

    resetState() {
        this.progress = 0;
        this.errorMessage = '';
        this.successMessage = '';
        this.statusText = '';
    }

    handleError(error) {
        console.error(error);
        this.isLoading = false;
        this.statusText = 'Error';
        this.errorMessage = error.body ? error.body.message : error.message;
        this.showToast('Error', this.errorMessage, 'error');
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}

COPILTE EXAMPLE


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
