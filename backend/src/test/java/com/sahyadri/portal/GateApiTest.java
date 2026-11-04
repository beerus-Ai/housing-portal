package com.sahyadri.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.support.ApiTestBase;
import com.sahyadri.portal.support.TestClient;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.stream.StreamSupport;
import org.junit.jupiter.api.Test;

/** Guards, visitor passes, resident tokens, verify, log (test/gate.test.js). */
class GateApiTest extends ApiTestBase {
    private static final long H = 3600_000L;

    private static String at(long ms) {
        return Instant.now().plusMillis(ms).toString();
    }

    private TestClient guard(String email) {
        TestClient c = client();
        var r = admin.post("/api/admin/guards", Map.of("name", "Gate Guard", "email", email, "password", PW));
        assertEquals(201, r.status());
        assertEquals(200, c.post("/api/login", Map.of("email", email, "password", PW)).status());
        c.id = r.body().get("id").asLong();
        return c;
    }

    private TestClient guard() {
        return guard("guard@society.test");
    }

    private JsonNode find(JsonNode arr, long id) {
        return StreamSupport.stream(arr.spliterator(), false).filter(p -> p.get("id").asLong() == id).findFirst().orElseThrow();
    }

    private boolean audited(String entity, String action) {
        return StreamSupport.stream(admin.get("/api/admin/audit").body().spliterator(), false)
                .anyMatch(a -> a.get("entity").asText().equals(entity) && a.get("action").asText().equals(action));
    }

    @Test
    void guardAccountsAdminOnlyValidationLogin() {
        TestClient res = person("own@t.test", "A-101", "owner");
        assertEquals(403, res.post("/api/admin/guards", Map.of("name", "G", "email", "g@t.test", "password", PW)).status());
        assertEquals(403, res.get("/api/admin/guards").status());
        assertEquals(400, admin.post("/api/admin/guards", Map.of("name", "G", "email", "bad", "password", PW)).status());
        assertEquals(400, admin.post("/api/admin/guards", Map.of("name", "G", "email", "g@t.test", "password", "short")).status());
        TestClient g = guard("g@t.test");
        assertEquals(409, admin.post("/api/admin/guards", Map.of("name", "G", "email", "g@t.test", "password", PW)).status());
        JsonNode me = g.get("/api/me").body();
        assertEquals("guard", me.get("role").asText());
        assertTrue(me.get("flat").isNull());
        JsonNode list = admin.get("/api/admin/guards").body();
        assertEquals(1, list.size());
        assertEquals("g@t.test", list.get(0).get("email").asText());
        assertFalse(list.get(0).has("password_hash"));
        assertEquals(403, g.delete("/api/admin/guards/" + g.id).status());
        assertEquals(404, admin.delete("/api/admin/guards/" + res.id).status());
        assertEquals(200, admin.delete("/api/admin/guards/" + g.id).status());
        assertEquals(401, g.get("/api/me").status());
        assertTrue(audited("user", "guard_created"));
        assertTrue(audited("user", "guard_deleted"));
        assertEquals(401, client().post("/api/login", Map.of("email", "g@t.test", "password", PW)).status());
    }

    @Test
    void guardAllowListEverythingElseIs403() {
        person("own@t.test", "A-101", "owner");
        admin.post("/api/notices", Map.of("title", "T", "body", "B"));
        TestClient g = guard();
        for (String u : List.of("/api/requests", "/api/household", "/api/notices", "/api/emergencies", "/api/contacts", "/api/lease",
                "/api/gate/passes", "/api/gate/me", "/api/admin/users", "/api/admin/stats", "/api/admin/audit", "/api/admin/guards",
                "/api/vehicles", "/api/parking", "/api/admin/workers", "/api/admin/overview")) {
            assertEquals(403, g.get(u).status(), u);
        }
        assertEquals(403, g.post("/api/emergencies", Map.of("type", "fire")).status());
        assertEquals(403, g.post("/api/gate/passes", Map.of("visitor_name", "V")).status());
        assertEquals(403, g.post("/api/gate/me/rotate").status());
        assertEquals(403, g.post("/api/gate/passes/1/cancel").status());
        assertEquals(200, g.get("/api/me").status());
        assertEquals(200, g.get("/api/notifications").status());
        assertEquals(200, g.get("/api/gate/log").status());
        assertEquals(200, g.get("/api/gate/overview").status());
        assertEquals(200, g.post("/api/me/password", Map.of("current", PW, "next", "N3wPassw0rd!")).status());
        assertEquals(200, g.post("/api/logout").status());
    }

