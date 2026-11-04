package com.sahyadri.portal.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Map;

/** Real verifier: asks Google's tokeninfo endpoint to validate the ID token (5 second timeout). */
public class GoogleTokenInfoVerifier implements GoogleTokenVerifier {
    private static final String ENDPOINT = "https://oauth2.googleapis.com/tokeninfo?id_token=";

    private final HttpClient http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5)).build();
    private final ObjectMapper mapper;

    public GoogleTokenInfoVerifier(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    @Override
    public Map<String, Object> verify(String credential) throws Exception {
        HttpRequest req = HttpRequest.newBuilder(URI.create(ENDPOINT + URLEncoder.encode(credential, StandardCharsets.UTF_8)))
                .timeout(Duration.ofSeconds(5)).GET().build();
        HttpResponse<String> res = http.send(req, HttpResponse.BodyHandlers.ofString());
        if (res.statusCode() != 200) throw new IllegalStateException("token rejected");
        return mapper.readValue(res.body(), new TypeReference<Map<String, Object>>() {});
    }
}
