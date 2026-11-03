package com.sahyadri.portal.service;

import com.sahyadri.portal.repository.Db;
import com.sahyadri.portal.support.TimeUtil;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

/** GET /api/admin/overview: every headline number for the committee dashboard in one call. */
@Service
public class AdminOverviewService {
    private final Db db;

    public AdminOverviewService(Db db) {
        this.db = db;
    }

    private static Map<String, Object> m(Object... kv) {
        Map<String, Object> o = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) o.put((String) kv[i], kv[i + 1]);
        return o;
    }

    public Map<String, Object> overview() {
        LocalDateTime now = TimeUtil.nowUtc();
        LocalDateTime dayStart = now.toLocalDate().atStartOfDay(), dayEnd = dayStart.plusDays(1);
        LocalDateTime d30 = now.minusDays(30);
        String today = LocalDate.now(java.time.ZoneOffset.UTC).toString();
        String in60 = LocalDate.now(java.time.ZoneOffset.UTC).plusDays(60).toString();
        String people = "role='resident'";

        Map<String, Object> residents = m(
                "approved", db.count("SELECT COUNT(*) FROM users WHERE " + people + " AND status='approved'"),
                "pending", db.count("SELECT COUNT(*) FROM users WHERE " + people + " AND status='pending'"),
                "suspended", db.count("SELECT COUNT(*) FROM users WHERE " + people + " AND status='suspended'"),
                "owners", db.count("SELECT COUNT(*) FROM users WHERE " + people + " AND status='approved' AND resident_type='owner'"),
                "tenants", db.count("SELECT COUNT(*) FROM users WHERE " + people + " AND status='approved' AND resident_type='tenant'"),
                "family", db.count("SELECT COUNT(*) FROM users WHERE " + people + " AND status='approved' AND resident_type='family'"),
                "flats", db.count("SELECT COUNT(DISTINCT flat) FROM users WHERE " + people + " AND status='approved' AND flat IS NOT NULL AND flat<>''"));
        Map<String, Object> requests = m(
                "open", db.count("SELECT COUNT(*) FROM requests WHERE status<>'closed'"),
                "unassigned", db.count("SELECT COUNT(*) FROM requests WHERE status='open' AND vendor_id IS NULL"),
                "in_progress", db.count("SELECT COUNT(*) FROM requests WHERE status='in_progress'"),
                "closed_30d", db.count("SELECT COUNT(*) FROM requests WHERE status='closed' AND updated_at >= ?", d30));
        Map<String, Object> emergencies = m(
                "active", db.count("SELECT COUNT(*) FROM emergencies WHERE status='active'"),
                "resolved_30d", db.count("SELECT COUNT(*) FROM emergencies WHERE status='resolved' AND created_at >= ?", d30));
        Map<String, Object> gate = m(
                "admitted_today", db.count("SELECT COUNT(*) FROM gate_log WHERE result='allowed' AND created_at >= ? AND created_at < ?", dayStart, dayEnd),
                "denied_today", db.count("SELECT COUNT(*) FROM gate_log WHERE result='denied' AND created_at >= ? AND created_at < ?", dayStart, dayEnd),
                "active_passes", db.count("SELECT COUNT(*) FROM gate_passes WHERE status='active' AND valid_until>=?", now),
                "guards", db.count("SELECT COUNT(*) FROM users WHERE role='guard' AND status='approved'"));
        Map<String, Object> estate = m(
                "vehicles", db.count("SELECT COUNT(*) FROM vehicles"),
                "parking_total", db.count("SELECT COUNT(*) FROM parking_slots"),
                "parking_assigned", db.count("SELECT COUNT(*) FROM parking_slots WHERE flat IS NOT NULL AND flat<>''"),
                "workers_active", db.count("SELECT COUNT(*) FROM workers WHERE status='active'"),
                "workers_inactive", db.count("SELECT COUNT(*) FROM workers WHERE status<>'active'"),
                "vendors", db.count("SELECT COUNT(*) FROM vendors"));
        Map<String, Object> leases = m(
                "ending_60d", db.count("SELECT COUNT(*) FROM leases WHERE end_date>=? AND end_date<=?", today, in60),
                "tenants_without_lease", db.count("SELECT COUNT(*) FROM users u WHERE u.role='resident' AND u.status='approved' AND u.resident_type='tenant' "
                        + "AND NOT EXISTS (SELECT 1 FROM leases l WHERE l.user_id=u.id)"));
        Map<String, Object> notices = m("last_30d", db.count("SELECT COUNT(*) FROM notices WHERE created_at >= ?", d30));
        return m("residents", residents, "requests", requests, "emergencies", emergencies, "gate", gate, "estate", estate,
                "leases", leases, "notices", notices);
    }
}
