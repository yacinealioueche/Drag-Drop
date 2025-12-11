public with sharing class XLP_POC_EmailToCaseMimicControllerV2 {

    public class AttachmentPayload {
        @AuraEnabled public String fileName;
        @AuraEnabled public String base64;
    }

    @AuraEnabled
    public static Id processParsedEmailV2(
        Id oppId,
        String subject,
        String body,
        String attachmentsJson
    ) {
        System.debug('➡ V2 START processParsedEmailV2');
        System.debug('V2 attachments JSON: ' + attachmentsJson);

        // ---------------------------------------------------------
        // 1️⃣ Create Case (same as Email-to-Case)
        // ---------------------------------------------------------
        Case c = new Case(
            Origin = 'Email',
            Status = 'New',
            Subject = subject != null ? subject.left(255) : 'Email',
            Description = body
        );

        // OPTIONAL: link Case to Opportunity Pipeline (uncomment if needed)
        // c.XLP_Pipeline__c = oppId;

        insert c;

        System.debug('✔ V2 Case created: ' + c.Id);

        // ---------------------------------------------------------
        // 2️⃣ Create EmailMessage associated to Case
        // ---------------------------------------------------------
        EmailMessage em = new EmailMessage();
        em.ParentId = c.Id;
        em.Incoming = true;
        em.Status = '0';
        em.Subject = subject;
        em.TextBody = body;
        em.FromAddress = 'unknown@noemail.com'; // MSG does not expose reliably
        em.ToAddress = 'UW-WB-EmailToCase@company.com';
        em.MessageDate = System.now();

        insert em;

        System.debug('✔ V2 EmailMessage created: ' + em.Id);

        // ---------------------------------------------------------
        // 3️⃣ Save attachments as ContentVersion → linked to EmailMessage
        // ---------------------------------------------------------
        if (String.isNotBlank(attachmentsJson)) {
            List<AttachmentPayload> parsed =
                (List<AttachmentPayload>) JSON.deserialize(
                    attachmentsJson,
                    List<AttachmentPayload>.class
                );

            List<ContentVersion> cvList = new List<ContentVersion>();

            for (AttachmentPayload a : parsed) {
                if (String.isBlank(a.base64)) continue;

                Blob fileBlob = EncodingUtil.base64Decode(a.base64);

                ContentVersion cv = new ContentVersion(
                    Title = a.fileName.contains('.') ?
                        a.fileName.substring(0, a.fileName.lastIndexOf('.')) :
                        a.fileName,
                    PathOnClient = a.fileName,
                    VersionData = fileBlob,
                    FirstPublishLocationId = em.Id
                );

                cvList.add(cv);
            }

            if (!cvList.isEmpty()) {
                insert cvList;
                System.debug('✔ V2 Attachments saved: ' + cvList.size());
            }
        }

        return c.Id;
    }
}
