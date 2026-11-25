# Society modules API (amenities, dues, inventory, waste)

These are the modules from the faculty whiteboard (see [product and technology architecture](architecture/product-and-technology-architecture.md)) that had not been built yet. They live in `modules.js` (Node), the web pages are in `public/web-modules.js`, and the tests are in `test/modules.test.js`. **Node and the web app only so far; Java and React are not ported yet.**

All routes need a signed-in session. Every change is written to the audit trail. "Today" and "now" mean India time (IST). Errors come back as `{ "error": "..." }`.

## Amenity management

| Method and path | Who | What it does |
|---|---|---|
| `GET /api/amenities` | everyone signed in | Lists open amenities. The committee also sees closed ones. |
| `POST /api/amenities` | committee | Adds an amenity: `{ name, description?, capacity?, open_from "06:00", open_to "22:00", slot_minutes 30/60/90/120/180/240 }`. A name that already exists returns 409. |
| `PATCH /api/amenities/:id` | committee | Changes any of the fields above, or `{ active: false }` to close it for booking. |
| `GET /api/amenities/:id/slots?date=YYYY-MM-DD` | everyone | Returns `{ amenity, date, slots: [{ start, end, past, status: free/mine/taken }] }`. Only your own flat and the committee see who booked a slot. |
| `POST /api/bookings` | residents with a flat | Books a slot: `{ amenity_id, date, start }`. The slot must not have started, must be at most 30 days ahead, and each flat may hold at most 2 upcoming bookings per amenity. A taken slot returns 409. |
| `GET /api/bookings[?scope=all&date=]` | residents (own flat), committee (all flats) | Lists upcoming bookings. `scope=all` includes past and cancelled bookings. |
| `POST /api/bookings/:id/cancel` | the booking flat, committee | Cancels a booking. If the committee cancels, the flat is told. |

## Financial management: maintenance dues

| Method and path | Who | What it does |
|---|---|---|
| `POST /api/admin/dues` | committee | Raises one bill per flat: `{ period "2026-11", title "Maintenance", amount, due_date, flats: "all" or ["A-101", ...] }`. "all" means every flat with approved residents. A flat already billed for the same period and title is skipped. Returns `{ created, skipped }`, and each flat's residents are told. |
| `GET /api/dues[?status=&period=&flat=]` | residents (own flat), committee | Returns `{ dues: [{ ..., paid, balance, status: paid/partial/unpaid/overdue, overdue }], totals: { billed, collected, outstanding, overdue } }`. |
| `GET /api/dues/:id` | that flat, committee | One bill with its `payments`. |
| `POST /api/admin/dues/:id/payments` | committee | Records a payment received: `{ amount, method: cash/upi/bank/cheque, reference?, paid_on? }`. The amount cannot exceed the balance, and the date cannot be in the future. The flat is told. |

**Payment gateway (planned):** residents cannot pay online yet. They pay at the office or by UPI, and the committee records the payment. Online payment would use these same records.

## Inventory management

| Method and path | Who | What it does |
|---|---|---|
| `GET /api/inventory[?low=1]` | committee, staff | Lists items with `low: true` when quantity is at or below `min_qty`. |
| `POST /api/inventory` | committee | Adds an item: `{ name, category: plumbing/electrical/cleaning/safety/garden/office/other, quantity, unit, min_qty, location? }`. |
| `PATCH /api/inventory/:id` | committee | Changes the name, category, unit, reorder level or location. |
| `POST /api/inventory/:id/move` | committee (in and out), staff (out only) | Records stock in or out: `{ change: +n/-n, note?, request_id? }`. Stock never goes below 0. Crossing the reorder level tells the committee. |
| `GET /api/inventory/:id/moves` | committee, staff | The last 100 stock movements. |

## Waste management

| Method and path | Who | What it does |
|---|---|---|
| `GET /api/waste/schedule` | everyone | The weekly pickups: `[{ weekday 0=Monday ... 6=Sunday, day, kind, time, note }]`. |
| `POST /api/waste/schedule`, `DELETE /api/waste/schedule/:id` | committee | Adds or removes a pickup. Kinds are wet, dry, recyclable, hazardous and e-waste. Each kind can appear once per day. |
| `POST /api/waste/logs` | committee, staff | Logs a collection: `{ date?, kind, weight_kg, note? }`. The date cannot be in the future. |
| `GET /api/waste/logs?days=30` | committee, staff | Returns `{ logs, totals: { wet, dry, recyclable, hazardous, e-waste, total, segregated_pct } }`. `segregated_pct` is the share of waste that is not mixed dry. |
| `POST /api/waste/missed` | residents | Reports a missed pickup: `{ kind, note? }`. It creates a normal housekeeping request (same lifecycle, AI triage, committee alerts and email) and returns `{ id }`. |

## Dashboards

`GET /api/modules/summary` feeds the "Society services" row:

- Committee: `{ bookings_today, dues_outstanding, dues_overdue, low_stock, waste_kg_7d }`.
- Residents: `{ dues_balance, dues_overdue, next_booking, waste_today }`.

## Data (additive tables in `db.js`)

`amenities`, `amenity_bookings` (one active booking per amenity, date and start), `dues` (unique per flat, period and title), `due_payments`, `inventory_items`, `inventory_moves`, `waste_schedule`, `waste_logs`.
