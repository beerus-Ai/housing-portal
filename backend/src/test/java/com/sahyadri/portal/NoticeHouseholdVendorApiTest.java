package com.sahyadri.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.support.ApiTestBase;
import com.sahyadri.portal.support.TestClient;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.Test;

/** Notices, vendors, household and lease (test/api.test.js, test/e2e.test.js, test/features.test.js, test/settings.test.js). */
class NoticeHouseholdVendorApiTest extends ApiTestBase {

    private long idOf(String email) {
        for (var u : admin.get("/api/admin/users").body()) if (u.get("email").asText().equals(email)) return u.get("id").asLong();
        throw new IllegalStateException(email);
    }

    @Test
    void noticesPostReadDeleteAndNotify() {
        TestClient r = person("r@example.test", "A-1", "owner");
        TestClient pending = person("p@example.test", "A-2", "owner", false);
        assertEquals(401, client().get("/api/notices").status());
        assertEquals(0, r.get("/api/notices").body().size());
        assertEquals(403, r.post("/api/notices", Map.of("title", "x", "body", "y")).status());
        assertEquals(400, admin.post("/api/notices", Map.of("title", "", "body", "y")).status());
        assertEquals(400, admin.post("/api/notices", Map.of("title", "t")).status());
        long nid = admin.post("/api/notices", Map.of("title", "Water cut", "body", "Tuesday")).body().get("id").asLong();
        JsonNode list = r.get("/api/notices").body();
        assertEquals("Water cut", list.get(0).get("title").asText());
        assertEquals(nid, list.get(0).get("id").asLong());
        assertFalse(list.get(0).get("author").asText().isEmpty());
        assertEquals(1, r.get("/api/notifications/unread-count").body().get("n").asInt());
        assertTrue(r.get("/api/notifications").body().get(0).get("message").asText().contains("New notice: Water cut"));
        // the author is not notified; pending users are not in the audience
        assertEquals(-1, admin.get("/api/notifications").body().toString().indexOf("New notice"));
        assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM notifications WHERE user_id=?", Integer.class, pending.id));
    }

    @Test
    void noticeDeleteAndAudit() {
        TestClient r = person("r@example.test", "A-1", "owner");
        long nid = admin.post("/api/notices", Map.of("title", "Delete me", "body", "x")).body().get("id").asLong();
        admin.post("/api/notices", Map.of("title", "Second", "body", "z"));
        assertEquals(403, r.delete("/api/notices/" + nid).status());
        assertEquals(404, admin.delete("/api/notices/99999").status());
        assertEquals(200, admin.delete("/api/notices/" + nid).status());
        assertEquals(1, r.get("/api/notices").body().size());
        var audit = admin.get("/api/admin/audit").body();
        int posted = 0;
        boolean deleted = false;
        for (JsonNode a : audit) {
            if (a.get("entity").asText().equals("notice") && a.get("action").asText().equals("posted")) posted++;
            if (a.get("entity").asText().equals("notice") && a.get("action").asText().equals("deleted")) deleted = true;
        }
        assertEquals(2, posted);
        assertTrue(deleted);
    }

    @Test
    void noticesRespectFeatureFlagAndPermission() {
        TestClient r = person("r@example.test", "A-1", "tenant");
        assertEquals(200, admin.put("/api/admin/settings", Map.of("features", Map.of("notices", false))).status());
        var off = r.get("/api/notices");
        assertEquals(403, off.status());
        assertEquals("This feature is turned off", off.body().get("error").asText());
        assertEquals(200, admin.get("/api/notices").status()); // committee unaffected
        admin.put("/api/admin/settings", Map.of("features", Map.of("notices", true)));
        assertEquals(200, r.get("/api/notices").status());
        admin.put("/api/admin/access", Map.of("matrix", Map.of("tenant", Map.of("notice.read", false))));
        var denied = r.get("/api/notices");
        assertEquals(403, denied.status());
        assertEquals("Your role does not have access to this", denied.body().get("error").asText());
    }

