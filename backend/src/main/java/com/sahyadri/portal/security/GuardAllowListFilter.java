package com.sahyadri.portal.security;

import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.support.JsonErrors;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.io.IOException;
import java.util.Set;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Gate staff get a strict allow-list so no resident or committee route can ever leak data to them.
 * Applies only to routes that need sign-in (the public routes stay open to everyone, as in app.js).
 */
public class GuardAllowListFilter extends OncePerRequestFilter {
    public static final Set<String> PUBLIC_PATHS = Set.of("/api/register", "/api/login", "/api/logout", "/api/auth/google", "/api/settings");

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        Authentication auth = SecurityContextHolder.getContext().getAuthentication();
        String p = req.getRequestURI().substring(req.getContextPath().length());
        if (auth != null && auth.getPrincipal() instanceof User u && "guard".equals(u.role()) && p.startsWith("/api/") && !PUBLIC_PATHS.contains(p)) {
            String m = req.getMethod();
            boolean ok = (m.equals("GET") && p.equals("/api/me"))
                    || (m.equals("POST") && (p.equals("/api/me/password") || p.equals("/api/gate/verify")))
                    || (m.equals("GET") && (p.equals("/api/gate/log") || p.equals("/api/pulse")))
                    || p.equals("/api/notifications") || p.startsWith("/api/notifications/");
            if (!ok) {
                JsonErrors.write(res, 403, "Not allowed for guard accounts");
                return;
            }
        }
        chain.doFilter(req, res);
    }
}
