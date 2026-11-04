package com.sahyadri.portal.service;

import com.sahyadri.portal.repository.AiRepository;
import java.util.Map;
import org.springframework.stereotype.Service;

/** notifyReq from app.js: tell the requester in the app and, for WhatsApp requests, on WhatsApp too. */
@Service
public class RequestNotifier {
    private final NotificationService notifications;
    private final WhatsAppOutbox outbox;
    private final AiRepository repo;

    public RequestNotifier(NotificationService notifications, WhatsAppOutbox outbox, AiRepository repo) {
        this.notifications = notifications;
        this.outbox = outbox;
        this.repo = repo;
    }

    /** r needs user_id, id and source. */
    public void notifyRequester(Map<String, Object> r, String msg) {
        long uid = ((Number) r.get("user_id")).longValue();
        notifications.notify(uid, msg);
        if ("whatsapp".equals(r.get("source"))) {
            Map<String, Object> u = repo.userContact(uid);
            if (u != null && u.get("phone") != null && !u.get("phone").toString().isEmpty()) {
                outbox.send(u.get("phone").toString(), msg, uid, ((Number) r.get("id")).longValue());
            }
        }
    }
}
