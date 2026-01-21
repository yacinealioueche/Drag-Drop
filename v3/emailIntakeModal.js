
import { api, track } from 'lwc';
import LightningModal from 'lightning/modal';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import createCaseAndEmail from '@salesforce/apex/EmailIngestController.createCaseAndEmail';

const MAX_INLINE_BYTES = 4 * 1024 * 1024;

export default class EmailIntakeModal extends LightningModal {
  @api content;
  @track form = { inceptionDate: null, globalProduct: null, subject: '', description: '' };
  @track inlineSmallAttachments = [];
  @track extraUploads = [];
  originalMsg = null;

  connectedCallback() {
    const { parsedEmail, originalMsg } = this.content || {};
    if (parsedEmail) {
      this.form.subject = parsedEmail.subject || '';
      this.form.description = 'Email imported from Outlook.';
      this.inlineSmallAttachments = (parsedEmail.attachments || []).filter(a => a.small);
    }
    if (originalMsg) this.originalMsg = originalMsg;
  }

  async handleAddFiles(e) {
    const files = Array.from(e.target.files || []);
    for (const f of files) {
      const ab = await f.arrayBuffer();
      if (ab.byteLength > MAX_INLINE_BYTES) {
        this.dispatchEvent(new ShowToastEvent({
          title: 'File too large',
          message: `${f.name} exceeds 4 MB; please split or add via a large-file path in a future version.`,
          variant: 'warning'
        }));
        continue;
      }
      const base64 = btoa(String.fromCharCode(...new Uint8Array(ab)));
      this.extraUploads.push({ fileName: f.name, base64, size: ab.byteLength });
    }
    e.target.value = '';
  }

  async handleCreateCase() {
    try {
      const payload = {
        opportunityId: this.content.opportunityId,
        caseFields: {
          Subject__c: this.form.subject,
          Inception_Date__c: this.form.inceptionDate,
          Global_Product__c: this.form.globalProduct
        },
        email: {
          subject: this.form.subject,
          fromAddress: this.content.parsedEmail?.from || null,
          toAddress: this.content.parsedEmail?.to || null,
          ccAddress: this.content.parsedEmail?.cc || null,
          messageDate: this.content.parsedEmail?.sentOn || null,
          htmlBody: this.content.parsedEmail?.html || ''
        },
        originalMsg: (this.originalMsg?.base64 ? {
          fileName: this.originalMsg.fileName, base64: this.originalMsg.base64
        } : null),
        inlineAttachments: this.inlineSmallAttachments.map(a => ({
          fileName: a.fileName, base64: a.base64
        })),
        addedAttachments: this.extraUploads
      };

      const res = await createCaseAndEmail({ requestJson: JSON.stringify(payload) });

      this.dispatchEvent(new ShowToastEvent({
        title: 'Case created',
        message: `Case ${res.caseNumber} created; email + ${res.filesLinked} file(s) attached.`,
        variant: 'success'
      }));
      this.close({ ok: true, caseId: res.caseId });
    } catch (e) {
      this.dispatchEvent(new ShowToastEvent({
        title:'Error',
        message: e.body?.message || e.message,
        variant:'error'
      }));
    }
  }

  handleCancel() { this.close({ ok:false }); }
}
