package com.sahyadri.portal;

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
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

class UserManagementApiTest extends ApiTestBase {
    @Autowired PasswordEncoder encoder;

    private List<Long> ids(JsonNode arr) {
        List<Long> out = new ArrayList<>();
        for (JsonNode n : arr) out.add(n.get("id").asLong());
        return out;
    }

    @Test
    void searchPatchSuspendResetRemoveAndUntouchableAccounts() {
        TestClient u = person("res1@example.test", "C-3", "tenant");
        TestClient other = person("other@example.test", "D-4", "owner");
        jdbc.update("INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,?,?)", "Gus", "g2@example.test", encoder.encode(PW), "guard", "approved");
        long guardId = jdbc.queryForObject("SELECT id FROM users WHERE email='g2@example.test'", Long.class);
        long adminId = admin.get("/api/me").body().get("id").asLong();

        // list: all non-guard, search
        JsonNode all = admin.get("/api/admin/users").body();
        assertEquals(3, all.size());
        for (JsonNode x : all) assertFalse(x.get("role").asText().equals("guard"));
        assertEquals(List.of(u.id), ids(admin.get("/api/admin/users?q=C-3").body()));
        assertEquals(List.of(other.id), ids(admin.get("/api/admin/users?q=other@").body()));
        assertEquals(List.of(other.id), ids(admin.get("/api/admin/users?q=OTHER@").body())); // case-insensitive like SQLite
        assertEquals(0, admin.get("/api/admin/users?q=' OR 1=1 --").body().size());
        assertEquals(0, admin.get("/api/admin/users?q=%25").body().size());
        assertTrue(ids(admin.get("/api/admin/users?status=approved").body()).contains(adminId));
        assertTrue(ids(admin.get("/api/admin/users?status=guard").body()).isEmpty());
        assertEquals(403, u.get("/api/admin/users").status());
        assertEquals(403, u.patch("/api/admin/users/" + other.id, Map.of("name", "Z")).status());

        // detail
        JsonNode d = admin.get("/api/admin/users/" + u.id).body();
        assertEquals("res1@example.test", d.get("email").asText());
        assertTrue(d.has("lease") && d.get("lease").isNull());
        assertNotNull(d.get("consent_at").asText());
        assertEquals(404, admin.get("/api/admin/users/99999").status());
        assertEquals("User not found", admin.get("/api/admin/users/abc").body().get("error").asText());
        assertEquals(403, u.get("/api/admin/users/" + other.id).status());

        // patch
        var p = admin.patch("/api/admin/users/" + u.id, Map.of("resident_type", "owner", "flat", "C-9", "name", "New Name", "phone", "99999"));
        assertEquals(200, p.status());
        assertEquals("C-9", p.body().get("flat").asText());
        assertEquals("owner", p.body().get("resident_type").asText());
        assertEquals("resident", p.body().get("role").asText());
        for (Map<String, Object> bad : List.<Map<String, Object>>of(Map.of("resident_type", "admin"), Map.of("flat", "x".repeat(21)), Map.of("name", ""),
                Map.of("status", "removed"), Map.of("status", "pending"), Map.of("phone", "x".repeat(21)))) {
            assertEquals(400, admin.patch("/api/admin/users/" + u.id, bad).status(), bad.toString());
        }
        assertEquals("Status must be 'approved' or 'suspended'", admin.patch("/api/admin/users/" + u.id, Map.of("status", "removed")).body().get("error").asText());
        assertEquals(404, admin.patch("/api/admin/users/" + adminId, Map.of("name", "Hacked")).status());
        assertEquals(404, admin.patch("/api/admin/users/" + guardId, Map.of("name", "Hacked")).status());
        assertEquals(404, admin.delete("/api/admin/users/" + adminId).status());
        assertEquals(404, admin.delete("/api/admin/users/" + guardId).status());
        assertEquals(404, admin.post("/api/admin/users/" + adminId + "/reset-password", Map.of("password", "Another1234")).status());
        assertEquals(404, admin.post("/api/admin/users/" + adminId + "/approve").status());
        assertEquals(404, admin.patch("/api/admin/users/99999", Map.of("name", "Z")).status());
        // role cannot be changed
        admin.patch("/api/admin/users/" + u.id, Map.of("role", "admin"));
        assertEquals(403, u.get("/api/admin/users").status());

        // suspend / reinstate
        assertEquals(200, admin.patch("/api/admin/users/" + u.id, Map.of("status", "suspended")).status());
        assertEquals(401, u.get("/api/me").status());
        var login = client().post("/api/login", Map.of("email", "res1@example.test", "password", PW));
        assertEquals(403, login.status());
        assertEquals("Your account is suspended. Contact the committee.", login.body().get("error").asText());
        assertEquals(200, admin.patch("/api/admin/users/" + u.id, Map.of("status", "approved")).status());
        assertEquals(200, client().post("/api/login", Map.of("email", "res1@example.test", "password", PW)).status());

        // reset password: the old session dies, the old password fails, the new one works
        TestClient s = client();
        s.post("/api/login", Map.of("email", "res1@example.test", "password", PW));
        assertEquals(200, s.get("/api/me").status());
        assertEquals(400, admin.post("/api/admin/users/" + u.id + "/reset-password", Map.of("password", "short")).status());
        assertEquals(403, other.post("/api/admin/users/" + u.id + "/reset-password", Map.of("password", "Another1234")).status());
        assertEquals(200, admin.post("/api/admin/users/" + u.id + "/reset-password", Map.of("password", "Another1234")).status());
        assertEquals(401, s.get("/api/me").status());
        assertEquals(401, client().post("/api/login", Map.of("email", "res1@example.test", "password", PW)).status());
        assertEquals(200, client().post("/api/login", Map.of("email", "res1@example.test", "password", "Another1234")).status());

        // own password change keeps own session
        assertEquals(200, other.post("/api/me/password", Map.of("current", PW, "next", "Changed12345")).status());
        assertEquals(200, other.get("/api/me").status());

        // the committee can reset a guard's password too
        assertEquals(200, admin.post("/api/admin/users/" + guardId + "/reset-password", Map.of("password", "GuardPass123")).status());

        // soft remove
        assertEquals(200, admin.delete("/api/admin/users/" + u.id).status());
        var removed = client().post("/api/login", Map.of("email", "res1@example.test", "password", "Another1234"));
        assertEquals(403, removed.status());
        assertEquals(404, admin.patch("/api/admin/users/" + u.id, Map.of("name", "Again")).status());
        assertTrue(ids(admin.get("/api/admin/users?status=removed").body()).contains(u.id));
        assertFalse(ids(admin.get("/api/admin/users?status=pending").body()).contains(u.id));

        List<String> actions = new ArrayList<>();
        for (JsonNode a : admin.get("/api/admin/audit").body()) actions.add(a.get("action").asText());
        for (String a : List.of("suspended", "reinstated", "updated", "password_reset", "removed")) assertTrue(actions.contains(a), a);
    }

