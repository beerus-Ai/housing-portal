package com.sahyadri.portal.controller;

import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.service.AccessGuard;
import com.sahyadri.portal.service.ReportService;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class ReportController {
    private final ReportService service;
    private final AccessGuard guard;

    public ReportController(ReportService service, AccessGuard guard) {
        this.service = service;
        this.guard = guard;
    }

    @GetMapping("/api/admin/stats")
    public Map<String, Object> stats(@AuthenticationPrincipal User user) {
        guard.admin(user);
        return service.stats();
    }

    @GetMapping("/api/admin/export.csv")
    public void exportCsv(@AuthenticationPrincipal User user, HttpServletResponse res) throws IOException {
        guard.admin(user);
        byte[] bytes = service.exportCsv().getBytes(StandardCharsets.UTF_8);
        res.setContentType("text/csv; charset=utf-8");
        res.setHeader("Content-Disposition", "attachment; filename=\"requests.csv\"");
        res.getOutputStream().write(bytes);
    }

    @GetMapping("/api/pulse")
    public Map<String, String> pulse(@AuthenticationPrincipal User user) {
        return Map.of("v", service.pulse(user));
    }
}
