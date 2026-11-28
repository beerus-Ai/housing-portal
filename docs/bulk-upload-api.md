# Bulk upload API

Contract for 2026-11-28, implemented in `bulk.js` (Node only for now).
- The committee uploads a CSV to add many records at once.
- A dry run checks every row and writes nothing.
- The import then replays the normal API route for each valid row, as the uploading committee member. It uses the email desk's loopback replay, `email-desk.js` `replay()`. So every row gets the same validation, audit record and notifications as a single entry made by hand.
- Each upload also writes one summary audit row (`bulk_upload`).
- At most 500 rows per upload; the web page refuses files over 2 MB.

| Type | Columns (required in bold) | Route replayed | Who |
|---|---|---|---|
| `residents` | **name, email, flat, resident_type** (owner, tenant or family), phone, password | `POST /api/admin/residents` | committee |
| `accounts` | **name, email, kind** (member, head, sysadmin, maintenance, cleaner, it, guard, shop, laundry), password | `POST /api/admin/accounts` | head of committee or admin |
| `vendors` | **name, trade**, phone | `POST /api/vendors` | committee |
| `inventory` | **name, category** (the inventory categories), quantity, unit, min_qty, location | `POST /api/inventory` | committee |

| Route | Who | Request | Response |
|---|---|---|---|
| `GET /api/admin/bulk/templates` | committee | | `{type: {label, columns, required, example, help, needs_head}}` |
| `POST /api/admin/bulk/:type` | committee (`accounts`: head or admin) | `{rows: [{column: value}], dry_run}` | Dry run: `{type, total, valid, rows: [{row, ok, error?}]}`. Import: `{type, total, imported, failed, rows: [{row, ok, id?, error?, name?, email?, password?}]}`. `row` is the line in the file, where the header is row 1. 400 for no rows or more than 500; 404 for an unknown type; 403 for `accounts` without the head or admin. |
| `POST /api/admin/residents` | committee | `{name, email, flat, resident_type, phone?, password?}` | `201 {id, password?}`. Creates an approved resident; the flat is upper-cased. `password` is returned only when the portal made a temporary one. The resident is welcomed with a notification. 400 for bad fields; 409 if the email is already registered. |

**Checks in the dry run:**
- required columns are present;
- emails are valid, not repeated in the file, and not already registered;
- the resident type, account kind and inventory category are allowed values;
- a password, if given, is 8 to 128 characters;
- quantities are whole numbers from 0;
- vendors and inventory items are not repeated in the file, and inventory items do not already exist.

**Temporary passwords:**
- They are 12 characters with no look-alike letters, and are shown once on the "sign-in sheet". The committee downloads the sheet as a CSV and hands each person their password.
- Only the bcrypt hash is stored.
- People should change the password under Profile.

**Consent:** residents created by the committee get `consent_at` set at creation. The committee confirms consent when onboarding, as described in `docs/privacy-and-consent.md`.

Tests: `test/bulk.test.js` (3), plus rows in `test/integration-access-matrix.test.js`.
