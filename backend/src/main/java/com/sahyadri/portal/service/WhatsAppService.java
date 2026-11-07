package com.sahyadri.portal.service;

import static com.sahyadri.portal.service.WhatsAppOutbox.digits;
import static com.sahyadri.portal.service.WhatsAppOutbox.phoneKey;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.repository.AiRepository;
import com.sahyadri.portal.repository.RequestRepository;
import com.sahyadri.portal.repository.SettingsRepository;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.repository.UserRepository;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import com.sahyadri.portal.support.Ids;
import com.sahyadri.portal.support.Text;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.SecureRandom;
import java.util.ArrayList;
import java.util.HexFormat;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.support.TransactionTemplate;

/** WhatsApp intake: webhook secret, message handling (status, emergency, new request), the admin console and simulator. */
@Service
public class WhatsAppService {
    public record Result(List<String> replies, Long created, String decision) {}

    private static final Pattern EMERGENCY = Pattern.compile("^(sos|emergency|fire|help me)\\b");
    private static final Pattern STATUS = Pattern.compile("^status\\b");

    private final AiRepository repo;
    private final RequestRepository requests;
    private final UserRepository users;
    private final SettingsRepository settingsRepo;
    private final SettingsService settings;
    private final AccessService access;
    private final AuditService audit;
    private final NotificationService notifications;
    private final TriageService triage;
    private final WhatsAppOutbox outbox;
    private final AiService ai;
    private final EscalationService escalation;
    private final String envSecret;
    private final TransactionTemplate tx;

    public WhatsAppService(AiRepository repo, RequestRepository requests, UserRepository users, SettingsRepository settingsRepo,
                           SettingsService settings, AccessService access, AuditService audit, NotificationService notifications,
                           TriageService triage, WhatsAppOutbox outbox, AiService ai, EscalationService escalation, TransactionTemplate tx,
                           @Value("${WHATSAPP_WEBHOOK_SECRET:}") String envSecret) {
        this.repo = repo;
        this.requests = requests;
        this.users = users;
        this.settingsRepo = settingsRepo;
        this.settings = settings;
        this.access = access;
        this.audit = audit;
        this.notifications = notifications;
        this.triage = triage;
        this.outbox = outbox;
        this.ai = ai;
        this.escalation = escalation;
        this.tx = tx;
        this.envSecret = envSecret == null ? "" : envSecret;
    }

    public synchronized String secret() {
        if (!envSecret.isEmpty()) return envSecret;
        String v = settingsRepo.get("whatsapp_secret").orElse(null);
        if (v == null || v.isEmpty()) {
            byte[] b = new byte[18];
            new SecureRandom().nextBytes(b);
            v = HexFormat.of().formatHex(b);
            settingsRepo.put("whatsapp_secret", v);
        }
        return v;
    }

    /** Constant-time comparison (lengths are compared first, as in the Node version). */
    public boolean sameSecret(String given) {
        byte[] a = (given == null ? "" : given).getBytes(StandardCharsets.UTF_8);
        byte[] b = secret().getBytes(StandardCharsets.UTF_8);
        return a.length == b.length && MessageDigest.isEqual(a, b);
    }

