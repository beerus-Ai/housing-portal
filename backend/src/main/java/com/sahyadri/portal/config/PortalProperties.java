package com.sahyadri.portal.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * portal.production is true under the 'prod' profile. Blank admin values fall back to the local dev defaults
 * only when not in production (see BootstrapService).
 */
@ConfigurationProperties(prefix = "portal")
public record PortalProperties(boolean production, String adminEmail, String adminPassword, String sessionSecret) {}
