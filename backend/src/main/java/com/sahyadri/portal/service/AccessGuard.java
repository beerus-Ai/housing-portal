package com.sahyadri.portal.service;

import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.support.ApiException;
import org.springframework.stereotype.Component;

/**
 * The route guards from app.js (admin, gate, feat, can) as plain calls: each throws the same 403 the Node
 * middleware sent. Controllers call them right after authentication, before validating input.
 */
@Component
public class AccessGuard {
    private final AccessService access;
    private final SettingsService settings;

    public AccessGuard(AccessService access, SettingsService settings) {
        this.access = access;
        this.settings = settings;
    }

    public void admin(User u) {
        if (!u.isAdmin()) throw new ApiException(403, "Admin only");
    }

    public void gateStaff(User u) {
        if (!u.isAdmin() && !"guard".equals(u.role())) throw new ApiException(403, "Gate staff only");
    }

    /** Feature toggles never apply to the committee. */
    public void feature(User u, String name) {
        if (!u.isAdmin() && !settings.featureOn(name)) throw new ApiException(403, "This feature is turned off");
    }

    public void permission(User u, String permission) {
        access.require(u, permission);
    }
}
