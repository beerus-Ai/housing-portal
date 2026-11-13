# Requirements: Sahyadri Heights Housing Society Portal

Source: BPA "Using AI" Session 3 brief (slides 4-9, 13). MoSCoW labels follow slide 8; where the build went beyond slide 8 the item is labelled and marked **(extra)**. Items for the AI-native workflows marked **(in progress)** are built but not fully verified with real providers; items without the mark are built, tested and live (updated 2026-11-14).

## 1. Business need and scope
A residential society of several hundred flats is run on WhatsApp groups, paper registers and phone calls. Three problems: residents cannot track complaints, the committee cannot see what is pending, and resident and vendor records are scattered. Goal: one portal to know who lives there, resolve their requests and communicate reliably, with less manual effort and clearer accountability.

In scope: resident onboarding with approval, role-based access, work requests with photos and lifecycle, notices and notifications, committee dashboard, audit trail, vendor directory, SLA tracking, CSV export, plus built extras (household, leases, emergencies, contacts, gate passes, vehicles, parking, workers, feature flags, Android wrapper) and the AI-native workflows in section 4.

Five core requirements (slide 6): onboarding, work requests, communication, visibility, accountability.

## 2. Personas
| Persona | Description | Main needs |
| --- | --- | --- |
| Owner | Flat owner, registers and is approved by the committee | Raise and track requests, rate resolved work (also for family), add family and tenants, create gate passes |
| Tenant | Renter in a flat | Raise requests, see own lease and days left, see notices |
| Family member | Added by the owner, shares the flat | Raise and see flat requests; never rates (owner rates for them); fewer permissions by default |
| Committee (admin) | Elected office-bearers | Approve residents, assign vendors, move requests forward, post notices, see the dashboard and audit trail, edit access rules and feature flags |
| Guard | Gate staff account created by the committee | Verify visitor QR/6-digit passes and resident tokens, see the gate log; nothing else |
| Messaging-only resident | Resident who does not open the portal and writes to the society's Telegram bot (live) or WhatsApp number (in progress) | Report a problem in a message and get status replies in the same chat |
| Committee member away from the dashboard | Committee member who works from their email inbox | Get each new item by email and assign, approve the next stage, reply or approve residents from the email |

## 3. Functional requirements
Priorities: M Must, S Should, C Could. IDs are stable and are referenced by `docs/testing/test-cases.md`.

### Epic 1: Onboarding
| ID | Requirement | MoSCoW |
| --- | --- | --- |
| FR-ON-01 | Register as owner, tenant or family with name, email, flat, phone, password (8-128 chars) and explicit DPDP consent; account starts `pending` | M |
| FR-ON-02 | Committee approves or rejects pending residents; only approved users can sign in; suspended/removed accounts are blocked with a clear message | M |
| FR-ON-03 | Committee is notified of each registration | M |
| FR-ON-04 | Owner adds family or tenant to own flat (forced to that flat, created `pending`, committee approves) | S (extra) |
| FR-ON-05 | Committee records tenant lease (dates, owner, police verification, agreement, parking); tenant reads it | C (extra) |

### Epic 2: Authentication and roles
| ID | Requirement | MoSCoW |
| --- | --- | --- |
| FR-AU-01 | Email and password sign-in with hashed passwords (bcrypt), session cookie (httpOnly, SameSite=Lax, Secure in production) | M |
| FR-AU-02 | Role check on every route; roles owner, tenant, family, committee, guard | M |
| FR-AU-03 | Login throttling (5 failures per 15 minutes per key) and equalised timing for unknown emails | M |
| FR-AU-04 | Committee-editable permission matrix for owner/tenant/family (9 permissions) | S (extra) |
| FR-AU-05 | Feature flags (emergency, gate, contacts, notices, parking) switchable by the committee | C (extra) |
| FR-AU-06 | Guards restricted by a strict allow-list (gate verify, gate log, gate overview, pulse, notifications, own profile) | M (extra) |
| FR-AU-07 | Password reset by committee signs the user out everywhere | S |
| FR-AU-08 | Google sign-in for existing accounts only (optional, off by default) | C (extra) |

