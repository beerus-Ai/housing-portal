package com.sahyadri.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.support.ApiTestBase;
import com.sahyadri.portal.support.TestClient;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

/** Stats, CSV export, pulse and the role denials from test/e2e.test.js. */
class ReportApiTest extends ApiTestBase {
    @Autowired PasswordEncoder encoder;

    @Test
    void roleDenialsAndAnonymous() {
        TestClient anon = client();
        for (String u : List.of("/api/requests", "/api/notices", "/api/lease", "/api/admin/stats", "/api/admin/export.csv", "/api/pulse",
                "/api/vendors", "/api/household", "/api/admin/leases")) {
            assertEquals(401, anon.get(u).status(), u);
        }
        TestClient res = person("r@example.test", "A-1", "owner");
        for (String u : List.of("/api/admin/stats", "/api/admin/export.csv", "/api/vendors", "/api/admin/leases")) {
            assertEquals(403, res.get(u).status(), u);
            assertEquals("Admin only", res.get(u).body().get("error").asText());
        }
        assertEquals(403, res.post("/api/vendors", Map.of("name", "x", "trade", "y")).status());
        assertEquals(403, res.post("/api/notices", Map.of("title", "t", "body", "b")).status());
    }

    @Test
    void pulseChangesWhenVisibleDataChanges() {
        TestClient res = person("r@example.test", "A-1", "owner");
        String a1 = admin.get("/api/pulse").body().get("v").asText(), r1 = res.get("/api/pulse").body().get("v").asText();
        assertEquals(a1, admin.get("/api/pulse").body().get("v").asText()); // stable
        assertEquals(3, a1.split("\\|", -1).length);
        assertEquals(6, r1.split("\\|", -1).length);
        admin.post("/api/notices", Map.of("title", "Pulse test", "body", "x"));
        assertNotEquals(a1, admin.get("/api/pulse").body().get("v").asText());
        assertNotEquals(r1, res.get("/api/pulse").body().get("v").asText());
        String r2 = res.get("/api/pulse").body().get("v").asText();
        res.multipart("/api/requests", Map.of("category", "other", "title", "t"));
        assertNotEquals(r2, res.get("/api/pulse").body().get("v").asText());
    }

    @Test
    void guardPulseIsOnlyTheirOwnNotificationMarker() {
        jdbc.update("INSERT INTO users(name,email,password_hash,role,status) VALUES('G','g@example.test',?, 'guard','approved')", encoder.encode(PW));
        long id = jdbc.queryForObject("SELECT id FROM users WHERE email='g@example.test'", Long.class);
        TestClient g = client();
        assertEquals(200, g.post("/api/login", Map.of("email", "g@example.test", "password", PW)).status());
        assertEquals("0", g.get("/api/pulse").body().get("v").asText());
        jdbc.update("INSERT INTO notifications(user_id,message) VALUES(?,?)", id, "x");
        assertNotEquals("0", g.get("/api/pulse").body().get("v").asText());
        assertEquals(403, g.get("/api/requests").status()); // allow-list
    }

