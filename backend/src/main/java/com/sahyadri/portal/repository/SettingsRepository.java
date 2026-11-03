package com.sahyadri.portal.repository;

import java.util.Optional;
import org.springframework.stereotype.Repository;

@Repository
public class SettingsRepository {
    private final Db db;

    public SettingsRepository(Db db) {
        this.db = db;
    }

    public Optional<String> get(String key) {
        var r = db.one("SELECT value FROM settings WHERE key=?", key);
        return r == null ? Optional.empty() : Optional.ofNullable((String) r.get("value"));
    }

    /** Portable upsert: update, then insert when nothing matched. */
    public void put(String key, String value) {
        if (db.update("UPDATE settings SET value=? WHERE key=?", value, key) == 0) {
            db.update("INSERT INTO settings(key,value) VALUES(?,?)", key, value);
        }
    }
}
