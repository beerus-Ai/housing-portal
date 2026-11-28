# Carpool API

Contract for 2026-11-28, implemented in `carpool.js` (Node only for now). Residents share rides with neighbours.
- A driver offers a ride; other residents ask for a seat; the driver accepts or declines.
- Any cost per seat is settled between the neighbours. The portal takes no payment.
- Phone numbers are shared only between a driver and the riders they accepted.
- The committee sees every ride and can take one down.
- Times are India time, written `YYYY-MM-DDTHH:MM`.
- Every change is audited (entities `carpool_ride` and `carpool_request`) and the other party is notified.

| Route | Who | Request | Response |
|---|---|---|---|
| `GET /api/carpool` | resident, committee | | Upcoming rides, plus your own rides and seats from the last day: `[{id, from_place, to_place, depart_at, seats, seats_left, cost_per_seat, note, status: open\|cancelled, past, mine, driver: {id, name, flat, phone}, my_request: {id, seats, status}\|null, requests?}]`. `driver.phone` is null unless the ride is yours or your seat was accepted. `requests` is given to the driver and the committee only: `[{id, name, flat, seats, status, created_at, phone}]`, where `phone` is given to the driver for accepted riders only. Cancelled rides are hidden from riders. |
| `POST /api/carpool` | resident with a flat | `{to_place, from_place? (default "Sahyadri Heights"), depart_at, seats (1 to 6), cost_per_seat? (₹0 to 5,000), note?}` | `201 {id}`. 400 for a missing destination, a time not in the future, bad seats or a bad cost. 409 if you already offer a ride at that time. |
| `POST /api/carpool/:id/cancel` | the driver, or the committee | | `{ok}`. Pending and accepted riders are told; when the committee takes a ride down, the driver is told too. 404 for anyone else; 409 if already cancelled. |
| `POST /api/carpool/:id/request` | resident | `{seats? (default 1)}` | `201 {id, status: 'pending'}`. 409 for: your own ride, the ride has left, `Only n seats left` / `This ride is full`, you already asked, or the driver declined you. A cancelled request can ask again. |
| `POST /api/carpool/requests/:id/decide` | the driver | `{decision: accept\|decline}` | `{ok, status}`. 409 if the request is no longer pending, or if accepting would oversell seats. |
| `POST /api/carpool/requests/:id/cancel` | the rider | | `{ok}`. Withdraws a pending or accepted seat; the driver is told. |

Other roles (guard, staff, IT, shop, laundry) get 403. Tables: `carpool_rides`, `carpool_requests` (unique per ride and rider). Tests: `test/carpool.test.js`, plus rows in `test/integration-access-matrix.test.js`.
