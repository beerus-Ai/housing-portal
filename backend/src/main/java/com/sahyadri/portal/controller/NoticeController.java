package com.sahyadri.portal.controller;

import com.sahyadri.portal.dto.Ok;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.service.AccessGuard;
import com.sahyadri.portal.service.NoticeService;
import com.sahyadri.portal.support.Body;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class NoticeController {
    private final NoticeService service;
    private final AccessGuard guard;

    public NoticeController(NoticeService service, AccessGuard guard) {
        this.service = service;
        this.guard = guard;
    }

    @GetMapping("/api/notices")
    public List<Map<String, Object>> list(@AuthenticationPrincipal User user) {
        guard.feature(user, "notices");
        guard.permission(user, "notice.read");
        return service.list();
    }

    @PostMapping("/api/notices")
    public ResponseEntity<Map<String, Long>> post(@AuthenticationPrincipal User user, Body body) {
        guard.admin(user);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", service.post(user, body)));
    }

    @DeleteMapping("/api/notices/{id}")
    public Ok delete(@AuthenticationPrincipal User user, @PathVariable String id) {
        guard.admin(user);
        service.delete(user, id);
        return Ok.TRUE;
    }
}
