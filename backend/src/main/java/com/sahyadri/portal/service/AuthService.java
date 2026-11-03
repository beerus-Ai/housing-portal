package com.sahyadri.portal.service;

import com.sahyadri.portal.dto.PublicUser;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.repository.UserRepository;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import com.sahyadri.portal.support.Text;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private static final List<String> RESIDENT_TYPES = List.of("owner", "tenant", "family");
    private static final List<String> GOOGLE_ISSUERS = List.of("accounts.google.com", "https://accounts.google.com");

    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final LoginThrottle throttle;
    private final AuditService audit;
    private final NotificationService notifications;
    private final SettingsService settings;
    private final GoogleTokenVerifier google;
    /** Compared against when the email is unknown, so timing does not reveal which emails exist. */
    private final String dummyHash;

    public AuthService(UserRepository users, PasswordEncoder encoder, LoginThrottle throttle, AuditService audit,
                       NotificationService notifications, SettingsService settings, GoogleTokenVerifier google) {
        this.users = users;
        this.encoder = encoder;
        this.throttle = throttle;
        this.audit = audit;
        this.notifications = notifications;
        this.settings = settings;
        this.google = google;
        this.dummyHash = encoder.encode("not-a-real-password");
    }

    /** The session is bound to the current password hash, so a password reset signs the user out everywhere. */
    public static String fingerprint(String passwordHash) {
        try {
            byte[] d = MessageDigest.getInstance("SHA-256").digest(passwordHash.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(d).substring(0, 16);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    @Transactional
    public void register(Body b) {
        String name = b.str("name", 100), email = b.str("email", 200).toLowerCase(), flat = b.str("flat", 20);
        String phone = b.str("phone", 20), rtype = b.text("resident_type"), pw = b.textOrEmpty("password");
        if (name.isEmpty() || !Text.validEmail(email) || flat.isEmpty()) throw new ApiException(400, "Name, valid email and flat are required");
        if (rtype == null || !RESIDENT_TYPES.contains(rtype)) throw new ApiException(400, "Choose owner, tenant or family");
        if (pw.length() < 8 || pw.length() > 128) throw new ApiException(400, "Password must be 8 to 128 characters");
        if (!b.isTrue("consent")) throw new ApiException(400, "Consent to data processing is required");
        if (users.emailExists(email)) throw new ApiException(409, "Email already registered");
        long id = users.insertResident(name, email, phone, flat, rtype, encoder.encode(pw));
        audit.log(id, "user", id, "registered", rtype + " flat " + flat);
        notifications.notifyAdmins("New registration awaiting approval: " + name + " (flat " + flat + ")");
    }

    private static String statusBlock(User u) {
        return switch (u.status()) {
            case "approved" -> null;
            case "pending" -> "Your account is awaiting admin approval";
            case "suspended" -> "Your account is suspended. Contact the committee.";
            case "removed" -> "This account is no longer active. Contact the committee.";
            default -> "Your registration was not approved";
        };
    }

    /** Checks credentials and account state. The caller then starts the session and calls recordLogin. */
    public User authenticate(String ip, Body b) {
        String email = b.str("email", 200).toLowerCase();
        String key = ip + "|" + email, ipKey = "ip|" + ip;
        if (throttle.throttled(key, 5) || throttle.throttled(ipKey, 30)) throw new ApiException(429, "Too many attempts. Try again later.");
        Optional<User> found = users.findByEmail(email);
        String pw = Text.slice(b.textOrEmpty("password"), 128);
        boolean match = encoder.matches(pw, found.map(User::passwordHash).orElse(dummyHash));
        if (found.isEmpty() || !match) {
            throttle.fail(key);
            throttle.fail(ipKey);
            throw new ApiException(401, "Invalid email or password");
        }
        User u = found.get();
        String blocked = statusBlock(u);
        if (blocked != null) throw new ApiException(403, blocked);
        throttle.clear(key);
        return u;
    }

    /** Google sign-in only ever signs in an EXISTING approved account, matched on the verified email. */
    public User authenticateGoogle(String ip, Body b) {
        String ipKey = "ip|" + ip;
        if (throttle.throttled(ipKey, 30)) throw new ApiException(429, "Too many attempts. Try again later.");
        String clientId = settings.googleClientId();
        if (clientId.isEmpty()) throw new ApiException(404, "Google sign-in is not set up");
        String cred = b.text("credential");
        if (cred == null || cred.isEmpty() || cred.length() > 4096) throw new ApiException(400, "Missing Google credential");
        Map<String, Object> c;
        try {
            c = google.verify(cred);
        } catch (Exception e) {
            c = null;
        }
        if (!claimsValid(c, clientId)) {
            throttle.fail(ipKey);
            throw new ApiException(401, "Google sign-in could not be verified");
        }
        String email = ((String) c.get("email")).strip().toLowerCase();
        User u = users.findByEmail(email).orElseThrow(() -> new ApiException(404, "No account for this Google email. Join first, then sign in."));
        String blocked = statusBlock(u);
        if (blocked != null) throw new ApiException(403, blocked);
        return u;
    }

    private static boolean claimsValid(Map<String, Object> c, String clientId) {
        if (c == null) return false;
        Object ev = c.get("email_verified");
        boolean verified = Boolean.TRUE.equals(ev) || "true".equals(ev);
        boolean expOk;
        try {
            expOk = c.get("exp") != null && Double.parseDouble(c.get("exp").toString()) * 1000 > System.currentTimeMillis();
        } catch (NumberFormatException e) {
            expOk = false;
        }
        boolean issOk = c.get("iss") instanceof String iss && GOOGLE_ISSUERS.contains(iss);
        return clientId.equals(c.get("aud")) && issOk && verified && expOk && c.get("email") instanceof String;
    }

    public void recordLogin(User u, String method) {
        audit.log(u.id(), "user", u.id(), "login", method);
    }

    @Transactional
    public PublicUser updateProfile(User u, Body b) {
        String name = b.str("name", 100);
        if (name.isEmpty()) name = u.name();
        String phone = b.has("phone") ? b.str("phone", 20) : u.phone();
        users.updateProfile(u.id(), name, phone);
        audit.log(u.id(), "user", u.id(), "profile_updated", null);
        return PublicUser.from(users.findById(u.id()).orElseThrow());
    }

    /** Returns the new password hash so the caller can refresh the session fingerprint. */
    @Transactional
    public String changePassword(User u, Body b) {
        String cur = b.textOrEmpty("current"), next = b.textOrEmpty("next");
        String pk = "pw|" + u.id();
        if (throttle.throttled(pk, 5)) throw new ApiException(429, "Too many attempts. Try again later.");
        if (!encoder.matches(Text.slice(cur, 128), u.passwordHash())) {
            throttle.fail(pk);
            throw new ApiException(403, "Current password is wrong");
        }
        throttle.clear(pk);
        if (next.length() < 8 || next.length() > 128) throw new ApiException(400, "New password must be at least 8 characters");
        String hash = encoder.encode(next);
        users.updatePassword(u.id(), hash);
        audit.log(u.id(), "user", u.id(), "password_changed", null);
        return hash;
    }
}
