package com.sahyadri.portal.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.repository.RequestRepository;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.repository.VendorRepository;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import com.sahyadri.portal.support.Ids;
import com.sahyadri.portal.support.Text;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/** Work requests: raise, list, detail, comments, assign, forward-only status, owner rating. */
@Service
public class RequestService {
    public static final List<String> CATEGORIES = List.of("plumbing", "electrical", "lift", "security", "housekeeping", "other");
    public static final List<String> STATUSES = List.of("open", "assigned", "in_progress", "closed");

    private final RequestRepository repo;
    private final VendorRepository vendors;
    private final AuditService audit;
    private final NotificationService notifications;
    private final PhotoStore photos;

    public RequestService(RequestRepository repo, VendorRepository vendors, AuditService audit,
                          NotificationService notifications, PhotoStore photos) {
        this.repo = repo;
        this.vendors = vendors;
        this.audit = audit;
        this.notifications = notifications;
        this.photos = photos;
    }

    private static long num(Object o) {
        return o == null ? -1 : ((Number) o).longValue();
    }

    private static boolean sameFlat(User u, Map<String, Object> r) {
        return u.flat() != null && !u.flat().isEmpty() && u.flat().equals(r.get("flat"));
    }

    /** Residents see their own requests and any request from their own flat; the committee sees all. */
    static boolean canSee(User u, Map<String, Object> r) {
        return u.isAdmin() || num(r.get("user_id")) == u.id() || sameFlat(u, r);
    }

    /** The requester rates, except a family member's request, which the flat owner rates. Family never rates. */
    static boolean canRate(User u, Map<String, Object> r) {
        Object rating = r.get("rating");
        boolean unrated = rating == null || ((Number) rating).intValue() == 0;
        return !u.isAdmin() && "closed".equals(r.get("status")) && unrated
                && ((num(r.get("user_id")) == u.id() && !"family".equals(u.residentType()))
                || ("owner".equals(u.residentType()) && u.flat() != null && u.flat().equals(r.get("flat"))));
    }

    private static Map<String, Object> shape(Map<String, Object> r, User u) {
        Map<String, Object> out = new LinkedHashMap<>(r);
        Object photo = out.remove("photo");
        out.put("has_photo", photo != null && !photo.toString().isEmpty());
        out.put("can_rate", u != null && canRate(u, r));
        return out;
    }

    private Map<String, Object> visible(User u, String idStr) {
        Map<String, Object> r = repo.find(Ids.parse(idStr));
        if (r == null || !canSee(u, r)) throw new ApiException(404, "Request not found");
        return r;
    }

    @Transactional
    public long create(User u, String category, String title, String description, MultipartFile photo) {
        String stored = null;
        if (photo != null) stored = photos.save(photo); // validates type, size and magic bytes (400)
        if (!CATEGORIES.contains(category) || title.isEmpty()) {
            photos.delete(stored);
            throw new ApiException(400, "Valid category and title are required");
        }
        long id = repo.insert(u.id(), category, title, description, stored);
        audit.log(u.id(), "request", id, "created", category + ": " + title);
        notifications.notifyAdmins("New " + category + " request from flat " + u.flat() + ": " + title);
        return id;
    }

    public List<Map<String, Object>> list(User u, String status, String category) {
        return repo.search(u.isAdmin() ? null : u.id(), u.flat(),
                status != null && STATUSES.contains(status) ? status : null,
                category != null && CATEGORIES.contains(category) ? category : null)
                .stream().map(r -> shape(r, u)).toList();
    }

    public Map<String, Object> detail(User u, String id) {
        Map<String, Object> r = visible(u, id);
        Map<String, Object> out = shape(r, u);
        out.put("history", repo.history(num(r.get("id"))));
        return out;
    }

    public Map<String, Object> photoOf(User u, String id) {
        Map<String, Object> r = repo.find(Ids.parse(id));
        if (r == null || r.get("photo") == null || !canSee(u, r)) return null;
        return r;
    }

    public List<Map<String, Object>> comments(User u, String id) {
        return repo.comments(num(visible(u, id).get("id")));
    }

