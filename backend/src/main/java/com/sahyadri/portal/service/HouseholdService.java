package com.sahyadri.portal.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.sahyadri.portal.repository.HouseholdRepository;
import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.repository.UserRepository;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import com.sahyadri.portal.support.Ids;
import com.sahyadri.portal.support.Text;
import java.util.List;
import java.util.Map;
import java.util.regex.Pattern;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Household members (owner adds family or tenants; committee approves) and tenant leases. */
@Service
public class HouseholdService {
    private static final Pattern DATE = Pattern.compile("^\\d{4}-\\d{2}-\\d{2}$");

    private final HouseholdRepository repo;
    private final UserRepository users;
    private final PasswordEncoder encoder;
    private final AuditService audit;
    private final NotificationService notifications;

    public HouseholdService(HouseholdRepository repo, UserRepository users, PasswordEncoder encoder, AuditService audit,
                            NotificationService notifications) {
        this.repo = repo;
        this.users = users;
        this.encoder = encoder;
        this.audit = audit;
        this.notifications = notifications;
    }

    public List<Map<String, Object>> members(User u) {
        if (u.flat() == null || u.flat().isEmpty()) return List.of();
        return repo.members(u.flat());
    }

    @Transactional
    public long addMember(User owner, Body b) {
        if (!"owner".equals(owner.residentType())) throw new ApiException(403, "Only the flat owner can add household members");
        String name = b.str("name", 100), email = b.str("email", 200).toLowerCase(), phone = b.str("phone", 20);
        String rtype = b.text("resident_type"), pw = b.textOrEmpty("password");
        if (name.isEmpty() || !Text.validEmail(email)) throw new ApiException(400, "Name and a valid email are required");
        if (!"family".equals(rtype) && !"tenant".equals(rtype)) throw new ApiException(400, "Add a family member or a tenant");
        if (pw.length() < 8 || pw.length() > 128) throw new ApiException(400, "Temporary password must be 8 to 128 characters");
        if (owner.flat() == null || owner.flat().isEmpty()) throw new ApiException(400, "Your account has no flat set");
        if (!b.isTrue("consent")) throw new ApiException(400, "Consent to data processing is required");
        if (users.emailExists(email)) throw new ApiException(409, "Email already registered");
        long id = users.insertResident(name, email, phone, owner.flat(), rtype, encoder.encode(pw));
        audit.log(owner.id(), "user", id, "household_added", rtype + " flat " + owner.flat());
        notifications.notifyAdmins(owner.name() + " added " + name + " (" + rtype + ") to flat " + owner.flat() + ": awaiting approval");
        return id;
    }

    /** The user's own lease row, or null. */
    public Map<String, Object> lease(User u) {
        return repo.lease(u.id());
    }

    private static String date(Body b, String key) {
        JsonNode v = b.get(key);
        return v.isTextual() && DATE.matcher(v.asText()).matches() ? v.asText() : "";
    }

    @Transactional
    public void setLease(User admin, String id, Body b) {
        Map<String, Object> t = repo.tenant(Ids.parse(id));
        if (t == null) throw new ApiException(404, "Tenant not found");
        String start = date(b, "start_date"), end = date(b, "end_date");
        if (start.isEmpty() || end.isEmpty() || end.compareTo(start) <= 0) throw new ApiException(400, "Valid start and end dates are required");
        long uid = ((Number) t.get("id")).longValue();
        repo.upsertLease(uid, start, end, b.str("owner_name", 100), b.str("owner_phone", 20), date(b, "police_verified_on"),
                b.str("agreement", 200), b.str("parking", 100));
        audit.log(admin.id(), "user", uid, "lease_set", start + " to " + end);
        notifications.notify(uid, "Your lease details were updated (ends " + end + ")");
    }

    public List<Map<String, Object>> leases() {
        return repo.leases();
    }
}
