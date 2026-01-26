import { LightningElement, api, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import MSG_READER from '@salesforce/resourceUrl/MsgReaderLib';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import EmailReviewModalV3 from 'c/emailReviewModalV3';

export default class MsgUploaderV3 extends LightningElement {
    @api recordId; // Opportunity Id

    @track isLoading = false;
    @track progress = 0;
    @track statusText = 'Waiting for file...';
    @track errorMessage = '';
    isLibLoaded = false;

    renderedCallback() {
        if (this.isLibLoaded) return;
        loadScript(this, MSG_READER)
            .then(() => { this.isLibLoaded = true; })
            .catch(() => this.showToast('Error', 'Could not load MSG library', 'error'));
    }

    handleFileChange(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        this.errorMessage = '';
        this.isLoading = true;
        this.statusText = 'Reading file...';
        this.progress = 10;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.processMsg(e.target.result);
            } catch (err) {
                this.fail(err);
            }
        };
        reader.onerror = () => this.fail(new Error('File read failed.'));
        reader.readAsArrayBuffer(file);
    }

    async processMsg(arrayBuffer) {
        try {
            this.progress = 35;
            this.statusText = 'Parsing email...';

            // Use the same constructor you used (works in your org).
            // If needed you can switch to new Uint8Array(arrayBuffer).
            // eslint-disable-next-line no-undef
            let msgReader;
            try {
                msgReader = new MsgReader(arrayBuffer);
            } catch {
                msgReader = new MsgReader(new Uint8Array(arrayBuffer));
            }
            const fileData = msgReader.getFileData();
            if (!fileData) throw new Error('Could not parse .msg file.');

            // Build email wrapper (same structure you’re already using)
            let htmlBody = '';
            try {
                if (fileData.html) htmlBody = new TextDecoder('utf-8').decode(fileData.html);
            } catch {
                htmlBody = '';
            }

            const emailData = {
                subject: fileData.subject || '(No Subject)',
                senderName: fileData.senderName || '',
                senderEmail: fileData.senderSmtpAddress || '',
                toRecipients: (fileData.recipients || []).map(r => r.smtpAddress).join('; '),
                textBody: fileData.body || '',
                htmlBody: htmlBody || ''
            };

            // Extract attachments (name + base64)
            const parsedAttachments = [];
            const atts = fileData.attachments || [];
            for (let i = 0; i < atts.length; i++) {
                // Your original sample used index; keep that for compatibility
                const attObj = msgReader.getAttachment(i);
                if (attObj && attObj.content) {
                    parsedAttachments.push({
                        fileName: attObj.fileName || `attachment_${i}`,
                        base64: this.uint8ToBase64(attObj.content)
                    });
                }
            }

            // Original .msg as base64 for audit file
            const originalMsgBase64 = this.uint8ToBase64(new Uint8Array(arrayBuffer));

            this.progress = 60;
            this.statusText = 'Opening review...';

            // Open a Lightning Modal for review (simple + reliable)
            const result = await EmailReviewModalV3.open({
                size: 'large',
                recordId: this.recordId,
                emailData,
                attachments: parsedAttachments,
                originalMsgBase64
            });

            if (result === 'success') {
                this.showToast('Success', 'Case, Email, and Attachments created', 'success');
            }
        } catch (err) {
            this.fail(err);
        } finally {
            this.isLoading = false;
        }
    }

    uint8ToBase64(uint8) {
        let binary = '';
        for (let i = 0; i < uint8.length; i++) binary += String.fromCharCode(uint8[i]);
        return window.btoa(binary);
    }

    fail(err) {
        const msg = (err && (err.body?.message || err.message)) || 'Unknown error';
        this.errorMessage = msg;
        this.showToast('Error', msg, 'error');
        this.isLoading = false;
        this.statusText = 'Error';
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
