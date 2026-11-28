# Agent test log

A running record of every test run done by Claude agents on this project:
- the lead agent's own checks;
- builder agents verifying their work;
- testing agents (integration testers, skeptic agents, UI testers);
- the CI checks they triggered.

Add one row per run, newest at the bottom. Defects found get an ID in [`defect-log.md`](defect-log.md). Summaries per day are in the agent test reports (see [`agent-test-report-2026-11-28.md`](agent-test-report-2026-11-28.md)).

**Agent types**
- **Lead:** Claude Code directing the work; it ran browser checks itself.
- **Builder:** an agent that built a feature and ran the suites before handing back.
- **Tester:** an agent that only tests and reports; it never edits code.
- **Skeptic:** an agent that tries to disprove a reported bug before it is fixed.
- **CI:** the GitHub Actions checks on each pull request.

**Rules for every run:**
- synthetic accounts and data only (`*@sahyadri.test`, `*@x.test`, `*@example.test`);
- testers never edit code;
- destructive actions are avoided;
- results are reported as found, including failures.

## 2026-11-25

| # | Agent (type) | Scope | Method | Result | Defects | Evidence |
|---|---|---|---|---|---|---|
| 1 | 6 integration testers (Tester) | Onboarding, card and gate; request lifecycle; money; access matrix (12 roles × ~90 routes); dashboards; web wiring | Wrote cross-module `node:test` suites against a real server | 53 new tests; 139 Node tests pass | DEF-20 to DEF-29 | `test/integration-*.test.js` |
| 2 | Skeptic agents (Skeptic) | Every bug the testers reported | Reproduced and tried to disprove each claim | 19 confirmed and fixed, 5 refuted | DEF-20 to DEF-29 | `defect-log.md` |
| 3 | Lead | Capacity | `scripts/load-test/load.js` | About 210 requests/s; about 700 people at once | – | `test-results.md` |

## 2026-11-28

