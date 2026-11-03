package com.sahyadri.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.support.ApiTestBase;
import com.sahyadri.portal.support.TestClient;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

class SettingsApiTest extends ApiTestBase {

    private boolean auditHas(String entity, String action, String detail) {
        for (JsonNode a : admin.get("/api/admin/audit").body()) {
            if (a.get("entity").asText().equals(entity) && a.get("action").asText().equals(action)
                    && (detail == null || (a.hasNonNull("detail") && a.get("detail").asText().equals(detail)))) return true;
        }
        return false;
    }

    @Test
    void publicSettingsNeedNoSignInAndHaveDefaults() {
        var r = client().get("/api/settings");
        assertEquals(200, r.status());
        JsonNode b = r.body();
        assertEquals("Sahyadri Heights", b.get("society_name").asText());
        assertEquals("Co-operative Housing Society", b.get("society_kind").asText());
        assertEquals("", b.get("google_client_id").asText());
        for (String f : List.of("emergency", "gate", "contacts", "notices", "parking")) assertTrue(b.get("features").get(f).asBoolean());
        assertEquals(5, b.get("features").size());
        assertEquals(4, b.size());
    }

    @Test
    void adminSettingsUpdateValidationRoleAndAudit() {
        TestClient t = person("t1@example.test", "B-1", "tenant");
        assertEquals(403, t.get("/api/admin/settings").status());
        assertEquals(403, t.put("/api/admin/settings", Map.of("society_name", "X")).status());
        assertEquals(400, admin.put("/api/admin/settings", Map.of("society_name", "")).status());
        assertEquals("Society name is required (up to 100 characters)", admin.put("/api/admin/settings", Map.of("society_name", "")).body().get("error").asText());
        assertEquals(400, admin.put("/api/admin/settings", Map.of("society_name", "x".repeat(101))).status());
        var kind = admin.put("/api/admin/settings", Map.of("society_kind", 5));
        assertEquals(400, kind.status());
        assertEquals("Society type is required (up to 100 characters)", kind.body().get("error").asText());
        var bad = admin.put("/api/admin/settings", Map.of("google_client_id", "bad id<script>"));
        assertEquals(400, bad.status());
        assertEquals("Google client ID has invalid characters", bad.body().get("error").asText());
        assertEquals(400, admin.put("/api/admin/settings", Map.of("features", Map.of("gate", "no"))).status());
        assertEquals(400, admin.put("/api/admin/settings", Map.of("features", Map.of("bogus", true))).status());
        assertEquals("Features must be an object", admin.put("/api/admin/settings", Map.of("features", List.of())).body().get("error").asText());
        var ok = admin.put("/api/admin/settings", Map.of("society_name", "Lake View", "google_client_id", CID, "features", Map.of("notices", false)));
        assertEquals(200, ok.status());
        JsonNode pub = admin.get("/api/settings").body();
        assertEquals("Lake View", pub.get("society_name").asText());
        assertEquals("Co-operative Housing Society", pub.get("society_kind").asText());
        assertEquals(CID, pub.get("google_client_id").asText());
        assertFalse(pub.get("features").get("notices").asBoolean());
        assertTrue(pub.get("features").get("gate").asBoolean());
        assertEquals("", admin.put("/api/admin/settings", Map.of("google_client_id", "")).body().get("google_client_id").asText());
        assertEquals("Lake View", admin.get("/api/admin/settings").body().get("society_name").asText());
        assertTrue(auditHas("settings", "feature_off", "notices"));
        assertTrue(auditHas("settings", "updated", "society_name: Sahyadri Heights -> Lake View"));
        assertTrue(auditHas("settings", "updated", "google_client_id changed"));
    }

    @Test
    void featureTogglesBlockResidentsButNeverTheCommittee() {
        TestClient o = person("o1@example.test", "A-1", "owner");
        assertEquals(200, o.get("/api/test/needs-gate-pass").status());
        assertEquals(200, admin.put("/api/admin/settings", Map.of("features", Map.of("gate", false))).status());
        var r = o.get("/api/test/needs-gate-pass");
        assertEquals(403, r.status());
        assertEquals("This feature is turned off", r.body().get("error").asText());
        assertEquals(200, admin.get("/api/test/needs-gate-pass").status());
        assertFalse(o.get("/api/me").body().get("features").get("gate").asBoolean());
    }

