
import { LightningElement, api } from 'lwc';
import { loadScript } from 'lightning/platformResourceLoader';
import MSGREADER from '@salesforce/resourceUrl/msgreader_umd';
import RTF_UMD from '@salesforce/resourceUrl/rtf_parser_umd';
import EmailIntakeModal from 'c/emailIntakeModal';

export default class OppEmailDrop extends LightningElement {
  @api recordId; // Opportunity Id
  libsLoaded = false;

  renderedCallback() {
    if (this.libsLoaded) return;
    Promise.all([loadScript(this, MSGREADER), loadScript(this, RTF_UMD)])
      .then(() => { this.libsLoaded = true; });
  }

  openFilePicker = () => this.template.refs.fileInput.click();
  handleDragOver(e) { e.preventDefault(); }
  handleDrop(e) {
    e.preventDefault();
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length) this.processFiles(files);
  }
  handleFilePicked(e) {
    const files = Array.from(e.target.files || []);
    this.processFiles(files);
    e.target.value = '';
  }

  async processFiles(files) {
    const msgFiles = files.filter(f => /\.msg$/i.test(f.name));
    const extraFiles = files.filter(f => !/\.msg$/i.test(f.name));
    let parsedEmail = null;
    let originalMsg = null;

    if (msgFiles.length) {
      const msgFile = msgFiles[0];
      const buf = new Uint8Array(await msgFile.arrayBuffer());
      const reader = new window.MsgReader(buf);
      const info = reader.getFileData();

      const attachments = [];
      if (info.attachments?.length) {
        for (const meta of info.attachments) {
          const a = reader.getAttachment(meta);
          const isSmall = a.content && a.content.length <= 4 * 1024 * 1024;
          attachments.push({
            fileName: a.fileName,
            size: a.content?.length || 0,
            small: isSmall,
            base64: isSmall ? btoa(String.fromCharCode(...a.content)) : null
          });
        }
      }

      let html = info.bodyHTML || '';
      if (!html && info.bodyRtf) {
        html = window.RtfStreamParser.deEncapsulateHtmlString(info.bodyRtf);
      }
      if (!html && info.body) html = `<pre>${info.body}</pre>`;

      parsedEmail = {
        subject: info.subject || '',
        from: info.senderEmail || info.senderName || '',
        to: (info.recipients || []).map(r => r.name).join('; '),
        cc: '',
        sentOn: info.sentOn || null,
        html,
        attachments
      };

      if (buf.length <= 4 * 1024 * 1024) {
        originalMsg = { fileName: msgFile.name, base64: btoa(String.fromCharCode(...buf)) };
      } else {
        originalMsg = { fileName: msgFile.name, base64: null };
        extraFiles.unshift(msgFile);
      }
    }

    await EmailIntakeModal.open({
      size: 'large',
      description: 'Create Case from Email',
      content: { 
        opportunityId: this.recordId,
        parsedEmail,
        extraFiles,
        originalMsg
      }
    });
  }
}
