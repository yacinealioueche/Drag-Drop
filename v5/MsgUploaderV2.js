import { LightningElement, api, track } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import MSG_READER from '@salesforce/resourceUrl/MsgReaderLib';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

export default class MsgUploaderV2 extends LightningElement {
    @api recordId; // Opportunity Id

    isLoaded = false;
    isLoading = false;
    progress = 0;
    statusText = '';
    errorMessage = '';

    renderedCallback() {
        if (this.isLoaded) return;
        loadScript(this, MSG_READER)
            .then(() => { this.isLoaded = true; })
            .catch(() => this.showToast('Error', 'Failed to load MSG Reader', 'error'));
    }

    handleFileChange(event) {
        const file = event.target.files[0];
        if (!file) return;

        this.isLoading = true;
        this.statusText = 'Reading email...';
        this.progress = 10;

        const reader = new FileReader();
        reader.onload = (e) => {
            try {
                this.processMsgFile(e.target.result, file);
            } catch (err) {
                this.handleError(err);
            }
        };
        reader.readAsArrayBuffer(file);
    }

    async processMsgFile(buffer, file) {
        this.progress = 30;
        this.statusText = 'Parsing email...';

        // @ts-ignore
        const msgReader = new MsgReader(buffer);
        const fileData = msgReader.getFileData();

        if (!fileData) throw new Error('Unable to parse .msg email');

        const htmlBody = fileData.html ? new TextDecoder("utf-8").decode(fileData.html) : '';
        
        const parsedEmail = {
            subject: fileData.subject || '(No Subject)',
            senderName: fileData.senderName || '',
            senderEmail: fileData.senderSmtpAddress || '',
            toRecipients: fileData.recipients?.map(r => r.smtpAddress).join('; ') || '',
            textBody: fileData.body || '',
            htmlBody: htmlBody || ''
        };

        const originalBase64 = this.arrayBufferToBase64(buffer);

        this.launchCaseModal({
            parsedEmail,
            parsedAttachments: fileData.attachments,
            originalBase64
        });

        this.isLoading = false;
    }

    launchCaseModal(data) {
        const modal = document.createElement('c-msg-case-modal');

        modal.recordId = this.recordId;
        modal.parsedEmail = data.parsedEmail;
        modal.parsedAttachments = data.parsedAttachments;
        modal.originalMsgBase64 = data.originalBase64;

        modal.addEventListener('close', () => modal.remove());
        modal.addEventListener('success', () => {
            modal.remove();
            this.showToast('Success', 'Case created successfully', 'success');
        });

        document.body.appendChild(modal);
    }

    arrayBufferToBase64(buffer) {
        let binary = '';
        const bytes = new Uint8Array(buffer);
        bytes.forEach(b => binary += String.fromCharCode(b));
        return window.btoa(binary);
    }

    handleError(error) {
        this.errorMessage = error.message || 'Unknown parsing error';
        this.showToast('Error', this.errorMessage, 'error');
        this.isLoading = false;
    }

    showToast(title, msg, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message: msg, variant }));
    }
}
