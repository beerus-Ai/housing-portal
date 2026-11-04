package com.sahyadri.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.support.ApiTestBase;
import com.sahyadri.portal.support.TestClient;
import java.util.List;
import java.util.Map;
import java.util.stream.StreamSupport;
import org.junit.jupiter.api.Test;

/** Vehicles, parking, workers, gate overview, admin overview (test/estate.test.js). */
class EstateApiTest extends ApiTestBase {

    private TestClient guard(String email) {
        TestClient c = client();
        assertEquals(201, admin.post("/api/admin/guards", Map.of("name", "Gate Guard", "email", email, "password", PW)).status());
        assertEquals(200, c.post("/api/login", Map.of("email", email, "password", PW)).status());
        return c;
    }

    private boolean audited(String entity, String action) {
        return StreamSupport.stream(admin.get("/api/admin/audit").body().spliterator(), false)
                .anyMatch(a -> a.get("entity").asText().equals(entity) && a.get("action").asText().equals(action));
    }

    private JsonNode slot(JsonNode slots, String code) {
        return StreamSupport.stream(slots.spliterator(), false).filter(s -> s.get("code").asText().equals(code)).findFirst().orElseThrow();
    }

    @Test
    void vehiclesAddDuplicateLimitSearchIsolationPermission() {
        TestClient a = person("va@example.test", "A-101", "owner");
        TestClient b = person("vb@example.test", "B-202", "owner");
        TestClient fam = person("vf@example.test", "A-101", "family");
        assertEquals(400, a.post("/api/vehicles", Map.of("plate", "ab", "type", "car")).status());
        assertEquals(400, a.post("/api/vehicles", Map.of("plate", "MH 12-AB 1234", "type", "boat")).status());
        assertEquals(400, a.post("/api/vehicles", Map.of("plate", "MH 12 AB 1234", "type", "car", "sticker", "x".repeat(21))).status());
        var ok = a.post("/api/vehicles", Map.of("plate", "mh 12-ab 1234", "type", "car", "make", "Maruti", "color", "Red"));
        assertEquals(201, ok.status());
        assertEquals(409, b.post("/api/vehicles", Map.of("plate", "MH12AB1234", "type", "car")).status());
        JsonNode list = a.get("/api/vehicles").body();
        assertEquals(1, list.size());
        assertEquals("MH 12-AB 1234", list.get(0).get("plate").asText());
        assertEquals("A-101", list.get(0).get("flat").asText());
        assertEquals("va", list.get(0).get("owner_name").asText());
        assertEquals(0, b.get("/api/vehicles").body().size());
        long vid = ok.body().get("id").asLong();
        assertEquals(404, b.delete("/api/vehicles/" + vid).status());
        assertEquals(403, fam.post("/api/vehicles", Map.of("plate", "KA01XY9999", "type", "bike")).status());
        assertEquals(1, fam.get("/api/vehicles").body().size());
        for (int i = 2; i <= 6; i++) assertEquals(201, a.post("/api/vehicles", Map.of("plate", "GJ05CD000" + i, "type", "bike")).status());
        assertEquals(409, a.post("/api/vehicles", Map.of("plate", "GJ05CD0007", "type", "bike")).status());
        assertEquals(6, admin.get("/api/vehicles").body().size());
        assertEquals(1, admin.get("/api/vehicles?q=ab 1234").body().size());
        assertEquals(6, admin.get("/api/vehicles?q=A-101").body().size());
        assertEquals(0, admin.get("/api/vehicles?q=%25").body().size());
        assertEquals(6, admin.get("/api/vehicles?q=va").body().size());
        assertEquals(400, admin.post("/api/vehicles", Map.of("plate", "DL01ZZ0001", "type", "car")).status());
        assertEquals(400, admin.post("/api/vehicles", Map.of("plate", "DL01ZZ0001", "type", "car", "flat", "Z-999")).status());
        assertEquals(201, admin.post("/api/vehicles", Map.of("plate", "DL01ZZ0001", "type", "car", "flat", "B-202")).status());
        admin.put("/api/admin/access", Map.of("matrix", Map.of("owner", Map.of("vehicle.manage", false))));
        assertEquals(403, b.post("/api/vehicles", Map.of("plate", "DL01ZZ0002", "type", "car")).status());
        assertEquals(403, a.delete("/api/vehicles/" + vid).status());
        admin.put("/api/admin/access", Map.of("matrix", Map.of("owner", Map.of("vehicle.manage", true))));
        assertEquals(200, a.delete("/api/vehicles/" + vid).status());
        assertTrue(audited("vehicle", "created"));
        assertTrue(audited("vehicle", "deleted"));
    }

