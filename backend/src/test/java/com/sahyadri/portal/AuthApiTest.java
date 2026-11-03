package com.sahyadri.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.support.ApiTestBase;
import com.sahyadri.portal.support.TestClient;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.security.crypto.password.PasswordEncoder;

class AuthApiTest extends ApiTestBase {
    @Autowired PasswordEncoder encoder;

    private Map<String, Object> reg(String email) {
        return Map.of("name", "New One", "email", email, "flat", "A-1", "resident_type", "owner", "password", PW, "consent", true);
    }

    @Test
    void emptyDatabaseHasOnlyTheAdmin() {
        JsonNode users = admin.get("/api/admin/users").body();
        assertEquals(1, users.size());
        assertEquals("admin", users.get(0).get("role").asText());
        assertEquals(0, admin.get("/api/notifications").body().size());
        for (JsonNode a : admin.get("/api/admin/audit").body()) assertEquals("login", a.get("action").asText());
        assertEquals(200, client().get("/healthz").status());
        assertTrue(client().get("/healthz").body().get("ok").asBoolean());
    }

    @Test
    void registerApproveLogin() {
        String email = "new@example.test";
        TestClient c = client();
        var r = client().post("/api/register", reg(email));
        assertEquals(201, r.status());
        assertEquals("Registered. An admin will review your account.", r.body().get("message").asText());
        var pending = c.post("/api/login", Map.of("email", email, "password", PW));
        assertEquals(403, pending.status());
        assertEquals("Your account is awaiting admin approval", pending.body().get("error").asText());
        assertEquals(401, c.get("/api/me").status());
        JsonNode p = admin.get("/api/admin/users?status=pending").body();
        assertEquals(1, p.size());
        boolean notified = false;
        for (JsonNode n : admin.get("/api/notifications").body()) notified |= n.get("message").asText().contains("awaiting approval");
        assertTrue(notified, "admin is notified of the registration");
        admin.post("/api/admin/users/" + p.get(0).get("id").asLong() + "/approve");
        assertEquals(401, c.post("/api/login", Map.of("email", email, "password", "wrong-pass")).status());
        var ok = c.post("/api/login", Map.of("email", email, "password", PW));
        assertEquals(200, ok.status());
        assertEquals("resident", ok.body().get("role").asText());
        assertTrue(!ok.body().has("password_hash"));
        assertEquals(email, c.get("/api/me").body().get("email").asText());
        JsonNode audit = admin.get("/api/admin/audit").body();
        boolean registered = false, approved = false;
        for (JsonNode a : audit) {
            registered |= a.get("entity").asText().equals("user") && a.get("action").asText().equals("registered");
            approved |= a.get("entity").asText().equals("user") && a.get("action").asText().equals("approve");
        }
        assertTrue(registered && approved);
    }

    @Test
    void registrationValidationMessages() {
        var c = client();
        assertEquals("Name, valid email and flat are required", c.post("/api/register", Map.of("name", "", "email", "a@b.co", "flat", "A")).body().get("error").asText());
        assertEquals(400, c.post("/api/register", Map.of("name", "N", "email", "bad", "flat", "A")).status());
        assertEquals("Choose owner, tenant or family", c.post("/api/register", Map.of("name", "N", "email", "a@b.co", "flat", "A", "resident_type", "admin")).body().get("error").asText());
        assertEquals("Password must be 8 to 128 characters", c.post("/api/register", Map.of("name", "N", "email", "a@b.co", "flat", "A", "resident_type", "owner", "password", "short")).body().get("error").asText());
        assertEquals("Consent to data processing is required", c.post("/api/register", Map.of("name", "N", "email", "a@b.co", "flat", "A", "resident_type", "owner", "password", PW)).body().get("error").asText());
        assertEquals(201, c.post("/api/register", reg("dup@example.test")).status());
        var dup = c.post("/api/register", reg("DUP@example.test"));
        assertEquals(409, dup.status());
        assertEquals("Email already registered", dup.body().get("error").asText());
    }