    @Test
    void usersGetNotifiedAboutCommitteeActions() {
        TestClient u = person("n1@example.test", "E-1", "owner");
        admin.patch("/api/admin/users/" + u.id, Map.of("status", "suspended"));
        admin.patch("/api/admin/users/" + u.id, Map.of("status", "approved"));
        admin.post("/api/admin/users/" + u.id + "/reset-password", Map.of("password", "Another1234"));
        TestClient again = client();
        again.post("/api/login", Map.of("email", "n1@example.test", "password", "Another1234"));
        String all = again.get("/api/notifications").body().toString();
        assertTrue(all.contains("Your account was suspended by the committee"));
        assertTrue(all.contains("Your account was reinstated by the committee"));
        assertTrue(all.contains("The committee reset your password. Sign in with the new password."));
        assertEquals(3L, again.get("/api/notifications/unread-count").body().get("n").asLong());
    }

    @Test
    void unchangedFieldsWriteNoAuditRows() {
        TestClient u = person("same@example.test", "F-1", "owner");
        long before = admin.get("/api/admin/audit").body().size();
        var r = admin.patch("/api/admin/users/" + u.id, Map.of("flat", "F-1", "resident_type", "owner", "name", "same"));
        assertEquals(200, r.status());
        assertEquals(before, admin.get("/api/admin/audit").body().size());
    }
}
