package com.sahyadri.portal.service;

import com.sahyadri.portal.repository.AiRepository;
import com.sahyadri.portal.support.TimeUtil;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** SLA escalation: open requests older than SLA_HOURS (default 48) are flagged once and the committee is told. */
@Service
public class EscalationService {
    private final AiRepository repo;
    private final AuditService audit;
    private final NotificationService notifications;
    private final RequestNotifier notifier;
    private final int slaHours;

    public EscalationService(AiRepository repo, AuditService audit, NotificationService notifications, RequestNotifier notifier,
                             @Value("${SLA_HOURS:48}") String sla) {
        this.repo = repo;
        this.audit = audit;
        this.notifications = notifications;
        this.notifier = notifier;
        int h;
        try {
            h = (int) Double.parseDouble(sla.strip());
        } catch (Exception e) {
            h = 0;
        }
        this.slaHours = h > 0 ? h : 48;
    }

    public int slaHours() {
        return slaHours;
    }

    @Transactional
    public int escalateOverdue() {
        LocalDateTime now = TimeUtil.nowUtc();
        List<Map<String, Object>> rows = repo.overdue(now.minusHours(slaHours));
        int count = 0;
        for (Map<String, Object> r : rows) {
            long id = ((Number) r.get("id")).longValue();
            if (!repo.markEscalated(id, now)) continue;
            count++;
            audit.log(null, "request", id, "escalated", "open longer than " + slaHours + "h");
            notifications.notifyAdmins("Escalated: \"" + r.get("title") + "\" (flat " + r.get("flat") + ") has been open over " + slaHours + " hours");
            notifier.notifyRequester(r, "Your request \"" + r.get("title") + "\" is taking longer than expected, so we escalated it to the committee");
        }
        return count;
    }
}