    @Test
    void accessMatrixGetPutValidationEnforcementAndMe() {
        TestClient o = person("o2@example.test", "A-2", "owner");
        TestClient t = person("t2@example.test", "A-2", "tenant");
        TestClient f = person("f2@example.test", "A-2", "family");
        JsonNode a = admin.get("/api/admin/access").body();
        assertEquals(List.of("owner", "tenant", "family"), List.of(a.get("roles").get(0).asText(), a.get("roles").get(1).asText(), a.get("roles").get(2).asText()));
        assertEquals(9, a.get("permissions").size());
        for (JsonNode p : a.get("permissions")) assertTrue(p.hasNonNull("key") && p.hasNonNull("label"));
        assertTrue(a.get("matrix").get("owner").get("household.manage").asBoolean());
        assertFalse(a.get("matrix").get("tenant").get("household.manage").asBoolean());
        assertTrue(a.get("matrix").get("tenant").get("gate.pass").asBoolean());
        assertFalse(a.get("matrix").get("family").get("lease.view").asBoolean());
        assertEquals(403, o.get("/api/admin/access").status());
        assertEquals(403, o.put("/api/admin/access", Map.of("matrix", Map.of())).status());

        assertEquals(9, o.get("/api/me").body().get("permissions").size());
        JsonNode fp = f.get("/api/me").body().get("permissions");
        assertFalse(fp.toString().contains("lease.view"));
        assertTrue(fp.toString().contains("gate.pass"));
        assertEquals(9, admin.get("/api/me").body().get("permissions").size());

        for (Object bad : new Object[] {Map.of("admin", Map.of("gate.pass", false)), Map.of("tenant", Map.of("nope.key", true)),
                Map.of("tenant", Map.of("gate.pass", "no")), Map.of("tenant", List.of()), List.of()}) {
            assertEquals(400, admin.put("/api/admin/access", Map.of("matrix", bad)).status());
        }
        assertEquals("matrix is required", admin.put("/api/admin/access", Map.of()).body().get("error").asText());
        assertEquals("Unknown role", admin.put("/api/admin/access", Map.of("matrix", Map.of("admin", Map.of()))).body().get("error").asText());
        assertEquals("Unknown permission", admin.put("/api/admin/access", Map.of("matrix", Map.of("tenant", Map.of("x", true)))).body().get("error").asText());
        assertEquals("Permissions must be true or false", admin.put("/api/admin/access", Map.of("matrix", Map.of("tenant", Map.of("gate.pass", 1)))).body().get("error").asText());

        // enforcement through can(permission)
        assertEquals(200, t.get("/api/test/needs-gate-pass").status());
        var put = admin.put("/api/admin/access", Map.of("matrix", Map.of("tenant", Map.of("gate.pass", false, "contacts.read", false, "notice.read", false))));
        assertEquals(200, put.status());
        assertFalse(put.body().get("matrix").get("tenant").get("gate.pass").asBoolean());
        assertTrue(put.body().get("matrix").get("owner").get("gate.pass").asBoolean());
        var denied = t.get("/api/test/needs-gate-pass");
        assertEquals(403, denied.status());
        assertEquals("Your role does not have access to this", denied.body().get("error").asText());
        assertEquals(200, o.get("/api/test/needs-gate-pass").status());
        assertEquals(200, admin.get("/api/test/needs-gate-pass").status()); // admin always passes
        assertFalse(t.get("/api/me").body().get("permissions").toString().contains("gate.pass"));
        assertTrue(t.get("/api/me").body().get("permissions").toString().contains("request.create"));
        assertTrue(auditHas("access", "changed", "tenant gate.pass: true -> false"));
        // setting a value that is already in place writes no audit row
        long before = admin.get("/api/admin/audit").body().size();
        admin.put("/api/admin/access", Map.of("matrix", Map.of("tenant", Map.of("gate.pass", false))));
        assertEquals(before, admin.get("/api/admin/audit").body().size());
        // a guard has no permissions at all
        assertEquals(403, t.get("/api/test/gate-staff").status());
        assertEquals("Gate staff only", t.get("/api/test/gate-staff").body().get("error").asText());
        assertEquals(200, admin.get("/api/test/gate-staff").status());
    }

    @Test
    void securityHeadersAndCspFollowTheGoogleClientId() {
        var before = client().get("/api/settings");
        String csp = before.header("Content-Security-Policy");
        assertFalse(csp.contains("google"));
        assertTrue(csp.contains("script-src 'self';") && csp.contains("frame-ancestors 'none'"));
        assertEquals("nosniff", before.header("X-Content-Type-Options"));
        assertEquals("DENY", before.header("X-Frame-Options"));
        assertEquals("same-origin", before.header("Referrer-Policy"));
        assertEquals("same-origin", before.header("Cross-Origin-Opener-Policy"));
        assertEquals("same-origin", before.header("Cross-Origin-Resource-Policy"));
        assertEquals("camera=(self), microphone=(), geolocation=()", before.header("Permissions-Policy"));
        assertEquals("no-store", before.header("Cache-Control"));
        assertEquals(null, before.header("Strict-Transport-Security")); // only in production
        assertEquals("nosniff", client().get("/api/me").header("X-Content-Type-Options")); // also on 401s

        admin.put("/api/admin/settings", Map.of("google_client_id", CID));
        String after = client().get("/api/settings").header("Content-Security-Policy");
        for (String h : new String[] {"script-src 'self' https://accounts.google.com/gsi/client", "connect-src 'self' https://accounts.google.com/gsi/",
                "frame-src https://accounts.google.com/gsi/", "https://accounts.google.com/gsi/style", "https://*.googleusercontent.com",
                "frame-ancestors 'none'", "object-src 'none'"}) assertTrue(after.contains(h), h);
        admin.put("/api/admin/settings", Map.of("google_client_id", ""));
        assertFalse(client().get("/api/settings").header("Content-Security-Policy").contains("google"));
    }

    @Test
    void crossOriginWritesAreBlocked() {
        var c = client();
        var body = Map.of("email", "x@example.test", "password", "x");
        var evil = c.call("POST", "/api/login", body, "Origin", "https://evil.example", "Host", "portal.example");
        assertEquals(403, evil.status());
        assertEquals("Cross-origin request blocked", evil.body().get("error").asText());
        assertEquals(401, c.call("POST", "/api/login", body, "Origin", "https://portal.example", "Host", "portal.example").status());
        assertEquals(401, c.call("POST", "/api/login", body, "Origin", "http://localhost:8080", "Host", "localhost:8080").status());
        assertEquals(403, c.call("POST", "/api/login", body, "Origin", "null", "Host", "portal.example").status());
        assertEquals(200, c.call("GET", "/api/settings", null, "Origin", "https://evil.example", "Host", "portal.example").status()); // reads are fine
    }
}
