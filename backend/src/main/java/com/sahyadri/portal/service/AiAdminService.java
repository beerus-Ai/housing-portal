package com.sahyadri.portal.service;

import com.sahyadri.portal.repository.AiRepository;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import com.sahyadri.portal.support.TimeUtil;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.stereotype.Service;

/** Committee-only AI tools: notice drafter, weekly digest, and the numbers shared with the overview. */
@Service
public class AiAdminService {
    private final AiService ai;
    private final AiRepository repo;
    private final EscalationService escalation;

    public AiAdminService(AiService ai, AiRepository repo, EscalationService escalation) {
        this.ai = ai;
        this.repo = repo;
        this.escalation = escalation;
    }

    public Map<String, Object> draftNotice(Body b) {
        String text = b.str("text", 600);
        if (text.length() < 5) throw new ApiException(400, "Type a few words about the notice first");
        return ai.draftNotice(text);
    }

    public Map<String, Object> stats() {
        Map<String, Object> s = new LinkedHashMap<>();
        s.put("sla_hours", escalation.slaHours());
        s.put("open", repo.openRequests());
        s.put("unassigned", repo.unassigned());
        s.put("escalated", repo.escalatedOpen());
        s.put("urgent", repo.urgentOpen());
        s.put("pending_users", repo.pendingResidents());
        s.put("whatsapp_7d", repo.whatsappRequestsSince(TimeUtil.nowUtc().minusDays(7)));
        return s;
    }

    public Map<String, Object> digest() {
        escalation.escalateOverdue();
        Map<String, Object> d = new LinkedHashMap<>(ai.digest(stats()));
        d.put("stats", stats());
        return d;
    }

    /** The `ai` block of GET /api/admin/overview. */
    public Map<String, Object> overviewBlock() {
        var now = TimeUtil.nowUtc();
        Map<String, Object> o = new LinkedHashMap<>();
        o.put("mode", ai.mode());
        o.put("sla_hours", escalation.slaHours());
        o.put("triaged", repo.triaged());
        o.put("urgent_open", repo.urgentOpen());
        o.put("escalated_open", repo.escalatedOpen());
        o.put("whatsapp_requests_30d", repo.whatsappRequestsSince(now.minusDays(30)));
        o.put("whatsapp_messages_7d", repo.messageCountSince("in", now.minusDays(7)));
        return o;
    }
}
