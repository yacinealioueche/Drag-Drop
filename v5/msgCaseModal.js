import { LightningElement, api, track } from 'lwc';
import getOpportunityFields from '@salesforce/apex/EmailMsgControllerV2.getOpportunityFields';
import createCaseEmailAndAttachments from '@salesforce/apex/EmailMsgControllerV2.createCaseEmailAndAttachments';

export default class MsgCaseModal extends LightningElement {
    @api recordId;
    @api parsedEmail;
    @api originalMsgBase64;
    @api parsedAttachments;

    @track inceptionDate;
    @track globalProduct;

    @track newFiles = [];

    caseSubject = '';
    casePriority = 'Medium';
    caseDescription = '';

    connectedCallback() {
        getOpportunityFields({ oppId: this.recordId })
            .then(res => {
                this.inceptionDate = res.Inception_Date__c;
                this.globalProduct = res.Global_Product__c;
            });
    }

    get priorityOptions() {
        return [
            { label: 'High', value: 'High' },
            { label: 'Medium', value: 'Medium' },
            { label: 'Low', value: 'Low' }
        ];
    }

    get emailSubject() { return this.parsedEmail.subject; }
    get emailFrom() { return this.parsedEmail.senderEmail; }
    get emailBodyPreview() { return this.parsedEmail.textBody; }

    handleUploads(evt) {
        this.newFiles = evt.detail.files.map(f => f.documentId);
    }

    handleInput(e) {
        this[e.target.dataset.field] = e.target.value;
    }

    closeModal() {
        this.dispatchEvent(new CustomEvent('close'));
    }

    async createCase() {
        await createCaseEmailAndAttachments({
            oppId: this.recordId,
            caseSubject: this.caseSubject,
            casePriority: this.casePriority,
            caseDescription: this.caseDescription,
            emailData: this.parsedEmail,
            originalMsgBase64: this.originalMsgBase64,
            parsedAttachments: this.parsedAttachments,
            newFileDocumentIds: this.newFiles
        });

        this.dispatchEvent(new CustomEvent('success'));
    }
}
