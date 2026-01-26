import LightningModal from 'lightning/modal';
import { api, wire } from 'lwc';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';

import INCEPTION from '@salesforce/schema/Opportunity.Inception_Date__c';
import PRODUCT   from '@salesforce/schema/Opportunity.Global_Product__c';

import createCaseEmailAndAttachmentsV3 from '@salesforce/apex/EmailMsgControllerV3.createCaseEmailAndAttachmentsV3';

export default class EmailReviewModalV3 extends LightningModal {
    @api recordId;
    @api emailData;
    @api attachments;        // [{fileName, base64}]
    @api originalMsgBase64;  // base64 of original .msg

    @wire(getRecord, { recordId: '$recordId', fields: [INCEPTION, PRODUCT] })
    opp;

    get inceptionDate() { return getFieldValue(this.opp.data, INCEPTION) || ''; }
    get globalProduct() { return getFieldValue(this.opp.data, PRODUCT)   || ''; }

    get subject()      { return this.emailData?.subject      || ''; }
    get fromAddress()  { return this.emailData?.senderEmail  || ''; }
    get toAddress()    { return this.emailData?.toRecipients || ''; }
    get bodyPreview()  { return this.emailData?.textBody     || ''; }

    get hasAttachments() { return Array.isArray(this.attachments) && this.attachments.length > 0; }

    closeModal() {
        this.close('cancel');
    }

    async createCase() {
        await createCaseEmailAndAttachmentsV3({
            oppId: this.recordId,
            emailData: this.emailData,
            parsedAttachments: this.attachments || [],
            originalMsgBase64: this.originalMsgBase64
        });
        this.close('success');
    }
}
