
import { LightningElement, api } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import MSGREADER from '@salesforce/resourceUrl/msgreader_min'; // your static resource name

import CreateCaseFromEmailModal from 'c/createCaseFromEmailModal';

export default class OppEmailDropZone extends LightningElement {
  @api recordId; // Opportunity Id

  msgLibLoaded = false;

  connectedCallback() {
    // Load msg reader once (if using MSG)
    if (!this.msgLibLoaded) {
      loadScript(this, MSGREADER)
        .then(() => { this.msgLibLoaded = true; })
        .catch(err => {
          // In production, surface toast
          // console.error('Failed to load parser:', err);
        });
    }
  }

  handleDragOver(evt) {
    evt.preventDefault();
    evt.dataTransfer.dropEffect = 'copy';
  }

  async handleDrop(evt) {
    evt.preventDefault();
    const files = evt.dataTransfer?.files || [];
    if (!files.length) return;
    await this.processFile(files[0]);
  }

  handleFileInput(evt) {
    const f = evt.target.files?.[0];
    if (f) this.processFile(f);
  }

  async processFile(file) {
    const name = (file.name || '').toLowerCase();
    if (!name.endsWith('.msg') && !name.endsWith('.eml')) {
      // toast: unsupported
      return;
    }
    const buf = await file.arrayBuffer();

    // Parse MSG (client-side). For EML, either add a MIME parser
    // or pass raw to Apex; your POC already parses, so wire that here.
    let parsed = {};
    if (name.endsWith('.msg')) {
      // global MsgReader class available after loadScript
      // eslint-disable-next-line no-undef
      const reader = new MsgReader(buf);
      const info = reader.getFileData();
      parsed = {
        subject: info.subject || '',
        fromAddress: info.senderEmail || info.senderName || '',
        toAddress: (info.recipients || []).map(r => r.email || r.name).filter(Boolean).join('; '),
        ccAddress: '',
        messageDate: new Date().toISOString(), // MSG doesn’t always give sent date in all libs; map if available
        textBody: info.body || '',
        htmlBody: '', // set if your lib exposes HTML body
        // Attachments: get as needed (you can also pass raw and let Apex create ContentVersions)
        attachments: (info.attachments || []).map(att => ({ fileName: att.fileName }))
      };
    } else {
      // EML path: if you have a MIME parser on client, parse here.
      // Otherwise send raw to Apex and parse server-side (reuse your POC).
      parsed = {
        subject: '(parsed subject)',
        fromAddress: '',
        toAddress: '',
        ccAddress: '',
        messageDate: new Date().toISOString(),
        textBody: '(parsed text)',
        htmlBody: '',
        attachments: []
      };
    }

    // Store original email file for later upload (as base64) if you want to archive it
    const base64 = await this.arrayBufferToBase64(buf);
    parsed.original = { fileName: file.name, base64 };

    // Open the modal and pass the parsed payload + opp Id
    await CreateCaseFromEmailModal.open({
      size: 'large',
      description: 'Create case from email',
      // modal public properties:
      recordId: this.recordId,
      parsedEmail: parsed
    });
  }

  arrayBufferToBase64(buf) {
    return new Promise(resolve => {
      const blob = new Blob([buf]);
      const reader = new FileReader();
      reader.onload = () => {
        const dataUrl = reader.result; // data:*/*;base64,xxx
        resolve(String(dataUrl).split(',')[1] || '');
      };
      reader.readAsDataURL(blob);
    });
  }
}
