package com.sahyadri.portal.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.repository.Db;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import com.sahyadri.portal.support.Js;
import com.sahyadri.portal.support.Text;
import com.sahyadri.portal.support.TimeUtil;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Vehicles, parking slots and the staff (workers) register. */
@Service
public class EstateService {
    private static final List<String> VEHICLE_TYPES = List.of("car", "bike", "scooter", "other");
    private static final int MAX_VEHICLES_PER_FLAT = 6;
    private static final Pattern PLATE = Pattern.compile("^[A-Z0-9 -]{4,15}$");
    private static final List<String> SLOT_KINDS = List.of("car", "bike", "visitor");
    private static final Pattern PREFIX = Pattern.compile("^[A-Za-z0-9-]{0,10}$");
    private static final List<String> WORKER_ROLES = List.of("security", "housekeeping", "maintenance", "gardener", "other");
    private static final String VEHICLE_SELECT = "SELECT v.id, v.flat, u.name AS owner_name, v.plate, v.type, v.make, v.color, v.sticker, v.created_at "
            + "FROM vehicles v LEFT JOIN users u ON u.id=v.user_id";
    private static final String SLOT_SELECT = "SELECT s.id, s.code, s.level, s.kind, s.flat, s.vehicle_id, v.plate FROM parking_slots s LEFT JOIN vehicles v ON v.id=s.vehicle_id";

    private final Db db;
    private final AuditService audit;
    private final NotificationService notifications;

    public EstateService(Db db, AuditService audit, NotificationService notifications) {
        this.db = db;
        this.audit = audit;
        this.notifications = notifications;
    }

    private static boolean hasFlat(User u) {
        return "resident".equals(u.role()) && u.flat() != null && !u.flat().isEmpty();
    }

    private static ApiException residentsOnly() {
        return new ApiException(403, "Only residents with a flat can use this");
    }

    private static String plateKey(String p) {
        return p.replaceAll("[\\s-]", "");
    }

    private boolean residentFlat(String f) {
        return db.one("SELECT 1 AS x FROM users WHERE flat=? AND role='resident' AND status='approved' LIMIT 1", f) != null;
    }

    private List<Map<String, Object>> flatResidents(String f) {
        return db.list("SELECT id FROM users WHERE flat=? AND role='resident' AND status='approved'", f);
    }

    // ---- vehicles
    public List<Map<String, Object>> vehicles(User u, String qParam) {
        if (u.isAdmin()) {
            String term = qParam == null ? "" : Text.slice(qParam.strip(), 100);
            if (term.isEmpty()) return db.list(VEHICLE_SELECT + " ORDER BY v.id DESC");
            String like = "%" + term.replaceAll("([\\\\%_])", "\\\\$1") + "%";
            return db.list(VEHICLE_SELECT + " WHERE LOWER(v.plate) LIKE LOWER(?) ESCAPE '\\' OR LOWER(v.flat) LIKE LOWER(?) ESCAPE '\\' "
                    + "OR LOWER(u.name) LIKE LOWER(?) ESCAPE '\\' ORDER BY v.id DESC", like, like, like);
        }
        if (!hasFlat(u)) throw residentsOnly();
        return db.list(VEHICLE_SELECT + " WHERE v.flat=? ORDER BY v.id DESC", u.flat());
    }

    private static String lim(Body b, String key, int max) {
        JsonNode v = b.get(key);
        if (Js.nullish(v)) return "";
        return v.isTextual() && v.asText().strip().length() <= max ? v.asText().strip() : null;
    }

