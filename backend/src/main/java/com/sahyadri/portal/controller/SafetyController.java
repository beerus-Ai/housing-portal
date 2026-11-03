package com.sahyadri.portal.controller;

import com.sahyadri.portal.dto.Ok;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.service.AccessGuard;
import com.sahyadri.portal.service.ContactService;
import com.sahyadri.portal.service.EmergencyService;
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

/** Emergencies and society contacts. */
@RestController
public class SafetyController {
    private final EmergencyService emergencies;
    private final ContactService contacts;
    private final AccessGuard guard;

    public SafetyController(EmergencyService emergencies, ContactService contacts, AccessGuard guard) {
        this.emergencies = emergencies;
        this.contacts = contacts;
        this.guard = guard;
    }

    @PostMapping("/api/emergencies")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Long> raise(@AuthenticationPrincipal User u, Body body) {
        guard.feature(u, "emergency");
        guard.permission(u, "emergency.raise");
        return Map.of("id", emergencies.raise(u, body));
    }

    @GetMapping("/api/emergencies")
    public List<Map<String, Object>> listEmergencies(@AuthenticationPrincipal User u) {
        guard.feature(u, "emergency");
        return emergencies.list(u);
    }

    @PostMapping("/api/emergencies/{id}/resolve")
    public Ok resolve(@AuthenticationPrincipal User u, @PathVariable String id) {
        guard.admin(u);
        guard.feature(u, "emergency");
        emergencies.resolve(u, id);
        return Ok.TRUE;
    }

    @GetMapping("/api/contacts")
    public List<Map<String, Object>> listContacts(@AuthenticationPrincipal User u) {
        guard.feature(u, "contacts");
        guard.permission(u, "contacts.read");
        return contacts.list();
    }

    @PostMapping("/api/contacts")
    @ResponseStatus(HttpStatus.CREATED)
    public Map<String, Long> addContact(@AuthenticationPrincipal User u, Body body) {
        guard.admin(u);
        return Map.of("id", contacts.create(u, body));
    }

    @DeleteMapping("/api/contacts/{id}")
    public Ok deleteContact(@AuthenticationPrincipal User u, @PathVariable String id) {
        guard.admin(u);
        contacts.delete(u, id);
        return Ok.TRUE;
    }
}