    @Test
    void statusMessagesAtLogin() {
        TestClient pend = person("p@example.test", "A-1", "owner", false);
        JsonNode u = admin.get("/api/admin/users?status=pending").body();
        long id = u.get(0).get("id").asLong();
        assertEquals(200, admin.post("/api/admin/users/" + id + "/reject").status());
        var rejected = client().post("/api/login", Map.of("email", "p@example.test", "password", PW));
        assertEquals(403, rejected.status());
        assertEquals("Your registration was not approved", rejected.body().get("error").asText());
        TestClient t = person("t@example.test", "B-1", "tenant");
        admin.delete("/api/admin/users/" + t.id);
        var removed = client().post("/api/login", Map.of("email", "t@example.test", "password", PW));
        assertEquals("This account is no longer active. Contact the committee.", removed.body().get("error").asText());
    }

    @Test
    void failedLoginsAreRateLimitedPerEmailAndIp() {
        person("r@example.test", "A-1", "owner");
        TestClient c = client();
        for (int i = 0; i < 5; i++) assertEquals(401, c.post("/api/login", Map.of("email", "r@example.test", "password", "nope-nope")).status());
        var blocked = c.post("/api/login", Map.of("email", "r@example.test", "password", PW));
        assertEquals(429, blocked.status());
        assertEquals("Too many attempts. Try again later.", blocked.body().get("error").asText());
        // a different email from the same address is still allowed until the 30 per-IP limit
        assertEquals(401, c.post("/api/login", Map.of("email", "other@example.test", "password", "x")).status());
        for (int i = 0; i < 24; i++) c.post("/api/login", Map.of("email", "n" + i + "@example.test", "password", "x"));
        assertEquals(429, c.post("/api/login", Map.of("email", "fresh@example.test", "password", PW)).status());
    }

    @Test
    void successfulLoginClearsTheEmailCounter() {
        person("s@example.test", "A-1", "owner");
        TestClient c = client();
        for (int i = 0; i < 4; i++) c.post("/api/login", Map.of("email", "s@example.test", "password", "nope-nope"));
        assertEquals(200, c.post("/api/login", Map.of("email", "s@example.test", "password", PW)).status());
        for (int i = 0; i < 4; i++) assertEquals(401, c.post("/api/login", Map.of("email", "s@example.test", "password", "nope-nope")).status());
    }

    @Test
    void logoutEndsTheSession() {
        TestClient t = person("l@example.test", "A-1", "owner");
        assertEquals(200, t.get("/api/me").status());
        assertEquals(200, t.post("/api/logout").status());
        assertEquals(401, t.get("/api/lease").status());
        assertEquals(401, t.get("/api/me").status());
        assertEquals(200, client().post("/api/logout").status()); // logout needs no session
    }

    @Test
    void anonymousIs401AndResidentIs403OnAdminRoutes() {
        TestClient anon = client();
        for (String u : new String[] {"/api/me", "/api/notifications", "/api/admin/users", "/api/admin/audit", "/api/admin/settings", "/api/admin/access"}) {
            var r = anon.get(u);
            assertEquals(401, r.status(), u);
            assertEquals("Not signed in", r.body().get("error").asText());
        }
        TestClient res = person("r@example.test", "A-1", "owner");
        for (String u : new String[] {"/api/admin/users", "/api/admin/audit", "/api/admin/settings", "/api/admin/access"}) {
            var r = res.get(u);
            assertEquals(403, r.status(), u);
            assertEquals("Admin only", r.body().get("error").asText());
        }
        assertEquals(403, res.post("/api/admin/users/1/approve").status());
    }

