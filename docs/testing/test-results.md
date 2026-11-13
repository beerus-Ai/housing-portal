# Test results

Recorded 2026-11-04, updated 2026-11-14. Only what was actually run is marked as passed.

## 1. Automated suites
| Suite | Command | Count | Result |
| --- | --- | --- | --- |
| Node API (`node:test`) | `npm test` | 65 | 65 pass, 0 fail on 2026-11-14 (includes `telegram`, `ai-action`, `classify-n8n`, `seed-telegram`, `email-desk`) |
| Java backend (JUnit 5) | `cd backend && ./gradlew test` | 81 | Green in CI on PR #18 (H2 and PostgreSQL 16 jobs). Telegram and the email desk are not ported to Java yet |
| React (Vitest) | `cd frontend && npm test` | 67 | Green in CI on PR #18 |
| CI | GitHub Actions on PR #18 | 5 jobs | All green (runs 43481904761, 43484067380) |

The AI tests exercise redaction, rule triage, committee-only visibility of triage, webhook handling, simulator, SLA escalation, notice drafter and digest. They run with no API key, so they prove the rule-based path, not LLM output.

## 2. Manual checks on the React app (2026-11-04)
Roles walked: committee, owner, tenant, guard. Forms exercised and passed:

| Form | Result |
| --- | --- |
| Raise request | Pass |
| Vehicle | Pass |
| Gate pass | Pass |
| Worker | Pass |
| Parking | Pass |
| Notice | Pass |
| Contact | Pass |
| Household | Pass |
| Emergency | Pass |
| Lease | Pass |
| Rating | Pass |
| Gate verify (typed code) | Pass |

Phone-width layout fixes (request row wrapping, top bar overlap, estate grid) were re-checked after the fixes; see `defect-log.md`.

## 3. Live checks (production site and n8n)
| Date | Check | Result |
| --- | --- | --- |
| 2026-11-07 | Real Telegram account: share contact, "Hi" (ignored as chatter by the n8n LLM), "The lift is stuck" and "The toilet is blocked" (requests created, replies received) | Pass |
| 2026-11-13 | n8n classifier called directly: leaking pipe -> request 0.9; greeting -> chatter 0.9 | Pass |
| 2026-11-13 | n8n email desk test event -> Gmail sent (execution 259) | Pass |
| 2026-11-13 | Synthetic registration on the live site -> approval email with Approve button sent (execution 260) | Pass |
| 2026-11-13 | Telegram bot said "not registered" after a free-plan database wipe | Defect DEF-10, fixed and deployed |
| 2026-11-14 | Complaint email layout (stage tracker, next step first) rendered from the real code and read back | Pass (text check; screenshot not possible) |

## 4. Not yet verified
- Camera QR scanning (the camera path was only tested by typing the code; a black camera box defect was fixed but a real scan was not recorded).
- Native NFC on the Android app.
- Docker Compose stack: never run (CI builds the image only).
- The full live loop in one go: Telegram message -> email -> assign, start and resolve from the email buttons (each part verified separately and in automated tests).
- Telegram and email desk on the Java and React stacks (not ported).
- HTTPS deployment, HSTS, secure cookie behaviour on a real domain.
- The Java backend serving the React app as the primary system (cutover has not happened).
- Real WhatsApp delivery through a provider (Meta blocked the business portfolio); measured LLM quality (spot checks only).
- Acceptance testing with real residents (not started; see `acceptance-plan.md`).
- Accessibility audit, load and performance tests, penetration test.
- Import of the BPMN files into Signavio.

## 5. Summary
Automated: all known suites green at time of writing. Manual: the main React forms pass. Open risks are in section 3; none has been hidden by marking it passed.