    @Test
    void parkingCreateRangeAssignFreeRemoveIsolationNotify() {
        TestClient a = person("pa@example.test", "A-101", "owner");
        TestClient b = person("pb@example.test", "B-202", "owner");
        assertEquals(403, a.post("/api/parking", Map.of("prefix", "B1-", "from", 1, "count", 3)).status());
        for (Map<String, Object> bad : List.<Map<String, Object>>of(Map.of("prefix", "B1-", "count", 0), Map.of("prefix", "B1-", "count", 201),
                Map.of("prefix", "B1-", "count", 2, "kind", "boat"), Map.of("prefix", "a b", "count", 2))) {
            assertEquals(400, admin.post("/api/parking", bad).status());
        }
        var mk = admin.post("/api/parking", Map.of("prefix", "B1-", "from", 1, "count", 12, "kind", "car", "level", "B1"));
        assertEquals(201, mk.status());
        assertEquals(12, mk.body().get("created").asInt());
        var again = admin.post("/api/parking", Map.of("prefix", "B1-", "from", 10, "count", 6, "kind", "car"));
        assertEquals(3, again.body().get("created").asInt());
        assertEquals(3, again.body().get("skipped").asInt());
        JsonNode all = admin.get("/api/parking").body();
        assertEquals("{\"total\":15,\"assigned\":0,\"free\":15}", all.get("summary").toString());
        JsonNode s1 = slot(all.get("slots"), "B1-01"), s2 = slot(all.get("slots"), "B1-02");
        assertEquals("B1", s1.get("level").asText());
        assertEquals("car", s1.get("kind").asText());

        long veh = a.post("/api/vehicles", Map.of("plate", "MH12AB1234", "type", "car")).body().get("id").asLong();
        long vb = b.post("/api/vehicles", Map.of("plate", "MH12CD5678", "type", "car")).body().get("id").asLong();
        String p1 = "/api/parking/" + s1.get("id").asLong(), p2 = "/api/parking/" + s2.get("id").asLong();
        assertEquals(403, a.post(p1 + "/assign", Map.of("flat", "A-101")).status());
        assertEquals(400, admin.post(p1 + "/assign", Map.of("flat", "Z-999")).status());
        assertEquals(400, admin.post(p1 + "/assign", Map.of("flat", "A-101", "vehicle_id", vb)).status());
        assertEquals(404, admin.post("/api/parking/99999/assign", Map.of("flat", "A-101")).status());
        assertEquals(200, admin.post(p1 + "/assign", Map.of("flat", "A-101", "vehicle_id", veh)).status());
        assertEquals(409, admin.post(p1 + "/assign", Map.of("flat", "B-202")).status());
        assertEquals(200, admin.post(p2 + "/assign", Map.of("flat", "A-101")).status());
        assertTrue(StreamSupport.stream(a.get("/api/notifications").body().spliterator(), false).anyMatch(n -> n.get("message").asText().contains("B1-01")));
        JsonNode mine = a.get("/api/parking").body();
        assertEquals("{\"total\":15,\"assigned\":2,\"free\":13}", mine.get("summary").toString());
        assertEquals(2, mine.get("slots").size());
        assertEquals("B1-01", mine.get("slots").get(0).get("code").asText());
        assertEquals("MH12AB1234", mine.get("slots").get(0).get("plate").asText());
        assertEquals(0, b.get("/api/parking").body().get("slots").size());
        assertEquals(409, admin.delete(p1).status());
        assertEquals(200, a.delete("/api/vehicles/" + veh).status());
        JsonNode s1b = slot(admin.get("/api/parking").body().get("slots"), "B1-01");
        assertTrue(s1b.get("flat").isNull());
        assertTrue(s1b.get("vehicle_id").isNull());
        assertEquals(200, admin.post(p2 + "/free").status());
        assertEquals(409, admin.post(p2 + "/free").status());
        assertTrue(StreamSupport.stream(a.get("/api/notifications").body().spliterator(), false).anyMatch(n -> n.get("message").asText().contains("released")));
        assertEquals(200, admin.delete(p2).status());
        assertEquals(14, admin.get("/api/parking").body().get("summary").get("total").asInt());
        admin.put("/api/admin/access", Map.of("matrix", Map.of("owner", Map.of("parking.view", false))));
        assertEquals(403, a.get("/api/parking").status());
        for (String act : List.of("slots_created", "assigned", "freed", "slot_deleted")) assertTrue(audited("parking", act), act);
    }

