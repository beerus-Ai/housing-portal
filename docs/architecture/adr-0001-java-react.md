# ADR 0001: Move to Java (Spring Boot) and React, side by side

Status: accepted (user decision, 2026-11-04). Replaces the Node/Express + vanilla JS stack **gradually** (strangler pattern). The Node server keeps serving everything until the Java backend passes parity.

## Target stack
- **Backend** (`backend/`): Java 17+ (runs on 17 and 21), Spring Boot 3.3, Gradle (wrapper, 8.11.1), Spring Web, Spring Security (session cookie), Spring Data JPA, Flyway, Bean Validation, Actuator, springdoc-openapi. Local DB: H2 in PostgreSQL mode (no Docker needed); prod DB: PostgreSQL 16. Passwords: BCrypt (existing bcryptjs `$2a$` hashes are compatible).
- **Frontend** (`frontend/`): React 18, TypeScript, Vite, React Router, TanStack Query, plain CSS reusing `public/css` tokens. Icons: Phosphor duotone web font already vendored.
- **Phone/Android**: the React app (responsive) later replaces `/m` inside the Capacitor shell; until then `public/m` stays.
- **Runtime**: Docker Compose (Postgres + backend + frontend) provided, but not required locally. CI: GitHub Actions.

## The API contract is frozen
The URLs, methods, JSON shapes, status codes and error messages are exactly what `app.js` implements today and what `public/api.js` documents. The Java backend must be a drop-in replacement; the React app talks only through a typed `frontend/src/api` layer that mirrors `public/api.js`. The existing Node tests (`test/*.test.js`) are the behavioural spec.

## Rules that must carry over (see CLAUDE.md)
role checks on every route; parameterised queries only; every state change writes `audit`; request lifecycle forward-only; permission matrix + feature flags; guard allow-list; login rate limits; Google ID-token login for existing accounts only; secure headers; no demo data (app starts empty, admin only).

## Phases (one PR each, stacked)
1. Skeletons: backend (auth, me, settings, access matrix, admin users, audit, notifications) + frontend (Vite scaffold, login, shell with side/top/hide nav, resident Home, committee Settings). Frontend runs against the Node API through the Vite proxy so it can be tested today.
2. Requests, notices, household, vendors, lease, stats/audit/export.
3. Emergencies, contacts, gate passes + guards.
4. Cutover: Dockerfiles, Compose, GitHub Actions, switch the proxy to Java, retire Node.

## Status
Updated 2026-11-04.

| Phase | State |
| --- | --- |
| 1 Skeletons (backend auth/settings/access/admin users/audit/notifications; frontend scaffold, login, shell, Home, Settings) | Implemented in `backend/` and `frontend/` |
| 2 Requests, notices, household, vendors, lease, stats/audit/export | In progress on separate branches |
| 3 Emergencies, contacts, gate passes + guards | Not started |
| 4 Cutover infrastructure | Files added: `backend/Dockerfile`, `frontend/Dockerfile` (+ nginx config), `docker-compose.yml`, `.env.example`, `.github/workflows/ci.yml`, `scripts/export-sqlite-to-postgres.js`, `docs/deploy.md`. Not yet exercised on a machine with Docker; the cutover itself has not happened |

The Node app remains the system of record and serves production until phases 2 and 3 reach parity. See `docs/deploy.md` for the cutover checklist and rollback.
