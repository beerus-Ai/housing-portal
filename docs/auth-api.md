# Sign-in security API: two-factor (TOTP) and passkeys (WebAuthn)

Server: `auth-2fa.js` (mounted from `app.js`). Browser: `public/auth-extra.js` (web app and `/m/`). Client methods: `API.auth.login2fa`, `API.auth.passkeyOptions/passkeyVerify`, `API.security.*` in `public/api.js`. Tests: `test/auth-2fa.test.js`.

**Node only.** The Java backend (`backend/`), the React app and the Flutter app have no 2FA or passkeys yet. See "Compatibility" below.

## Compatibility
- `POST /api/login` is unchanged for every user who has not turned on the authenticator app: same body (`publicUser`), same status codes (400/401/403/429), same session. The Java, React, Flutter and Telegram clients keep working.
- Only for a user with 2FA on does `/api/login` answer `200 { "needs_2fa": true }`. That session holds a pending state (`p2fa`: user id, password fingerprint, 5-minute expiry) and is **not signed in**: `/api/me` and every other `auth` route answer 401 until `/api/login/2fa` succeeds. Google sign-in (`/api/auth/google`) does the same for such a user.
- Clients that do not know `needs_2fa` see a 200 without a user id. A user with 2FA can therefore only sign in through the Node web app or `/m/`. That is by design until the other clients add the code step.
- **Java backend:** it knows nothing about `user_2fa`, so a user with 2FA could sign in there with the password alone if the Java backend were pointed at the same data. Before cutover the Java port must implement this contract (tables, `needs_2fa`, `/api/login/2fa`, passkeys) or the cutover must wait. This is on the cutover checklist in `docs/deploy.md`.

## Routes
| Method and path | Who | Body | Answer |
| --- | --- | --- | --- |
| `POST /api/login` | anyone | `{ email, password }` | as before, or `200 { needs_2fa: true }` |
| `POST /api/login/2fa` | pending session | `{ code }`: 6-digit TOTP or a recovery code (`abcde-fghjk`, case and dash ignored) | `200` user (same body as `/api/login`); `401 { error: 'Invalid code' }`; `401 { error: 'Sign in again' }` (no or expired pending state, password changed, account blocked, 2FA turned off); `429` |
| `GET /api/me/2fa` | signed in | | `{ enabled, enabled_at, recovery_codes_left, passkeys }` |
| `POST /api/me/2fa/setup` | signed in | | `{ secret, otpauth_uri }`; `409` if already on. The secret is stored pending (30 minutes) until enabled |
| `POST /api/me/2fa/enable` | signed in | `{ code }` from the new secret | `{ ok, recovery_codes: [10] }`, shown once; `400` invalid code or setup expired; `409` already on; `429` |
| `POST /api/me/2fa/disable` | signed in | `{ password, code }` (TOTP or recovery code) | `{ ok }`; `403 'Current password is wrong'`; `400 'Invalid code'`; `409` not on; `429` |
| `POST /api/admin/users/:id/2fa/reset` | committee sysadmin | | `{ ok, passkeys_removed }`: clears the authenticator app, recovery codes and passkeys (lost phone). `403` for other roles and positions; `400` for your own account; `404` |
| `POST /api/me/passkeys/register/options` | signed in | | WebAuthn creation options (JSON, base64url); `409` at 10 passkeys |
| `POST /api/me/passkeys/register/verify` | signed in | `{ response, name? }`: the `PublicKeyCredential` as JSON | `201 { id, name }`; `400` (no challenge, bad shape, not verified); `409` already registered |
| `GET /api/me/passkeys` | signed in | | `[{ id, name, created_at, last_used_at, transports }]` (no keys) |
| `DELETE /api/me/passkeys/:id` | owner | | `{ ok }`; `404` |
| `POST /api/login/passkey/options` | anyone | | WebAuthn request options (`allowCredentials: []`, discoverable credentials) |
| `POST /api/login/passkey/verify` | anyone | `{ response }` | `200` user, same session as the password login; `400` no challenge or bad shape; `401 'Passkey sign-in failed'`; `403` blocked account; `429` |

All `/api/me/2fa*` and `/api/me/passkeys*` routes are open to every role (guards, staff, IT, shop and laundry included; see `COMMON_PATH` in `app.js`). Passkey routes answer `503` when the server cannot work out its RP ID (see below).

