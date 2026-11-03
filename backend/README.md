# Portal backend (Java / Spring Boot)

Phase 1 of the move from the Node API to Java (see `docs/architecture/adr-0001-java-react.md`). It is a drop-in
replacement for the Node routes listed below: same URLs, JSON shapes, status codes and error strings as `app.js`.

## Requirements
- JDK 17 or newer (built and tested on 17). No Maven, no Docker needed.
- Gradle comes from the wrapper (`gradlew`, Gradle 8.11.1, downloaded on first run).

## Run
```
cd backend
./gradlew bootRun          # Windows: gradlew.bat bootRun   -> http://localhost:8080
```
Local profile: H2 file database in PostgreSQL mode at `./data/portal` (override the path with `DB_FILE`, no extension).
The database starts empty except for the committee admin: `admin@society.test` / `Admin@1234`
(set `ADMIN_EMAIL` / `ADMIN_PASSWORD`; seeded only when no admin exists). There is no demo data.

If `JAVA_HOME` is not set to a JDK 17+ (PowerShell): `$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"`.

## Test
```
./gradlew test             # JUnit 5 + MockMvc + one real-HTTP test, in-memory H2, ~30 s after the first build
```
Reports: `build/reports/tests/test/index.html`.

## Production profile
`SPRING_PROFILES_ACTIVE=prod` switches to PostgreSQL and turns on the production rules:

| Variable | Meaning |
| --- | --- |
| `DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER`, `DB_PASSWORD` | PostgreSQL connection (defaults: localhost, 5432, portal, portal) |
| `SESSION_SECRET` | required, startup fails without it (parity with Node; see "Deviations" in the phase report) |
| `ADMIN_EMAIL`, `ADMIN_PASSWORD` | on first start (no admin yet) the password is required and must be 12+ characters |

Prod also sets the session cookie `Secure`, sends `Strict-Transport-Security`, and trusts `X-Forwarded-*` from the proxy.
Flyway runs `src/main/resources/db/migration` on start (`V1__schema.sql` creates every table the Node app has).

## What is implemented (phase 1)
`POST /api/register`, `POST /api/login`, `POST /api/logout`, `POST /api/auth/google`, `GET /api/settings`,
`GET /api/me`, `PATCH /api/me`, `POST /api/me/password`, `GET|PUT /api/admin/settings`, `GET|PUT /api/admin/access`,
`GET /api/admin/users` (`?status=`, `?q=`), `GET|PATCH|DELETE /api/admin/users/{id}`,
`POST /api/admin/users/{id}/approve|reject|reset-password`, `GET /api/admin/audit`,
`GET /api/notifications`, `GET /api/notifications/unread-count`, `POST /api/notifications/read`, `GET /healthz`
(and `/actuator/health`).

## Layout (`com.sahyadri.portal`)
- `controller` thin REST endpoints and the JSON error handler; `service` rules (auth, access matrix, settings, user admin,
  audit, notifications, bootstrap seeding); `repository` parameterised SQL over `JdbcTemplate`; `dto` response shapes
  (snake_case JSON); `security` session filters; `config` security, headers/CSP/cross-origin filter, MVC.
- `AccessGuard` offers the Node middlewares as calls for later phases: `admin(user)`, `gateStaff(user)`,
  `feature(user, name)`, `permission(user, key)` (= `can`). `AuditService.log` and `NotificationService.notify` are the
  `log()` / `notify()` helpers.
- Google sign-in: implement or replace the `GoogleTokenVerifier` bean (tests inject a fake); the default calls Google tokeninfo.

## What is implemented (phase 2)
`POST|GET /api/requests` (multipart photo: JPEG/PNG/WebP, magic-byte check, 5 MB), `GET /api/requests/{id}`, `GET .../photo`,
`GET|POST .../comments`, `POST .../assign|status|rate`, `GET|POST /api/notices`, `DELETE /api/notices/{id}`,
`GET|POST /api/household`, `GET /api/lease`, `GET /api/admin/leases`, `PUT /api/admin/users/{id}/lease`,
`GET|POST /api/vendors`, `PUT|DELETE /api/vendors/{id}`, `GET /api/admin/stats`, `GET /api/admin/export.csv`, `GET /api/pulse`.
Photos are written under `portal.upload-dir` (env `UPLOAD_DIR`, default `./uploads`).
