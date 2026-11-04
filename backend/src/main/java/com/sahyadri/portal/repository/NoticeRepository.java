package com.sahyadri.portal.repository;

import com.sahyadri.portal.support.TimeUtil;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Repository;

@Repository
public class NoticeRepository {
    private final Db db;

    public NoticeRepository(Db db) {
        this.db = db;
    }

    public List<Map<String, Object>> all() {
        return db.list("SELECT n.*,u.name AS author FROM notices n JOIN users u ON u.id=n.author_id ORDER BY n.id DESC");
    }

    public long insert(String title, String body, long authorId) {
        return db.insert("INSERT INTO notices(title,body,author_id,created_at) VALUES(?,?,?,?)", title, body, authorId, TimeUtil.nowUtc());
    }

    public Map<String, Object> find(long id) {
        return db.one("SELECT * FROM notices WHERE id=?", id);
    }

    public void delete(long id) {
        db.update("DELETE FROM notices WHERE id=?", id);
    }

    /** Approved non-guard users other than the author: the notice audience. */
    public List<Long> audience(long authorId) {
        return db.list("SELECT id FROM users WHERE status='approved' AND role!='guard' AND id!=?", authorId).stream()
                .map(r -> ((Number) r.get("id")).longValue()).toList();
    }
}
