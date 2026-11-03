package com.sahyadri.portal.config;

import com.sahyadri.portal.service.SettingsService;
import com.sahyadri.portal.support.JsonErrors;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.net.URI;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Collectors;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Same response headers as app.js (incl. the CSP, which only admits Google hosts while a google_client_id is
 * set) and the cross-origin write block: state-changing /api calls whose Origin host differs from Host get 403.
 * Runs before Spring Security so even 401/403 responses carry the headers.
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE)
public class SecurityHeadersFilter extends OncePerRequestFilter {
    private static final Set<String> SAFE_METHODS = Set.of("GET", "HEAD", "OPTIONS");

    private final SettingsService settings;
    private final PortalProperties props;

    public SecurityHeadersFilter(SettingsService settings, PortalProperties props) {
        this.settings = settings;
        this.props = props;
    }

    String cspHeader() {
        Map<String, List<String>> d = new LinkedHashMap<>();
        d.put("default-src", new ArrayList<>(List.of("'self'")));
        d.put("img-src", new ArrayList<>(List.of("'self'", "data:")));
        d.put("style-src", new ArrayList<>(List.of("'self'", "'unsafe-inline'")));
        d.put("script-src", new ArrayList<>(List.of("'self'")));
        d.put("object-src", new ArrayList<>(List.of("'none'")));
        d.put("base-uri", new ArrayList<>(List.of("'self'")));
        d.put("form-action", new ArrayList<>(List.of("'self'")));
        d.put("frame-ancestors", new ArrayList<>(List.of("'none'")));
        if (!settings.googleClientId().isEmpty()) {
            d.get("script-src").add("https://accounts.google.com/gsi/client");
            d.put("connect-src", new ArrayList<>(List.of("'self'", "https://accounts.google.com/gsi/")));
            d.put("frame-src", new ArrayList<>(List.of("https://accounts.google.com/gsi/")));
            d.get("style-src").add("https://accounts.google.com/gsi/style");
            d.get("img-src").add("https://*.googleusercontent.com");
        }
        return d.entrySet().stream().map(e -> e.getKey() + " " + String.join(" ", e.getValue())).collect(Collectors.joining("; "));
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        res.setHeader("X-Content-Type-Options", "nosniff");
        res.setHeader("X-Frame-Options", "DENY");
        res.setHeader("Referrer-Policy", "same-origin");
        res.setHeader("Content-Security-Policy", cspHeader());
        res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
        res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
        res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
        if (props.production()) res.setHeader("Strict-Transport-Security", "max-age=15552000; includeSubDomains");
        String path = req.getRequestURI().substring(req.getContextPath().length());
        boolean api = path.startsWith("/api/");
        if (api) res.setHeader("Cache-Control", "no-store");
        // CSRF defence in depth (SameSite=Lax is the primary control).
        String origin = req.getHeader("Origin");
        if (api && !SAFE_METHODS.contains(req.getMethod()) && origin != null && !origin.isEmpty() && !sameHost(origin, req.getHeader("Host"))) {
            JsonErrors.write(res, 403, "Cross-origin request blocked");
            return;
        }
        chain.doFilter(req, res);
    }

    /** JS: new URL(origin).host === req.get('host'). */
    private static boolean sameHost(String origin, String host) {
        try {
            URI u = new URI(origin);
            if (u.getScheme() == null || u.getHost() == null) return false;
            String h = u.getPort() == -1 ? u.getHost() : u.getHost() + ":" + u.getPort();
            return h.equalsIgnoreCase(host);
        } catch (Exception e) {
            return false;
        }
    }
}
