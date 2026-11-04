package com.sahyadri.portal.controller;

import com.sahyadri.portal.dto.Ok;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.service.AccessGuard;
import com.sahyadri.portal.service.AdminOverviewService;
import com.sahyadri.portal.service.EstateService;
import com.sahyadri.portal.support.Body;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Vehicles, parking, workers and the committee overview. */
@RestController
public class EstateController {
    private final EstateService estate;
    private final AdminOverviewService overview;
    private final AccessGuard guard;

    public EstateController(EstateService estate, AdminOverviewService overview, AccessGuard guard) {
        this.estate = estate;
        this.overview = overview;
        this.guard = guard;
    }

    @GetMapping("/api/vehicles")
    public List<Map<String, Object>> vehicles(@AuthenticationPrincipal User u, @RequestParam(required = false) String q) {
        guard.feature(u, "parking");
        return estate.vehicles(u, q);
    }

    @PostMapping("/api/vehicles")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Long> addVehicle(@AuthenticationPrincipal User u, Body body) {
        guard.feature(u, "parking");
        guard.permission(u, "vehicle.manage");
        return Map.of("id", estate.addVehicle(u, body));
    }

    @DeleteMapping("/api/vehicles/{id}")
    public Ok deleteVehicle(@AuthenticationPrincipal User u, @PathVariable String id) {
        guard.feature(u, "parking");
        guard.permission(u, "vehicle.manage");
        estate.deleteVehicle(u, id);
        return Ok.TRUE;
    }

    @GetMapping("/api/parking")
    public Map<String, Object> parking(@AuthenticationPrincipal User u) {
        guard.feature(u, "parking");
        guard.permission(u, "parking.view");
        return estate.parking(u);
    }

    @PostMapping("/api/parking")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Object> createSlots(@AuthenticationPrincipal User u, Body body) {
        guard.admin(u);
        return estate.createSlots(u, body);
    }

    @PostMapping("/api/parking/{id}/assign")
    public Ok assign(@AuthenticationPrincipal User u, @PathVariable String id, Body body) {
        guard.admin(u);
        estate.assign(u, id, body);
        return Ok.TRUE;
    }

    @PostMapping("/api/parking/{id}/free")
    public Ok free(@AuthenticationPrincipal User u, @PathVariable String id) {
        guard.admin(u);
        estate.free(u, id);
        return Ok.TRUE;
    }

    @DeleteMapping("/api/parking/{id}")
    public Ok deleteSlot(@AuthenticationPrincipal User u, @PathVariable String id) {
        guard.admin(u);
        estate.deleteSlot(u, id);
        return Ok.TRUE;
    }

    @GetMapping("/api/admin/workers")
    public List<Map<String, Object>> workers(@AuthenticationPrincipal User u) {
        guard.admin(u);
        return estate.workers();
    }

    @PostMapping("/api/admin/workers")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Long> addWorker(@AuthenticationPrincipal User u, Body body) {
        guard.admin(u);
        return Map.of("id", estate.addWorker(u, body));
    }

    @PutMapping("/api/admin/workers/{id}")
    public Ok updateWorker(@AuthenticationPrincipal User u, @PathVariable String id, Body body) {
        guard.admin(u);
        estate.updateWorker(u, id, body);
        return Ok.TRUE;
    }

    @DeleteMapping("/api/admin/workers/{id}")
    public Ok deleteWorker(@AuthenticationPrincipal User u, @PathVariable String id) {
        guard.admin(u);
        estate.deleteWorker(u, id);
        return Ok.TRUE;
    }

    @GetMapping("/api/admin/overview")
    public Map<String, Object> overview(@AuthenticationPrincipal User u) {
        guard.admin(u);
        return overview.overview();
    }
}
