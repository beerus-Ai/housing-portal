# Email verification API

Contract for 2026-11-28, implemented in `verify.js` (Node only for now).
- Everyone who joins gets a link to confirm their email address: self-registration, a family member or tenant added by an owner, and a resident created by the committee (one at a time or by bulk upload).
- The committee sees "Email confirmed" or "Email not confirmed" on the Verification page. It can choose to require a confirmed email before approval; that rule is off by default.

| Route | Who | Request | Response |
|---|---|---|---|
| `POST /api/register` | anyone | unchanged | unchanged, plus `email_verification: 'sent' \| 'unavailable'` (additive) |
| `GET /verify-email/:token` | the link in the email | | An HTML page. A valid link confirms the email (`users.email_verified_at`), once. Used or expired links get 400 with a page explaining what to do; if the email is already confirmed, the page says so. |
| `POST /api/verify-email/resend` | anyone | `{email}` | Always `200 {ok, message}`, whether or not the email exists, so accounts are not revealed. A new link (the old one stops working) at most once per 5 minutes per account. |
| `POST /api/admin/users/:id/verify-email` | committee | | `{result: 'sent' \| 'unavailable'}`; 409 if already confirmed |
| `GET /api/admin/settings/email-verification` | committee | | `{required}` |
| `PUT /api/admin/settings/email-verification` | head of committee or admin | `{required: boolean}` | `{required}`. When true, `POST /api/admin/users/:id/approve` answers 409 for an unconfirmed email. Rejecting is never blocked. |

`GET /api/me` and `GET /api/admin/users` gain `email_verified` (boolean).

**Tokens**
- 32 random bytes in base64url.
- Only the SHA-256 hash is stored, in `email_verifications`.
- Valid for 48 hours and usable once; a new link cancels the older ones.
- Neither the token nor the link is ever written to the audit log. The audit records `verification_sent`, `verification_unavailable`, `email_verified` and `verification_resent`.

**Sending**
- The portal POSTs `{kind: 'verify_email', to, name, subject, html, text, link}` to `VERIFY_EMAIL_WEBHOOK_URL`. Import `n8n/verify-email.json`, connect Gmail and publish.
- Without that variable, a development server prints the link to its log, and production records `verification_unavailable`.
- It never falls back to the committee email desk, whose emails go to the committee.
- Tests inject a mailer with `createApp({ mailer })`.

**Java backend:** not ported yet; the register response there has no `email_verification` field.

Tests: `test/verify.test.js` (3), plus access-matrix rows.
