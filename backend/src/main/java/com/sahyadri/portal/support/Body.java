package com.sahyadri.portal.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.node.MissingNode;
import com.fasterxml.jackson.databind.node.ObjectNode;

/**
 * Lenient JSON request body, mirroring how app.js reads req.body: anything that is not a JSON object is an
 * empty body, and each field is type-checked by hand so error messages stay identical to the Node API.
 */
public final class Body {
    public static final Body EMPTY = new Body(null);
    private final ObjectNode node;

    private Body(ObjectNode node) {
        this.node = node;
    }

    public static Body of(JsonNode n) {
        return n instanceof ObjectNode o ? new Body(o) : EMPTY;
    }

    public boolean has(String key) {
        return node != null && node.has(key);
    }

    public JsonNode get(String key) {
        return node == null || !node.has(key) ? MissingNode.getInstance() : node.get(key);
    }

    /** JS: typeof v === 'string' ? v.trim().slice(0, max) : '' */
    public String str(String key, int max) {
        JsonNode v = get(key);
        if (!v.isTextual()) return "";
        return Text.slice(v.asText().strip(), max);
    }

    /** The string value, or null when the field is missing or not a string. */
    public String text(String key) {
        JsonNode v = get(key);
        return v.isTextual() ? v.asText() : null;
    }

    /** The string value, or "" when missing or not a string. */
    public String textOrEmpty(String key) {
        String t = text(key);
        return t == null ? "" : t;
    }

    public boolean isTrue(String key) {
        JsonNode v = get(key);
        return v.isBoolean() && v.asBoolean();
    }
}
