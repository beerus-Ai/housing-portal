package com.sahyadri.portal.controller;

import com.sahyadri.portal.dto.Ok;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.service.AccessGuard;
import com.sahyadri.portal.service.UserAdminService;
import com.sahyadri.portal.support.Body;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class AdminUserController {
    private final UserAdminService service;
    private final AccessGuard guard;

    public AdminUserController(UserAdminService service, AccessGuard guard) {
        this.service = service;
        this.guard = guard;
    }

    @GetMapping("/api/admin/users")
    public List<Map<String, Object>> list(@AuthenticationPrincipal User user,
                                          @RequestParam(required = false) String status,
                                          @RequestParam(required = false) String q) {
        guard.admin(user);
        return service.list(status, q);
    }

    @GetMapping("/api/admin/users/{id}")
    public Map<String, Object> get(@AuthenticationPrincipal User user, @PathVariable String id) {
        guard.admin(user);
        return service.detail(id);
    }

    @PostMapping("/api/admin/users/{id}/approve")
    public Ok approve(@AuthenticationPrincipal User user, @PathVariable String id) {
        guard.admin(user);
        service.decide(user, id, "approve");
        return Ok.TRUE;
    }

    @PostMapping("/api/admin/users/{id}/reject")
    public Ok reject(@AuthenticationPrincipal User user, @PathVariable String id) {
        guard.admin(user);
        service.decide(user, id, "reject");
        return Ok.TRUE;
    }

    @PatchMapping("/api/admin/users/{id}")
    public Map<String, Object> patch(@AuthenticationPrincipal User user, @PathVariable String id, Body body) {
        guard.admin(user);
        return service.patch(user, id, body);
    }

    @PostMapping("/api/admin/users/{id}/reset-password")
    public Ok resetPassword(@AuthenticationPrincipal User user, @PathVariable String id, Body body) {
        guard.admin(user);
        service.resetPassword(user, id, body);
        return Ok.TRUE;
    }

    @DeleteMapping("/api/admin/users/{id}")
    public Ok remove(@AuthenticationPrincipal User user, @PathVariable String id) {
        guard.admin(user);
        service.remove(user, id);
        return Ok.TRUE;
    }
}
