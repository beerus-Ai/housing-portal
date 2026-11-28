// Two-factor sign-in (TOTP) and passkeys (WebAuthn): docs/auth-api.md, auth-2fa.js. Synthetic data only.
// WebAuthn signature checks are mocked at the library boundary (createApp({ webauthn })) where a real authenticator
// would be needed; option generation and input validation run against the real @simplewebauthn/server.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');
const { hotp, totp, verifyTotp, b32encode, b32decode } = require('../auth-2fa').totp;
const realWA = require('@simplewebauthn/server');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';

async function boot(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-2fa-'));
  const clk = { now: new Date('2026-11-28T10:00:05Z') };
  const app = createApp({ dbFile: path.join(dir, 't.db'), uploadDir: path.join(dir, 'up'), noTimers: true, clock: () => clk.now, ...extra });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (method, url, body) => {
      const headers = { cookie };
      if (body) headers['content-type'] = 'application/json';
      const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      return { status: res.status, body: await res.json().catch(() => ({})) };
    };
  };
  const admin = client();
  assert.equal((await admin('POST', '/api/login', ADMIN)).status, 200);
  let n = 0;
  const resident = async () => {
    const email = `r${++n}.${Date.now()}@example.test`;
    assert.equal((await client()('POST', '/api/register', { name: 'Test Resident ' + n, email, flat: 'Z-' + (100 + n), resident_type: 'owner', password: PW, consent: true })).status, 201);
    const u = (await admin('GET', '/api/admin/users?status=pending')).body.find(x => x.email === email);
    assert.equal((await admin('POST', `/api/admin/users/${u.id}/approve`)).status, 200);
    const c = client();
    const r = await c('POST', '/api/login', { email, password: PW });
    assert.equal(r.status, 200);
    return { c, email, id: u.id, client };
  };
  const audit = () => app.locals.db.prepare('SELECT * FROM audit ORDER BY id').all();
  return { app, server, base, clk, client, admin, resident, audit, close: () => new Promise(r => server.close(r)) };
}
const codeFor = (secret, date) => totp(b32decode(secret), date.getTime());
const enable2fa = async (t, who) => {
  const s = await who.c('POST', '/api/me/2fa/setup');
  assert.equal(s.status, 200);
  const e = await who.c('POST', '/api/me/2fa/enable', { code: codeFor(s.body.secret, t.clk.now) });
  assert.equal(e.status, 200, JSON.stringify(e.body));
  return { secret: s.body.secret, recovery: e.body.recovery_codes };
};
const tick = (t, sec = 30) => { t.clk.now = new Date(t.clk.now.getTime() + sec * 1000); };

test('TOTP matches the RFC 6238 SHA-1 test vectors (6-digit truncation)', () => {
  const key = Buffer.from('12345678901234567890'); // RFC 6238 Appendix B seed for SHA-1
  const vectors = [[59, '94287082'], [1111111109, '07081804'], [1111111111, '14050471'], [1234567890, '89005924'], [2000000000, '69279037'], [20000000000, '65353130']];
  for (const [t, eight] of vectors) {
    assert.equal(hotp(key, Math.floor(t / 30), 8), eight, '8-digit vector at T=' + t);
    assert.equal(totp(key, t * 1000), eight.slice(-6), '6-digit code at T=' + t);
  }
  // RFC 4226 Appendix D HOTP values (same seed)
  assert.deepEqual([0, 1, 2, 9].map(c => hotp(key, c)), ['755224', '287082', '359152', '520489']);
  assert.equal(b32encode(key), 'GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ');
  assert.deepEqual(b32decode('GEZDGNBVGY3TQOJQGEZDGNBVGY3TQOJQ'), key);
});

