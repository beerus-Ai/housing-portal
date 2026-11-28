# Neighbourhood business directory API

Contract for 2026-11-28, implemented in `business.js` (Node only for now). Residents list small businesses: their own, or a nearby one they trust.
- A listing goes live only after a committee member approves it. The committee can also reject it with a reason, or take a live listing down with a reason.
- Owners edit or remove their own listings. An edit to a live or rejected listing goes back to the committee for review.
- Categories are a fixed list: `food`, `tutoring`, `tailoring`, `beauty`, `repairs`, `home services`, `health`, `other`.
- `run_by_resident` marks a business whose owner lives in the society.
- Residents leave one 1 to 5 star rating per listing, with an optional short review. Sending it again edits it. The average is shown.
- Phones are shown on live listings, because businesses publish them.
- The committee is told about new and edited submissions. The owner is told on approve, reject and take-down.
- Every change is audited (entities `business` and `business_review`).

| Route | Who | Request | Response |
|---|---|---|---|
| `GET /api/business` | resident, committee | query `category?`, `q?` (searches name, description and category; `%` and `_` are literal), `status=all?` (committee) | Residents get live listings plus their own in any state except withdrawn. The committee gets pending and live listings, or every state with `status=all`. Pending listings come first, then by name. `[{id, name, category, description, phone, hours, website, run_by_resident, status: pending\|approved\|rejected\|removed\|withdrawn, reason, mine, listed_by: {name, flat}, created_at, updated_at, rating: {count, average\|null}, my_review: {stars, review}\|null, reviews: [{name, flat, stars, review, updated_at}]}]`. `reason` is given to the owner and the committee only. |
| `GET /api/business/categories` | resident, committee | | The category list. |
| `POST /api/business` | resident with a flat | `{name, category, description, phone, hours, website? (http/https), run_by_resident?}` | `201 {id, status: 'pending'}`. 400 for a missing field, a category not in the list, a bad phone, or a website that is not http(s). 409 if you already have a pending or live listing with that name. |
| `PUT /api/business/:id` | the owner | same body | `{ok, status: 'pending'}`. 404 for anyone else or a withdrawn listing. 409 if the committee took it down. |
| `DELETE /api/business/:id` | the owner | | `{ok}`. The listing is withdrawn (kept for the audit trail). |
| `POST /api/business/:id/decide` | committee | `{decision: approve\|reject, reason (required to reject)}` | `{ok, status}`. 409 if the listing is not pending. |
| `POST /api/business/:id/remove` | committee | `{reason}` | `{ok}`. Takes a live listing down. 409 if it is not live. |
| `PUT /api/business/:id/review` | resident with a flat, not the owner | `{stars (whole number 1 to 5), review? (300 chars)}` | `{ok, rating: {count, average}}`. 404 if the listing is not live; 409 for your own listing. |

Other roles (guard, staff, IT, shop, laundry) get 403. Tables: `business_listings`, `business_reviews` (one per listing and resident). Tests: `test/business.test.js`, plus rows in `test/integration-access-matrix.test.js`.
