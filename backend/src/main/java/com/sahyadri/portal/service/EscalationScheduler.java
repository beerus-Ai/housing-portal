package com.sahyadri.portal.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/** Runs the SLA check every 10 minutes. Disabled with portal.scheduling.enabled=false (tests). */
@Component
@EnableScheduling
@ConditionalOnProperty(name = "portal.scheduling.enabled", havingValue = "true", matchIfMissing = true)
public class EscalationScheduler {
    private static final Logger log = LoggerFactory.getLogger(EscalationScheduler.class);
    private final EscalationService escalation;

    public EscalationScheduler(EscalationService escalation) {
        this.escalation = escalation;
    }

    @Scheduled(fixedDelay = 600_000, initialDelay = 600_000)
    public void run() {
        try {
            escalation.escalateOverdue();
        } catch (Exception e) {
            log.warn("Escalation run failed: {}", e.toString());
        }
    }
}
