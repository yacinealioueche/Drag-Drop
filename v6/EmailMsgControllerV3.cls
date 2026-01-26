
public with sharing class EmailMsgControllerV3 {

    // Strongly-typed attachment payload from LWC
    public class AttachmentStubV3 {
        @AuraEnabled public String fileName {get; set;}
        @AuraEnabled public String base64   {get; set;}
    }

    @AuraEnabled
    public static void createCaseEmailAndAttachmentsV3(
        Id oppId,
        EmailMetadataWrapper emailData,
        List<AttachmentStubV3> parsedAttachments,
        String originalMsgBase64
    ) {
        if (oppId == null) {
            throw new AuraHandledException('Opportunity Id is required.');
        }

        // 1) Create Case (link back later)
        Case c = new Case(
            Subject     = truncate(emailData != null ? emailData.subject  : 'Email Case', 255),
            Origin      = 'Email',
            Priority    = 'Medium',
            Description = truncate(emailData != null ? emailData.textBody : null, 32000)
        );
        insert c;

        // 2) Link Opportunity -> Case (adjust field API if different)
        Opportunity o = [SELECT Id FROM Opportunity WHERE Id = :oppId LIMIT 1];
        o.CaseId__c = c.Id;
        update o;

        // 3) Create EmailMessage under Case, related to Opportunity
        EmailMessage em = new EmailMessage();
        em.ParentId    = c.Id;
        em.RelatedToId = oppId;
        if (emailData != null) {
            em.Subject     = truncate(emailData.subject, 255);
            em.FromAddress = truncate(emailData.senderEmail, 320);
            em.ToAddress   = truncate(emailData.toRecipients, 4000);
            em.TextBody    = truncate(emailData.textBody, 131000);
            em.HtmlBody    = truncate(emailData.htmlBody, 131000);
        }
        em.Incoming = true;
        em.Status   = '3'; // Sent
        insert em;

        // 4) Original .msg (audit)
        if (String.isNotBlank(originalMsgBase64)) {
            Id docId = insertFile(originalMsgBase64, 'OriginalEmail.msg');
            linkFile(docId, c.Id);
            linkFile(docId, em.Id);
        }

        // 5) Parsed attachments (already base64 from LWC)
        if (parsedAttachments != null) {
            for (AttachmentStubV3 a : parsedAttachments) {
                if (a == null || String.isBlank(a.base64)) continue;
                String name = String.isBlank(a.fileName) ? 'attachment' : a.fileName;
                Id docId = insertFile(a.base64, name);
                linkFile(docId, c.Id);
                linkFile(docId, em.Id);
            }
        }
    }

    // ----- Helpers -----
    private static String truncate(String s, Integer maxLen) {
        if (s == null) return null;
        if (s.length() <= maxLen) return s;
        return s.substring(0, maxLen);
    }

    private static Id insertFile(String base64, String name) {
        ContentVersion cv = new ContentVersion(
            Title        = truncate(name, 255),
            PathOnClient = truncate(name, 255),
            VersionData  = EncodingUtil.base64Decode(base64)
        );
        insert cv;
        return [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id].ContentDocumentId;
    }

    private static void linkFile(Id docId, Id parentId) {
        insert new ContentDocumentLink(
            ContentDocumentId = docId,
            LinkedEntityId    = parentId,
            ShareType         = 'V'
        );
    }
}
