import { LightningElement, api, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import msgReaderLib from '@salesforce/resourceUrl/msgreader_lib_17_11_25';
import forwardParsedEmail from '@salesforce/apex/XLP_POC_EmailForwardController.forwardParsedEmail';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class xLP_POC_EmailDropForwarder extends LightningElement {
    @api recordId; 
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

                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Error loading email parser',
                        message: err.message,
                        variant: 'error'
                    })
                );
            });
        }
    }

    handleDragEnter() {
        this.template.querySelector('.drop-zone').classList.add('drag-over');
    }

    handleDragLeave() {
        this.template.querySelector('.drop-zone').classList.remove('drag-over');
    }

    handleDragOver(event) {
        event.preventDefault();
    }

    async handleDrop(event) {
        event.preventDefault();
        this.template.querySelector('.drop-zone').classList.remove('drag-over');
        this.loading = true;

        try {
            const file = event.dataTransfer.files[0];

            // (Optional) Reject non-.msg files
            if (!file.name.toLowerCase().endsWith('.msg')) {
                this.loading = false;
                this.dispatchEvent(
                    new ShowToastEvent({
                        title: 'Invalid File',
                        message: 'Please drop a valid .msg email file.',
                        variant: 'warning'
                    })
                );
                return;
            }

            const arrayBuffer = await file.arrayBuffer();

            const reader = new MSGReader(arrayBuffer);
            const msgData = reader.getFileData();

            const body =
                msgData.body ||
                '(No body)';

            const attachments = [];

            if (msgData.attachments && msgData.attachments.length > 0) {
                for (let attMeta of msgData.attachments) {
                    const fileData = reader.getAttachment(attMeta);

                    if (fileData && fileData.content) {
                        const uint8 = fileData.content;
                        let binary = '';
                        uint8.forEach(b => (binary += String.fromCharCode(b)));
                        const base64Data = btoa(binary);

                        attachments.push({
                            fileName: fileData.fileName,
                            base64: base64Data
                        });
                    }
                }
            }

            // Apex call (unchanged)
            await forwardParsedEmail({
                oppId: this.recordId,
                subject: msgData.subject || '(No Subject)',
                body: body,
                attachmentsJson: JSON.stringify(attachments)
            });

            // ⭐ SUCCESS TOAST ⭐
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Email Processed',
                    message: `${file.name} was successfully parsed and forwarded.`,
                    variant: 'success'
                })
            );

        } catch (err) {
            console.error('Error processing dropped file:', err);

            // ⭐ ERROR TOAST ⭐
            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Error Processing Email',
                    message: err.message,
                    variant: 'error'
                })
            );

        } finally {
            this.loading = false;
        }
    }
}
