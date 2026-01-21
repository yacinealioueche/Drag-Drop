
public with sharing class EmailIngestService {

    public static EmailIngestController.CreateResult handleCreate(EmailIngestController.CreateRequest req) {
        // 1) Create Case
        Case c = new Case();
        if (req.caseFields != null) {
            for (String k : req.caseFields.keySet()) c.put(k, req.caseFields.get(k));
        }
        insert c;

        // 2) Update Opportunity.CaseId__c
        if (req.opportunityId != null) {
            Opportunity opp = new Opportunity(Id = req.opportunityId);
            opp.put('CaseId__c', c.Id);
            update opp;
        }

        // 3) Create EmailMessage under Case
        EmailMessage em = new EmailMessage();
        em.ParentId = c.Id;
        if (req.email != null) {
            em.Subject     = req.email.subject;
            em.FromAddress = req.email.fromAddress;
            em.ToAddress   = req.email.toAddress;
            em.CcAddress   = req.email.ccAddress;
            em.MessageDate = req.email.messageDate;
            em.HtmlBody    = req.email.htmlBody;
            if (String.isBlank(em.HtmlBody) && req.email.textBody != null) {
                em.TextBody = req.email.textBody;
            }
        }
        em.Status = '3'; // adjust to your picklist (e.g., 'Sent')
        insert em;

        Integer linked = 0;

        // 4) Original .msg audit (if provided)
        if (req.originalMsg != null && !String.isBlank(req.originalMsg.base64)) {
            linked += insertAndLinkToEmail(em.Id, req.originalMsg.fileName, req.originalMsg.base64);
        }

        // 5) Inline small attachments from .msg
        if (req.inlineAttachments != null) {
            for (EmailIngestController.CreateRequest.FilePart p : req.inlineAttachments) {
                if (!String.isBlank(p.base64))
                    linked += insertAndLinkToEmail(em.Id, p.fileName, p.base64);
            }
        }

        // 6) Additional files from modal
        if (req.addedAttachments != null) {
            for (EmailIngestController.CreateRequest.FilePart p : req.addedAttachments) {
                if (!String.isBlank(p.base64))
                    linked += insertAndLinkToEmail(em.Id, p.fileName, p.base64);
            }
        }

        EmailIngestController.CreateResult res = new EmailIngestController.CreateResult();
        res.caseId = c.Id;
        res.caseNumber = c.CaseNumber;
        res.emailMessageId = em.Id;
        res.filesLinked = linked;
        return res;
    }

    private static Integer insertAndLinkToEmail(Id emailMessageId, String name, String base64) {
        ContentVersion cv = new ContentVersion(
            Title = name,
            PathOnClient = name,
            VersionData = EncodingUtil.base64Decode(base64)
        );
        insert cv;
        Id docId = [SELECT ContentDocumentId FROM ContentVersion WHERE Id = :cv.Id].ContentDocumentId;

        ContentDocumentLink cdl = new ContentDocumentLink(
            ContentDocumentId = docId,
            LinkedEntityId    = emailMessageId,
            ShareType         = 'V',
            Visibility        = 'AllUsers'
        );
        insert cdl;
        return 1;
    }
}
``
