import { LightningElement, api, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import msgReaderLib from '@salesforce/resourceUrl/msgreader_lib_17_11_25';
import forwardParsedEmail from '@salesforce/apex/XLP_POC_EmailForwardController.forwardParsedEmail';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
 
export default class xLP_POC_EmailDropForwarder extends LightningElement {
    @api recordId; // Opportunity Id
    @track loading = false;
    msgLibLoaded = false;
 
    connectedCallback() {
        if (!this.msgLibLoaded) {
            Promise.all([
                loadScript(this, msgReaderLib + '/msgreader_lib_17_11_25/DataStream.js'),
                loadScript(this, msgReaderLib + '/msgreader_lib_17_11_25/multipart.form.js'),
                loadScript(this, msgReaderLib + '/msgreader_lib_17_11_25/msg.reader.js')
            ])
            .then(() => {
                console.log('MSG Reader libraries loaded.');
                this.msgLibLoaded = true;
            })
            .catch(err => {
                console.error('ERROR loading static resource', err);
            });
        }
    }
 
    handleDragOver(event) {
        event.preventDefault();
    }
 
    async handleDrop(event) {
        event.preventDefault();
        this.loading = true;
 
        try {
            const file = event.dataTransfer.files[0];
            const arrayBuffer = await file.arrayBuffer();
 
            console.log('Processing .msg size:', arrayBuffer.byteLength);
 
            // Create reader
            const reader = new MSGReader(arrayBuffer);
            const msgData = reader.getFileData();
 
            // Extract body (HTML preferred)
            const body =
                //msgData.bodyHTML ||
                msgData.body ||
                '(No body)';
 
            // Extract attachments
            const attachments = [];
 
            if (msgData.attachments && msgData.attachments.length > 0) {
                for (let attMeta of msgData.attachments) {
                    const fileData = reader.getAttachment(attMeta);  // <--- real binary
 
                    if (fileData && fileData.content) {
                        // Convert Uint8Array → Base64
                        const uint8 = fileData.content;
                        let binary = '';
                        uint8.forEach(byte => binary += String.fromCharCode(byte));
                        const base64Data = btoa(binary);
 
                        attachments.push({
                            fileName: fileData.fileName,
                            base64: base64Data
                        });
 
                        console.log('Attachment processed:', fileData.fileName);
                    }
                }
            }
 
            console.log('Final attachments JSON:', attachments);
 
            // Send to Apex
            await forwardParsedEmail({
                oppId: this.recordId,
                subject: msgData.subject || '(No Subject)',
                body: body,
                attachmentsJson: JSON.stringify(attachments)
            });
 
            console.log('Email forwarded successfully.');
 
        } catch (err) {
            console.error('Error processing dropped file:', err);
        } finally {
            this.loading = false;
        }
    }
}


