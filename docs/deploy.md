# Deploying the portal

Two stacks exist ([ADR 0001](architecture/adr-0001-java-react.md)): the Node app (repo root, default and live) and Java + React (`backend/`, `frontend/`, not cut over).

## Run locally
| App | Command | URL |
| --- | --- | --- |
| Node | `npm ci && npm start` (SQLite `portal.db`, or `DB_FILE`) | http://localhost:3000 |
| Java | `cd backend && ./gradlew bootRun` (JDK 17+, H2 file DB in `backend/data/`) | http://localhost:8080 |
| React | `cd frontend && npm ci && npm run dev` (`/api` proxied to Node, or Java with `VITE_API_TARGET=http://localhost:8080`) | http://localhost:5173 |
| Flutter | `cd flutter_app && flutter pub get && flutter run` | see [flutter_app/README.md](../flutter_app/README.md) |

The app starts empty except for one committee admin (`ADMIN_EMAIL`, default `admin@society.test`), created only when no admin exists. In production `ADMIN_PASSWORD` is required (12+ characters). Change it after first login.

## Docker Compose (Java stack)
```
cp .env.example .env     # set DB_PASSWORD, SESSION_SECRET (openssl rand -hex 32), ADMIN_PASSWORD
docker compose up --build
```
Open http://localhost:8081. Services: `postgres` (16, volume `pgdata`), `backend` (prod profile, not published), `frontend` (nginx serves the SPA, proxies `/api/`). The prod cookie is `Secure`: put TLS in front, forward `X-Forwarded-Proto`, and enable HSTS in `frontend/nginx.conf.template`. Not run end to end yet.

## Environment variables
| Variable | Used by | Notes |
| --- | --- | --- |
| `DB_NAME`, `DB_USER`, `DB_PASSWORD` | postgres, backend | password required |
| `DB_HOST`, `DB_PORT` | backend | compose sets `postgres`, `5432` |
| `SESSION_SECRET` | backend, Node | required in production |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | backend, Node | used only when no admin exists |
| `SPRING_PROFILES_ACTIVE` | backend | `prod` in the image |
| `BACKEND_URL` | frontend | nginx upstream, default `http://backend:8080` |
| `WEB_PORT` | compose | host port, default 8081 |
| `PORT`, `DB_FILE`, `UPLOAD_DIR`, `NODE_ENV=production` | Node | `NODE_ENV=production` turns on secure cookies and trust proxy |
| `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` | Node | Telegram intake; if the URL changes, call `POST /api/admin/telegram/set-webhook` as head or sysadmin (no button) |
| `CLASSIFY_WEBHOOK_URL` | Node | n8n message classifier (LLM gate); unset = rules |
| `ADMIN_EMAIL_WEBHOOK_URL` | Node | n8n admin email desk; unset = no emails |
| `PUBLIC_URL`, `EMAIL_ACTION_SECRET` | Node | base for email links (else `RENDER_EXTERNAL_URL`); signing key (else `ADMIN_PASSWORD`). `PUBLIC_URL` / `RENDER_EXTERNAL_URL` also set the passkey RP ID and origin; without them passkeys work on localhost only |
| `TOTP_KEY` | Node | optional key for the authenticator-app secrets (AES-256-GCM, HKDF); else `SESSION_SECRET`. Set it before rotating `SESSION_SECRET`, or every 2FA user needs a recovery code or a reset. See `docs/auth-api.md` |
| `ANTHROPIC_API_KEY`, `SLA_HOURS` | Node | optional LLM triage; escalation hours (default 48) |
| `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_WEBHOOK_SECRET` | Node | WhatsApp intake (built, not connected) |
| `SEED_PASSWORD`, `SEED_TELEGRAM_PHONE`, `SEED_TELEGRAM_ID` | Node | demo only: role accounts, vendors and the Telegram tester are recreated at every start |

Google sign-in is off by default; to enable it, swap in the Google CSP lines in `frontend/nginx.conf.template` (Java stack) and set the client id in the admin Sign-in settings.

## Render (live)
- Live: https://sahyadri-heights.onrender.com, Node app, service `sahyadri-heights` from `render.yaml`.
- Branch: `feat/HSP-28-admin-overview`, auto-deployed. To deploy, fast-forward it to `main`: `git push origin origin/main:feat/HSP-28-admin-overview`. Last deployed: `3d732f5` (2026-11-25).
- Deploy: push to that branch. If auto-deploy is off, use Manual Deploy > Deploy latest commit.
- Admin password: the generated `ADMIN_PASSWORD` under the service's Environment tab.
- Free plan: the first request after sleep takes about 50 s, and the SQLite database and uploads reset on sleep and redeploy. `SEED_*` recreates the demo accounts. For durable data, use a paid plan with the disk block in `render.yaml` (`DB_FILE=/var/data/portal.db`, `UPLOAD_DIR=/var/data/uploads`).
- n8n: import `n8n/message-classifier.json` and `n8n/admin-email-desk.json`, connect credentials, publish, and set `CLASSIFY_WEBHOOK_URL` and `ADMIN_EMAIL_WEBHOOK_URL` (see `n8n/README.md`). The current n8n account is a trial and has to be moved.

## Backup and restore
- Node: IT can download a copy from `GET /api/it/backup`. Or copy `portal.db` while stopped (or `sqlite3 portal.db ".backup out.db"`) plus `uploads/`.
- PostgreSQL:
  ```
  docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -Fc "$POSTGRES_DB"' > portal-$(date +%F).dump
  docker compose exec -T postgres sh -c 'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists' < portal-2026-01-01.dump
  ```
- Keep backups off the host; they hold personal data and password hashes. Test a restore on a scratch database.

## Cutover checklist: Node to Java
Only after Java covers every `test/*.test.js` behaviour (Telegram, email desk, roles, modules and two-factor sign-in are not ported yet) and the stack has run in staging. Java has no 2FA or passkeys: until it does, users with two-factor on must not be able to sign in there with a password alone (`docs/auth-api.md`).
1. Rehearse the export and import on staging and time it. Announce a maintenance window.
2. Freeze Node (stop it or return 503). Back up `portal.db` and `uploads/`.
3. Start the backend once on a fresh Postgres so Flyway creates the schema; stop it.
4. `node scripts/export-sqlite-to-postgres.js portal.db --dry-run` (note row counts), then run it for real and `psql -v ON_ERROR_STOP=1 -f import.sql` (`TRUNCATE users CASCADE` first if the backend seeded an admin). Compare counts. Copy `uploads/`.
5. `docker compose up -d`, wait for healthy, switch the proxy or DNS to the frontend. Everyone signs in again.
6. Smoke test: `/healthz`, `/actuator/health`, admin and resident login, create and progress a request, notice, gate verify, audit entries, cross-origin POST rejected (403).
7. Monitor for a day; keep Node stopped but intact.

Rollback: before any write on Java, point the proxy back to Node and unfreeze it (no data lost). After writes on Java, rolling back loses them; agree a cut-off (for example 1 hour) after which you roll forward. Retire Node only after an agreed stable period.
