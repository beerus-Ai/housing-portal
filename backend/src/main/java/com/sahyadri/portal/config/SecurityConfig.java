package com.sahyadri.portal.config;

import com.sahyadri.portal.repository.UserRepository;
import com.sahyadri.portal.security.GuardAllowListFilter;
import com.sahyadri.portal.security.SessionAuthenticationFilter;
import com.sahyadri.portal.support.JsonErrors;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.security.config.annotation.web.builders.HttpSecurity;
import org.springframework.security.config.annotation.web.configuration.EnableWebSecurity;
import org.springframework.security.config.http.SessionCreationPolicy;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.SecurityFilterChain;
import org.springframework.security.web.authentication.AnonymousAuthenticationFilter;
import org.springframework.security.web.context.RequestAttributeSecurityContextRepository;

/**
 * Session-cookie security. Authentication (401 'Not signed in') is enforced here for every /api route except
 * the public ones; role and permission checks (403) are done per route through AccessGuard, like the Node
 * `admin` / `can` middlewares. Security headers and CSRF origin checks live in SecurityHeadersFilter.
 */
@Configuration
@EnableWebSecurity
public class SecurityConfig {

    @Bean
    PasswordEncoder passwordEncoder() {
        return new BCryptPasswordEncoder(10); // produces $2a$ hashes, compatible with the existing bcryptjs ones
    }

    @Bean
    SecurityFilterChain filterChain(HttpSecurity http, UserRepository users) throws Exception {
        http
                .csrf(c -> c.disable()) // SameSite=Lax cookie + Origin/Host check in SecurityHeadersFilter
                .cors(c -> c.disable())
                .headers(h -> h.disable()) // we send our own set
                .logout(l -> l.disable())
                .requestCache(r -> r.disable())
                // the context lives only for the request; identity always comes from the session uid + fingerprint
                .securityContext(sc -> sc.securityContextRepository(new RequestAttributeSecurityContextRepository()))
                .sessionManagement(s -> s.sessionCreationPolicy(SessionCreationPolicy.IF_REQUIRED).sessionFixation(f -> f.none()))
                .exceptionHandling(e -> e
                        .authenticationEntryPoint((req, res, ex) -> JsonErrors.write(res, 401, "Not signed in"))
                        .accessDeniedHandler((req, res, ex) -> JsonErrors.write(res, 403, "Your role does not have access to this")))
                .authorizeHttpRequests(a -> a
                        .requestMatchers("/api/register", "/api/login", "/api/logout", "/api/auth/google", "/api/settings",
                                "/healthz", "/actuator/health", "/actuator/health/**").permitAll()
                        .requestMatchers("/api/**").authenticated()
                        .anyRequest().permitAll());
        SessionAuthenticationFilter sessionFilter = new SessionAuthenticationFilter(users);
        http.addFilterBefore(sessionFilter, AnonymousAuthenticationFilter.class);
        http.addFilterAfter(new GuardAllowListFilter(), SessionAuthenticationFilter.class);
        return http.build();
    }
}
