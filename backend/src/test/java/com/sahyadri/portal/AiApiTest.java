package com.sahyadri.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.service.AiService;
import com.sahyadri.portal.support.ApiTestBase;
import com.sahyadri.portal.support.TestClient;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Mirrors test/ai.test.js. */
class AiApiTest extends ApiTestBase {
    private static final String HOOK = "/api/whatsapp/webhook";

    private TestClient resident(String email, String flat, String type, String phone) {
        TestClient c = client();
        assertEquals(201, client().post("/api/register", Map.of("name", email.split("@")[0], "email", email, "flat", flat, "phone", phone,
                "resident_type", type, "password", PW, "consent", true)).status());
        for (JsonNode u : admin.get("/api/admin/users?status=pending").body()) {
            if (u.get("email").asText().equals(email)) c.id = u.get("id").asLong();
        }
        assertEquals(200, admin.post("/api/admin/users/" + c.id + "/approve").status());
        assertEquals(200, c.post("/api/login", Map.of("email", email, "password", PW)).status());
        return c;
    }

    private boolean anyMessage(TestClient c, String regex) {
        for (JsonNode n : c.get("/api/notifications").body()) if (n.get("message").asText().matches("(?s).*" + regex + ".*")) return true;
        return false;
    }

    @Test
    void redactRemovesPhonesEmailsAndFlats() {
        String r = AiService.redact("Call me on +91 98765 43210 or amit@example.test, flat B-101 tap leaks");
        assertFalse(r.matches("(?s).*(98765|amit@|B-101).*"), r);
        assertTrue(r.contains("tap leaks"));
    }

    @Test
    void ruleTriage() {
        var t = AiService.triageRules("Sparks coming from the switch board in the hall", List.of(Map.of("id", 7L, "trade", "Electrical")));
        assertEquals("electrical", t.get("category"));
        assertEquals("urgent", t.get("priority"));
        assertEquals(7L, t.get("vendor_id"));
        assertEquals("low", AiService.triageRules("Please paint the corridor when possible", List.of()).get("priority"));
        assertEquals("other", AiService.triageRules("hello", List.of()).get("category"));
    }

    @Test
    void newRequestsAreTriagedForTheCommitteeOnly() {
        assertEquals(201, admin.post("/api/vendors", Map.of("name", "Sparky", "trade", "electrical")).status());
        TestClient o = resident("t1@example.test", "A-101", "owner", "9876543210");
        var c = o.post("/api/requests", Map.of("category", "other", "title", "Sparks from the socket", "description", "Burning smell too"));
        assertEquals(201, c.status());
        long id = c.body().get("id").asLong();
        JsonNode forAdmin = admin.get("/api/requests/" + id).body();
        assertEquals("electrical", forAdmin.get("ai").get("category").asText());
        assertEquals("urgent", forAdmin.get("ai").get("priority").asText());
        assertEquals("rules", forAdmin.get("ai").get("source").asText());
        assertTrue(forAdmin.get("ai").get("confidence").asDouble() > 0);
        assertFalse(forAdmin.get("ai").get("vendor_id").isNull());
        assertEquals("app", forAdmin.get("source").asText());
        assertTrue(forAdmin.has("escalated_at"));
        JsonNode forOwner = o.get("/api/requests/" + id).body();
        assertFalse(forOwner.has("ai"));
        assertFalse(forOwner.has("ai_priority"));
        assertFalse(forOwner.has("ai_category"));
        assertEquals("app", forOwner.get("source").asText());
        assertFalse(o.get("/api/requests").body().get(0).has("ai"));
        assertTrue(anyMessage(admin, "AI: urgent"), "admin notified with urgency");
    }

