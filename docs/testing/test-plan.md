# Test plan

## 1. Strategy
Tests ship with code: every Jira story has at least one automated test or a manual case in `test-cases.md`, and the testing leads sign off a story only when its cases pass. The Node API tests are the behavioural specification for the Java backend and the React app (ADR 0001), so one set of rules is checked three times. Synthetic data only; no real resident data in fixtures, prompts or manual tests.

Risk-based emphasis: access control and privacy first (role checks, flat isolation, guard allow-list, PII stripping before any model call), then the request lifecycle, then convenience features.

## 2. Scope
In scope: all requirements in `docs/requirements.md`, including the AI workflows (Telegram and WhatsApp intake, message gate, triage, suggested actions, notice drafter, SLA escalation, weekly digest) and the committee email desk. Out of scope: load and penetration testing (not performed), real WhatsApp Cloud API delivery (Meta account blocked), measured LLM quality, native NFC.

## 3. Levels
| Level | What | Tool | Count |
| --- | --- | --- | --- |
| API / integration (Node) | Express app against a temporary SQLite database, real HTTP; the email desk tests use a fake n8n webhook server | `node:test` (`npm test`) | 65 |
| API / integration (Java) | Spring Boot with MockMvc and one real-HTTP test, in-memory H2 (also PostgreSQL 16 in CI) | JUnit 5 (`cd backend && ./gradlew test`) | 81 |
| Component / UI (React) | React Testing Library with mocked fetch | Vitest (`cd frontend && npm test`) | 67 |
| Live smoke | Real Telegram message, n8n executions, email received | Telegram, n8n execution list, Gmail | see `test-results.md` |
| Manual UI | Role walk-throughs on the React app and phone | Browser, Android phone via adb | see `test-results.md` |
| Acceptance | Residents at the partner society | `acceptance-plan.md` | not yet done |

Counts confirmed by grepping `test(` in `test/*.js`, `@Test` in `backend/src/test`, and `it(`/`test(` in `frontend/src/test`.

## 4. Environments
| Env | Setup |
| --- | --- |
| Local Node | `npm start`, port 3000, SQLite file; tests use temporary databases |
| Local Java | `./gradlew bootRun`, port 8080, H2 file; tests in-memory |
| Local React | `npm run dev`, port 5173, proxy to Node or Java |
| Phone | Android phone over adb with the Capacitor app or the PWA |
| Staging / production | Docker Compose with PostgreSQL behind TLS: defined but never run |

## 5. Entry and exit criteria
Entry for a story: acceptance criteria written (Given/When/Then), Jira story in the sprint, branch open.
Exit for a story: its automated tests pass, its manual cases are recorded in `test-results.md`, no open critical or high defect, peer review of the pull request done.
Exit for release (faculty gate): end-to-end flow works under the scripted demo (`docs/demo-script.md`), all three automated suites green, no critical defects in `defect-log.md`, live URL reachable.

Severity: Critical (data leak, cannot sign in, data loss), High (core flow broken), Medium (feature wrong, workaround exists), Low (cosmetic).

## 6. Roles
| Role | Responsibility |
| --- | --- |
| Testing leads | Own this plan, sign off stories, keep the defect log, run acceptance |
| Developers | Write tests with code, fix defects, keep suites green |
| Design leads | Review that acceptance criteria and UI standards are testable |
| Everyone | Run the manual walk-through at least once (see contribution matrix) |
Names are recorded in `docs/contribution-matrix.md`, not here.

## 7. Tooling
`node:test` (built in), JUnit 5 with Spring Boot Test and MockMvc, Vitest with React Testing Library, ESLint for the React app, GitHub Actions workflow (`.github/workflows/ci.yml`, runs on every pull request), Chrome and adb for manual runs. Defects are tracked in `defect-log.md` and, for the course, as Jira bugs.

## 8. Test data
Synthetic: `*.test` emails, invented flat numbers, made-up phone numbers. The app starts with only the committee admin; testers register residents through the UI. Real numbers or names must never be pasted into Claude or fixtures.

## 9. AI-specific testing
- Redaction unit test: phones, emails, flat numbers are removed from text before a model call.
- Rule-based triage runs with no API key; LLM mode is optional and its output is validated against fixed category and priority lists.
- Webhook tests cover secret check, unknown number, intake, status query, emergency guidance.
- The simulator endpoint (`/api/admin/whatsapp/simulate`) lets testers exercise intake without a WhatsApp account.
- Email desk: a fake n8n server in the test captures every email; tests follow the links like a mail client (GET must not change state) and post the confirm forms.
- Not testable offline: real model quality, real WhatsApp delivery, Gmail delivery. These are checked live (n8n execution list, the inbox).
