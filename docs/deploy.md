# Deploying the portal

Two stacks exist side by side (see `docs/architecture/adr-0001-java-react.md`): the Node app (root) and the Java backend + React frontend (`backend/`, `frontend/`).

## Run locally without Docker
- Node app: `npm ci && npm start` -> http://localhost:3000 (SQLite file `portal.db`, or `DB_FILE`).
- Java backend: `cd backend && ./gradlew bootRun` -> http://localhost:8080 (H2 file DB in `backend/data/`). Needs JDK 17+.
- React frontend: `cd frontend && npm ci && npm run dev` -> http://localhost:5173, `/api` proxied to Node (3000) or Java (`VITE_API_TARGET=http://localhost:8080`).

## Run with Docker Compose
```
cp .env.example .env     # set DB_PASSWORD, SESSION_SECRET (openssl rand -hex 32), ADMIN_PASSWORD (12+ chars)
docker compose up --build
```
Open http://localhost:8081 (`WEB_PORT`). Services: `postgres` (16, volume `pgdata`), `backend` (prod profile, not published), `frontend` (nginx, serves the SPA and proxies `/api/` to the backend, preserving `Host`). Each has a healthcheck; start order follows health. `.env` is git-ignored; no secrets are committed.

The session cookie is `Secure` in the prod profile, so browsers only keep it over HTTPS (localhost is exempt in Chrome/Firefox). Put TLS in front (reverse proxy / load balancer) for anything real, forward `X-Forwarded-Proto`, and enable the HSTS line in `frontend/nginx.conf.template`.

## Environment variables
| Variable | Used by | Notes |
| --- | --- | --- |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | postgres, backend | password required |
| `DB_HOST`, `DB_PORT` | backend | compose sets `postgres`, `5432` |
| `SESSION_SECRET` | backend | required in prod; startup fails without it |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | backend | used only when no admin exists |
| `SPRING_PROFILES_ACTIVE` | backend | `prod` in the image |
| `BACKEND_URL` | frontend | nginx upstream, default `http://backend:8080` |
| `WEB_PORT` | compose | host port, default 8081 |
| Node app: `PORT`, `SESSION_SECRET`, `DB_FILE`, `NODE_ENV=production`, `ADMIN_EMAIL`, `ADMIN_PASSWORD` | Node | see `CLAUDE.md` |

## First-run admin password
The app starts empty except for one committee admin, created only when no admin exists. In production (`NODE_ENV=production` / Spring `prod`) `ADMIN_PASSWORD` is required and must be at least 12 characters, otherwise startup fails. Change it after first login. There is no demo data. Existing bcrypt hashes (`$2a$`/`$2b$`) from the Node app work in the Java backend.

## Google sign-in (optional)
Off by default. The frontend CSP allows only `'self'`; to enable Google Identity Services, swap in the commented Google directives in `frontend/nginx.conf.template` and set the client id in the admin Sign-in settings.

## Backup and restore
PostgreSQL:
```
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > portal-$(date +%F).dump
docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < portal-2026-01-01.dump
```
Restore into a stopped backend if possible. Test a restore on a scratch database regularly. The Node app: copy `portal.db` (while stopped, or via `sqlite3 portal.db ".backup out.db"`) and the `uploads/` directory. Keep backups off the host and treat them as sensitive (they hold personal data and password hashes).

## Cutover checklist: Node to Java
Only after phases 2 and 3 reach parity (all `test/*.test.js` behaviours covered) and the stack has run in staging.
1. Rehearse: copy `portal.db`, export, import into a staging Postgres, run smoke tests. Time the whole thing.
2. Announce a maintenance window.
3. Freeze: put the Node app in read-only/maintenance (stop it or have the proxy return 503). Take a final backup of `portal.db` and `uploads/`.
4. Prepare the target: fresh Postgres; start the backend once so Flyway creates the schema; stop the backend.
5. Export: `node scripts/export-sqlite-to-postgres.js portal.db --dry-run` (record the row counts), then without `--dry-run`.
6. Import: `psql -v ON_ERROR_STOP=1 -f import.sql`. If the backend seeded an admin, `TRUNCATE users CASCADE` first (or accept the seeded one). Compare per-table `SELECT count(*)` with the dry-run counts. Copy `uploads/` to wherever the Java backend serves photos from (unless that phase is not yet implemented).
7. Start backend and frontend (`docker compose up -d`); wait for healthy.
8. Switch the proxy / DNS to the frontend container (previously to Node on port 3000). Existing sessions are not carried over: everyone logs in again.
9. Smoke tests: `/healthz` and `/actuator/health`; admin login; resident login; a resident request is visible to the right people; create and progress a request; notice; gate pass verify; audit shows the new actions; Google login if enabled; cross-origin POST rejected (403).
10. Monitor logs and health for the first day; keep Node stopped but intact.

Rollback: before any new data is written on Java, point the proxy back at the Node app (unchanged, frozen `portal.db`) and unfreeze it; no data is lost. After writes on Java, the rollback loses them unless you replay them manually: decide on a cut-off (for example 1 hour) after which you roll forward instead. Retire Node (delete code, archive `portal.db`) only after an agreed stable period.

## Hosted demo (Render, default Node app)
`render.yaml` at the repo root defines one web service. To publish:
1. Sign in at https://render.com with the GitHub account that owns this repository.
2. New > Blueprint > select `beerus-Ai/housing-portal` (branch `main` once PR #16 is merged, or pick the feature branch).
3. Apply. Render builds with `npm ci --omit=dev`, starts `node server.js` and gives an `https://sahyadri-heights-xxxx.onrender.com` URL.
4. Open the service > Environment, read the generated `ADMIN_PASSWORD`, sign in as `admin@society.test`, then change the password from Profile.
5. Free plan caveat: data lives on the instance disk and is lost on redeploy or after long sleeps. For a durable demo use a paid plan, add the disk block in `render.yaml` and set `DB_FILE=/var/data/portal.db`, `UPLOAD_DIR=/var/data/uploads`.
6. WhatsApp: set `WHATSAPP_WEBHOOK_SECRET`, then point the provider webhook at `https://<your-url>/api/whatsapp/webhook?secret=<that secret>`.

### Current deployment
Live: https://sahyadri-heights.onrender.com (Render free plan, blueprint `sahyadri-heights`, branch `feat/HSP-28-admin-overview`). The admin password is the generated `ADMIN_PASSWORD` under the service Environment tab. First request after sleep can take about 50 seconds.