    @Test
    void statsHaveEveryDashboardField() {
        JsonNode empty = admin.get("/api/admin/stats").body();
        assertTrue(empty.get("avg_rating").isNull());
        assertEquals(0, empty.get("sla").get("total").asInt());
        assertEquals(0, empty.get("by_status").size());

        TestClient owner = person("o@example.test", "A-1", "owner");
        TestClient o2 = person("p@example.test", "B-1", "owner");
        long a = owner.multipart("/api/requests", Map.of("category", "electrical", "title", "Fan")).body().get("id").asLong();
        owner.multipart("/api/requests", Map.of("category", "electrical", "title", "Light"));
        o2.multipart("/api/requests", Map.of("category", "lift", "title", "Lift"));
        long v = admin.post("/api/vendors", Map.of("name", "Volt Test", "trade", "electrical")).body().get("id").asLong();
        admin.post("/api/vendors", Map.of("name", "Idle", "trade", "other"));
        admin.post("/api/requests/" + a + "/assign", Map.of("vendor_id", v));
        admin.post("/api/requests/" + a + "/status", Map.of("status", "closed"));

        JsonNode st = admin.get("/api/admin/stats").body();
        assertEquals(3, st.get("sla").get("total").asInt());
        assertEquals(3, st.get("sla").get("within").asInt());
        assertEquals(0, st.get("sla").get("overdue").asInt());
        assertEquals(2, st.get("unassigned").asInt());
        assertEquals(1, st.get("awaiting_rating").asInt());
        assertEquals(2, st.get("households").asInt());
        assertEquals(0, st.get("pending_users").asInt());
        assertEquals(0, st.get("notices_30d").asInt());
        assertEquals(2, st.get("by_category_open").size());
        assertEquals(2, st.get("oldest_open").size());
        assertEquals("Light", st.get("oldest_open").get(0).get("title").asText());
        JsonNode cats = st.get("by_category");
        assertEquals("electrical", cats.get(0).get("category").asText());
        assertEquals(1, cats.get(0).get("open").asInt());
        assertEquals(2, cats.get(0).get("raised_30d").asInt());
        assertEquals(1, st.get("weekly").size());
        assertEquals(0, st.get("weekly").get(0).get("weeks_ago").asInt());
        assertEquals(3, st.get("weekly").get(0).get("n").asInt());
        assertEquals(2, st.get("vendor_ratings").size());

        assertEquals(200, owner.post("/api/requests/" + a + "/rate", Map.of("rating", 5)).status());
        st = admin.get("/api/admin/stats").body();
        assertEquals(5, st.get("avg_rating").asInt());
        assertEquals("Volt Test", st.get("vendor_ratings").get(0).get("name").asText()); // rated first, unrated last
        assertEquals(5, st.get("vendor_ratings").get(0).get("avg").asInt());
        assertEquals(1, st.get("vendor_ratings").get(0).get("n").asInt());
        assertTrue(st.get("vendor_ratings").get(1).get("avg").isNull());
    }

    @Test
    void slaCountsOverdueAndOldWeeks() {
        TestClient owner = person("o@example.test", "A-1", "owner");
        long id = owner.multipart("/api/requests", Map.of("category", "other", "title", "Old")).body().get("id").asLong();
        jdbc.update("UPDATE requests SET created_at = created_at - INTERVAL '10' DAY, updated_at = updated_at - INTERVAL '10' DAY WHERE id=?", id);
        JsonNode st = admin.get("/api/admin/stats").body();
        assertEquals(1, st.get("sla").get("overdue").asInt());
        assertEquals(0, st.get("sla").get("within").asInt());
        assertEquals(1, st.get("weekly").get(0).get("weeks_ago").asInt());
    }

    @Test
    void csvIsFormulaSafe() {
        TestClient res = person("r@example.test", "A-1", "owner");
        res.multipart("/api/requests", Map.of("category", "other", "title", "=HYPERLINK(\"x\")"));
        res.multipart("/api/requests", Map.of("category", "other", "title", "Plain, with comma"));
        res.multipart("/api/requests", Map.of("category", "other", "title", "@cmd"));
        res.multipart("/api/requests", Map.of("category", "other", "title", "-1+1"));
        var csv = admin.get("/api/admin/export.csv");
        assertEquals(200, csv.status());
        assertEquals("text/csv; charset=utf-8", csv.header("Content-Type"));
        assertEquals("attachment; filename=\"requests.csv\"", csv.header("Content-Disposition"));
        String body = new String(csv.raw().getContentAsByteArray(), java.nio.charset.StandardCharsets.UTF_8);
        String[] lines = body.split("\n");
        assertEquals("id,resident_name,flat,category,title,status,vendor_name,rating,created_at,updated_at", lines[0]);
        assertTrue(body.contains("\"'=HYPERLINK(\"\"x\"\")\""), body);
        assertTrue(body.contains("\"Plain, with comma\""));
        assertTrue(body.contains(",'@cmd,"));
        assertTrue(body.contains(",'-1+1,"));
        assertEquals(5, lines.length);
    }
}
