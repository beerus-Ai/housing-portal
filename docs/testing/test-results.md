# Test results

Updated 2026-11-25. Only what was actually run is marked as passed.

## Automated suites
| Suite | Command | Count | Result |
| --- | --- | --- | --- |
| Node API | `npm test` | 79 | All pass (includes `modules`, `roles`, `telegram`, `email-desk`) |
| Java backend | `cd backend && ./gradlew test` | 81 | Green in CI (H2 and PostgreSQL 16) |
| React | `cd frontend && npm test` | 67 | Green in CI |
| Flutter | `cd flutter_app && flutter test` | 18 | Green in CI |
| CI | GitHub Actions, PR #24 | 6 jobs | All green |

AI tests run with no API key, so they prove the rule-based path, not LLM output.

## Manual checks
| Date | Check | Result |
| --- | --- | --- |
| 2026-11-04 | React app as committee, owner, tenant, guard: request, vehicle, gate pass, worker, parking, notice, contact, household, emergency, lease, rating, gate verify (typed code) | Pass |
| 2026-11-04 | Phone-width layout after fixes (request rows, top bar, estate grid) | Pass |
| 2026-11-07 | Real Telegram account: contact share; "Hi" ignored as chatter; "The lift is stuck" and "The toilet is blocked" became requests with replies | Pass |
| 2026-11-13 | n8n classifier called directly: leaking pipe -> request 0.9; greeting -> chatter 0.9 | Pass |
| 2026-11-13 | n8n email desk: test event and a synthetic registration on the live site sent Gmail with an Approve button (executions 259, 260) | Pass |
| 2026-11-13 | Telegram "not registered" after a free-plan database wipe | DEF-10, fixed |
| 2026-11-14 | Complaint email layout (stage tracker, next step first) rendered and read back | Pass (text check) |
| 2026-11-25 | Society modules in a browser on a local server, as committee and resident | Pass |
| 2026-11-25 | Flutter app on an Android emulator against a local server (sign in, requests, new request with photo, detail, next stage, notices, SOS, gate QR, profile) | Pass |
| 2026-11-25 | Flutter committee flow on the emulator: assign a vendor from the sheet, then Assigned -> In progress; wrong-password error shown neutral with an info icon | Pass |
| 2026-11-25 | Flutter society modules on the emulator: resident books a slot, sees dues, reports a missed pickup (request opens); committee records a part payment and takes stock out (reorder shown); staff see only Inventory and Waste and log a collection | Pass |
| 2026-11-25 | Live site after deploy: `/healthz` ok, society module routes respond | Pass |
| 2026-11-25 | Walkthrough on a local server: resident raises R-1004, committee assigns to staff, staff takes up and marks done, committee closes, resident rates; IT overview; top bar per role | Pass |
| 2026-11-25 | Live site after PR #32 deploy: new top bar code served | Pass (sign-in on the live site not done by Claude) |
| 2026-11-25 | Local server, `SEED_PASSWORD=test123`: resident home (calm dashboard with parcel and event), tuck shop order, committee dashboard "For you", laundry and events pages | Pass |
| 2026-11-25 | Local server: dashboards for head, admin, member, cleaner and maintenance; guard registers a card and taps in then out (times shown, shift started and ended) | Pass. Web NFC on a phone not tried yet (USB/typed number path checked) |
| 2026-11-25 | Agent integration testing: 6 testers wrote 53 cross-module tests (onboarding/cards/gate, request lifecycle, money, access matrix of 12 roles x ~90 routes, dashboards, web wiring); 19 bugs confirmed by independent skeptic agents and fixed (DEF-20 to DEF-29), 5 claims refuted | Pass: 139 Node tests, 0 failing |
| 2026-11-25 | Capacity test (`scripts/load-test/load.js`): about 210 requests/s sustained, roughly 700 people at the same moment; 9 MB for 2,000 residents and 125,000 records | Pass. Not run against the live free plan (0.1 CPU) |

| 2026-11-28 | Agent testing (see `agent-test-log.md`, runs 4 to 24, and `agent-test-report-2026-11-28.md`): UI tester agent over 12 accounts (17 findings, DEF-30 to DEF-46); builder agents' suites; lead-agent Chrome checks of the gate desk, scanner, card registration, request list, carpool, bulk upload and charts | Pass after fixes; 8 defects open |
| 2026-11-28 | CI on `main` after PR #53: Node 151/151, Java (H2 and PostgreSQL 16), React 7 test files, Flutter 28/28, Docker, Windows card reader | Pass |

## Not verified
Not verified: camera QR scan and native NFC on a device; Flutter on a physical phone, iOS or the live server; Telegram, email desk, roles and modules on Java/React; Docker Compose end to end; HTTPS/HSTS on a real domain; Java cutover; real WhatsApp delivery; LLM quality; the full Telegram -> email -> resolve loop in one run; accessibility, load and penetration tests; BPMN import into Signavio; acceptance with residents.