    @Transactional
    public long comment(User u, String id, Body b) {
        Map<String, Object> r = visible(u, id);
        String body = b.str("body", 1000);
        if (body.isEmpty()) throw new ApiException(400, "Write a message first");
        long rid = num(r.get("id"));
        long cid = repo.insertComment(rid, u.id(), body);
        audit.log(u.id(), "request", rid, "commented", Text.slice(body, 80));
        if (u.isAdmin()) {
            if (num(r.get("user_id")) != u.id()) notifications.notify(num(r.get("user_id")), "The committee replied on \"" + r.get("title") + "\"");
        } else {
            notifications.notifyAdmins("New message on request \"" + r.get("title") + "\" from flat " + u.flat());
        }
        return cid;
    }

    @Transactional
    public void assign(User u, String id, Body b) {
        Map<String, Object> r = repo.findRaw(Ids.parse(id));
        Map<String, Object> v = vendors.find(Ids.parse(b.get("vendor_id")));
        if (r == null || v == null) throw new ApiException(404, "Request or vendor not found");
        if ("closed".equals(r.get("status"))) throw new ApiException(409, "Request is closed");
        long rid = num(r.get("id"));
        repo.assign(rid, num(v.get("id")));
        audit.log(u.id(), "request", rid, "assigned", (String) v.get("name"));
        notifications.notify(num(r.get("user_id")), "Your request \"" + r.get("title") + "\" was assigned to " + v.get("name"));
    }

    @Transactional
    public void changeStatus(User u, String id, Body b) {
        Map<String, Object> r = repo.findRaw(Ids.parse(id));
        JsonNode sn = b.get("status");
        String s = sn.isTextual() ? sn.asText() : null;
        if (r == null) throw new ApiException(404, "Request not found");
        if (s == null || !STATUSES.contains(s)) throw new ApiException(400, "Invalid status");
        String cur = (String) r.get("status");
        if ("closed".equals(cur)) throw new ApiException(409, "Request is already closed");
        if (STATUSES.indexOf(s) <= STATUSES.indexOf(cur)) throw new ApiException(409, "Cannot move from " + cur + " to " + s);
        if (r.get("vendor_id") == null) throw new ApiException(409, "Assign a vendor first");
        long rid = num(r.get("id"));
        repo.setStatus(rid, s);
        String note = b.str("note", 300);
        audit.log(u.id(), "request", rid, "status", cur + " -> " + s + (note.isEmpty() ? "" : ": " + note));
        notifications.notify(num(r.get("user_id")), "Your request \"" + r.get("title") + "\" is now " + s.replace('_', ' '));
    }

    /** JS Number(x): numbers as is, numeric strings parsed, blank string 0, anything else NaN. */
    private static double jsNumber(JsonNode n) {
        if (n.isNumber()) return n.asDouble();
        if (n.isTextual()) {
            String t = n.asText().strip();
            if (t.isEmpty()) return 0;
            try {
                return Double.parseDouble(t);
            } catch (NumberFormatException e) {
                return Double.NaN;
            }
        }
        if (n.isBoolean()) return n.asBoolean() ? 1 : 0;
        if (n.isNull()) return 0;
        return Double.NaN;
    }

    @Transactional
    public void rate(User u, String id, Body b) {
        Map<String, Object> r = visible(u, id);
        double n = b.has("rating") ? jsNumber(b.get("rating")) : Double.NaN;
        if (!"closed".equals(r.get("status"))) throw new ApiException(409, "You can rate only closed requests");
        Object existing = r.get("rating");
        if (existing != null && ((Number) existing).intValue() != 0) throw new ApiException(409, "Already rated");
        if (!canRate(u, r)) throw new ApiException(403, "The flat owner rates the work");
        if (Double.isNaN(n) || n != Math.rint(n) || n < 1 || n > 5) throw new ApiException(400, "Rating must be 1 to 5");
        long rid = num(r.get("id"));
        repo.rate(rid, (int) n, b.str("comment", 500));
        audit.log(u.id(), "request", rid, "rated", String.valueOf((int) n));
        if (num(r.get("user_id")) != u.id()) {
            notifications.notify(num(r.get("user_id")), "Your request \"" + r.get("title") + "\" was rated " + (int) n + " of 5 by the flat owner");
        }
    }
}
