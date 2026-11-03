package com.sahyadri.portal.repository;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Repository;

/** Read-only queries behind the committee dashboard, the CSV export and the live-update pulse. */
@Repository
public class ReportRepository {
    private final Db db;

    public ReportRepository(Db db) {
        this.db = db;
    }

    public List<Map<String, Object>> byStatus() {
        return db.list("SELECT status, COUNT(*) AS n FROM requests GROUP BY status ORDER BY status");
    }

    public List<Map<String, Object>> byCategoryOpen() {
        return db.list("SELECT category, COUNT(*) AS n FROM requests WHERE status!='closed' GROUP BY category ORDER BY category");
    }

    public long pendingUsers() {
        return db.count("SELECT COUNT(*) FROM users WHERE status='pending'");
    }

    public Number avgRating() {
        return (Number) db.one("SELECT AVG(rating) AS a FROM requests WHERE rating IS NOT NULL").get("a");
    }

    public List<Map<String, Object>> oldestOpen() {
        return db.list("SELECT id,title,category,created_at FROM requests WHERE status!='closed' ORDER BY id LIMIT 5");
    }

    /** Slim rows; the time-based buckets are computed in Java so the SQL stays portable. */
    public List<Map<String, Object>> requestTimes() {
        return db.list("SELECT category, status, created_at, updated_at FROM requests");
    }

    public List<Map<String, Object>> vendorRatings() {
        return db.list("SELECT v.id, v.name, v.trade, AVG(r.rating) AS avg, COUNT(r.rating) AS n FROM vendors v "
                + "LEFT JOIN requests r ON r.vendor_id=v.id AND r.rating IS NOT NULL GROUP BY v.id, v.name, v.trade ORDER BY v.id");
    }

    public long unassigned() {
        return db.count("SELECT COUNT(*) FROM requests WHERE vendor_id IS NULL AND status!='closed'");
    }

    public long awaitingRating() {
        return db.count("SELECT COUNT(*) FROM requests WHERE status='closed' AND rating IS NULL");
    }

    public long noticesSince(LocalDateTime t) {
        return db.count("SELECT COUNT(*) FROM notices WHERE created_at >= ?", t);
    }

    public long households() {
        return db.count("SELECT COUNT(DISTINCT flat) FROM users WHERE status='approved' AND role!='admin'");
    }

    public List<Map<String, Object>> exportRows() {
        return db.list(RequestRepository.SELECT + " ORDER BY r.id");
    }

    public long maxId(String table) {
        return db.count("SELECT COALESCE(MAX(id),0) FROM " + table); // table is a fixed literal at every call site
    }

    public long maxNotificationId(long userId) {
        return db.count("SELECT COALESCE(MAX(id),0) FROM notifications WHERE user_id=?", userId);
    }

    public long approvedInFlat(String flat) {
        return db.count("SELECT COUNT(*) FROM users WHERE flat=? AND status='approved'", flat);
    }

    public Map<String, Object> residentRequestSummary(long userId, String flat) {
        return db.one("SELECT COUNT(*) AS n, MAX(r.updated_at) AS m, COALESCE(SUM(CASE WHEN r.rating IS NOT NULL THEN 1 ELSE 0 END),0) AS rated "
                + "FROM requests r JOIN users x ON x.id=r.user_id WHERE r.user_id=? OR x.flat=?", userId, flat);
    }
}
