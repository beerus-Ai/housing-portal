# Sahyadri Heights: Housing Society Portal

A portal for one housing society. Residents register with consent, raise and track work requests (portal, phone app or Telegram), book amenities, see their dues, order from the tuck shop, book laundry, get parcel alerts and RSVP to events, and rate the work. The committee approves residents, assigns vendors or staff, posts notices, raises bills, runs inventory and waste schedules, and sees dashboards and an audit trail. AI only suggests; a person confirms. Built for the MBA BPA "Using AI" assignment. It starts empty: no demo data ships with it.

**Live:** https://sahyadri-heights.onrender.com (Render free plan: first request after sleep takes about 50 s, and the database resets on sleep or redeploy).

## Clients and stacks
| Client | Stack | Status |
| --- | --- | --- |
| Web app `/` and PWA `/m/` | Node 22.5+, Express, `node:sqlite`, vanilla JS | Default, system of record, live |
| Java API + React app (`backend/`, `frontend/`) | Spring Boot 3.3, PostgreSQL 16 / H2, React 18 + TypeScript | Strangler migration (ADR 0001), not cut over; no Telegram, email desk, roles or society modules yet |
| Android wrapper (`mobile/`) | Capacitor, native NFC + ML Kit QR | Not tested on a device |
| Flutter app (`flutter_app/`) | Flutter 3.50 / Dart 3.14, same API | Checked on an Android emulator only |

## Run and test
```
npm install
npm start          # http://localhost:3000, committee sign-in admin@society.test
npm test           # Node, 140 tests (incl. 53 cross-module integration)
node scripts/load-test/load.js   # capacity test
cd backend && ./gradlew test      # Java, 81
cd frontend && npm test           # React, 67
cd flutter_app && flutter test    # Flutter, 18
```
CI runs 6 jobs on every pull request (Node, Java H2, Java PostgreSQL 16, React, Docker build, Flutter). Environment variables and rules: `CLAUDE.md`. SQLite to PostgreSQL export: `docs/deploy.md`.

## Requirements Documents (for people)
Word, PDF, PowerPoint and Excel versions of the requirements are in [`Requirements Documents/`](Requirements%20Documents/): `Requirements Document.docx` / `.pdf`, `Requirements Presentation.pptx` and `Requirements Register.xlsx`. They are generated from the Markdown below by `scripts/requirements-docs`.

## Docs (Markdown)
| Doc | What it holds |
| --- | --- |
| [requirements](docs/requirements.md) | **Requirements Document**: Scope, Personas, Functional Requirements, Non-Functional Requirements |
| [user-stories](docs/user-stories.md) | Stories by role |
| [architecture](docs/architecture/architecture.md) | System diagrams |
| [product and technology architecture](docs/architecture/product-and-technology-architecture.md) | Modules and stack from the faculty whiteboard |
| [ADR 0001](docs/architecture/adr-0001-java-react.md) | Java/React migration decision |
| [roles-api](docs/roles-api.md) | Roles API contract |
| [auth-api](docs/auth-api.md) | Two-factor sign-in (TOTP) and passkeys: contract and security notes |
| [modules-api](docs/modules-api.md) | Society modules API contract |
| [services-api](docs/services-api.md) | Tuck shop, laundry, parcels, events API |
| [nfc-api](docs/nfc-api.md) | NFC gate cards and staff departments |
| [deploy](docs/deploy.md) | Hosting, Docker, database export |
| [test plan](docs/testing/test-plan.md), [test cases](docs/testing/test-cases.md), [results](docs/testing/test-results.md), [defects](docs/testing/defect-log.md), [acceptance](docs/testing/acceptance-plan.md) | Testing |
| [process-flows](docs/process-flows/README.md) | BPMN for Signavio |
| [demo-script](docs/demo-script.md) | Demo walk-through |
| [privacy-and-consent](docs/privacy-and-consent.md) | DPDP notes |
| [milestones](docs/milestones.md) | Plan and progress |
| [contribution-matrix](docs/contribution-matrix.md) | Team contributions |
| [jira](docs/jira/sprints.md) | Sprints and backlog CSVs |
| [CLAUDE.md](CLAUDE.md) | Rules, layout, environment variables |
| [PROMPT_LOG.md](PROMPT_LOG.md) | AI-use log |