    public long addVehicle(User u, Body b) {
        boolean isAdmin = u.isAdmin();
        if (!isAdmin && !hasFlat(u)) throw residentsOnly();
        String flat = u.flat();
        if (isAdmin) {
            flat = b.str("flat", 20);
            if (flat.isEmpty() || !residentFlat(flat)) throw new ApiException(400, "Choose an existing resident flat");
        }
        String plate = b.get("plate").isTextual() ? b.get("plate").asText().strip().toUpperCase(Locale.ROOT) : "";
        if (!PLATE.matcher(plate).matches() || plateKey(plate).length() < 3) {
            throw new ApiException(400, "Plate must be 4 to 15 characters: letters, digits, spaces or dashes");
        }
        JsonNode tv = b.get("type");
        String type = Js.nullish(tv) || (tv.isTextual() && tv.asText().isEmpty()) ? "car" : (tv.isTextual() ? tv.asText() : null);
        if (type == null || !VEHICLE_TYPES.contains(type)) throw new ApiException(400, "Choose car, bike, scooter or other");
        String make = lim(b, "make", 40), color = lim(b, "color", 40), sticker = lim(b, "sticker", 20);
        if (make == null || color == null) throw new ApiException(400, "Make and color must be 40 characters or fewer");
        if (sticker == null) throw new ApiException(400, "Sticker must be 20 characters or fewer");
        if (!isAdmin && db.count("SELECT COUNT(*) FROM vehicles WHERE flat=?", flat) >= MAX_VEHICLES_PER_FLAT) {
            throw new ApiException(409, "A flat can register at most " + MAX_VEHICLES_PER_FLAT + " vehicles");
        }
        if (db.one("SELECT id FROM vehicles WHERE plate_key=?", plateKey(plate)) != null) throw new ApiException(409, "This plate is already registered");
        long id = db.insert("INSERT INTO vehicles(flat,user_id,plate,plate_key,type,make,color,sticker,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
                flat, isAdmin ? null : u.id(), plate, plateKey(plate), type, make.isEmpty() ? null : make, color.isEmpty() ? null : color,
                sticker.isEmpty() ? null : sticker, TimeUtil.nowUtc());
        audit.log(u.id(), "vehicle", id, "created", plate + " flat " + flat);
        return id;
    }

    @Transactional
    public void deleteVehicle(User u, String idStr) {
        Map<String, Object> v = Js.id(idStr).map(i -> db.one("SELECT * FROM vehicles WHERE id=?", i)).orElse(null);
        if (v == null || (!u.isAdmin() && !Objects.equals(v.get("flat"), u.flat()))) throw new ApiException(404, "Vehicle not found");
        long id = ((Number) v.get("id")).longValue();
        int freed = db.update("UPDATE parking_slots SET flat=NULL, vehicle_id=NULL WHERE vehicle_id=?", id);
        db.update("DELETE FROM vehicles WHERE id=?", id);
        audit.log(u.id(), "vehicle", id, "deleted", v.get("plate") + " flat " + v.get("flat") + (freed > 0 ? "; freed " + freed + " slot(s)" : ""));
    }

    // ---- parking
    public Map<String, Object> parking(User u) {
        long total = db.count("SELECT COUNT(*) FROM parking_slots");
        long assigned = db.count("SELECT COUNT(flat) FROM parking_slots");
        Map<String, Object> summary = new LinkedHashMap<>();
        summary.put("total", total);
        summary.put("assigned", assigned);
        summary.put("free", total - assigned);
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("summary", summary);
        if (u.isAdmin()) {
            out.put("slots", db.list(SLOT_SELECT + " ORDER BY s.code"));
        } else {
            if (!hasFlat(u)) throw residentsOnly();
            out.put("slots", db.list(SLOT_SELECT + " WHERE s.flat=? ORDER BY s.code", u.flat()));
        }
        return out;
    }

