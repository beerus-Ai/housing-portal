const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';
const CID = 'client-123.apps.googleusercontent.com';

async function boot(extra = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-set-'));
  const app = createApp({ dbFile: path.join(dir, 's.db'), uploadDir: path.join(dir, 'up'), ...extra });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const client = () => {
    let cookie = '';
    const c = async (method, url, body) => {
      const headers = { cookie };
      if (body) headers['content-type'] = 'application/json';
      const res = await fetch(base + url, { method, headers, body: body && JSON.stringify(body) });
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { json = text; }
      return { status: res.status, body: json, headers: res.headers };
    };
    return c;
  };
  const admin = client();
  await admin('POST', '/api/login', ADMIN);
  const close = () => { server.close(); try { app.locals.db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); };
  const person = async (email, flat, type, approve = true) => {
    const c = client();
    assert.equal((await client()('POST', '/api/register', { name: email.split('@')[0], email, flat, resident_type: type, password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    c.id = p.id;
    if (approve) {
      assert.equal((await admin('POST', `/api/admin/users/${p.id}/approve`)).status, 200);
      assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    }
    return c;
  };
  return { admin, client, person, close };
}

test('public settings need no sign-in and have defaults', async () => {
  const { client, close } = await boot();
  try {
    const r = await client()('GET', '/api/settings');
    assert.equal(r.status, 200);
    assert.deepEqual(r.body, { society_name: 'Sahyadri Heights', society_kind: 'Co-operative Housing Society', google_client_id: '',
      features: { emergency: true, gate: true, contacts: true, notices: true, parking: true } });
  } finally { close(); }
});

test('admin settings: update, validation, role check, audit', async () => {
  const { admin, person, close } = await boot();
  try {
    const t = await person('t1@example.test', 'B-1', 'tenant');
    assert.equal((await t('GET', '/api/admin/settings')).status, 403);
    assert.equal((await t('PUT', '/api/admin/settings', { society_name: 'X' })).status, 403);
    assert.equal((await admin('PUT', '/api/admin/settings', { society_name: '' })).status, 400);
    assert.equal((await admin('PUT', '/api/admin/settings', { society_name: 'x'.repeat(101) })).status, 400);
    assert.equal((await admin('PUT', '/api/admin/settings', { society_kind: 5 })).status, 400);
    assert.equal((await admin('PUT', '/api/admin/settings', { google_client_id: 'bad id<script>' })).status, 400);
    assert.equal((await admin('PUT', '/api/admin/settings', { features: { gate: 'no' } })).status, 400);
    assert.equal((await admin('PUT', '/api/admin/settings', { features: { bogus: true } })).status, 400);
    const ok = await admin('PUT', '/api/admin/settings', { society_name: 'Lake View', google_client_id: CID, features: { notices: false } });
    assert.equal(ok.status, 200);
    const pub = (await admin('GET', '/api/settings')).body;
    assert.equal(pub.society_name, 'Lake View');
    assert.equal(pub.society_kind, 'Co-operative Housing Society');
    assert.equal(pub.google_client_id, CID);
    assert.deepEqual(pub.features, { emergency: true, gate: true, contacts: true, notices: false, parking: true });
    assert.equal((await admin('PUT', '/api/admin/settings', { google_client_id: '' })).body.google_client_id, '');
    const audit = (await admin('GET', '/api/admin/audit')).body;
    assert.ok(audit.some(a => a.entity === 'settings' && a.action === 'feature_off' && a.detail === 'notices'));
    assert.ok(audit.some(a => a.entity === 'settings' && a.action === 'updated'));
  } finally { close(); }
});

test('feature toggles: 403 for residents, admin unaffected, guards unaffected', async () => {
  const { admin, person, close } = await boot();
  try {
    const o = await person('o1@example.test', 'A-1', 'owner');
    await admin('POST', '/api/admin/guards', { name: 'Gus', email: 'g@example.test', password: PW });
    assert.equal((await o('GET', '/api/contacts')).status, 200);
    assert.equal((await admin('PUT', '/api/admin/settings', { features: { emergency: false, gate: false, contacts: false, notices: false } })).status, 200);
    const off = { error: 'This feature is turned off' };
    for (const [m, u, b] of [['GET', '/api/emergencies'], ['POST', '/api/emergencies', { type: 'fire' }], ['GET', '/api/gate/passes'],
      ['POST', '/api/gate/passes', { visitor_name: 'V' }], ['GET', '/api/gate/me'], ['POST', '/api/gate/me/rotate'], ['GET', '/api/contacts'], ['GET', '/api/notices']]) {
      const r = await o(m, u, b);
      assert.equal(r.status, 403, m + ' ' + u);
      assert.deepEqual(r.body, off);
    }
    assert.equal((await admin('GET', '/api/emergencies')).status, 200);
    assert.equal((await admin('GET', '/api/gate/passes')).status, 200);
    assert.equal((await admin('GET', '/api/contacts')).status, 200);
    assert.equal((await admin('GET', '/api/notices')).status, 200);
    assert.equal((await admin('POST', '/api/gate/verify', { code: '123456' })).status, 200);
    assert.equal((await o('GET', '/api/me')).body.features.gate, false);
  } finally { close(); }
});

test('access matrix: GET/PUT, validation, enforcement, /api/me', async () => {
  const { admin, person, close } = await boot();
  try {
    const o = await person('o2@example.test', 'A-2', 'owner');
    const t = await person('t2@example.test', 'A-2', 'tenant');
    const f = await person('f2@example.test', 'A-2', 'family');
    const a = (await admin('GET', '/api/admin/access')).body;
    assert.deepEqual(a.roles, ['owner', 'tenant', 'family']);
    assert.equal(a.permissions.length, 9);
    assert.ok(a.permissions.every(p => p.key && p.label));
    assert.equal(a.matrix.owner['household.manage'], true);
    assert.equal(a.matrix.tenant['household.manage'], false);
    assert.equal(a.matrix.tenant['gate.pass'], true);
    assert.equal(a.matrix.family['lease.view'], false);
    assert.equal((await o('GET', '/api/admin/access')).status, 403);
    assert.equal((await o('PUT', '/api/admin/access', { matrix: {} })).status, 403);
    // /api/me
    const mo = (await o('GET', '/api/me')).body, mf = (await f('GET', '/api/me')).body;
    assert.equal(mo.permissions.length, 9);
    assert.ok(!mf.permissions.includes('lease.view') && mf.permissions.includes('gate.pass'));
    assert.equal((await admin('GET', '/api/me')).body.permissions.length, 9);
    assert.deepEqual(mo.features, { emergency: true, gate: true, contacts: true, notices: true, parking: true });
    // validation
    for (const bad of [undefined, [], { admin: { 'gate.pass': false } }, { tenant: { 'nope.key': true } }, { tenant: { 'gate.pass': 'no' } }, { tenant: [] }])
      assert.equal((await admin('PUT', '/api/admin/access', { matrix: bad })).status, 400);
    // enforcement
    assert.equal((await t('POST', '/api/gate/passes', { visitor_name: 'V' })).status, 201);
    const put = await admin('PUT', '/api/admin/access', { matrix: { tenant: { 'gate.pass': false, 'contacts.read': false, 'notice.read': false, 'emergency.raise': false, 'request.create': false, 'lease.view': false, 'vehicle.manage': false, 'parking.view': false } } });
    assert.equal(put.status, 200);
    assert.equal(put.body.matrix.tenant['gate.pass'], false);
    assert.equal(put.body.matrix.owner['gate.pass'], true);
    const denied = { error: 'Your role does not have access to this' };
    for (const [m, u, b] of [['POST', '/api/gate/passes', { visitor_name: 'V' }], ['GET', '/api/contacts'], ['GET', '/api/notices'], ['POST', '/api/emergencies', { type: 'fire' }], ['GET', '/api/lease']]) {
      const r = await t(m, u, b);
      assert.equal(r.status, 403, u);
      assert.deepEqual(r.body, denied);
    }
    assert.equal((await o('POST', '/api/gate/passes', { visitor_name: 'V' })).status, 201);
    assert.deepEqual((await t('GET', '/api/me')).body.permissions, []);
    // household still requires owner AND permission
    assert.equal((await t('POST', '/api/household', {})).status, 403);
    await admin('PUT', '/api/admin/access', { matrix: { family: { 'household.manage': true } } });
    assert.equal((await f('POST', '/api/household', { name: 'N', email: 'n@example.test', resident_type: 'family', password: PW, consent: true })).status, 403);
    assert.equal((await o('POST', '/api/household', { name: 'N', email: 'n@example.test', resident_type: 'family', password: PW, consent: true })).status, 201);
    // admin always passes
    assert.equal((await admin('GET', '/api/contacts')).status, 200);
    const audit = (await admin('GET', '/api/admin/audit')).body;
    assert.ok(audit.some(x => x.entity === 'access' && x.detail === 'tenant gate.pass: true -> false'));
  } finally { close(); }
});

test('user management: search, patch, suspend, reset password, remove, untouchable accounts', async () => {
  const { admin, client, person, close } = await boot();
  try {
    const u = await person('res1@example.test', 'C-3', 'tenant');
    const other = await person('other@example.test', 'D-4', 'owner');
    await admin('POST', '/api/admin/guards', { name: 'Gus', email: 'g2@example.test', password: PW });
    const guard = (await admin('GET', '/api/admin/guards')).body[0];
    // list: all non-guard, search
    const all = (await admin('GET', '/api/admin/users')).body;
    assert.ok(all.every(x => x.role !== 'guard') && all.length === 3);
    assert.deepEqual((await admin('GET', '/api/admin/users?q=C-3')).body.map(x => x.id), [u.id]);
    assert.deepEqual((await admin('GET', '/api/admin/users?q=other@')).body.map(x => x.id), [other.id]);
    assert.equal((await admin('GET', "/api/admin/users?q=' OR 1=1 --")).body.length, 0);
    assert.equal((await admin('GET', '/api/admin/users?q=%25')).body.length, 0);
    assert.equal((await u('GET', '/api/admin/users')).status, 403);
    assert.equal((await u('PATCH', `/api/admin/users/${other.id}`, { name: 'Z' })).status, 403);
    // patch
    const p = await admin('PATCH', `/api/admin/users/${u.id}`, { resident_type: 'owner', flat: 'C-9', name: 'New Name', phone: '99999' });
    assert.equal(p.status, 200);
    assert.equal(p.body.flat, 'C-9'); assert.equal(p.body.resident_type, 'owner'); assert.equal(p.body.role, 'resident');
    for (const bad of [{ resident_type: 'admin' }, { flat: 'x'.repeat(21) }, { name: '' }, { status: 'removed' }, { status: 'pending' }, { phone: 'x'.repeat(21) }])
      assert.equal((await admin('PATCH', `/api/admin/users/${u.id}`, bad)).status, 400);
    const adminId = (await admin('GET', '/api/me')).body.id;
    assert.equal((await admin('PATCH', `/api/admin/users/${adminId}`, { name: 'Hacked' })).status, 404);
    assert.equal((await admin('PATCH', `/api/admin/users/${guard.id}`, { name: 'Hacked' })).status, 404);
    assert.equal((await admin('DELETE', `/api/admin/users/${adminId}`)).status, 404);
    assert.equal((await admin('DELETE', `/api/admin/users/${guard.id}`)).status, 404);
    assert.equal((await admin('POST', `/api/admin/users/${adminId}/reset-password`, { password: 'Another1234' })).status, 404);
    assert.equal((await admin('PATCH', '/api/admin/users/99999', { name: 'Z' })).status, 404);
    // role cannot be changed
    await admin('PATCH', `/api/admin/users/${u.id}`, { role: 'admin' });
    assert.equal((await u('GET', '/api/admin/users')).status, 403);
    // suspend
    assert.equal((await admin('PATCH', `/api/admin/users/${u.id}`, { status: 'suspended' })).status, 200);
    assert.equal((await u('GET', '/api/me')).status, 401);
    const login = await client()('POST', '/api/login', { email: 'res1@example.test', password: PW });
    assert.equal(login.status, 403);
    assert.equal(login.body.error, 'Your account is suspended. Contact the committee.');
    assert.equal((await admin('PATCH', `/api/admin/users/${u.id}`, { status: 'approved' })).status, 200);
    assert.equal((await client()('POST', '/api/login', { email: 'res1@example.test', password: PW })).status, 200);
    // reset password: old session dies, old password fails, new works
    const s = client(); await s('POST', '/api/login', { email: 'res1@example.test', password: PW });
    assert.equal((await s('GET', '/api/me')).status, 200);
    assert.equal((await admin('POST', `/api/admin/users/${u.id}/reset-password`, { password: 'short' })).status, 400);
    assert.equal((await other('POST', `/api/admin/users/${u.id}/reset-password`, { password: 'Another1234' })).status, 403);
    assert.equal((await admin('POST', `/api/admin/users/${u.id}/reset-password`, { password: 'Another1234' })).status, 200);
    assert.equal((await s('GET', '/api/me')).status, 401);
    assert.equal((await client()('POST', '/api/login', { email: 'res1@example.test', password: PW })).status, 401);
    assert.equal((await client()('POST', '/api/login', { email: 'res1@example.test', password: 'Another1234' })).status, 200);
    // own password change keeps own session
    assert.equal((await other('POST', '/api/me/password', { current: PW, next: 'Changed12345' })).status, 200);
    assert.equal((await other('GET', '/api/me')).status, 200);
    // soft remove
    assert.equal((await admin('DELETE', `/api/admin/users/${u.id}`)).status, 200);
    assert.equal((await client()('POST', '/api/login', { email: 'res1@example.test', password: 'Another1234' })).status, 403);
    assert.equal((await admin('PATCH', `/api/admin/users/${u.id}`, { name: 'Again' })).status, 404);
    assert.ok((await admin('GET', '/api/admin/users?status=removed')).body.some(x => x.id === u.id));
    assert.equal((await admin('GET', '/api/admin/users?status=pending')).body.some(x => x.id === u.id), false);
    const audit = (await admin('GET', '/api/admin/audit')).body.map(a => a.action);
    for (const a of ['suspended', 'reinstated', 'updated', 'password_reset', 'removed']) assert.ok(audit.includes(a), a);
  } finally { close(); }
});

test('removed users vanish from household lists', async () => {
  const { admin, person, close } = await boot();
  try {
    const o = await person('o3@example.test', 'E-1', 'owner');
    const t = await person('t3@example.test', 'E-1', 'tenant');
    assert.equal((await o('GET', '/api/household')).body.length, 2);
    await admin('DELETE', `/api/admin/users/${t.id}`);
    assert.equal((await o('GET', '/api/household')).body.length, 1);
  } finally { close(); }
});

test('google sign-in with injected verifier', async () => {
  let claims;
  const now = () => Math.floor(Date.now() / 1000);
  const good = email => ({ aud: CID, iss: 'https://accounts.google.com', email, email_verified: true, exp: now() + 600 });
  const { admin, client, person, close } = await boot({ googleVerify: async cred => { if (cred === 'boom') throw new Error('bad'); return claims; } });
  try {
    await person('gu@example.test', 'F-1', 'owner');
    await person('pend@example.test', 'F-2', 'tenant', false);
    const post = (cred = 'tok') => client()('POST', '/api/auth/google', { credential: cred });
    // not set up
    claims = good('gu@example.test');
    const ns = await post();
    assert.equal(ns.status, 404); assert.equal(ns.body.error, 'Google sign-in is not set up');
    assert.equal((await admin('PUT', '/api/admin/settings', { google_client_id: CID })).status, 200);
    // success
    const c = client();
    const ok = await c('POST', '/api/auth/google', { credential: 'tok' });
    assert.equal(ok.status, 200); assert.equal(ok.body.email, 'gu@example.test');
    assert.equal((await c('GET', '/api/me')).status, 200);
    claims = good('GU@Example.test');
    assert.equal((await post()).status, 200); // case-insensitive
    assert.ok((await admin('GET', '/api/admin/audit')).body.some(a => a.action === 'login' && a.detail === 'method google'));
    // failures
    claims = good('nobody@example.test');
    const unk = await post();
    assert.equal(unk.status, 404); assert.equal(unk.body.error, 'No account for this Google email. Join first, then sign in.');
    assert.equal((await client()('GET', '/api/me')).status, 401);
    claims = { ...good('gu@example.test'), email_verified: false };
    assert.equal((await post()).status, 401);
    claims = { ...good('gu@example.test'), email_verified: 'false' };
    assert.equal((await post()).status, 401);
    claims = { ...good('gu@example.test'), aud: 'other-client' };
    assert.equal((await post()).status, 401);
    claims = { ...good('gu@example.test'), iss: 'https://evil.example' };
    assert.equal((await post()).status, 401);
    claims = { ...good('gu@example.test'), exp: now() - 10 };
    assert.equal((await post()).status, 401);
    assert.equal((await post('boom')).status, 401);
    assert.equal((await client()('POST', '/api/auth/google', {})).status, 400);
    claims = good('pend@example.test');
    assert.equal((await post()).status, 403);
    // suspended
    claims = good('gu@example.test');
    const gu = (await admin('GET', '/api/admin/users?q=gu@')).body[0];
    await admin('PATCH', `/api/admin/users/${gu.id}`, { status: 'suspended' });
    const sus = await post();
    assert.equal(sus.status, 403); assert.match(sus.body.error, /suspended/);
    // never auto-creates
    assert.equal((await admin('GET', '/api/admin/users?q=nobody')).body.length, 0);
  } finally { close(); }
});

test('CSP includes Google hosts only when a client id is configured', async () => {
  const { admin, client, close } = await boot();
  try {
    const before = (await client()('GET', '/api/settings')).headers.get('content-security-policy');
    assert.ok(!before.includes('google'));
    assert.ok(before.includes("script-src 'self';") && before.includes("frame-ancestors 'none'"));
    await admin('PUT', '/api/admin/settings', { google_client_id: CID });
    const after = (await client()('GET', '/api/settings')).headers.get('content-security-policy');
    for (const h of ['script-src \'self\' https://accounts.google.com/gsi/client', 'connect-src \'self\' https://accounts.google.com/gsi/', 'frame-src https://accounts.google.com/gsi/',
      'https://accounts.google.com/gsi/style', 'https://*.googleusercontent.com', "frame-ancestors 'none'", "object-src 'none'"]) assert.ok(after.includes(h), h);
    await admin('PUT', '/api/admin/settings', { google_client_id: '' });
    assert.ok(!(await client()('GET', '/api/settings')).headers.get('content-security-policy').includes('google'));
  } finally { close(); }
});
