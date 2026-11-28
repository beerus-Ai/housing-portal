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
| DEF-30 | Web layout | Bottom ~70 px of every page under the top bar was clipped and could not be scrolled into view | H | `.side-shell > .page { height: 100dvh }` inside a grid row below the top bar | Page height follows its grid row (PR #42) | Fixed |
| DEF-31 | Phone app | Shop and laundry accounts on /m/ saw "Not allowed" with resident tabs | H | No tabs for these roles | Counter, Help and Profile tabs (PR #43) | Fixed |
| DEF-32 | Phone app | Guard on /m/ had no parcels and no card registration | M | Not built for /m/ | Parcels tab (PR #43); committee "Approve + card" on /m/; guard card registration on /m/ still missing | Open (partly fixed) |
| DEF-33 | Web layout | Committee top bar overflowed at 1280 px, hiding Sound and Alerts | M | Too many items in one row | Top bar wraps; tighter links (PR #42) | Fixed |
| DEF-34 | Onboarding | Public Join form accepts Family, bypassing "only an owner adds family" | M | Register allows any resident type | Refusing it is a Node, Java and api.js contract change; reverted from PR #42 pending a decision | Open |
| DEF-35 | Governance | The head could approve a cost they had set | H | No separation of duties | Setter cannot decide; the admin decides when the head set it (PR #42) | Fixed |
| DEF-36 | Requests | Assign panel too narrow at 1280 px; vendor list not grouped by category | L | Layout; list order | – | Open |
| DEF-37 | Gate desk | List rows wrapped the menu and tags under the icon | L | Two-column grid holding three items | Extra columns for tags and menus (PR #42) | Fixed |
| DEF-38 | Tuck shop | Item edit row unlabelled; name and category not editable | L | Minimal inline editor | Full labelled edit form (PR #44) | Fixed |
| DEF-39 | Laundry | Existing rates could only be hidden, not edited | M | No edit control | – | Open |
| DEF-40 | Inventory | Unit prefilled "pcs" as a value ("pcsroll") | L | Value instead of placeholder | Unit is a dropdown (PR #42) | Fixed |
| DEF-41 | Gate desk | First keystrokes after "Register a card" lost; an already registered card noticed only after choosing a person | M | Scanner focused after a redraw; no early check | Scanner focused at once and typing kept; taken card caught at the tap (PR #42) | Fixed |
| DEF-42 | Web layout (408 px) | Rows overflow in Residents, Settings, Broadcast and Contacts at phone width with ?web | L | Wide rows | – | Open |
| DEF-43 | Navigation | First committee sidebar group had no heading (only a caret) | L | Empty group name | Named "Daily tasks" (PR #50) | Fixed |
| DEF-44 | Laundry | Booking allows today's slot after it has passed | L | Slot not checked against the clock | – | Open |
| DEF-45 | Feedback | Silent actions: empty gate code, empty AI draft; unclear amenity-hours error | L | Missing messages | – | Open |
| DEF-46 | Wording | Raw status values in a filter, "1 pickups", greeting uses the first word of account names, duplicate Residents/Settings link | L | Copy | – | Open |
| DEF-47 | Cards | Card issuing used plain text boxes: no NFC, Windows reader typed nowhere unless focused, taken cards refused only on save | M | Separate ad-hoc inputs | One shared full-screen scanner for every place that issues a card (PR #43) | Fixed |
| DEF-48 | CI | Windows reader smoke step failed on the expected exit code | L | PowerShell step returns the last native exit code | Explicit `exit 0` after the check (PR #43) | Fixed |
| DEF-49 | Flutter | `DropdownButtonFormField.value` deprecated (analyzer failure) | L | Flutter 3.33+ | `initialValue` with a key per card (PR #41) | Fixed |