    @Test
    void workersAdminCrudValidationNonAdmin403() {
        TestClient a = person("wa@example.test", "A-101", "owner");
        assertEquals(403, a.get("/api/admin/workers").status());
        assertEquals(403, a.post("/api/admin/workers", Map.of("name", "X")).status());
        for (Map<String, Object> bad : List.<Map<String, Object>>of(Map.of(), Map.of("name", "x".repeat(101)), Map.of("name", "N", "role", "chef"),
                Map.of("name", "N", "phone", "abc"), Map.of("name", "N", "status", "gone"), Map.of("name", "N", "shift", "x".repeat(41)),
                Map.of("name", "N", "notes", "x".repeat(301)))) {
            assertEquals(400, admin.post("/api/admin/workers", bad).status());
        }
        var c = admin.post("/api/admin/workers", Map.of("name", "Ramesh", "role", "gardener", "phone", "+91 98765 43210", "shift", "Morning", "notes", "n"));
        assertEquals(201, c.status());
        long id = c.body().get("id").asLong();
        JsonNode list = admin.get("/api/admin/workers").body();
        assertEquals(1, list.size());
        assertEquals("active", list.get(0).get("status").asText());
        assertEquals("gardener", list.get(0).get("role").asText());
        assertEquals(200, admin.put("/api/admin/workers/" + id, Map.of("status", "inactive", "shift", "Evening")).status());
        list = admin.get("/api/admin/workers").body();
        assertEquals("inactive", list.get(0).get("status").asText());
        assertEquals("Evening", list.get(0).get("shift").asText());
        assertEquals("Ramesh", list.get(0).get("name").asText());
        assertEquals("+91 98765 43210", list.get(0).get("phone").asText());
        assertEquals(400, admin.put("/api/admin/workers/" + id, Map.of("role", "nope")).status());
        assertEquals(404, admin.put("/api/admin/workers/9999", Map.of("name", "Q")).status());
        assertEquals(403, a.delete("/api/admin/workers/" + id).status());
        assertEquals(200, admin.delete("/api/admin/workers/" + id).status());
        assertEquals(404, admin.delete("/api/admin/workers/" + id).status());
        for (String act : List.of("created", "updated", "deleted")) assertTrue(audited("worker", act), act);
    }

