# Architecture

Decision record: [ADR 0001, move to Java (Spring Boot) and React side by side](adr-0001-java-react.md). The API contract is frozen: both backends expose the same URLs and JSON, and `public/api.js` documents it. Parts marked **planned** are being built and are not yet in the repository's verified state.

## 1. System context
```mermaid
flowchart LR
  owner([Owner]) --> portal
  tenant([Tenant]) --> portal
  family([Family member]) --> portal
  committee([Committee admin]) --> portal
  guard([Guard]) --> portal
  waRes([WhatsApp-only resident]) -->|message| wa[WhatsApp provider]
  wa -->|webhook, planned| portal[Sahyadri Heights portal]
  portal -->|status replies, planned| wa
  portal -->|PII-stripped text, planned| llm[LLM API]
  portal --> google[Google sign-in, optional]
```

## 2. Containers and components
```mermaid
flowchart TB
  subgraph Clients
    web[Web app - public/ vanilla JS]
    pwa[Mobile PWA - public/m]
    react[React app - frontend/]
    droid[Android app - Capacitor, mobile/]
  end
  subgraph Node["Node API (default, port 3000)"]
    app[app.js routes and rules]
    ai[ai.js triage, drafter, digest - planned]
    hook["/api/whatsapp/webhook - planned"]
    sched[Scheduler: SLA 48h and weekly digest - planned]
  end
  subgraph Java["Java API (Spring Boot, port 8080)"]
    jb[backend/ controllers, services, JPA]
  end
  sqlite[(SQLite portal.db)]
  pg[(PostgreSQL 16)]
  files[(uploads/ photos)]
  wa[WhatsApp provider]
  llm[LLM API]
  web --> app
  pwa --> app
  react --> app
  react --> jb
  droid --> pwa
  app --> sqlite
  app --> files
  jb --> pg
  wa --> hook --> app
  app --> ai
  ai -->|PII stripped| llm
  ai -->|fallback| rules[Rule-based classifier]
  sched --> app
  app -->|notifications table, WhatsApp replies planned| wa
```
Notifications today are rows in `notifications` read by polling (`/api/pulse`, `/api/notifications`).

## 3. Data model (from `db.js`)
```mermaid
erDiagram
  users ||--o{ requests : raises
  users ||--o{ comments : writes
  users ||--o| leases : has
  users ||--o{ notifications : receives
  users ||--o{ emergencies : raises
  users ||--o{ gate_passes : creates
  users ||--o| resident_tokens : owns
  users ||--o{ vehicles : registers
  vendors ||--o{ requests : assigned_to
  requests ||--o{ comments : has
  vehicles ||--o| parking_slots : parked_in
  users {
    int id PK
    text name
    text email UK
    text phone
    text flat
    text resident_type
    text password_hash
    text role
    text status
    text consent_at
    text created_at
  }
  vendors {
    int id PK
    text name
    text trade
    text phone
  }
  requests {
    int id PK
    int user_id FK
    text category
    text title
    text description
    text photo
    text status
    int vendor_id FK
    int rating
    text rating_comment
    text created_at
    text updated_at
  }
  comments {
    int id PK
    int request_id FK
    int user_id FK
    text body
    text created_at
  }
  leases {
    int user_id PK
    text start_date
    text end_date
    text owner_name
    text owner_phone
    text police_verified_on
    text agreement
    text parking
  }
  notifications {
    int id PK
    int user_id
    text message
    int is_read
    text created_at
  }
  audit {
    int id PK
    int actor_id
    text entity
    int entity_id
    text action
    text detail
    text created_at
  }
  notices {
    int id PK
    text title
    text body
    int author_id
    text created_at
  }
  emergencies {
    int id PK
    int user_id FK
    text type
    text note
    text status
    text created_at
    text resolved_at
    int resolved_by
  }
  contacts {
    int id PK
    text name
    text role
    text phone
    text icon
  }
  gate_passes {
    int id PK
    text flat
    int created_by FK
    text visitor_name
    text purpose
    text token UK
    text code
    text valid_from
    text valid_until
    text status
    text created_at
    text used_at
    int used_by
  }
  resident_tokens {
    int user_id PK
    text token UK
    text created_at
  }
  gate_log {
    int id PK
    text kind
    text subject
    text flat
    text result
    text reason
    int guard_id
    text created_at
  }
  vehicles {
    int id PK
    text flat
    int user_id
    text plate
    text plate_key UK
    text type
    text make
    text color
    text sticker
    text created_at
  }
  parking_slots {
    int id PK
    text code UK
    text level
    text kind
    text flat
    int vehicle_id
    text created_at
  }
  workers {
    int id PK
    text name
    text role
    text phone
    text shift
    text status
    text notes
    text created_at
  }
  settings {
    text key PK
    text value
  }
  role_permissions {
    text role PK
    text permission PK
    int allowed
  }
```
Planned additions for AI (not in `db.js` yet): a source column on requests (portal or WhatsApp), AI suggestion fields (priority, summary, suggested vendor), a WhatsApp message log. Foreign-key links shown for audit, notices and gate_log are logical (columns exist, no declared FK).

