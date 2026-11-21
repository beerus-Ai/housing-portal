# User Stories by Role: Sahyadri Heights Housing Society Portal

Source: the faculty review of 21 November 2026 (whiteboard). It asked for the requirements to be restated as user stories in the form **As a <Role>, I want <Requirement>, so that <Why>**, grouped by six roles and organised around a process list. This document does that. The detailed functional requirements (FR-* IDs) stay in `requirements.md`; each story points to them.

Status key: **Built** = in the live portal and tested. **Partly** = some of it is built; the gap is stated. **New** = asked for in the review, not built yet.

## 1. Roles
The review listed six roles. The table maps them to the roles the portal has today.

| # | Role (review) | Role in the portal today | Change needed |
| --- | --- | --- | --- |
| 1 | Resident | Owner, Tenant, Family member (three sub-types of resident) | None. Keep the three sub-types under one "Resident" heading |
| 2 | Committee Member | Committee | None |
| 3 | Head of Committee | Committee (no separate role) | New role: a committee member with final approval and access-rule rights |
| 4 | Staff | Guard has a login. Workers and vendors are records only and cannot sign in | New: a staff login so staff take up and update their own assigned work |
| 5 | Admin | Committee acts as admin (accounts, access rules, feature flags, settings) | Split system administration from committee work |
| 6 | IT Staff | None | New: support queue, training material, upgrades and maintenance |

## 2. Process list
The review set out three processes. Process 3 is the lifecycle of a resident request in four steps.

| # | Process | Main roles | Portal today |
| --- | --- | --- | --- |
| 1 | User onboarding and verification | Resident, Committee Member, Admin | Built (register, consent, committee approval) |
| 2 | Raise a request | Resident | Built (portal, phone app, Telegram) |
| 3 | Lifecycle of a resident request | All | Built except staff self-service |
| 3.1 | Request allocation | Committee Member, Head of Committee | Built (AI suggests a vendor, a committee member assigns) |
| 3.2 | Track | Resident, Committee Member | Built (stage tracker Open > Assigned > In progress > Resolved, replies in chat, email) |
| 3.3 | Execution | Staff | Partly (the committee moves the stages; staff cannot update their own work) |
| 3.4 | Feedback | Resident | Built (1-5 rating after closure) |

## 3. User stories

### 3.1 Resident
| ID | As a Resident, I want... | so that... | Process | Source | Status |
| --- | --- | --- | --- | --- | --- |
| US-RES-01 | to register with my flat, phone and consent | the committee can verify that I live in the society | 1 | FR-ON-01 | Built |
| US-RES-02 | to know whether my account is approved, and why I cannot sign in if it is not | I am not left waiting without an answer | 1 | FR-ON-02 | Built |
| US-RES-03 | as an owner, to add my family members and tenants to my flat | they can use the portal without the committee typing their details | 1 | FR-ON-04 | Built |
| US-RES-04 | to raise a request with a category, a description and a photo | the committee understands the problem first time | 2 | FR-WR-01 | Built |
| US-RES-05 | to report a problem by sending a Telegram message | I do not have to open the portal | 2 | FR-WR-13 | Built (WhatsApp blocked by Meta, see assumptions) |
| US-RES-06 | to see the stage of my request and who is assigned | I do not have to phone the committee to ask | 3.2 | FR-WR-02, FR-WR-03, FR-WR-11 | Built |
| US-RES-07 | to be told when my request changes stage | I know when to expect the work | 3.2 | FR-NO-01 | Built |
| US-RES-08 | to rate the work once it is closed | the committee knows which vendors and staff do good work | 3.4 | FR-WR-05 | Built |
| US-RES-09 | to raise an emergency (fire, medical, lift) with one action or one message | help comes at once | 2 | FR-NO-06, FR-NO-07 | Built |
| US-RES-10 | to read the society's notices | I do not miss announcements | - | FR-NO-02 | Built |
| US-RES-11 | to reopen a request if the problem comes back within a set number of days | I do not have to raise it again from the start | 3.4 | - | New |

### 3.2 Committee Member
| ID | As a Committee Member, I want... | so that... | Process | Source | Status |
| --- | --- | --- | --- | --- | --- |
| US-COM-01 | a dashboard of what needs my attention (approvals, unassigned, overdue, emergencies, messages) | I act on the most urgent work first | 3 | FR-AD-01 | Built |
| US-COM-02 | to verify and approve or reject new residents | only real residents get access | 1 | FR-ON-02, FR-ON-03 | Built |
| US-COM-03 | the system to suggest the right vendor or staff member for each request | allocation is quick and consistent | 3.1 | FR-WR-08, FR-WR-15 | Built (suggestion only; a person confirms) |
| US-COM-04 | to assign a request to a vendor or a staff member | someone is clearly accountable for it | 3.1 | FR-WR-02 | Partly (vendors only; staff cannot be assigned yet) |
| US-COM-05 | to move a request through its stages from the dashboard or from an email | I can act when I am away from the portal | 3.2 | FR-WR-16 | Built |
| US-COM-06 | overdue requests to be escalated to me automatically | nothing waits longer than 48 hours unnoticed | 3.2 | FR-WR-10 | Built |
| US-COM-07 | reports: requests by category, status and age, vendor ratings, weekly volume, and a CSV export | I can report to the society's general body | - | FR-AD-01, FR-AD-04, FR-NO-05 | Partly (dashboard, CSV and weekly digest built; no monthly or printable report) |
| US-COM-08 | to broadcast a notice to all residents, with AI help to draft it | everyone gets the same message at the same time | - | FR-NO-02, FR-NO-04 | Built (in the portal; not pushed to Telegram yet) |
| US-COM-09 | to monitor every change in an audit trail | there is accountability for every decision | - | FR-AD-03 | Built |
| US-COM-10 | to review messages the AI was unsure about | real problems are not missed and chatter is ignored | 2 | FR-WR-12 | Built |

