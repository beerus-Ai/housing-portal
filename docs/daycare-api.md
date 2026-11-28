# Daycare API

Contract for 2026-11-28, implemented in `daycare.js` (Node only for now). Daycare places for children of residents.
- The committee registers daycare providers in or near the society: name, ages, capacity, hours, fee per month, location, phone and notes.
- A parent asks for a place with minimum data: the child's first name (one word, no surname) and age in whole years. No date of birth is stored.
- The parent also gives a start date (today or later) and weekdays (Monday to Friday).
- The committee approves or declines. A parent in the flat can cancel a pending request or an approved place.
- Approved enrolments never exceed the provider's capacity. Capacity counts approved places, whatever their days.
- Each day the committee marks drop-off and pick-up. The parent sees today's status. There is no separate daycare role.
- The parent is told on approve, decline and pick-up. The committee is told about new requests and cancellations.
- Fees are recorded only. The portal takes no payment.
- Dates and times are India time. Every change is audited (entities `daycare_provider` and `daycare_enrolment`).

| Route | Who | Request | Response |
|---|---|---|---|
| `GET /api/daycare/providers` | resident, committee | | Open providers (the committee also sees closed ones): `[{id, name, age_min, age_max, capacity, places_left, hours, fee_month, location, phone, notes, active}]`. |
| `POST /api/daycare/providers` | committee | `{name, age_min, age_max (0 to 14), capacity (1 to 200), hours, fee_month (₹), location, phone, notes?}` | `201 {id}`. 400 for a bad field. |
| `PUT /api/daycare/providers/:id` | committee | same body | `{ok}`. 409 if the capacity would go below the approved places. |
| `DELETE /api/daycare/providers/:id` | committee | | `{ok, cancelled}`. Closes the provider. Its pending and approved enrolments are cancelled and the parents are told. |
| `GET /api/daycare/enrolments` | resident (own flat), committee (all) | query `status?` | Pending first, then approved, then the rest: `[{id, provider: {id, name, hours, fee_month, phone}, child_name, child_age, start_date, days: ['mon'..'fri'], status: pending\|approved\|declined\|cancelled, reason, flat, parent, created_at, decided_at, today: {date, scheduled, in_at, out_at}}]`. |
| `POST /api/daycare/enrolments` | resident with a flat | `{provider_id, child_name, child_age, start_date (YYYY-MM-DD), days: ['mon', ...]}` | `201 {id, status: 'pending'}`. 400 for a surname, an age outside the provider's range, a past start date, or no weekday or a non-weekday. 404 for an unknown or closed provider. 409 if the same child already has a request or place there. |
| `POST /api/daycare/enrolments/:id/decide` | committee | `{decision: approve\|decline, reason?}` | `{ok, status}`. 409 if the enrolment is not pending, or if the provider is full or closed. |
| `POST /api/daycare/enrolments/:id/cancel` | a resident of the flat | | `{ok}`. Cancels a pending request or an approved place. |
| `GET /api/daycare/today` | committee | | `{date, weekday, children: [enrolment]}`. Approved children whose days include today, plus anyone already marked in. |
| `POST /api/daycare/enrolments/:id/checkin` | committee | | `{ok, date, time}`. Records the drop-off at the current time. 409 if there is no approved place yet, or the child is already in. |
| `POST /api/daycare/enrolments/:id/checkout` | committee | | `{ok, date, time}`. Records the pick-up and tells the parent. 409 if the child was not dropped off, or was already picked up. |

Other roles (guard, staff, IT, shop, laundry) get 403. Tables: `daycare_providers`, `daycare_enrolments`, `daycare_attendance` (one row per enrolment and day). Tests: `test/daycare.test.js`, plus rows in `test/integration-access-matrix.test.js`.
