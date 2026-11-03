package com.sahyadri.portal.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sahyadri.portal.service.GoogleTokenInfoVerifier;
import com.sahyadri.portal.service.GoogleTokenVerifier;
import com.sahyadri.portal.support.ApiException;
import com.sahyadri.portal.support.Body;
import jakarta.servlet.http.HttpServletRequest;
import java.util.List;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.MethodParameter;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

@Configuration
public class WebConfig implements WebMvcConfigurer {
    private static final int MAX_BODY = 100 * 1024;
    private final ObjectMapper mapper;

    public WebConfig(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /** The real Google verifier (tokeninfo endpoint). Tests replace it with a fake bean. */
    @Bean
    GoogleTokenVerifier googleTokenVerifier(ObjectMapper mapper) {
        return new GoogleTokenInfoVerifier(mapper);
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(new HandlerMethodArgumentResolver() {
            @Override
            public boolean supportsParameter(MethodParameter p) {
                return p.getParameterType() == Body.class;
            }

            /** Express json(): only application/json is parsed, 100kb limit, malformed JSON is 400 'Bad request'. */
            @Override
            public Object resolveArgument(MethodParameter p, ModelAndViewContainer m, NativeWebRequest web, WebDataBinderFactory f) throws Exception {
                HttpServletRequest req = web.getNativeRequest(HttpServletRequest.class);
                String ct = req == null ? null : req.getContentType();
                if (ct == null || !(ct.toLowerCase().contains("application/json") || ct.toLowerCase().contains("+json"))) return Body.EMPTY;
                byte[] bytes = req.getInputStream().readNBytes(MAX_BODY + 1);
                if (bytes.length > MAX_BODY) throw new ApiException(413, "Request too large");
                if (new String(bytes, java.nio.charset.StandardCharsets.UTF_8).isBlank()) return Body.EMPTY;
                try {
                    var node = mapper.readTree(bytes);
                    if (!node.isObject() && !node.isArray()) throw new ApiException(400, "Bad request");
                    return Body.of(node);
                } catch (java.io.IOException e) {
                    throw new ApiException(400, "Bad request");
                }
            }
        });
    }
}
