package com.sahyadri.portal.repository;

import com.sahyadri.portal.support.TimeUtil;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Repository;

/** Requests and their comments (parameterised SQL only). */
@Repository
public class RequestRepository {
    /** Same projection as REQ_SELECT in app.js. */
    public static final String SELECT = "SELECT r.*, u.name AS resident_name, u.flat, v.name AS vendor_name FROM requests r "
            + "JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id";

    private final Db db;

    public RequestRepository(Db db) {
        this.db = db;
    }

    public long insert(long userId, String category, String title, String description, String photo) {
        return insert(userId, category, title, description, photo, "app");
    }

    public long insert(long userId, String category, String title, String description, String photo, String source) {
        var now = TimeUtil.nowUtc();
        return db.insert("INSERT INTO requests(user_id,category,title,description,photo,source,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?)",
                userId, category, title, description, photo, source, now, now);
    }

    public List<Map<String, Object>> search(Long visibleToUser, String flat, String status, String category) {
        List<String> where = new ArrayList<>();
        List<Object> p = new ArrayList<>();
        if (visibleToUser != null) {
            where.add("(r.user_id=? OR u.flat=?)");
            p.add(visibleToUser);
            p.add(flat == null ? "" : flat);
        }
        if (status != null) {
            where.add("r.status=?");
            p.add(status);
        }
        if (category != null) {
            where.add("r.category=?");
            p.add(category);
        }
        return db.list(SELECT + (where.isEmpty() ? "" : " WHERE " + String.join(" AND ", where)) + " ORDER BY r.id DESC", p.toArray());
    }

    public Map<String, Object> find(long id) {
        return db.one(SELECT + " WHERE r.id=?", id);
    }

    public Map<String, Object> findRaw(long id) {
        return db.one("SELECT * FROM requests WHERE id=?", id);
    }

    public List<Map<String, Object>> history(long requestId) {
        return db.list("SELECT a.action,a.detail,a.created_at,u.name AS actor FROM audit a LEFT JOIN users u ON u.id=a.actor_id "
                + "WHERE a.entity='request' AND a.entity_id=? ORDER BY a.id", requestId);
    }

    public List<Map<String, Object>> comments(long requestId) {
        return db.list("SELECT c.id,c.body,c.created_at,u.name AS author,u.role FROM comments c JOIN users u ON u.id=c.user_id "
                + "WHERE c.request_id=? ORDER BY c.id", requestId);
    }

    public long insertComment(long requestId, long userId, String body) {
        return db.insert("INSERT INTO comments(request_id,user_id,body,created_at) VALUES(?,?,?,?)", requestId, userId, body, TimeUtil.nowUtc());
    }

    public void assign(long id, long vendorId) {
        db.update("UPDATE requests SET vendor_id=?, status=CASE WHEN status='open' THEN 'assigned' ELSE status END, updated_at=? WHERE id=?",
                vendorId, TimeUtil.nowUtc(), id);
    }

    public void setStatus(long id, String status) {
        db.update("UPDATE requests SET status=?, updated_at=? WHERE id=?", status, TimeUtil.nowUtc(), id);
    }

    public void rate(long id, int rating, String comment) {
        db.update("UPDATE requests SET rating=?, rating_comment=? WHERE id=?", rating, comment, id);
    }
}
