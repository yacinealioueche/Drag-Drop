
import LightningModal from 'lightning/modal';
import { api, track, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';

import INCEPTION from '@salesforce/schema/Opportunity.Inception_Date__c';
import PRODUCT from '@salesforce/schema/Opportunity.Global_Product__c';

import createCaseEmailAndAttachments from '@salesforce/apex/EmailMsgControllerV2.createCaseEmailAndAttachments';

export default class MsgCaseModal extends LightningModal {

    @api recordId;
    @api parsedEmail;
    @api parsedAttachments;
    @api originalMsgBase64;

    @track newFiles = [];

    // Case fields
    caseSubject = '';
    casePriority = 'Medium';
    caseDescription = '';

    @wire(getRecord, { recordId: '$recordId', fields: [INCEPTION, PRODUCT] })
    opportunity;

    get inceptionDate() {
        return getFieldValue(this.opportunity.data, INCEPTION);
    }

    get globalProduct() {
        return getFieldValue(this.opportunity.data, PRODUCT);
    }

    get priorityOptions() {
        return [
            { label: 'High', value: 'High' },
            { label: 'Medium', value: 'Medium' },
            { label: 'Low', value: 'Low' }
        ];
    }

    handleInput(e) {
        this[e.target.dataset.field] = e.target.value;
    }

    handleUploads(e) {
        this.newFiles = e.detail.files.map(f => f.documentId);
    }

    async createSubmission() {
        await createCaseEmailAndAttachments({
            oppId: this.recordId,
            caseSubject: this.caseSubject || this.parsedEmail.subject,
            casePriority: this.casePriority,
            caseDescription: this.caseDescription || this.parsedEmail.textBody,
            emailData: this.parsedEmail,
            originalMsgBase64: this.originalMsgBase64,
            parsedAttachments: this.parsedAttachments,
            newFileDocumentIds: this.newFiles
        });

        this.close('success');
    }

    closeModal() {
        this.close('cancel');
    }
}
