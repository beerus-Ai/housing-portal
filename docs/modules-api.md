# Society modules API (amenities, dues, inventory, waste)

Modules from the faculty whiteboard ([product and technology architecture](architecture/product-and-technology-architecture.md)). Code: `modules.js`; web pages: `public/web-modules.js`; tests: `test/modules.test.js`. Node and web app only; not ported to Java, React or Flutter.

All routes need a signed-in session; every change is audited; "today" and "now" are India time (IST); errors are `{ "error": "..." }`. "Residents" means approved residents with a flat. Guards and IT cannot call these routes; staff can call only the inventory and waste log/schedule routes (allow-list in `auth`).

## Amenity management

| Method and path | Who | What it does |
|---|---|---|
| `GET /api/amenities` | residents, committee | Lists open amenities. The committee also sees closed ones. |
| `POST /api/amenities` | committee | Adds an amenity: `{ name, description?, capacity?, open_from "06:00", open_to "22:00", slot_minutes 30/60/90/120/180/240 }` (defaults 06:00, 22:00, 60). Hours must fit one slot. A duplicate name returns 409. |
| `PATCH /api/amenities/:id` | committee | Changes any of the fields above, or `{ active: false }` to close it for booking. |
| `GET /api/amenities/:id/slots?date=YYYY-MM-DD` | residents, committee | Returns `{ amenity, date, slots: [{ start, end, past, status: free/mine/taken }] }` (date defaults to today). Only your own flat and the committee see who booked a slot. |
| `POST /api/bookings` | residents | Books a slot: `{ amenity_id, date, start, note? }`. The slot must not have started, must be at most 30 days ahead, and each flat may hold at most 2 upcoming bookings per amenity. A taken slot returns 409. |
| `GET /api/bookings[?scope=all&date=]` | residents (own flat), committee (all flats) | Lists upcoming bookings. `scope=all` adds past and cancelled ones. |
| `POST /api/bookings/:id/cancel` | the booking flat, committee | Cancels a booking (`{ reason? }`). If the committee cancels, the flat is told. |

## Financial management: maintenance dues

| Method and path | Who | What it does |
|---|---|---|
| `POST /api/admin/dues` | committee | Raises one bill per flat: `{ period "2026-11", title? (default "Maintenance"), amount, due_date, flats: "all" or ["A-101", ...] }`. "all" (the default) means every flat with approved residents. A flat already billed for the same period and title is skipped. Returns 201 `{ created, skipped }`; each billed flat is told. |
| `GET /api/dues[?status=&period=&flat=]` | residents (own flat), committee (`flat` filter) | Returns `{ dues: [{ ..., paid, balance, status: paid/partial/unpaid/overdue, overdue }], totals: { billed, collected, outstanding, overdue } }`. |
| `GET /api/dues/:id` | that flat, committee | One bill with its `payments`. |
| `POST /api/admin/dues/:id/payments` | committee | Records a payment received: `{ amount, method: cash/upi/bank/cheque, reference?, paid_on? }` -> 201 `{ id, balance }`. The amount cannot exceed the balance (409 if already paid), and the date cannot be in the future. The flat is told. |

**Payment gateway (planned):** no online payment yet. The committee records payments made at the office or by UPI; online payment would use the same records.

## Inventory management

| Method and path | Who | What it does |
|---|---|---|
| `GET /api/inventory[?low=1]` | committee, staff | Lists items with `low: true` when quantity is at or below `min_qty`. |
| `POST /api/inventory` | committee | Adds an item: `{ name, category: plumbing/electrical/cleaning/safety/garden/office/other, quantity, unit, min_qty, location? }`. Opening stock is recorded as a move. A duplicate name returns 409. |
| `PATCH /api/inventory/:id` | committee | Changes the name, category, unit, reorder level or location. |
| `POST /api/inventory/:id/move` | committee (in and out), staff (out only) | Records stock in or out: `{ change: +n/-n, note?, request_id? }`. Stock never goes below 0 (409). Returns the updated item. Crossing the reorder level tells the committee. |
| `GET /api/inventory/:id/moves` | committee, staff | The last 100 stock movements. |

## Waste management

| Method and path | Who | What it does |
|---|---|---|
| `GET /api/waste/schedule` | residents, committee, staff | The weekly pickups: `[{ weekday 0=Monday ... 6=Sunday, day, kind, time, note }]`. |
| `POST /api/waste/schedule`, `DELETE /api/waste/schedule/:id` | committee | Adds or removes a pickup. Body `{ weekday, kind, time "07:30", note? }`. Kinds: wet, dry, recyclable, hazardous, e-waste. Each kind once per day (409). |
| `POST /api/waste/logs` | committee, staff | Logs a collection: `{ date?, kind, weight_kg, note? }`. The date cannot be in the future. |
| `GET /api/waste/logs?days=30` | committee, staff | Returns `{ from, days, logs, totals: { wet, dry, recyclable, hazardous, e-waste, total, segregated_pct } }` (days 1 to 365). `segregated_pct` is the share that is not mixed dry. |
| `POST /api/waste/missed` | residents | Reports a missed pickup: `{ kind, note? }`. It creates a normal housekeeping request (same lifecycle, AI triage, committee alerts and email) and returns `{ id }`. |

## Dashboards

`GET /api/modules/summary` feeds the "Society services" row:

- Committee: `{ bookings_today, dues_outstanding, dues_overdue, low_stock, waste_kg_7d }`.
- Residents: `{ dues_balance, dues_overdue, next_booking, waste_today }`.
- A resident with no flat: `{}`.

## Data (additive tables in `db.js`)

`amenities`, `amenity_bookings` (one active booking per amenity, date and start), `dues` (unique per flat, period and title), `due_payments`, `inventory_items`, `inventory_moves`, `waste_schedule`, `waste_logs`.
