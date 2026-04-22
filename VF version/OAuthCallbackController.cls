public class OAuthCallbackController {
    
    private static final String CONSUMER_KEY = 'YOUR_EXTERNAL_CLIENT_APP_CLIENT_ID';
    private static final String CONSUMER_SECRET = 'YOUR_EXTERNAL_CLIENT_APP_SECRET';
    private static final String REDIRECT_URI = 'https://yourCompany.my.salesforce.com/apex/OAuthCallbackHandler';
    
    public class TokenResponse {
        public String accessToken;
        public String refreshToken;
        public String instanceUrl;
        public String tokenType;
        public Integer expiresIn;
    }
    
    @RemoteAction
    public static TokenResponse exchangeCode(String authCode) {
        HttpRequest req = new HttpRequest();
        req.setEndpoint(URL.getOrgDomainUrl().toExternalForm() + '/services/oauth2/token');
        req.setMethod('POST');
        req.setHeader('Content-Type', 'application/x-www-form-urlencoded');
        
        String body = 'grant_type=authorization_code' +
                      '&code=' + EncodingUtil.urlEncode(authCode, 'UTF-8') +
                      '&client_id=' + EncodingUtil.urlEncode(CONSUMER_KEY, 'UTF-8') +
                      '&client_secret=' + EncodingUtil.urlEncode(CONSUMER_SECRET, 'UTF-8') +
                      '&redirect_uri=' + EncodingUtil.urlEncode(REDIRECT_URI, 'UTF-8');
        
        req.setBody(body);
        
        Http http = new Http();
        HttpResponse res = http.send(req);
        
        if (res.getStatusCode() == 200) {
            Map<String, Object> result = (Map<String, Object>) JSON.deserializeUntyped(res.getBody());
            TokenResponse tr = new TokenResponse();
            tr.accessToken = (String) result.get('access_token');
            tr.refreshToken = (String) result.get('refresh_token');
            tr.instanceUrl = (String) result.get('instance_url');
            tr.tokenType = (String) result.get('token_type');
            tr.expiresIn = (Integer) result.get('expires_in');
            return tr;
        } else {
            throw new AuraHandledException('Token exchange failed: ' + res.getBody());
        }
    }
}
