package com.sahyadri.portal.service;

import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.springframework.stereotype.Component;

/** In-memory failed-attempt counter: 15 minute window, same semantics as the Node `fails` map. */
@Component
public class LoginThrottle {
    private static final long WINDOW_MS = 15 * 60_000L;

    private record Fail(int n, long t) {}

    private final Map<String, Fail> fails = new ConcurrentHashMap<>();

    public boolean throttled(String key, int max) {
        Fail f = fails.get(key);
        if (f == null) return false;
        if (System.currentTimeMillis() - f.t() >= WINDOW_MS) {
            fails.remove(key);
            return false;
        }
        return f.n() >= max;
    }

    public boolean throttled(String key) {
        return throttled(key, 5);
    }

    public void fail(String key) {
        long now = System.currentTimeMillis();
        if (fails.size() > 10_000) fails.entrySet().removeIf(e -> now - e.getValue().t() >= WINDOW_MS);
        fails.merge(key, new Fail(1, now), (old, ignored) -> new Fail(now - old.t() < WINDOW_MS ? old.n() + 1 : 1, now));
    }

    public void clear(String key) {
        fails.remove(key);
    }

    public void clearAll() {
        fails.clear();
    }
}
