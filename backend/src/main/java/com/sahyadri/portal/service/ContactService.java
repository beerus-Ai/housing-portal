package com.sahyadri.portal.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.repository.Db;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import com.sahyadri.portal.support.Js;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.stereotype.Service;

@Service
public class ContactService {
    static final List<String> ICONS = List.of("phone", "briefcase", "shield-check", "wrench", "elevator", "first-aid", "fire", "drop");
    static final Pattern PHONE = Pattern.compile("^[+\\d][\\d\\s()+-]{3,19}$");

    private final Db db;
    private final AuditService audit;

    public ContactService(Db db, AuditService audit) {
        this.db = db;
        this.audit = audit;
    }

    public List<Map<String, Object>> list() {
        return db.list("SELECT id,name,role,phone,icon FROM contacts ORDER BY name");
    }

    public long create(User actor, Body b) {
        String name = b.str("name", 100), role = b.str("role", 100), phone = b.str("phone", 40);
        JsonNode iv = b.get("icon");
        String icon = Js.nullish(iv) || (iv.isTextual() && iv.asText().isEmpty()) ? "phone" : (iv.isTextual() ? iv.asText() : null);
        if (name.isEmpty() || role.isEmpty()) throw new ApiException(400, "Name and role are required");
        if (!PHONE.matcher(phone).matches()) throw new ApiException(400, "Enter a valid phone number");
        if (icon == null || !ICONS.contains(icon)) throw new ApiException(400, "Unknown icon");
        long id = db.insert("INSERT INTO contacts(name,role,phone,icon) VALUES(?,?,?,?)", name, role, phone, icon);
        audit.log(actor.id(), "contact", id, "created", name);
        return id;
    }

    public void delete(User actor, String idStr) {
        Map<String, Object> c = Js.id(idStr).map(i -> db.one("SELECT * FROM contacts WHERE id=?", i)).orElse(null);
        if (c == null) throw new ApiException(404, "Contact not found");
        long id = ((Number) c.get("id")).longValue();
        db.update("DELETE FROM contacts WHERE id=?", id);
        audit.log(actor.id(), "contact", id, "deleted", (String) c.get("name"));
    }
}
