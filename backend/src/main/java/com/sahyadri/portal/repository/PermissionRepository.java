package com.sahyadri.portal.repository;

import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Repository;

@Repository
public class PermissionRepository {
    private final Db db;

    public PermissionRepository(Db db) {
        this.db = db;
    }

    public boolean isEmpty() {
        return db.one("SELECT 1 FROM role_permissions LIMIT 1") == null;
    }

    public List<Map<String, Object>> all() {
        return db.list("SELECT role,permission,allowed FROM role_permissions");
    }

    public List<String> allowedFor(String role) {
        return db.list("SELECT permission FROM role_permissions WHERE role=? AND allowed=1", role)
                .stream().map(r -> (String) r.get("permission")).toList();
    }

    public void deleteAll() {
        db.update("DELETE FROM role_permissions");
    }

    public void insertIfMissing(String role, String permission, boolean allowed) {
        if (db.one("SELECT 1 FROM role_permissions WHERE role=? AND permission=?", role, permission) == null) insert(role, permission, allowed);
    }

    public void insert(String role, String permission, boolean allowed) {
        db.update("INSERT INTO role_permissions(role,permission,allowed) VALUES(?,?,?)", role, permission, allowed ? 1 : 0);
    }
}
