# Milestones

Every milestone updates three places: this log and the code on GitHub (PR #16 and later), the HSP Jira board, and the team memory notes. Dates are 2026.

| Date | Milestone | Evidence | Jira |
|---|---|---|---|
| 11-04 | Java and React ported to full parity with the Node API | Node 41, Java 68, React 59 tests | HSP-1..25 (closed with evidence) |
| 11-04 | Cards compacted on phone, Requests row fix, full manual walkthrough of four roles | commit efaf35d, docs/testing/test-results.md | HSP-9..15, 17..19 |
| 11-04 | AI-native workflows: WhatsApp intake, AI triage, SLA escalation, notice drafter, weekly digest | Node 48, Java 79, React 65 tests; commits cd32662, e6d1c48, 8f1db74 | HSP-26..30, HSP-33 |
| 11-04 | Submission documents: requirements, BPMN, architecture, test pack, demo script, privacy, backlog v2 | docs/, commit 14bd872 | HSP-35 (BPMN import pending) |
| 11-04 | CI green on all five jobs including PostgreSQL 16 tests and packaged boot, Docker image build | Actions run 41781026588 | HSP-34 |
| 11-04 | n8n workflows for the housing project saved in the team n8n cloud account (inactive until credentials are added) | `n8n/` | HSP-31 |
| 11-04 | Deployed on Render (free plan): https://sahyadri-heights.onrender.com ; headers and auth checks verified | render.yaml, docs/deploy.md | HSP-36 (Done) |
| 11-04 | Phone-call intake workflow (voice number -> speech to text -> same intake as WhatsApp) | n8n/phone-call-intake.json | new story in epic HSP-26 |
| 11-04 | Dashboard and pages now fill the space the menu leaves (side, top or hidden); attention cards stretch to the row | public/css/airbnb.css, estate.css, frontend app.css | HSP-23 |
| 11-04 | Attention cards made smaller; Via WhatsApp is now the first card (web and React) | public/css/airbnb.css, dash.js, frontend Dashboard.tsx | HSP-23 |
| 11-04 | Native NFC and camera QR scanning built into the Android app | commit b956206 | HSP-32 (device test pending) |

## Open
- Live URL is up on the Render free plan (sleeps, data resets on redeploy): move to a paid plan with a disk, switch the branch to main after PR #16 merges.
- Device test of NFC and camera scan (HSP-32), activate n8n workflows (HSP-31), import BPMN into Signavio (HSP-35).
- Consent for household members on first sign-in (HSP-37), peer review of PR #16 (HSP-38).