test('TOTP window is one step either side and a step is never accepted twice', () => {
  const key = Buffer.from('12345678901234567890'), ms = 1111111111 * 1000, step = Math.floor(1111111111 / 30);
  assert.equal(verifyTotp(key, totp(key, ms), ms), step);
  assert.equal(verifyTotp(key, totp(key, ms - 30e3), ms), step - 1);
  assert.equal(verifyTotp(key, totp(key, ms + 30e3), ms), step + 1);
  assert.equal(verifyTotp(key, totp(key, ms - 60e3), ms), null, 'two steps old is refused');
  assert.equal(verifyTotp(key, totp(key, ms + 60e3), ms), null, 'two steps ahead is refused');
  assert.equal(verifyTotp(key, totp(key, ms), ms, step), null, 'the last used step is refused');
  assert.equal(verifyTotp(key, '12345', ms), null);
  assert.equal(verifyTotp(key, 'abcdef', ms), null);
});

test('login without 2FA is unchanged: same body, status codes and session', async () => {
  const t = await boot();
  try {
    const r = await t.resident();
    const c = t.client();
    const ok = await c('POST', '/api/login', { email: r.email, password: PW });
    assert.equal(ok.status, 200);
    assert.deepEqual(Object.keys(ok.body).sort(), ['department', 'email', 'email_verified', 'flat', 'id', 'name', 'phone', 'position', 'resident_type', 'role', 'status']); // email_verified comes from verify.js (additive)
    assert.equal(ok.body.needs_2fa, undefined);
    assert.equal((await c('GET', '/api/me')).status, 200);
    const me = (await c('GET', '/api/me')).body;
    for (const k of Object.keys(ok.body)) assert.deepEqual(me[k], ok.body[k]);
    const bad = await t.client()('POST', '/api/login', { email: r.email, password: 'wrong-password' });
    assert.deepEqual([bad.status, bad.body], [401, { error: 'Invalid email or password' }]);
    const st = await r.c('GET', '/api/me/2fa');
    assert.deepEqual(st.body, { enabled: false, enabled_at: null, recovery_codes_left: 0, passkeys: 0 });
    // the admin's own login body is the same shape as before as well
    assert.equal((await t.client()('POST', '/api/login', ADMIN)).body.email, ADMIN.email);
  } finally { await t.close(); }
});