### Epic 3: Work requests
| ID | Requirement | MoSCoW |
| --- | --- | --- |
| FR-WR-01 | Raise a request: category (plumbing, electrical, lift, security, housekeeping, other), title, description, optional photo (JPEG/PNG/WebP, 5 MB, signature checked) | M |
| FR-WR-02 | Committee assigns a vendor and moves the request forward-only: open, assigned, in_progress, closed; vendor required to progress | M |
| FR-WR-03 | Status history and timestamps come from the audit trail; comments on a request | M |
| FR-WR-04 | Residents see own requests and requests from their own flat; committee sees all | M |
| FR-WR-05 | Requester rates a closed request once, 1-5; family never rates, the flat owner rates for them | S |
| FR-WR-06 | Vendor directory (name, trade, phone), create/edit/delete | C |
| FR-WR-07 | WhatsApp intake: a message to the society number becomes a request; flat is identified by the sender's registered phone number; unknown numbers get a reply asking them to register **(in progress)** | S |
| FR-WR-08 | AI triage on every new request: category, priority, one-line summary and suggested vendor from an LLM with rule-based fallback; PII stripped before any model call; result stored as a suggestion **(in progress)** | S |
| FR-WR-09 | AI only suggests: a committee member confirms the vendor assignment; the confirmation is audited **(in progress)** | M (for AI features) |
| FR-WR-10 | SLA timer of 48 hours; overdue open requests are escalated automatically to the committee (notification, audited) **(in progress)** | C |
| FR-WR-11 | Status replies are sent back to the requester on WhatsApp for WhatsApp-originated requests **(in progress)** | S |
| FR-WR-13 | Telegram intake: a resident links their Telegram by sharing their contact (matched to the registered phone), then messages become requests through the same gate; status replies and emergency guidance in the chat | S (extra) |
| FR-WR-14 | Free LLM gate: the request-or-chatter decision can run on an n8n workflow using n8n's free model credits (`CLASSIFY_WEBHOOK_URL`); rules are used when it is unavailable | S (extra) |
| FR-WR-15 | AI suggested action on a request (assign the matching vendor, or register a vehicle from the message) that the committee approves or dismisses with one click; audited | S (extra) |
| FR-WR-16 | Committee email desk: when no committee member has the dashboard open, each new request is emailed with the stage tracker and the next step as the main button (assign, then approve start, then approve done); every stage change made from email sends the next step; each button opens a confirm page and runs the same action as the dashboard (audit and resident notification included). Links are signed and expire after 7 days; opening a link never changes anything | S (extra) |
| FR-WR-12 | Message gate for public WhatsApp groups: a classifier (rules by default, Claude when a key is set, personal details stripped) decides request / question / chatter. Chatter is ignored without a reply; unsure messages go to a committee **Needs review** queue (create request or dismiss); unknown senders in a group get no reply; confirmations go privately to the sender | M |

### Epic 4: Notifications
| ID | Requirement | MoSCoW |
| --- | --- | --- |
| FR-NO-01 | In-app notification for each status change, assignment, approval, rating | S |
| FR-NO-02 | Committee posts and deletes notices; approved residents are alerted and can read them | S |
| FR-NO-03 | Live updates: clients poll `/api/pulse` and redraw only on change | S (extra) |
| FR-NO-04 | AI notice drafter: committee gives bullet points, model proposes a headline and body; the committee edits and sends; nothing is posted automatically **(in progress)** | C |
| FR-NO-05 | Weekly AI digest of pending requests for the committee **(in progress)** | C |
| FR-NO-06 | Emergency alerts raised by residents and resolved by the committee; society contacts directory | C (extra) |
| FR-NO-07 | Emergency words in a Telegram or WhatsApp message (fire, help please, accident...) create a real emergency on the dashboard and alert the committee; emergencies are always emailed, even when the dashboard is open | S (extra) |
| FR-NO-08 | New registrations, household additions and messages waiting for review are emailed to the committee with Approve / Reject (or Create request / Dismiss) buttons when no committee member has the dashboard open | S (extra) |

