# Defect log

Defects found and fixed during the build. Dates are not recorded for each item; the git history holds the fixes (commit messages cited where known). Severity: C critical, H high, M medium, L low.

| ID | Found in | Description | Severity | Root cause | Fix | Status |
| --- | --- | --- | --- | --- | --- | --- |
| DEF-01 | Development tooling | Scripted file edits failed on files with CRLF line endings: search strings with LF never matched | M | Windows line endings in source files | Edit tools and scripts normalised to match actual line endings; check with a read before editing | Fixed |
| DEF-02 | React app | App hung on a loading screen | H | Temporal dead zone: a loader used a constant before it was initialised | Declaration order corrected | Fixed |
| DEF-03 | Guard accounts | Guard session dropped shortly after sign-in | H | `/api/pulse` was missing from the guard allow-list, so the poll returned 403 and the client signed the guard out | Added `GET /api/pulse` to the guard allow-list with a guard-only response (own notification marker); test in `test/gate.test.js` | Fixed |
| DEF-04 | Gate scanner | Black camera box stayed visible when it should be hidden | M | CSS `display` rule overrode the `hidden` attribute | Hidden elements forced to stay hidden (commit "hidden elements stay hidden") | Fixed |
| DEF-05 | Phone UI | Top bar overlapped the date line (Live badge) | M | Badge positioned out of flow | Badge kept in the flow (commit 548b342) | Fixed |
| DEF-06 | React phone UI | Request rows wrapped badly on a phone | M | Row layout assumed desktop width | Compact cards and row layout (commit efaf35d) | Fixed |
| DEF-07 | Dashboard | "Estate at a glance" grid got overridden and displayed wrongly | M | A later generic grid rule overrode the specific one | Rule specificity corrected; solid shortcut row (commit 6ad02c1 and follow-ups) | Fixed |
| DEF-08 | Mobile UI | Shortcut row collapsed on phone | M | Flex row without minimum sizes | Fixed in commit 6ad02c1 | Fixed |
| DEF-09 | Test runner | `node --test test/` failed on Node 24 (directory treated as a module) | M | Node 24 behaviour change | Glob pattern used in `npm test` | Fixed |
| DEF-10 | Live site, Telegram | Bot replied "not registered" to the linked tester | H | Render free plan wipes the SQLite database on sleep and redeploy, deleting the resident and their Telegram link | Tester recreated at boot from `SEED_TELEGRAM_PHONE` / `SEED_TELEGRAM_ID` (commit 8329878); real fix is persistent storage | Fixed (workaround) |
| DEF-11 | Live site, Telegram | Webhook stopped after each deploy | H | Webhook secret was derived from a value that changed per deploy | Secret derived from the bot token (commit d651c27) | Fixed |
| DEF-12 | n8n classifier | Imported workflow failed with "Could not get parameter model.value" | M | Model stored as a plain string instead of a resource locator | Model saved as a resource locator (commit d789541); migration copy fixed too | Fixed |

## Open defects
None logged as open at time of writing. Known gaps are listed as "not yet verified" in `test-results.md`; they are untested areas, not confirmed defects.