test('2FA flow: setup, enable, needs_2fa, wrong/right code, reuse refused, recovery single-use, disable, admin reset', async () => {
  const t = await boot();
  try {
    const r = await t.resident();
    const before = (await t.client()('POST', '/api/login', { email: r.email, password: PW })).body;
    // setup returns a base32 secret and an otpauth URI; nothing is on yet
    const s = await r.c('POST', '/api/me/2fa/setup');
    assert.equal(s.status, 200);
    assert.match(s.body.secret, /^[A-Z2-7]{32}$/);
    assert.match(s.body.otpauth_uri, new RegExp('^otpauth://totp/[^?]+\\?secret=' + s.body.secret + '&issuer=[^&]+&algorithm=SHA1&digits=6&period=30$'));
    assert.equal((await r.c('GET', '/api/me/2fa')).body.enabled, false);
    assert.equal((await t.client()('POST', '/api/login', { email: r.email, password: PW })).body.needs_2fa, undefined, 'pending secret does not turn 2FA on');
    // enabling needs a code from the new secret
    assert.equal((await r.c('POST', '/api/me/2fa/enable', { code: '000000' })).status, 400);
    const en = await r.c('POST', '/api/me/2fa/enable', { code: codeFor(s.body.secret, t.clk.now) });
    assert.equal(en.status, 200);
    assert.equal(en.body.recovery_codes.length, 10);
    assert.equal(new Set(en.body.recovery_codes).size, 10);
    for (const rc of en.body.recovery_codes) assert.match(rc, /^[a-z2-9]{5}-[a-z2-9]{5}$/);
    assert.equal((await r.c('POST', '/api/me/2fa/setup')).status, 409, 'cannot re-run setup while on');
    const st = (await r.c('GET', '/api/me/2fa')).body;
    assert.equal(st.enabled, true); assert.equal(st.recovery_codes_left, 10);
    // stored encrypted and hashed, never in plain text
    const db = t.app.locals.db;
    const row = db.prepare('SELECT * FROM user_2fa WHERE user_id=?').get(r.id);
    assert.ok(row.secret_enc.startsWith('v1:'));
    assert.ok(!row.secret_enc.includes(s.body.secret));
    const hashes = db.prepare('SELECT hash FROM user_recovery_codes WHERE user_id=?').all(r.id).map(x => x.hash);
    for (const rc of en.body.recovery_codes) assert.ok(!hashes.includes(rc) && !hashes.includes(rc.replace('-', '')));

    // the code from setup's step is already used, so move on one step
    tick(t);
    const c = t.client();
    const p = await c('POST', '/api/login', { email: r.email, password: PW });
    assert.deepEqual([p.status, p.body], [200, { needs_2fa: true }]);
    // pending is not signed in
    assert.equal((await c('GET', '/api/me')).status, 401);
    assert.equal((await c('GET', '/api/requests')).status, 401);
    assert.equal((await c('POST', '/api/me/2fa/setup')).status, 401);
    // wrong code
    const w = await c('POST', '/api/login/2fa', { code: '123456' === codeFor(s.body.secret, t.clk.now) ? '654321' : '123456' });
    assert.deepEqual([w.status, w.body], [401, { error: 'Invalid code' }]);
    assert.equal((await c('GET', '/api/me')).status, 401);
    // right code: same body as the password login
    const code = codeFor(s.body.secret, t.clk.now);
    const ok = await c('POST', '/api/login/2fa', { code });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, before);
    assert.equal((await c('GET', '/api/me')).status, 200);
    // reuse of the same code in the same window is refused
    const c2 = t.client();
    assert.equal((await c2('POST', '/api/login', { email: r.email, password: PW })).body.needs_2fa, true);
    assert.equal((await c2('POST', '/api/login/2fa', { code })).status, 401, 'same code twice');
    tick(t, 10); // still inside the window: the earlier step is still refused
    assert.equal((await c2('POST', '/api/login/2fa', { code })).status, 401);
    // no pending state: /api/login/2fa without a password first
    assert.deepEqual((await t.client()('POST', '/api/login/2fa', { code: '000000' })).body, { error: 'Sign in again' });

    // recovery code works once
    const rc = en.body.recovery_codes[0];
    const c3 = t.client();
    await c3('POST', '/api/login', { email: r.email, password: PW });
    assert.equal((await c3('POST', '/api/login/2fa', { code: rc.toUpperCase() })).status, 200, 'case and dash do not matter');
    assert.equal((await r.c('GET', '/api/me/2fa')).body.recovery_codes_left, 9);
    const c4 = t.client();
    await c4('POST', '/api/login', { email: r.email, password: PW });
    assert.equal((await c4('POST', '/api/login/2fa', { code: rc })).status, 401, 'recovery code is single-use');

    // disable needs the password and a valid code
    tick(t);
    const now = codeFor(s.body.secret, t.clk.now);
    assert.deepEqual((await r.c('POST', '/api/me/2fa/disable', { password: 'nope-nope', code: now })).body, { error: 'Current password is wrong' });
    assert.equal((await r.c('POST', '/api/me/2fa/disable', { password: PW, code: '000000' === now ? '111111' : '000000' })).status, 400);
    assert.equal((await r.c('POST', '/api/me/2fa/disable', { password: PW })).status, 400, 'code is required');
    assert.equal((await r.c('POST', '/api/me/2fa/disable', { password: PW, code: now })).status, 200);
    assert.equal((await r.c('GET', '/api/me/2fa')).body.enabled, false);
    assert.deepEqual((await t.client()('POST', '/api/login', { email: r.email, password: PW })).body, before, 'plain login again');
    assert.equal(db.prepare('SELECT COUNT(*) AS n FROM user_recovery_codes WHERE user_id=?').get(r.id).n, 0);

    // admin reset (lost phone): sysadmin only, audited, user can sign in with the password alone
    tick(t);
    await enable2fa(t, r);
    assert.equal((await t.client()('POST', '/api/login', { email: r.email, password: PW })).body.needs_2fa, true);
    const other = await t.resident();
    assert.equal((await other.c('POST', `/api/admin/users/${r.id}/2fa/reset`)).status, 403, 'residents cannot reset');
    const meId = (await t.admin('GET', '/api/me')).body.id;
    assert.equal((await t.admin('POST', `/api/admin/users/${meId}/2fa/reset`)).status, 400, 'not your own');
    assert.equal((await t.admin('POST', '/api/admin/users/999999/2fa/reset')).status, 404);
    const rs = await t.admin('POST', `/api/admin/users/${r.id}/2fa/reset`);
    assert.deepEqual([rs.status, rs.body], [200, { ok: true, passkeys_removed: 0 }]);
    assert.deepEqual((await t.client()('POST', '/api/login', { email: r.email, password: PW })).body, before);

    // audit: every event, no secrets or codes
    const a = t.audit();
    const acts = a.filter(x => x.entity_id === r.id).map(x => x.action);
    for (const k of ['2fa_enabled', '2fa_failed', '2fa_recovery_used', '2fa_disabled', '2fa_reset']) assert.ok(acts.includes(k), k);
    assert.ok(a.some(x => x.action === '2fa_reset' && x.actor_id === meId));
    assert.ok(a.some(x => x.action === 'login' && x.detail === 'method password+totp'));
    const blob = JSON.stringify(a);
    assert.ok(!blob.includes(s.body.secret) && !blob.includes(code) && !en.body.recovery_codes.some(x => blob.includes(x)));
  } finally { await t.close(); }
});

