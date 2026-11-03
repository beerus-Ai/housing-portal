package com.sahyadri.portal.support;

import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.service.AccessGuard;
import com.sahyadri.portal.service.GoogleTokenVerifier;
import java.util.Map;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Test-only beans: a fake Google verifier and routes that exercise the can()/feature guards. */
@TestConfiguration
public class TestConfig {

    public static class FakeGoogleVerifier implements GoogleTokenVerifier {
        public volatile Map<String, Object> claims;

        @Override
        public Map<String, Object> verify(String credential) throws Exception {
            if ("boom".equals(credential)) throw new IllegalStateException("bad token");
            return claims;
        }
    }

    @Bean
    @Primary
    FakeGoogleVerifier fakeGoogleVerifier() {
        return new FakeGoogleVerifier();
    }

    @RestController
    static class GuardProbeController {
        private final AccessGuard guard;

        GuardProbeController(AccessGuard guard) {
            this.guard = guard;
        }

        @GetMapping("/api/test/needs-gate-pass")
        Map<String, Boolean> gatePass(@AuthenticationPrincipal User u) {
            guard.feature(u, "gate");
            guard.permission(u, "gate.pass");
            return Map.of("ok", true);
        }

        @GetMapping("/api/test/gate-staff")
        Map<String, Boolean> gateStaff(@AuthenticationPrincipal User u) {
            guard.gateStaff(u);
            return Map.of("ok", true);
        }
    }
}
