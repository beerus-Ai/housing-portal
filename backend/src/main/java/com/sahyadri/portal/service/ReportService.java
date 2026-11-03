package com.sahyadri.portal.service;

import com.sahyadri.portal.repository.ReportRepository;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.support.TimeUtil;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.regex.Pattern;
import java.util.stream.Collectors;
import org.springframework.stereotype.Service;

/** Committee dashboard numbers, the CSV export and the live-update pulse token. */
@Service
public class ReportService {
    private static final Pattern FORMULA = Pattern.compile("^[=+\\-@\\t\\r].*", Pattern.DOTALL);
    private static final List<String> CSV_COLS = List.of("id", "resident_name", "flat", "category", "title", "status", "vendor_name",
            "rating", "created_at", "updated_at");

    private final ReportRepository repo;

    public ReportService(ReportRepository repo) {
        this.repo = repo;
    }

    private static LocalDateTime time(Object s) {
        return s == null ? null : LocalDateTime.parse(s.toString(), TimeUtil.FMT);
    }

    /** ROUND(x, scale) as SQLite does (half away from zero); whole numbers stay integers like in JSON from Node. */
    private static Object round(Number x, int scale) {
        if (x == null) return null;
        BigDecimal v = new BigDecimal(x.toString()).setScale(scale, RoundingMode.HALF_UP);
        return v.stripTrailingZeros().scale() <= 0 ? (Object) v.longValue() : (Object) v.doubleValue();
    }

    private static Map<String, Object> row(Object... kv) {
        Map<String, Object> m = new LinkedHashMap<>();
        for (int i = 0; i < kv.length; i += 2) m.put((String) kv[i], kv[i + 1]);
        return m;
    }

    public Map<String, Object> stats() {
        LocalDateTime now = TimeUtil.nowUtc();
        LocalDateTime d30 = now.minusDays(30), d56 = now.minusDays(56);
        List<Map<String, Object>> times = repo.requestTimes();

        Map<String, long[]> cat = new TreeMap<>(); // open, raised in 30 days
        Map<Long, Long> weekly = new TreeMap<>();
        long total = 0, overdue = 0, within = 0;
        for (Map<String, Object> r : times) {
            boolean closed = "closed".equals(r.get("status"));
            LocalDateTime created = time(r.get("created_at")), updated = time(r.get("updated_at"));
            long[] c = cat.computeIfAbsent((String) r.get("category"), k -> new long[2]);
            if (!closed) c[0]++;
            if (!created.isBefore(d30)) c[1]++;
            if (!created.isBefore(d56)) weekly.merge(ChronoUnit.DAYS.between(created.toLocalDate(), now.toLocalDate()) / 7, 1L, Long::sum);
            total++;
            boolean young = Duration.between(created, now).compareTo(Duration.ofDays(2)) <= 0;
            if (!closed && !young) overdue++;
            if (closed ? Duration.between(created, updated).compareTo(Duration.ofDays(2)) <= 0 : young) within++;
        }

        List<Map<String, Object>> vendorRatings = new ArrayList<>();
        for (Map<String, Object> v : repo.vendorRatings()) {
            vendorRatings.add(row("id", v.get("id"), "name", v.get("name"), "trade", v.get("trade"),
                    "avg", round((Number) v.get("avg"), 1), "n", v.get("n")));
        }
        // best first, vendors without a rating last
        vendorRatings.sort(Comparator.comparing((Map<String, Object> m) -> m.get("avg") == null ? Double.NEGATIVE_INFINITY : ((Number) m.get("avg")).doubleValue()).reversed());

        Map<String, Object> out = new LinkedHashMap<>();
        out.put("by_status", repo.byStatus());
        out.put("by_category_open", repo.byCategoryOpen());
        out.put("pending_users", repo.pendingUsers());
        out.put("avg_rating", round(repo.avgRating(), 2));
        out.put("oldest_open", repo.oldestOpen());
        out.put("by_category", cat.entrySet().stream().map(e -> row("category", e.getKey(), "open", e.getValue()[0], "raised_30d", e.getValue()[1])).toList());
        out.put("weekly", weekly.entrySet().stream().map(e -> row("weeks_ago", e.getKey(), "n", e.getValue())).toList());
        out.put("vendor_ratings", vendorRatings);
        out.put("sla", row("total", total, "overdue", overdue, "within", within));
        out.put("unassigned", repo.unassigned());
        out.put("awaiting_rating", repo.awaitingRating());
        out.put("notices_30d", repo.noticesSince(d30));
        out.put("households", repo.households());
        return out;
    }

    private static String csv(Object v) {
        String s = v == null ? "" : v.toString();
        if (FORMULA.matcher(s).matches()) s = "'" + s; // neutralise spreadsheet formulas
        return s.indexOf('"') >= 0 || s.indexOf(',') >= 0 || s.indexOf('\n') >= 0 ? "\"" + s.replace("\"", "\"\"") + "\"" : s;
    }

    public String exportCsv() {
        List<String> lines = new ArrayList<>();
        lines.add(String.join(",", CSV_COLS));
        for (Map<String, Object> r : repo.exportRows()) lines.add(CSV_COLS.stream().map(c -> csv(r.get(c))).collect(Collectors.joining(",")));
        return String.join("\n", lines);
    }

    /** A version string only; clients redraw when it changes. Never returns data. */
    public String pulse(User u) {
        if ("guard".equals(u.role())) return String.valueOf(repo.maxNotificationId(u.id())); // guards only see their own marker
        if (u.isAdmin()) return repo.maxId("audit") + "|" + repo.pendingUsers() + "|" + repo.maxId("notices");
        String flat = u.flat() == null ? "" : u.flat();
        Map<String, Object> r = repo.residentRequestSummary(u.id(), flat);
        Object m = r.get("m");
        return r.get("n") + "|" + (m == null ? "" : m) + "|" + r.get("rated") + "|" + repo.maxNotificationId(u.id()) + "|"
                + repo.maxId("notices") + "|" + repo.approvedInFlat(flat);
    }
}