test('wrong 2FA codes are throttled like passwords; a stale or changed password ends the pending state', async () => {
  const t = await boot();
  try {
    const r = await t.resident();
    const { secret } = await enable2fa(t, r);
    tick(t);
    const c = t.client();
    assert.equal((await c('POST', '/api/login', { email: r.email, password: PW })).body.needs_2fa, true);
    const right = codeFor(secret, t.clk.now), wrong = right === '000000' ? '111111' : '000000';
    for (let i = 0; i < 5; i++) assert.equal((await c('POST', '/api/login/2fa', { code: wrong })).status, 401);
    assert.equal((await c('POST', '/api/login/2fa', { code: right })).status, 429, 'locked even with the right code');
    // the lock is per account, so a fresh session does not get around it
    const c2 = t.client();
    assert.equal((await c2('POST', '/api/login', { email: r.email, password: PW })).body.needs_2fa, true);
    assert.equal((await c2('POST', '/api/login/2fa', { code: right })).status, 429);
    assert.equal(t.audit().filter(x => x.action === '2fa_failed' && x.entity_id === r.id).length, 5);

    // the pending state is bound to the password: a reset in between means sign in again
    const r2 = await t.resident();
    const s2 = await enable2fa(t, r2);
    tick(t);
    const c3 = t.client();
    assert.equal((await c3('POST', '/api/login', { email: r2.email, password: PW })).body.needs_2fa, true);
    assert.equal((await t.admin('POST', `/api/admin/users/${r2.id}/reset-password`, { password: 'NewPassw0rd!' })).status, 200);
    assert.deepEqual((await c3('POST', '/api/login/2fa', { code: codeFor(s2.secret, t.clk.now) })).body, { error: 'Sign in again' });
    assert.equal((await c3('GET', '/api/me')).status, 401);
  } finally { await t.close(); }
});

