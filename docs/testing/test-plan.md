# Test plan

## Strategy
- Every story ships with an automated test or a manual case in `test-cases.md`. Testing leads sign off a story when its cases pass.
- The Node API tests are the behaviour spec for the Java backend and React app (ADR 0001).
- Risk order: access control and privacy (role checks, flat isolation, allow-lists, PII stripping), then the request lifecycle, then the rest.
- Synthetic data only. No real resident data in fixtures, prompts or manual tests.

## Scope
In: everything in `docs/requirements.md`, the AI workflows, the email desk, the review roles and the society modules (`docs/modules-api.md`).
Out: load and penetration tests, real WhatsApp delivery (Meta blocked), measured LLM quality.

## Levels
| Level | Tool | Command | Count |
| --- | --- | --- | --- |
| Node API, real HTTP on a temporary SQLite database | `node:test` | `npm test` | 78 |
| Java API, MockMvc on H2 (PostgreSQL 16 in CI) | JUnit 5 | `cd backend && ./gradlew test` | 81 |
| React components, mocked fetch | Vitest + Testing Library | `cd frontend && npm test` | 67 |
| Flutter API client and widgets | `flutter_test` | `cd flutter_app && flutter test` | 8 |
| Live smoke (Telegram, n8n, Gmail, live site) | manual | see `test-results.md` | - |
| Manual UI (browser, Android emulator, phone) | manual | see `test-results.md` | - |
| Acceptance with residents | `acceptance-plan.md` | - | not run |

CI (`.github/workflows/ci.yml`) runs 6 jobs on every pull request: Node, Java H2, Java PostgreSQL 16 + packaged boot, React, Docker image build, Flutter.

## Environments
Local Node (port 3000), Java (8080), React (5173), Flutter on an Android emulator, live site on Render (free plan; data resets). Run commands: `CLAUDE.md`. Deploy: `docs/deploy.md`.

## Entry and exit
- Story entry: Given/When/Then criteria written, Jira story in the sprint, branch open.
- Story exit: tests pass, manual cases recorded, no open critical or high defect, pull request reviewed.
- Release exit: demo script runs end to end, all suites green in CI, no critical defect, live URL reachable.
- Severity: Critical (data leak, no sign-in, data loss), High (core flow broken), Medium (wrong, workaround exists), Low (cosmetic).

## Roles
Testing leads own this plan, sign-off, defect log and acceptance. Developers write tests with code and keep suites green. Names: `docs/contribution-matrix.md`.

## AI-specific checks
- PII redaction test: phones, emails, flat numbers removed before any model call.
- Rule-based triage and gate run with no API key; LLM output is checked against fixed lists.
- Webhooks: secret check, unknown sender, intake, status, emergency.
- Email desk: a fake n8n server captures emails; GET links change nothing, confirm forms do.
- Not testable offline: model quality, WhatsApp and Gmail delivery (checked live where possible).