## Security decisions
- **TOTP (RFC 6238):** HMAC-SHA-1, 6 digits, 30-second step, one step either side, written on `node:crypto` (no dependency). Tested against the RFC 6238 Appendix B vectors (the last 6 digits) and the RFC 4226 HOTP values. Comparison is constant time.
- **No reuse:** the last accepted step is stored (`user_2fa.last_step`) and only later steps are accepted, so a code (or an older one in the window) cannot be replayed.
- **Throttling:** wrong codes use the same throttle as passwords: 5 failures per account (`2fa|<id>`) and 30 per IP in 15 minutes, then `429`. The account key is not tied to the session or IP, so a new password sign-in does not reset it. Someone who knows the password can lock the code step for 15 minutes; that is the usual trade-off.
- **Pending state:** created with `session.regenerate`, bound to the password fingerprint (`pwFp`), expires after 5 minutes. A full session is created with a second `regenerate` only after the code is right (no session fixation).
- **Secret at rest:** AES-256-GCM with a random 12-byte IV, the user id as additional data (a ciphertext copied to another row will not open). Stored as `v1:<base64url(iv|tag|ciphertext)>`. Key = HKDF-SHA256 of `TOTP_KEY` if set, else `SESSION_SECRET`, salt `sahyadri-heights/totp`, info `totp-secret-v1`. Without either (development only; production already requires `SESSION_SECRET`) a random key is kept in `settings.totp_dev_key`, which is not encryption at rest and is said so here.
  - **Changing `SESSION_SECRET` without a `TOTP_KEY` makes every TOTP secret unreadable.** Codes then fail closed; users sign in with a recovery code or the sysadmin resets them. Set `TOTP_KEY` (32+ random bytes, e.g. `openssl rand -hex 32`) to rotate the session secret on its own.
- **Recovery codes:** 10 per enable, 10 characters from a 31-letter alphabet (about 49 bits), shown once, stored as `sha256(salt:code)` with a 16-byte salt each. Random high-entropy codes do not need a slow hash; bcrypt would make each check ten bcrypt calls. Each is marked used atomically. Using one notifies the user.
- **Disable** needs the current password and a valid code. **Reset** is the committee sysadmin only (`position` sysadmin), not for your own account, audited and the user is notified.
- **Passkeys:** `@simplewebauthn/server` 13.3.3 (pinned). User verification is **required** (fingerprint, face or device PIN), resident keys required, attestation `none`. Because the device checks the person and holds the key, **a passkey sign-in counts as two factors and skips the TOTP step.** Stored: credential id, public key (base64url), counter, transports, name. The library checks the counter; the server also refuses a counter that does not increase once it is above 0 (cloned authenticator). Authenticators that always report 0 are allowed. The WebAuthn user handle is an HMAC of the user id (16 bytes, no personal data) and is compared when the browser returns it.
- **Challenges** live in the session for 3 minutes and are deleted on first use, success or not.
- **RP ID and origin** come from `PUBLIC_URL`, else `RENDER_EXTERNAL_URL`. With neither, only `localhost`, `127.0.0.1` and `::1` hosts work (development); any other host gets `503` rather than trusting the `Host` header.
- **CSRF:** every POST here is covered by the existing Origin check and `SameSite=Lax` cookie.
- **Browser glue** uses `navigator.credentials` and local base64url helpers; no CDN (CSP stays `'self'`). The QR for the `otpauth://` URI is drawn locally with `public/vendor/qr/qrcode.js`, so the secret never leaves the page.

## Audit
`audit.action` values: `2fa_enabled`, `2fa_disabled`, `2fa_reset` (actor = sysadmin, detail = what was cleared), `2fa_failed` (detail `sign-in`, `setup` or `disable`), `2fa_recovery_used` (detail = codes left), `passkey_added`, `passkey_removed`, `passkey_failed`, and `login` with detail `method password+totp`, `method password+recovery`, `method google+totp` or `method passkey`. Secrets, codes and keys are never written to the audit or the logs (tested).

## Tables (created by `auth-2fa.js`)
- `user_2fa(user_id, secret_enc, enabled_at, pending_enc, pending_at, last_step)`
- `user_recovery_codes(id, user_id, salt, hash, used_at)`
- `user_passkeys(id, user_id, cred_id UNIQUE, public_key, counter, transports, name, created_at, last_used_at)`

Not in `scripts/export-sqlite-to-postgres.js` or the Flyway migrations yet (Java has no 2FA).

## UI
- Sign-in (web and `/m/`): after the password, `needs_2fa` swaps the form for a 6-digit code step with "Use a recovery code" and "Start again". A "Sign in with a passkey (fingerprint / face)" button shows only when `window.PublicKeyCredential` exists.
- Web profile, "Sign-in security": set up the authenticator app (QR plus the key to type by hand, confirm with a code, then the recovery codes once with Download and Copy), turn it off (password and code), add, list and remove passkeys. The `/m/` app has the sign-in step and the passkey button; managing 2FA is on the web profile for now.

## Testing note
`test/auth-2fa.test.js` runs option generation and input validation against the real library. A real authenticator cannot run in `node:test`, so the signature checks (`verifyRegistrationResponse`, `verifyAuthenticationResponse`) are **mocked at the library boundary** through `createApp({ webauthn })` for the register, sign-in and counter tests; the mocks assert the challenge, origin, RP ID and `requireUserVerification` the server passes in.

## Not done yet
- Java backend, React and Flutter clients (see Compatibility).
- A committee UI button for the reset (the route and `API.security.reset` exist).
- Regenerating recovery codes without turning 2FA off and on.
