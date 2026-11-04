package com.sahyadri.portal.service;

import com.sahyadri.portal.repository.AiRepository;
import java.util.List;
import java.util.Map;
import java.util.concurrent.CompletableFuture;
import org.springframework.stereotype.Service;

/** Stores the rule-based triage with the request; in llm mode the model refines it in the background. */
@Service
public class TriageService {
    private final AiService ai;
    private final AiRepository repo;

    public TriageService(AiService ai, AiRepository repo) {
        this.ai = ai;
        this.repo = repo;
    }

    private void store(long id, Map<String, Object> t) {
        repo.setTriage(id, (String) t.get("category"), (String) t.get("priority"), (String) t.get("summary"),
                (Long) t.get("vendor_id"), (String) t.get("source"), ((Number) t.get("confidence")).doubleValue());
    }

    public Map<String, Object> apply(long id, String text) {
        List<Map<String, Object>> vendors = repo.vendorTrades();
        Map<String, Object> t = AiService.triageRules(text, vendors);
        store(id, t);
        if ("llm".equals(ai.mode())) {
            CompletableFuture.runAsync(() -> {
                try {
                    Map<String, Object> b = ai.triageLlm(text, vendors, t);
                    if (b != null) store(id, b);
                } catch (Exception ignored) {
                    // keep the rule-based answer
                }
            });
        }
        return t;
    }
}
