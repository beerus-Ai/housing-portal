package com.sahyadri.portal.service;

import com.sahyadri.portal.config.PortalProperties;
import com.sahyadri.portal.repository.UserRepository;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/**
 * First-start seeding, as db.js does: default role permissions (only when empty) and the committee admin
 * (only when no admin exists). Production refuses to start without SESSION_SECRET and, on first start,
 * without a 12+ character ADMIN_PASSWORD.
 */
@Service
public class BootstrapService implements SmartInitializingSingleton {
    private final PortalProperties props;
    private final UserRepository users;
    private final AccessService access;
    private final PasswordEncoder encoder;

    public BootstrapService(PortalProperties props, UserRepository users, AccessService access, PasswordEncoder encoder) {
        this.props = props;
        this.users = users;
        this.access = access;
        this.encoder = encoder;
    }

    @Override
    public void afterSingletonsInstantiated() {
        if (props.production() && blank(props.sessionSecret())) {
            throw new IllegalStateException("SESSION_SECRET must be set in production");
        }
        seed();
    }

    public void seed() {
        access.seedDefaults();
        if (users.adminExists()) return;
        if (props.production() && (blank(props.adminPassword()) || props.adminPassword().length() < 12)) {
            throw new IllegalStateException("Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ chars) before first production start");
        }
        // Synthetic default admin for dev/demo only. Set ADMIN_EMAIL / ADMIN_PASSWORD in production.
        String email = blank(props.adminEmail()) ? "admin@society.test" : props.adminEmail();
        String pw = blank(props.adminPassword()) ? "Admin@1234" : props.adminPassword();
        users.insertAdmin("Society Admin", email, encoder.encode(pw));
    }

    private static boolean blank(String s) {
        return s == null || s.isBlank();
    }
}