    /** Handles one inbound message. group: the message came from a group, so unknown senders get no reply. */
    public Result handle(String from, String text, boolean group) {
        String body = Text.slice((text == null ? "" : text).strip(), 1000);
        if (digits(from).isEmpty() || body.isEmpty()) return new Result(List.of(), null, null);
        long inId = repo.insertMessage("in", digits(from), body, null, null, "received");
        String key = phoneKey(from);
        User u = null;
        for (User x : users.approvedResidentsWithPhone()) {
            if (phoneKey(x.phone()).equals(key)) {
                u = x;
                break;
            }
        }
        if (u == null) {
            if (group) {
                repo.setMessageStatus(inId, "ignored");
                return new Result(List.of(), null, "ignore");
            }
            String r = "Hello from " + settings.get("society_name") + ". This number is not registered yet. Please register in the portal with this phone number, or ask the committee to add it.";
            outbox.send(from, r, null, null);
            return new Result(List.of(r), null, null);
        }
        repo.setMessageUser(inId, u.id());
        String low = body.toLowerCase();
        if (EMERGENCY.matcher(low).find()) {
            return reply(from, u, "For an emergency please use the Emergency button in the app or call the gate directly. WhatsApp is not monitored around the clock.");
        }
        if (STATUS.matcher(low).find()) {
            List<Map<String, Object>> mine = repo.recentRequestsFor(u.id(), u.flat());
            List<String> lines = new ArrayList<>();
            for (Map<String, Object> r : mine) lines.add("#" + r.get("id") + " " + r.get("title") + ": " + r.get("status").toString().replace('_', ' '));
            return reply(from, u, mine.isEmpty() ? "You have no requests yet. Just describe the problem and we will log it." : String.join("\n", lines));
        }
        if (!access.can(u, "request.create")) {
            return reply(from, u, "Your account cannot raise requests. Please contact the committee.");
        }
        // Gate: only real requests become tickets. Chatter is ignored silently; unsure messages wait for the committee. Neither sends a reply.
        String decision = (String) ai.classifyMessage(body).get("decision");
        if ("ignore".equals(decision)) {
            repo.setMessageStatus(inId, "ignored");
            return new Result(List.of(), null, "ignore");
        }
        if ("review".equals(decision)) {
            repo.setMessageStatus(inId, "review");
            notifications.notifyAdmins("WhatsApp message needs review (flat " + u.flat() + "): " + Text.slice(body, 80));
            return new Result(List.of(), null, "review");
        }
        final User resident = u;
        Created made = tx.execute(st -> createFromMessage(resident, from, body, inId));
        return new Result(List.of(made.text()), made.id(), "create");
    }

    private record Created(long id, String text) {}

    /** Creates the request for a resident's message and sends the private confirmation (used by intake and committee approval). */
    private Created createFromMessage(User u, String from, String body, long msgId) {
        Map<String, Object> tri = AiService.triageRules(body, repo.vendorTrades());
        String category = (String) tri.get("category");
        String title = AiService.firstSentence(body, 120);
        long id = requests.insert(u.id(), category, title, Text.slice(body, 2000), null, "whatsapp");
        audit.log(u.id(), "request", id, "created", category + ": " + title + " (via WhatsApp)");
        triage.apply(id, body);
        repo.setMessageResult(msgId, "received", id);
        boolean urgent = "urgent".equals(tri.get("priority"));
        notifications.notifyAdmins("New " + category + " request from flat " + u.flat() + " via WhatsApp: " + title + (urgent ? " (AI: urgent)" : ""));
        String text = "Thanks, request #" + id + " is logged as " + category + (urgent ? " (urgent)" : "") + ". We will update you here as it moves.";
        outbox.send(from, text, u.id(), id);
        return new Created(id, text);
    }

    private Result reply(String from, User u, String text) {
        outbox.send(from, text, u.id(), null);
        return new Result(List.of(text), null, null);
    }

    /** Committee approves a message the gate was unsure about. */
    public Map<String, Object> approve(User actor, String rawId) {
        return tx.execute(st -> {
            Map<String, Object> m = repo.reviewMessage(Ids.parse(rawId));
            if (m == null) throw new ApiException(404, "Message not waiting for review");
            User u = m.get("user_id") == null ? null : users.findById(((Number) m.get("user_id")).longValue()).orElse(null);
            if (u == null || !"resident".equals(u.role()) || !"approved".equals(u.status())) throw new ApiException(409, "Sender is no longer an approved resident");
            long mid = ((Number) m.get("id")).longValue();
            Created made = createFromMessage(u, (String) m.get("phone"), (String) m.get("body"), mid);
            audit.log(actor.id(), "whatsapp", mid, "review_approved", "request #" + made.id());
            Map<String, Object> out = new LinkedHashMap<>();
            out.put("created", made.id());
            return out;
        });
    }

