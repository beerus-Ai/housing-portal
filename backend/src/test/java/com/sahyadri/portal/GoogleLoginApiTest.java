package com.sahyadri.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.support.ApiTestBase;
import com.sahyadri.portal.support.TestClient;
import java.util.HashMap;
import java.util.Map;
import org.junit.jupiter.api.Test;

class GoogleLoginApiTest extends ApiTestBase {

    private Map<String, Object> good(String email) {
        Map<String, Object> m = new HashMap<>();
        m.put("aud", CID);
        m.put("iss", "https://accounts.google.com");
        m.put("email", email);
        m.put("email_verified", true);
        m.put("exp", System.currentTimeMillis() / 1000 + 600);
        return m;
    }

    private Map<String, Object> with(Map<String, Object> m, String k, Object v) {
        Map<String, Object> c = new HashMap<>(m);
        c.put(k, v);
        return c;
    }

    private TestClient.Resp post(String cred) {
        return client().post("/api/auth/google", Map.of("credential", cred));
    }

    @Test
    void signsInExistingAccountsOnlyWithAVerifiedToken() {
        person("gu@example.test", "F-1", "owner");
        person("pend@example.test", "F-2", "tenant", false);

        google.claims = good("gu@example.test");
        var ns = post("tok");
        assertEquals(404, ns.status());
        assertEquals("Google sign-in is not set up", ns.body().get("error").asText());

        assertEquals(200, admin.put("/api/admin/settings", Map.of("google_client_id", CID)).status());

        TestClient c = client();
        var ok = c.post("/api/auth/google", Map.of("credential", "tok"));
        assertEquals(200, ok.status());
        assertEquals("gu@example.test", ok.body().get("email").asText());
        assertEquals(200, c.get("/api/me").status());
        google.claims = good("GU@Example.test");
        assertEquals(200, post("tok").status()); // case-insensitive
        boolean audited = false;
        for (JsonNode a : admin.get("/api/admin/audit").body()) {
            audited |= a.get("action").asText().equals("login") && a.hasNonNull("detail") && a.get("detail").asText().equals("method google");
        }
        assertTrue(audited);

        google.claims = good("nobody@example.test");
        var unk = post("tok");
        assertEquals(404, unk.status());
        assertEquals("No account for this Google email. Join first, then sign in.", unk.body().get("error").asText());

        Map<String, Object> g = good("gu@example.test");
        google.claims = with(g, "email_verified", false);
        assertEquals(401, post("tok").status());
        google.claims = with(g, "email_verified", "false");
        assertEquals(401, post("tok").status());
        google.claims = with(g, "email_verified", "true"); // tokeninfo returns strings
        assertEquals(200, post("tok").status());
        google.claims = with(g, "aud", "other-client");
        assertEquals(401, post("tok").status());
        google.claims = with(g, "iss", "https://evil.example");
        assertEquals(401, post("tok").status());
        google.claims = with(g, "exp", System.currentTimeMillis() / 1000 - 10);
        assertEquals(401, post("tok").status());
        google.claims = with(g, "exp", "not-a-number");
        assertEquals(401, post("tok").status());
        google.claims = g;
        var boom = post("boom");
        assertEquals(401, boom.status());
        assertEquals("Google sign-in could not be verified", boom.body().get("error").asText());
        var missing = client().post("/api/auth/google", Map.of());
        assertEquals(400, missing.status());
        assertEquals("Missing Google credential", missing.body().get("error").asText());
        assertEquals(400, post("x".repeat(4097)).status());

        google.claims = good("pend@example.test");
        assertEquals(403, post("tok").status());

        google.claims = good("gu@example.test");
        long guId = 0;
        for (JsonNode u : admin.get("/api/admin/users?q=gu@").body()) guId = u.get("id").asLong();
        admin.patch("/api/admin/users/" + guId, Map.of("status", "suspended"));
        var sus = post("tok");
        assertEquals(403, sus.status());
        assertTrue(sus.body().get("error").asText().contains("suspended"));

        assertEquals(0, admin.get("/api/admin/users?q=nobody").body().size()); // never auto-creates
    }

    @Test
    void failedVerificationsAreThrottledPerIp() {
        admin.put("/api/admin/settings", Map.of("google_client_id", CID));
        google.claims = good("x@example.test");
        google.claims = with(google.claims, "aud", "other");
        for (int i = 0; i < 30; i++) assertEquals(401, post("tok").status());
        assertEquals(429, post("tok").status());
    }
}
