/**
 * @description File Uploader v2 using Named Credentials
 *              Named Credential: Salesforce_Upload_API
 */
import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import uploadFile from '@salesforce/apex/FileUploadServiceV2_NamedCredential.uploadFile';
import getUploadConfig from '@salesforce/apex/FileUploadServiceV2_NamedCredential.getUploadConfig';

const API_VERSION = 'v66.0';

export default class FileUploaderV2_NamedCredential extends LightningElement {
    @api recordId;

    // Form inputs
    @track title = 'Generated File';
    @track fileName = 'generated.txt';
    @track mimeType = 'text/plain';
    @track fileBody = 'Hello from LWC.\nThis file was generated entirely in JavaScript.';
    
    // State
    @track isUploading = false;
    @track uploadResult;
    @track errorMessage;
    @track uploadConfig = {};
    @track fileSize = 0;
    @track isDragOver = false;
    @track showConfig = false;

    connectedCallback() {
        this.loadConfig();
        this.updateFileSize();
    }

    // ============================================================
    // CONFIGURATION
    // ============================================================

    async loadConfig() {
        try {
            this.uploadConfig = await getUploadConfig();
            console.log('Named Credential Upload Config:', JSON.stringify(this.uploadConfig));
        } catch (error) {
            console.error('Failed to load upload config:', error);
            this.showToast('Warning', 'Could not verify Named Credential configuration', 'warning');
        }
    }

    toggleConfig() {
        this.showConfig = !this.showConfig;
    }

    // ============================================================
    // INPUT HANDLERS
    // ============================================================

    handleTitleChange(event) {
        this.title = event.target.value;
    }

    handleFileNameChange(event) {
        this.fileName = event.target.value;
    }

    handleMimeTypeChange(event) {
        this.mimeType = event.target.value;
    }

    handleFileBodyChange(event) {
        this.fileBody = event.target.value;
        this.updateFileSize();
    }

    updateFileSize() {
        const blob = new Blob([this.fileBody], { type: this.mimeType });
        this.fileSize = blob.size;
    }

    // ============================================================
    // DRAG AND DROP
    // ============================================================

    handleDragOver(event) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragOver = true;
    }

    handleDragLeave(event) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragOver = false;
    }

    handleDrop(event) {
        event.preventDefault();
        event.stopPropagation();
        this.isDragOver = false;

        const files = event.dataTransfer.files;
        if (files.length > 0) {
            this.processDroppedFile(files[0]);
        }
    }

    handleFileSelect(event) {
        const files = event.target.files;
        if (files.length > 0) {
            this.processDroppedFile(files[0]);
        }
    }

    async processDroppedFile(file) {
        this.fileName = file.name;
        this.mimeType = file.type || 'application/octet-stream';
        this.title = file.name;
        this.fileSize = file.size;

        try {
            // Read file as base64
            const base64 = await this.readFileAsBase64(file);
            this.fileBody = base64; // Store base64 for display/reference
            
            this.showToast(
                'File Loaded', 
                `${file.name} (${this.formatSize(file.size)}) ready for upload via Named Credential`, 
                'info'
            );
        } catch (error) {
            this.errorMessage = 'Failed to read file: ' + error.message;
            this.showToast('Error', this.errorMessage, 'error');
        }
    }

    readFileAsBase64(file) {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => {
                const base64 = reader.result.split(',')[1]; // Remove data: prefix
                resolve(base64);
            };
            reader.onerror = reject;
            reader.readAsDataURL(file);
        });
    }

    // ============================================================
    // UPLOAD
    // ============================================================

    async handleUpload() {
        this.isUploading = true;
        this.errorMessage = null;
        this.uploadResult = null;

        try {
            this.validateInputs();

            // Convert content to base64 if not already
            let base64Content;
            if (this.isBase64(this.fileBody)) {
                base64Content = this.fileBody;
            } else {
                base64Content = btoa(this.fileBody);
            }

            // Call Apex with Named Credential
            const result = await uploadFile({
                title: this.title,
                fileName: this.fileName,
                mimeType: this.mimeType,
                base64Content: base64Content,
                recordId: this.recordId || null
            });

            this.handleUploadResult(result);

        } catch (error) {
            this.errorMessage = this.normalizeError(error);
            this.showToast('Upload Failed', this.errorMessage, 'error');
        } finally {
            this.isUploading = false;
        }
    }

    handleUploadResult(result) {
        this.uploadResult = result;
        
        if (result.success) {
            this.showToast(
                'Upload Complete',
                `ContentVersion: ${result.contentVersionId} (${result.methodUsed})`,
                'success'
            );
        } else {
            this.errorMessage = result.errorMessage || 'Unknown upload error';
            this.showToast('Upload Failed', this.errorMessage, 'error');
        }
    }

    // ============================================================
    // VALIDATION & UTILITIES
    // ============================================================

    validateInputs() {
        if (!this.title?.trim()) throw new Error('Title is required.');
        if (!this.fileName?.trim()) throw new Error('File Name is required.');
        if (!this.mimeType?.trim()) throw new Error('MIME Type is required.');
        if (!this.fileBody) throw new Error('File content is required.');
    }

    isBase64(str) {
        // Simple check: base64 strings are typically longer and have specific chars
        const base64Regex = /^[A-Za-z0-9+/]*={0,2}$/;
        return str.length > 100 && base64Regex.test(str);
    }

    formatSize(bytes) {
        if (bytes === 0) return '0 Bytes';
        const k = 1024;
        const sizes = ['Bytes', 'KB', 'MB', 'GB'];
        const i = Math.floor(Math.log(bytes) / Math.log(k));
        return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
    }

    normalizeError(error) {
        if (!error) return 'Unknown error';
        if (typeof error === 'string') return error;
        if (error.body?.message) return error.body.message;
        if (error.message) return error.message;
        return JSON.stringify(error);
    }

    showToast(title, message, variant) {
        this.dispatchEvent(new ShowToastEvent({ title, message, variant }));
    }

    // ============================================================
    // COMPUTED PROPERTIES
    // ============================================================

    get isLargeFile() {
        return this.fileSize > ((this.uploadConfig.maxSingleUploadMB || 6) * 1024 * 1024);
    }

    get uploadMethodText() {
        if (!this.uploadConfig.namedCredentialAvailable) {
            return '⚠️ Named Credential not available - upload may fail';
        }
        if (this.isLargeFile) {
            return 'File will be truncated to ' + (this.uploadConfig.maxSingleUploadMB || 6) + 'MB (Named Credential limit)';
        }
        return '✅ Will upload via Named Credential: ' + (this.uploadConfig.namedCredentialName || 'Salesforce_Upload_API');
    }

    get namedCredStatusClass() {
        return this.uploadConfig.namedCredentialAvailable ? 'slds-text-color_success' : 'slds-text-color_error';
    }

    get namedCredStatusText() {
        return this.uploadConfig.namedCredentialAvailable ? 'Available' : 'Not Available';
    }
}