test('passkey options and input validation (real @simplewebauthn/server)', async () => {
  const t = await boot();
  try {
    const r = await t.resident();
    assert.equal((await t.client()('POST', '/api/me/passkeys/register/options')).status, 401);
    assert.equal((await t.client()('GET', '/api/me/passkeys')).status, 401);
    const o = await r.c('POST', '/api/me/passkeys/register/options');
    assert.equal(o.status, 200);
    assert.equal(o.body.rp.id, 'localhost');
    assert.match(o.body.challenge, /^[A-Za-z0-9_-]{20,}$/);
    assert.equal(o.body.user.name, r.email);
    assert.match(o.body.user.id, /^[A-Za-z0-9_-]{22}$/, 'user handle is 16 opaque bytes, no personal data');
    assert.equal(o.body.authenticatorSelection.userVerification, 'required');
    assert.equal(o.body.authenticatorSelection.residentKey, 'required');
    assert.equal(o.body.attestation, 'none');
    // verify: shape checked, challenge single use, garbage rejected by the library
    assert.deepEqual((await r.c('POST', '/api/me/passkeys/register/verify', { response: 'x' })).body, { error: 'Invalid passkey response' });
    assert.deepEqual((await r.c('POST', '/api/me/passkeys/register/verify', { response: {} })).body, { error: 'Start adding the passkey again' }, 'challenge was consumed');
    await r.c('POST', '/api/me/passkeys/register/options');
    const fake = { id: 'AAAA', rawId: 'AAAA', type: 'public-key', response: { clientDataJSON: 'eyJ0eXBlIjoid2ViYXV0aG4uY3JlYXRlIn0', attestationObject: 'o2NmbXRkbm9uZQ' }, clientExtensionResults: {} };
    assert.deepEqual((await r.c('POST', '/api/me/passkeys/register/verify', { response: fake })).body, { error: 'The passkey could not be verified' });
    assert.deepEqual((await r.c('GET', '/api/me/passkeys')).body, []);

    // sign-in options need no session; verify validates input
    const c = t.client();
    const lo = await c('POST', '/api/login/passkey/options');
    assert.equal(lo.status, 200);
    assert.equal(lo.body.rpId, 'localhost');
    assert.equal(lo.body.userVerification, 'required');
    assert.deepEqual(lo.body.allowCredentials, []);
    assert.equal((await c('GET', '/api/me')).status, 401, 'options do not sign in');
    assert.deepEqual((await c('POST', '/api/login/passkey/verify', { response: { id: 'x' } })).body, { error: 'Invalid passkey response' });
    assert.deepEqual((await c('POST', '/api/login/passkey/verify', {})).body, { error: 'Start the passkey sign-in again' });
    await c('POST', '/api/login/passkey/options');
    const fa = { id: 'AAAA', rawId: 'AAAA', type: 'public-key', response: { clientDataJSON: 'e30', authenticatorData: 'AAAA', signature: 'AAAA' }, clientExtensionResults: {} };
    assert.deepEqual((await c('POST', '/api/login/passkey/verify', { response: fa })).body, { error: 'Passkey sign-in failed' }, 'unknown credential');
    assert.equal((await c('GET', '/api/me')).status, 401);
    assert.equal((await r.c('DELETE', '/api/me/passkeys/12345')).status, 404);

    // RP ID and origin come from PUBLIC_URL when set
    process.env.PUBLIC_URL = 'https://portal.example.test';
    try { assert.equal((await r.c('POST', '/api/me/passkeys/register/options')).body.rp.id, 'portal.example.test'); }
    finally { delete process.env.PUBLIC_URL; }
  } finally { await t.close(); }
});

