# Privacy and consent (DPDP Act, 2023)

What the portal does and what a society should agree before use. A working note for the assignment, not legal advice.

## 1. Roles
The society (committee) decides why and how resident data is used, so it is the data fiduciary. The portal team acts as processor while testing or hosting.

## 2. Consent
- Registration needs an explicit consent tick; the time is stored in `users.consent_at`.
- Consent text should state purposes (approvals, requests, notices, gate, emergencies, amenities, dues), data collected, who sees it, retention and how to withdraw.
- Family and tenants added by an owner also need consent, but the owner ticks it for them. Open: show the consent to them at first sign-in.
- Withdrawal: the resident asks the committee, who suspends or removes the account.

## 3. Data collected
| Data | Where |
| --- | --- |
| Name, email, flat, phone, resident type, password (bcrypt hash only) | `users` |
| Tenant lease: owner contact, police-verification date | `leases` |
| Gate passes: visitor name, purpose, validity | `gate_passes`, `gate_log` |
| Request photos (access checked per request) | `uploads/` |
| Amenity bookings per flat (only the flat and the committee see who booked) | `amenity_bookings` |
| Dues and recorded payments per flat: amount, method, optional reference, date | `dues`, `due_payments` |
| Inventory and waste logs: quantities and weights, no personal data | `inventory_*`, `waste_*` |
| Two-factor sign-in (optional): authenticator secret encrypted with AES-256-GCM, recovery codes as salted hashes, last used time step | `user_2fa`, `user_recovery_codes` |
| Passkeys (optional): credential id, public key, counter, device name chosen by the user | `user_passkeys` |

No card, bank-account or gateway data is stored: there is no online payment; the committee records payments received. No biometric or identity-document data: a passkey's fingerprint or face check happens on the person's own device, and the portal only receives a signature and stores a public key (`docs/auth-api.md`).

## 4. Retention and deletion
No automatic schedule yet. Proposal for the society to decide: remove resident data about 90 days after move-out; audit keeps actor id and action only; trim gate logs on a schedule. The committee can remove a user (`DELETE /api/admin/users/:id`). Backups follow the same schedule.

## 5. AI and outside services
- **LLM calls** (triage, notice drafter, digest, n8n gate): names, phones, emails and flat numbers are removed first (`redact` in `ai.js`, tested). Photos are not sent. With no key and no n8n URL, rules run locally and nothing leaves the server. Redaction is pattern-based and can miss unusual formats; the committee reviews suggestions.
- **Telegram / WhatsApp:** messages pass through the provider; the portal stores them in `whatsapp_messages` and a linked Telegram id in `users.telegram_id`.
- **Email desk:** request, registration and emergency details (name, flat; email and phone for registrations) go to the society's n8n workflow and its own Gmail. Not a model call. Links are signed and expire after 7 days; protect the committee inbox like the dashboard login.

## 6. Security measures
Hashed passwords, optional two-factor sign-in (authenticator app) and passkeys, role check on every route, HTTPS in production, no secrets in the repo, strict CSP, audit trail, login throttling, webhook secrets, signed expiring email links.

## 7. Development rule
No real resident data in prompts, fixtures or tests. Synthetic data only (`CLAUDE.md`).

## 8. Template: partner society permission and data handover
*Template only. Fill the blanks and have both parties sign.*

> **Permission to test the Sahyadri Heights housing-society portal**
> Society: ______________ Committee representative: ______________ Date: ________
> 1. The committee permits the student team to test the portal with residents on: ______.
> 2. Testing will use: [ ] synthetic data only  [ ] real resident data with each resident's consent.
> 3. Residents take part voluntarily and may stop at any time.
> 4. Data collected during testing: ______________. Who can see it: ______________.
> 5. At the end of testing on ________, the team will [ ] hand all data to the committee  [ ] delete all data and confirm in writing within ____ days. Backups and test accounts are included.
> 6. No data from the testing will be pasted into AI tools or shared outside the team.
> 7. Contact for questions or withdrawal: ______________.
> Signed (society): ______________ Signed (team representative): ______________
