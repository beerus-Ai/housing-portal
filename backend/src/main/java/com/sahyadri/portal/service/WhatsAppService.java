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
import org.springframework.transaction.annotation.Transactional;

/** WhatsApp intake: webhook secret, message handling (status, emergency, new request), the admin console and simulator. */
@Service
public class WhatsAppService {
    public record Result(List<String> replies, Long created) {}

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

    public WhatsAppService(AiRepository repo, RequestRepository requests, UserRepository users, SettingsRepository settingsRepo,
                           SettingsService settings, AccessService access, AuditService audit, NotificationService notifications,
                           TriageService triage, WhatsAppOutbox outbox, AiService ai, EscalationService escalation,
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

    @Transactional
    public Result handle(String from, String text) {
        String body = Text.slice((text == null ? "" : text).strip(), 1000);
        if (digits(from).isEmpty() || body.isEmpty()) return new Result(List.of(), null);
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
            String r = "Hello from " + settings.get("society_name") + ". This number is not registered yet. Please register in the portal with this phone number, or ask the committee to add it.";
            outbox.send(from, r, null, null);
            return new Result(List.of(r), null);
        }
        repo.setMessageUser(inId, u.id());
        String low = body.toLowerCase();
        if (EMERGENCY.matcher(low).find()) {
            return reply(from, u, "For an emergency please use the Emergency button in the app or call the gate directly. WhatsApp is not monitored around the clock.", null, null);
        }
        if (STATUS.matcher(low).find()) {
            List<Map<String, Object>> mine = repo.recentRequestsFor(u.id(), u.flat());
            List<String> lines = new ArrayList<>();
            for (Map<String, Object> r : mine) lines.add("#" + r.get("id") + " " + r.get("title") + ": " + r.get("status").toString().replace('_', ' '));
            return reply(from, u, mine.isEmpty() ? "You have no requests yet. Just describe the problem and we will log it." : String.join("\n", lines), null, null);
        }
        if (!access.can(u, "request.create")) {
            return reply(from, u, "Your account cannot raise requests. Please contact the committee.", null, null);
        }
        Map<String, Object> tri = AiService.triageRules(body, repo.vendorTrades());
        String category = (String) tri.get("category");
        String title = AiService.firstSentence(body, 120);
        long id = requests.insert(u.id(), category, title, Text.slice(body, 2000), null, "whatsapp");
        audit.log(u.id(), "request", id, "created", category + ": " + title + " (via WhatsApp)");
        triage.apply(id, body);
        boolean urgent = "urgent".equals(tri.get("priority"));
        notifications.notifyAdmins("New " + category + " request from flat " + u.flat() + " via WhatsApp: " + title + (urgent ? " (AI: urgent)" : ""));
        return reply(from, u, "Thanks, request #" + id + " is logged as " + category + (urgent ? " (urgent)" : "") + ". We will update you here as it moves.", id, id);
    }

    private Result reply(String from, User u, String text, Long requestId, Long created) {
        outbox.send(from, text, u.id(), requestId);
        return new Result(List.of(text), created);
    }

    private static String asString(JsonNode n) {
        return n == null || n.isMissingNode() || n.isNull() ? "" : n.isValueNode() ? n.asText() : n.toString();
    }

    private static Iterable<JsonNode> arr(JsonNode n) {
        return n != null && n.isArray() ? n : List.<JsonNode>of();
    }

    /** Accepts {from,text} or the Meta Cloud API payload; at most 20 messages per call. */
    public Map<String, Object> webhook(Body b) {
        List<String[]> msgs = new ArrayList<>();
        if (b.get("from").isTextual() && b.get("text").isTextual()) msgs.add(new String[]{b.get("from").asText(), b.get("text").asText()});
        for (JsonNode e : arr(b.get("entry"))) {
            for (JsonNode c : arr(e.path("changes"))) {
                for (JsonNode m : arr(c.path("value").path("messages"))) {
                    if ("text".equals(m.path("type").asText(null)) && m.hasNonNull("text")) {
                        msgs.add(new String[]{asString(m.get("from")), asString(m.path("text").get("body"))});
                    }
                }
            }
        }
        int created = 0;
        for (String[] m : msgs.subList(0, Math.min(20, msgs.size()))) if (handle(m[0], m[1]).created() != null) created++;
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("ok", true);
        out.put("received", msgs.size());
        out.put("created", created);
        return out;
    }

    public Map<String, Object> simulate(User actor, Body b) {
        String phone = b.str("phone", 30), text = b.str("text", 1000);
        if (digits(phone).isEmpty() || text.isEmpty()) throw new ApiException(400, "Phone and message are required");
        Result r = handle(phone, text);
        audit.log(actor.id(), "whatsapp", r.created(), "simulated", Text.slice(text, 80));
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("created", r.created());
        out.put("replies", r.replies());
        return out;
    }

    public Map<String, Object> console() {
        Map<String, Object> counts = new LinkedHashMap<>();
        counts.put("whatsapp_requests", repo.whatsappRequests());
        counts.put("messages_in", repo.messageCount("in"));
        counts.put("messages_out", repo.messageCount("out"));
        counts.put("triaged", repo.triaged());
        Map<String, Object> out = new LinkedHashMap<>();
        out.put("mode", ai.mode());
        out.put("sla_hours", escalation.slaHours());
        out.put("whatsapp_live", outbox.live());
        out.put("webhook_path", "/api/whatsapp/webhook");
        out.put("webhook_secret", secret());
        out.put("counts", counts);
        out.put("messages", repo.recentMessages());
        return out;
    }
}
