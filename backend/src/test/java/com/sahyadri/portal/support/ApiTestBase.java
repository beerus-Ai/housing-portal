package com.sahyadri.portal.support;

import static org.junit.jupiter.api.Assertions.assertEquals;

import com.sahyadri.portal.service.BootstrapService;
import com.sahyadri.portal.service.LoginThrottle;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;

/** Boots the whole app once (in-memory H2), wipes the data before every test and re-seeds the admin. */
@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("test")
@Import(TestConfig.class)
public abstract class ApiTestBase {
    protected static final Map<String, String> ADMIN = Map.of("email", "admin@society.test", "password", "Admin@1234");
    protected static final String PW = "Passw0rd!";
    protected static final String CID = "client-123.apps.googleusercontent.com";

    private static final List<String> TABLES = List.of("whatsapp_messages", "notifications", "audit", "gate_log", "gate_passes", "resident_tokens",
            "emergencies", "vehicles", "parking_slots", "workers", "comments", "requests", "vendors", "leases", "notices", "contacts", "settings", "role_permissions", "users");

    @Autowired protected MockMvc mvc;
    @Autowired protected JdbcTemplate jdbc;
    @Autowired protected TestConfig.FakeGoogleVerifier google;
    @Autowired private BootstrapService bootstrap;
    @Autowired private LoginThrottle throttle;

    protected TestClient admin;

    @BeforeEach
    void resetState() {
        for (String t : TABLES) jdbc.update("DELETE FROM " + t);
        throttle.clearAll();
        bootstrap.seed();
        google.claims = null;
        admin = client();
        assertEquals(200, admin.post("/api/login", ADMIN).status());
    }

    protected TestClient client() {
        return new TestClient(mvc);
    }

    /** Registers a resident, optionally approves and signs in (like the Node tests' person()). */
    protected TestClient person(String email, String flat, String type, boolean approve) {
        TestClient c = client();
        var reg = client().post("/api/register", Map.of("name", email.split("@")[0], "email", email, "flat", flat,
                "resident_type", type, "password", PW, "consent", true));
        assertEquals(201, reg.status());
        for (var u : admin.get("/api/admin/users?status=pending").body()) {
            if (u.get("email").asText().equals(email)) c.id = u.get("id").asLong();
        }
        if (approve) {
            assertEquals(200, admin.post("/api/admin/users/" + c.id + "/approve").status());
            assertEquals(200, c.post("/api/login", Map.of("email", email, "password", PW)).status());
        }
        return c;
    }

    protected TestClient person(String email, String flat, String type) {
        return person(email, flat, type, true);
    }
}
