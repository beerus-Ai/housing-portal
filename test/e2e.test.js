const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';

// Fresh app, temp DB, ephemeral port per call so tests are independent.
async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-e2e-'));
  const app = createApp({ dbFile: path.join(dir, 'e.db'), uploadDir: path.join(dir, 'up') });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (method, url, body, form) => {
      const headers = { cookie };
      if (body) headers['content-type'] = 'application/json';
      const res = await fetch(base + url, { method, headers, body: form || (body && JSON.stringify(body)) });
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
  // register + approve + login; returns logged-in client
  const person = async (email, flat, type) => {
    const c = client();
    assert.equal((await client()('POST', '/api/register', { name: email.split('@')[0], email, flat, resident_type: type, password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    assert.equal((await admin('POST', `/api/admin/users/${p.id}/approve`)).status, 200);
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    c.id = p.id;
    return c;
  };
  const request = async (c, title = 'Leak') => {
    const f = new FormData(); f.set('category', 'plumbing'); f.set('title', title);
    const r = await c('POST', '/api/requests', null, f);
    assert.equal(r.status, 201);
    return r.body.id;
  };
  return { admin, client, person, request, close };
}

test('empty database: only admin, empty lists, no demo data', async () => {
  const { admin, client, close } = await boot();
  try {
    const users = (await admin('GET', '/api/admin/users')).body;
    assert.equal(users.length, 1);
    assert.equal(users[0].role, 'admin');
    assert.deepEqual((await admin('GET', '/api/requests')).body, []);
    assert.deepEqual((await admin('GET', '/api/notices')).body, []);
    assert.deepEqual((await admin('GET', '/api/vendors')).body, []);
    assert.deepEqual((await admin('GET', '/api/admin/leases')).body, []);
    assert.deepEqual((await admin('GET', '/api/notifications')).body, []);
    const stats = (await admin('GET', '/api/admin/stats')).body;
    assert.equal(stats.sla.total, 0);
    assert.equal(stats.pending_users, 0);
    // only the admin's own login is audited
    assert.ok((await admin('GET', '/api/admin/audit')).body.every(a => a.action === 'login'));
    assert.equal((await client()('GET', '/healthz')).status, 200);
  } finally { close(); }
});

test('register -> admin approve -> login', async () => {
  const { admin, client, close } = await boot();
  try {
    const email = 'new@example.test';
    const reg = { name: 'New One', email, flat: 'A-1', resident_type: 'owner', password: PW, consent: true };
    const c = client();
    assert.equal((await client()('POST', '/api/register', reg)).status, 201);
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 403); // pending
    assert.equal((await c('GET', '/api/me')).status, 401);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body;
    assert.equal(p.length, 1);
    // admin was notified of the registration
    assert.ok((await admin('GET', '/api/notifications')).body.some(n => /awaiting approval/.test(n.message)));
    await admin('POST', `/api/admin/users/${p[0].id}/approve`);
    assert.equal((await c('POST', '/api/login', { email, password: 'wrong-pass' })).status, 401);
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    assert.equal((await c('GET', '/api/me')).body.email, email);
    const audit = (await admin('GET', '/api/admin/audit')).body;
    assert.ok(audit.some(a => a.entity === 'user' && a.action === 'registered'));
    assert.ok(audit.some(a => a.entity === 'user' && a.action === 'approve'));
  } finally { close(); }
});

test('request lifecycle with owner-only rating, audit entries per change', async () => {
  const { admin, person, request, close } = await boot();
  try {
    const owner = await person('o@example.test', 'A-1', 'owner');
    const id = await request(owner, 'Leaking tap');
    const get = async c => (await c('GET', `/api/requests/${id}`)).body;
    assert.equal((await get(owner)).status, 'open');

    const v = (await admin('POST', '/api/vendors', { name: 'Vend', trade: 'plumbing' })).body.id;
    assert.equal((await admin('POST', `/api/requests/${id}/status`, { status: 'in_progress' })).status, 409); // vendor needed
    assert.equal((await admin('POST', `/api/requests/${id}/assign`, { vendor_id: v })).status, 200);
    assert.equal((await get(owner)).status, 'assigned');
    assert.equal((await admin('POST', `/api/requests/${id}/status`, { status: 'in_progress', note: 'on site' })).status, 200);
    assert.equal((await admin('POST', `/api/requests/${id}/status`, { status: 'assigned' })).status, 409); // forward only
    assert.equal((await owner('POST', `/api/requests/${id}/status`, { status: 'closed' })).status, 403); // admin only
    assert.equal((await owner('POST', `/api/requests/${id}/rate`, { rating: 5 })).status, 409); // not closed yet
    assert.equal((await admin('POST', `/api/requests/${id}/status`, { status: 'closed' })).status, 200);
    assert.equal((await admin('POST', `/api/requests/${id}/rate`, { rating: 5 })).status, 403); // admin never rates
    assert.equal((await owner('POST', `/api/requests/${id}/rate`, { rating: 0 })).status, 400);
    assert.equal((await owner('POST', `/api/requests/${id}/rate`, { rating: 4 })).status, 200);
    assert.equal((await owner('POST', `/api/requests/${id}/rate`, { rating: 4 })).status, 409); // once
    assert.equal((await admin('POST', `/api/requests/${id}/status`, { status: 'in_progress' })).status, 409); // closed is final

    const d = await get(owner);
    assert.equal(d.rating, 4);
    assert.deepEqual(d.history.map(h => h.action), ['created', 'assigned', 'status', 'status', 'rated']);
    assert.match(d.history[2].detail, /assigned -> in_progress: on site/);
    assert.match(d.history[3].detail, /in_progress -> closed/);
    // audit endpoint carries the same request entries
    const audit = (await admin('GET', '/api/admin/audit')).body.filter(a => a.entity === 'request' && a.entity_id === id);
    assert.deepEqual(audit.map(a => a.action).reverse(), ['created', 'assigned', 'status', 'status', 'rated']);
    // owner got a notification for each admin-driven change
    const msgs = (await owner('GET', '/api/notifications')).body.map(n => n.message).join('|');
    assert.match(msgs, /assigned to Vend/);
    assert.match(msgs, /in progress/);
    assert.match(msgs, /now closed/);
  } finally { close(); }
});

test('flat-wide visibility; family never rates, owner rates for them', async () => {
  const { admin, client, person, request, close } = await boot();
  try {
    const owner = await person('o@example.test', 'A-1', 'owner');
    const other = await person('x@example.test', 'B-2', 'owner');
    const add = { name: 'Fam', email: 'f@example.test', resident_type: 'family', password: PW, consent: true };
    assert.equal((await owner('POST', '/api/household', add)).status, 201);
    const fid = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === add.email).id;
    await admin('POST', `/api/admin/users/${fid}/approve`);
    const family = client();
    assert.equal((await family('POST', '/api/login', { email: add.email, password: PW })).status, 200);

    const id = await request(owner, 'Owner request');
    const fid2 = await request(family, 'Family request');
    const ids = async c => (await c('GET', '/api/requests')).body.map(r => r.id).sort();
    assert.deepEqual(await ids(family), [id, fid2].sort());
    assert.deepEqual(await ids(owner), [id, fid2].sort());
    assert.deepEqual(await ids(other), []);
    assert.equal((await other('GET', `/api/requests/${id}`)).status, 404);
    assert.equal((await other('POST', `/api/requests/${id}/comments`, { body: 'hi' })).status, 404);
    assert.equal((await family('GET', `/api/requests/${id}`)).status, 200);

    const v = (await admin('POST', '/api/vendors', { name: 'Vend', trade: 'plumbing' })).body.id;
    await admin('POST', `/api/requests/${fid2}/assign`, { vendor_id: v });
    await admin('POST', `/api/requests/${fid2}/status`, { status: 'closed' });
    assert.equal((await family('GET', `/api/requests/${fid2}`)).body.can_rate, false);
    assert.equal((await family('POST', `/api/requests/${fid2}/rate`, { rating: 5 })).status, 403);
    assert.equal((await other('POST', `/api/requests/${fid2}/rate`, { rating: 5 })).status, 404);
    assert.equal((await owner('GET', `/api/requests/${fid2}`)).body.can_rate, true);
    assert.equal((await owner('POST', `/api/requests/${fid2}/rate`, { rating: 5 })).status, 200);
    assert.ok((await family('GET', '/api/notifications')).body.some(n => /rated 5 of 5/.test(n.message)));
  } finally { close(); }
});

test('role denials: unauthenticated 401, resident 403 on admin routes, lease privacy', async () => {
  const { admin, client, person, close } = await boot();
  try {
    const anon = client();
    for (const [m, u] of [['GET', '/api/requests'], ['GET', '/api/notices'], ['GET', '/api/me'], ['GET', '/api/lease'],
      ['GET', '/api/notifications'], ['GET', '/api/admin/users'], ['GET', '/api/admin/audit']]) {
      assert.equal((await anon(m, u)).status, 401, `${m} ${u}`);
    }
    const res = await person('r@example.test', 'A-1', 'owner');
    for (const [m, u, b] of [['GET', '/api/admin/users'], ['GET', '/api/admin/stats'], ['GET', '/api/admin/audit'],
      ['GET', '/api/admin/leases'], ['GET', '/api/admin/export.csv'], ['GET', '/api/vendors'],
      ['POST', '/api/vendors', { name: 'x', trade: 'y' }], ['POST', '/api/notices', { title: 't', body: 'b' }],
      ['POST', '/api/admin/users/1/approve']]) {
      assert.equal((await res(m, u, b)).status, 403, `${m} ${u}`);
    }
    const t1 = await person('t1@example.test', 'C-1', 'tenant');
    const t2 = await person('t2@example.test', 'C-2', 'tenant');
    const lease = { start_date: '2026-01-01', end_date: '2027-01-01', owner_name: 'Lessor One' };
    assert.equal((await admin('PUT', `/api/admin/users/${t1.id}/lease`, lease)).status, 200);
    assert.equal((await t1('GET', '/api/lease')).body.owner_name, 'Lessor One');
    assert.equal((await t2('GET', '/api/lease')).body, null);
    assert.equal((await t2('PUT', `/api/admin/users/${t1.id}/lease`, lease)).status, 403);
    assert.equal((await t2('GET', `/api/admin/users/${t1.id}`)).status, 403);
    assert.equal((await t2('GET', '/api/admin/leases')).status, 403);
    await t1('POST', '/api/logout');
    assert.equal((await t1('GET', '/api/lease')).status, 401);
  } finally { close(); }
});

test('notices and unread alerts', async () => {
  const { admin, person, close } = await boot();
  try {
    const r = await person('r@example.test', 'A-1', 'owner');
    assert.equal((await r('GET', '/api/notifications/unread-count')).body.n, 0);
    assert.equal((await r('POST', '/api/notices', { title: 'x', body: 'y' })).status, 403);
    assert.equal((await admin('POST', '/api/notices', { title: '', body: 'y' })).status, 400);
    const nid = (await admin('POST', '/api/notices', { title: 'Water cut', body: 'Tuesday' })).body.id;
    assert.equal((await r('GET', '/api/notices')).body[0].title, 'Water cut');
    assert.equal((await r('GET', '/api/notifications/unread-count')).body.n, 1);
    assert.match((await r('GET', '/api/notifications')).body[0].message, /Water cut/);
    await r('POST', '/api/notifications/read');
    assert.equal((await r('GET', '/api/notifications/unread-count')).body.n, 0);
    await admin('POST', '/api/notices', { title: 'Second', body: 'z' });
    assert.equal((await r('GET', '/api/notifications/unread-count')).body.n, 1);
    assert.equal((await admin('DELETE', `/api/notices/${nid}`)).status, 200);
    assert.equal((await r('GET', '/api/notices')).body.length, 1);
    const audit = (await admin('GET', '/api/admin/audit')).body;
    assert.equal(audit.filter(a => a.entity === 'notice' && a.action === 'posted').length, 2);
    assert.ok(audit.some(a => a.entity === 'notice' && a.action === 'deleted'));
  } finally { close(); }
});