    @Test
    void profileAndPassword() {
        TestClient res = person("pp@example.test", "A-1", "owner");
        assertEquals("Test Resident Two", res.patch("/api/me", Map.of("name", "Test Resident Two", "phone", "+91 90000 00000")).body().get("name").asText());
        assertEquals("+91 90000 00000", res.get("/api/me").body().get("phone").asText());
        assertEquals("Test Resident Two", res.patch("/api/me", Map.of("name", "   ")).body().get("name").asText()); // blank keeps the name
        assertEquals(403, res.post("/api/me/password", Map.of("current", "wrong", "next", "NewPassw0rd!")).status());
        assertEquals("Current password is wrong", res.post("/api/me/password", Map.of("current", "wrong", "next", "NewPassw0rd!")).body().get("error").asText());
        var shortPw = res.post("/api/me/password", Map.of("current", PW, "next", "short"));
        assertEquals(400, shortPw.status());
        assertEquals("New password must be at least 8 characters", shortPw.body().get("error").asText());
        assertEquals(200, res.post("/api/me/password", Map.of("current", PW, "next", "NewPassw0rd!")).status());
        assertEquals(200, res.get("/api/me").status()); // own session survives
        assertEquals(200, client().post("/api/login", Map.of("email", "pp@example.test", "password", "NewPassw0rd!")).status());
        assertEquals(401, client().post("/api/login", Map.of("email", "pp@example.test", "password", PW)).status());
        boolean changed = false;
        for (JsonNode a : admin.get("/api/admin/audit").body()) changed |= a.get("action").asText().equals("password_changed");
        assertTrue(changed);
    }

    @Test
    void passwordChangeAttemptsAreThrottled() {
        TestClient res = person("th@example.test", "A-1", "owner");
        for (int i = 0; i < 5; i++) assertEquals(403, res.post("/api/me/password", Map.of("current", "wrong", "next", "NewPassw0rd!")).status());
        assertEquals(429, res.post("/api/me/password", Map.of("current", PW, "next", "NewPassw0rd!")).status());
    }

    @Test
    void guardAccountsAreRestrictedToTheAllowList() {
        jdbc.update("INSERT INTO users(name,email,password_hash,role,status) VALUES(?,?,?,?,?)", "Gus", "gus@example.test", encoder.encode(PW), "guard", "approved");
        TestClient g = client();
        assertEquals(200, g.post("/api/login", Map.of("email", "gus@example.test", "password", PW)).status());
        assertEquals(200, g.get("/api/me").status());
        assertEquals(0, g.get("/api/me").body().get("permissions").size());
        assertEquals(200, g.get("/api/notifications").status());
        assertEquals(200, g.get("/api/notifications/unread-count").status());
        assertEquals(200, g.get("/api/settings").status());
        var denied = g.get("/api/admin/users");
        assertEquals(403, denied.status());
        assertEquals("Not allowed for guard accounts", denied.body().get("error").asText());
        assertEquals(403, g.get("/api/test/gate-staff").status()); // allow-list wins over the route's own guard
        assertEquals(403, g.patch("/api/me", Map.of("name", "X")).status());
        assertEquals(200, g.post("/api/me/password", Map.of("current", PW, "next", "Another1234")).status());
        assertNull(admin.get("/api/admin/users").body().get(0).get("password_hash"));
        // the committee list hides guards
        for (JsonNode u : admin.get("/api/admin/users").body()) assertTrue(!u.get("role").asText().equals("guard"));
    }

    @Test
    void malformedAndOversizedBodies() {
        assertEquals(400, client().post("/api/login", "{not json").status());
        assertEquals("Bad request", client().post("/api/login", "{not json").body().get("error").asText());
        // non-object bodies behave like an empty body
        assertEquals(401, client().post("/api/login", "[]").status());
        var big = client().post("/api/login", "{\"email\":\"" + "x".repeat(110_000) + "\"}");
        assertEquals(413, big.status());
        assertEquals("Request too large", big.body().get("error").asText());
        var unknown = client().get("/api/nope");
        assertEquals(401, unknown.status());
        assertEquals(404, admin.get("/api/nope").status());
        assertEquals("Not found", admin.get("/api/nope").body().get("error").asText());
    }
}
