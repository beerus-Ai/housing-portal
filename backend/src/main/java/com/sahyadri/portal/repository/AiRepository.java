package com.sahyadri.portal.repository;

import com.sahyadri.portal.support.TimeUtil;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Repository;

/** SQL for the AI workflows: WhatsApp message log, triage columns, SLA escalation and the AI counters. */
@Repository
public class AiRepository {
    private final Db db;

    public AiRepository(Db db) {
        this.db = db;
    }

    public long insertMessage(String direction, String phone, String body, Long userId, Long requestId, String status) {
        return db.insert("INSERT INTO whatsapp_messages(direction,phone,body,user_id,request_id,status,created_at) VALUES(?,?,?,?,?,?,?)",
                direction, phone, body, userId, requestId, status, TimeUtil.nowUtc());
    }

    public void setMessageUser(long id, long userId) {
        db.update("UPDATE whatsapp_messages SET user_id=? WHERE id=?", userId, id);
    }

    public void setMessageStatus(long id, String status) {
        db.update("UPDATE whatsapp_messages SET status=? WHERE id=?", status, id);
    }

    public List<Map<String, Object>> recentMessages() {
        return db.list("SELECT m.id,m.direction,m.phone,m.body,m.status,m.request_id,m.created_at,u.name AS resident,u.flat "
                + "FROM whatsapp_messages m LEFT JOIN users u ON u.id=m.user_id ORDER BY m.id DESC LIMIT 30");
    }

    public Map<String, Object> reviewMessage(long id) {
        return db.one("SELECT * FROM whatsapp_messages WHERE id=? AND direction='in' AND status='review'", id);
    }

    public void setMessageResult(long id, String status, long requestId) {
        db.update("UPDATE whatsapp_messages SET status=?, request_id=? WHERE id=?", status, requestId, id);
    }

    public long messageCountByStatus(String status) {
        return db.count("SELECT COUNT(*) FROM whatsapp_messages WHERE status=?", status);
    }

    public List<Map<String, Object>> reviewQueue() {
        return db.list("SELECT m.id,m.phone,m.body,m.created_at,u.name AS resident,u.flat FROM whatsapp_messages m LEFT JOIN users u ON u.id=m.user_id "
                + "WHERE m.direction='in' AND m.status='review' ORDER BY m.id DESC LIMIT 50");
    }

    public long messageCount(String direction) {
        return db.count("SELECT COUNT(*) FROM whatsapp_messages WHERE direction=?", direction);
    }

    public long messageCountSince(String direction, LocalDateTime t) {
        return db.count("SELECT COUNT(*) FROM whatsapp_messages WHERE direction=? AND created_at >= ?", direction, t);
    }

    public List<Map<String, Object>> vendorTrades() {
        return db.list("SELECT id,trade FROM vendors");
    }

    public void setTriage(long id, String category, String priority, String summary, Long vendorId, String source, double confidence) {
        db.update("UPDATE requests SET ai_category=?, ai_priority=?, ai_summary=?, ai_vendor_id=?, ai_source=?, ai_confidence=? WHERE id=?",
                category, priority, summary, vendorId, source, confidence, id);
    }

    public List<Map<String, Object>> overdue(LocalDateTime cutoff) {
        return db.list("SELECT r.id,r.title,r.user_id,r.source,u.flat FROM requests r JOIN users u ON u.id=r.user_id "
                + "WHERE r.status<>'closed' AND r.escalated_at IS NULL AND r.created_at < ?", cutoff);
    }

    /** True when this call flagged the request (so two racing runs never escalate it twice). */
    public boolean markEscalated(long id, LocalDateTime now) {
        return db.update("UPDATE requests SET escalated_at=? WHERE id=? AND escalated_at IS NULL", now, id) == 1;
    }

    public Map<String, Object> userContact(long id) {
        return db.one("SELECT id,phone FROM users WHERE id=?", id);
    }

    public List<Map<String, Object>> recentRequestsFor(long userId, String flat) {
        return db.list("SELECT id,title,status FROM requests WHERE user_id=? OR user_id IN (SELECT id FROM users WHERE flat=? AND flat IS NOT NULL) ORDER BY id DESC LIMIT 3",
                userId, flat == null ? "" : flat);
    }

    public long whatsappRequests() {
        return db.count("SELECT COUNT(*) FROM requests WHERE source='whatsapp'");
    }

    public long whatsappRequestsSince(LocalDateTime t) {
        return db.count("SELECT COUNT(*) FROM requests WHERE source='whatsapp' AND created_at >= ?", t);
    }

    public long triaged() {
        return db.count("SELECT COUNT(*) FROM requests WHERE ai_category IS NOT NULL");
    }

    public long urgentOpen() {
        return db.count("SELECT COUNT(*) FROM requests WHERE status<>'closed' AND ai_priority='urgent'");
    }

    public long escalatedOpen() {
        return db.count("SELECT COUNT(*) FROM requests WHERE status<>'closed' AND escalated_at IS NOT NULL");
    }

    public long openRequests() {
        return db.count("SELECT COUNT(*) FROM requests WHERE status<>'closed'");
    }

    public long unassigned() {
        return db.count("SELECT COUNT(*) FROM requests WHERE status='open' AND vendor_id IS NULL");
    }

    public long pendingResidents() {
        return db.count("SELECT COUNT(*) FROM users WHERE role='resident' AND status='pending'");
    }
}
