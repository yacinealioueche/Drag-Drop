public with sharing class JwtBearerTokenService {
    /*
     * Required configuration
     *
     * CONSUMER_KEY = External Client App Consumer Key
     * CERT_NAME    = Certificate name from Certificate and Key Management
     *
     * Notes:
     * - JWT bearer flow requires iss, sub, aud, and exp.
     * - sub must be the Salesforce username, not the User Id.
     * - OAuth endpoints support My Domain URLs, so this class derives the auth host dynamically.
     */
    private static final String CONSUMER_KEY   = '3MVG9WktJx3rjNu2R46plGm_1SlzzSmKkruBdCeAv3Tn7ANnZk3yMiS0qB8kjw5QA4UytP.jfFMz5BV_m1o9O';
    private static final String CERT_NAME      = 'LargeFileUpload';
    private static final Integer VALIDITY_SECS = 180;

    public class TokenResponse {
        @AuraEnabled public String accessToken;
        @AuraEnabled public String tokenType;
        @AuraEnabled public String instanceUrl;
    }

    private class TokenErrorBody {
        public String error;
        public String error_description;
    }

    @AuraEnabled(cacheable=false)
    public static TokenResponse getAccessToken() {
        validateConfig();

        try {
            String authHost = getAuthHost();
            String subjectUsername = getSubjectUsername();
            String tokenEndpoint = authHost + '/services/oauth2/token';

            Auth.JWT jwt = new Auth.JWT();
            jwt.setIss(CONSUMER_KEY);
            jwt.setSub(subjectUsername);
            jwt.setAud(authHost);
            jwt.setValidityLength(VALIDITY_SECS);

            Auth.JWS jws = new Auth.JWS(jwt, CERT_NAME);
            Auth.JWTBearerTokenExchange exchange =
                new Auth.JWTBearerTokenExchange(tokenEndpoint, jws);

            HttpResponse res = exchange.getHttpResponse();

            if (res == null) {
                throw new AuraHandledException('No response received from the token endpoint.');
            }

            if (res.getStatusCode() != 200) {
                throw buildOAuthException(res);
            }

            Map<String, Object> payload =
                (Map<String, Object>) JSON.deserializeUntyped(res.getBody());

            String accessToken = (String) payload.get('access_token');
            if (String.isBlank(accessToken)) {
                throw new AuraHandledException(
                    'Token endpoint returned HTTP 200 but no access_token was present.'
                );
            }

            TokenResponse out = new TokenResponse();
            out.accessToken = accessToken;
            out.tokenType   = (String) payload.get('token_type');
            out.instanceUrl = (String) payload.get('instance_url');

            return out;
        } catch (AuraHandledException e) {
            throw e;
        } catch (Exception e) {
            throw new AuraHandledException(
                'Failed to obtain access token via JWT bearer flow: ' + e.getMessage()
            );
        }
    }

    private static void validateConfig() {
        if (String.isBlank(CONSUMER_KEY)) {
            throw new AuraHandledException('CONSUMER_KEY is blank.');
        }
        if (String.isBlank(CERT_NAME)) {
            throw new AuraHandledException('CERT_NAME is blank.');
        }
        if (VALIDITY_SECS == null || VALIDITY_SECS <= 0) {
            throw new AuraHandledException('VALIDITY_SECS must be greater than zero.');
        }
    }

    private static String getAuthHost() {
        return URL.getOrgDomainUrl().toExternalForm();
    }

    private static String getSubjectUsername() {
        return UserInfo.getUserName();
    }

    private static AuraHandledException buildOAuthException(HttpResponse res) {
        String body = res.getBody();
        Integer statusCode = res.getStatusCode();

        try {
            TokenErrorBody err =
                (TokenErrorBody) JSON.deserialize(body, TokenErrorBody.class);

            if (err != null &&
                (!String.isBlank(err.error) || !String.isBlank(err.error_description))) {

                String message = 'JWT bearer token request failed';
                if (!String.isBlank(err.error)) {
                    message += '. error=' + err.error;
                }
                if (!String.isBlank(err.error_description)) {
                    message += ', description=' + err.error_description;
                }
                return new AuraHandledException(message);
            }
        } catch (Exception ignored) {
            // Fall back to generic error message below
        }

        return new AuraHandledException(
            'JWT bearer token request failed. HTTP ' + statusCode
        );
    }
}
