package com.sahyadri.portal.controller;

import com.sahyadri.portal.dto.MeResponse;
import com.sahyadri.portal.dto.Ok;
import com.sahyadri.portal.dto.PublicUser;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.security.SessionSupport;
import com.sahyadri.portal.service.AccessService;
import com.sahyadri.portal.service.AuthService;
import com.sahyadri.portal.service.SettingsService;
import com.sahyadri.portal.support.Body;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class MeController {
    private final AuthService auth;
    private final AccessService access;
    private final SettingsService settings;

    public MeController(AuthService auth, AccessService access, SettingsService settings) {
        this.auth = auth;
        this.access = access;
        this.settings = settings;
    }

    @GetMapping("/api/me")
    public MeResponse me(@AuthenticationPrincipal User user) {
        return MeResponse.of(user, access.allowedKeys(user), settings.features());
    }

    @PatchMapping("/api/me")
    public PublicUser update(@AuthenticationPrincipal User user, Body body) {
        return auth.updateProfile(user, body);
    }

    @PostMapping("/api/me/password")
    public Ok changePassword(@AuthenticationPrincipal User user, Body body, HttpServletRequest req) {
        String newHash = auth.changePassword(user, body);
        SessionSupport.refreshFingerprint(req, newHash); // the caller stays signed in, other sessions end
        return Ok.TRUE;
    }
}
