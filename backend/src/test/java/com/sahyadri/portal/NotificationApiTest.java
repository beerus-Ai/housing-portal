package com.sahyadri.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.support.ApiTestBase;
import com.sahyadri.portal.support.TestClient;
import java.util.Map;
import org.junit.jupiter.api.Test;

class NotificationApiTest extends ApiTestBase {

    private void register(String email) {
        assertEquals(201, client().post("/api/register", Map.of("name", "Reg", "email", email, "flat", "A-1", "resident_type", "owner",
                "password", PW, "consent", true)).status());
    }

    @Test
    void unreadCountListAndMarkRead() {
        assertEquals(401, client().get("/api/notifications").status());
        assertEquals(401, client().get("/api/notifications/unread-count").status());
        assertEquals(401, client().post("/api/notifications/read").status());
        assertEquals(0, admin.get("/api/notifications/unread-count").body().get("n").asLong());

        register("a@example.test");
        register("b@example.test");
        assertEquals(2, admin.get("/api/notifications/unread-count").body().get("n").asLong());
        JsonNode list = admin.get("/api/notifications").body();
        assertEquals(2, list.size());
        JsonNode first = list.get(0);
        assertTrue(first.get("id").asLong() > list.get(1).get("id").asLong(), "newest first");
        assertTrue(first.get("message").asText().startsWith("New registration awaiting approval: Reg (flat A-1)"));
        assertEquals(0, first.get("is_read").asInt());
        assertTrue(first.get("created_at").asText().matches("\\d{4}-\\d{2}-\\d{2} \\d{2}:\\d{2}:\\d{2}"));
        assertTrue(first.has("user_id"));

        var read = admin.post("/api/notifications/read");
        assertEquals(200, read.status());
        assertTrue(read.body().get("ok").asBoolean());
        assertEquals(0, admin.get("/api/notifications/unread-count").body().get("n").asLong());
        assertEquals(1, admin.get("/api/notifications").body().get(0).get("is_read").asInt());
        register("c@example.test");
        assertEquals(1, admin.get("/api/notifications/unread-count").body().get("n").asLong());
    }

    @Test
    void notificationsArePrivateAndCappedAtFifty() {
        TestClient r = person("priv@example.test", "A-1", "owner");
        assertEquals(0, r.get("/api/notifications").body().size());
        for (int i = 0; i < 55; i++) jdbc.update("INSERT INTO notifications(user_id,message) VALUES(?,?)", r.id, "m" + i);
        assertEquals(50, r.get("/api/notifications").body().size());
        assertEquals("m54", r.get("/api/notifications").body().get(0).get("message").asText());
        assertEquals(55, r.get("/api/notifications/unread-count").body().get("n").asLong());
        // marking one user's notifications read leaves everyone else's alone
        long adminUnread = admin.get("/api/notifications/unread-count").body().get("n").asLong();
        r.post("/api/notifications/read");
        assertEquals(adminUnread, admin.get("/api/notifications/unread-count").body().get("n").asLong());
        assertEquals(0, r.get("/api/notifications/unread-count").body().get("n").asLong());
    }
}
