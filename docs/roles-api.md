# Roles from the faculty review: API contract (Node)

Contract for the six review roles (2026-11-21, [user-stories.md](user-stories.md)), implemented in `roles.js`. Node only; not ported to Java or React. Society modules are in [modules-api.md](modules-api.md).

## Roles and positions
`users.role`: `resident` | `admin` (committee) | `guard` | `staff` | `it`.
Committee accounts (`role='admin'`) carry `users.position`:

| position | Shown as | Extra rights over a committee member |
| --- | --- | --- |
| `member` | Committee member | none |
| `head` | Head of committee | approve costs over the limit; settings, feature flags, access rules, staff accounts |
| `sysadmin` (or empty, for older accounts) | Admin | settings, feature flags, access rules, staff accounts, channels, IT tools |

"Governance" = head or sysadmin. Cost approval = head; if no head account exists, a sysadmin approves.
`GET /api/me` and login also return `position`. Staff and IT have no flat and a strict route allow-list, like guards: all three may use `/api/me`, password change, notifications, `/api/pulse`, help guides and support; staff add `/api/staff/*`, their assigned requests, inventory and waste logs/schedule; IT adds `/api/it/*`.

## Accounts (governance only)
- `GET /api/admin/accounts` -> `[{id,name,email,role,position,status,created_at,on_shift}]`, every non-resident account that is not removed (`on_shift` for staff only).
- `POST /api/admin/accounts {name,email,password,kind}` kind = `member|head|sysadmin|staff|it|guard` -> 201 `{id}`.
- `PATCH /api/admin/accounts/:id {position?, status?}`: position for committee accounts only; status `approved|suspended`. You cannot suspend or demote yourself, and the last governance account cannot be suspended or demoted (409).
- `DELETE /api/admin/accounts/:id` -> status `removed` (same rules; a staff member's open shift is closed).
- Member committee accounts get 403 `{error:'Only the head of committee or the admin can do this'}` on: `PUT /api/admin/settings`, `PUT /api/admin/access`, accounts routes, guards create/delete, `POST /api/admin/telegram/set-webhook`.

## Staff and allocation
- `GET /api/admin/staff` (committee) -> `[{id,name,email,status,on_shift,open_jobs}]` approved staff.
- `POST /api/requests/:id/assign` accepts `{vendor_id}` (as before) **or** `{staff_id}`. Assigning staff sets `assignee_id` and clears `accepted_at`.
- Requests now include `assignee_id`, `assignee_name`, `accepted_at`, `work_done_at`, `est_cost`, `cost_status` (`null|approved|pending|rejected`), `cost_note`, `reopen_count`, `closed_at`.
- `POST /api/requests/:id/status` needs a vendor **or** a staff assignee (`Assign a vendor or staff member first`), and is blocked (409 `Waiting for the head of committee to approve the cost`) while `cost_status` is `pending` or `rejected` when moving to `in_progress` or `closed`.
- Staff see only requests assigned to them (`GET /api/requests`, `/api/requests/:id`, comments, photo).

## Staff self-service (role staff)
- `GET /api/staff/jobs` -> `{open:[request...], recent:[closed in last 7 days]}`.
- `POST /api/staff/jobs/:id/accept` -> takes up the job: `assigned -> in_progress`, or only sets `accepted_at` while the cost is pending or rejected. Resident and committee notified.
- `POST /api/staff/jobs/:id/update` (JSON, or multipart with optional `photo`) `{progress: started|waiting_parts|done, note}` -> 201. Saved as a job update and as a comment the resident sees. `started` moves `assigned -> in_progress` (if the cost allows); `done` sets `work_done_at` and asks the committee to confirm and close.
- `GET /api/requests/:id/updates` -> `[{id,progress,note,has_photo,author,created_at}]` (anyone who can see the request). `GET /api/requests/:id/updates/:uid/photo`.
- `POST /api/requests/:id/estimate {amount, note}` (committee or the assigned staff) -> `{ok, cost_status, approval_limit}`. Above the limit: `pending`, and the head (or sysadmin if no head) is notified; otherwise `approved`.
- `GET /api/staff/shift` -> `{current: shift|null, recent:[shift], colleagues:[{id,name,on_shift}]}`.
- `POST /api/staff/punch-in` -> 201 shift (409 if already on shift).
- `POST /api/staff/punch-out {handover_to?, note?}` -> closes the shift; with `handover_to` (another approved staff id) every open job of mine moves to them (audited, both notified, committee notified).
- `GET /api/admin/attendance?days=7` (committee) -> `[{id,user_id,name,punch_in,punch_out,hours,handover_to_name,handover_note}]`.

## Head of committee
- `GET /api/admin/approvals` (committee) -> `{can_decide, approval_limit, pending:[request...]}` (requests with `cost_status='pending'`).
- `POST /api/requests/:id/cost-decision {decision: approve|reject, note}` (head; sysadmin only when no head exists) -> audited; the assignee and the other committee members are notified. 409 if no cost is pending.
- Setting `approval_limit` (rupees, default 10000) in `GET/PUT /api/admin/settings`.

## Reports (committee)
- `GET /api/admin/reports/monthly?month=YYYY-MM` (default this month) -> `{month, raised, closed, open_now, reopened, escalated, emergencies, new_residents, notices, avg_rating, avg_hours_to_assign, avg_hours_to_close, by_category:[{category,raised,closed}], by_assignee:[{name,kind,closed,avg_rating}], committee:[{id,name,position,actions,assigned,status_changes,approvals}]}`.

## Resident: reopen
- `POST /api/requests/:id/reopen {reason}` (reason required) -> the requester or the flat owner, within 7 days of closing (`REOPEN_DAYS`). Status goes back to `assigned` (vendor or staff set) or `open`; rating cleared; `reopen_count+1`; committee and assignee notified. Request detail includes `can_reopen`.

## IT staff (role it; sysadmin also allowed)
- `POST /api/support {subject, body, kind: bug|question|access|other}` any signed-in user (also guard, staff) -> 201 `{id}`; IT accounts notified.
- `GET /api/support?status=` -> own tickets; IT and sysadmin see all. Each: `{id,subject,kind,status,user_name,user_role,created_at,updated_at,replies:n}`.
- `GET /api/support/:id` -> ticket with `body` and `replies:[{author,role,body,created_at}]`.
- `POST /api/support/:id/reply {body, status?}` requester or IT; IT may set status `open|in_progress|resolved`.
- `GET /api/help/guides` -> `[{id,title,roles,steps:[..]}]` filtered to the caller's role (IT and sysadmin see all).
- `GET /api/it/health` -> `{ok,uptime_s,node,db_bytes,memory_mb,version,commit,integrity,counts:{users,requests,open_requests,open_tickets,audit_rows,staff_on_shift},tickets:{open,in_progress,resolved_30d},last_backup,system_events:[{action,detail,created_at,actor}],guides,maintenance,hosting_note}`.
- `GET /api/it/backup` -> downloads a consistent copy of the database (`portal-backup-<date>.db`), audited.
- `PUT /api/it/maintenance {message, until?}` (empty message clears) -> shown to everyone as `maintenance` in `GET /api/settings`; everyone is notified.

## Broadcast
Posting a notice also sends it to residents who linked Telegram (`POST /api/notices` response adds `telegram_sent`).
