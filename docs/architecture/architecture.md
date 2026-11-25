# Architecture

Related: [product and technology architecture](product-and-technology-architecture.md) (modules, tech per tier), [ADR 0001](adr-0001-java-react.md) (Java + React migration), [deploy.md](../deploy.md), API contracts in [roles-api.md](../roles-api.md), [modules-api.md](../modules-api.md) and `public/api.js`.

The Node app is the system of record and the live deployment. The Java + React stack uses the same API contract but is not cut over.

## 1. System context
```mermaid
flowchart LR
  users([Residents, committee, staff, IT, guards]) --> portal[Sahyadri Heights portal]
  msg([Messaging-only resident]) -->|message| tg[Telegram Bot API]
  msg -.->|not connected| wa[WhatsApp provider]
  tg -->|webhook| portal
  wa -.->|webhook| portal
  portal -->|status replies| tg
  portal -->|PII-stripped text| n8n[n8n cloud: LLM gate, email desk]
  n8n --> llm[LLM gpt-4o-mini]
  n8n -->|Gmail| inbox([Committee inbox])
  inbox -->|signed action links| portal
  portal -.->|optional| google[Google sign-in]
```

## 2. Containers and components
```mermaid
flowchart TB
  subgraph Clients
    web[Web app - public/]
    pwa[Mobile PWA - public/m/]
    cap[Android app - Capacitor, mobile/]
    flut[Flutter app - flutter_app/]
    react[React app - frontend/]
  end
  subgraph Node["Node API, port 3000 (default, live)"]
    app[app.js: auth, requests, gate, notices, settings]
    roles[roles.js: accounts, staff, cost approval, reports, IT]
    mods[modules.js: amenities, dues, inventory, waste]
    ai[ai.js: gate, triage, drafter, digest]
    desk[email-desk.js: emails, /desk/:token]
    sched[Scheduler: 48 h SLA escalation]
  end
  subgraph Java["Java API, port 8080 (target, not cut over)"]
    jb[backend/: Spring Boot, JPA, Flyway]
  end
  sqlite[(SQLite portal.db)]
  files[(uploads/)]
  pg[(PostgreSQL 16)]
  web --> app
  pwa --> app
  cap --> pwa
  flut --> app
  react --> app
  react --> jb
  app --> roles
  app --> mods
  app --> ai
  app --> desk
  sched --> app
  app --> sqlite
  app --> files
  jb --> pg
  tg[Telegram webhook] --> app
  ai -->|PII stripped| n8n[n8n LLM gate]
  ai -->|fallback| rules[Rule-based classifier]
  desk --> n8nmail[n8n email desk + Gmail]
```
In-app notifications are rows in `notifications`, read by polling (`/api/pulse`, `/api/notifications`).

## 3. Data model (`db.js`)

| Area | Tables |
| --- | --- |
| People and access | `users` (role, position, resident_type, flat, telegram_id), `leases`, `role_permissions`, `settings` |
| Requests | `requests` (status, vendor_id or assignee_id, cost fields, AI suggestion fields, source), `comments`, `job_updates`, `vendors` |
| Staff and IT | `staff_shifts`, `support_tickets`, `support_replies` |
| Communication | `notices`, `notifications`, `emergencies`, `contacts`, `whatsapp_messages` (both chat channels) |
| Gate and parking | `gate_passes`, `resident_tokens`, `gate_log`, `vehicles`, `parking_slots`, `workers` |
| Society modules | `amenities`, `amenity_bookings`, `dues`, `due_payments`, `inventory_items`, `inventory_moves`, `waste_schedule`, `waste_logs` |
| Trail | `audit` (every state change) |

```mermaid
erDiagram
  users ||--o{ requests : raises
  users ||--o{ requests : "assigned (staff)"
  vendors ||--o{ requests : "assigned (vendor)"
  requests ||--o{ comments : has
  requests ||--o{ job_updates : has
  users ||--o| leases : has
  users ||--o{ notifications : receives
  users ||--o{ emergencies : raises
  users ||--o{ gate_passes : creates
  users ||--o| resident_tokens : owns
  users ||--o{ vehicles : registers
  vehicles ||--o| parking_slots : parked_in
  users ||--o{ staff_shifts : works
  users ||--o{ support_tickets : opens
  support_tickets ||--o{ support_replies : has
  amenities ||--o{ amenity_bookings : has
  users ||--o{ amenity_bookings : books
  dues ||--o{ due_payments : has
  inventory_items ||--o{ inventory_moves : has
  requests |o--o{ inventory_moves : uses
  users ||--o{ waste_logs : logs
```
Unique rules: one active booking per amenity, date and start; one bill per flat, period and title. The email desk has no table: links are signed tokens and sends are written to `audit`.

## 4. Request lifecycle
```mermaid
stateDiagram-v2
  [*] --> open: resident, Telegram or missed-pickup report
  open --> assigned: committee assigns a vendor or staff
  assigned --> in_progress: committee, or staff takes up the job
  in_progress --> closed: committee confirms done
  closed --> assigned: reopened within 7 days (assignee set)
  closed --> open: reopened within 7 days (no assignee)
  closed --> [*]: rated once
```
- Forward-only; an assignee is required to progress.
- A cost estimate above `approval_limit` (default Rs 10,000) blocks `in_progress` and `closed` until the head of committee approves.
- Older than 48 h and not closed: escalated once (checked every 10 minutes), notified and audited.
- Stage changes can also be made from the email desk; they replay the same API route.
- In the UI a closed, unrated request shows as "Resolved, awaiting rating".

## 5. Security
- Session cookie bound to the password hash; login rate limits; Google sign-in only for existing accounts.
- Role check on every route. Guards, staff and IT have strict route allow-lists in `auth`.
- Governance routes (settings, access rules, accounts, guards, Telegram webhook) need the head of committee or sysadmin.
- Resident rights come from the editable permission matrix (owner, tenant, family) plus feature flags (emergency, gate, contacts, notices, parking).
- Parameterised SQL only; all UI output escaped; strict CSP (`'self'`); cross-origin POST rejected.
- Every state change writes `audit`.
- Webhooks and email links: shared secret for webhooks; HMAC-signed email links that expire in 7 days, and a GET never changes state.

## 6. AI flow
```mermaid
flowchart LR
  in[Message or new request] --> pii[Strip PII: names, phones, emails, flats]
  pii --> gate{Request or chatter?}
  gate -->|n8n LLM, else rules| tri[Triage: category, priority, summary, vendor]
  tri -->|ANTHROPIC_API_KEY set: LLM, else rules| val[Validate against fixed lists]
  val --> sug[Suggestion saved on the request and audited]
  sug --> human{Committee approves?}
  human -->|one click| act[Assign or send, audited]
  human -->|no| keep[Nothing changes]
```
AI lives in `ai.js` and only suggests. Invalid model output falls back to rules, so the portal works with no model. The notice drafter and weekly digest follow the same rule: a person sends.
