package com.sahyadri.portal;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.support.ApiTestBase;
import com.sahyadri.portal.support.TestClient;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Mirrors the request parts of test/api.test.js and test/e2e.test.js. */
class RequestApiTest extends ApiTestBase {
    private static final byte[] JPEG = {(byte) 0xff, (byte) 0xd8, (byte) 0xff};

    private long request(TestClient c, String title) {
        var r = c.multipart("/api/requests", Map.of("category", "plumbing", "title", title, "description", "Kitchen"));
        assertEquals(201, r.status());
        return r.body().get("id").asLong();
    }

    private long vendor(String name) {
        return admin.post("/api/vendors", Map.of("name", name, "trade", "plumbing")).body().get("id").asLong();
    }

    @Test
    void lifecycleWithAuditAndNotifications() {
        assertEquals(401, client().get("/api/requests").status());
        TestClient owner = person("o@example.test", "A-1", "owner");
        var created = owner.multipart("/api/requests", Map.of("category", "plumbing", "title", "Leaking tap", "description", "Kitchen"),
                new Object[]{"photo", "p.jpg", "image/jpeg", JPEG});
        assertEquals(201, created.status());
        long id = created.body().get("id").asLong();
        var photo = owner.get("/api/requests/" + id + "/photo");
        assertEquals(200, photo.status());
        assertArrayEquals(JPEG, photo.raw().getContentAsByteArray());
        assertEquals("image/jpeg", photo.header("Content-Type"));
        assertEquals("private, max-age=3600", photo.header("Cache-Control"));
        assertTrue(admin.get("/api/notifications").body().get(0).get("message").asText().startsWith("New plumbing request from flat A-1: Leaking tap"));

        JsonNode d = owner.get("/api/requests/" + id).body();
        assertEquals("open", d.get("status").asText());
        assertTrue(d.get("has_photo").asBoolean());
        assertFalse(d.has("photo"));
        assertFalse(d.get("can_rate").asBoolean());
        assertEquals("A-1", d.get("flat").asText());

        long v = vendor("Vend");
        assertEquals(409, admin.post("/api/requests/" + id + "/status", Map.of("status", "in_progress")).status()); // vendor needed
        assertEquals(404, admin.post("/api/requests/" + id + "/assign", Map.of("vendor_id", 99999)).status());
        assertEquals(403, owner.post("/api/requests/" + id + "/assign", Map.of("vendor_id", v)).status());
        assertEquals(200, admin.post("/api/requests/" + id + "/assign", Map.of("vendor_id", v)).status());
        assertEquals("assigned", owner.get("/api/requests/" + id).body().get("status").asText());
        assertEquals(400, admin.post("/api/requests/" + id + "/status", Map.of("status", "bogus")).status());
        assertEquals(200, admin.post("/api/requests/" + id + "/status", Map.of("status", "in_progress", "note", "on site")).status());
        assertEquals(409, admin.post("/api/requests/" + id + "/status", Map.of("status", "assigned")).status()); // forward only
        assertEquals(403, owner.post("/api/requests/" + id + "/status", Map.of("status", "closed")).status());
        assertEquals(409, owner.post("/api/requests/" + id + "/rate", Map.of("rating", 5)).status()); // not closed
        assertEquals(200, admin.post("/api/requests/" + id + "/status", Map.of("status", "closed")).status());
        assertEquals(403, admin.post("/api/requests/" + id + "/rate", Map.of("rating", 5)).status()); // admin never rates
        assertEquals(400, owner.post("/api/requests/" + id + "/rate", Map.of("rating", 0)).status());
        assertEquals(400, owner.post("/api/requests/" + id + "/rate", Map.of("rating", 9)).status());
        assertTrue(owner.get("/api/requests/" + id).body().get("can_rate").asBoolean());
        assertEquals(200, owner.post("/api/requests/" + id + "/rate", Map.of("rating", 4, "comment", "Quick")).status());
        assertEquals(409, owner.post("/api/requests/" + id + "/rate", Map.of("rating", 4)).status()); // once
        assertEquals(409, admin.post("/api/requests/" + id + "/status", Map.of("status", "in_progress")).status()); // closed is final
        assertEquals(409, admin.post("/api/requests/" + id + "/assign", Map.of("vendor_id", v)).status());

        JsonNode f = owner.get("/api/requests/" + id).body();
        assertEquals(4, f.get("rating").asInt());
        assertEquals("Quick", f.get("rating_comment").asText());
        assertFalse(f.get("can_rate").asBoolean());
        List<String> actions = new ArrayList<>();
        f.get("history").forEach(h -> actions.add(h.get("action").asText()));
        assertEquals(List.of("created", "assigned", "status", "status", "rated"), actions);
        assertTrue(f.get("history").get(2).get("detail").asText().matches(".*assigned -> in_progress: on site"));
        assertTrue(f.get("history").get(3).get("detail").asText().contains("in_progress -> closed"));
        assertEquals("o", f.get("history").get(0).get("actor").asText());

        JsonNode audit = admin.get("/api/admin/audit").body();
        List<String> fromAudit = new ArrayList<>();
        audit.forEach(a -> {
            if (a.get("entity").asText().equals("request") && a.get("entity_id").asLong() == id) fromAudit.add(0, a.get("action").asText());
        });
        assertEquals(actions, fromAudit);

        String msgs = owner.get("/api/notifications").body().toString();
        assertTrue(msgs.contains("assigned to Vend"));
        assertTrue(msgs.contains("is now in progress"));
        assertTrue(msgs.contains("is now closed"));
        assertEquals(4.0, admin.get("/api/admin/stats").body().get("avg_rating").asDouble());
        assertTrue(new String(admin.get("/api/admin/export.csv").raw().getContentAsByteArray()).contains("Leaking tap"));
    }