test('passkey register and sign-in (library verification mocked): same session, skips TOTP, counter checked', async () => {
  const seen = { reg: null, auth: null };
  let nextCounter = 1;
  const webauthn = {
    ...realWA,
    verifyRegistrationResponse: async o => { seen.reg = o; return { verified: true, registrationInfo: { credential: { id: o.response.id, publicKey: new Uint8Array([1, 2, 3, 4]), counter: 0, transports: ['internal', 'hybrid'] } } }; },
    verifyAuthenticationResponse: async o => { seen.auth = o; return { verified: true, authenticationInfo: { newCounter: nextCounter } }; },
  };
  const t = await boot({ webauthn });
  try {
    const r = await t.resident();
    const before = (await t.client()('POST', '/api/login', { email: r.email, password: PW })).body;
    await enable2fa(t, r); // passkey sign-in still works without the TOTP step
    const ro = (await r.c('POST', '/api/me/passkeys/register/options')).body;
    const regResp = { id: 'cred-one', rawId: 'cred-one', type: 'public-key', response: { clientDataJSON: 'e30', attestationObject: 'AAAA', transports: ['internal'] }, clientExtensionResults: {} };
    const add = await r.c('POST', '/api/me/passkeys/register/verify', { response: regResp, name: 'My phone' });
    assert.deepEqual([add.status, add.body.name], [201, 'My phone']);
    assert.equal(seen.reg.expectedChallenge, ro.challenge);
    assert.equal(seen.reg.expectedRPID, 'localhost');
    assert.match(seen.reg.expectedOrigin, /^http:\/\/localhost:\d+$/);
    assert.equal(seen.reg.requireUserVerification, true);
    await r.c('POST', '/api/me/passkeys/register/options');
    assert.equal((await r.c('POST', '/api/me/passkeys/register/verify', { response: regResp })).status, 409, 'same credential twice');
    const list = (await r.c('GET', '/api/me/passkeys')).body;
    assert.equal(list.length, 1);
    assert.deepEqual(list[0].transports, ['internal', 'hybrid']);
    assert.equal(list[0].public_key, undefined);

    const authResp = id => ({ id, rawId: id, type: 'public-key', response: { clientDataJSON: 'e30', authenticatorData: 'AAAA', signature: 'AAAA' }, clientExtensionResults: {} });
    const c = t.client();
    const lo = (await c('POST', '/api/login/passkey/options')).body;
    const ok = await c('POST', '/api/login/passkey/verify', { response: authResp('cred-one') });
    assert.equal(ok.status, 200);
    assert.deepEqual(ok.body, before, 'same body as the password login, no needs_2fa');
    assert.equal((await c('GET', '/api/me')).status, 200);
    assert.equal(seen.auth.expectedChallenge, lo.challenge);
    assert.equal(seen.auth.requireUserVerification, true);
    assert.equal(seen.auth.credential.id, 'cred-one');
    assert.deepEqual([...seen.auth.credential.publicKey], [1, 2, 3, 4]);
    assert.equal(t.app.locals.db.prepare('SELECT counter FROM user_passkeys WHERE cred_id=?').get('cred-one').counter, 1);
    // challenge is single use
    assert.equal((await t.client()('POST', '/api/login/passkey/verify', { response: authResp('cred-one') })).status, 400);
    // a counter that does not increase is refused (cloned authenticator)
    const c2 = t.client();
    await c2('POST', '/api/login/passkey/options');
    assert.equal((await c2('POST', '/api/login/passkey/verify', { response: authResp('cred-one') })).status, 401);
    assert.equal((await c2('GET', '/api/me')).status, 401);
    // a wrong user handle is refused
    nextCounter = 5;
    const c3 = t.client();
    await c3('POST', '/api/login/passkey/options');
    const wrongHandle = authResp('cred-one'); wrongHandle.response.userHandle = 'AAAAAAAAAAAAAAAAAAAAAA';
    assert.equal((await c3('POST', '/api/login/passkey/verify', { response: wrongHandle })).status, 401);
    // suspended accounts cannot sign in with a passkey
    assert.equal((await t.admin('PATCH', `/api/admin/users/${r.id}`, { status: 'suspended' })).status, 200);
    const c4 = t.client();
    await c4('POST', '/api/login/passkey/options');
    assert.equal((await c4('POST', '/api/login/passkey/verify', { response: authResp('cred-one') })).status, 403);
    assert.equal((await t.admin('PATCH', `/api/admin/users/${r.id}`, { status: 'approved' })).status, 200);

    // another user cannot delete it; the owner can; admin reset removes passkeys too
    const other = await t.resident();
    assert.equal((await other.c('DELETE', `/api/me/passkeys/${list[0].id}`)).status, 404);
    assert.equal((await r.c('DELETE', `/api/me/passkeys/${list[0].id}`)).status, 200);
    assert.deepEqual((await r.c('GET', '/api/me/passkeys')).body, []);
    await r.c('POST', '/api/me/passkeys/register/options');
    assert.equal((await r.c('POST', '/api/me/passkeys/register/verify', { response: { ...regResp, id: 'cred-two', rawId: 'cred-two' } })).status, 201);
    assert.equal((await t.admin('POST', `/api/admin/users/${r.id}/2fa/reset`)).body.passkeys_removed, 1);
    const acts = t.audit().map(x => x.action);
    for (const k of ['passkey_added', 'passkey_removed', 'passkey_failed']) assert.ok(acts.includes(k), k);
    assert.ok(t.audit().some(x => x.action === 'login' && x.detail === 'method passkey'));
  } finally { await t.close(); }
});
