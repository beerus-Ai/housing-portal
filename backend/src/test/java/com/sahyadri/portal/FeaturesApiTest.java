package com.sahyadri.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.support.ApiTestBase;
import com.sahyadri.portal.support.TestClient;
import java.util.LinkedHashSet;
import java.util.Map;
import java.util.Set;
import java.util.stream.StreamSupport;
import org.junit.jupiter.api.Test;

/** Emergencies and society contacts (test/features.test.js). */
class FeaturesApiTest extends ApiTestBase {

    private boolean anyNote(TestClient c, String regex) {
        return StreamSupport.stream(c.get("/api/notifications").body().spliterator(), false)
                .anyMatch(n -> n.get("message").asText().matches(regex));
    }

    private boolean audited(String entity, String action) {
        return StreamSupport.stream(admin.get("/api/admin/audit").body().spliterator(), false)
                .anyMatch(a -> a.get("entity").asText().equals(entity) && a.get("action").asText().equals(action));
    }

    @Test
    void emergencyRaiseValidateVisibilityResolve() {
        TestClient a = person("ra@example.test", "B-101", "owner");
        TestClient b = person("rb@example.test", "C-202", "owner");
        assertEquals(401, client().post("/api/emergencies", Map.of("type", "fire")).status());
        assertEquals(401, client().get("/api/emergencies").status());
        assertEquals(400, a.post("/api/emergencies", Map.of("type", "earthquake")).status());
        assertEquals(400, a.post("/api/emergencies", Map.of("type", "fire", "note", "x".repeat(501))).status());
        assertEquals(400, a.post("/api/emergencies", "{\"type\":\"fire\",\"note\":5}").status());
        var r = a.post("/api/emergencies", Map.of("type", "fire", "note", "Smoke in kitchen"));
        assertEquals(201, r.status());
        assertTrue(r.body().get("id").asLong() > 0);
        assertTrue(anyNote(admin, "EMERGENCY \\(Fire\\) from flat B-101: Smoke in kitchen"));
        var r2 = b.post("/api/emergencies", Map.of("type", "lift"));
        assertEquals(201, r2.status());

        JsonNode mine = a.get("/api/emergencies").body();
        assertEquals(1, mine.size());
        assertEquals("B-101", mine.get(0).get("flat").asText());
        assertEquals("active", mine.get(0).get("status").asText());
        assertEquals("ra", mine.get(0).get("user_name").asText());
        JsonNode all = admin.get("/api/emergencies").body();
        assertEquals(2, all.size());
        assertEquals(r2.body().get("id").asLong(), all.get(0).get("id").asLong());

        long id = r.body().get("id").asLong();
        assertEquals(403, a.post("/api/emergencies/" + id + "/resolve").status());
        assertEquals(404, admin.post("/api/emergencies/9999/resolve").status());
        assertEquals(404, admin.post("/api/emergencies/abc/resolve").status());
        assertEquals(200, admin.post("/api/emergencies/" + id + "/resolve").status());
        assertEquals(409, admin.post("/api/emergencies/" + id + "/resolve").status());
        JsonNode done = a.get("/api/emergencies").body().get(0);
        assertEquals("resolved", done.get("status").asText());
        assertFalse(done.get("resolved_at").isNull());
        assertTrue(anyNote(a, ".*resolved.*"));
        assertTrue(audited("emergency", "raised"));
        assertTrue(audited("emergency", "resolved"));
    }

    @Test
    void emergencyAllSevenTypesAndFeatureFlagAndPermission() {
        TestClient a = person("ty@example.test", "B-1", "owner");
        for (String t : new String[] {"lift", "medical", "fire", "theft"}) assertEquals(201, a.post("/api/emergencies", Map.of("type", t)).status());
        assertEquals(400, a.post("/api/emergencies", Map.of("note", "no type")).status());
        assertEquals(200, admin.put("/api/admin/settings", Map.of("features", Map.of("emergency", false))).status());
        var off = a.post("/api/emergencies", Map.of("type", "other"));
        assertEquals(403, off.status());
        assertEquals("This feature is turned off", off.body().get("error").asText());
        assertEquals(403, a.get("/api/emergencies").status());
        assertEquals(200, admin.get("/api/emergencies").status());
        admin.put("/api/admin/settings", Map.of("features", Map.of("emergency", true)));
        admin.put("/api/admin/access", Map.of("matrix", Map.of("owner", Map.of("emergency.raise", false))));
        var denied = a.post("/api/emergencies", Map.of("type", "other"));
        assertEquals(403, denied.status());
        assertEquals("Your role does not have access to this", denied.body().get("error").asText());
    }

    @Test
    void emergencyRateLimitFivePerHour() {
        TestClient a = person("rl@example.test", "D-1", "owner");
        for (int i = 0; i < 5; i++) assertEquals(201, a.post("/api/emergencies", Map.of("type", "other")).status());
        var r = a.post("/api/emergencies", Map.of("type", "other"));
        assertEquals(429, r.status());
        assertTrue(r.body().get("error").asText().contains("5 alerts per hour"));
    }

    @Test
    void contactsCreateListDeleteValidationRoles() {
        TestClient a = person("rc@example.test", "E-5", "owner");
        assertEquals(401, client().get("/api/contacts").status());
        assertEquals(0, a.get("/api/contacts").body().size());
        assertEquals(403, a.post("/api/contacts", Map.of("name", "Guard", "role", "Security", "phone", "+91 98765 43210")).status());
        assertEquals(400, admin.post("/api/contacts", Map.of("name", "Guard", "role", "Security", "phone", "abc")).status());
        assertEquals(400, admin.post("/api/contacts", Map.of("name", "Guard", "role", "Security", "phone", "12")).status());
        assertEquals(400, admin.post("/api/contacts", Map.of("name", "Guard", "role", "Security", "phone", "1234567", "icon", "bogus")).status());
        assertEquals(400, admin.post("/api/contacts", Map.of("name", " ", "role", "Security", "phone", "1234567")).status());
        var z = admin.post("/api/contacts", Map.of("name", "Zed Plumber", "role", "Plumber", "phone", "+91 98765 43210", "icon", "wrench"));
        assertEquals(201, z.status());
        assertEquals(201, admin.post("/api/contacts", Map.of("name", "Anil Guard", "role", "Security", "phone", "022-1234567")).status());
        JsonNode list = a.get("/api/contacts").body();
        assertEquals("Anil Guard", list.get(0).get("name").asText());
        assertEquals("Zed Plumber", list.get(1).get("name").asText());
        assertEquals("phone", list.get(0).get("icon").asText());
        Set<String> keys = new LinkedHashSet<>();
        list.get(0).fieldNames().forEachRemaining(keys::add);
        assertEquals(Set.of("icon", "id", "name", "phone", "role"), keys);
        long zid = z.body().get("id").asLong();
        assertEquals(403, a.delete("/api/contacts/" + zid).status());
        assertEquals(200, admin.delete("/api/contacts/" + zid).status());
        assertEquals(404, admin.delete("/api/contacts/" + zid).status());
        assertEquals(1, a.get("/api/contacts").body().size());
        assertTrue(audited("contact", "created"));
        assertTrue(audited("contact", "deleted"));
        // feature flag and permission
        admin.put("/api/admin/settings", Map.of("features", Map.of("contacts", false)));
        assertEquals(403, a.get("/api/contacts").status());
        assertEquals(200, admin.get("/api/contacts").status());
    }
}
