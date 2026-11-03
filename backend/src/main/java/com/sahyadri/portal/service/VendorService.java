package com.sahyadri.portal.service;

import com.sahyadri.portal.repository.User;
import com.sahyadri.portal.repository.VendorRepository;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import com.sahyadri.portal.support.Ids;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class VendorService {
    private final VendorRepository repo;
    private final AuditService audit;

    public VendorService(VendorRepository repo, AuditService audit) {
        this.repo = repo;
        this.audit = audit;
    }

    public List<Map<String, Object>> list() {
        return repo.all();
    }

    @Transactional
    public long create(User admin, Body b) {
        String name = b.str("name", 100), trade = b.str("trade", 50), phone = b.str("phone", 20);
        if (name.isEmpty() || trade.isEmpty()) throw new ApiException(400, "Name and trade are required");
        long id = repo.insert(name, trade, phone);
        audit.log(admin.id(), "vendor", id, "created", name);
        return id;
    }

    private Map<String, Object> existing(String id) {
        Map<String, Object> v = repo.find(Ids.parse(id));
        if (v == null) throw new ApiException(404, "Vendor not found");
        return v;
    }

    @Transactional
    public void update(User admin, String id, Body b) {
        Map<String, Object> v = existing(id);
        String name = b.str("name", 100), trade = b.str("trade", 50);
        if (name.isEmpty()) name = (String) v.get("name");
        if (trade.isEmpty()) trade = (String) v.get("trade");
        String phone = b.has("phone") ? b.str("phone", 20) : (String) v.get("phone");
        long vid = ((Number) v.get("id")).longValue();
        repo.update(vid, name, trade, phone);
        audit.log(admin.id(), "vendor", vid, "updated", name);
    }

    @Transactional
    public void delete(User admin, String id) {
        Map<String, Object> v = existing(id);
        long vid = ((Number) v.get("id")).longValue();
        if (repo.hasRequests(vid)) throw new ApiException(409, "This vendor has requests on record and cannot be deleted");
        repo.delete(vid);
        audit.log(admin.id(), "vendor", vid, "deleted", (String) v.get("name"));
    }
}
