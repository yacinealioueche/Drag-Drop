public with sharing class XLP_POC_EmailForwardController {

    @AuraEnabled
    public static void forwardParsedEmail(
        Id oppId,
        String subject,
        String body,
        String attachmentsJson
    ) {
        System.debug('➡ START forwardParsedEmail');
        System.debug('Attachments JSON: ' + attachmentsJson);
    
        List<Messaging.EmailFileAttachment> emailAttachments = new List<Messaging.EmailFileAttachment>();
    
        if (String.isNotBlank(attachmentsJson)) {
            List<Object> parsed = (List<Object>) JSON.deserializeUntyped(attachmentsJson);
    
            for (Object o : parsed) {
                Map<String, Object> att = (Map<String, Object>)o;
    
                String fileName = (String) att.get('fileName');
                String base64 = (String) att.get('base64');
    
                Messaging.EmailFileAttachment efa = new Messaging.EmailFileAttachment();
                efa.setFileName(fileName);
                efa.setBody(EncodingUtil.base64Decode(base64));
    
                emailAttachments.add(efa);
            }
        }
    
        Messaging.SingleEmailMessage email = new Messaging.SingleEmailMessage();
        email.setToAddresses(new String[] { 'workbench.comqa.two@axaxl.com' });
        email.setSubject('[OPP:' + oppId + '] ' + subject);
        System.debug('@@>>email.setSubject '+ subject);
        email.setHtmlBody(body);
        email.setFileAttachments(emailAttachments);
    
        Messaging.sendEmail(new Messaging.Email[] { email });
    
        System.debug('➡ Email sent successfully.');
    }
}
