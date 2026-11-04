package com.sahyadri.portal.repository;

import com.sahyadri.portal.support.TimeUtil;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.springframework.stereotype.Repository;

@Repository
public class UserRepository {
    private static final Set<String> EDITABLE = Set.of("resident_type", "flat", "name", "phone", "status");
    private static final String PUBLIC_COLS = "id,name,email,phone,flat,resident_type,role,status,created_at";

    private final Db db;

    public UserRepository(Db db) {
        this.db = db;
    }

    private static User map(Map<String, Object> r) {
        if (r == null) return null;
        return new User(((Number) r.get("id")).longValue(), (String) r.get("name"), (String) r.get("email"),
                (String) r.get("phone"), (String) r.get("flat"), (String) r.get("resident_type"),
                (String) r.get("password_hash"), (String) r.get("role"), (String) r.get("status"));
    }

    public Optional<User> findById(long id) {
        return Optional.ofNullable(map(db.one("SELECT * FROM users WHERE id=?", id)));
    }

    public Optional<User> findByEmail(String email) {
        return Optional.ofNullable(map(db.one("SELECT * FROM users WHERE email=?", email)));
    }

    public boolean emailExists(String email) {
        return db.one("SELECT id FROM users WHERE email=?", email) != null;
    }

    public long insertResident(String name, String email, String phone, String flat, String residentType, String passwordHash) {
        return db.insert("INSERT INTO users(name,email,phone,flat,resident_type,password_hash,consent_at) VALUES(?,?,?,?,?,?,?)",
                name, email, phone, flat, residentType, passwordHash, TimeUtil.nowUtc());
    }

    public long insertAdmin(String name, String email, String passwordHash) {
        return db.insert("INSERT INTO users(name,email,password_hash,role,status,consent_at) VALUES(?,?,?,?,?,?)",
                name, email, passwordHash, "admin", "approved", TimeUtil.nowUtc());
    }

    public List<User> approvedResidentsWithPhone() {
        return db.list("SELECT * FROM users WHERE role='resident' AND status='approved' AND phone IS NOT NULL ORDER BY id")
                .stream().map(UserRepository::map).toList();
    }

    public boolean adminExists() {
        return db.one("SELECT id FROM users WHERE role='admin' LIMIT 1") != null;
    }

    public List<Long> adminIds() {
        return db.list("SELECT id FROM users WHERE role='admin'").stream().map(r -> ((Number) r.get("id")).longValue()).toList();
    }

    public void updateProfile(long id, String name, String phone) {
        db.update("UPDATE users SET name=?, phone=? WHERE id=?", name, phone, id);
    }

    public void updatePassword(long id, String hash) {
        db.update("UPDATE users SET password_hash=? WHERE id=?", hash, id);
    }

    public void updateStatus(long id, String status) {
        db.update("UPDATE users SET status=? WHERE id=?", status, id);
    }

    /** The column comes from a fixed whitelist, never from input. */
    public void updateColumn(long id, String column, String value) {
        if (!EDITABLE.contains(column)) throw new IllegalArgumentException("column not editable: " + column);
        db.update("UPDATE users SET " + column + "=? WHERE id=?", value, id);
    }

    public List<Map<String, Object>> search(String status, String term) {
        StringBuilder where = new StringBuilder();
        List<Object> p = new ArrayList<>();
        if (!status.isEmpty()) {
            where.append("status=?");
            p.add(status);
        } else {
            where.append("role!='guard'");
        }
        if (!term.isEmpty()) {
            String like = "%" + term.replaceAll("([\\\\%_])", "\\\\$1") + "%";
            where.append(" AND (LOWER(name) LIKE LOWER(?) ESCAPE '\\' OR LOWER(email) LIKE LOWER(?) ESCAPE '\\'"
                    + " OR LOWER(flat) LIKE LOWER(?) ESCAPE '\\')");
            p.add(like);
            p.add(like);
            p.add(like);
        }
        return db.list("SELECT " + PUBLIC_COLS + " FROM users WHERE " + where + " ORDER BY id DESC", p.toArray());
    }

    public Map<String, Object> publicRow(long id) {
        return db.one("SELECT " + PUBLIC_COLS + " FROM users WHERE id=?", id);
    }

    public Map<String, Object> detailRow(long id) {
        return db.one("SELECT id,name,email,phone,flat,resident_type,role,status,consent_at,created_at FROM users WHERE id=?", id);
    }

    public Map<String, Object> lease(long userId) {
        return db.one("SELECT * FROM leases WHERE user_id=?", userId);
    }
}