    public Map<String, Object> dismiss(User actor, String rawId) {
        Map<String, Object> m = repo.reviewMessage(Ids.parse(rawId));
        if (m == null) throw new ApiException(404, "Message not waiting for review");
        long mid = ((Number) m.get("id")).longValue();
        repo.setMessageStatus(mid, "ignored");
        audit.log(actor.id(), "whatsapp", mid, "review_dismissed", "");
        return Map.of("ok", true);
    }

    private static String asString(JsonNode n) {
        return n == null || n.isMissingNode() || n.isNull() ? "" : n.isValueNode() ? n.asText() : n.toString();
    }

    private static Iterable<JsonNode> arr(JsonNode n) {
        return n != null && n.isArray() ? n : List.<JsonNode>of();
    }

    /** Accepts {from,text[,group]} or the Meta Cloud API payload; at most 20 messages per call. */
    public Map<String, Object> webhook(Body b) {
        List<Object[]> msgs = new ArrayList<>();
        if (b.get("from").isTextual() && b.get("text").isTextual()) {
            msgs.add(new Object[]{b.get("from").asText(), b.get("text").asText(), truthy(b.get("group")) || truthy(b.get("group_id"))});
        }
        for (JsonNode e : arr(b.get("entry"))) {
            for (JsonNode c : arr(e.path("changes"))) {
                for (JsonNode m : arr(c.path("value").path("messages"))) {
                    if ("text".equals(m.path("type").asText(null)) && m.hasNonNull("text")) {
                        msgs.add(new Object[]{asString(m.get("from")), asString(m.path("text").get("body")),
                                truthy(m.get("group_id")) || truthy(c.path("value").get("group_id"))});
                    }
                }
            }
        }
        int created = 0, review = 0, ignored = 0;
        for (Object[] m : msgs.subList(0, Math.min(20, msgs.size()))) {
            Result r = handle((String) m[0], (String) m[1], (Boolean) m[2]);
            if (r.created() != null) created++;
            else if ("review".equals(r.decision())) review++;
            else if ("ignore".equals(r.decision())) ignored++;
        }
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("received", msgs.size());
        out.put("created", created);
        out.put("review", review);
        out.put("ignored", ignored);
        return out;
    }

    /** JS truthiness of a JSON value (missing, null, false, 0, "" are falsy). */
    private static boolean truthy(JsonNode n) {
        if (n == null || n.isMissingNode() || n.isNull()) return false;
        if (n.isBoolean()) return n.asBoolean();
        if (n.isNumber()) return n.asDouble() != 0;
        if (n.isTextual()) return !n.asText().isEmpty();
        return true;
    }

    public Map<String, Object> simulate(User actor, Body b) {
        String phone = b.str("phone", 30), text = b.str("text", 1000);
        if (digits(phone).isEmpty() || text.isEmpty()) throw new ApiException(400, "Phone and message are required");
        Result r = handle(phone, text, b.isTrue("group"));
        audit.log(actor.id(), "whatsapp", r.created(), "simulated", Text.slice(text, 80));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("created", r.created());
        out.put("replies", r.replies());
        out.put("decision", r.decision() != null ? r.decision() : r.created() != null ? "create" : "none");
        return out;
    }

    public Map<String, Object> console() {
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("whatsapp_requests", repo.whatsappRequests());
        counts.put("messages_in", repo.messageCount("in"));
        counts.put("messages_out", repo.messageCount("out"));
        counts.put("triaged", repo.triaged());
        counts.put("messages_review", repo.messageCountByStatus("review"));
        counts.put("messages_ignored", repo.messageCountByStatus("ignored"));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mode", ai.mode());
        out.put("sla_hours", escalation.slaHours());
        out.put("whatsapp_live", outbox.live());
        out.put("webhook_path", "/api/whatsapp/webhook");
        out.put("webhook_secret", secret());
        out.put("counts", counts);
        out.put("messages", repo.recentMessages());
        out.put("review", repo.reviewQueue());
        return out;
    }
}