    @Transactional
    public Map<String, Object> createSlots(User actor, Body b) {
        JsonNode pv = b.get("prefix");
        if (!Js.nullish(pv) && !pv.isTextual()) throw new ApiException(400, "Prefix can have up to 10 letters, digits or dashes");
        String pre = Js.nullish(pv) ? "" : pv.asText().strip();
        if (!PREFIX.matcher(pre).matches()) throw new ApiException(400, "Prefix can have up to 10 letters, digits or dashes");
        double fromD = b.has("from") && !b.get("from").isNull() ? Js.number(b.get("from")) : 1;
        double countD = Js.number(b.get("count"));
        if (!Js.isInteger(fromD) || fromD < 0 || fromD > 99999) throw new ApiException(400, "Start number must be a whole number from 0 to 99999");
        if (!Js.isInteger(countD) || countD < 1 || countD > 200) throw new ApiException(400, "Count must be from 1 to 200");
        long from = (long) fromD;
        int count = (int) countD;
        JsonNode kv = b.get("kind");
        String kind = Js.nullish(kv) || (kv.isTextual() && kv.asText().isEmpty()) ? "car" : (kv.isTextual() ? kv.asText() : null);
        if (kind == null || !SLOT_KINDS.contains(kind)) throw new ApiException(400, "Kind must be car, bike or visitor");
        JsonNode lv = b.get("level");
        if (!Js.nullish(lv) && (!lv.isTextual() || lv.asText().strip().length() > 20)) throw new ApiException(400, "Level must be 20 characters or fewer");
        String levelText = Js.nullish(lv) ? "" : lv.asText().strip();
        String level = levelText.isEmpty() ? null : levelText;
        int width = Math.max(2, String.valueOf(from + count - 1).length());
        int created = 0;
        for (int i = 0; i < count; i++) {
            String code = pre + String.format("%0" + width + "d", from + i);
            if (db.one("SELECT id FROM parking_slots WHERE code=?", code) != null) continue;
            db.insert("INSERT INTO parking_slots(code,level,kind,created_at) VALUES(?,?,?,?)", code, level, kind, TimeUtil.nowUtc());
            created++;
        }
        audit.log(actor.id(), "parking", null, "slots_created", pre + String.format("%0" + width + "d", from) + " x" + count + ", " + kind + ": "
                + created + " created, " + (count - created) + " skipped");
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("created", created);
        out.put("skipped", count - created);
        return out;
    }

    private Map<String, Object> slot(String idStr) {
        Map<String, Object> s = Js.id(idStr).map(i -> db.one("SELECT * FROM parking_slots WHERE id=?", i)).orElse(null);
        if (s == null) throw new ApiException(404, "Slot not found");
        return s;
    }

    private static boolean assigned(Map<String, Object> s) {
        return s.get("flat") != null && !((String) s.get("flat")).isEmpty();
    }

    public void assign(User actor, String idStr, Body b) {
        Map<String, Object> s = slot(idStr);
        String flat = b.str("flat", 20);
        if (flat.isEmpty() || !residentFlat(flat)) throw new ApiException(400, "Choose an existing resident flat");
        Long vid = null;
        JsonNode rv = b.get("vehicle_id");
        if (!Js.nullish(rv) && !(rv.isTextual() && rv.asText().isEmpty())) {
            Map<String, Object> v = null;
            if (rv.isIntegralNumber()) v = db.one("SELECT * FROM vehicles WHERE id=?", rv.asLong());
            else if (rv.isTextual()) v = Js.id(rv.asText()).map(i -> db.one("SELECT * FROM vehicles WHERE id=?", i)).orElse(null);
            if (v == null || !Objects.equals(v.get("flat"), flat)) throw new ApiException(400, "That vehicle does not belong to this flat");
            vid = ((Number) v.get("id")).longValue();
        }
        if (assigned(s)) throw new ApiException(409, "Slot is already assigned. Free it first.");
        long sid = ((Number) s.get("id")).longValue();
        db.update("UPDATE parking_slots SET flat=?, vehicle_id=? WHERE id=?", flat, vid, sid);
        audit.log(actor.id(), "parking", sid, "assigned", s.get("code") + " -> flat " + flat + (vid != null ? " vehicle " + vid : ""));
        for (Map<String, Object> r : flatResidents(flat)) {
            notifications.notify(((Number) r.get("id")).longValue(), "Parking slot " + s.get("code") + " was assigned to your flat");
        }
    }

    public void free(User actor, String idStr) {
        Map<String, Object> s = slot(idStr);
        if (!assigned(s)) throw new ApiException(409, "Slot is already free");
        long sid = ((Number) s.get("id")).longValue();
        db.update("UPDATE parking_slots SET flat=NULL, vehicle_id=NULL WHERE id=?", sid);
        audit.log(actor.id(), "parking", sid, "freed", s.get("code") + " from flat " + s.get("flat"));
        for (Map<String, Object> r : flatResidents((String) s.get("flat"))) {
            notifications.notify(((Number) r.get("id")).longValue(), "Parking slot " + s.get("code") + " was released from your flat");
        }
    }

    public void deleteSlot(User actor, String idStr) {
        Map<String, Object> s = slot(idStr);
        if (assigned(s)) throw new ApiException(409, "Free the slot before removing it");
        long sid = ((Number) s.get("id")).longValue();
        db.update("DELETE FROM parking_slots WHERE id=?", sid);
        audit.log(actor.id(), "parking", sid, "slot_deleted", (String) s.get("code"));
    }

