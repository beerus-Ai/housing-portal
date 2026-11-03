package com.sahyadri.portal.security;

import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.repository.UserRepository;
import com.sahyadri.portal.service.AuthService;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import jakarta.servlet.http.HttpSession;
import java.io.IOException;
import java.util.List;
import org.springframework.security.authentication.UsernamePasswordAuthenticationToken;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Authenticates from the session on every request, re-reading the user so suspension, removal and password
 * resets take effect immediately: the account must still be approved and the session fingerprint must match
 * the current password hash. The authenticated principal is the {@link User}.
 */
public class SessionAuthenticationFilter extends OncePerRequestFilter {
    private final UserRepository users;

    public SessionAuthenticationFilter(UserRepository users) {
        this.users = users;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest req, HttpServletResponse res, FilterChain chain) throws ServletException, IOException {
        HttpSession s = req.getSession(false);
        if (s != null && s.getAttribute(SessionSupport.UID) instanceof Long uid) {
            User u = users.findById(uid).orElse(null);
            if (u != null && "approved".equals(u.status()) && AuthService.fingerprint(u.passwordHash()).equals(s.getAttribute(SessionSupport.FP))) {
                var auth = new UsernamePasswordAuthenticationToken(u, null, List.of(new SimpleGrantedAuthority("ROLE_" + u.role().toUpperCase())));
                SecurityContextHolder.getContext().setAuthentication(auth);
            }
        }
        chain.doFilter(req, res);
    }
}
