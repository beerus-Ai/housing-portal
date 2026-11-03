package com.sahyadri.portal.controller;

import com.sahyadri.portal.dto.Ok;
import com.sahyadri.portal.dto.PublicUser;
import com.sahyadri.portal.dto.SocietySettings;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.security.SessionSupport;
import com.sahyadri.portal.service.AuthService;
import com.sahyadri.portal.service.SettingsService;
import com.sahyadri.portal.support.Body;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Public routes: register, login, Google sign-in, logout, public settings, health. */
@RestController
public class AuthController {
    private final AuthService auth;
    private final SettingsService settings;

    public AuthController(AuthService auth, SettingsService settings) {
        this.auth = auth;
        this.settings = settings;
    }

    @PostMapping("/api/register")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, String> register(Body body) {
        auth.register(body);
        return Map.of("message", "Registered. An admin will review your account.");
    }

    @PostMapping("/api/login")
    public PublicUser login(Body body, HttpServletRequest req) {
        User u = auth.authenticate(req.getRemoteAddr(), body);
        SessionSupport.establish(req, u);
        auth.recordLogin(u, null);
        return PublicUser.from(u);
    }

    @PostMapping("/api/auth/google")
    public PublicUser google(Body body, HttpServletRequest req) {
        User u = auth.authenticateGoogle(req.getRemoteAddr(), body);
        SessionSupport.establish(req, u);
        auth.recordLogin(u, "method google");
        return PublicUser.from(u);
    }

    @PostMapping("/api/logout")
    public Ok logout(HttpServletRequest req) {
        SessionSupport.destroy(req);
        return Ok.TRUE;
    }

    @GetMapping("/api/settings")
    public SocietySettings publicSettings() {
        return settings.publicSettings();
    }

    @GetMapping("/healthz")
    public Map<String, Boolean> healthz() {
        return Map.of("ok", true);
    }
}
