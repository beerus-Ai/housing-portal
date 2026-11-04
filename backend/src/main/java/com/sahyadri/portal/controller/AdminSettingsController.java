package com.sahyadri.portal.controller;

import com.sahyadri.portal.dto.AccessResponse;
import com.sahyadri.portal.dto.SocietySettings;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.service.AccessGuard;
import com.sahyadri.portal.service.AccessService;
import com.sahyadri.portal.service.AuditService;
import com.sahyadri.portal.service.SettingsService;
import com.sahyadri.portal.support.Body;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;

/** Committee settings, the access matrix and the audit trail. */
@RestController
public class AdminSettingsController {
    private final SettingsService settings;
    private final AccessService access;
    private final AuditService audit;
    private final AccessGuard guard;

    public AdminSettingsController(SettingsService settings, AccessService access, AuditService audit, AccessGuard guard) {
        this.settings = settings;
        this.access = access;
        this.audit = audit;
        this.guard = guard;
    }

    @GetMapping("/api/admin/settings")
    public SocietySettings getSettings(@AuthenticationPrincipal User user) {
        guard.admin(user);
        return settings.publicSettings();
    }

    @PutMapping("/api/admin/settings")
    public SocietySettings putSettings(@AuthenticationPrincipal User user, Body body) {
        guard.admin(user);
        return settings.update(user, body);
    }

    @GetMapping("/api/admin/access")
    public AccessResponse getAccess(@AuthenticationPrincipal User user) {
        guard.admin(user);
        return access.view();
    }

    @PutMapping("/api/admin/access")
    public AccessResponse putAccess(@AuthenticationPrincipal User user, Body body) {
        guard.admin(user);
        return access.update(user, body);
    }

    @GetMapping("/api/admin/audit")
    public List<Map<String, Object>> audit(@AuthenticationPrincipal User user) {
        guard.admin(user);
        return audit.latest();
    }
}
