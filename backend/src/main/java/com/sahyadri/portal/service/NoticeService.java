package com.sahyadri.portal.service;

import com.sahyadri.portal.repository.NoticeRepository;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import com.sahyadri.portal.support.Ids;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class NoticeService {
    private final NoticeRepository repo;
    private final AuditService audit;
    private final NotificationService notifications;

    public NoticeService(NoticeRepository repo, AuditService audit, NotificationService notifications) {
        this.repo = repo;
        this.audit = audit;
        this.notifications = notifications;
    }

    public List<Map<String, Object>> list() {
        return repo.all();
    }

    @Transactional
    public long post(User admin, Body b) {
        String title = b.str("title", 150), body = b.str("body", 5000);
        if (title.isEmpty() || body.isEmpty()) throw new ApiException(400, "Title and body are required");
        long id = repo.insert(title, body, admin.id());
        audit.log(admin.id(), "notice", id, "posted", title);
        // guards cannot read notices, so they are not notified
        for (long uid : repo.audience(admin.id())) notifications.notify(uid, "New notice: " + title);
        return id;
    }

    @Transactional
    public void delete(User admin, String id) {
        Map<String, Object> n = repo.find(Ids.parse(id));
        if (n == null) throw new ApiException(404, "Notice not found");
        long nid = ((Number) n.get("id")).longValue();
        repo.delete(nid);
        audit.log(admin.id(), "notice", nid, "deleted", (String) n.get("title"));
    }
}
