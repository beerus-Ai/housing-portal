# Test results

Recorded 2026-11-04. Only what was actually run is marked as passed.

## 1. Automated suites
| Suite | Command | Count | Result |
| --- | --- | --- | --- |
| Node API (`node:test`) | `npm test` | 48 (41 baseline plus 7 in `test/ai.test.js`) | 48 pass, 0 fail (re-run during this documentation pass) |
| Java backend (JUnit 5) | `cd backend && ./gradlew test` | 68 | Reported green by the development run before this documentation pass; not re-run here |
| React (Vitest) | `cd frontend && npm test` | 59 | Reported green by the development run; not re-run here |

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

## 3. Not yet verified
- Camera QR scanning (the camera path was only tested by typing the code; a black camera box defect was fixed but a real scan was not recorded).
- Native NFC on the Android app.
- Docker Compose stack and the GitHub Actions workflow: never run.
- HTTPS deployment, HSTS, secure cookie behaviour on a real domain.
- The Java backend serving the React app as the primary system (cutover has not happened).
- Real WhatsApp delivery through a provider, and real LLM triage quality (no keys configured; rule-based path only).
- Human confirmation flow for AI suggestions in the UI (TC-AI-09).
- Acceptance testing with real residents (not started; see `acceptance-plan.md`).
- Accessibility audit, load and performance tests, penetration test.
- Import of the BPMN files into Signavio.

## 4. Summary
Automated: all known suites green at time of writing. Manual: the main React forms pass. Open risks are in section 3; none has been hidden by marking it passed.
