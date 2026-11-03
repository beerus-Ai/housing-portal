package com.sahyadri.portal.support;

import com.fasterxml.jackson.databind.JsonNode;

/** Lenient id parsing: anything that is not a whole number maps to -1, which no row has (so the route answers 404). */
public final class Ids {
    private Ids() {}

    public static long parse(String s) {
        if (s == null) return -1;
        try {
            return Long.parseLong(s.trim());
        } catch (NumberFormatException e) {
            return -1;
        }
    }

    /** A JSON number or numeric string, like SQLite comparing id = ? with either. */
    public static long parse(JsonNode n) {
        if (n == null) return -1;
        if (n.isIntegralNumber()) return n.asLong();
        if (n.isNumber()) {
            double d = n.asDouble();
            return d == Math.rint(d) ? (long) d : -1;
        }
        return n.isTextual() ? parse(n.asText()) : -1;
    }
}
