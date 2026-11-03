package com.sahyadri.portal.controller;

import com.sahyadri.portal.dto.Ok;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.service.NotificationService;
import java.util.List;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class NotificationController {
    private final NotificationService service;

    public NotificationController(NotificationService service) {
        this.service = service;
    }

    @GetMapping("/api/notifications")
    public List<Map<String, Object>> list(@AuthenticationPrincipal User user) {
        return service.latest(user.id());
    }

    @GetMapping("/api/notifications/unread-count")
    public Map<String, Long> unread(@AuthenticationPrincipal User user) {
        return Map.of("n", service.unreadCount(user.id()));
    }

    @PostMapping("/api/notifications/read")
    public Ok markRead(@AuthenticationPrincipal User user) {
        service.markAllRead(user.id());
        return Ok.TRUE;
    }
}
