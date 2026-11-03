package com.sahyadri.portal.controller;

import com.sahyadri.portal.dto.Ok;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.service.AccessGuard;
import com.sahyadri.portal.service.GateService;
import com.sahyadri.portal.service.GuardService;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Gate passes, resident tokens, guard verification, gate log/overview and guard accounts. */
@RestController
public class GateController {
    private final GateService gate;
    private final GuardService guards;
    private final AccessGuard guard;

    public GateController(GateService gate, GuardService guards, AccessGuard guard) {
        this.gate = gate;
        this.guards = guards;
        this.guard = guard;
    }

    private static void residentOnly(User u) {
        if (!"resident".equals(u.role()) || u.flat() == null || u.flat().isEmpty()) {
            throw new ApiException(403, "Only residents with a flat can use this");
        }
    }

    @PostMapping("/api/gate/passes")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createPass(@AuthenticationPrincipal User u, Body body) {
        guard.feature(u, "gate");
        guard.permission(u, "gate.pass");
        residentOnly(u);
        return gate.createPass(u, body);
    }

    @GetMapping("/api/gate/passes")
    public List<Map<String, Object>> passes(@AuthenticationPrincipal User u) {
        guard.feature(u, "gate");
        return gate.listPasses(u);
    }

    @PostMapping("/api/gate/passes/{id}/cancel")
    public Ok cancel(@AuthenticationPrincipal User u, @PathVariable String id) {
        guard.feature(u, "gate");
        gate.cancelPass(u, id);
        return Ok.TRUE;
    }

    @GetMapping("/api/gate/me")
    public Map<String, Object> myToken(@AuthenticationPrincipal User u) {
        guard.feature(u, "gate");
        residentOnly(u);
        return gate.myToken(u);
    }

    @PostMapping("/api/gate/me/rotate")
    public Map<String, Object> rotate(@AuthenticationPrincipal User u) {
        guard.feature(u, "gate");
        residentOnly(u);
        return gate.rotateToken(u);
    }

    @PostMapping("/api/gate/verify")
    public Map<String, Object> verify(@AuthenticationPrincipal User u, Body body) {
        guard.gateStaff(u);
        return gate.verify(u, body);
    }

    @GetMapping("/api/gate/log")
    public List<Map<String, Object>> log(@AuthenticationPrincipal User u) {
        guard.gateStaff(u);
        return gate.log();
    }

    @GetMapping("/api/gate/overview")
    public Map<String, Object> overview(@AuthenticationPrincipal User u) {
        guard.gateStaff(u);
        return gate.overview();
    }

    @PostMapping("/api/admin/guards")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Long> createGuard(@AuthenticationPrincipal User u, Body body) {
        guard.admin(u);
        return Map.of("id", guards.create(u, body));
    }

    @GetMapping("/api/admin/guards")
    public List<Map<String, Object>> listGuards(@AuthenticationPrincipal User u) {
        guard.admin(u);
        return guards.list();
    }

    @DeleteMapping("/api/admin/guards/{id}")
    public Ok deleteGuard(@AuthenticationPrincipal User u, @PathVariable String id) {
        guard.admin(u);
        guards.delete(u, id);
        return Ok.TRUE;
    }
}