    @Test
    void visitorPassesCreateListCancelValidationIsolation() {
        TestClient owner = person("own@t.test", "A-101", "owner");
        TestClient fam = person("fam@t.test", "A-101", "family");
        TestClient other = person("oth@t.test", "B-202", "owner");
        assertEquals(403, admin.post("/api/gate/passes", Map.of("visitor_name", "V")).status());
        assertEquals(400, owner.post("/api/gate/passes", Map.of("visitor_name", "  ")).status());
        assertEquals(400, owner.post("/api/gate/passes", Map.of("visitor_name", "x".repeat(101))).status());
        assertEquals(400, owner.post("/api/gate/passes", Map.of("visitor_name", "V", "purpose", "p".repeat(201))).status());
        assertEquals(400, owner.post("/api/gate/passes", Map.of("visitor_name", "V", "valid_from", "garbage")).status());
        assertEquals(400, owner.post("/api/gate/passes", Map.of("visitor_name", "V", "valid_from", at(H), "valid_until", at(0))).status());
        assertEquals(400, owner.post("/api/gate/passes", Map.of("visitor_name", "V", "valid_from", at(0), "valid_until", at(8 * 24 * H))).status());
        var ok = owner.post("/api/gate/passes", Map.of("visitor_name", "Courier", "purpose", "Parcel", "valid_from", at(0), "valid_until", at(7 * 24 * H - 1000)));
        assertEquals(201, ok.status());
        assertTrue(ok.body().get("token").asText().matches("[0-9a-f]{24}"));
        assertTrue(ok.body().get("code").asText().matches("\\d{6}"));
        assertEquals("HSP:" + ok.body().get("token").asText(), ok.body().get("qr").asText());
        var dflt = owner.post("/api/gate/passes", Map.of("visitor_name", "Default"));
        assertEquals(201, dflt.status());
        JsonNode mine = owner.get("/api/gate/passes").body();
        assertEquals(2, mine.size());
        long okId = ok.body().get("id").asLong();
        JsonNode row = find(mine, okId);
        assertEquals("active", row.get("status").asText());
        assertEquals("own", row.get("created_by_name").asText());
        assertEquals("A-101", row.get("flat").asText());
        assertTrue(row.get("valid_from").asText().matches("\\d{4}-\\d\\d-\\d\\d \\d\\d:\\d\\d:\\d\\d"));
        assertEquals(2, fam.get("/api/gate/passes").body().size());
        assertEquals(0, other.get("/api/gate/passes").body().size());
        assertEquals(2, admin.get("/api/gate/passes").body().size());
        assertEquals(404, other.post("/api/gate/passes/" + okId + "/cancel").status());
        assertEquals(403, fam.post("/api/gate/passes/" + okId + "/cancel").status());
        assertEquals(200, owner.post("/api/gate/passes/" + okId + "/cancel").status());
        assertEquals(409, owner.post("/api/gate/passes/" + okId + "/cancel").status());
        assertEquals("cancelled", find(owner.get("/api/gate/passes").body(), okId).get("status").asText());
        var fp = fam.post("/api/gate/passes", Map.of("visitor_name", "Friend"));
        assertEquals(200, fam.post("/api/gate/passes/" + fp.body().get("id").asLong() + "/cancel").status());
        assertEquals(200, admin.post("/api/gate/passes/" + dflt.body().get("id").asLong() + "/cancel").status());
        assertEquals(404, admin.post("/api/gate/passes/99999/cancel").status());
        assertTrue(audited("gate_pass", "created"));
        assertTrue(audited("gate_pass", "cancelled"));
    }

    @Test
    void perFlatCapOfTenActivePasses() {
        TestClient owner = person("own@t.test", "A-101", "owner");
        TestClient other = person("oth@t.test", "B-202", "owner");
        long first = 0;
        for (int i = 0; i < 10; i++) {
            var r = owner.post("/api/gate/passes", Map.of("visitor_name", "V" + i));
            assertEquals(201, r.status());
            if (i == 0) first = r.body().get("id").asLong();
        }
        var over = owner.post("/api/gate/passes", Map.of("visitor_name", "Eleven"));
        assertEquals(429, over.status());
        assertTrue(over.body().get("error").asText().contains("10 active"));
        assertEquals(201, other.post("/api/gate/passes", Map.of("visitor_name", "Fine")).status());
        assertEquals(200, owner.post("/api/gate/passes/" + first + "/cancel").status());
        assertEquals(201, owner.post("/api/gate/passes", Map.of("visitor_name", "Again")).status());
    }

