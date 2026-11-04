package com.sahyadri.portal.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.dto.AccessResponse;
import com.sahyadri.portal.dto.PermissionDef;
import com.sahyadri.portal.repository.PermissionRepository;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** The role_permissions matrix and the can(permission) check used by every resident-facing route. */
@Service
public class AccessService {
    public static final List<PermissionDef> PERMISSIONS = List.of(
            new PermissionDef("request.create", "Raise work requests"),
            new PermissionDef("emergency.raise", "Raise emergency alerts"),
            new PermissionDef("gate.pass", "Create visitor gate passes"),
            new PermissionDef("household.manage", "Add household members"),
            new PermissionDef("notice.read", "Read notices"),
            new PermissionDef("contacts.read", "View society contacts"),
            new PermissionDef("lease.view", "View own lease"),
            new PermissionDef("vehicle.manage", "Register vehicles"),
            new PermissionDef("parking.view", "View parking"));
    public static final List<String> ACCESS_ROLES = List.of("owner", "tenant", "family");
    /** Permissions switched off by default, per role (everything else defaults on). */
    public static final Map<String, List<String>> DEFAULT_OFF = Map.of(
            "owner", List.of(),
            "tenant", List.of("household.manage"),
            "family", List.of("household.manage", "lease.view", "vehicle.manage"));

    private final PermissionRepository repo;
    private final AuditService audit;

    public AccessService(PermissionRepository repo, AuditService audit) {
        this.repo = repo;
        this.audit = audit;
    }

    private static boolean known(String key) {
        return PERMISSIONS.stream().anyMatch(p -> p.key().equals(key));
    }

    /** Admin: everything. Residents: what the matrix allows for their type. Others (guards): nothing. */
    public List<String> allowedKeys(User u) {
        if (u.isAdmin()) return PERMISSIONS.stream().map(PermissionDef::key).toList();
        if (!"resident".equals(u.role()) || !ACCESS_ROLES.contains(u.residentType())) return List.of();
        Set<String> allowed = new HashSet<>(repo.allowedFor(u.residentType()));
        return PERMISSIONS.stream().map(PermissionDef::key).filter(allowed::contains).toList();
    }

    public boolean can(User u, String permission) {
        return allowedKeys(u).contains(permission);
    }

    /** Enforcement helper: 403 'Your role does not have access to this' unless the user holds the permission. */
    public void require(User u, String permission) {
        if (!can(u, permission)) throw new ApiException(403, "Your role does not have access to this");
    }

    public Map<String, Map<String, Boolean>> matrix() {
        Map<String, Map<String, Boolean>> m = new LinkedHashMap<>();
        for (String r : ACCESS_ROLES) {
            Map<String, Boolean> perms = new LinkedHashMap<>();
            for (PermissionDef p : PERMISSIONS) perms.put(p.key(), false);
            m.put(r, perms);
        }
        for (Map<String, Object> row : repo.all()) {
            Map<String, Boolean> perms = m.get((String) row.get("role"));
            String key = (String) row.get("permission");
            if (perms != null && perms.containsKey(key)) perms.put(key, ((Number) row.get("allowed")).intValue() == 1);
        }
        return m;
    }

    public AccessResponse view() {
        return new AccessResponse(ACCESS_ROLES, PERMISSIONS, matrix());
    }

    @Transactional
    public AccessResponse update(User actor, Body b) {
        JsonNode m = b.get("matrix");
        if (!m.isObject()) throw new ApiException(400, "matrix is required");
        Map<String, Map<String, Boolean>> cur = matrix();
        Map<String, Map<String, Boolean>> next = new LinkedHashMap<>();
        cur.forEach((r, perms) -> next.put(r, new LinkedHashMap<>(perms)));

        for (Iterator<Map.Entry<String, JsonNode>> it = m.fields(); it.hasNext(); ) {
            Map.Entry<String, JsonNode> role = it.next();
            if (!ACCESS_ROLES.contains(role.getKey()) || !role.getValue().isObject()) throw new ApiException(400, "Unknown role");
            for (Iterator<Map.Entry<String, JsonNode>> pit = role.getValue().fields(); pit.hasNext(); ) {
                Map.Entry<String, JsonNode> perm = pit.next();
                if (!known(perm.getKey())) throw new ApiException(400, "Unknown permission");
                if (!perm.getValue().isBoolean()) throw new ApiException(400, "Permissions must be true or false");
                next.get(role.getKey()).put(perm.getKey(), perm.getValue().asBoolean());
            }
        }

        List<String> diffs = new ArrayList<>();
        repo.deleteAll();
        for (String r : ACCESS_ROLES) {
            for (PermissionDef p : PERMISSIONS) {
                boolean now = next.get(r).get(p.key()), before = cur.get(r).get(p.key());
                repo.insert(r, p.key(), now);
                if (now != before) diffs.add(r + " " + p.key() + ": " + before + " -> " + now);
            }
        }
        for (String d : diffs) audit.log(actor.id(), "access", null, "changed", d);
        return new AccessResponse(ACCESS_ROLES, PERMISSIONS, next);
    }

    /** Inserts any missing role/permission row with its default; never touches rows the committee already edited. */
    @Transactional
    public void seedDefaults() {
        for (String role : ACCESS_ROLES) {
            for (PermissionDef p : PERMISSIONS) repo.insertIfMissing(role, p.key(), !DEFAULT_OFF.get(role).contains(p.key()));
        }
    }
}
