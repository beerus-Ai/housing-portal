// Email verification at onboarding (docs/email-verification-api.md): link sent on registration, works once, expires,
// resend does not reveal accounts, committee sees the status, optional rule blocks approval. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-ver-'));
  const mails = [];
  const app = createApp({ dbFile: path.join(dir, 'v.db'), uploadDir: path.join(dir, 'up'), noTimers: true, mailer: async m => { mails.push(m); return true; } });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const client = () => { let cookie = ''; return async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const ct = res.headers.get('content-type') || '';
    return { status: res.status, body: ct.includes('json') ? await res.json() : await res.text() };
  }; };
  const admin = client();
  assert.equal((await admin('POST', '/api/login', ADMIN)).status, 200);
  const pathOf = link => new URL(link).pathname;
  return { admin, client, mails, pathOf, close: () => server.close() };
}
const reg = (c, email, extra = {}) => c('POST', '/api/register', { name: 'Meera', email, flat: 'A-101', resident_type: 'owner', password: PW, consent: true, ...extra });

test('registration sends a one-time link; confirming marks the email; the committee sees it', async () => {
  const t = await boot();
  try {
    const r = await reg(t.client(), 'meera@x.test');
    assert.equal(r.status, 201); assert.equal(r.body.message, 'Registered. An admin will review your account.'); assert.equal(r.body.email_verification, 'sent');
    assert.equal(t.mails.length, 1);
    const m = t.mails[0];
    assert.equal(m.to, 'meera@x.test'); assert.equal(m.kind, 'verify_email'); assert.match(m.subject, /confirm your email/); assert.match(m.link, /\/verify-email\/[A-Za-z0-9_-]{40,}$/);
    let u = (await t.admin('GET', '/api/admin/users?status=pending')).body.find(x => x.email === 'meera@x.test');
    assert.equal(u.email_verified, false);

    const ok = await t.client()('GET', t.pathOf(m.link));
    assert.equal(ok.status, 200); assert.match(ok.body, /Your email is confirmed/);
    u = (await t.admin('GET', '/api/admin/users?status=pending')).body.find(x => x.email === 'meera@x.test');
    assert.equal(u.email_verified, true);
    const again = await t.client()('GET', t.pathOf(m.link));
    assert.equal(again.status, 200); assert.match(again.body, /already confirmed/, 'a used link says so instead of failing');
    assert.equal((await t.client()('GET', '/verify-email/not-a-real-token')).status, 400);

    // audit has the events, but never the link
    const audit = (await t.admin('GET', '/api/admin/audit')).body;
    const rows = Array.isArray(audit) ? audit : audit.rows || [];
    assert.ok(rows.some(a => a.action === 'verification_sent') && rows.some(a => a.action === 'email_verified'));
    assert.ok(!JSON.stringify(rows).includes(m.link.split('/').pop()), 'token never written to the audit');
  } finally { t.close(); }
});

test('resend: new link replaces the old one, the answer never reveals accounts, and it is rate limited', async () => {
  const t = await boot();
  try {
    await reg(t.client(), 'kiran@x.test');
    const first = t.mails[0].link;
    const anon = t.client();
    const r1 = await anon('POST', '/api/verify-email/resend', { email: 'nobody@x.test' });
    const r2 = await anon('POST', '/api/verify-email/resend', { email: 'KIRAN@x.test' });
    assert.equal(r1.status, 200); assert.deepEqual(r1.body, r2.body, 'same answer for unknown and known emails');
    assert.equal(t.mails.length, 2, 'one new mail, for the real account only');
    await anon('POST', '/api/verify-email/resend', { email: 'kiran@x.test' });
    assert.equal(t.mails.length, 2, 'rate limited to one per 5 minutes');
    assert.equal((await anon('GET', t.pathOf(first))).status, 400, 'the older link stopped working');
    assert.equal((await anon('GET', t.pathOf(t.mails[1].link))).status, 200);
  } finally { t.close(); }
});

test('optional rule: approval waits for a confirmed email; committee can resend; household and committee-made residents get links', async () => {
  const t = await boot();
  try {
    assert.deepEqual((await t.admin('GET', '/api/admin/settings/email-verification')).body, { required: false });
    await reg(t.client(), 'tara@x.test');
    const id = (await t.admin('GET', '/api/admin/users?status=pending')).body.find(x => x.email === 'tara@x.test').id;
    assert.equal((await t.admin('PUT', '/api/admin/settings/email-verification', { required: 'yes' })).status, 400);
    assert.equal((await t.admin('PUT', '/api/admin/settings/email-verification', { required: true })).status, 200);
    const blocked = await t.admin('POST', `/api/admin/users/${id}/approve`);
    assert.equal(blocked.status, 409); assert.match(blocked.body.error, /not confirmed their email/);
    assert.equal((await t.admin('POST', `/api/admin/users/${id}/reject`)).status, 200, 'rejecting is never blocked');
    // committee sends a fresh link to another pending person, then approval works once confirmed
    await reg(t.client(), 'ravi@x.test', { flat: 'B-2' });
    const rid = (await t.admin('GET', '/api/admin/users?status=pending')).body.find(x => x.email === 'ravi@x.test').id;
    const before = t.mails.length;
    assert.deepEqual((await t.admin('POST', `/api/admin/users/${rid}/verify-email`)).body, { result: 'sent' });
    assert.equal(t.mails.length, before + 1);
    await t.client()('GET', t.pathOf(t.mails[t.mails.length - 1].link));
    assert.equal((await t.admin('POST', `/api/admin/users/${rid}/approve`)).status, 200);
    assert.equal((await t.admin('POST', `/api/admin/users/${rid}/verify-email`)).status, 409, 'already confirmed');
    // /api/me shows the status
    const ravi = t.client(); await ravi('POST', '/api/login', { email: 'ravi@x.test', password: PW });
    assert.equal((await ravi('GET', '/api/me')).body.email_verified, true);
    // a committee-created resident gets a link too
    const n = t.mails.length;
    assert.equal((await t.admin('POST', '/api/admin/residents', { name: 'Neha', email: 'neha@x.test', flat: 'C-3', resident_type: 'tenant' })).status, 201);
    await new Promise(r => setTimeout(r, 50));
    assert.equal(t.mails.length, n + 1); assert.equal(t.mails[n].to, 'neha@x.test');
    // only the head or admin changes the rule
    const member = t.client();
    await t.admin('POST', '/api/admin/accounts', { name: 'Mem', email: 'mem@x.test', password: PW, kind: 'member' });
    await member('POST', '/api/login', { email: 'mem@x.test', password: PW });
    assert.equal((await member('PUT', '/api/admin/settings/email-verification', { required: false })).status, 403);
  } finally { t.close(); }
});
