# Milestones

Dates are 2026. Code: GitHub (PR #16 and later). Stories: SCRUM board on https://dlastobeerus5.atlassian.net from 11-25 (one story per requirement); earlier work on the old HSP board.

| Date | Milestone | Evidence | Jira |
|---|---|---|---|
| 11-04 | Java and React at parity with the Node API | Node 41, Java 68, React 59 tests | HSP-1..25 |
| 11-04 | Phone layout fixes; manual walk-through of four roles | efaf35d, `docs/testing/test-results.md` | HSP-9..15, 17..19 |
| 11-04 | AI workflows: WhatsApp intake, triage, SLA, notice drafter, digest | cd32662, e6d1c48, 8f1db74 | HSP-26..30, 33 |
| 11-04 | Submission documents (requirements, BPMN, architecture, test pack, demo, privacy) | 14bd872 | HSP-35 |
| 11-04 | CI green on five jobs (incl. PostgreSQL 16, Docker image) | Actions run 41781026588 | HSP-34 |
| 11-04 | n8n workflows saved; phone-call intake workflow | `n8n/` | HSP-31, HSP-26 |
| 11-04 | Live on Render free plan | `render.yaml`, `docs/deploy.md` | HSP-36 |
| 11-04 | Dashboard layout and attention cards (web and React) | `public/css/`, `Dashboard.tsx` | HSP-23 |
| 11-04 | Native NFC and camera QR in the Android app | b956206 | HSP-32 |
| 11-07 | Telegram intake live; n8n LLM gate; AI suggested actions | bca8b8a..d97bc42, 11183c6 | HSP-41 |
| 11-13 | n8n migration pack; Telegram re-seed fix | 8329878 | HSP-43, 44 |
| 11-13 | Committee email desk | 6b2be56 | HSP-42 |
| 11-14 | Email desk runs every stage; docs updated; CI green on PR #18 | daedcd3 | HSP-42, 45 |
| 11-21 | Faculty review roles: positions, staff, IT, head cost approval, reopen, monthly report | PRs #19-#22, `docs/roles-api.md` | HSP-46..58 |
| 11-25 | Flutter app; product and technology architecture doc | PR #23, `flutter_app/`, `docs/architecture/product-and-technology-architecture.md` | HSP-65, HSP-68 |
| 11-25 | Society modules on web (amenities, dues, inventory, waste); deployed live | PR #24, `docs/modules-api.md`; Node 78 tests, CI 6/6 | HSP-59..64 |
| 11-25 | Documentation refresh | `docs/`, PR #25 | – |
| 11-25 | Flutter: committee assign and neutral error colour; seed duplicates fixed | Flutter 14, Node 79 tests | HSP-69 |
| 11-25 | Flutter: society modules in a Services tab (amenities, dues, inventory, waste) | Flutter 18 tests; emulator check by role | HSP-70 (part) |
| 11-25 | Requirements Document (scope, personas, functional, non-functional); Word, PDF, PowerPoint and Excel in `Requirements Documents/` | PR #30 | SCRUM-5..92, SCRUM-97 |
| 11-25 | New Jira site: 9 epics, 81 stories, 4 sprints; team invited and assigned (Design, Development, Testing) | dlastobeerus5 SCRUM board | SCRUM |
| 11-25 | IT overview; menu uses the whiteboard names (Verification, Broadcast, Monitor; Assigned work; Support queries, Training guides, Upgrades and maintenance) | PR #31, Node 79 tests | SCRUM-93 |
| 11-25 | Required items in a top bar per role, extras in the sidebar; deployed live | PR #32; walkthrough of four roles | SCRUM-94..96 |
| 11-25 | Resident services (tuck shop, laundry, parcel desk, events); calm dashboards for every role; demo password `test123` | `services.js`, Node 83 tests | SCRUM-98..104 |
| 11-25 | NFC gate cards (check in/out, staff shifts); staff departments; a dashboard per role (head, admin, member strictly different) | `nfc.js`, Node 84 tests | SCRUM-108..111 |

## Open
- Port Telegram, email desk, roles and society modules to Java/React.
- Flutter: same top bar ordering as the web (web only for now).
- Online payment gateway for dues.
- Paid Render disk for durable data.
- Move n8n to a new account; update `CLASSIFY_WEBHOOK_URL` and `ADMIN_EMAIL_WEBHOOK_URL`.
- Device test of NFC and QR (HSP-32).
- Import BPMN into Signavio (HSP-35).
- Fill contribution matrix names (blank on purpose).
- Acceptance test with residents.
