package com.sahyadri.portal.dto;

import java.util.Map;

/** GET /api/settings and the admin settings shape: society_name, society_kind, google_client_id, features. */
public record SocietySettings(String societyName, String societyKind, String googleClientId, Map<String, Boolean> features) {}
