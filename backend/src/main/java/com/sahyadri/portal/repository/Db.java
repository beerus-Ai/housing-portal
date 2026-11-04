package com.sahyadri.portal.repository;

import com.sahyadri.portal.support.Rows;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.List;
import java.util.Map;
import org.springframework.jdbc.core.ArgumentPreparedStatementSetter;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Component;

/** Thin parameterised-SQL helper (positional ? only; never concatenate user input). */
@Component
public class Db {
    private final JdbcTemplate jdbc;

    public Db(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public List<Map<String, Object>> list(String sql, Object... args) {
        return Rows.normalize(jdbc.queryForList(sql, args));
    }

    /** First row or null. */
    public Map<String, Object> one(String sql, Object... args) {
        List<Map<String, Object>> rows = list(sql, args);
        return rows.isEmpty() ? null : rows.get(0);
    }

    public long count(String sql, Object... args) {
        Long n = jdbc.queryForObject(sql, Long.class, args);
        return n == null ? 0 : n;
    }

    public int update(String sql, Object... args) {
        return jdbc.update(sql, args);
    }

    /** Inserts a row and returns its generated id (works on H2 and PostgreSQL). */
    public long insert(String sql, Object... args) {
        KeyHolder kh = new GeneratedKeyHolder();
        jdbc.update(con -> {
            PreparedStatement ps = con.prepareStatement(sql, Statement.RETURN_GENERATED_KEYS);
            new ArgumentPreparedStatementSetter(args).setValues(ps);
            return ps;
        }, kh);
        Map<String, Object> keys = kh.getKeys();
        if (keys != null) {
            for (Map.Entry<String, Object> e : keys.entrySet()) {
                if (e.getKey().equalsIgnoreCase("id") && e.getValue() instanceof Number n) return n.longValue();
            }
        }
        throw new IllegalStateException("Insert did not return an id");
    }
}
