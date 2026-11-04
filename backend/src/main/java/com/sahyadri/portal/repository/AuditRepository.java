package com.sahyadri.portal.repository;

import com.sahyadri.portal.support.TimeUtil;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Repository;

@Repository
public class AuditRepository {
    private final Db db;

    public AuditRepository(Db db) {
        this.db = db;
    }

    public void insert(Long actorId, String entity, Long entityId, String action, String detail) {
        db.update("INSERT INTO audit(actor_id,entity,entity_id,action,detail,created_at) VALUES(?,?,?,?,?,?)",
                actorId, entity, entityId, action, detail, TimeUtil.nowUtc());
    }

    public List<Map<String, Object>> latest(int limit) {
        return db.list("SELECT a.id,a.entity,a.entity_id,a.action,a.detail,a.created_at,u.name AS actor FROM audit a "
                + "LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT " + limit);
    }
}
