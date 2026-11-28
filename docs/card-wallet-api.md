# Community card wallet API

Contract for 2026-11-28. Node only for now; the Java backend has no services or cards yet. Builds on `docs/nfc-api.md` (cards) and `docs/services-api.md` (shop, laundry, parcels, events).

The community card is one card per person: the gate, the tuck shop, laundry, parcel pickup and event check-in. It is tied to a **prepaid wallet per flat**, because money is per flat, like dues and credit. The wallet is a ledger of recorded money. There is no online gateway: top-ups are cash or UPI handed to the committee and recorded. Every change is audited. Amounts are rupees with 2 decimals.

## Card numbers and frozen cards
- Card numbers use the same rule as `nfc.js` `normSerial`: upper-case hex, separators dropped.
- A resident can **freeze** their own card, for example when it is lost. A frozen card is refused everywhere a card is accepted, with `403 {"error":"This card is frozen. Its owner can unfreeze it under Profile > My community card."}`. Those places are gate tap, card lookup, shop counter, laundry counter, parcel collect by card and event check-in. Gate taps of a frozen card are logged as denied (reason `Card frozen`).
- Schema: `gate_cards.frozen INTEGER NOT NULL DEFAULT 0`.

## Wallet ledger
Table `wallet_tx(id, flat, amount, kind, method, ref_type, ref_id, note, by_user, created_at)`:
- `amount` is positive for money in and negative for money out.
- `kind` is `topup` | `shop` | `laundry` | `refund` | `adjust`.
- `method` is `cash` | `upi` for top-ups, null otherwise.
- `ref_type`/`ref_id` point at the order, e.g. `shop_order` 12.

Balance = SUM(amount) for the flat. It can never go below 0; a spend that would do so is refused.

| Route | Who | Request | Response |
|---|---|---|---|
| `GET /api/wallet` | resident with a flat | | `{flat, balance, tx:[{id, amount, kind, method, note, created_at}] (last 50, newest first)}` |
| `GET /api/admin/wallets` | committee | | `[{flat, balance, last_at}]`: every flat with an approved resident, balance 0 if none |
| `GET /api/admin/wallets/:flat` | committee | | same shape as `GET /api/wallet` |
| `POST /api/admin/wallet/topup` | committee | `{flat? , serial?, amount, method: cash\|upi, reference?}`: give `flat`, or `serial` (a tapped resident card) | `201 {flat, balance, tx_id}`. 400 if the amount is not 1 to 50000, the method is wrong, or the flat has no approved resident; 404 for an unknown card. Notifies the flat: "₹X added to your wallet (cash)". |
| `POST /api/admin/wallet/adjust` | committee head or sysadmin (`governance`) | `{flat, amount (±, not 0), note (required)}` | `201 {flat, balance}`; 409 if the balance would go below 0 |

## Paying with the wallet
`payment: 'wallet'` joins `cash | upi | account` on:
- `POST /api/shop/orders`
- `POST /api/shop/counter`
- `POST /api/laundry/orders`
- `POST /api/laundry/counter` (new)

The debit is written in the same transaction as the order: `kind` `shop`/`laundry`, `ref_type` `shop_order`/`laundry_order`. If the balance is short, the response is `409 {"error":"Wallet balance is ₹B. Top up with the committee or pay another way."}`. A wallet order counts as paid right away (`paid_at` set). Cancelling a wallet-paid order (shop or laundry, wherever cancel is allowed today) writes a `refund` of the same amount. The error message for an invalid payment becomes `Choose cash, UPI, wallet or the maintenance account`.

## One lookup for every counter
`POST /api/card/lookup {serial}`: guard, committee, shop, laundry.
- Response: `{id, name, role, flat, department, frozen, wallet: {balance} | null, credit: {used, limit} | null, parcels_waiting: n | null}`.
  - `wallet` and `credit` are given for residents only.
  - `parcels_waiting` is given for guard and committee only.
- 404 `{"error":"Unknown card. Register it at the gate desk."}`; 403 if the card is frozen or the holder is not approved.
- `POST /api/shop/card` stays as it is and gains `wallet_balance`.

## Laundry counter (card at the laundry desk)
`POST /api/laundry/counter {serial, lines:[{item, qty}], payment}`: laundry role.
- The card must be a resident's. Prices come from the laundry rates. It creates a laundry order with `status 'picked_up'` (handed over at the counter) and `pickup_date` today (IST).
- Response: `201 {id, total, payment, name, flat}`. The flat is notified, and the action is audited `counter_order`.

## Parcels by card
`POST /api/parcels/:id/collect` also accepts `{serial}`. The card must belong to an approved resident of the parcel's flat, otherwise `409 {"error":"This card is not from flat X"}`. `collected_by` is then the card holder's name. `GET /api/parcels/card/:serial` (guard, staff, committee) lists the waiting parcels for that card's flat.

## Event check-in by card
`POST /api/events/:id/checkin {serial}`: committee or guard. Table `event_checkins(event_id, user_id, at, by_user)`.
- Response: `201 {name, flat, rsvp: true|false, already: false}`. A repeat check-in returns `200 {…, already: true}`.
- `GET /api/events/:id/checkins` (committee, guard) lists who came.

## The card holder's own view
`GET /api/me/card` (already there) gains:
- `frozen` (true if any active card is frozen);
- `wallet: {balance} | null` (residents with a flat);
- `wallet` activity rows: kind `wallet`, icon `wallet`, text such as "Top-up (UPI)" or "Paid at the tuck shop", amount ±.

`POST /api/me/card/freeze {frozen: true|false}`: any signed-in user with an active card. Response `{frozen}`; audited `card_frozen`/`card_unfrozen`.

## Clients
- **Web:** Profile > My community card (wallet balance and history, freeze toggle); committee **Wallets** page (balances per flat, top up by flat dropdown or by tapping a card); shop counter and new laundry counter (tap card, see balance, pay by wallet); parcel desk "Collect with card"; event check-in by card. Every card box autofocuses so the Windows card reader (`windows-reader/`) or a USB reader can type into it.
- **Mobile PWA (`/m/`):** the same resident wallet and freeze; counters for shop, laundry, guard and committee read cards with Web NFC (`NDEFReader`, Chrome on Android) or typing. In the Capacitor app, the `SahyadriNfc.read()` result gains `serial` (the tag UID in hex).
- **Flutter:** resident "My card" screen (wallet, history, freeze); tuck shop and laundry roles get a Counter tab (tap card with `nfc_manager`, sell or hand over, pay by wallet).
