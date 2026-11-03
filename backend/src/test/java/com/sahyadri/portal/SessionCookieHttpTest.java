package com.sahyadri.portal;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

/** Real HTTP against the embedded server: cookie attributes and the cookie round trip. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT)
@ActiveProfiles("test")
class SessionCookieHttpTest {
    @Value("${local.server.port}") int port;

    private HttpResponse<String> send(String method, String path, String body, String cookie) throws Exception {
        HttpRequest.Builder b = HttpRequest.newBuilder(URI.create("http://localhost:" + port + path))
                .method(method, body == null ? HttpRequest.BodyPublishers.noBody() : HttpRequest.BodyPublishers.ofString(body));
        if (body != null) b.header("Content-Type", "application/json");
        if (cookie != null) b.header("Cookie", cookie);
        return HttpClient.newHttpClient().send(b.build(), HttpResponse.BodyHandlers.ofString());
    }

    @Test
    void loginSetsAnHttpOnlySameSiteLaxSessionCookieAndItWorks() throws Exception {
        var anon = send("GET", "/api/settings", null, null);
        assertEquals(200, anon.statusCode());
        assertTrue(anon.headers().firstValue("Set-Cookie").isEmpty(), "no session before login");

        var bad = send("POST", "/api/login", "{\"email\":\"admin@society.test\",\"password\":\"nope-nope\"}", null);
        assertEquals(401, bad.statusCode());
        assertTrue(bad.headers().firstValue("Set-Cookie").isEmpty());

        var login = send("POST", "/api/login", "{\"email\":\"admin@society.test\",\"password\":\"Admin@1234\"}", null);
        assertEquals(200, login.statusCode());
        String setCookie = login.headers().firstValue("Set-Cookie").orElseThrow();
        assertTrue(setCookie.contains("HttpOnly"), setCookie);
        assertTrue(setCookie.contains("SameSite=Lax"), setCookie);
        assertTrue(!setCookie.contains("Secure"), "Secure is only set under the prod profile");
        assertTrue(setCookie.contains("Max-Age=28800") || setCookie.contains("Expires="), setCookie);

        String cookie = setCookie.split(";")[0];
        var me = send("GET", "/api/me", null, cookie);
        assertEquals(200, me.statusCode());
        assertTrue(me.body().contains("\"resident_type\""));
        assertEquals(200, send("POST", "/api/logout", null, cookie).statusCode());
        assertEquals(401, send("GET", "/api/me", null, cookie).statusCode());
    }
}
