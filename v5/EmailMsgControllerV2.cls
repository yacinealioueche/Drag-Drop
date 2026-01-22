public with sharing class EmailMsgControllerV2 {

    @AuraEnabled(cacheable=true)
    public static Opportunity getOpportunityFields(Id oppId) {
        return [
            SELECT Inception_Date__c, Global_Product__c
            FROM Opportunity
            WHERE Id = :oppId
        ];
    }

    @AuraEnabled
    public static void createCaseEmailAndAttachments(
        Id oppId,
        String caseSubject,
        String casePriority,
        String caseDescription,
        EmailMetadataWrapper emailData,
        String originalMsgBase64,
        List<Object> parsedAttachments,
        List<String> newFileDocumentIds
    ) {
        // 1. Create Case
        Case c = new Case(
            Subject = caseSubject,
            Priority = casePriority,
            Description = caseDescription,
            Origin = 'Email'
        );
        insert c;

        // 2. Link Opportunity
        Opportunity o = [SELECT Id FROM Opportunity WHERE Id = :oppId];
        o.CaseId__c = c.Id;
        update o;

        // 3. Create EmailMessage
        EmailMessage em = new EmailMessage(
            ParentId = c.Id,
            RelatedToId = oppId,
            Subject = emailData.subject,
            FromAddress = emailData.senderEmail,
            ToAddress = emailData.toRecipients,
            TextBody = emailData.textBody,
            HtmlBody = emailData.htmlBody,
            Incoming = true,
            Status = '3'
        );
        insert em;

        // 4. Attach original .msg
        if (String.isNotBlank(originalMsgBase64)) {
            Id docId = insertContent(originalMsgBase64, 'originalEmail.msg');
            link(docId, c.Id);
            link(docId, em.Id);
        }

        // 5. Attach parsed attachments
        for (Object a : parsedAttachments) {
            Map<String, Object> att = (Map<String, Object>)a;
            String fname = (String)att.get('fileName');
            String base64 = (String)att.get('base64');

            Id docId = insertContent(base64, fname);
            link(docId, c.Id);
            link(docId, em.Id);
        }

        // 6. Additional files user added
        if (newFileDocumentIds != null) {
            for (String docId : newFileDocumentIds) {
                link(docId, c.Id);
                link(docId, em.Id);
            }
        }
    }

    private static Id insertContent(String base64, String name) {
        ContentVersion cv = new ContentVersion(
            Title = name,
            PathOnClient = name,
            VersionData = EncodingUtil.base64Decode(base64)
        );
        insert cv;

        return [
            SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id
        ].ContentDocumentId;
    }

    private static void link(Id docId, Id parentId) {
        insert new ContentDocumentLink(
            ContentDocumentId = docId,
            LinkedEntityId = parentId,
            ShareType = 'V'
        );
    }
}