| # | Agent (type) | Scope | Method | Result | Defects | Evidence |
|---|---|---|---|---|---|---|
| 4 | Lead | Gate desk card registration (web) | Chrome on localhost as the guard: register, refuse a taken card, tap in | Pass | – | PR #40 |
| 5 | CI | PR #40 (gate desk, Flutter gate desk) | 6 checks | First run failed: a Flutter menu test expected the old list; fixed, then 6/6 pass | – | PR #40 |
| 6 | Lead | Full-screen scanner and "who carries it" dropdown | Chrome: open scanner, type a card, dropdown, register, tap | Pass | – | PR #41 |
| 7 | CI | PR #41 (scanner, Windows card reader) | 6 checks | Flutter analyzer flagged a deprecated `value`; fixed, then 6/6 pass | DEF-49 | PR #41 |
| 8 | Lead | Windows card reader | Build; tray app start; `SahyadriCardCheck --read-once` on the laptop NFC | Builds and starts; finds "Microsoft IFD 0"; **no real card read yet** (none held to the reader in 60 s and 90 s) | – | `windows-reader/` |
| 9 | UI tester (Tester) | Every page and control for 12 accounts, web and `/m/`, desktop and 408 px | Claude in Chrome; DOM measurements; console errors; role access probes | No console errors; role access correct; **17 findings** and 20 dropdown candidates | DEF-30 to DEF-46 | Tester report, PR #42 |
| 10 | UI agent (Builder) | 11 fields made dropdowns (web, PWA, Flutter) | `npm test`; `node --check` | 140/140; the wiring test caught 2 mistakes before commit | – | PR #42 |
| 11 | Lead | Tester fixes (clipping, top bar, cost rule, scanner focus) | Chrome checks; focused suites | Pass after fixes | – | PR #42 |
| 12 | CI | PR #42 | 6 checks | Node hung on a test the cost rule broke; the rule was narrowed and a family-registration change reverted; then 6/6 pass | DEF-35, DEF-34 | PR #42 |
| 13 | Backend agent (Builder) | Card wallet API | Its own suites: `wallet.test.js` (3), `nfc.test.js` (4), access matrix (5, +11 rows), wiring (10) | All pass; the full run was stopped when the lead merged | – | PR #43 |
| 14 | Web agent (Builder) | Wallet, counters, parcels and events by card | `npm test`; contract stub for the wiring test | 139/140 before the backend landed; 10/10 with the stub | – | PR #43 |
| 15 | Mobile agent (Builder) | PWA counters, My card; Android NFC serial; Flutter My card and Counter | `npm test`; Flutter written without an SDK | 140/140 Node; Flutter first compiled in CI | – | PR #43 |
| 16 | Lead | Card registration everywhere (Verification, Users, Accounts) | Chrome as the head: Approve + card; taken card refused; scanners open and close | Pass | DEF-47 | PR #43 |
| 17 | CI | PR #43 | 7 checks (new: Windows reader) | The Windows step failed on an expected exit code; fixed; 7/7 pass | DEF-48 | PR #43 |
| 18 | Lead | Shop descriptions and 9 new items with licensed photos | Chrome as a resident; licence check of every photo | Pass; branded or unclear photos dropped | – | PRs #44, #46 |
| 19 | Lead | Request list and committee sidebar | Chrome: resident with 10 requests (3 resolved); head | Pass | DEF-43 | PR #50 |
| 20 | Lead | Carpool | `test/carpool.test.js` (2); access matrix; Chrome: offer, ask, accept | Pass first run | – | PR #51 |
| 21 | Lead | Bulk upload | `test/bulk.test.js` (3); Chrome: paste 5 rows, 3 ready and 2 errors, import, sign-in sheet | 1 test expectation corrected; the page's results table was garbled, fixed before merge; pass | – | PR #52 |
| 22 | Lead | Charts | `test/charts.test.js` (1); Chrome: 5 charts, hover tooltip | Text too small at first (scaled drawing); fixed; pass | – | PR #53 |
| 23 | CI | PRs #44 to #53 | 7 checks each | All pass (one PR re-opened because a branch conflicted after a squash merge) | – | PRs #44–#53 |
| 24 | Email verification (Lead) | Confirmation link at onboarding, resend, committee setting | `test/verify.test.js`; live check that the resend route answers after deploy | Pass; the sign-in test that pins the answer keys was updated for `email_verified` | – | PR #55 |
| 25 | Business and daycare agent (Builder) | Neighbourhood business directory and daycare services | `npm test` | 154/154 | – | PR #56 |
| 26 | Lead | Business and daycare | Chrome: a resident lists a business, the committee approves it; a parent asks for a daycare place | Pass | – | PR #56 |
| 27 | Sign-in security agent (Builder) | Two-factor (authenticator app), recovery codes, passkeys | `npm test` with a mocked WebAuthn verifier | 157/157 | – | PR #57 |
| 28 | Lead | 2FA in the browser | Turned on 2FA for a test account, then signed in with a generated authenticator code | Pass | – | PR #57 |
| 29 | Chat agent (Builder) | Committee desk and neighbour messages | `test/chat.test.js` (4), wiring (10), access matrix (5) | All pass; the full suite was stopped by the machine running out of memory (36 passed, 0 failed at that point) | – | PR #58 |
| 30 | Lead | Chat merged with main | Conflicts in 6 files resolved (kept the 2FA allow-list line); chat, 2FA, wiring and matrix suites 26/26; Chrome: owner writes to the committee and a neighbour, the committee sees only the desk thread with 1 unread | Pass. Sending from the page was checked with script events because the browser tool could not type that session | – | PR #58 |
| 31 | CI | PRs #55 to #58 | 7 checks each | All pass | – | PRs #55–#58 |

## Template

| # | Agent (type) | Scope | Method | Result | Defects | Evidence |
|---|---|---|---|---|---|---|
| n | Name (Lead / Builder / Tester / Skeptic / CI) | What was tested | How (suite, browser, device, accounts) | Pass / fail, with numbers | DEF-xx | PR, file or commit |