    @Test
    void gateOverviewGuardAndAdminRealScans() {
        TestClient a = person("ga@example.test", "A-101", "owner");
        TestClient g = guard("guard1@example.test");
        assertEquals(403, a.get("/api/gate/overview").status());
        JsonNode empty = g.get("/api/gate/overview").body();
        assertEquals("{\"allowed\":0,\"denied\":0,\"visitors\":0,\"residents\":0}", empty.get("today").toString());
        assertEquals(24, empty.get("by_hour").size());
        JsonNode pass = a.post("/api/gate/passes", Map.of("visitor_name", "Visitor One")).body();
        a.post("/api/gate/passes", Map.of("visitor_name", "Visitor Two"));
        assertEquals(2, g.get("/api/gate/overview").body().get("active_passes").asInt());
        assertEquals("allowed", g.post("/api/gate/verify", Map.of("code", pass.get("code").asText())).body().get("result").asText());
        assertEquals("denied", g.post("/api/gate/verify", Map.of("code", pass.get("code").asText())).body().get("result").asText());
        JsonNode me = a.get("/api/gate/me").body();
        assertEquals("resident", g.post("/api/gate/verify", Map.of("token", me.get("token").asText())).body().get("kind").asText());
        assertEquals("denied", g.post("/api/gate/verify", Map.of("token", "nope")).body().get("result").asText());
        for (TestClient who : List.of(g, admin)) {
            JsonNode o = who.get("/api/gate/overview").body();
            assertEquals("{\"allowed\":2,\"denied\":2,\"visitors\":1,\"residents\":1}", o.get("today").toString());
            assertEquals(1, o.get("active_passes").asInt());
            assertEquals(1, o.get("inside").asInt());
            assertEquals(4, o.get("recent").size());
            assertEquals("Gate Guard", o.get("recent").get(0).get("guard_name").asText());
            int sum = 0;
            for (int i = 0; i < 24; i++) {
                assertEquals(i, o.get("by_hour").get(i).get("hour").asInt());
                sum += o.get("by_hour").get(i).get("n").asInt();
            }
            assertEquals(4, sum);
        }
    }

    @Test
    void parkingFeatureFlagOff() {
        TestClient a = person("fa@example.test", "A-101", "owner");
        assertTrue(a.get("/api/me").body().get("features").get("parking").asBoolean());
        assertEquals(200, admin.put("/api/admin/settings", Map.of("features", Map.of("parking", false))).status());
        assertEquals(403, a.get("/api/vehicles").status());
        assertEquals(403, a.post("/api/vehicles", Map.of("plate", "MH12AB1234", "type", "car")).status());
        var r = a.get("/api/parking");
        assertEquals(403, r.status());
        assertEquals("This feature is turned off", r.body().get("error").asText());
        assertEquals(403, a.delete("/api/vehicles/1").status());
        assertEquals(200, admin.get("/api/parking").status());
        assertEquals(200, admin.get("/api/vehicles").status());
    }

    @Test
    void adminOverviewEveryHeadlineNumber() {
        TestClient owner = person("ov-owner@t.test", "A-101", "owner");
        person("ov-tenant@t.test", "A-102", "tenant");
        JsonNode empty = admin.get("/api/admin/overview").body();
        assertEquals(2, empty.get("residents").get("approved").asInt());
        assertEquals(1, empty.get("residents").get("owners").asInt());
        assertEquals(1, empty.get("residents").get("tenants").asInt());
        assertEquals(2, empty.get("residents").get("flats").asInt());
        assertEquals(1, empty.get("leases").get("tenants_without_lease").asInt());
        assertEquals(0, empty.get("estate").get("vehicles").asInt());
        assertEquals(0, empty.get("emergencies").get("active").asInt());
        assertEquals(0, empty.get("gate").get("admitted_today").asInt());
        assertEquals(201, owner.post("/api/vehicles", Map.of("plate", "MH12 AB 1234", "type", "car")).status());
        assertEquals(201, admin.post("/api/parking", Map.of("prefix", "P-", "from", 1, "count", 3)).status());
        assertEquals(201, admin.post("/api/admin/workers", Map.of("name", "Ravi", "role", "security", "phone", "+91 90000 11111")).status());
        assertEquals(201, owner.post("/api/emergencies", Map.of("type", "fire")).status());
        JsonNode o = admin.get("/api/admin/overview").body();
        assertEquals(1, o.get("estate").get("vehicles").asInt());
        assertEquals(3, o.get("estate").get("parking_total").asInt());
        assertEquals(0, o.get("estate").get("parking_assigned").asInt());
        assertEquals(1, o.get("estate").get("workers_active").asInt());
        assertEquals(1, o.get("emergencies").get("active").asInt());
        assertEquals(0, o.get("notices").get("last_30d").asInt());
        assertEquals(403, owner.get("/api/admin/overview").status());
        assertEquals(401, client().get("/api/admin/overview").status());
    }
}
