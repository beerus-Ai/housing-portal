# Prompt log (AI use disclosure)

| # | Prompt / intent | Outcome | Failure / fix |
|---|---|---|---|
| 1 | Read the assignment PDF and build the portal | Express + SQLite MVP, API tests, UI | `node --test test/` failed on Node 24; fixed with a glob |
| 2 | Implement the Claude Design handoff as web and mobile app, keep the API | Restyled web app, PWA at `/m/`; flat visibility, owner-only rating, household, lease, stats | DesignSync needed login, so the zip export was used; screenshots timed out, so UI checked via DOM and tests; 5th tracker step mapped onto 4 statuses |
| 3 | Set up Jira from `docs/jira/backlog.csv` | 6 epics with stories; commits tagged HSP | Sprint goals written later (`docs/jira/sprints.md`) |
| 4 | Larger UI, Lottie animations, no demo data | 4151da9 | None |
| 5 | Side or top menu, hideable | `hp.nav` in localStorage (2b0e5a3, ea41799) | None |
| 6 | Android app via Capacitor | `mobile/` (c8ec983, d98e95f) | Install hint hidden inside the app |
| 7 | Try glassmorphism | Added, then limited (8c004e9, 8069462) | Rule now: solid cards, one palette |
| 8 | Emergency alerts, contacts, phone profile, vendor edit | 104db4f, HSP-20 | Live badge overlapped date on phone; fixed (548b342) |
| 9 | Gate passes, resident QR/NFC token, guard role, log | 4f6221b, HSP-24 | `/api/pulse` missing from guard allow-list; black camera box ignored `hidden`; both fixed |
| 10 | Logo, Google sign-in, minimal login | 315a76b, 6c3d619 | None |
| 11 | Dashboards, settings, access control | 35f9916, HSP-25 | None |
| 12 | Vehicles, parking, workers, grouped menu | 3c036e2, 370807f | CSS rule overrode estate grid; shortcut row collapsed; fixed (6ad02c1) |
| 13 | ADR 0001: Java Spring Boot + React side by side | `backend/`, `frontend/`, Docker, CI (a6c6ef5..91f1c78) | CRLF broke scripted edits; TDZ hang; phone row wrap (efaf35d) |
| 14 | Parallel agents in git worktrees | Phases merged (c425f9f, 6d361d1, c045d77, ded3723) | Agents limited to named files; lead merged |
| 15 | Test on an Android phone over adb | Phone layout fixes | Camera QR and NFC not verified |
| 16 | AI workflows: WhatsApp intake, triage, drafter, SLA, digest | `ai.js`, webhook, simulator, tests with no key | Real WhatsApp and LLM output untested |
| 17 | Submission documents | `docs/`; BPMN checked as XML | BPMN not imported; matrix names blank on purpose |
| 18 | Decide if a group message is a request at all | Message gate, Needs review queue (Node, Java, React) | Negation ("not collected") misjudged; patch lost a regex boundary; caught by tests |
| 19 | WhatsApp blocked by Meta: add Telegram | Telegram webhook, contact-share linking (bca8b8a..d97bc42) | Secret broke per deploy until derived from bot token (d651c27) |
| 20 | Free LLM for request vs chatter | n8n classifier, gpt-4o-mini on n8n credits (fd5f31d, d789541) | Model as plain string failed in n8n; fixed as resourceLocator |
| 21 | n8n trial ending: export for a new account | Migration pack outside the repo | Classifier export had empty model mode; fixed |
| 22 | Bot says "not registered" | Free host wipes SQLite; tester re-seeded at boot (8329878) | Real fix: paid disk |
| 23 | Email the admin each item and allow dashboard actions from email | `email-desk.js` + n8n Gmail; signed buttons replay the API (6b2be56) | Draft would have committed the webhook path; placeholder used |
| 24 | Faculty review roles (2026-11-21): positions, staff, IT, head approval | `roles.js`, `docs/roles-api.md`, PRs #19-#22, HSP-46..58 | Node only |
| 25 | Flutter app and whiteboard architecture doc (2026-11-25) | `flutter_app/` (8 tests), `docs/architecture/product-and-technology-architecture.md`, PR #23 | Flutter SDK not installed: installed. `material.dart` deprecated in Flutter 3.47+: `material_ui` package. Kotlin incremental cache bug on Windows: `kotlin.incremental=false`. Jira issue creation blocked by a safety check |
| 26 | Society modules on web (2026-11-25): amenities, dues, inventory, waste | `modules.js`, `public/web-modules.js`, `docs/modules-api.md`, PR #24, deployed | Tests passed first try; SQL keyword clash (`AS by`, `end` column) caught before tests |
| 27 | Documentation refresh, minimal (2026-11-25) | Docs updated to current facts | None |
| 28 | Gate desk: register cards in either order; Flutter gate desk (2026-11-28) | PR #40 | Flutter SDK missing locally: CI was the first compile; one menu test updated |
| 29 | Full-screen card scanner, "who carries it" dropdown; Windows card reader for PC/SC readers | PR #41, `windows-reader/` | Browsers on a PC have no Web NFC and PC/SC readers type nothing: tray app types the UID. Not yet tested with a real card |
| 30 | "Deploy agents": UI agent (dropdowns) and tester agent (every page, every role) | PR #42: 11 dropdowns, 17 tester findings, fixes | Family self-registration block reverted (Node, Java and api.js contract change on its own); head-sets-cost rule narrowed after CI |
| 31 | Card as a wallet for shop, laundry, parcels, events: contract first, then backend, web and mobile agents in parallel | `docs/card-wallet-api.md`, PR #43 | Agents could not share one branch (worktrees); lead merged their branches; Windows CI step exit code fixed |
| 32 | Card registration everywhere through one scanner | `W.scanCard`, PR #43 | A redraw wiped the early scanner; moved to <body> |
| 33 | Shop information and photos from the internet | PRs #44, #46; `public/img/shop/CREDITS.md` | Only free-licence Wikimedia photos; branded or unclear photos dropped (oil, noodles, dal) |
| 34 | Architecture slide and Word document to match the real stack (Node on Render, not Dart) | Deck slides 16-18, 21; PR #47 | Deck lives outside the repo |
| 35 | Highlight agents, prompt types, guardrails and testing agents | Deck slides 22-23; section 8 of the requirements document | None |
| 36 | Stronger sign-in: TOTP two-factor and passkeys, `/api/login` unchanged without 2FA | `auth-2fa.js`, `public/auth-extra.js`, `docs/auth-api.md`, `test/auth-2fa.test.js` | Node only; WebAuthn signatures mocked at the library boundary in tests (no real authenticator in `node:test`) |

## AI use disclosure
Claude Code (Anthropic) wrote most of the code, tests and documents from the team's prompts; the team directed, reviewed and ran it. Claude Design produced the first UI handoff. This log is a summary, not a transcript. No real resident data was given to Claude. The product's AI features strip names, phones, emails and flat numbers before any model call and only suggest; a committee member decides. Each student must be able to defend any part of the work; the contribution matrix records who did what.
