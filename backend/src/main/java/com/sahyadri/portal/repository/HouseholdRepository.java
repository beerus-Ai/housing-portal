package com.sahyadri.portal.repository;

import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Repository;

/** Household members and tenant leases. */
@Repository
public class HouseholdRepository {
    private final Db db;

    public HouseholdRepository(Db db) {
        this.db = db;
    }

    public List<Map<String, Object>> members(String flat) {
        return db.list("SELECT id,name,resident_type,status,phone FROM users WHERE flat=? AND role!='admin' "
                + "AND status NOT IN ('rejected','removed') ORDER BY CASE WHEN resident_type='owner' THEN 0 ELSE 1 END, id", flat);
    }

    public Map<String, Object> lease(long userId) {
        return db.one("SELECT * FROM leases WHERE user_id=?", userId);
    }

    public Map<String, Object> tenant(long userId) {
        return db.one("SELECT * FROM users WHERE id=? AND resident_type='tenant'", userId);
    }

    public void upsertLease(long userId, String start, String end, String ownerName, String ownerPhone, String police, String agreement, String parking) {
        if (lease(userId) == null) {
            db.update("INSERT INTO leases(user_id,start_date,end_date,owner_name,owner_phone,police_verified_on,agreement,parking) VALUES(?,?,?,?,?,?,?,?)",
                    userId, start, end, ownerName, ownerPhone, police, agreement, parking);
        } else {
            db.update("UPDATE leases SET start_date=?,end_date=?,owner_name=?,owner_phone=?,police_verified_on=?,agreement=?,parking=? WHERE user_id=?",
                    start, end, ownerName, ownerPhone, police, agreement, parking, userId);
        }
    }

    public List<Map<String, Object>> leases() {
        return db.list("SELECT u.id AS user_id, u.name, u.flat, u.email, u.phone, l.start_date, l.end_date, l.owner_name, "
                + "l.owner_phone, l.police_verified_on, l.agreement, l.parking FROM users u LEFT JOIN leases l ON l.user_id=u.id "
                + "WHERE u.resident_type='tenant' AND u.status='approved' ORDER BY CASE WHEN l.end_date IS NULL THEN 0 ELSE 1 END, l.end_date, u.name");
    }
}
