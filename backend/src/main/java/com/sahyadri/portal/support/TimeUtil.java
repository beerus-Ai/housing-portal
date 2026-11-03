package com.sahyadri.portal.support;

import java.time.LocalDateTime;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;

/** All timestamps are UTC and rendered as 'yyyy-MM-dd HH:mm:ss', exactly like SQLite's datetime('now'). */
public final class TimeUtil {
    public static final DateTimeFormatter FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd HH:mm:ss");

    private TimeUtil() {}

    public static LocalDateTime nowUtc() {
        return LocalDateTime.now(ZoneOffset.UTC).withNano(0);
    }

    public static String format(LocalDateTime t) {
        return t == null ? null : t.format(FMT);
    }
}
