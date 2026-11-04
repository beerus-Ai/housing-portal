package com.sahyadri.portal.repository;

import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Repository;

@Repository
public class VendorRepository {
    private final Db db;

    public VendorRepository(Db db) {
        this.db = db;
    }

    public List<Map<String, Object>> all() {
        return db.list("SELECT * FROM vendors ORDER BY trade,name");
    }

    public Map<String, Object> find(long id) {
        return db.one("SELECT * FROM vendors WHERE id=?", id);
    }

    public long insert(String name, String trade, String phone) {
        return db.insert("INSERT INTO vendors(name,trade,phone) VALUES(?,?,?)", name, trade, phone);
    }

    public void update(long id, String name, String trade, String phone) {
        db.update("UPDATE vendors SET name=?, trade=?, phone=? WHERE id=?", name, trade, phone, id);
    }

    public boolean hasRequests(long id) {
        return db.one("SELECT id FROM requests WHERE vendor_id=? LIMIT 1", id) != null;
    }

    public void delete(long id) {
        db.update("DELETE FROM vendors WHERE id=?", id);
    }
}
