
public with sharing class EmailIngestController {
    public class CreateRequest {
        public Id opportunityId;
        public Map<String,Object> caseFields;

        public EmailPart email;
        public FilePart originalMsg;             // optional: {fileName, base64}
        public List<FilePart> inlineAttachments; // from .msg (small)
        public List<FilePart> addedAttachments;  // from modal

        public class FilePart { public String fileName; public String base64; }
    }
    public class EmailPart {
        public String subject, fromAddress, toAddress, ccAddress, htmlBody, textBody;
        public Datetime messageDate;
    }
    public class CreateResult {
        @AuraEnabled public Id caseId;
        @AuraEnabled public String caseNumber;
        @AuraEnabled public Id emailMessageId;
        @AuraEnabled public Integer filesLinked;
    }

    @AuraEnabled
    public static CreateResult createCaseAndEmail(String requestJson) {
        CreateRequest req = (CreateRequest) JSON.deserialize(requestJson, CreateRequest.class);
        return EmailIngestService.handleCreate(req);
    }
}
