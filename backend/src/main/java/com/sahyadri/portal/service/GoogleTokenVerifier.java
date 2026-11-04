package com.sahyadri.portal.service;

import java.util.Map;

/**
 * Verifies a Google ID token and returns its claims (aud, iss, email, email_verified, exp ...).
 * Injectable so tests can fake it. Implementations throw when the token is rejected.
 */
public interface GoogleTokenVerifier {
    Map<String, Object> verify(String credential) throws Exception;
}