    // ---- workers
    private static final class Worker {
        String name = "", role = "other", phone = "", shift = "", status = "active", notes = "";
    }

    /** Port of workerFields(): applies the fields present in the body onto w, returning an error message or null. */
    private static String applyWorker(Body b, Worker w) {
        String[] holder = new String[1];
        if (!txt(b, "name", 100, holder, w.name) || (w.name = holder[0]).isEmpty()) return "Name is required (up to 100 characters)";
        if (b.has("role")) {
            String r = b.text("role");
            if (r == null || !WORKER_ROLES.contains(r)) return "Unknown role";
            w.role = r;
        }
        if (b.has("status")) {
            String s = b.text("status");
            if (s == null || !(s.equals("active") || s.equals("inactive"))) return "Status must be 'active' or 'inactive'";
            w.status = s;
        }
        if (!txt(b, "phone", 20, holder, w.phone) || !(w.phone = holder[0]).isEmpty() && !ContactService.PHONE.matcher(w.phone).matches()) {
            return "Enter a valid phone number";
        }
        if (!txt(b, "shift", 40, holder, w.shift)) return "Shift must be 40 characters or fewer";
        w.shift = holder[0];
        if (!txt(b, "notes", 300, holder, w.notes)) return "Notes must be 300 characters or fewer";
        w.notes = holder[0];
        return null;
    }

    /** JS txt(): absent keeps the current value; present must be a string of at most max chars after trimming. */
    private static boolean txt(Body b, String key, int max, String[] out, String current) {
        out[0] = current;
        if (!b.has(key)) return true;
        JsonNode v = b.get(key);
        if (!v.isTextual() || v.asText().strip().length() > max) return false;
        out[0] = v.asText().strip();
        return true;
    }

    private static String orNull(String s) {
        return s == null || s.isEmpty() ? null : s;
    }

    public List<Map<String, Object>> workers() {
        return db.list("SELECT id,name,role,phone,shift,status,notes FROM workers ORDER BY status, name");
    }

    public long addWorker(User actor, Body b) {
        Worker w = new Worker();
        String err = applyWorker(b, w);
        if (err != null) throw new ApiException(400, err);
        long id = db.insert("INSERT INTO workers(name,role,phone,shift,status,notes,created_at) VALUES(?,?,?,?,?,?,?)",
                w.name, w.role, orNull(w.phone), orNull(w.shift), w.status, orNull(w.notes), TimeUtil.nowUtc());
        audit.log(actor.id(), "worker", id, "created", w.name + " (" + w.role + ")");
        return id;
    }

    public void updateWorker(User actor, String idStr, Body b) {
        Map<String, Object> cur = Js.id(idStr).map(i -> db.one("SELECT * FROM workers WHERE id=?", i)).orElse(null);
        if (cur == null) throw new ApiException(404, "Worker not found");
        Worker w = new Worker();
        w.name = (String) cur.get("name");
        w.role = (String) cur.get("role");
        w.status = (String) cur.get("status");
        w.phone = cur.get("phone") == null ? "" : (String) cur.get("phone");
        w.shift = cur.get("shift") == null ? "" : (String) cur.get("shift");
        w.notes = cur.get("notes") == null ? "" : (String) cur.get("notes");
        String err = applyWorker(b, w);
        if (err != null) throw new ApiException(400, err);
        long id = ((Number) cur.get("id")).longValue();
        db.update("UPDATE workers SET name=?, role=?, phone=?, shift=?, status=?, notes=? WHERE id=?",
                w.name, w.role, orNull(w.phone), orNull(w.shift), w.status, orNull(w.notes), id);
        audit.log(actor.id(), "worker", id, "updated", w.name);
    }

    public void deleteWorker(User actor, String idStr) {
        Map<String, Object> w = Js.id(idStr).map(i -> db.one("SELECT * FROM workers WHERE id=?", i)).orElse(null);
        if (w == null) throw new ApiException(404, "Worker not found");
        long id = ((Number) w.get("id")).longValue();
        db.update("DELETE FROM workers WHERE id=?", id);
        audit.log(actor.id(), "worker", id, "deleted", (String) w.get("name"));
    }
}
