package com.sahyadri.portal.repository;

import com.sahyadri.portal.support.TimeUtil;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Repository;

@Repository
public class NotificationRepository {
    private final Db db;

    public NotificationRepository(Db db) {
        this.db = db;
    }

    public void insert(long userId, String message) {
        db.update("INSERT INTO notifications(user_id,message,created_at) VALUES(?,?,?)", userId, message, TimeUtil.nowUtc());
    }

    public long unread(long userId) {
        return db.count("SELECT COUNT(*) FROM notifications WHERE user_id=? AND is_read=0", userId);
    }

    public List<Map<String, Object>> latest(long userId) {
        return db.list("SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50", userId);
    }

    public void markAllRead(long userId) {
        db.update("UPDATE notifications SET is_read=1 WHERE user_id=?", userId);
    }
}
