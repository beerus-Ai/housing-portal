package com.sahyadri.portal.service;

import com.sahyadri.portal.repository.Db;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.repository.UserRepository;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import com.sahyadri.portal.support.Js;
import com.sahyadri.portal.support.Text;
import com.sahyadri.portal.support.TimeUtil;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;

/** Gate staff accounts, created and removed by the committee. */
@Service
public class GuardService {
    private final Db db;
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AuditService audit;

    public GuardService(Db db, UserRepository users, PasswordEncoder encoder, AuditService audit) {
        this.db = db;
        this.users = users;
        this.encoder = encoder;
        this.audit = audit;
    }

    public long create(User actor, Body b) {
        String name = b.str("name", 100), email = b.str("email", 200).toLowerCase(Locale.ROOT), pw = b.textOrEmpty("password");
        if (name.isEmpty() || !Text.validEmail(email)) throw new ApiException(400, "Name and a valid email are required");
        if (pw.length() < 8 || pw.length() > 128) throw new ApiException(400, "Password must be 8 to 128 characters");
        if (users.emailExists(email)) throw new ApiException(409, "Email already registered");
        long id = db.insert("INSERT INTO users(name,email,password_hash,role,status,consent_at,created_at) VALUES(?,?,?,'guard','approved',?,?)",
                name, email, encoder.encode(pw), TimeUtil.nowUtc(), TimeUtil.nowUtc());
        audit.log(actor.id(), "user", id, "guard_created", email);
        return id;
    }

    public List<Map<String, Object>> list() {
        return db.list("SELECT id,name,email,status,created_at FROM users WHERE role='guard' ORDER BY id DESC");
    }

    public void delete(User actor, String idStr) {
        Map<String, Object> g = Js.id(idStr).map(i -> db.one("SELECT * FROM users WHERE id=? AND role='guard'", i)).orElse(null);
        if (g == null) throw new ApiException(404, "Guard not found");
        long id = ((Number) g.get("id")).longValue();
        db.update("DELETE FROM notifications WHERE user_id=?", id);
        db.update("DELETE FROM users WHERE id=?", id);
        audit.log(actor.id(), "user", id, "guard_deleted", (String) g.get("email"));
    }
}
