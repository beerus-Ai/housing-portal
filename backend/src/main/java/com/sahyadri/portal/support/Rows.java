package com.sahyadri.portal.support;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/** Turns JDBC rows into JSON-ready maps: lower-case keys, timestamps as 'yyyy-MM-dd HH:mm:ss' strings. */
public final class Rows {
    private Rows() {}

    public static Map<String, Object> normalize(Map<String, Object> row) {
        if (row == null) return null;
        Map<String, Object> out = new LinkedHashMap<>();
        for (Map.Entry<String, Object> e : row.entrySet()) {
            Object v = e.getValue();
            if (v instanceof Timestamp ts) v = TimeUtil.format(ts.toLocalDateTime());
            else if (v instanceof LocalDateTime ldt) v = TimeUtil.format(ldt);
            out.put(e.getKey().toLowerCase(), v);
        }
        return out;
    }

    public static List<Map<String, Object>> normalize(List<Map<String, Object>> rows) {
        return rows.stream().map(Rows::normalize).toList();
    }
}
