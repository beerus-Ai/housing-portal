# Test cases

Automated file column names the test file that covers the case; Java equivalents are in `backend/src/test/java/com/sahyadri/portal/` and React ones in `frontend/src/test/`. "Manual" means the case is covered by the walk-through recorded in `test-results.md`. Requirement IDs refer to `docs/requirements.md`.

| ID | Story area | Steps | Expected | Automated test |
| --- | --- | --- | --- | --- |
| TC-ON-01 | Onboarding FR-ON-01 | Register with valid details and consent ticked | 201; account is pending; committee notified; password stored hashed | `test/e2e.test.js` (register, approve, login); `AuthApiTest` |
| TC-ON-02 | Onboarding FR-ON-01 | Register without consent, short password, bad email, duplicate email | 400/409 with clear message; no account created | `test/e2e.test.js`; `AuthApiTest`; `login.test.tsx` |
| TC-ON-03 | Onboarding FR-ON-02 | Pending user tries to sign in; committee approves; user signs in | Blocked with "awaiting approval", then succeeds | `test/e2e.test.js` |
| TC-ON-04 | Onboarding FR-ON-02 | Committee rejects or suspends user | Sign-in blocked with message; decision audited | `test/settings.test.js` (user management); `UserManagementApiTest` |
| TC-ON-05 | Household FR-ON-04 | Owner adds family or tenant | Created pending in owner's flat; non-owner gets 403 | `test/api.test.js` (household); `NoticeHouseholdVendorApiTest` |
| TC-ON-06 | Lease FR-ON-05 | Committee sets lease; tenant views it | Tenant sees days left; others cannot read it | `test/api.test.js` (lease privacy) |
| TC-AU-01 | Auth FR-AU-01/03 | Wrong password five times | Throttled; unknown email costs the same time | `test/e2e.test.js` (role denials); `AuthApiTest` |
| TC-AU-02 | Auth FR-AU-02 | Unauthenticated call; resident calls admin route | 401; 403 | `test/e2e.test.js` |
| TC-AU-03 | Auth FR-AU-04 | Committee edits access matrix; resident of that type calls the route | Denied after change; defaults preserved on existing DBs | `test/settings.test.js` (access matrix); `test/estate.test.js` (existing databases); `access.test.tsx` |
| TC-AU-04 | Auth FR-AU-05 | Turn off a feature flag | Residents 403, admin unaffected | `test/settings.test.js` (feature toggles); `test/estate.test.js` (parking flag); `FeaturesApiTest` |
| TC-AU-05 | Auth FR-AU-06 | Guard calls resident/admin routes | 403 except allow-list | `test/gate.test.js` (guard allow-list) |
| TC-AU-06 | Auth FR-AU-07 | Committee resets a password | Old session is signed out | `test/settings.test.js` |
| TC-WR-01 | Requests FR-WR-01 | Raise request with category, title, photo | 201; committee notified; invalid category or fake image rejected | `test/e2e.test.js`; `RequestApiTest`; `requests.test.tsx` |
| TC-WR-02 | Requests FR-WR-04 | Two residents in different flats list requests | Each sees own flat only; same flat shares | `test/e2e.test.js`; `test/api.test.js` |
| TC-WR-03 | Requests FR-WR-02 | Committee assigns vendor | Status assigned; resident notified; audit row | `test/e2e.test.js` |
| TC-WR-04 | Requests FR-WR-02 | Move status without vendor; move backwards | 409 | `test/e2e.test.js` |
| TC-WR-05 | Requests FR-WR-02/03 | Progress to closed; read history and comments | Timeline from audit; comments saved | `test/e2e.test.js`; `test/api.test.js` (comments) |
| TC-WR-06 | Requests FR-WR-05 | Requester rates; family tries to rate; rate twice | Owner rates for family; second rating 409 | `test/e2e.test.js`; `test/api.test.js` |
| TC-WR-07 | Vendors FR-WR-06 | Committee creates, edits, deletes vendor | Works; resident gets 403 | `test/api.test.js` |
| TC-NO-01 | Notifications FR-NO-01 | Perform assign, status change, rating | Unread count rises; mark read clears | `test/api.test.js` |
| TC-NO-02 | Notices FR-NO-02 | Committee posts notice; resident reads; resident posts | Resident sees; resident post 403 | `test/api.test.js` (notices); `test/e2e.test.js` |
| TC-NO-03 | Live updates FR-NO-03 | Change data and poll `/api/pulse` | Token changes only when visible data changes | `test/api.test.js` |
| TC-NO-04 | Emergency FR-NO-06 | Resident raises alert; committee resolves; sixth alert in an hour | Admin notified; rate limit 429 | `test/features.test.js` (emergency) |
| TC-AD-01 | Dashboard FR-AD-01 | Open stats with mixed requests | Counts by status, category, SLA, vendor ratings correct | `test/api.test.js` (stats); `ReportApiTest` |
| TC-AD-02 | Audit FR-AD-03 | Perform changes; read audit | Who/what/when for each; admin only | `test/e2e.test.js`; `ReportApiTest` |
| TC-AD-03 | Export FR-AD-04 | Download CSV | Requests present; non-admin 403 | `ReportApiTest` |
| TC-AD-04 | Estate FR-AD-02 | Open overview | One call returns every headline number; admin only | `test/estate.test.js`; `EstateApiTest` |
| TC-AD-05 | Gate FR-AD-05 | Create pass; guard verifies by code and token; reuse; expired | Single use; log row per attempt; 10 denials then 429 | `test/gate.test.js`; `GateApiTest` |
| TC-AD-06 | Estate FR-AD-05 | Vehicles, parking, workers CRUD and isolation | Validation, duplicates, 403 for wrong role | `test/estate.test.js` |
| TC-NF-01 | NFR-01 | Check headers and CSP; cross-origin POST | CSP self only; foreign Origin blocked | `test/settings.test.js` (CSP); `SessionCookieHttpTest` |
| TC-NF-02 | NFR-02 | Fresh database | Only admin, no demo data | `test/e2e.test.js` (empty database); `BootstrapTest` |
| TC-NF-03 | NFR-03 | Production mode | Secure cookie, HSTS, admin password 12+ chars required | `BootstrapTest`; manual on deploy |
| TC-AI-01 | WhatsApp FR-WR-07 | POST webhook with known registered phone and message | Request created with source whatsapp; reply logged | `test/ai.test.js` (webhook) |
| TC-AI-02 | WhatsApp FR-WR-07 | Message from unregistered number; send "status"; send "sos" | Register-first reply; status list; emergency guidance, no request | `test/ai.test.js` (webhook) |
| TC-AI-03 | Triage FR-WR-08 | New request "sparks from the lift panel" | Category, priority, summary, suggested vendor; visible to committee only | `test/ai.test.js` (rule triage; triaged for committee only) |
| TC-AI-04 | AI safety NFR-09 | Text with phone, email, flat number | Removed before any model call; works with no API key | `test/ai.test.js` (redact) |
| TC-AI-05 | Notice drafter FR-NO-04 | Committee sends rough bullets | Draft returned; nothing posted until committee posts | `test/ai.test.js` (drafter and digest) |
| TC-AI-06 | SLA FR-WR-10 | Request older than 48h, open | Escalated once, committee and requester notified, audited | `test/ai.test.js` (SLA escalation) |
| TC-AI-07 | Digest FR-NO-05 | Request weekly digest | Counts of open, unassigned, escalated, urgent, pending users | `test/ai.test.js` (drafter and digest) |
| TC-AI-08 | WhatsApp NFR-11 | POST webhook with wrong or no secret | 401 | `test/ai.test.js` (webhook) |
| TC-AI-09 | Human in the loop FR-WR-09 | Committee confirms AI-suggested vendor | Assignment only after click; audited | Manual (not yet recorded) |
| TC-UI-01 | Manual React | Raise request, vehicle, gate pass, worker, parking, notice, contact, household, emergency, lease, rating, gate verify | Forms submit and show result | Manual, see `test-results.md` (2026-11-04) |
| TC-UI-02 | Manual phone | Request row, top bar, estate grid at phone width | No overlap or wrapping | Manual; Vitest `nav.test.tsx`, `phase3.test.tsx` |

Links name test titles inside the file; run `npm test` to see each by name.
