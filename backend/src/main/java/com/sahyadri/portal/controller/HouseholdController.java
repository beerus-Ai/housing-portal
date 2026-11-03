package com.sahyadri.portal.controller;

import com.sahyadri.portal.dto.Ok;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.service.AccessGuard;
import com.sahyadri.portal.service.HouseholdService;
import com.sahyadri.portal.support.Body;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RestController;
import com.fasterxml.jackson.databind.ObjectMapper;

@RestController
public class HouseholdController {
    private final HouseholdService service;
    private final AccessGuard guard;
    private final ObjectMapper mapper;

    public HouseholdController(HouseholdService service, AccessGuard guard, ObjectMapper mapper) {
        this.service = service;
        this.guard = guard;
        this.mapper = mapper;
    }

    @GetMapping("/api/household")
    public List<Map<String, Object>> members(@AuthenticationPrincipal User user) {
        return service.members(user);
    }

    @PostMapping("/api/household")
    public ResponseEntity<Map<String, Long>> add(@AuthenticationPrincipal User user, Body body) {
        guard.permission(user, "household.manage");
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", service.addMember(user, body)));
    }

    /** The lease row, or the JSON literal null when none is set (Express res.json(null)). */
    @GetMapping("/api/lease")
    public ResponseEntity<String> lease(@AuthenticationPrincipal User user) throws Exception {
        guard.permission(user, "lease.view");
        return ResponseEntity.ok().contentType(MediaType.APPLICATION_JSON).body(mapper.writeValueAsString(service.lease(user)));
    }

    @PutMapping("/api/admin/users/{id}/lease")
    public Ok setLease(@AuthenticationPrincipal User user, @PathVariable String id, Body body) {
        guard.admin(user);
        service.setLease(user, id, body);
        return Ok.TRUE;
    }

    @GetMapping("/api/admin/leases")
    public List<Map<String, Object>> leases(@AuthenticationPrincipal User user) {
        guard.admin(user);
        return service.leases();
    }
}
