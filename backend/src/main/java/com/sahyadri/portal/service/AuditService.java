package com.sahyadri.portal.service;

import com.sahyadri.portal.repository.AuditRepository;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;

/** Every state change writes here: who, what, when. */
@Service
public class AuditService {
    private final AuditRepository repo;

    public AuditService(AuditRepository repo) {
        this.repo = repo;
    }

    public void log(Long actorId, String entity, Long entityId, String action, String detail) {
        repo.insert(actorId, entity, entityId, action, detail);
    }

    public List<Map<String, Object>> latest() {
        return repo.latest(200);
    }
}
