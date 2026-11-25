# Defect log

Severity: C critical, H high, M medium, L low. Fix commits are in the git history.

| ID | Area | Defect | Sev | Cause | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| DEF-01 | Tooling | Scripted edits failed on CRLF files | M | Windows line endings | Match actual line endings; read before editing | Fixed |
| DEF-02 | React app | Stuck on loading screen | H | Constant used before initialisation (TDZ) | Declaration order corrected | Fixed |
| DEF-03 | Guard accounts | Guard signed out soon after sign-in | H | `/api/pulse` missing from guard allow-list | Added guard-only pulse; test in `test/gate.test.js` | Fixed |
| DEF-04 | Gate scanner | Black camera box stayed visible | M | CSS `display` overrode `hidden` | Hidden elements forced hidden | Fixed |
| DEF-05 | Phone UI | Top bar overlapped the date line | M | Badge out of flow | Badge kept in flow (548b342) | Fixed |
| DEF-06 | React phone UI | Request rows wrapped badly | M | Desktop-width row layout | Compact cards (efaf35d) | Fixed |
| DEF-07 | Dashboard | "Estate at a glance" grid broken | M | Generic grid rule overrode it | Specificity fixed (6ad02c1) | Fixed |
| DEF-08 | Mobile UI | Shortcut row collapsed on phone | M | Flex row without minimum sizes | 6ad02c1 | Fixed |
| DEF-09 | Test runner | `node --test test/` failed on Node 24 | M | Node 24 behaviour change | Glob in `npm test` | Fixed |
| DEF-10 | Live Telegram | Bot said "not registered" to the tester | H | Free plan wipes SQLite on sleep/redeploy | Tester re-seeded at boot from env (8329878); real fix is a paid disk | Fixed (workaround) |
| DEF-11 | Live Telegram | Webhook stopped after each deploy | H | Secret changed per deploy | Secret derived from bot token (d651c27) | Fixed |
| DEF-12 | n8n classifier | Import failed: "Could not get parameter model.value" | M | Model stored as plain string | Saved as resource locator (d789541) | Fixed |
| DEF-13 | Flutter build | Android build failed on Windows (project and Pub cache on different drives) | H | Kotlin incremental cache bug across drives | `kotlin.incremental=false` (2026-11-25) | Fixed |
| DEF-14 | Flutter app | Network failure showed raw socket error text | L | Exception text passed to the UI | Friendly message; test in `api_test.dart` (2026-11-25) | Fixed |
| DEF-15 | Flutter app | Committee cannot assign a vendor or staff in the app | M | Not built yet | Assign sheet (AI suggestion, matching trade, staff on shift first) | Fixed 2026-11-25 |
| DEF-16 | Flutter app | Error toasts are red, against the palette rule (red only for emergencies) | L | Theme default | Neutral dark toast and text with an info icon | Fixed 2026-11-25 |
| DEF-17 | Seeding | Restarting with `SEED_PASSWORD` duplicated demo vendors and contacts | L | `INSERT OR IGNORE` on tables without a unique key | Insert only when missing; `test/seed.test.js` | Fixed 2026-11-25 |
| DEF-18 | Web app | AI "assign vendor" suggestion stayed after a staff member was assigned | L | Card ignored the current assignee | Hidden once a vendor or staff member is assigned | Fixed |
| DEF-19 | Web app | IT login opened on an empty ticket list | M | No IT home page | IT overview page (FR-RL-14) | Fixed |
| DEF-20 | Gate cards | Suspended, removed or pending people could check in with their card (and start a staff shift) | H | Tap ignored account status | Tap refuses non-approved holders and logs why | Fixed |
| DEF-21 | Gate cards | Removing someone left their card active and them 'inside' | H | Removal did not touch cards | Removal deactivates cards and checks them out | Fixed |
| DEF-22 | Gate cards | Card numbers with stray characters collided; guards could give a second card | L | Non-hex stripped; guard route skipped one-card rule | Only separators stripped, other input refused; one active card per person | Fixed |
| DEF-23 | Requests | A cleaner could be assigned a repair job; hand-over crossed departments | M | Department not checked | Assignment and hand-over follow the department | Fixed |
| DEF-24 | Requests | 'Unassigned' counted staff-assigned work; missed pickup skipped request.create | L | Query ignored assignee; route lacked permission check | Query fixed; permission applied | Fixed |
| DEF-25 | Notifications | Alerts went to suspended committee accounts | L | Loops read every admin | All alerts use approved committee members only | Fixed |
| DEF-26 | Money | Counter sale ignored repeated lines (negative stock); credit read bills by title; a clash left a half-made order; cancelled orders showed 'on account' | M | Per-line stock check; title matching; no transaction | Totals per item; credit linked by bill id; one transaction per order; cancelled state | Fixed |
| DEF-27 | Money | Bills for listed flats accepted unknown or mis-cased flat codes | L | No match to real flats | Matched case-insensitively; unknown flats refused | Fixed |
| DEF-28 | Access | A committee member could reset a guard's password | M | No governance check | Head or admin only | Fixed |
| DEF-29 | Access / web | Resident list showed staff and service accounts; three button handlers had no buttons | L | Filter and dashboard redesign | List filtered; category and channel filters back on the Requests page | Fixed |
