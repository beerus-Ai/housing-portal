# Housing Society Portal (Sahyadri Heights)

MBA assignment (BPA Using AI, Session 3 brief). Resident onboarding, work requests, notices, role-based dashboards, audit trail.

## Stack (and why)
Two stacks run side by side (ADR: `docs/architecture/adr-0001-java-react.md`, strangler migration). **Node is the default and the system of record until the Java backend reaches parity and cutover happens.**
- **Node (default, port 3000):** Node 22.5+ (built with 24), Express, `node:sqlite` (no native build step; swap for hosted Postgres in production), bcryptjs, express-session, multer.
- **Java (`backend/`, port 8080):** Spring Boot 3.3, Java 17+, Gradle wrapper, Spring Security session cookie, JPA, Flyway, H2 locally, PostgreSQL 16 in prod. Drop-in replacement for the Node API (same URLs, JSON, status codes, error strings).
- **React (`frontend/`, port 5173):** React 18, TypeScript, Vite, React Router, TanStack Query. Talks to either backend through the Vite proxy (`VITE_API_TARGET`).
- **Mobile (`mobile/`):** Capacitor Android wrapper around the PWA; `public/m/` stays until the React app replaces it.
- Vanilla JS frontend in `public/` (no build step, strict CSP: no inline scripts). The menu can sit on the side or on top and can be hidden; the choice is kept in localStorage (`hp.nav`). Animations are small Lottie JSON files in `public/anim/` played by `lottie-web` (`public/ui.js`). Fonts (Outfit, Plus Jakarta Sans) and Phosphor duotone icons are self-hosted in `public/vendor/`, so the CSP stays `'self'` only.
- Two clients on one API: the **web app** (`/`, desktop-first and responsive) and the **mobile app** (`/m/`, installable PWA with a bottom tab bar). Phones opening `/` are sent to `/m/` (add `?web` to stay). Design source: Claude Design handoff `Housing Portal.dc.html` (tokens in `public/css/tokens.css`, base components in `public/css/ds.css`).
- **AI module (in progress):** `ai.js` holds PII redaction, rule-based triage, optional LLM triage, notice drafter and weekly digest. AI only suggests; a committee member confirms assignments and sends notices. Never send names, phones, emails or flat numbers to a model.
- **WhatsApp intake (in progress):** `/api/whatsapp/webhook` (secret-checked) turns a message from a registered phone into a request and sends status replies; `/api/admin/whatsapp/simulate` exercises it without a provider. Env: `ANTHROPIC_API_KEY` (optional, enables LLM mode), `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_WEBHOOK_SECRET`, `SLA_HOURS` (default 48).

## Run
- `npm start` -> http://localhost:3000. The database starts empty except for the committee admin (`admin@society.test`; set `ADMIN_EMAIL` / `ADMIN_PASSWORD`, required and 12+ characters in production). There is no demo data: register residents through the UI and enter only the minimum data when testing.
- `npm test` -> Node API tests (`node:test`, 48 including `test/ai.test.js`). Every story ships with a test; testing leads sign off.
- Java: `cd backend && ./gradlew test` (JUnit, 68 tests); `./gradlew bootRun` for port 8080. Needs JDK 17+.
- React: `cd frontend && npm install && npm run dev`; `npm test` (Vitest, 59), `npm run lint`, `npm run build`.
- Mobile: see `mobile/README.md` (Capacitor, Android).
- Docker Compose (Postgres + Java + nginx/React) and CI are defined (`docker-compose.yml`, `.github/workflows/ci.yml`, `docs/deploy.md`) but have not been run.
- Env: `PORT`, `SESSION_SECRET` (required in production), `DB_FILE`, `NODE_ENV=production` (secure cookies, trust proxy).

## Layout
- `app.js` routes + rules, `db.js` schema + admin seed, `ai.js` AI module (in progress), `server.js` entry, `test/` Node tests.
- `public/index.html` + `web.js` web app; `public/m/` mobile app (`m.js`, `sw.js`, manifest); `public/common.js` shared helpers (api, escaping, tracker, status mapping); `public/api.js` API contract; `public/css/` styles.
- `backend/` Java API; `frontend/` React app; `mobile/` Capacitor Android; `scripts/` SQLite to Postgres export.
- `docs/`: `requirements.md`, `process-flows/` (BPMN for Signavio), `architecture/` (diagrams, ADR), `testing/`, `jira/` (backlog, sprints), `demo-script.md`, `contribution-matrix.md`, `privacy-and-consent.md`, `deploy.md`.

## Rules
- Never use real resident data in prompts, fixtures or tests. Synthetic only.
- Hash passwords, check role on every route (`auth`, `admin` middlewares), parameterised SQL only, escape all output in the UI (`esc`).
- Every state change writes to `audit` (who, what, when).
- Request lifecycle is forward-only: open → assigned → in_progress → closed; a vendor is required to progress; only closed requests can be rated, once. In the UI a closed request shows as "Resolved, awaiting rating" and becomes "Closed" when rated (the design's 5-step tracker).
- Visibility: residents see their own requests and any request from their own flat; committee sees all. Rating: the requester rates, but a family member never rates; the flat owner rates for them (`can_rate` is computed by the API, the UI never decides).
- Household: only an owner adds family/tenants (forced to their flat, created `pending`, committee approves). Tenant lease is set by the committee (`PUT /api/admin/users/:id/lease`) and read by the tenant.
- Build from JIRA stories one at a time; log key prompts/failures in `PROMPT_LOG.md`.
- Changes to the API contract must be made in Node, Java and `public/api.js` together; the Node tests are the behavioural spec for the ports.
- AI features: suggestions only, redact PII before any model call, rule-based fallback must work with no key, audit AI suggestions and human confirmations.
