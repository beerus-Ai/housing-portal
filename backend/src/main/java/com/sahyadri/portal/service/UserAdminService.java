package com.sahyadri.portal.service;

import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.repository.UserRepository;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import com.sahyadri.portal.support.Text;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Committee user management: approve/reject, edit, reset password, soft-remove. */
@Service
public class UserAdminService {
    private static final List<String> RESIDENT_TYPES = List.of("owner", "tenant", "family");

    private final UserRepository users;
    private final AuditService audit;
    private final NotificationService notifications;
    private final PasswordEncoder encoder;
    private final LoginThrottle throttle;

    public UserAdminService(UserRepository users, AuditService audit, NotificationService notifications,
                            PasswordEncoder encoder, LoginThrottle throttle) {
        this.users = users;
        this.audit = audit;
        this.notifications = notifications;
        this.encoder = encoder;
        this.throttle = throttle;
    }

    private static Optional<Long> parseId(String s) {
        try {
            return Optional.of(Long.parseLong(s));
        } catch (NumberFormatException e) {
            return Optional.empty();
        }
    }

    private static ApiException notFound() {
        return new ApiException(404, "User not found");
    }

    public List<Map<String, Object>> list(String status, String q) {
        String term = q == null ? "" : Text.slice(q.strip(), 100);
        return users.search(status == null ? "" : status, term);
    }

    public Map<String, Object> detail(String idStr) {
        Map<String, Object> row = parseId(idStr).map(users::detailRow).orElseThrow(UserAdminService::notFound);
        Map<String, Object> out = new LinkedHashMap<>(row);
        out.put("lease", users.lease(((Number) row.get("id")).longValue()));
        return out;
    }

    /** Resident (or guard when includeGuard) that has not been removed. */
    private User residentTarget(String idStr, boolean includeGuard) {
        User u = parseId(idStr).flatMap(users::findById).orElse(null);
        boolean ok = u != null && !"removed".equals(u.status())
                && ("resident".equals(u.role()) || (includeGuard && "guard".equals(u.role())));
        if (!ok) throw notFound();
        return u;
    }

    @Transactional
    public void decide(User actor, String idStr, String act) {
        User u = parseId(idStr).flatMap(users::findById).orElse(null);
        if (u == null || u.isAdmin()) throw notFound();
        users.updateStatus(u.id(), act.equals("approve") ? "approved" : "rejected");
        audit.log(actor.id(), "user", u.id(), act, null);
    }

    @Transactional
    public Map<String, Object> patch(User actor, String idStr, Body b) {
        User u = residentTarget(idStr, false);
        Map<String, String> ch = new LinkedHashMap<>();
        if (b.has("resident_type")) {
            String v = b.text("resident_type");
            if (v == null || !RESIDENT_TYPES.contains(v)) throw new ApiException(400, "Choose owner, tenant or family");
            ch.put("resident_type", v);
        }
        if (b.has("flat")) {
            String v = b.textOrEmpty("flat").strip();
            if (v.isEmpty() || v.length() > 20) throw new ApiException(400, "Flat is required (up to 20 characters)");
            ch.put("flat", v);
        }
        if (b.has("name")) {
            String v = b.textOrEmpty("name").strip();
            if (v.isEmpty() || v.length() > 100) throw new ApiException(400, "Name is required (up to 100 characters)");
            ch.put("name", v);
        }
        if (b.has("phone")) {
            String v = b.textOrEmpty("phone").strip();
            if (v.length() > 20) throw new ApiException(400, "Phone must be 20 characters or fewer");
            ch.put("phone", v);
        }
        if (b.has("status")) {
            String v = b.text("status");
            if (v == null || !(v.equals("approved") || v.equals("suspended"))) throw new ApiException(400, "Status must be 'approved' or 'suspended'");
            ch.put("status", v);
        }
        boolean statusChanged = false;
        for (Map.Entry<String, String> e : ch.entrySet()) {
            String k = e.getKey(), now = e.getValue(), before = current(u, k);
            if (now.equals(before)) continue;
            users.updateColumn(u.id(), k, now);
            if (k.equals("status")) {
                statusChanged = true;
                audit.log(actor.id(), "user", u.id(), now.equals("suspended") ? "suspended" : "reinstated", before + " -> " + now);
            } else {
                audit.log(actor.id(), "user", u.id(), "updated", k + ": " + before + " -> " + now);
            }
        }
        if (statusChanged) {
            notifications.notify(u.id(), ch.get("status").equals("suspended")
                    ? "Your account was suspended by the committee" : "Your account was reinstated by the committee");
        }
        return users.publicRow(u.id());
    }

    private static String current(User u, String k) {
        String v = switch (k) {
            case "resident_type" -> u.residentType();
            case "flat" -> u.flat();
            case "name" -> u.name();
            case "phone" -> u.phone();
            default -> u.status();
        };
        return v == null ? "" : v;
    }

    @Transactional
    public void resetPassword(User actor, String idStr, Body b) {
        User u = residentTarget(idStr, true);
        String pw = b.textOrEmpty("password");
        if (pw.length() < 8 || pw.length() > 128) throw new ApiException(400, "Password must be 8 to 128 characters");
        users.updatePassword(u.id(), encoder.encode(pw)); // existing sessions stop matching the fingerprint
        throttle.clear("pw|" + u.id());
        audit.log(actor.id(), "user", u.id(), "password_reset", null);
        notifications.notify(u.id(), "The committee reset your password. Sign in with the new password.");
    }

    @Transactional
    public void remove(User actor, String idStr) {
        User u = residentTarget(idStr, false);
        users.updateStatus(u.id(), "removed");
        audit.log(actor.id(), "user", u.id(), "removed", u.name() + " (" + u.status() + ")");
    }
}
