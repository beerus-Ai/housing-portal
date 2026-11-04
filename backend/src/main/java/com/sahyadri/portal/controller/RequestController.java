package com.sahyadri.portal.controller;

import com.sahyadri.portal.dto.Ok;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.service.AccessGuard;
import com.sahyadri.portal.service.PhotoStore;
import com.sahyadri.portal.service.RequestService;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import com.sahyadri.portal.support.Text;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartException;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.multipart.MultipartHttpServletRequest;
import org.springframework.web.multipart.MultipartResolver;
import org.springframework.web.util.WebUtils;

@RestController
public class RequestController {
    private final RequestService service;
    private final AccessGuard guard;
    private final PhotoStore photos;
    private final MultipartResolver multipartResolver;

    public RequestController(RequestService service, AccessGuard guard, PhotoStore photos, MultipartResolver multipartResolver) {
        this.service = service;
        this.guard = guard;
        this.photos = photos;
        this.multipartResolver = multipartResolver;
    }

    /** Multipart parsing is lazy (spring.servlet.multipart.resolve-lazily) so the permission check comes first, like Node. */
    private MultipartHttpServletRequest multipart(HttpServletRequest req) {
        MultipartHttpServletRequest m = WebUtils.getNativeRequest(req, MultipartHttpServletRequest.class);
        if (m != null) return m;
        if (!multipartResolver.isMultipart(req)) return null;
        try {
            return multipartResolver.resolveMultipart(req);
        } catch (MultipartException e) {
            String msg = String.valueOf(e.getMessage()).toLowerCase() + " " + String.valueOf(e.getCause()).toLowerCase();
            throw new ApiException(400, msg.contains("size") || msg.contains("large") || msg.contains("exceed") ? "File too large" : "Bad request");
        }
    }

    @PostMapping("/api/requests")
    public ResponseEntity<Map<String, Long>> create(@AuthenticationPrincipal User user, HttpServletRequest req, Body body) {
        guard.permission(user, "request.create");
        MultipartHttpServletRequest m = multipart(req);
        String category, title, description;
        MultipartFile photo = null;
        if (m != null) {
            for (Map.Entry<String, MultipartFile> e : m.getFileMap().entrySet()) {
                if (e.getValue().isEmpty() && (e.getValue().getOriginalFilename() == null || e.getValue().getOriginalFilename().isEmpty())) continue;
                if (!"photo".equals(e.getKey())) throw new ApiException(400, "Unexpected field");
                photo = e.getValue();
            }
            if (photo != null && photo.getSize() > PhotoStore.MAX_BYTES) throw new ApiException(400, "File too large");
            category = m.getParameter("category");
            title = Text.slice(orEmpty(m.getParameter("title")).strip(), 120);
            description = Text.slice(orEmpty(m.getParameter("description")).strip(), 2000);
        } else {
            category = body.text("category");
            title = body.str("title", 120);
            description = body.str("description", 2000);
        }
        long id = service.create(user, category, title, description, photo);
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", id));
    }

    private static String orEmpty(String s) {
        return s == null ? "" : s;
    }

    @GetMapping("/api/requests")
    public List<Map<String, Object>> list(@AuthenticationPrincipal User user, @RequestParam(required = false) String status,
                                          @RequestParam(required = false) String category) {
        return service.list(user, status, category);
    }

    @GetMapping("/api/requests/{id}")
    public Map<String, Object> detail(@AuthenticationPrincipal User user, @PathVariable String id) {
        return service.detail(user, id);
    }

    @GetMapping("/api/requests/{id}/photo")
    public void photo(@AuthenticationPrincipal User user, @PathVariable String id, HttpServletResponse res) throws IOException {
        Map<String, Object> r = service.photoOf(user, id);
        Path file = r == null ? null : photos.file(r.get("photo").toString());
        if (file == null) {
            res.reset();
            res.setStatus(404);
            return;
        }
        res.setStatus(200);
        res.setHeader("Cache-Control", "private, max-age=3600");
        res.setContentType(PhotoStore.mimeOf(file.getFileName().toString()));
        res.setContentLengthLong(Files.size(file));
        Files.copy(file, res.getOutputStream());
    }

    @GetMapping("/api/requests/{id}/comments")
    public List<Map<String, Object>> comments(@AuthenticationPrincipal User user, @PathVariable String id) {
        return service.comments(user, id);
    }

    @PostMapping("/api/requests/{id}/comments")
    public ResponseEntity<Map<String, Long>> comment(@AuthenticationPrincipal User user, @PathVariable String id, Body body) {
        return ResponseEntity.status(HttpStatus.CREATED).body(Map.of("id", service.comment(user, id, body)));
    }

    @PostMapping("/api/requests/{id}/assign")
    public Ok assign(@AuthenticationPrincipal User user, @PathVariable String id, Body body) {
        guard.admin(user);
        service.assign(user, id, body);
        return Ok.TRUE;
    }

    @PostMapping("/api/requests/{id}/status")
    public Ok status(@AuthenticationPrincipal User user, @PathVariable String id, Body body) {
        guard.admin(user);
        service.changeStatus(user, id, body);
        return Ok.TRUE;
    }

    @PostMapping("/api/requests/{id}/rate")
    public Ok rate(@AuthenticationPrincipal User user, @PathVariable String id, Body body) {
        service.rate(user, id, body);
        return Ok.TRUE;
    }
}
