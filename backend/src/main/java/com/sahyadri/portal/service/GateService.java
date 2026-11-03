package com.sahyadri.portal.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.repository.Db;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import com.sahyadri.portal.support.Js;
import com.sahyadri.portal.support.TimeUtil;
import java.security.SecureRandom;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.stereotype.Service;

/** Visitor passes, resident gate tokens, the guard's verify call, the gate log and the gate overview. */
@Service
public class GateService {
    private static final int MAX_ACTIVE_PASSES = 10;
    private static final int VERIFY_MAX_DENIED = 10;
    private static final Pattern TIME = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}T\\d{2}:\\d{2}(:\\d{2}(\\.\\d+)?)?(Z|[+-]\\d{2}:\\d{2})?$");
    private static final Pattern HAS_ZONE = Pattern.compile(".*(Z|[+-]\\d{2}:\\d{2})$");
    private static final String PASS_SELECT = "SELECT p.*, u.name AS created_by_name FROM gate_passes p JOIN users u ON u.id=p.created_by";
    private static final SecureRandom RANDOM = new SecureRandom();

    private final Db db;
    private final AuditService audit;
    private final NotificationService notifications;

    public GateService(Db db, AuditService audit, NotificationService notifications) {
        this.db = db;
        this.audit = audit;
        this.notifications = notifications;
    }

    // ---- helpers
    private static String hexToken() {
        byte[] b = new byte[12];
        RANDOM.nextBytes(b);
        return HexFormat.of().formatHex(b);
    }

    private static Instant parseTime(JsonNode v) {
        if (!v.isTextual()) return null;
        String s = v.asText().strip().replaceFirst(" ", "T");
        if (!TIME.matcher(s).matches()) return null;
        if (!HAS_ZONE.matcher(s).matches()) s += "Z";
        try {
            return OffsetDateTime.parse(s).toInstant();
        } catch (DateTimeParseException e) {
            return null;
        }
    }

    private static LocalDateTime ts(Instant i) {
        return LocalDateTime.ofInstant(i, ZoneOffset.UTC).withNano(0);
    }

    private static boolean has(JsonNode v) {
        return !Js.nullish(v) && !(v.isTextual() && v.asText().isEmpty());
    }

    private Map<String, Object> passRow(Map<String, Object> r) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("id", r.get("id"));
        o.put("flat", r.get("flat"));
        o.put("visitor_name", r.get("visitor_name"));
        o.put("purpose", r.get("purpose"));
        o.put("code", r.get("code"));
        o.put("qr", "HSP:" + r.get("token"));
        o.put("valid_from", r.get("valid_from"));
        o.put("valid_until", r.get("valid_until"));
        String status = (String) r.get("status");
        // both are 'yyyy-MM-dd HH:mm:ss' so string order is time order
        if ("active".equals(status) && ((String) r.get("valid_until")).compareTo(TimeUtil.format(TimeUtil.nowUtc())) < 0) status = "expired";
        o.put("status", status);
        o.put("created_by_name", r.get("created_by_name"));
        o.put("used_at", r.get("used_at"));
        return o;
    }

    private void glog(String kind, String subject, String flat, String result, String reason, long guardId) {
        db.update("INSERT INTO gate_log(kind,subject,flat,result,reason,guard_id,created_at) VALUES(?,?,?,?,?,?,?)",
                kind, subject, flat, result, reason, guardId, TimeUtil.nowUtc());
    }

    // ---- passes
    public Map<String, Object> createPass(User u, Body b) {
        JsonNode vn = b.get("visitor_name");
        String visitor = vn.isTextual() ? vn.asText().strip() : "";
        if (visitor.isEmpty() || visitor.length() > 100) throw new ApiException(400, "Visitor name is required (up to 100 characters)");
        JsonNode pn = b.get("purpose");
        if (!Js.nullish(pn) && !pn.isTextual()) throw new ApiException(400, "Purpose must be text");
        String purpose = Js.nullish(pn) ? "" : pn.asText().strip();
        if (purpose.length() > 200) throw new ApiException(400, "Purpose must be 200 characters or fewer");
        Instant now = Instant.now();
        Instant from = now, until;
        if (has(b.get("valid_from"))) {
            from = parseTime(b.get("valid_from"));
            if (from == null) throw new ApiException(400, "valid_from is not a valid date and time");
        }
        if (has(b.get("valid_until"))) {
            until = parseTime(b.get("valid_until"));
            if (until == null) throw new ApiException(400, "valid_until is not a valid date and time");
        } else {
            until = from.plusSeconds(24 * 3600);
        }
        if (!until.isAfter(from)) throw new ApiException(400, "valid_until must be after valid_from");
        if (until.toEpochMilli() - from.toEpochMilli() > 7L * 24 * 3600_000) throw new ApiException(400, "A pass can be valid for at most 7 days");
        long active = db.count("SELECT COUNT(*) FROM gate_passes WHERE flat=? AND status='active' AND valid_until>=?", u.flat(), ts(now));
        if (active >= MAX_ACTIVE_PASSES) {
            throw new ApiException(429, "Your flat already has " + MAX_ACTIVE_PASSES + " active visitor passes. Cancel one or wait for it to expire.");
        }
        String code;
        do {
            code = String.format("%06d", RANDOM.nextInt(1_000_000));
        } while (db.one("SELECT id FROM gate_passes WHERE code=? AND status='active'", code) != null);
        String token = hexToken();
        long id = db.insert("INSERT INTO gate_passes(flat,created_by,visitor_name,purpose,token,code,valid_from,valid_until,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                u.flat(), u.id(), visitor, purpose.isEmpty() ? null : purpose, token, code, ts(from), ts(until), TimeUtil.nowUtc());
        audit.log(u.id(), "gate_pass", id, "created",
                visitor + " flat " + u.flat() + " " + TimeUtil.format(ts(from)) + " to " + TimeUtil.format(ts(until)));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("id", id);
        out.put("token", token);
        out.put("code", code);
        out.put("qr", "HSP:" + token);
        return out;
    }

    public List<Map<String, Object>> listPasses(User u) {
        List<Map<String, Object>> rows;
        if (u.isAdmin()) {
            rows = db.list(PASS_SELECT + " ORDER BY p.id DESC LIMIT 500");
        } else {
            if (!"resident".equals(u.role()) || u.flat() == null || u.flat().isEmpty()) {
                throw new ApiException(403, "Only residents with a flat can use this");
            }
            rows = db.list(PASS_SELECT + " WHERE p.flat=? ORDER BY p.id DESC LIMIT 200", u.flat());
        }
        List<Map<String, Object>> out = new ArrayList<>();
        for (Map<String, Object> r : rows) out.add(passRow(r));
        return out;
    }

    public void cancelPass(User u, String idStr) {
        Map<String, Object> p = Js.id(idStr).map(i -> db.one("SELECT * FROM gate_passes WHERE id=?", i)).orElse(null);
        if (p == null || (!u.isAdmin() && !Objects.equals(p.get("flat"), u.flat()))) throw new ApiException(404, "Pass not found");
        long pid = ((Number) p.get("id")).longValue();
        if (!u.isAdmin() && ((Number) p.get("created_by")).longValue() != u.id() && !"owner".equals(u.residentType())) {
            throw new ApiException(403, "Only the creator, the flat owner or the committee can cancel this pass");
        }
        if (!"active".equals(p.get("status"))) throw new ApiException(409, "Pass is already " + p.get("status"));
        int changed = db.update("UPDATE gate_passes SET status='cancelled' WHERE id=? AND status='active'", pid);
        if (changed == 0) throw new ApiException(409, "Pass is no longer active");
        audit.log(u.id(), "gate_pass", pid, "cancelled", (String) p.get("visitor_name"));
    }

    // ---- resident token
    private Map<String, Object> tokenView(String token) {
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("token", token);
        o.put("qr", "HSP:" + token);
        o.put("nfc", "HSP:" + token);
        return o;
    }

    public Map<String, Object> myToken(User u) {
        Map<String, Object> t = db.one("SELECT token FROM resident_tokens WHERE user_id=?", u.id());
        if (t == null) {
            try {
                db.update("INSERT INTO resident_tokens(user_id,token,created_at) VALUES(?,?,?)", u.id(), hexToken(), TimeUtil.nowUtc());
            } catch (DuplicateKeyException ignored) {
                // created concurrently
            }
            t = db.one("SELECT token FROM resident_tokens WHERE user_id=?", u.id());
        }
        return tokenView((String) t.get("token"));
    }

    public Map<String, Object> rotateToken(User u) {
        String token = hexToken();
        int n = db.update("UPDATE resident_tokens SET token=?, created_at=? WHERE user_id=?", token, TimeUtil.nowUtc(), u.id());
        if (n == 0) db.update("INSERT INTO resident_tokens(user_id,token,created_at) VALUES(?,?,?)", u.id(), token, TimeUtil.nowUtc());
        audit.log(u.id(), "resident_token", u.id(), "rotated", null);
        return tokenView(token);
    }

    // ---- verify
    private static Map<String, Object> result(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    private Map<String, Object> deny(long gid, String reason, Map<String, Object> p) {
        if (p == null) {
            glog("unknown", null, null, "denied", reason, gid);
            return result("result", "denied", "reason", reason);
        }
        glog("visitor", (String) p.get("visitor_name"), (String) p.get("flat"), "denied", reason, gid);
        return result("result", "denied", "reason", reason, "kind", "visitor", "name", p.get("visitor_name"), "flat", p.get("flat"), "purpose", p.get("purpose"));
    }

    public Map<String, Object> verify(User guard, Body b) {
        long gid = guard.id();
        JsonNode tn = b.get("token"), cn = b.get("code");
        boolean hasToken = tn.isTextual() && !tn.asText().strip().isEmpty();
        boolean hasCode = (cn.isTextual() || cn.isNumber()) && !cn.asText().strip().isEmpty();
        if (!hasToken && !hasCode) throw new ApiException(400, "Provide a code or a token");
        long denied = db.count("SELECT COUNT(*) FROM gate_log WHERE guard_id=? AND result='denied' AND created_at >= ?", gid, TimeUtil.nowUtc().minusMinutes(10));
        if (denied >= VERIFY_MAX_DENIED) throw new ApiException(429, "Too many failed checks. Wait a few minutes and try again.");
        Map<String, Object> pass;
        if (hasToken) {
            String tok = tn.asText().strip().replaceFirst("(?i)^HSP:", "").strip();
            if (tok.length() > 64) tok = tok.substring(0, 64);
            pass = db.one("SELECT * FROM gate_passes WHERE token=?", tok);
            if (pass == null) {
                Map<String, Object> rt = db.one("SELECT u.* FROM resident_tokens t JOIN users u ON u.id=t.user_id WHERE t.token=?", tok);
                if (rt != null && "approved".equals(rt.get("status")) && "resident".equals(rt.get("role"))) {
                    glog("resident", (String) rt.get("name"), (String) rt.get("flat"), "allowed", null, gid);
                    return result("result", "allowed", "kind", "resident", "name", rt.get("name"), "flat", rt.get("flat"));
                }
                return deny(gid, "unknown", null);
            }
        } else {
            String code = cn.asText().strip();
            if (code.length() > 12) code = code.substring(0, 12);
            if (!code.matches("\\d{6}")) return deny(gid, "unknown", null);
            pass = db.one("SELECT * FROM gate_passes WHERE code=? ORDER BY CASE WHEN status='active' THEN 0 ELSE 1 END, id DESC LIMIT 1", code);
            if (pass == null) return deny(gid, "unknown", null);
        }
        String status = (String) pass.get("status");
        if ("cancelled".equals(status)) return deny(gid, "cancelled", pass);
        if ("used".equals(status)) return deny(gid, "used", pass);
        LocalDateTime now = TimeUtil.nowUtc();
        String nowStr = TimeUtil.format(now);
        if (nowStr.compareTo((String) pass.get("valid_from")) < 0) return deny(gid, "not_yet_valid", pass);
        if (nowStr.compareTo((String) pass.get("valid_until")) > 0) return deny(gid, "expired", pass);
        long pid = ((Number) pass.get("id")).longValue();
        int changed = db.update("UPDATE gate_passes SET status='used', used_at=?, used_by=? WHERE id=? AND status='active'", now, gid, pid);
        if (changed == 0) return deny(gid, "used", pass);
        glog("visitor", (String) pass.get("visitor_name"), (String) pass.get("flat"), "allowed", null, gid);
        audit.log(gid, "gate_pass", pid, "used", pass.get("visitor_name") + " flat " + pass.get("flat"));
        notifications.notify(((Number) pass.get("created_by")).longValue(), "Your visitor " + pass.get("visitor_name") + " has entered");
        return result("result", "allowed", "kind", "visitor", "name", pass.get("visitor_name"), "flat", pass.get("flat"), "purpose", pass.get("purpose"));
    }

    // ---- log and overview
    public List<Map<String, Object>> log() {
        return db.list("SELECT l.id,l.kind,l.subject,l.flat,l.result,l.reason,u.name AS guard_name,l.created_at "
                + "FROM gate_log l LEFT JOIN users u ON u.id=l.guard_id ORDER BY l.id DESC LIMIT 100");
    }

    public Map<String, Object> overview() {
        LocalDateTime start = TimeUtil.nowUtc().toLocalDate().atStartOfDay(), end = start.plusDays(1);
        List<Map<String, Object>> today = db.list("SELECT kind,result,created_at FROM gate_log WHERE created_at >= ? AND created_at < ?", start, end);
        long allowed = 0, denied = 0, visitors = 0, residents = 0;
        long[] hours = new long[24];
        for (Map<String, Object> r : today) {
            boolean ok = "allowed".equals(r.get("result"));
            if (ok) allowed++;
            if ("denied".equals(r.get("result"))) denied++;
            if (ok && "visitor".equals(r.get("kind"))) visitors++;
            if (ok && "resident".equals(r.get("kind"))) residents++;
            hours[Integer.parseInt(((String) r.get("created_at")).substring(11, 13))]++;
        }
        List<Map<String, Object>> byHour = new ArrayList<>();
        for (int h = 0; h < 24; h++) byHour.add(result("hour", h, "n", hours[h]));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("today", result("allowed", allowed, "denied", denied, "visitors", visitors, "residents", residents));
        out.put("active_passes", db.count("SELECT COUNT(*) FROM gate_passes WHERE status='active' AND valid_until>=?", TimeUtil.nowUtc()));
        out.put("inside", visitors);
        out.put("recent", db.list("SELECT l.kind,l.subject,l.flat,l.result,l.reason,u.name AS guard_name,l.created_at "
                + "FROM gate_log l LEFT JOIN users u ON u.id=l.guard_id ORDER BY l.id DESC LIMIT 20"));
        out.put("by_hour", byHour);
        return out;
    }
}
