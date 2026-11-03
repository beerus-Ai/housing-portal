# Sahyadri Heights: Housing Society Portal

A web app and an installable mobile app (PWA) for a housing society. Residents raise work requests with photos, track them and rate the work. The committee approves residents, assigns vendors, posts notices, manages tenant leases and sees live dashboards. Built for the BPA "Using AI" assignment. It starts empty: no demo data ships with it.

- **Web app:** `/` (desktop-first, responsive). **Mobile app:** `/m/` (bottom tab bar, installable, offline shell).
- **Stack:** Node 22.5+, Express, `node:sqlite`, vanilla JS (no build step, strict CSP), self-hosted fonts and icons.
- **Roles:** owner, tenant, family member, committee. Access is checked on every route.

## Run
```
npm install
npm start                # http://localhost:3000
npm test
```
Committee sign-in: `admin@society.test` (password from `ADMIN_PASSWORD`, default in `db.js`). Residents register themselves and the committee approves them. Enter only the minimum data when testing. Change `ADMIN_PASSWORD` and set `SESSION_SECRET` for anything beyond local use.

See `CLAUDE.md` for the rules and layout, and `PROMPT_LOG.md` for the AI-use log.