## 4. Access control
Roles: `admin` (committee), `resident` with `resident_type` owner, tenant or family, and `guard`. The permission matrix applies to the three resident types and is editable by the committee (`/api/admin/access`). Defaults come from `db.js`: owner has all nine, tenant lacks `household.manage`, family lacks `household.manage`, `lease.view`, `vehicle.manage`. Committee has all permissions; guards use an allow-list.

| Permission | Owner | Tenant | Family | Committee | Guard |
| --- | --- | --- | --- | --- | --- |
| request.create | yes | yes | yes | yes | no |
| emergency.raise | yes | yes | yes | yes | no |
| gate.pass | yes | yes | yes | yes | no |
| household.manage | yes | no | no | yes | no |
| notice.read | yes | yes | yes | yes | no |
| contacts.read | yes | yes | yes | yes | no |
| lease.view | yes | yes | no | yes | no |
| vehicle.manage | yes | yes | no | yes | no |
| parking.view | yes | yes | yes | yes | no |

```mermaid
flowchart LR
  req[API request] --> auth{Signed in, approved, password fingerprint matches?}
  auth -- no --> r401[401]
  auth -- yes --> g{Guard?}
  g -- yes --> al{On allow-list: me, password, gate verify/log/overview, pulse, notifications?}
  al -- no --> r403[403]
  al -- yes --> ok[Handler]
  g -- no --> adm{Admin-only route?}
  adm -- yes --> isadm{role is admin?}
  isadm -- no --> r403
  isadm -- yes --> ok
  adm -- no --> feat{Feature flag on? admin bypasses}
  feat -- no --> r403
  feat -- yes --> perm{Permission allowed for resident_type?}
  perm -- no --> r403
  perm -- yes --> ok
```
Feature flags: emergency, gate, contacts, notices, parking. Admin-only examples: assign and status of requests, vendors, notices post, leases, users, settings, audit, export, guards, workers, parking edits.

## 5. Request lifecycle
```mermaid
stateDiagram-v2
  [*] --> open: resident or WhatsApp creates request
  open --> assigned: committee assigns vendor (AI suggestion confirmed by human)
  assigned --> in_progress: committee updates
  in_progress --> closed: committee closes
  closed --> closed: rated once by requester or owner
  closed --> [*]
```
Forward-only; a vendor is required to progress; a closed request cannot be re-moved. In the UI, closed and unrated shows as "Resolved, awaiting rating". Skipping straight from open to closed is blocked by the vendor rule. Overdue (older than 48h, not closed) requests are flagged in stats today; automatic escalation is planned.

## 6. Deployment
```mermaid
flowchart LR
  user([Browser or Android app]) -->|HTTPS 443| tls[TLS terminator / reverse proxy, to be set up]
  tls -->|HTTP, X-Forwarded-Proto| nginx
  subgraph compose["docker compose (not yet run)"]
    nginx[frontend: nginx serves React SPA, proxies /api] --> backend[backend: Spring Boot, prod profile, not published]
    backend --> postgres[(postgres:16, volume pgdata)]
  end
```
`docker-compose.yml`, both Dockerfiles, `.github/workflows/ci.yml` and `docs/deploy.md` exist but have never been run on a machine with Docker, and CI has not executed. Today the verified way to run is `npm start` (Node on SQLite) or `./gradlew bootRun`.

## 7. Design note
**Why a Node MVP first.** The brief rewards a working product early. Node with Express and `node:sqlite` has no build step or native dependency, so the five core requirements and their tests existed in the first session. Every rule (role checks, forward-only lifecycle, audit on each change) was captured as an executable test.

**Why then Java and React.** A society portal is long-lived and handed between people; Spring Boot and React are mainstream, widely staffed and have mature tooling (ADR 0001). The strangler approach reused the Node tests as the behavioural spec, and the Java suite (68 tests) and React suite (59 tests) prove parity phase by phase. The Node app stays the system of record until cutover.

**Why hosted PostgreSQL.** SQLite is a single file on one server: fine for a demo, weak for backups, concurrent writers and managed failover. A hosted PostgreSQL gives backups, point-in-time recovery and TLS connections. `scripts/export-sqlite-to-postgres.js` moves existing data. This is the target, not yet the running state.

**How AI is bounded (planned).** (1) AI code lives in one module (`ai.js`), called only from the request-creation path, the scheduler and the notice drafter. (2) PII (names, phones, emails, flat numbers) is stripped before any model call, so the model sees only the problem text. (3) Output is validated against a fixed category list and priority scale; invalid output falls back to a rule-based classifier, so the portal works with the model off. (4) AI writes suggestions, never state: assignments and notices need a committee member's click, and both the suggestion and the confirmation are audited. (5) The WhatsApp webhook verifies the provider signature and is rate limited.