### 3.3 Head of Committee
| ID | As the Head of Committee, I want... | so that... | Process | Source | Status |
| --- | --- | --- | --- | --- | --- |
| US-HOC-01 | a separate role with everything a committee member has | my extra rights are clear | - | - | New |
| US-HOC-02 | to give final approval on requests above a set cost or of a set type | spending is controlled | 3.1 | - | New |
| US-HOC-03 | to see a summary of committee performance (time to assign, time to close, ratings) | I can hold the committee and vendors to account | - | FR-AD-01 | Partly (figures exist on the dashboard, not per committee member) |
| US-HOC-04 | to approve changes to access rules and feature flags | no single member changes who can do what | - | FR-AU-04, FR-AU-05 | Partly (any committee member can change them today) |
| US-HOC-05 | to be told of every emergency and every escalated request | I can step in on serious issues | 3.2 | FR-NO-07, FR-WR-10 | Built (sent to all committee members) |

### 3.4 Staff
Staff are the society's own maintenance staff and guards, and can include vendor technicians.

| ID | As Staff, I want... | so that... | Process | Source | Status |
| --- | --- | --- | --- | --- | --- |
| US-STF-01 | to sign in and see only the work assigned to me | I know what to do today | 3.3 | - | New |
| US-STF-02 | to take up (accept) an assigned job | the committee knows the work has started | 3.3 | - | New |
| US-STF-03 | to update a job with notes, photos and a status (started, waiting for parts, done) | the resident and committee can follow progress | 3.3 | FR-WR-03 | New (only the committee can update today) |
| US-STF-04 | to punch in and out of my shift | attendance is recorded without a paper register | 3.3 | - | New |
| US-STF-05 | to hand over open jobs to the next person (Person A to Person B) at the end of a shift | no work is lost between shifts | 3.3 | - | New |
| US-STF-06 | as a guard, to verify visitor passes and resident tokens at the gate | only expected people enter | - | FR-AD-05, FR-AU-06 | Built |

### 3.5 Admin
| ID | As the Admin, I want... | so that... | Process | Source | Status |
| --- | --- | --- | --- | --- | --- |
| US-ADM-01 | to create, suspend and remove accounts and reset passwords | access stays correct when people move in or out | 1 | FR-AU-07, FR-ON-02 | Built (done by the committee today) |
| US-ADM-02 | to set which role can do what | each role sees only what it needs | - | FR-AU-02, FR-AU-04 | Built |
| US-ADM-03 | to manage master data: flats, vendors, staff, categories, parking | the rest of the system works from correct records | - | FR-WR-06, FR-AD-05 | Partly (vendors, parking, workers built; categories are fixed in code) |
| US-ADM-04 | to switch features on and off | the society adopts features at its own pace | - | FR-AU-05 | Built |
| US-ADM-05 | to configure the message channels (Telegram, WhatsApp, email desk) | residents and committee are reached where they are | - | FR-WR-13, FR-WR-16 | Built |

### 3.6 IT Staff
| ID | As IT Staff, I want... | so that... | Process | Source | Status |
| --- | --- | --- | --- | --- | --- |
| US-IT-01 | a support queue where any user can raise a problem with the portal itself, kept as a backlog | portal problems are tracked separately from building repairs | - | - | New (Jira is used by the build team today) |
| US-IT-02 | short training guides and a demo for each role | new residents, committee members and staff can start without help | - | `demo-script.md` | Partly (demo script only) |
| US-IT-03 | to apply upgrades and maintenance with backups and a health check | the portal stays available and no data is lost | - | NFR-04, NFR-14 | Partly (health check and CI built; free hosting loses data, paid disk needed) |
| US-IT-04 | to see errors and service health | I find problems before users report them | - | NFR-04 | Partly (health endpoint only) |

## 4. Summary of new work from the review
1. Head of Committee role with final approval (US-HOC-01, 02, 04).
2. Staff login: take up, update, punch in/out, hand over (US-STF-01 to 05). Allocation must then allow staff as well as vendors (US-COM-04).
3. Admin separated from committee work (US-ADM-*).
4. IT Staff role with a support backlog, training material and maintenance (US-IT-*).
5. Reports for the general body and per-member performance (US-COM-07, US-HOC-03).
6. Reopen a request after closure (US-RES-11).

## 5. To confirm with faculty
- Top right of the whiteboard: the words read as "Pre-Journey" and "Post-Journey" with a mapping between them. If this means as-is and to-be journey maps per role, they can be added next to the BPMN flows in `process-flows/`.
- Staff item 3 reads "Punch in / Handover?". Stories US-STF-04 and US-STF-05 take it as shift attendance and shift handover.
- Committee item 5 is unclear (possibly "Monitor"); US-COM-09 takes it as monitoring through the audit trail.
- Whether Staff includes outside vendors who would need a login, or only the society's own staff.
