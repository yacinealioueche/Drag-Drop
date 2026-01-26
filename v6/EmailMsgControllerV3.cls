public with sharing class EmailMsgControllerV3 {

    @AuraEnabled
    public static void createCaseEmailAndAttachmentsV3(
        Id oppId,
        EmailMetadataWrapper emailData,
        List<Object> parsedAttachments,
        String originalMsgBase64
    ) {
        // 1) Create Case
        Case c = new Case(
            Subject = emailData != null && String.isNotBlank(emailData.subject) ? emailData.subject : 'Email Case',
            Origin  = 'Email',
            Priority = 'Medium',
            Description = emailData != null ? emailData.textBody : null
        );
        insert c;

        // 2) Link Case back to Opportunity
        Opportunity o = [SELECT Id FROM Opportunity WHERE Id = :oppId];
        o.CaseId__c = c.Id;
        update o;

        // 3) Create EmailMessage under Case
        EmailMessage em = new EmailMessage(
            ParentId    = c.Id,
            RelatedToId = oppId,
            Subject     = emailData != null ? emailData.subject : null,
            FromAddress = emailData != null ? emailData.senderEmail : null,
            ToAddress   = emailData != null ? emailData.toRecipients : null,
            TextBody    = emailData != null ? emailData.textBody : null,
            HtmlBody    = emailData != null ? emailData.htmlBody : null,
            Incoming    = true,
            Status      = '3' // Sent
        );
        insert em;

        // 4) Upload the original .msg for audit (optional but requested)
        if (String.isNotBlank(originalMsgBase64)) {
            Id docId = insertFile(originalMsgBase64, 'OriginalEmail.msg');
            linkFile(docId, c.Id);
            linkFile(docId, em.Id);
        }

        // 5) Upload parsed attachments from the dropped .msg
        if (parsedAttachments != null) {
            for (Object ao : parsedAttachments) {
                Map<String, Object> a = (Map<String, Object>)ao;
                String name   = (String)a.get('fileName');
                String base64 = (String)a.get('base64');
                if (String.isBlank(base64)) continue;

                Id docId = insertFile(base64, name);
                linkFile(docId, c.Id);
                linkFile(docId, em.Id);
            }
        }
    }

    private static Id insertFile(String base64, String name) {
        ContentVersion cv = new ContentVersion(
            Title        = name,
            PathOnClient = name,
            VersionData  = EncodingUtil.base64Decode(base64)
        );
        insert cv;

        return [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id]
               .ContentDocumentId;
    }

    private static void linkFile(Id docId, Id parentId) {
        insert new ContentDocumentLink(
            ContentDocumentId = docId,
            LinkedEntityId    = parentId,
            ShareType         = 'V'
        );
    }
}
