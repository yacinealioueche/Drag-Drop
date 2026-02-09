public with sharing class SessionController {
    @AuraEnabled(cacheable=false)
    public static String getSessionId() {
        return UserInfo.getSessionId();
    }
}