### Epic 5: Admin dashboard
| ID | Requirement | MoSCoW |
| --- | --- | --- |
| FR-AD-01 | Dashboard: open by category, by status, 48h SLA, unassigned, awaiting rating, weekly volume, vendor ratings, oldest open | S |
| FR-AD-02 | Estate overview (`/api/admin/overview`): residents, gate, parking, vehicles, workers at a glance | S (extra) |
| FR-AD-03 | Audit trail of every state change (who, what, when), latest 200 shown | M |
| FR-AD-04 | CSV export of requests | C |
| FR-AD-05 | Gate passes (QR plus 6-digit code), resident gate token, guard verify and gate log; vehicles, parking slots, workers register | C (extra; visitor management is out of scope on slide 8, built here as resident-created passes only) |

### Epic 6: Non-functional
See section 5 (NFR-01 to NFR-12).

## 4. AI-native workflows
```
Telegram or WhatsApp message -> webhook -> AI gate (request / unsure / chatter) -> request created
   -> AI triage (ai.js: PII stripped, LLM or rule-based fallback)
   -> suggestion shown to committee (dashboard, or email when nobody is on the dashboard)
   -> committee assigns, approves start, approves done (each from the dashboard or an email button)
   -> status replies in the resident's chat -> resolved -> rating
SLA timer (48h) -> auto escalation to committee
Weekly digest -> committee;  Notice drafter -> committee edits and sends
```
Principle: AI suggests, a human committee member confirms assignments and sends notices.

## 5. Non-functional requirements
| ID | Area | Requirement |
| --- | --- | --- |
| NFR-01 | Security | Hashed passwords, role check on every route, parameterised SQL, escaped output, strict CSP (self only), CSRF origin check, secure headers, no secrets in the repo |
| NFR-02 | Privacy / DPDP | Consent recorded with timestamp (`consent_at`); collect minimum data; synthetic data only in development and tests; see `docs/privacy-and-consent.md` |
| NFR-03 | Transport | HTTPS in production (TLS terminated in front; cookie `Secure`, HSTS) |
| NFR-04 | Availability | Health endpoint `/healthz` (Node) and Actuator health (Java); container healthchecks; backups of PostgreSQL via `pg_dump`. No numeric uptime target has been agreed or measured |
| NFR-05 | Accessibility | Keyboard-usable forms, labelled inputs, readable contrast; not yet audited against WCAG |
| NFR-06 | Usability | Works on desktop and phone; installable PWA and Android wrapper |
| NFR-07 | Maintainability | Automated tests per story (node:test, JUnit, Vitest); one frozen API contract shared by both stacks |
| NFR-08 | Portability | Node and SQLite for the MVP; Java, React and PostgreSQL side by side (ADR 0001) |
| NFR-09 | AI safety | Names, phones, emails and flat numbers are never sent to an LLM; AI output is a suggestion, never an action; rule-based fallback when the model is unavailable; every AI suggestion and human confirmation is audited |
| NFR-10 | Auditability | Every state change writes `audit` |
| NFR-11 | Rate limiting | Login throttling; webhooks check a shared secret (WhatsApp, Telegram); the WhatsApp provider signature check and webhook rate limiting are **(in progress)** |
| NFR-13 | Email actions | Email buttons carry an HMAC-signed, 7-day token for one item; a GET only shows a confirm page (safe for mail scanners); the action runs the existing API route as the committee admin over loopback with an in-process key, so the same validation, audit and notifications apply; the n8n webhook path is a secret |
| NFR-14 | Hosting | The Render free plan wipes the SQLite database on sleep and redeploy; test accounts and the Telegram tester are re-seeded from environment variables at start. A paid disk or hosted database is needed for real data |
| NFR-12 | Performance | No load target set or measured |

## 6. Assumptions
- The partner society gives written permission before any testing with residents.
- Residents have a Telegram or WhatsApp-capable phone; their registered phone number is the identity for message intake.
- WhatsApp Business could not be connected (Meta restricts new business portfolios), so Telegram is the live channel. No paid LLM key is needed: the free n8n model credits or the rules are used.
- The committee has a Gmail account connected to n8n for the email desk.
- The committee, not the software, owns every decision that costs money or goes to all residents.

## 7. Out of scope
Online payments, general visitor management beyond resident-created gate passes, IoT and biometrics (slide 8). Also: amenity booking, polls, automatic vendor dispatch, AI taking any action without human confirmation.
