package com.sahyadri.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.sahyadri.portal.config.PortalProperties;
import com.sahyadri.portal.repository.UserRepository;
import com.sahyadri.portal.service.AccessService;
import com.sahyadri.portal.service.BootstrapService;
import org.junit.jupiter.api.Test;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;

/** The production start-up rules from db.js / app.js. */
class BootstrapTest {
    private final UserRepository users = mock(UserRepository.class);
    private final AccessService access = mock(AccessService.class);
    private final BCryptPasswordEncoder encoder = new BCryptPasswordEncoder(4);

    private BootstrapService svc(boolean prod, String email, String pw, String secret) {
        return new BootstrapService(new PortalProperties(prod, email, pw, secret), users, access, encoder);
    }

    @Test
    void productionRequiresSessionSecret() {
        var e = assertThrows(IllegalStateException.class, () -> svc(true, "a@b.co", "long-enough-pw-1", "").afterSingletonsInstantiated());
        assertEquals("SESSION_SECRET must be set in production", e.getMessage());
    }

    @Test
    void productionFirstStartRequiresAStrongAdminPassword() {
        when(users.adminExists()).thenReturn(false);
        assertThrows(IllegalStateException.class, () -> svc(true, "a@b.co", "short-pw", "secret").afterSingletonsInstantiated());
        assertThrows(IllegalStateException.class, () -> svc(true, "a@b.co", "", "secret").afterSingletonsInstantiated());
        verify(users, never()).insertAdmin(anyString(), anyString(), anyString());
    }

    @Test
    void productionSeedsTheConfiguredAdmin() {
        when(users.adminExists()).thenReturn(false);
        svc(true, "boss@society.example", "long-enough-pw-1", "secret").afterSingletonsInstantiated();
        verify(users).insertAdmin(org.mockito.ArgumentMatchers.eq("Society Admin"), org.mockito.ArgumentMatchers.eq("boss@society.example"), anyString());
    }

    @Test
    void existingAdminIsNeverReplacedAndNoPasswordIsNeededAgain() {
        when(users.adminExists()).thenReturn(true);
        svc(true, "", "", "secret").afterSingletonsInstantiated();
        verify(users, never()).insertAdmin(anyString(), anyString(), anyString());
    }

    @Test
    void developmentFallsBackToTheLocalDefaults() {
        when(users.adminExists()).thenReturn(false);
        svc(false, "", "", "").afterSingletonsInstantiated();
        verify(users).insertAdmin(org.mockito.ArgumentMatchers.eq("Society Admin"), org.mockito.ArgumentMatchers.eq("admin@society.test"), anyString());
    }
}