    @Test
    void verifyByCodeAndTokenSingleUseNotifiesCreator() {
        TestClient owner = person("own@t.test", "A-101", "owner");
        TestClient g = guard();
        JsonNode a = owner.post("/api/gate/passes", Map.of("visitor_name", "Plumber", "purpose", "Leak")).body();
        var r1 = g.post("/api/gate/verify", Map.of("code", a.get("code").asText()));
        assertEquals(200, r1.status());
        assertEquals("allowed", r1.body().get("result").asText());
        assertEquals("visitor", r1.body().get("kind").asText());
        assertEquals("Plumber", r1.body().get("name").asText());
        assertEquals("A-101", r1.body().get("flat").asText());
        assertEquals("Leak", r1.body().get("purpose").asText());
        assertEquals(5, r1.body().size());
        var r2 = g.post("/api/gate/verify", Map.of("code", a.get("code").asText()));
        assertEquals("denied", r2.body().get("result").asText());
        assertEquals("used", r2.body().get("reason").asText());
        assertEquals("used", g.post("/api/gate/verify", Map.of("token", a.get("qr").asText())).body().get("reason").asText());
        assertEquals("used", owner.get("/api/gate/passes").body().get(0).get("status").asText());
        assertTrue(StreamSupport.stream(owner.get("/api/notifications").body().spliterator(), false)
                .anyMatch(n -> n.get("message").asText().equals("Your visitor Plumber has entered")));
        JsonNode b = owner.post("/api/gate/passes", Map.of("visitor_name", "Guest")).body();
        var t = g.post("/api/gate/verify", Map.of("token", "  HSP:" + b.get("token").asText() + "  "));
        assertEquals("allowed", t.body().get("result").asText());
        assertEquals("Guest", t.body().get("name").asText());
        JsonNode c = owner.post("/api/gate/passes", Map.of("visitor_name", "Cancelled")).body();
        owner.post("/api/gate/passes/" + c.get("id").asLong() + "/cancel");
        assertEquals("cancelled", g.post("/api/gate/verify", Map.of("code", c.get("code").asText())).body().get("reason").asText());
        var u = g.post("/api/gate/verify", Map.of("code", "000000"));
        assertEquals("{\"result\":\"denied\",\"reason\":\"unknown\"}", u.body().toString());
        assertEquals("{\"result\":\"denied\",\"reason\":\"unknown\"}", g.post("/api/gate/verify", Map.of("token", "HSP:" + "a".repeat(24))).body().toString());
        assertEquals(400, g.post("/api/gate/verify", Map.of()).status());
        // numeric code is accepted like in JS
        JsonNode n = owner.post("/api/gate/passes", Map.of("visitor_name", "Numeric")).body();
        String nc = n.get("code").asText();
        if (!nc.startsWith("0")) {
            assertEquals("allowed", g.post("/api/gate/verify", "{\"code\":" + nc + "}").body().get("result").asText());
        }
    }

    @Test
    void verifyExpiredAndNotYetValidWindows() {
        TestClient owner = person("own@t.test", "A-101", "owner");
        TestClient g = guard();
        JsonNode past = owner.post("/api/gate/passes", Map.of("visitor_name", "Late", "valid_from", at(-2 * H), "valid_until", at(-H))).body();
        JsonNode future = owner.post("/api/gate/passes", Map.of("visitor_name", "Early", "valid_from", at(H), "valid_until", at(2 * H))).body();
        assertEquals("expired", g.post("/api/gate/verify", Map.of("code", past.get("code").asText())).body().get("reason").asText());
        assertEquals("not_yet_valid", g.post("/api/gate/verify", Map.of("token", future.get("token").asText())).body().get("reason").asText());
        JsonNode list = owner.get("/api/gate/passes").body();
        assertEquals("expired", find(list, past.get("id").asLong()).get("status").asText());
        assertEquals("active", find(list, future.get("id").asLong()).get("status").asText());
        assertTrue(find(list, future.get("id").asLong()).get("used_at").isNull());
    }