    @Test
    void creationValidationAndPhotoRules() {
        TestClient r = person("r@example.test", "A-1", "tenant");
        assertEquals(400, r.multipart("/api/requests", Map.of("category", "nope", "title", "x")).status());
        assertEquals(400, r.multipart("/api/requests", Map.of("category", "plumbing", "title", "  ")).status());
        // declared type not allowed
        var bad = r.multipart("/api/requests", Map.of("category", "plumbing", "title", "x"), new Object[]{"photo", "a.gif", "image/gif", JPEG});
        assertEquals(400, bad.status());
        assertEquals("Only JPEG, PNG or WebP photos are allowed", bad.body().get("error").asText());
        // declared JPEG but wrong magic bytes
        var fake = r.multipart("/api/requests", Map.of("category", "plumbing", "title", "x"), new Object[]{"photo", "a.jpg", "image/jpeg", "not an image".getBytes()});
        assertEquals(400, fake.status());
        assertEquals("File is not a valid JPEG, PNG or WebP image", fake.body().get("error").asText());
        // PNG and WebP signatures
        byte[] png = {(byte) 0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a};
        byte[] webp = "RIFF\0\0\0\0WEBPVP8 ".getBytes(java.nio.charset.StandardCharsets.ISO_8859_1);
        assertEquals(201, r.multipart("/api/requests", Map.of("category", "other", "title", "png"), new Object[]{"photo", "a.png", "image/png", png}).status());
        assertEquals(201, r.multipart("/api/requests", Map.of("category", "other", "title", "webp"), new Object[]{"photo", "a.webp", "image/webp", webp}).status());
        assertEquals(400, r.multipart("/api/requests", Map.of("category", "other", "title", "x"), new Object[]{"photo", "a.webp", "image/webp", "RIFF0000XXXX".getBytes()}).status());
        // 5 MB limit
        var big = r.multipart("/api/requests", Map.of("category", "other", "title", "big"),
                new Object[]{"photo", "a.jpg", "image/jpeg", new byte[5 * 1024 * 1024 + 1]});
        assertEquals(400, big.status());
        // unknown file field
        assertEquals(400, r.multipart("/api/requests", Map.of("category", "other", "title", "x"), new Object[]{"file", "a.jpg", "image/jpeg", JPEG}).status());
        // no photo -> has_photo false, photo endpoint 404
        long id = request(r, "No photo");
        assertFalse(r.get("/api/requests/" + id).body().get("has_photo").asBoolean());
        assertEquals(404, r.get("/api/requests/" + id + "/photo").status());
        // JSON bodies work too (multer skips non-multipart)
        assertEquals(201, r.post("/api/requests", Map.of("category", "lift", "title", "json", "description", "d")).status());
        // only the 400-rejected uploads left nothing behind: the list holds exactly the 4 valid requests
        assertEquals(4, r.get("/api/requests").body().size());
    }

    @Test
    void permissionAndGuardEnforcement() {
        TestClient r = person("r@example.test", "A-1", "owner");
        var off = admin.put("/api/admin/access", Map.of("matrix", Map.of("owner", Map.of("request.create", false))));
        assertEquals(200, off.status());
        var denied = r.multipart("/api/requests", Map.of("category", "plumbing", "title", "x"), new Object[]{"photo", "a.gif", "image/gif", JPEG});
        assertEquals(403, denied.status()); // permission is checked before the upload is looked at
        assertEquals("Your role does not have access to this", denied.body().get("error").asText());
        assertEquals(200, admin.put("/api/admin/access", Map.of("matrix", Map.of("owner", Map.of("request.create", true)))).status());
        assertEquals(201, r.multipart("/api/requests", Map.of("category", "plumbing", "title", "x")).status());
        // the committee can always raise
        assertEquals(201, admin.multipart("/api/requests", Map.of("category", "plumbing", "title", "admin raised")).status());
    }

