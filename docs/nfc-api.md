# NFC gate cards API

Gate desk for guards (the committee can open it too), `nfc.js`, 2026-11-25. A card is registered to a person; each tap at the gate toggles check-in and check-out with a timestamp. For staff (including the tuck shop and laundry staff) the tap also starts or ends their shift. Cards are read by Web NFC (Chrome on Android over HTTPS, `NDEFReader`, the card serial number) or by a USB reader that types the card number and presses Enter. Card numbers are stored as upper-case hex without separators (`04:a1:b2` = `04A1B2`).

| Route | Who | Notes |
|---|---|---|
| `GET /api/gate/people?q=` | guard, committee | Approved residents and staff matching a name or flat, 20 at most (minimum fields). Without `q`: all of them, up to 500 (the "Who carries this card?" dropdown) |
| `GET /api/gate/cards` | guard, committee | Cards with holder |
| `POST /api/gate/cards` `{serial,user_id,label?}` | guard, committee | 4-40 hex characters; 409 if the card is active for someone else; the holder is notified |
| `DELETE /api/gate/cards/:id` | guard, committee | Deactivates the card |
| `POST /api/gate/tap` `{serial}` | guard, committee | `{direction: in\|out, at, shift: started\|ended\|null, person}`; 404 for an unknown card (logged as denied) |
| `GET /api/gate/presence` | guard, committee | `{inside, recent, cards}` |

Every registration, deactivation and tap is audited; taps also appear in the gate log (kind `card`).

Registering: **Register a card** opens a full-screen scanner (web and Flutter). The guard taps the card; once the number is read, a "Who carries this card?" dropdown lists everyone who can carry one (`GET /api/gate/people` without `q`), and **Register card** saves it. On the web, the scanner says why the browser cannot listen when it cannot (Web NFC needs Chrome on Android and a secure page: https, or localhost). An unknown card at the tap screen offers "Register this card". The Flutter app (`flutter_app/lib/screens/gate_desk.dart`) reads the same serial number with `nfc_manager`, so one card works with both.

## Staff departments

Staff accounts carry a department, chosen when the account is created (`kind`: `maintenance`, `cleaner`, `shop`, `laundry`). The server enforces what each sees: maintenance gets inventory, cleaning gets waste collection, the tuck shop and laundry staff get only their own service. None of them see the others.
