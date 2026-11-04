package com.sahyadri.portal.support;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.net.URLDecoder;
import java.nio.charset.StandardCharsets;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.web.MockHttpServletResponse;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.request.MockMvcRequestBuilders;

/** A browser stand-in: keeps its own session cookie between calls, like the fetch client in the Node tests. */
public class TestClient {
    public record Resp(int status, JsonNode body, MockHttpServletResponse raw) {
        public String header(String name) {
            return raw.getHeader(name);
        }
    }

    private static final ObjectMapper MAPPER = new ObjectMapper();
    private final MockMvc mvc;
    private MockHttpSession session;
    public long id;

    public TestClient(MockMvc mvc) {
        this.mvc = mvc;
    }

    public Resp call(String method, String url, Object body, String... headers) {
        try {
            String path = url, query = null;
            int q = url.indexOf('?');
            if (q >= 0) {
                path = url.substring(0, q);
                query = url.substring(q + 1);
            }
            MockHttpServletRequestBuilder b = MockMvcRequestBuilders.request(HttpMethod.valueOf(method), path);
            if (query != null) {
                for (String pair : query.split("&")) {
                    int eq = pair.indexOf('=');
                    String k = eq < 0 ? pair : pair.substring(0, eq), v = eq < 0 ? "" : pair.substring(eq + 1);
                    b.param(URLDecoder.decode(k, StandardCharsets.UTF_8), v.contains("%") && v.matches(".*%[0-9A-Fa-f]{2}.*") ? URLDecoder.decode(v, StandardCharsets.UTF_8) : v);
                }
            }
            if (session != null) b.session(session);
            if (body != null) {
                b.contentType(MediaType.APPLICATION_JSON);
                b.content(body instanceof String s ? s : MAPPER.writeValueAsString(body));
            }
            for (int i = 0; i + 1 < headers.length; i += 2) b.header(headers[i], headers[i + 1]);
            MvcResult r = mvc.perform(b).andReturn();
            var s = r.getRequest().getSession(false);
            if (s instanceof MockHttpSession ms) session = ms;
            if (session != null && session.isInvalid()) session = null;
            String text = r.getResponse().getContentAsString(StandardCharsets.UTF_8);
            JsonNode json;
            try {
                json = text.isEmpty() ? null : MAPPER.readTree(text);
            } catch (com.fasterxml.jackson.core.JsonProcessingException notJson) {
                json = null; // CSV and binary downloads: read them from raw()
            }
            return new Resp(r.getResponse().getStatus(), json, r.getResponse());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    /** multipart/form-data POST with text fields and optional file parts: {name, filename, contentType, bytes}. */
    public Resp multipart(String url, java.util.Map<String, String> fields, Object[]... files) {
        try {
            var b = MockMvcRequestBuilders.multipart(url);
            if (session != null) b.session(session);
            fields.forEach(b::param);
            for (Object[] f : files) {
                b.file(new org.springframework.mock.web.MockMultipartFile((String) f[0], (String) f[1], (String) f[2], (byte[]) f[3]));
            }
            MvcResult r = mvc.perform(b).andReturn();
            String text = r.getResponse().getContentAsString(StandardCharsets.UTF_8);
            return new Resp(r.getResponse().getStatus(), text.isEmpty() ? null : MAPPER.readTree(text), r.getResponse());
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }

    public Resp get(String url) {
        return call("GET", url, null);
    }

    public Resp post(String url, Object body) {
        return call("POST", url, body);
    }

    public Resp post(String url) {
        return call("POST", url, null);
    }

    public Resp put(String url, Object body) {
        return call("PUT", url, body);
    }

    public Resp patch(String url, Object body) {
        return call("PATCH", url, body);
    }

    public Resp delete(String url) {
        return call("DELETE", url, null);
    }
}