    @Test
    void whatsappWebhook() throws Exception {
        TestClient o = resident("wa@example.test", "B-202", "owner", "+91 98765 43210");
        JsonNode cfg = admin.get("/api/admin/ai").body();
        String secret = cfg.get("webhook_secret").asText();
        assertFalse(secret.isEmpty());
        assertEquals(secret, admin.get("/api/admin/ai").body().get("webhook_secret").asText(), "stable");
        TestClient anon = client();
        Map<String, String> msg = Map.of("from", "919876543210", "text", "tap leaking");
        assertEquals(401, anon.post(HOOK, msg).status());
        assertEquals(401, anon.call("POST", HOOK, msg, "x-webhook-secret", "nope").status());
        String[] h = {"x-webhook-secret", secret};
        var unk = anon.call("POST", HOOK, Map.of("from", "911111111111", "text", "lift stuck"), h);
        assertEquals(1, unk.body().get("received").asInt());
        assertEquals(0, unk.body().get("created").asInt());
        var ok = anon.call("POST", HOOK, Map.of("from", "919876543210", "text", "The kitchen tap is leaking badly. Please send a plumber."), h);
        assertEquals(1, ok.body().get("created").asInt());
        JsonNode reqs = o.get("/api/requests").body();
        assertEquals(1, reqs.size());
        assertEquals("whatsapp", reqs.get(0).get("source").asText());
        assertEquals("plumbing", reqs.get(0).get("category").asText());
        assertEquals("B-202", reqs.get(0).get("flat").asText());
        anon.call("POST", HOOK, Map.of("from", "919876543210", "text", "status"), h);
        var sos = anon.call("POST", HOOK, Map.of("from", "919876543210", "text", "fire in the building"), h);
        assertEquals(0, sos.body().get("created").asInt());
        assertEquals(1, o.get("/api/requests").body().size());
        Map<String, Object> meta = Map.of("entry", List.of(Map.of("changes", List.of(Map.of("value", Map.of("messages",
                List.of(Map.of("from", "919876543210", "type", "text", "text", Map.of("body", "Garbage not collected today")))))))));
        var m = anon.post(HOOK + "?secret=" + secret, meta);
        assertEquals(1, m.body().get("created").asInt());
        long vid = admin.post("/api/vendors", Map.of("name", "Pipes Co", "trade", "plumbing")).body().get("id").asLong();
        assertEquals(200, admin.post("/api/requests/" + reqs.get(0).get("id").asLong() + "/assign", Map.of("vendor_id", vid)).status());
        JsonNode log = admin.get("/api/admin/ai").body();
        assertTrue(hasOut(log, "assigned to Pipes Co"), "status sent to WhatsApp");
        assertTrue(hasOut(log, "not registered"));
        assertTrue(hasOut(log, "Emergency button"));
        assertEquals(2, log.get("counts").get("whatsapp_requests").asInt());
        assertEquals("rules", log.get("mode").asText());
        assertFalse(log.get("whatsapp_live").asBoolean());
        // verify handshake
        var hs = anon.get(HOOK + "?hub.mode=subscribe&hub.verify_token=" + secret + "&hub.challenge=abc");
        assertEquals(200, hs.status());
        assertEquals("abc", hs.raw().getContentAsString());
        assertEquals(403, anon.get(HOOK + "?hub.mode=subscribe&hub.verify_token=x&hub.challenge=abc").status());
        // residents cannot read the AI console or simulate
        assertEquals(403, o.get("/api/admin/ai").status());
        assertEquals(403, o.post("/api/admin/whatsapp/simulate", Map.of("phone", "1", "text", "x")).status());
        assertEquals(401, client().get("/api/admin/ai").status());
    }

    private static boolean hasOut(JsonNode log, String part) {
        for (JsonNode x : log.get("messages")) if ("out".equals(x.get("direction").asText()) && x.get("body").asText().contains(part)) return true;
        return false;
    }

    @Test
    void webhookIgnoresOriginWhenAbsentButBlocksForeignOrigin() {
        String secret = admin.get("/api/admin/ai").body().get("webhook_secret").asText();
        var r = client().call("POST", HOOK, Map.of("from", "1", "text", "x"), "x-webhook-secret", secret);
        assertEquals(200, r.status());
        var blocked = client().call("POST", HOOK, Map.of("from", "1", "text", "x"), "x-webhook-secret", secret, "Origin", "http://evil.test");
        assertEquals(403, blocked.status());
    }

    @Test
    void guardsStayBlockedFromEverythingNew() {
        long gid = admin.post("/api/admin/guards", Map.of("name", "Gate One", "email", "g1@example.test", "password", PW)).body().get("id").asLong();
        assertTrue(gid > 0);
        TestClient g = client();
        assertEquals(200, g.post("/api/login", Map.of("email", "g1@example.test", "password", PW)).status());
        assertEquals(403, g.get("/api/admin/ai").status());
        assertEquals(403, g.get("/api/admin/digest").status());
        assertEquals(403, g.post("/api/admin/escalations/run").status());
        assertEquals(403, g.post("/api/admin/ai/draft-notice", Map.of("text", "water tank cleaning")).status());
    }

    @Test
    void simulatorUsesTheSameIntakePath() {
        resident("sim@example.test", "C-303", "tenant", "9000011111");
        assertEquals(400, admin.post("/api/admin/whatsapp/simulate", Map.of("phone", "", "text", "x")).status());
        var r = admin.post("/api/admin/whatsapp/simulate", Map.of("phone", "9000011111", "text", "Lift is not working since morning"));
        assertEquals(200, r.status());
        assertTrue(r.body().get("created").asLong() > 0);
        assertTrue(r.body().get("replies").get(0).asText().contains("logged as lift"));
    }

