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
| DEF-15 | Flutter app | Committee cannot assign a vendor or staff in the app | M | Not built yet | Use the web app; add assign screen | Open |
| DEF-16 | Flutter app | Error toasts are red, against the palette rule (red only for emergencies) | L | Theme default | Change toast colour | Open |
