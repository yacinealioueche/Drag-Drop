import { LightningElement, api, track } from 'lwc';
import { ShowToastEvent } from 'lightning/platformShowToastEvent';
import getAccessToken from '@salesforce/apex/JwtBearerTokenService.getAccessToken';

const API_VERSION = 'v66.0';

export default class GeneratedFileUploader extends LightningElement {
    @api recordId;

    @track title = 'Generated File';
    @track fileName = 'generated.txt';
    @track mimeType = 'text/plain';
    @track fileBody = 'Hello from LWC.\nThis file was generated entirely in JavaScript.';
    @track isUploading = false;
    @track uploadResult;
    @track errorMessage;

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
    }

    async handleUpload() {
        this.isUploading = true;
        this.errorMessage = null;
        this.uploadResult = null;

        try {
            this.validateInputs();

            // 1) Get OAuth access token from Apex
            const auth = await getAccessToken();

            if (!auth || !auth.accessToken || !auth.instanceUrl) {
                throw new Error('Apex did not return a valid access token response.');
            }

            // 2) Build the generated file Blob in JavaScript
            const fileBlob = this.buildGeneratedFileBlob();

            // 3) Upload to Salesforce REST API using a manually-built multipart body
            const result = await this.uploadGeneratedFile(auth, fileBlob);

            this.uploadResult = result;

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Upload Complete',
                    message: `ContentVersion created: ${result.id}`,
                    variant: 'success'
                })
            );
        } catch (error) {
            this.errorMessage = this.normalizeError(error);

            this.dispatchEvent(
                new ShowToastEvent({
                    title: 'Upload Failed',
                    message: this.errorMessage,
                    variant: 'error'
                })
            );
        } finally {
            this.isUploading = false;
        }
    }

    validateInputs() {
        if (!this.title || !this.title.trim()) {
            throw new Error('Title is required.');
        }
        if (!this.fileName || !this.fileName.trim()) {
            throw new Error('File Name is required.');
        }
        if (!this.mimeType || !this.mimeType.trim()) {
            throw new Error('MIME Type is required.');
        }
        if (this.fileBody === null || this.fileBody === undefined) {
            throw new Error('Generated file content is required.');
        }
    }

    buildGeneratedFileBlob() {
        // Replace this with your real JS-generated file logic if needed.
        // Examples:
        // - JSON.stringify(object, null, 2)
        // - CSV string generation
        // - XML generation
        // - PDF bytes from a JS library
        return new Blob([this.fileBody], { type: this.mimeType });
    }

    async uploadGeneratedFile(auth, fileBlob) {
        const entityContent = {
            Title: this.title,
            PathOnClient: this.fileName,
            ContentLocation: 'S'
        };

        // Publish to the current record when placed on a record page
        if (this.recordId) {
            entityContent.FirstPublishLocationId = this.recordId;
        }

        const endpoint = `${auth.instanceUrl}/services/data/${API_VERSION}/sobjects/ContentVersion`;
        const boundary = '----sfboundary' + Date.now();

        // Non-binary metadata part
        const metadataPart =
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="entity_content"\r\n` +
            `Content-Type: application/json\r\n\r\n` +
            `${JSON.stringify(entityContent)}\r\n`;

        // Binary file part header
        const fileHeaderPart =
            `--${boundary}\r\n` +
            `Content-Disposition: form-data; name="VersionData"; filename="${this.escapeHeaderValue(this.fileName)}"\r\n` +
            `Content-Type: ${this.mimeType || 'application/octet-stream'}\r\n\r\n`;

        const closingPart = `\r\n--${boundary}--`;

        // Build the full multipart body as a Blob so fileBlob stays binary
        const requestBody = new Blob(
            [
                metadataPart,
                fileHeaderPart,
                fileBlob,
                closingPart
            ],
            { type: `multipart/form-data; boundary=${boundary}` }
        );

        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                Authorization: `${auth.tokenType || 'Bearer'} ${auth.accessToken}`,
                'Content-Type': `multipart/form-data; boundary=${boundary}`
            },
            body: requestBody
        });

        const responseText = await response.text();
        let responseJson;

        try {
            responseJson = responseText ? JSON.parse(responseText) : {};
        } catch (e) {
            responseJson = { raw: responseText };
        }

        if (!response.ok) {
            throw new Error(this.formatError(response.status, responseJson));
        }

        return responseJson;
    }

    escapeHeaderValue(value) {
        if (!value) {
            return '';
        }

        // Avoid breaking the MIME header if the filename contains quotes/newlines
        return String(value)
            .replace(/"/g, '\\"')
            .replace(/\r/g, '')
            .replace(/\n/g, '');
    }

    formatError(status, payload) {
        if (Array.isArray(payload) && payload.length > 0) {
            const first = payload[0];
            const code = first.errorCode ? `[${first.errorCode}] ` : '';
            const msg = first.message || JSON.stringify(first);
            return `HTTP ${status}: ${code}${msg}`;
        }

        if (payload && payload.error_description) {
            return `HTTP ${status}: ${payload.error_description}`;
        }

        if (payload && payload.message) {
            return `HTTP ${status}: ${payload.message}`;
        }

        if (payload && payload.raw) {
            return `HTTP ${status}: ${payload.raw}`;
        }

        return `HTTP ${status}: ${JSON.stringify(payload)}`;
    }

    normalizeError(error) {
        if (!error) {
            return 'Unknown error';
        }

        if (typeof error === 'string') {
            return error;
        }

        if (error.body && error.body.message) {
            return error.body.message;
        }

        if (error.message) {
            return error.message;
        }

        return JSON.stringify(error);
    }
}
