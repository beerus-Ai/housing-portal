const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-gate-'));
  const app = createApp({ dbFile: path.join(dir, 'g.db'), uploadDir: path.join(dir, 'up') });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (method, url, body) => {
      const headers = { cookie };
      if (body) headers['content-type'] = 'application/json';
      const res = await fetch(base + url, { method, headers, body: body && JSON.stringify(body) });
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { json = text; }
      return { status: res.status, body: json };
    };
  };
  const admin = client();
  await admin('POST', '/api/login', ADMIN);
  const close = () => { server.close(); try { app.locals.db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); };
  const person = async (email, flat, type) => {
    const c = client();
    assert.equal((await client()('POST', '/api/register', { name: email.split('@')[0], email, flat, resident_type: type, password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    assert.equal((await admin('POST', `/api/admin/users/${p.id}/approve`)).status, 200);
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    c.id = p.id;
    return c;
  };
  const guard = async (email = 'guard@society.test') => {
    const c = client();
    const r = await admin('POST', '/api/admin/guards', { name: 'Gate Guard', email, password: PW });
    assert.equal(r.status, 201);
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    c.id = r.body.id;
    return c;
  };
  return { admin, client, person, guard, close };
}
const at = ms => new Date(Date.now() + ms).toISOString();
const H = 3600e3;

test('guard accounts: admin-only management, validation, login', async () => {
  const { admin, client, person, guard, close } = await boot();
  try {
    const res = await person('own@t.test', 'A-101', 'owner');
    assert.equal((await res('POST', '/api/admin/guards', { name: 'G', email: 'g@t.test', password: PW })).status, 403);
    assert.equal((await res('GET', '/api/admin/guards')).status, 403);
    assert.equal((await admin('POST', '/api/admin/guards', { name: 'G', email: 'bad', password: PW })).status, 400);
    assert.equal((await admin('POST', '/api/admin/guards', { name: 'G', email: 'g@t.test', password: 'short' })).status, 400);
    const g = await guard('g@t.test');
    assert.equal((await admin('POST', '/api/admin/guards', { name: 'G', email: 'g@t.test', password: PW })).status, 409);
    const me = (await g('GET', '/api/me')).body;
    assert.equal(me.role, 'guard'); assert.equal(me.flat, null);
    const list = (await admin('GET', '/api/admin/guards')).body;
    assert.equal(list.length, 1); assert.equal(list[0].email, 'g@t.test');
    assert.ok(!('password_hash' in list[0]));
    assert.equal((await g('DELETE', `/api/admin/guards/${g.id}`)).status, 403);
    assert.equal((await admin('DELETE', `/api/admin/guards/${res.id}`)).status, 404); // not a guard
    assert.equal((await admin('DELETE', `/api/admin/guards/${g.id}`)).status, 200);
    assert.equal((await g('GET', '/api/me')).status, 401);
    const audit = (await admin('GET', '/api/admin/audit')).body.map(a => a.action);
    assert.ok(audit.includes('guard_created') && audit.includes('guard_deleted'));
    assert.equal((await client()('POST', '/api/login', { email: 'g@t.test', password: PW })).status, 401);
  } finally { close(); }
});

test('guard allow-list: everything else is 403', async () => {
  const { admin, person, guard, close } = await boot();
  try {
    const owner = await person('own@t.test', 'A-101', 'owner');
    await admin('POST', '/api/notices', { title: 'T', body: 'B' });
    const g = await guard();
    for (const [m, u] of [['GET', '/api/requests'], ['GET', '/api/household'], ['GET', '/api/notices'], ['GET', '/api/emergencies'], ['GET', '/api/contacts'],
      ['GET', '/api/lease'], ['GET', '/api/gate/passes'], ['GET', '/api/gate/me'], ['GET', '/api/admin/users'],
      ['GET', '/api/admin/stats'], ['GET', '/api/admin/audit'], ['GET', '/api/admin/guards'], ['PATCH', '/api/me']]) {
      const r = await g(m, u, m === 'PATCH' ? { name: 'x' } : undefined);
      assert.equal(r.status, 403, `${m} ${u}`);
    }
    assert.equal((await g('POST', '/api/emergencies', { type: 'fire' })).status, 403);
    assert.equal((await g('POST', '/api/gate/passes', { visitor_name: 'V' })).status, 403);
    assert.equal((await g('POST', '/api/gate/me/rotate')).status, 403);
    assert.equal((await g('POST', '/api/gate/passes/1/cancel')).status, 403);
    // the live-update poll must work for guards (else the app treats the 403 as a dead session) but reveal nothing about residents
    const pulse = await g('GET', '/api/pulse');
    assert.equal(pulse.status, 200);
    assert.match(String(pulse.body.v), /^[0-9]+$/);
    // allowed
    assert.equal((await g('GET', '/api/me')).status, 200);
    assert.equal((await g('GET', '/api/notifications')).status, 200);
    assert.equal((await g('GET', '/api/notifications/unread-count')).status, 200);
    assert.equal((await g('POST', '/api/notifications/read')).status, 200);
    assert.equal((await g('GET', '/api/gate/log')).status, 200);
    assert.equal((await g('POST', '/api/me/password', { current: PW, next: 'N3wPassw0rd!' })).status, 200);
    assert.equal((await g('POST', '/api/logout')).status, 200);
    void owner;
  } finally { close(); }
});

test('visitor passes: create, list, cancel, validation, isolation', async () => {
  const { admin, person, close } = await boot();
  try {
    const owner = await person('own@t.test', 'A-101', 'owner');
    const fam = await person('fam@t.test', 'A-101', 'family');
    const other = await person('oth@t.test', 'B-202', 'owner');
    assert.equal((await admin('POST', '/api/gate/passes', { visitor_name: 'V' })).status, 403);
    assert.equal((await owner('POST', '/api/gate/passes', { visitor_name: '  ' })).status, 400);
    assert.equal((await owner('POST', '/api/gate/passes', { visitor_name: 'x'.repeat(101) })).status, 400);
    assert.equal((await owner('POST', '/api/gate/passes', { visitor_name: 'V', purpose: 'p'.repeat(201) })).status, 400);
    assert.equal((await owner('POST', '/api/gate/passes', { visitor_name: 'V', valid_from: 'garbage' })).status, 400);
    assert.equal((await owner('POST', '/api/gate/passes', { visitor_name: 'V', valid_from: at(H), valid_until: at(0) })).status, 400);
    assert.equal((await owner('POST', '/api/gate/passes', { visitor_name: 'V', valid_from: at(0), valid_until: at(8 * 24 * H) })).status, 400);
    const ok = await owner('POST', '/api/gate/passes', { visitor_name: 'Courier', purpose: 'Parcel', valid_from: at(0), valid_until: at(7 * 24 * H - 1000) });
    assert.equal(ok.status, 201);
    assert.match(ok.body.token, /^[0-9a-f]{24}$/);
    assert.match(ok.body.code, /^\d{6}$/);
    assert.equal(ok.body.qr, 'HSP:' + ok.body.token);
    const dflt = await owner('POST', '/api/gate/passes', { visitor_name: 'Default' });
    assert.equal(dflt.status, 201);
    const mine = (await owner('GET', '/api/gate/passes')).body;
    assert.equal(mine.length, 2);
    const row = mine.find(p => p.id === ok.body.id);
    assert.equal(row.status, 'active'); assert.equal(row.created_by_name, 'own'); assert.equal(row.flat, 'A-101');
    assert.match(row.valid_from, /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/);
    // flat sibling sees them, other flat sees nothing, admin sees all
    assert.equal((await fam('GET', '/api/gate/passes')).body.length, 2);
    assert.deepEqual((await other('GET', '/api/gate/passes')).body, []);
    assert.equal((await admin('GET', '/api/gate/passes')).body.length, 2);
    // cancel permissions: other flat cannot see it; family non-creator cannot cancel; owner can
    assert.equal((await other('POST', `/api/gate/passes/${ok.body.id}/cancel`)).status, 404);
    assert.equal((await fam('POST', `/api/gate/passes/${ok.body.id}/cancel`)).status, 403);
    assert.equal((await owner('POST', `/api/gate/passes/${ok.body.id}/cancel`)).status, 200);
    assert.equal((await owner('POST', `/api/gate/passes/${ok.body.id}/cancel`)).status, 409);
    assert.equal((await owner('GET', '/api/gate/passes')).body.find(p => p.id === ok.body.id).status, 'cancelled');
    // creator family can cancel own; admin can cancel any
    const fp = await fam('POST', '/api/gate/passes', { visitor_name: 'Friend' });
    assert.equal((await fam('POST', `/api/gate/passes/${fp.body.id}/cancel`)).status, 200);
    assert.equal((await admin('POST', `/api/gate/passes/${dflt.body.id}/cancel`)).status, 200);
    const audit = (await admin('GET', '/api/admin/audit')).body.filter(a => a.entity === 'gate_pass').map(a => a.action);
    assert.ok(audit.includes('created') && audit.includes('cancelled'));
  } finally { close(); }
});

test('per-flat cap of 10 active passes', async () => {
  const { person, close } = await boot();
  try {
    const owner = await person('own@t.test', 'A-101', 'owner');
    const other = await person('oth@t.test', 'B-202', 'owner');
    const ids = [];
    for (let i = 0; i < 10; i++) {
      const r = await owner('POST', '/api/gate/passes', { visitor_name: 'V' + i });
      assert.equal(r.status, 201);
      ids.push(r.body.id);
    }
    const over = await owner('POST', '/api/gate/passes', { visitor_name: 'Eleven' });
    assert.equal(over.status, 429);
    assert.match(over.body.error, /10 active/);
    assert.equal((await other('POST', '/api/gate/passes', { visitor_name: 'Fine' })).status, 201);
    assert.equal((await owner('POST', `/api/gate/passes/${ids[0]}/cancel`)).status, 200);
    assert.equal((await owner('POST', '/api/gate/passes', { visitor_name: 'Again' })).status, 201);
  } finally { close(); }
});

test('verify visitor pass by code and token, single use, notifies creator', async () => {
  const { person, guard, close } = await boot();
  try {
    const owner = await person('own@t.test', 'A-101', 'owner');
    const g = await guard();
    const a = (await owner('POST', '/api/gate/passes', { visitor_name: 'Plumber', purpose: 'Leak' })).body;
    const r1 = await g('POST', '/api/gate/verify', { code: a.code });
    assert.equal(r1.status, 200);
    assert.deepEqual(r1.body, { result: 'allowed', kind: 'visitor', name: 'Plumber', flat: 'A-101', purpose: 'Leak' });
    const r2 = await g('POST', '/api/gate/verify', { code: a.code });
    assert.equal(r2.body.result, 'denied'); assert.equal(r2.body.reason, 'used');
    const r3 = await g('POST', '/api/gate/verify', { token: a.qr });
    assert.equal(r3.body.reason, 'used');
    assert.equal((await owner('GET', '/api/gate/passes')).body[0].status, 'used');
    assert.ok((await owner('GET', '/api/notifications')).body.some(n => n.message === 'Your visitor Plumber has entered'));
    // by token with prefix and whitespace
    const b = (await owner('POST', '/api/gate/passes', { visitor_name: 'Guest' })).body;
    const t = await g('POST', '/api/gate/verify', { token: `  HSP:${b.token}  ` });
    assert.equal(t.body.result, 'allowed'); assert.equal(t.body.name, 'Guest');
    // cancelled
    const c = (await owner('POST', '/api/gate/passes', { visitor_name: 'Cancelled' })).body;
    await owner('POST', `/api/gate/passes/${c.id}/cancel`);
    assert.equal((await g('POST', '/api/gate/verify', { code: c.code })).body.reason, 'cancelled');
    // unknown reveals nothing
    const u = await g('POST', '/api/gate/verify', { code: '000000' });
    assert.deepEqual(u.body, { result: 'denied', reason: 'unknown' });
    assert.deepEqual((await g('POST', '/api/gate/verify', { token: 'HSP:' + 'a'.repeat(24) })).body, { result: 'denied', reason: 'unknown' });
    assert.equal((await g('POST', '/api/gate/verify', {})).status, 400);
  } finally { close(); }
});

test('verify: expired and not-yet-valid windows', async () => {
  const { person, guard, close } = await boot();
  try {
    const owner = await person('own@t.test', 'A-101', 'owner');
    const g = await guard();
    const past = (await owner('POST', '/api/gate/passes', { visitor_name: 'Late', valid_from: at(-2 * H), valid_until: at(-H) })).body;
    const future = (await owner('POST', '/api/gate/passes', { visitor_name: 'Early', valid_from: at(H), valid_until: at(2 * H) })).body;
    assert.equal((await g('POST', '/api/gate/verify', { code: past.code })).body.reason, 'expired');
    assert.equal((await g('POST', '/api/gate/verify', { token: future.token })).body.reason, 'not_yet_valid');
    const list = (await owner('GET', '/api/gate/passes')).body;
    assert.equal(list.find(p => p.id === past.id).status, 'expired');
    assert.equal(list.find(p => p.id === future.id).status, 'active');
    // a denied attempt must not consume the pass
    assert.equal(list.find(p => p.id === future.id).used_at, null);
  } finally { close(); }
});

test('resident token: verify as QR/NFC payload, reusable, rotate invalidates old', async () => {
  const { admin, person, guard, close } = await boot();
  try {
    const owner = await person('own@t.test', 'A-101', 'owner');
    const g = await guard();
    assert.equal((await admin('GET', '/api/gate/me')).status, 403);
    const me = (await owner('GET', '/api/gate/me')).body;
    assert.match(me.token, /^[0-9a-f]{24}$/);
    assert.equal(me.qr, 'HSP:' + me.token); assert.equal(me.nfc, me.qr);
    assert.equal((await owner('GET', '/api/gate/me')).body.token, me.token); // stable
    for (let i = 0; i < 2; i++) {
      const r = await g('POST', '/api/gate/verify', { token: me.nfc });
      assert.deepEqual(r.body, { result: 'allowed', kind: 'resident', name: 'own', flat: 'A-101' });
    }
    const rot = await owner('POST', '/api/gate/me/rotate');
    assert.equal(rot.status, 200); assert.notEqual(rot.body.token, me.token);
    assert.deepEqual((await g('POST', '/api/gate/verify', { token: me.qr })).body, { result: 'denied', reason: 'unknown' });
    assert.equal((await g('POST', '/api/gate/verify', { token: rot.body.qr })).body.result, 'allowed');
    assert.ok((await admin('GET', '/api/admin/audit')).body.some(a => a.entity === 'resident_token' && a.action === 'rotated'));
  } finally { close(); }
});

test('residents cannot verify or read the log; guard cannot be a pass creator', async () => {
  const { admin, person, guard, close } = await boot();
  try {
    const owner = await person('own@t.test', 'A-101', 'owner');
    const g = await guard();
    const p = (await owner('POST', '/api/gate/passes', { visitor_name: 'V' })).body;
    assert.equal((await owner('POST', '/api/gate/verify', { code: p.code })).status, 403);
    assert.equal((await owner('GET', '/api/gate/log')).status, 403);
    assert.equal((await g('POST', '/api/gate/passes', { visitor_name: 'V' })).status, 403);
    // admin may verify (gate middleware)
    assert.equal((await admin('POST', '/api/gate/verify', { code: p.code })).body.result, 'allowed');
  } finally { close(); }
});

test('brute force: 10 denied checks then 429, per guard', async () => {
  const { guard, close } = await boot();
  try {
    const g = await guard();
    const g2 = await guard('g2@society.test');
    for (let i = 0; i < 10; i++) {
      const r = await g('POST', '/api/gate/verify', { code: String(100000 + i) });
      assert.equal(r.status, 200); assert.equal(r.body.result, 'denied');
    }
    const blocked = await g('POST', '/api/gate/verify', { code: '123456' });
    assert.equal(blocked.status, 429);
    assert.equal((await g2('POST', '/api/gate/verify', { code: '123456' })).status, 200);
  } finally { close(); }
});

test('gate log records every attempt with guard name', async () => {
  const { admin, person, guard, close } = await boot();
  try {
    const owner = await person('own@t.test', 'A-101', 'owner');
    const g = await guard();
    const p = (await owner('POST', '/api/gate/passes', { visitor_name: 'Visitor' })).body;
    const me = (await owner('GET', '/api/gate/me')).body;
    await g('POST', '/api/gate/verify', { code: p.code });
    await g('POST', '/api/gate/verify', { code: p.code });
    await g('POST', '/api/gate/verify', { token: me.qr });
    await g('POST', '/api/gate/verify', { code: '000001' });
    const log = (await g('GET', '/api/gate/log')).body;
    assert.equal(log.length, 4);
    assert.deepEqual(log.map(l => [l.kind, l.result, l.reason]), [
      ['unknown', 'denied', 'unknown'], ['resident', 'allowed', null], ['visitor', 'denied', 'used'], ['visitor', 'allowed', null]]);
    assert.equal(log[3].subject, 'Visitor'); assert.equal(log[3].flat, 'A-101'); assert.equal(log[0].guard_name, 'Gate Guard');
    assert.equal(JSON.stringify(log).includes(p.token), false);
    assert.equal((await admin('GET', '/api/gate/log')).body.length, 4);
    assert.ok((await admin('GET', '/api/admin/audit')).body.some(a => a.entity === 'gate_pass' && a.action === 'used'));
  } finally { close(); }
});
