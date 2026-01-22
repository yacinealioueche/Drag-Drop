public with sharing class EmailToCaseController {
    public class CaseFieldInput {
        @AuraEnabled public String Subject;
        @AuraEnabled public String Origin;
        @AuraEnabled public String Priority;
        @AuraEnabled public String Description;
    }
    public class EmailInput {
        @AuraEnabled public String subject;
        @AuraEnabled public String fromAddress;
        @AuraEnabled public String toAddress;
        @AuraEnabled public String ccAddress;
        @AuraEnabled public String messageDate; // ISO string
        @AuraEnabled public String htmlBody;
        @AuraEnabled public String textBody;
    }
    public class FileInput {
        @AuraEnabled public String fileName;
        @AuraEnabled public String base64; // original .msg/.eml optional
    }
    public class ResultDto {
        @AuraEnabled public Id caseId;
        @AuraEnabled public Id emailMessageId;
    }

    @AuraEnabled
    public static ResultDto createCaseFromEmail(
        Id opportunityId,
        CaseFieldInput caseFields,
        EmailInput email,
        FileInput originalEmailFile,
        List<Id> extraDocumentIds
    ) {
        // Basic guardrails
        if (opportunityId == null) {
            throw new AuraHandledException('Opportunity Id is required.');
        }
        Opportunity opp = [
            SELECT Id, Name, Inception_Date__c, Global_Product__c
            FROM Opportunity
            WHERE Id = :opportunityId
        ];

        // 1) Create Case (derive any defaults you want)
        Case c = new Case();
        c.Subject     = (caseFields != null && String.isNotBlank(caseFields.Subject)) ? caseFields.Subject : 'Email from Opportunity: ' + opp.Name;
        c.Origin      = (caseFields != null && String.isNotBlank(caseFields.Origin)) ? caseFields.Origin : 'Email';
        c.Priority    = (caseFields != null && String.isNotBlank(caseFields.Priority)) ? caseFields.Priority : 'Medium';
        c.Description = (caseFields != null) ? caseFields.Description : null;
        // link to Opportunity via a custom lookup on Opportunity (we’ll update the Opportunity below)
        insert c;

        // Update Opportunity.CaseId__c to link back
        // (Change the field API name below if different)
        opp.CaseId__c = c.Id;
        update opp;

        // 2) Insert EmailMessage under Case
        EmailMessage em = new EmailMessage();
        em.ParentId    = c.Id; // Parent is Case
        em.RelatedToId = opp.Id; // Optional: link WhatId/RelatedTo
        em.Subject     = (email != null && String.isNotBlank(email.subject)) ? email.subject : c.Subject;
        em.FromAddress = email != null ? email.fromAddress : null;
        em.ToAddress   = email != null ? email.toAddress   : null;
        em.CcAddress   = email != null ? email.ccAddress   : null;
        em.Incoming    = true;
        em.Status      = '3'; // Sent
        em.MessageDate = (email != null && String.isNotBlank(email.messageDate))
                         ? DateTime.valueOfGmt(email.messageDate.replace('Z',''))
                         : System.now();
        if (email != null && String.isNotBlank(email.htmlBody)) {
            em.HtmlBody = email.htmlBody;
        } else if (email != null && String.isNotBlank(email.textBody)) {
            em.TextBody = email.textBody;
        }
        insert em;

        // 3) Files: original email file (optional)
        List<ContentDocumentLink> links = new List<ContentDocumentLink>();
        if (originalEmailFile != null && String.isNotBlank(originalEmailFile.base64) && String.isNotBlank(originalEmailFile.fileName)) {
            ContentVersion cv = new ContentVersion();
            cv.Title = cleanTitle(originalEmailFile.fileName);
            cv.PathOnClient = '/' + originalEmailFile.fileName;
            cv.VersionData = EncodingUtil.base64Decode(originalEmailFile.base64);
            insert cv;
            cv = [SELECT Id, ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id];
            links.addAll(makeLinks(cv.ContentDocumentId, new Set<Id>{ c.Id, em.Id }));
        }

        // 4) Extra files uploaded to the Opportunity (lightning-file-upload)
        if (extraDocumentIds != null && !extraDocumentIds.isEmpty()) {
            // Translate ContentVersion Ids to ContentDocumentIds if necessary
            // lightning-file-upload provides documentId (ContentDocumentId)
            for (Id docId : extraDocumentIds) {
                links.addAll(makeLinks(docId, new Set<Id>{ c.Id, em.Id }));
            }
        }
        if (!links.isEmpty()) insert links;

        ResultDto r = new ResultDto();
        r.caseId = c.Id;
        r.emailMessageId = em.Id;
        return r;
    }

    private static List<ContentDocumentLink> makeLinks(Id contentDocumentId, Set<Id> parents) {
        List<ContentDocumentLink> cdls = new List<ContentDocumentLink>();
        for (Id pid : parents) {
            ContentDocumentLink cdl = new ContentDocumentLink();
            cdl.ContentDocumentId = contentDocumentId;
            cdl.LinkedEntityId = pid;
            cdl.ShareType = 'V';
            cdls.add(cdl);
        }
        return cdls;
    }

    private static String cleanTitle(String fileName) {
        if (String.isBlank(fileName)) return 'file';
        String title = fileName;
        Integer dot = title.lastIndexOf('.');
        if (dot > 0) title = title.substring(0, dot);
        return title.left(255);
    }
}
