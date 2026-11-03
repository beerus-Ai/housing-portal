package com.sahyadri.portal.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.repository.Db;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import com.sahyadri.portal.support.Js;
import com.sahyadri.portal.support.TimeUtil;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

@Service
public class EmergencyService {
    static final List<String> TYPES = List.of("lift", "medical", "fire", "theft", "threat", "violence", "other");
    private static final String SELECT = "SELECT e.id, e.type, e.note, e.status, u.flat, u.name AS user_name, e.created_at, e.resolved_at "
            + "FROM emergencies e JOIN users u ON u.id=e.user_id";

    private final Db db;
    private final AuditService audit;
    private final NotificationService notifications;

    public EmergencyService(Db db, AuditService audit, NotificationService notifications) {
        this.db = db;
        this.audit = audit;
        this.notifications = notifications;
    }

    public long raise(User u, Body b) {
        String type = b.text("type");
        if (type == null || !TYPES.contains(type)) throw new ApiException(400, "Choose a valid emergency type");
        JsonNode n = b.get("note");
        if (!Js.nullish(n) && !n.isTextual()) throw new ApiException(400, "Note must be text");
        String note = Js.nullish(n) ? "" : n.asText().strip();
        if (note.length() > 500) throw new ApiException(400, "Note must be 500 characters or fewer");
        long recent = db.count("SELECT COUNT(*) FROM emergencies WHERE user_id=? AND created_at >= ?", u.id(), TimeUtil.nowUtc().minusHours(1));
        if (recent >= 5) throw new ApiException(429, "Emergency limit reached: at most 5 alerts per hour. Please call the security desk directly.");
        long id = db.insert("INSERT INTO emergencies(user_id,type,note,created_at) VALUES(?,?,?,?)", u.id(), type, note.isEmpty() ? null : note, TimeUtil.nowUtc());
        audit.log(u.id(), "emergency", id, "raised", type);
        String label = type.substring(0, 1).toUpperCase() + type.substring(1);
        String flat = u.flat() == null || u.flat().isEmpty() ? "n/a" : u.flat();
        notifications.notifyAdmins("EMERGENCY (" + label + ") from flat " + flat + (note.isEmpty() ? "" : ": " + note));
        return id;
    }

    public List<Map<String, Object>> list(User u) {
        if (u.isAdmin()) return db.list(SELECT + " ORDER BY e.id DESC");
        return db.list(SELECT + " WHERE u.flat=? ORDER BY e.id DESC", u.flat());
    }

    public void resolve(User actor, String idStr) {
        Map<String, Object> e = Js.id(idStr).map(i -> db.one("SELECT * FROM emergencies WHERE id=?", i)).orElse(null);
        if (e == null) throw new ApiException(404, "Emergency not found");
        if ("resolved".equals(e.get("status"))) throw new ApiException(409, "Emergency is already resolved");
        long id = ((Number) e.get("id")).longValue();
        db.update("UPDATE emergencies SET status='resolved', resolved_at=?, resolved_by=? WHERE id=?", TimeUtil.nowUtc(), actor.id(), id);
        audit.log(actor.id(), "emergency", id, "resolved", (String) e.get("type"));
        notifications.notify(((Number) e.get("user_id")).longValue(), "Your " + e.get("type") + " emergency alert has been marked resolved by the committee");
    }
}
