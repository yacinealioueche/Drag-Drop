
import { LightningElement, api } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import MSG_READER from '@salesforce/resourceUrl/MsgReaderLib';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import MsgCaseModal from 'c/msgCaseModal';

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
            .catch(e => this.showToast('Error', 'Failed to load MSG parser', 'error'));
    }

    handleFileChange(event) {
        const file = event.target.files?.[0];
        if (!file) return;

        this.isLoading = true;
        this.statusText = 'Reading email...';
        this.progress = 10;

        const reader = new FileReader();
        reader.onload = (e) => {
            this.processMsgFile(e.target.result);
        };
        reader.onerror = () => {
            this.showToast('Error', 'Failed to read file', 'error');
        };
        reader.readAsArrayBuffer(file);
    }

    async processMsgFile(arrayBuffer) {
        try {
            this.progress = 40;
            this.statusText = 'Parsing email...';

            // eslint-disable-next-line no-undef
            const msgReader = new MsgReader(new Uint8Array(arrayBuffer));
            const fileData = msgReader.getFileData();

            if (!fileData) throw new Error('Cannot parse the .msg file');

            const parsedEmail = {
                subject: fileData.subject || '(No subject)',
                senderEmail: fileData.senderSmtpAddress || '',
                toRecipients: fileData.recipients?.map(r => r.smtpAddress).join('; ') || '',
                textBody: fileData.body || '',
                htmlBody: fileData.html
                    ? new TextDecoder('utf-8').decode(fileData.html)
                    : ''
            };

            // Convert original .msg to base64 for audit file upload
            const originalBase64 = this.arrayBufferToBase64(arrayBuffer);

            // Convert attachments to base64
            const parsedAttachments = [];
            (fileData.attachments || []).forEach((att) => {
                try {
                    const attObj = msgReader.getAttachment(att);
                    if (attObj?.content) {
                        parsedAttachments.push({
                            fileName: attObj.fileName,
                            base64: this.uint8ToBase64(attObj.content)
                        });
                    }
                } catch (e) {}
            });

            this.openCaseModal(parsedEmail, parsedAttachments, originalBase64);

        } catch (error) {
            this.errorMessage = error.message;
            this.showToast('Error', error.message, 'error');
        } finally {
            this.isLoading = false;
        }
    }

    async openCaseModal(parsedEmail, parsedAttachments, originalBase64) {
        const result = await MsgCaseModal.open({
            size: 'large',
            recordId: this.recordId,
            parsedEmail: parsedEmail,
            parsedAttachments: parsedAttachments,
            originalMsgBase64: originalBase64
        });

        if (result === 'success') {
            this.showToast('Success', 'Case & Email created successfully!', 'success');
        }
    }

    uint8ToBase64(uint8) {
        let binary = '';
        uint8.forEach((b) => binary += String.fromCharCode(b));
        return window.btoa(binary);
    }

    arrayBufferToBase64(buffer) {
        return this.uint8ToBase64(new Uint8Array(buffer));
    }

    showToast(title, message, variant) {
        this.dispatchEvent(
            new ShowToastEvent({ title, message, variant })
        );
    }
}
