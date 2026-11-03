package com.sahyadri.portal.security;

import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpSession;

/** Server-side session helpers: the session holds the user id and a fingerprint of the password hash. */
public final class SessionSupport {
    public static final String UID = "uid";
    public static final String FP = "pf";

    private SessionSupport() {}

    /** Starts a fresh session (the old one is discarded to prevent fixation). */
    public static void establish(HttpServletRequest req, User u) {
        HttpSession old = req.getSession(false);
        if (old != null) old.invalidate();
        HttpSession s = req.getSession(true);
        s.setAttribute(UID, u.id());
        s.setAttribute(FP, AuthService.fingerprint(u.passwordHash()));
    }

    public static void refreshFingerprint(HttpServletRequest req, String newPasswordHash) {
        HttpSession s = req.getSession(false);
        if (s != null) s.setAttribute(FP, AuthService.fingerprint(newPasswordHash));
    }

    public static void destroy(HttpServletRequest req) {
        HttpSession s = req.getSession(false);
        if (s != null) s.invalidate();
    }
}
