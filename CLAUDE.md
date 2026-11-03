# Housing Society Portal (Sahyadri Heights)

MBA assignment (BPA Using AI, Session 3 brief). Resident onboarding, work requests, notices, role-based dashboards, audit trail.

## Stack (and why)
- Node 22.5+ (built with 24), Express, `node:sqlite` (no native build step; swap for hosted Postgres in production), bcryptjs, express-session, multer.
- Vanilla JS frontend in `public/` (no build step, strict CSP: no inline scripts). Fonts (Outfit, Plus Jakarta Sans) and Phosphor duotone icons are self-hosted in `public/vendor/`, so the CSP stays `'self'` only.
- Two clients on one API: the **web app** (`/`, desktop-first and responsive) and the **mobile app** (`/m/`, installable PWA with a bottom tab bar). Phones opening `/` are sent to `/m/` (add `?web` to stay). Design source: Claude Design handoff `Housing Portal.dc.html` (tokens in `public/css/tokens.css`, base components in `public/css/ds.css`).

## Run
- `npm start` → http://localhost:3000. Default synthetic admin: `admin@society.test` / `Admin@1234` (override with `ADMIN_EMAIL`, `ADMIN_PASSWORD`).
- `npm run seed` → synthetic Sahyadri Heights demo data (run on an empty DB, e.g. `DB_FILE=demo.db npm run seed`). Residents use password `Demo@1234`: `ananya@sahyadri.test` (owner), `aarav@sahyadri.test` (family), `rohit@sahyadri.test` (tenant). Committee: the admin above.
- `npm test` → API end-to-end tests (`node:test`). Every story ships with a test; testing leads sign off.
- Env: `PORT`, `SESSION_SECRET` (required in production), `DB_FILE`, `NODE_ENV=production` (secure cookies, trust proxy).

## Layout
- `app.js` routes + rules, `db.js` schema + admin seed, `seed.js` demo data, `server.js` entry, `test/` tests.
- `public/index.html` + `web.js` web app; `public/m/` mobile app (`m.js`, `sw.js`, manifest); `public/common.js` shared helpers (api, escaping, tracker, status mapping); `public/css/` styles.

## Rules
- Never use real resident data in prompts, fixtures or tests. Synthetic only.
- Hash passwords, check role on every route (`auth`, `admin` middlewares), parameterised SQL only, escape all output in the UI (`esc`).
- Every state change writes to `audit` (who, what, when).
- Request lifecycle is forward-only: open → assigned → in_progress → closed; a vendor is required to progress; only closed requests can be rated, once. In the UI a closed request shows as "Resolved, awaiting rating" and becomes "Closed" when rated (the design's 5-step tracker).
- Visibility: residents see their own requests and any request from their own flat; committee sees all. Rating: the requester rates, but a family member never rates; the flat owner rates for them (`can_rate` is computed by the API, the UI never decides).
- Household: only an owner adds family/tenants (forced to their flat, created `pending`, committee approves). Tenant lease is set by the committee (`PUT /api/admin/users/:id/lease`) and read by the tenant.
- Build from JIRA stories one at a time; log key prompts/failures in `PROMPT_LOG.md`.