    @Test
    void vendorsCrudAndDeleteRule() {
        TestClient res = person("r@example.test", "A-1", "owner");
        assertEquals(403, res.get("/api/vendors").status());
        assertEquals(403, res.post("/api/vendors", Map.of("name", "x", "trade", "y")).status());
        assertEquals(400, admin.post("/api/vendors", Map.of("name", "x")).status());
        var made = admin.post("/api/vendors", Map.of("name", "Temp Vendor", "trade", "other"));
        assertEquals(201, made.status());
        long v = made.body().get("id").asLong();
        assertEquals(403, res.put("/api/vendors/" + v, Map.of("name", "x")).status());
        assertEquals(404, admin.put("/api/vendors/99999", Map.of("name", "x")).status());
        assertEquals(200, admin.put("/api/vendors/" + v, Map.of("name", "Temp Vendor 2", "phone", "123")).status());
        JsonNode row = admin.get("/api/vendors").body().get(0);
        assertEquals("Temp Vendor 2", row.get("name").asText());
        assertEquals("other", row.get("trade").asText());
        assertEquals("123", row.get("phone").asText());
        assertEquals(200, admin.delete("/api/vendors/" + v).status());
        assertEquals(404, admin.delete("/api/vendors/" + v).status());

        long used = admin.post("/api/vendors", Map.of("name", "Ravi", "trade", "plumbing")).body().get("id").asLong();
        long rid = res.multipart("/api/requests", Map.of("category", "plumbing", "title", "Tap")).body().get("id").asLong();
        admin.post("/api/requests/" + rid + "/assign", Map.of("vendor_id", used));
        var blocked = admin.delete("/api/vendors/" + used);
        assertEquals(409, blocked.status());
        assertEquals("This vendor has requests on record and cannot be deleted", blocked.body().get("error").asText());
        var audit = admin.get("/api/admin/audit").body().toString();
        assertTrue(audit.contains("\"action\":\"created\"") && audit.contains("\"action\":\"deleted\"") && audit.contains("\"action\":\"updated\""));
    }

    @Test
    void householdFlow() {
        TestClient owner = person("owner@example.test", "D-401", "owner");
        TestClient stranger = person("stranger@example.test", "D-402", "owner");
        Map<String, Object> add = new LinkedHashMap<>(Map.of("name", "Kid Test", "email", "kid@example.test", "resident_type", "family",
                "password", "Passw0rd!", "consent", true));
        var noConsent = new LinkedHashMap<>(add);
        noConsent.put("consent", false);
        assertEquals(400, owner.post("/api/household", noConsent).status());
        var forced = new LinkedHashMap<>(add);
        forced.put("flat", "Z-999"); // ignored: always the owner's flat
        assertEquals(201, owner.post("/api/household", forced).status());
        var asOwner = new LinkedHashMap<>(add);
        asOwner.put("resident_type", "owner");
        asOwner.put("email", "x@example.test");
        assertEquals(400, owner.post("/api/household", asOwner).status());
        assertEquals(409, owner.post("/api/household", add).status());
        var bad = new LinkedHashMap<>(add);
        bad.put("email", "nope");
        assertEquals(400, owner.post("/api/household", bad).status());
        bad.put("email", "ok@example.test");
        bad.put("password", "short");
        assertEquals(400, owner.post("/api/household", bad).status());
        assertEquals(403, client().post("/api/login", Map.of("email", "kid@example.test", "password", "Passw0rd!")).status()); // pending
        var ten = new LinkedHashMap<>(add);
        ten.put("name", "Tenant Test");
        ten.put("email", "ten@example.test");
        ten.put("resident_type", "tenant");
        assertEquals(201, owner.post("/api/household", ten).status());
        JsonNode hh = owner.get("/api/household").body();
        assertEquals(List.of("owner", "family", "tenant"), List.of(hh.get(0).get("resident_type").asText(), hh.get(1).get("resident_type").asText(), hh.get(2).get("resident_type").asText()));
        assertEquals("pending", hh.get(1).get("status").asText());
        assertTrue(admin.get("/api/notifications").body().toString().contains("added Kid Test (family) to flat D-401: awaiting approval"));

        admin.post("/api/admin/users/" + idOf("kid@example.test") + "/approve");
        TestClient family = client();
        assertEquals(200, family.post("/api/login", Map.of("email", "kid@example.test", "password", "Passw0rd!")).status());
        assertEquals(403, family.post("/api/household", add).status()); // permission off for family by default
        assertEquals(1, stranger.get("/api/household").body().size());
        // tenant: permission off by default too
        admin.post("/api/admin/users/" + idOf("ten@example.test") + "/approve");
        TestClient tenant = client();
        tenant.post("/api/login", Map.of("email", "ten@example.test", "password", "Passw0rd!"));
        assertEquals(403, tenant.post("/api/household", add).status());
        // owner permission switched off -> 403 before the owner check
        admin.put("/api/admin/access", Map.of("matrix", Map.of("owner", Map.of("household.manage", false))));
        assertEquals(403, owner.post("/api/household", add).status());
        // removed users vanish from the list
        admin.delete("/api/admin/users/" + idOf("kid@example.test"));
        assertEquals(2, owner.get("/api/household").body().size());
        assertEquals(401, client().get("/api/household").status());
    }