    @Test
    void residentTokenVerifyReusableRotateInvalidatesOld() {
        TestClient owner = person("own@t.test", "A-101", "owner");
        TestClient g = guard();
        assertEquals(403, admin.get("/api/gate/me").status());
        JsonNode me = owner.get("/api/gate/me").body();
        assertTrue(me.get("token").asText().matches("[0-9a-f]{24}"));
        assertEquals("HSP:" + me.get("token").asText(), me.get("qr").asText());
        assertEquals(me.get("qr").asText(), me.get("nfc").asText());
        assertEquals(me.get("token").asText(), owner.get("/api/gate/me").body().get("token").asText());
        for (int i = 0; i < 2; i++) {
            JsonNode r = g.post("/api/gate/verify", Map.of("token", me.get("nfc").asText())).body();
            assertEquals("{\"result\":\"allowed\",\"kind\":\"resident\",\"name\":\"own\",\"flat\":\"A-101\"}", r.toString());
        }
        var rot = owner.post("/api/gate/me/rotate");
        assertEquals(200, rot.status());
        assertFalse(rot.body().get("token").asText().equals(me.get("token").asText()));
        assertEquals("{\"result\":\"denied\",\"reason\":\"unknown\"}", g.post("/api/gate/verify", Map.of("token", me.get("qr").asText())).body().toString());
        assertEquals("allowed", g.post("/api/gate/verify", Map.of("token", rot.body().get("qr").asText())).body().get("result").asText());
        assertTrue(audited("resident_token", "rotated"));
        // feature flag off blocks residents only
        admin.put("/api/admin/settings", Map.of("features", Map.of("gate", false)));
        assertEquals(403, owner.get("/api/gate/me").status());
        assertEquals(403, owner.post("/api/gate/passes", Map.of("visitor_name", "V")).status());
        assertEquals(403, owner.get("/api/gate/passes").status());
        assertEquals(200, admin.get("/api/gate/passes").status());
        assertEquals(200, g.post("/api/gate/verify", Map.of("code", "111111")).status());
    }

    @Test
    void residentsCannotVerifyOrReadLogAdminMay() {
        TestClient owner = person("own@t.test", "A-101", "owner");
        TestClient g = guard();
        JsonNode p = owner.post("/api/gate/passes", Map.of("visitor_name", "V")).body();
        assertEquals(403, owner.post("/api/gate/verify", Map.of("code", p.get("code").asText())).status());
        assertEquals(403, owner.get("/api/gate/log").status());
        assertEquals(403, g.post("/api/gate/passes", Map.of("visitor_name", "V")).status());
        assertEquals("allowed", admin.post("/api/gate/verify", Map.of("code", p.get("code").asText())).body().get("result").asText());
    }

    @Test
    void bruteForceTenDeniedThen429PerGuard() {
        TestClient g = guard();
        TestClient g2 = guard("g2@society.test");
        for (int i = 0; i < 10; i++) {
            var r = g.post("/api/gate/verify", Map.of("code", String.valueOf(100000 + i)));
            assertEquals(200, r.status());
            assertEquals("denied", r.body().get("result").asText());
        }
        assertEquals(429, g.post("/api/gate/verify", Map.of("code", "123456")).status());
        assertEquals(200, g2.post("/api/gate/verify", Map.of("code", "123456")).status());
    }

    @Test
    void gateLogRecordsEveryAttemptWithGuardName() {
        TestClient owner = person("own@t.test", "A-101", "owner");
        TestClient g = guard();
        JsonNode p = owner.post("/api/gate/passes", Map.of("visitor_name", "Visitor")).body();
        JsonNode me = owner.get("/api/gate/me").body();
        g.post("/api/gate/verify", Map.of("code", p.get("code").asText()));
        g.post("/api/gate/verify", Map.of("code", p.get("code").asText()));
        g.post("/api/gate/verify", Map.of("token", me.get("qr").asText()));
        g.post("/api/gate/verify", Map.of("code", "000001"));
        JsonNode log = g.get("/api/gate/log").body();
        assertEquals(4, log.size());
        String[][] expect = {{"unknown", "denied", "unknown"}, {"resident", "allowed", null}, {"visitor", "denied", "used"}, {"visitor", "allowed", null}};
        for (int i = 0; i < 4; i++) {
            assertEquals(expect[i][0], log.get(i).get("kind").asText());
            assertEquals(expect[i][1], log.get(i).get("result").asText());
            if (expect[i][2] == null) assertTrue(log.get(i).get("reason").isNull());
            else assertEquals(expect[i][2], log.get(i).get("reason").asText());
        }
        assertEquals("Visitor", log.get(3).get("subject").asText());
        assertEquals("A-101", log.get(3).get("flat").asText());
        assertEquals("Gate Guard", log.get(0).get("guard_name").asText());
        assertFalse(log.toString().contains(p.get("token").asText()));
        assertEquals(4, admin.get("/api/gate/log").body().size());
        assertTrue(audited("gate_pass", "used"));
    }
}
