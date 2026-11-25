# Resident services API

Tuck shop, laundry, parcel desk and community events (`services.js`, 2026-11-25). Node and web only. All routes need a session. Every change is audited. Payment is cash or UPI on delivery; the payment gateway is planned.

The **tuck shop owner** (account role `shop`) runs the shop and the **laundry service** (role `laundry`) runs laundry: new orders go to them. The committee sees every order's state but cannot change it. Both provider roles are limited to their own routes. Product photos: `public/img/shop/` (Wikimedia Commons, see `CREDITS.md` there).

| Area | Route | Who | Notes |
|---|---|---|---|
| Tuck shop | `GET /api/shop/items` | everyone | Residents see shown items only |
| | `POST /api/shop/items` `{name,category,price,stock,unit?,image?}` | shop owner | Category: groceries, dairy, snacks, household, personal care, other. 409 on duplicate name |
| | `PATCH /api/shop/items/:id` `{price?,stock?,active?,image?,...}` | shop owner | `image` is one of `/img/shop/*.jpg` |
| | `POST /api/shop/orders` `{items:[{id,qty}],note?}` | resident | Stock is taken; 409 when stock is short. The shop owner is told |
| | `GET /api/shop/orders` | resident (own flat), shop owner, committee (read only) | |
| | `POST /api/shop/orders/:id/status` `{status}` | shop owner; resident cancels own while placed | placed → ready → delivered; cancel from placed or ready puts stock back |
| Laundry | `GET/POST /api/laundry/rates`, `PATCH /api/laundry/rates/:id` | read: everyone; write: laundry service | |
| | `POST /api/laundry/orders` `{pickup_date,pickup_slot,items:[{id,qty}],note?}` | resident | Date today to 14 days ahead (IST); slot morning, afternoon or evening |
| | `POST /api/laundry/orders/:id/status` `{status}` | laundry service; resident cancels while requested | requested → picked_up → washing → ready → delivered, one step at a time |
| Parcels | `POST /api/parcels` `{flat,carrier,note?}` | guard, committee | Flat must have an approved resident; the flat is notified |
| | `GET /api/parcels` | resident (own flat), guard, committee | |
| | `POST /api/parcels/:id/collect` `{collected_by?}` | guard, committee | 409 if already collected |
| Events | `GET /api/events` | everyone | Upcoming, with `going` and `me_going` |
| | `POST /api/events` `{title,starts_at,location?,description?}` | committee | `starts_at` is `YYYY-MM-DDTHH:MM`, in the future; residents are notified |
| | `POST /api/events/:id/cancel` | committee | Guests are notified |
| | `POST /api/events/:id/rsvp` `{going}` | resident | 409 on a cancelled event |
| Dashboards | `GET /api/services/summary` | residents and the committee | Counts for the "For you" list |

Guards may only use the parcel routes (plus their gate routes). Staff do not use the parcel desk: they see only their department's work.
