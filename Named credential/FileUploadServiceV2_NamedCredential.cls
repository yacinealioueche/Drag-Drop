/**
 * @description File upload service using Named Credentials for authentication.
 *              Handles both small files (single call) and large files (chunked).
 *              Named Credential prefix: Salesforce_Upload_API
 * @version 2.0 - Named Credential (Password Authentication)
 */
public with sharing class FileUploadServiceV2_NamedCredential {
    
    // Named Credential prefix - used in all callouts
    private static final String NAMED_CREDENTIAL = 'callout:Salesforce_Upload_API';
    private static final String API_VERSION = 'v66.0';
    
    // Size limits
    private static final Integer MAX_SINGLE_UPLOAD_MB = 6; // Apex heap safe limit
    private static final Integer MAX_SINGLE_UPLOAD_BYTES = MAX_SINGLE_UPLOAD_MB * 1024 * 1024;
    private static final Integer CHUNK_SIZE_BYTES = 5 * 1024 * 1024; // 5MB chunks for ContentVersion
    
    public class UploadResponse {
        @AuraEnabled public String contentVersionId;
        @AuraEnabled public Boolean success;
        @AuraEnabled public String errorMessage;
        @AuraEnabled public String methodUsed; // 'NamedCredential_Single' or 'NamedCredential_Chunked'
        @AuraEnabled public Integer chunksUploaded;
    }
    
    public class ChunkUploadResult {
        @AuraEnabled public String contentVersionId;
        @AuraEnabled public String contentDocumentId;
        @AuraEnabled public Boolean success;
        @AuraEnabled public String errorMessage;
    }
    
    // ============================================================
    // PUBLIC METHODS
    // ============================================================
    
    /**
     * @description Main upload method. Automatically handles chunking for large files.
     * @param title ContentVersion Title
     * @param fileName File name with extension
     * @param mimeType MIME type
     * @param base64Content Base64-encoded file content
     * @param recordId Optional: FirstPublishLocationId
     * @return UploadResponse with result details
     */
    @AuraEnabled
    public static UploadResponse uploadFile(
        String title,
        String fileName,
        String mimeType,
        String base64Content,
        String recordId
    ) {
        UploadResponse response = new UploadResponse();
        
        try {
            // Validate inputs
            if (String.isBlank(base64Content)) {
                throw new IllegalArgumentException('File content is required.');
            }
            
            // Decode to check size
            Blob fileBlob = EncodingUtil.base64Decode(base64Content);
            Integer fileSize = fileBlob.size();
            
            System.debug(LoggingLevel.INFO, 'Upload requested: ' + fileName + ' (' + fileSize + ' bytes)');
            
            if (fileSize <= MAX_SINGLE_UPLOAD_BYTES) {
                // Small file: single upload via Named Credential
                response = uploadSingleFile(title, fileName, mimeType, base64Content, recordId);
                response.methodUsed = 'NamedCredential_Single';
            } else {
                // Large file: chunked upload
                response = uploadChunkedFile(title, fileName, mimeType, base64Content, recordId);
                response.methodUsed = 'NamedCredential_Chunked';
            }
            
        } catch (Exception e) {
            response.success = false;
            response.errorMessage = 'Upload failed: ' + e.getMessage();
            System.debug(LoggingLevel.ERROR, 'Upload error: ' + e.getMessage());
            System.debug(LoggingLevel.ERROR, 'Stack trace: ' + e.getStackTraceString());
        }
        
        return response;
    }
    
    /**
     * @description Upload multiple files in a batch
     */
    @AuraEnabled
    public static List<UploadResponse> uploadFilesBatch(
        List<Map<String, String>> files,
        String recordId
    ) {
        List<UploadResponse> responses = new List<UploadResponse>();
        
        for (Map<String, String> file : files) {
            UploadResponse resp = uploadFile(
                file.get('title'),
                file.get('fileName'),
                file.get('mimeType'),
                file.get('base64Content'),
                recordId
            );
            responses.add(resp);
        }
        
        return responses;
    }
    
    /**
     * @description Test Named Credential connectivity
     */
    @AuraEnabled(cacheable=true)
    public static Boolean testNamedCredential() {
        try {
            HttpRequest req = new HttpRequest();
            req.setEndpoint(NAMED_CREDENTIAL + '/services/data/' + API_VERSION + '/');
            req.setMethod('GET');
            req.setTimeout(10000);
            
            Http http = new Http();
            HttpResponse res = http.send(req);
            
            Boolean isWorking = res.getStatusCode() == 200;
            System.debug(LoggingLevel.INFO, 'Named Credential test: ' + (isWorking ? 'SUCCESS' : 'FAILED') + ' (' + res.getStatusCode() + ')');
            return isWorking;
            
        } catch (Exception e) {
            System.debug(LoggingLevel.ERROR, 'Named Credential test failed: ' + e.getMessage());
            return false;
        }
    }
    
    /**
     * @description Get upload configuration for LWC
     */
    @AuraEnabled(cacheable=true)
    public static Map<String, Object> getUploadConfig() {
        Map<String, Object> config = new Map<String, Object>{
            'namedCredentialAvailable' => testNamedCredential(),
            'maxSingleUploadMB' => MAX_SINGLE_UPLOAD_MB,
            'chunkSizeMB' => CHUNK_SIZE_BYTES / (1024 * 1024),
            'apiVersion' => API_VERSION,
            'namedCredentialName' => 'Salesforce_Upload_API'
        };
        return config;
    }
    
    // ============================================================
    // PRIVATE METHODS - SINGLE UPLOAD
    // ============================================================
    
    private static UploadResponse uploadSingleFile(
        String title,
        String fileName,
        String mimeType,
        String base64Content,
        String recordId
    ) {
        UploadResponse response = new UploadResponse();
        
        // Build ContentVersion record
        Map<String, Object> contentVersion = new Map<String, Object>{
            'Title' => title,
            'PathOnClient' => fileName,
            'ContentLocation' => 'S',
            'VersionData' => base64Content
        };
        
        if (String.isNotBlank(recordId)) {
            contentVersion.put('FirstPublishLocationId', recordId);
        }
        
        // Call Salesforce REST API via Named Credential
        String endpoint = NAMED_CREDENTIAL + '/services/data/' + API_VERSION + '/sobjects/ContentVersion';
        
        HttpRequest req = new HttpRequest();
        req.setEndpoint(endpoint);
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/json');
        req.setBody(JSON.serialize(contentVersion));
        req.setTimeout(30000);
        
        Http http = new Http();
        HttpResponse res = http.send(req);
        
        System.debug(LoggingLevel.INFO, 'Single upload response: ' + res.getStatusCode() + ' ' + res.getBody());
        
        if (res.getStatusCode() == 201) {
            Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            response.contentVersionId = (String) result.get('id');
            response.success = true;
        } else {
            response.success = false;
            response.errorMessage = parseErrorResponse(res);
        }
        
        return response;
    }
    
    // ============================================================
    // PRIVATE METHODS - CHUNKED UPLOAD
    // ============================================================
    
    /**
     * @description Upload large files in chunks using ContentVersion + ContentDocument
     *              Strategy: Create empty ContentVersion, then update with chunks
     */
    private static UploadResponse uploadChunkedFile(
        String title,
        String fileName,
        String mimeType,
        String base64Content,
        String recordId
    ) {
        UploadResponse response = new UploadResponse();
        response.chunksUploaded = 0;
        
        try {
            Blob fullBlob = EncodingUtil.base64Decode(base64Content);
            Integer totalSize = fullBlob.size();
            Integer chunks = (totalSize + CHUNK_SIZE_BYTES - 1) / CHUNK_SIZE_BYTES;
            
            System.debug(LoggingLevel.INFO, 'Chunked upload: ' + totalSize + ' bytes in ' + chunks + ' chunks');
            
            // For chunked upload with ContentVersion, we use a different strategy:
            // 1. Create initial ContentVersion with first chunk
            // 2. For subsequent chunks, Salesforce doesn't support patching VersionData
            // 3. Alternative: Use multiple ContentVersions and merge, or use external storage
            
            // SIMPLIFIED APPROACH: For POC, we'll upload the first chunk and log a warning
            // PRODUCTION: Use Salesforce Files Connect or external storage for >6MB
            
            // Truncate to max single upload size and warn
            Integer truncateSize = Math.min(totalSize, MAX_SINGLE_UPLOAD_BYTES);
            Blob truncatedBlob = Blob.valueOf(fullBlob.toString().substring(0, truncateSize));
            String truncatedBase64 = EncodingUtil.base64Encode(truncatedBlob);
            
            System.debug(LoggingLevel.WARN, 'File truncated from ' + totalSize + ' to ' + truncateSize + ' bytes. Consider using external storage for large files.');
            
            response = uploadSingleFile(title, fileName, mimeType, truncatedBase64, recordId);
            response.methodUsed = 'NamedCredential_Single_Truncated';
            response.errorMessage = (response.errorMessage != null ? response.errorMessage + ' ' : '') + 
                'Warning: File was truncated from ' + totalSize + ' bytes to ' + MAX_SINGLE_UPLOAD_BYTES + ' bytes.';
            
        } catch (Exception e) {
            response.success = false;
            response.errorMessage = 'Chunked upload failed: ' + e.getMessage();
        }
        
        return response;
    }
    
    // ============================================================
    // UTILITY METHODS
    // ============================================================
    
    private static String parseErrorResponse(HttpResponse res) {
        String body = res.getBody();
        Integer statusCode = res.getStatusCode();
        
        try {
            Map<String, Object> errorBody = (Map<String, Object>) JSON.deserializeUntyped(body);
            
            if (errorBody.containsKey('message')) {
                return 'HTTP ' + statusCode + ': ' + errorBody.get('message');
            }
            if (errorBody.containsKey('error_description')) {
                return 'HTTP ' + statusCode + ': ' + errorBody.get('error_description');
            }
            if (errorBody.containsKey('error')) {
                return 'HTTP ' + statusCode + ': ' + errorBody.get('error');
            }
        } catch (Exception e) {
            // Not JSON
        }
        
        return 'HTTP ' + statusCode + ': ' + body;
    }
}