    @Test
    void slaEscalationFlagsOverdueRequestsOnce() {
        TestClient o = resident("sla@example.test", "D-404", "owner", "9000022222");
        long id = o.post("/api/requests", Map.of("category", "lift", "title", "Lift door noisy")).body().get("id").asLong();
        assertEquals(0, admin.post("/api/admin/escalations/run").body().get("escalated").asInt());
        jdbc.update("UPDATE requests SET created_at = DATEADD('DAY', -3, CURRENT_TIMESTAMP) WHERE id=?", id);
        assertEquals(1, admin.post("/api/admin/escalations/run").body().get("escalated").asInt());
        assertEquals(0, admin.post("/api/admin/escalations/run").body().get("escalated").asInt(), "only once");
        assertTrue(anyMessage(admin, "Escalated: \"Lift door noisy\""));
        assertTrue(anyMessage(o, "escalated it to the committee"));
        JsonNode ov = admin.get("/api/admin/overview").body();
        assertEquals(1, ov.get("ai").get("escalated_open").asInt());
        assertEquals("rules", ov.get("ai").get("mode").asText());
        assertEquals(48, ov.get("ai").get("sla_hours").asInt());
        JsonNode d = admin.get("/api/requests/" + id).body();
        assertFalse(d.get("escalated_at").isNull());
        boolean found = false;
        for (JsonNode h : d.get("history")) if ("escalated".equals(h.get("action").asText())) found = true;
        assertTrue(found);
    }

    @Test
    void overviewAndDigestRunEscalationFirst() {
        TestClient o = resident("sla2@example.test", "D-405", "owner", "9000022223");
        long id = o.post("/api/requests", Map.of("category", "lift", "title", "Lift buzzing")).body().get("id").asLong();
        jdbc.update("UPDATE requests SET created_at = DATEADD('DAY', -3, CURRENT_TIMESTAMP) WHERE id=?", id);
        assertEquals(1, admin.get("/api/admin/overview").body().get("ai").get("escalated_open").asInt());
        long id2 = o.post("/api/requests", Map.of("category", "lift", "title", "Lift humming")).body().get("id").asLong();
        jdbc.update("UPDATE requests SET created_at = DATEADD('DAY', -3, CURRENT_TIMESTAMP) WHERE id=?", id2);
        JsonNode g = admin.get("/api/admin/digest").body();
        assertEquals(2, g.get("stats").get("escalated").asInt());
        assertTrue(g.get("text").asText().contains("2 are past the 48h target"));
    }

    @Test
    void noticeDrafterAndDigest() {
        assertEquals(400, admin.post("/api/admin/ai/draft-notice", Map.of("text", "hi")).status());
        JsonNode d = admin.post("/api/admin/ai/draft-notice", Map.of("text", "water tank cleaning on sunday 10am to 12pm")).body();
        assertTrue(d.get("title").asText().contains("Water supply"));
        assertTrue(d.get("body").asText().startsWith("Dear residents,"));
        assertTrue(d.get("body").asText().endsWith("Managing Committee"));
        assertTrue(d.get("body").asText().contains("Water tank cleaning on sunday 10am to 12pm."));
        assertEquals("rules", d.get("source").asText());
        TestClient o = resident("dg@example.test", "E-505", "owner", "9000033333");
        o.post("/api/requests", Map.of("category", "plumbing", "title", "Flooding in bathroom"));
        JsonNode g = admin.get("/api/admin/digest").body();
        assertTrue(g.get("text").asText().contains("1 open request"));
        assertTrue(g.get("text").asText().contains("urgent"));
        assertTrue(g.get("text").asText().contains("1 still needs a vendor."));
        assertEquals("rules", g.get("source").asText());
        assertNotNull(g.get("stats"));
        assertEquals(403, o.get("/api/admin/digest").status());
    }

    @Test
    void digestPunctuation() {
        String t = AiService.digestRules(Map.of("open", 1, "unassigned", 1, "escalated", 0, "urgent", 0, "pending_users", 0, "whatsapp_7d", 0, "sla_hours", 48));
        assertEquals("Weekly digest: 1 open request. 1 still needs a vendor.", t);
        assertEquals("Weekly digest: 0 open requests. Nothing needs attention.",
                AiService.digestRules(Map.of("open", 0, "sla_hours", 48)));
    }
}
