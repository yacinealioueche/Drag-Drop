import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';

const API_VERSION = 'v66.0';
const OAUTH_AUTHORIZE_URL = 'https://yourCompany.my.salesforce.com/services/oauth2/authorize';
const CLIENT_ID = 'YOUR_EXTERNAL_CLIENT_APP_CLIENT_ID';
const REDIRECT_URI = 'https://yourCompany.my.salesforce.com/apex/OAuthCallbackHandler';

export default class EmailAttachmentUploader extends LightningElement {
    @api recordId;

    @track isUploading = false;
    @track uploadResult;
    @track errorMessage;
    @track files = [];
    
    accessToken = null;
    instanceUrl = null;
    tokenExpiry = null;

    connectedCallback() {
        // Listen for OAuth callback messages
        window.addEventListener('message', this.handleOAuthMessage.bind(this));
    }

    disconnectedCallback() {
        window.removeEventListener('message', this.handleOAuthMessage.bind(this));
    }

    // ============================================================
    // DRAG AND DROP
    // ============================================================

    handleDragOver(event) {
        event.preventDefault();
        event.currentTarget.classList.add('drag-over');
    }

    handleDragLeave(event) {
        event.preventDefault();
        event.currentTarget.classList.remove('drag-over');
    }

    handleDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        event.currentTarget.classList.remove('drag-over');

        const items = event.dataTransfer.items;
        this.processItems(items);
    }

    async processItems(items) {
        for (let i = 0; i < items.length; i++) {
            const item = items[i];
            
            if (item.kind === 'file') {
                const file = item.getAsFile();
                await this.processFile(file);
            }
        }
    }

    async processFile(file) {
        // For POC: just read file as ArrayBuffer for upload
        const arrayBuffer = await file.arrayBuffer();
        
        this.files.push({
            name: file.name,
            type: file.type || 'application/octet-stream',
            size: file.size,
            data: arrayBuffer
        });

        this.showToast('File Added', `${file.name} (${this.formatSize(file.size)})`, 'info');
    }

    // ============================================================
    // OAUTH FLOW
    // ============================================================

    async handleUpload() {
        if (this.files.length === 0) {
            this.showToast('Error', 'No files to upload', 'error');
            return;
        }

        // Check if we have valid token
        if (!this.accessToken || this.isTokenExpired()) {
            this.startOAuthFlow();
            return;
        }

        // Upload files
        await this.uploadFiles();
    }

    startOAuthFlow() {
        const state = this.generateState();
        sessionStorage.setItem('oauth_state', state);

        const authUrl = `${OAUTH_AUTHORIZE_URL}?` +
            `response_type=code` +
            `&client_id=${encodeURIComponent(CLIENT_ID)}` +
            `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
            `&state=${encodeURIComponent(state)}` +
            `&scope=${encodeURIComponent('api refresh_token')}`;

        // Open popup
        const popup = window.open(
            authUrl,
            'oauthPopup',
            'width=600,height=700,scrollbars=yes'
        );

        if (!popup || popup.closed) {
            this.showToast('Error', 'Popup blocked. Please allow popups.', 'error');
        }
    }

    handleOAuthMessage(event) {
        // Verify origin
        if (!event.origin.includes('yourCompany.my.salesforce.com')) {
            return;
        }

        const data = event.data;

        if (data.type === 'OAUTH_TOKEN') {
            this.accessToken = data.accessToken;
            this.instanceUrl = data.instanceUrl;
            this.tokenExpiry = Date.now() + (data.expiresIn * 1000);
            
            this.showToast('Authenticated', 'OAuth token received', 'success');
            
            // Proceed with upload
            this.uploadFiles();
        } else if (data.type === 'OAUTH_ERROR') {
            this.errorMessage = `OAuth error: ${data.error} - ${data.errorDescription}`;
            this.showToast('OAuth Failed', this.errorMessage, 'error');
        }
    }

    generateState() {
        return 'state_' + Math.random().toString(36).substring(2, 15);
    }

    isTokenExpired() {
        return !this.tokenExpiry || Date.now() >= this.tokenExpiry;
    }

    // ============================================================
    // FILE UPLOAD
    // ============================================================

    async uploadFiles() {
        this.isUploading = true;
        this.errorMessage = null;

        try {
            for (const file of this.files) {
                await this.uploadFile(file);
            }
            
            this.showToast('Success', `Uploaded ${this.files.length} files`, 'success');
            this.files = []; // Clear after upload
        } catch (error) {
            this.errorMessage = error.message;
            this.showToast('Upload Failed', this.errorMessage, 'error');
        } finally {
            this.isUploading = false;
        }
    }

    async uploadFile(file) {
        const blob = new Blob([file.data], { type: file.type });
        
        const entityContent = {
            Title: file.name,
            PathOnClient: file.name,
            ContentLocation: 'S'
        };

        if (this.recordId) {
            entityContent.FirstPublishLocationId = this.recordId;
        }

        const boundary = '----sfboundary' + Date.now();
        const endpoint = `${this.instanceUrl}/services/data/${API_VERSION}/sobjects/ContentVersion`;

        const metadataPart =
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="entity_content"\r\n` +
            `Content-Type: application/json\r\n\r\n` +
            `${JSON.stringify(entityContent)}\r\n`;

        const fileHeaderPart =
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="VersionData"; filename="${this.escapeHeader(file.name)}"\r\n` +
            `Content-Type: ${file.type}\r\n\r\n`;

        const closingPart = `\r\n--${boundary}--`;

        const requestBody = new Blob([
            metadataPart,
            fileHeaderPart,
            blob,
            closingPart
        ], { type: `multipart/form-data; boundary=${boundary}` });

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${this.accessToken}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            body: requestBody
        });

        if (!response.ok) {
            const error = await response.text();
            throw new Error(`Upload failed: ${error}`);
        }

        return response.json();
    }

    escapeHeader(value) {
        return String(value).replace(/"/g, '\\"').replace(/[\r\n]/g, '');
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }
}
