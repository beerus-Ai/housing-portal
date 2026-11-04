package com.sahyadri.portal.controller;

import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.service.AccessGuard;
import com.sahyadri.portal.service.AiAdminService;
import com.sahyadri.portal.service.EscalationService;
import com.sahyadri.portal.service.WhatsAppService;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import jakarta.servlet.http.HttpServletRequest;
import java.util.Map;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** WhatsApp webhook (public, secret-checked) and the committee AI tools. */
@RestController
public class AiController {
    private final WhatsAppService whatsapp;
    private final AiAdminService aiAdmin;
    private final EscalationService escalation;
    private final AccessGuard guard;

    public AiController(WhatsAppService whatsapp, AiAdminService aiAdmin, EscalationService escalation, AccessGuard guard) {
        this.whatsapp = whatsapp;
        this.aiAdmin = aiAdmin;
        this.escalation = escalation;
        this.guard = guard;
    }

    /** Meta Cloud API verification handshake. */
    @GetMapping("/api/whatsapp/webhook")
    public ResponseEntity<?> verify(@RequestParam(name = "hub.mode", required = false) String mode,
                                    @RequestParam(name = "hub.verify_token", required = false) String token,
                                    @RequestParam(name = "hub.challenge", required = false) String challenge) {
        if ("subscribe".equals(mode) && whatsapp.sameSecret(token)) {
            return ResponseEntity.ok().contentType(MediaType.TEXT_HTML).body(challenge == null ? "" : challenge);
        }
        return ResponseEntity.status(403).body(Map.of("error", "Bad verify token"));
    }

    @PostMapping("/api/whatsapp/webhook")
    public Map<String, Object> webhook(HttpServletRequest req, Body body) {
        String given = req.getHeader("x-webhook-secret");
        if (given == null || given.isEmpty()) given = req.getParameter("secret");
        if (!whatsapp.sameSecret(given)) throw new ApiException(401, "Bad webhook secret");
        return whatsapp.webhook(body);
    }

    @GetMapping("/api/admin/ai")
    public Map<String, Object> console(@AuthenticationPrincipal User u) {
        guard.admin(u);
        return whatsapp.console();
    }

    @PostMapping("/api/admin/whatsapp/simulate")
    public Map<String, Object> simulate(@AuthenticationPrincipal User u, Body body) {
        guard.admin(u);
        return whatsapp.simulate(u, body);
    }

    @PostMapping("/api/admin/whatsapp/messages/{id}/create-request")
    public ResponseEntity<Map<String, Object>> approve(@AuthenticationPrincipal User u, @PathVariable("id") String id) {
        guard.admin(u);
        return ResponseEntity.status(201).body(whatsapp.approve(u, id));
    }

    @PostMapping("/api/admin/whatsapp/messages/{id}/dismiss")
    public Map<String, Object> dismiss(@AuthenticationPrincipal User u, @PathVariable("id") String id) {
        guard.admin(u);
        return whatsapp.dismiss(u, id);
    }

    @PostMapping("/api/admin/ai/draft-notice")
    public Map<String, Object> draft(@AuthenticationPrincipal User u, Body body) {
        guard.admin(u);
        return aiAdmin.draftNotice(body);
    }

    @GetMapping("/api/admin/digest")
    public Map<String, Object> digest(@AuthenticationPrincipal User u) {
        guard.admin(u);
        return aiAdmin.digest();
    }

    @PostMapping("/api/admin/escalations/run")
    public Map<String, Object> run(@AuthenticationPrincipal User u) {
        guard.admin(u);
        return Map.of("escalated", escalation.escalateOverdue());
    }
}
