package com.sahyadri.portal.controller;

import com.sahyadri.portal.dto.Ok;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.service.AccessGuard;
import com.sahyadri.portal.service.VendorService;
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
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class VendorController {
    private final VendorService service;
    private final AccessGuard guard;

    public VendorController(VendorService service, AccessGuard guard) {
        this.service = service;
        this.guard = guard;
    }

    @GetMapping("/api/vendors")
    public List<Map<String, Object>> list(@AuthenticationPrincipal User user) {
        guard.admin(user);
        return service.list();
    }

    @PostMapping("/api/vendors")
    public ResponseEntity<Map<String, Long>> create(@AuthenticationPrincipal User user, Body body) {
        guard.admin(user);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", service.create(user, body)));
    }

    @PutMapping("/api/vendors/{id}")
    public Ok update(@AuthenticationPrincipal User user, @PathVariable String id, Body body) {
        guard.admin(user);
        service.update(user, id, body);
        return Ok.TRUE;
    }

    @DeleteMapping("/api/vendors/{id}")
    public Ok delete(@AuthenticationPrincipal User user, @PathVariable String id) {
        guard.admin(user);
        service.delete(user, id);
        return Ok.TRUE;
    }
}