    @Test
    void visibilityIsFlatWideAndFiltered() {
        TestClient owner = person("o@example.test", "A-1", "owner");
        TestClient other = person("x@example.test", "B-2", "owner");
        var add = Map.of("name", "Fam", "email", "f@example.test", "resident_type", "family", "password", PW, "consent", true);
        assertEquals(201, owner.post("/api/household", add).status());
        long fid = 0;
        for (var u : admin.get("/api/admin/users?status=pending").body()) if (u.get("email").asText().equals("f@example.test")) fid = u.get("id").asLong();
        assertEquals(200, admin.post("/api/admin/users/" + fid + "/approve").status());
        TestClient family = client();
        assertEquals(200, family.post("/api/login", Map.of("email", "f@example.test", "password", PW)).status());

        long id = request(owner, "Owner request");
        long fid2 = request(family, "Family request");
        assertEquals(2, family.get("/api/requests").body().size());
        assertEquals(2, owner.get("/api/requests").body().size());
        assertEquals(0, other.get("/api/requests").body().size());
        assertEquals(404, other.get("/api/requests/" + id).status());
        assertEquals(404, other.get("/api/requests/" + id + "/photo").status());
        assertEquals(404, other.get("/api/requests/abc").status());
        assertEquals(404, other.post("/api/requests/" + id + "/comments", Map.of("body", "hi")).status());
        assertEquals(200, family.get("/api/requests/" + id).status());
        assertEquals(2, admin.get("/api/requests").body().size());

        long v = vendor("Vend");
        admin.post("/api/requests/" + fid2 + "/assign", Map.of("vendor_id", v));
        // filters
        assertEquals(1, admin.get("/api/requests?status=assigned").body().size());
        assertEquals(1, admin.get("/api/requests?status=open").body().size());
        assertEquals(2, admin.get("/api/requests?status=bogus").body().size()); // unknown filter is ignored
        assertEquals(2, admin.get("/api/requests?category=plumbing").body().size());
        assertEquals(0, admin.get("/api/requests?category=lift").body().size());
        assertEquals(1, owner.get("/api/requests?status=assigned&category=plumbing").body().size());
        assertEquals("Vend", owner.get("/api/requests/" + fid2).body().get("vendor_name").asText());

        admin.post("/api/requests/" + fid2 + "/status", Map.of("status", "closed"));
        assertFalse(family.get("/api/requests/" + fid2).body().get("can_rate").asBoolean());
        assertEquals(403, family.post("/api/requests/" + fid2 + "/rate", Map.of("rating", 5)).status()); // family never rates
        assertEquals(404, other.post("/api/requests/" + fid2 + "/rate", Map.of("rating", 5)).status());
        assertTrue(owner.get("/api/requests/" + fid2).body().get("can_rate").asBoolean());
        assertEquals(200, owner.post("/api/requests/" + fid2 + "/rate", Map.of("rating", 5)).status());
        assertTrue(family.get("/api/notifications").body().toString().contains("rated 5 of 5"));
    }

    @Test
    void comments() {
        TestClient res = person("r@example.test", "A-1", "owner");
        TestClient stranger = person("s@example.test", "B-1", "owner");
        long rid = request(res, "Tap");
        assertEquals(400, res.post("/api/requests/" + rid + "/comments", Map.of("body", "")).status());
        assertEquals("Write a message first", res.post("/api/requests/" + rid + "/comments", Map.of()).body().get("error").asText());
        assertEquals(201, res.post("/api/requests/" + rid + "/comments", Map.of("body", "Home after 6pm")).status());
        assertEquals(201, admin.post("/api/requests/" + rid + "/comments", Map.of("body", "Visit tomorrow")).status());
        JsonNode list = res.get("/api/requests/" + rid + "/comments").body();
        assertEquals("Home after 6pm", list.get(0).get("body").asText());
        assertEquals("Visit tomorrow", list.get(1).get("body").asText());
        assertEquals("admin", list.get(1).get("role").asText());
        assertNotNull(list.get(0).get("author"));
        assertEquals(404, stranger.get("/api/requests/" + rid + "/comments").status());
        assertEquals(404, stranger.post("/api/requests/" + rid + "/comments", Map.of("body", "hi")).status());
        assertEquals("New message on request \"Tap\" from flat A-1", admin.get("/api/notifications").body().get(0).get("message").asText());
        assertEquals("The committee replied on \"Tap\"", res.get("/api/notifications").body().get(0).get("message").asText());
    }
}
