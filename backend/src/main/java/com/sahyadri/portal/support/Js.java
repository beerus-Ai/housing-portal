package com.sahyadri.portal.support;

import com.fasterxml.jackson.databind.JsonNode;
import java.util.Optional;

/** Small JavaScript-semantics helpers so validation matches the Node API on odd inputs. */
public final class Js {
    private Js() {}

    /** Express req.params.id used in SQL: anything that is not a whole number simply matches no row. */
    public static Optional<Long> id(String s) {
        try {
            return Optional.of(Long.parseLong(s.trim()));
        } catch (RuntimeException e) {
            return Optional.empty();
        }
    }

    /** JS: v == null (missing or JSON null). */
    public static boolean nullish(JsonNode v) {
        return v == null || v.isMissingNode() || v.isNull();
    }

    /** JS: Number(v) for a JSON value (missing is NaN, null is 0). */
    public static double number(JsonNode v) {
        if (v == null || v.isMissingNode()) return Double.NaN;
        if (v.isNull()) return 0;
        if (v.isNumber()) return v.asDouble();
        if (v.isBoolean()) return v.asBoolean() ? 1 : 0;
        if (v.isTextual()) {
            String t = v.asText().strip();
            if (t.isEmpty()) return 0;
            if (t.matches("[+-]?(\\d+\\.?\\d*|\\.\\d+)([eE][+-]?\\d+)?")) return Double.parseDouble(t);
        }
        return Double.NaN;
    }

    public static boolean isInteger(double d) {
        return !Double.isNaN(d) && !Double.isInfinite(d) && d == Math.floor(d);
    }
}
