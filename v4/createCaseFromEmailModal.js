import { api, wire } from 'lwc';
import LightningModal from 'lightning/modal';
import { getRecord, getFieldValue } from 'lightning/uiRecordApi';

import createCaseFromEmail from '@salesforce/apex/EmailToCaseController.createCaseFromEmail';

// Replace with your real API names
import OPPTY_NAME from '@salesforce/schema/Opportunity.Name';
import OPPTY_INCEPTION from '@salesforce/schema/Opportunity.Inception_Date__c';
import OPPTY_PRODUCT from '@salesforce/schema/Opportunity.Global_Product__c';

const FIELDS = [OPPTY_NAME, OPPTY_INCEPTION, OPPTY_PRODUCT];

export default class CreateCaseFromEmailModal extends LightningModal {
  @api recordId;     // Opportunity Id
  @api parsedEmail;  // from parent

  newFiles = [];     // ContentDocumentIds uploaded via lightning-file-upload

  subject = '';
  origin = 'Email';
  priority = 'Medium';
  description = '';

  get originOptions() {
    return [
      { label: 'Email', value: 'Email' },
      { label: 'Phone', value: 'Phone' },
      { label: 'Web', value: 'Web' }
    ];
  }
  get priorityOptions() {
    return [
      { label: 'High', value: 'High' },
      { label: 'Medium', value: 'Medium' },
      { label: 'Low', value: 'Low' }
    ];
  }

  @wire(getRecord, { recordId: '$recordId', fields: FIELDS })
  oppty;

  get opptyName() { return getFieldValue(this.oppty.data, OPPTY_NAME); }
  get inceptionDate() { return getFieldValue(this.oppty.data, OPPTY_INCEPTION); }
  get globalProduct() { return getFieldValue(this.oppty.data, OPPTY_PRODUCT); }

  get emailHeader() {
    const p = this.parsedEmail || {};
    return `From: ${p.fromAddress || ''}\nTo: ${p.toAddress || ''}\nCC: ${p.ccAddress || ''}\nDate: ${p.messageDate || ''}`;
  }
  get emailText() {
    return (this.parsedEmail?.textBody || '').substring(0, 32000);
  }

  connectedCallback() {
    if (this.parsedEmail?.subject) this.subject = this.parsedEmail.subject;
    this.description = this.emailText;
  }

  handleInput(e) {
    const { label, value } = e.target;
    if (label === 'Case Subject') this.subject = value;
    if (label === 'Origin') this.origin = value;
    if (label === 'Priority') this.priority = value;
    if (label === 'Description') this.description = value;
  }

  handleUploadFinished(evt) {
    const uploaded = evt.detail.files || [];
    // Keep ContentDocumentIds; we'll link them to Case & EmailMessage on submit
    this.newFiles = uploaded.map(x => x.documentId);
  }

  closeModal() {
    this.close(); // from LightningModal
  }

  async createCase() {
    try {
      const res = await createCaseFromEmail({
        opportunityId: this.recordId,
        caseFields: {
          Subject: this.subject,
          Origin: this.origin,
          Priority: this.priority,
          Description: this.description
        },
        email: {
          subject: this.parsedEmail?.subject,
          fromAddress: this.parsedEmail?.fromAddress,
          toAddress: this.parsedEmail?.toAddress,
          ccAddress: this.parsedEmail?.ccAddress,
          messageDate: this.parsedEmail?.messageDate,
          htmlBody: this.parsedEmail?.htmlBody,
          textBody: this.parsedEmail?.textBody
        },
        originalEmailFile: this.parsedEmail?.original, // { fileName, base64 } optional
        extraDocumentIds: this.newFiles
      });
      // Optionally toast with res.caseId / res.emailMessageId
      this.close(res);
    } catch (e) {
      // Surface toast in real implementation
      // console.error(e);
    }
  }
}
