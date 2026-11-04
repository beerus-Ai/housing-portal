package com.sahyadri.portal.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sahyadri.portal.repository.AiRepository;
import com.sahyadri.portal.support.Text;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

/** Outbound WhatsApp: always logged; really sent only when WHATSAPP_TOKEN and WHATSAPP_PHONE_ID are set. */
@Service
public class WhatsAppOutbox {
    private final AiRepository repo;
    private final ObjectMapper mapper;
    private final String token;
    private final String phoneId;
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(10)).build();

    public WhatsAppOutbox(AiRepository repo, ObjectMapper mapper, @Value("${WHATSAPP_TOKEN:}") String token,
                          @Value("${WHATSAPP_PHONE_ID:}") String phoneId) {
        this.repo = repo;
        this.mapper = mapper;
        this.token = token == null ? "" : token;
        this.phoneId = phoneId == null ? "" : phoneId;
    }

    public static String digits(String p) {
        return p == null ? "" : p.replaceAll("\\D", "");
    }

    public static String phoneKey(String p) {
        String d = digits(p);
        return d.length() > 10 ? d.substring(d.length() - 10) : d;
    }

    public boolean live() {
        return !token.isEmpty() && !phoneId.isEmpty();
    }

    public long send(String phone, String body, Long userId, Long requestId) {
        String text = Text.slice(body, 1000);
        long id = repo.insertMessage("out", digits(phone), text, userId, requestId, "logged");
        if (live() && !digits(phone).isEmpty()) {
            try {
                Map<String, Object> payload = new LinkedHashMap<>();
                payload.put("messaging_product", "whatsapp");
                payload.put("to", digits(phone));
                payload.put("type", "text");
                payload.put("text", Map.of("body", text));
                HttpRequest req = HttpRequest.newBuilder(URI.create("https://graph.facebook.com/v20.0/" + phoneId + "/messages"))
                        .timeout(Duration.ofSeconds(10))
                        .header("authorization", "Bearer " + token).header("content-type", "application/json")
                        .POST(HttpRequest.BodyPublishers.ofString(mapper.writeValueAsString(payload))).build();
                http.sendAsync(req, HttpResponse.BodyHandlers.discarding())
                        .thenAccept(r -> repo.setMessageStatus(id, r.statusCode() / 100 == 2 ? "sent" : "failed"))
                        .exceptionally(e -> {
                            try {
                                repo.setMessageStatus(id, "failed");
                            } catch (Exception ignored) {
                                // database closed
                            }
                            return null;
                        });
            } catch (Exception e) {
                repo.setMessageStatus(id, "failed");
            }
        }
        return id;
    }
}
