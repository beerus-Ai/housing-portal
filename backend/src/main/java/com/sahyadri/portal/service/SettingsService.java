package com.sahyadri.portal.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sahyadri.portal.dto.SocietySettings;
import com.sahyadri.portal.repository.SettingsRepository;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import java.util.ArrayList;
import java.util.Iterator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class SettingsService {
    public static final List<String> FEATURES = List.of("emergency", "gate", "contacts", "notices", "parking");
    private static final Map<String, String> DEFAULTS = Map.of(
            "society_name", "Sahyadri Heights",
            "society_kind", "Co-operative Housing Society",
            "google_client_id", "");
    private static final Pattern CLIENT_ID = Pattern.compile("^[A-Za-z0-9._-]{0,200}$");

    private final SettingsRepository repo;
    private final AuditService audit;
    private final ObjectMapper mapper;

    public SettingsService(SettingsRepository repo, AuditService audit, ObjectMapper mapper) {
        this.repo = repo;
        this.audit = audit;
        this.mapper = mapper;
    }

    public String get(String key) {
        return repo.get(key).orElse(DEFAULTS.get(key));
    }

    public String googleClientId() {
        String v = get("google_client_id");
        return v == null ? "" : v;
    }

    /** Every feature is on unless the committee explicitly turned it off. */
    public Map<String, Boolean> features() {
        JsonNode f = null;
        try {
            f = mapper.readTree(repo.get("features").orElse("{}"));
        } catch (Exception ignored) {
            // fall back to defaults
        }
        Map<String, Boolean> out = new LinkedHashMap<>();
        for (String k : FEATURES) out.put(k, !(f != null && f.isObject() && f.has(k) && f.get(k).isBoolean() && !f.get(k).asBoolean()));
        return out;
    }

    public boolean featureOn(String name) {
        return features().getOrDefault(name, false);
    }

    public SocietySettings publicSettings() {
        return new SocietySettings(get("society_name"), get("society_kind"), get("google_client_id"), features());
    }

    @Transactional
    public SocietySettings update(User actor, Body b) {
        SocietySettings cur = publicSettings();
        String name = cur.societyName(), kind = cur.societyKind(), gid = cur.googleClientId();
        Map<String, Boolean> features = new LinkedHashMap<>(cur.features());

        if (b.has("society_name")) name = requiredText(b, "society_name", "Society name");
        if (b.has("society_kind")) kind = requiredText(b, "society_kind", "Society type");
        if (b.has("google_client_id")) {
            String v = b.text("google_client_id");
            v = v == null ? null : v.strip();
            if (v == null || !CLIENT_ID.matcher(v).matches()) throw new ApiException(400, "Google client ID has invalid characters");
            gid = v;
        }
        if (b.has("features")) {
            JsonNode f = b.get("features");
            if (!f.isObject()) throw new ApiException(400, "Features must be an object");
            for (Iterator<Map.Entry<String, JsonNode>> it = f.fields(); it.hasNext(); ) {
                Map.Entry<String, JsonNode> e = it.next();
                if (!FEATURES.contains(e.getKey()) || !e.getValue().isBoolean()) {
                    throw new ApiException(400, "Features must be known names set to true or false");
                }
                features.put(e.getKey(), e.getValue().asBoolean());
            }
        }

        long uid = actor.id();
        if (!name.equals(cur.societyName())) {
            repo.put("society_name", name);
            audit.log(uid, "settings", null, "updated", "society_name: " + cur.societyName() + " -> " + name);
        }
        if (!kind.equals(cur.societyKind())) {
            repo.put("society_kind", kind);
            audit.log(uid, "settings", null, "updated", "society_kind: " + cur.societyKind() + " -> " + kind);
        }
        if (!gid.equals(cur.googleClientId())) {
            repo.put("google_client_id", gid);
            audit.log(uid, "settings", null, "updated", "google_client_id changed");
        }
        for (String k : FEATURES) {
            if (!features.get(k).equals(cur.features().get(k))) {
                audit.log(uid, "settings", null, "feature_" + (features.get(k) ? "on" : "off"), k);
            }
        }
        try {
            List<String> keys = new ArrayList<>(FEATURES);
            Map<String, Boolean> ordered = new LinkedHashMap<>();
            for (String k : keys) ordered.put(k, features.get(k));
            repo.put("features", mapper.writeValueAsString(ordered));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        return publicSettings();
    }

    private static String requiredText(Body b, String key, String label) {
        String v = b.text(key);
        v = v == null ? "" : v.strip();
        if (v.isEmpty() || v.length() > 100) throw new ApiException(400, label + " is required (up to 100 characters)");
        return v;
    }
}