    @Test
    void leaseFlow() {
        TestClient owner = person("owner@example.test", "D-401", "owner");
        TestClient t1 = person("t1@example.test", "C-1", "tenant");
        TestClient t2 = person("t2@example.test", "C-2", "tenant");
        var pendingTenant = person("t3@example.test", "C-3", "tenant", false);
        assertEquals(401, client().get("/api/lease").status());
        var none = t1.get("/api/lease");
        assertEquals(200, none.status());
        assertTrue(none.body().isNull());

        Map<String, Object> lease = Map.of("start_date", "2026-01-01", "end_date", "2027-01-01", "owner_name", "Lessor One");
        assertEquals(403, t2.put("/api/admin/users/" + t1.id + "/lease", lease).status());
        assertEquals(400, admin.put("/api/admin/users/" + t1.id + "/lease", Map.of("start_date", "2026-04-01", "end_date", "2025-01-01")).status());
        assertEquals(400, admin.put("/api/admin/users/" + t1.id + "/lease", Map.of("start_date", "2026-04-01", "end_date", "2026-04-01")).status());
        assertEquals(400, admin.put("/api/admin/users/" + t1.id + "/lease", Map.of("start_date", "01/04/2026", "end_date", "2027-01-01")).status());
        assertEquals(404, admin.put("/api/admin/users/" + owner.id + "/lease", lease).status()); // not a tenant
        assertEquals(404, admin.put("/api/admin/users/99999/lease", lease).status());
        assertEquals(200, admin.put("/api/admin/users/" + t1.id + "/lease", lease).status());
        JsonNode l = t1.get("/api/lease").body();
        assertEquals("2027-01-01", l.get("end_date").asText());
        assertEquals("Lessor One", l.get("owner_name").asText());
        assertTrue(t1.get("/api/notifications").body().toString().contains("Your lease details were updated (ends 2027-01-01)"));
        // update in place
        assertEquals(200, admin.put("/api/admin/users/" + t1.id + "/lease", Map.of("start_date", "2026-02-01", "end_date", "2027-02-01", "parking", "P-7")).status());
        assertEquals("P-7", t1.get("/api/lease").body().get("parking").asText());
        assertEquals("", t1.get("/api/lease").body().get("owner_name").asText());
        assertTrue(t2.get("/api/lease").body().isNull());
        assertEquals(403, t2.get("/api/admin/leases").status());

        JsonNode rows = admin.get("/api/admin/leases").body();
        assertEquals(2, rows.size()); // approved tenants only
        assertTrue(rows.get(0).get("end_date").isNull()); // no lease first
        assertEquals(t2.id, rows.get(0).get("user_id").asLong());
        assertEquals("2027-02-01", rows.get(1).get("end_date").asText());
        assertFalse(rows.get(1).has("password_hash"));
        var audit = admin.get("/api/admin/audit").body().toString();
        assertTrue(audit.contains("lease_set") && audit.contains("2026-01-01 to 2027-01-01"));

        // lease.view permission
        admin.put("/api/admin/access", Map.of("matrix", Map.of("tenant", Map.of("lease.view", false))));
        assertEquals(403, t1.get("/api/lease").status());
        // family has no lease.view by default
        assertEquals(201, owner.post("/api/household", Map.of("name", "F", "email", "f@example.test", "resident_type", "family", "password", PW, "consent", true)).status());
        admin.post("/api/admin/users/" + idOf("f@example.test") + "/approve");
        TestClient fam = client();
        fam.post("/api/login", Map.of("email", "f@example.test", "password", PW));
        assertEquals(403, fam.get("/api/lease").status());
    }
}
