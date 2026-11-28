const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-'));
let base, server;

test.before(async () => {
  const app = createApp({ dbFile: path.join(dir, 't.db'), uploadDir: path.join(dir, 'up') });
  await new Promise(r => { server = app.listen(0, r); });
  base = `http://localhost:${server.address().port}`;
});
test.after(() => server.close());

function client() {
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
}

const reg = { name: 'Test Resident', email: 'res@example.test', flat: 'A-101', resident_type: 'tenant', password: 'Passw0rd!', consent: true };

test('end-to-end: register, approve, raise, assign, close, rate, audit', async () => {
  const anon = client(), admin = client(), res = client();

  assert.equal((await anon('GET', '/api/requests')).status, 401);
  assert.equal((await anon('POST', '/api/register', { ...reg, consent: false })).status, 400);
  assert.equal((await anon('POST', '/api/register', reg)).status, 201);
  assert.equal((await anon('POST', '/api/register', reg)).status, 409);
  assert.equal((await res('POST', '/api/login', { email: reg.email, password: reg.password })).status, 403); // pending

  assert.equal((await admin('POST', '/api/login', { email: 'admin@society.test', password: 'Admin@1234' })).status, 200);
  const pending = (await admin('GET', '/api/admin/users?status=pending')).body;
  assert.equal(pending.length, 1);
  assert.equal((await admin('POST', `/api/admin/users/${pending[0].id}/approve`)).status, 200);

  assert.equal((await res('POST', '/api/login', { email: reg.email, password: reg.password })).status, 200);
  assert.equal((await res('GET', '/api/admin/users')).status, 403); // role-based access

  const form = new FormData();
  form.set('category', 'plumbing'); form.set('title', 'Leaking tap'); form.set('description', 'Kitchen');
  form.set('photo', new Blob([Buffer.from([0xff, 0xd8, 0xff])], { type: 'image/jpeg' }), 'p.jpg');
  const created = await res('POST', '/api/requests', null, form);
  assert.equal(created.status, 201);
  const id = created.body.id;
  assert.equal((await res('GET', `/api/requests/${id}/photo`)).status, 200);

  const vend = await admin('POST', '/api/vendors', { name: 'Ravi Plumbing', trade: 'plumbing' });
  assert.equal((await admin('POST', `/api/requests/${id}/status`, { status: 'in_progress' })).status, 409); // needs vendor
  assert.equal((await admin('POST', `/api/requests/${id}/assign`, { vendor_id: vend.body.id })).status, 200);
  assert.equal((await admin('POST', `/api/requests/${id}/status`, { status: 'in_progress' })).status, 200);
  assert.equal((await res('POST', `/api/requests/${id}/rate`, { rating: 5 })).status, 409); // not closed
  assert.equal((await admin('POST', `/api/requests/${id}/status`, { status: 'closed' })).status, 200);
  assert.equal((await res('POST', `/api/requests/${id}/rate`, { rating: 9 })).status, 400);
  assert.equal((await res('POST', `/api/requests/${id}/rate`, { rating: 4, comment: 'Quick' })).status, 200);

  const detail = (await res('GET', `/api/requests/${id}`)).body;
  assert.equal(detail.status, 'closed');
  assert.deepEqual(detail.history.map(h => h.action), ['created', 'assigned', 'status', 'status', 'rated']);

  const notes = (await res('GET', '/api/notifications')).body;
  assert.ok(notes.some(n => /closed/.test(n.message)));
  const stats = (await admin('GET', '/api/admin/stats')).body;
  assert.equal(stats.avg_rating, 4);
  assert.match((await admin('GET', '/api/admin/export.csv')).body, /Leaking tap/);
});

test('residents cannot see each other’s requests', async () => {
  const admin = client(), other = client(), owner = client();
  await admin('POST', '/api/login', { email: 'admin@society.test', password: 'Admin@1234' });
  await client()('POST', '/api/register', { ...reg, email: 'other@example.test', flat: 'B-202' });
  const p = (await admin('GET', '/api/admin/users?status=pending')).body;
  await admin('POST', `/api/admin/users/${p[0].id}/approve`);
  await other('POST', '/api/login', { email: 'other@example.test', password: reg.password });
  await owner('POST', '/api/login', { email: reg.email, password: reg.password });
  const mine = (await owner('GET', '/api/requests')).body;
  assert.equal((await other('GET', `/api/requests/${mine[0].id}`)).status, 404);
  assert.equal((await other('GET', `/api/requests/${mine[0].id}/photo`)).status, 404);
  assert.equal((await other('GET', '/api/requests')).body.length, 0);
});

test('notices reach residents; only admin can post', async () => {
  const admin = client(), r = client();
  await admin('POST', '/api/login', { email: 'admin@society.test', password: 'Admin@1234' });
  await r('POST', '/api/login', { email: reg.email, password: reg.password });
  assert.equal((await r('POST', '/api/notices', { title: 'x', body: 'y' })).status, 403);
  assert.equal((await admin('POST', '/api/notices', { title: 'Water cut', body: 'Tuesday 10am' })).status, 201);
  assert.equal((await r('GET', '/api/notices')).body[0].title, 'Water cut');
});

test('household, flat-wide visibility, owner-only rating, lease and stats', async () => {
  const admin = client(), owner = client(), family = client(), stranger = client(), tenant = client();
  await admin('POST', '/api/login', { email: 'admin@society.test', password: 'Admin@1234' });
  const approveAll = async () => { for (const u of (await admin('GET', '/api/admin/users?status=pending')).body) await admin('POST', `/api/admin/users/${u.id}/approve`); };

  await client()('POST', '/api/register', { ...reg, email: 'owner@example.test', flat: 'D-401', resident_type: 'owner' });
  await client()('POST', '/api/register', { ...reg, email: 'stranger@example.test', flat: 'D-402', resident_type: 'owner' });
  await approveAll();
  await owner('POST', '/api/login', { email: 'owner@example.test', password: reg.password });
  await stranger('POST', '/api/login', { email: 'stranger@example.test', password: reg.password });

  // owner adds a family member and a tenant; they start pending and live in the owner's flat
  const add = { name: 'Kid Test', email: 'kid@example.test', resident_type: 'family', password: 'Passw0rd!', consent: true };
  assert.equal((await owner('POST', '/api/household', { ...add, consent: false })).status, 400);
  assert.equal((await owner('POST', '/api/household', { ...add, flat: 'Z-999' })).status, 201);
  assert.equal((await owner('POST', '/api/household', { ...add, resident_type: 'owner', email: 'x@example.test' })).status, 400);
  assert.equal((await family('POST', '/api/login', { email: add.email, password: add.password })).status, 403); // pending
  assert.equal((await owner('POST', '/api/household', { ...add, name: 'Tenant Test', email: 'ten@example.test', resident_type: 'tenant' })).status, 201);
  const hh = (await owner('GET', '/api/household')).body;
  assert.deepEqual(hh.map(m => m.resident_type), ['owner', 'family', 'tenant']);
  assert.ok(hh.every(m => m.id));
  await approveAll();
  assert.equal((await family('POST', '/api/login', { email: add.email, password: add.password })).status, 200);
  assert.equal((await family('POST', '/api/household', add)).status, 403); // only the owner adds people
  assert.equal((await stranger('GET', '/api/household')).body.length, 1);

  // a family member raises a request; the owner sees it, a stranger does not
  const mk = new FormData(); mk.set('category', 'electrical'); mk.set('title', 'Fan humming');
  const id = (await family('POST', '/api/requests', null, mk)).body.id;
  assert.equal((await owner('GET', `/api/requests/${id}`)).status, 200);
  assert.equal((await stranger('GET', `/api/requests/${id}`)).status, 404);

  const v = (await admin('POST', '/api/vendors', { name: 'Volt Test', trade: 'electrical' })).body.id;
  await admin('POST', `/api/requests/${id}/assign`, { vendor_id: v });
  await admin('POST', `/api/requests/${id}/status`, { status: 'closed' });
  assert.equal((await family('GET', `/api/requests/${id}`)).body.can_rate, false);
  assert.equal((await family('POST', `/api/requests/${id}/rate`, { rating: 5 })).status, 403); // family never rates
  assert.equal((await stranger('POST', `/api/requests/${id}/rate`, { rating: 5 })).status, 404);
  assert.equal((await owner('GET', `/api/requests/${id}`)).body.can_rate, true);
  assert.equal((await owner('POST', `/api/requests/${id}/rate`, { rating: 5 })).status, 200);
  assert.equal((await owner('POST', `/api/requests/${id}/rate`, { rating: 5 })).status, 409); // once only
  assert.ok((await family('GET', '/api/notifications')).body.some(n => /rated 5 of 5/.test(n.message)));

  // lease: tenants only, set by admin, read by the tenant
  const tid = (await admin('GET', '/api/admin/users')).body.find(u => u.email === 'ten@example.test').id;
  await tenant('POST', '/api/login', { email: 'ten@example.test', password: add.password });
  assert.equal((await tenant('GET', '/api/lease')).body, null);
  assert.equal((await tenant('PUT', `/api/admin/users/${tid}/lease`, {})).status, 403);
  assert.equal((await admin('PUT', `/api/admin/users/${tid}/lease`, { start_date: '2026-04-01', end_date: '2025-01-01' })).status, 400);
  assert.equal((await admin('PUT', `/api/admin/users/${tid}/lease`, { start_date: '2026-04-01', end_date: '2027-03-31', owner_name: 'Owner Test' })).status, 200);
  assert.equal((await tenant('GET', '/api/lease')).body.end_date, '2027-03-31');
  assert.equal((await admin('PUT', `/api/admin/users/${(await admin('GET', '/api/admin/users')).body.find(u => u.email === 'owner@example.test').id}/lease`, { start_date: '2026-04-01', end_date: '2027-03-31' })).status, 404); // not a tenant

  const st = (await admin('GET', '/api/admin/stats')).body;
  assert.ok(st.sla.total >= 2 && st.sla.within <= st.sla.total);
  assert.ok(Array.isArray(st.weekly) && Array.isArray(st.vendor_ratings) && Array.isArray(st.by_category));
  assert.equal(st.vendor_ratings.find(x => x.name === 'Volt Test').avg, 5);
});

test('committee lists tenants with their lease for the editor', async () => {
  const admin = client(), res = client();
  await admin('POST', '/api/login', { email: 'admin@society.test', password: 'Admin@1234' });
  await res('POST', '/api/login', { email: reg.email, password: reg.password });
  assert.equal((await res('GET', '/api/admin/leases')).status, 403);
  const rows = (await admin('GET', '/api/admin/leases')).body;
  const t = rows.find(x => x.email === undefined ? false : x.name === 'Tenant Test');
  assert.ok(t && t.end_date === '2027-03-31' && t.owner_name === 'Owner Test'); // set in the previous test
  assert.ok(rows.some(x => x.name === 'Test Resident' && x.end_date === null)); // tenant without a lease
  assert.ok(rows.every(x => x.flat));
});

test('pulse token changes when visible data changes', async () => {
  const admin = client(), res = client();
  await admin('POST', '/api/login', { email: 'admin@society.test', password: 'Admin@1234' });
  await res('POST', '/api/login', { email: reg.email, password: reg.password });
  assert.equal((await client()('GET', '/api/pulse')).status, 401);
  const a1 = (await admin('GET', '/api/pulse')).body.v, r1 = (await res('GET', '/api/pulse')).body.v;
  assert.equal((await admin('GET', '/api/pulse')).body.v, a1); // stable when nothing changes
  await admin('POST', '/api/notices', { title: 'Pulse test', body: 'x' });
  assert.notEqual((await admin('GET', '/api/pulse')).body.v, a1);
  assert.notEqual((await res('GET', '/api/pulse')).body.v, r1);
});

test('profile, password, vendors, notices, comments and unread count', async () => {
  const admin = client(), res = client(), stranger = client();
  await admin('POST', '/api/login', { email: 'admin@society.test', password: 'Admin@1234' });
  await res('POST', '/api/login', { email: reg.email, password: reg.password });
  await stranger('POST', '/api/login', { email: 'other@example.test', password: reg.password });

  // profile + password
  assert.equal((await res('PATCH', '/api/me', { name: 'Test Resident Two', phone: '+91 90000 00000' })).body.name, 'Test Resident Two');
  assert.equal((await res('POST', '/api/me/password', { current: 'wrong', next: 'NewPassw0rd!' })).status, 403);
  assert.equal((await res('POST', '/api/me/password', { current: reg.password, next: 'short' })).status, 400);
  assert.equal((await res('POST', '/api/me/password', { current: reg.password, next: 'NewPassw0rd!' })).status, 200);
  assert.equal((await client()('POST', '/api/login', { email: reg.email, password: 'NewPassw0rd!' })).status, 200);
  await res('POST', '/api/me/password', { current: 'NewPassw0rd!', next: reg.password }); // restore for other tests

  // admin user detail
  const uid = (await admin('GET', '/api/admin/users')).body.find(u => u.email === reg.email).id;
  assert.equal((await admin('GET', `/api/admin/users/${uid}`)).body.email, reg.email);
  assert.equal((await res('GET', `/api/admin/users/${uid}`)).status, 403);

  // vendors: update, and delete only when unused
  const v = (await admin('POST', '/api/vendors', { name: 'Temp Vendor', trade: 'other' })).body.id;
  assert.equal((await admin('PUT', `/api/vendors/${v}`, { name: 'Temp Vendor 2', phone: '123' })).status, 200);
  assert.equal((await res('PUT', `/api/vendors/${v}`, { name: 'x' })).status, 403);
  assert.equal((await admin('DELETE', `/api/vendors/${v}`)).status, 200);
  assert.equal((await admin('DELETE', `/api/vendors/${v}`)).status, 404);
  const used = (await admin('GET', '/api/vendors')).body.find(x => x.name === 'Ravi Plumbing').id;
  assert.equal((await admin('DELETE', `/api/vendors/${used}`)).status, 409);

  // notices: delete is admin only
  const nid = (await admin('POST', '/api/notices', { title: 'Delete me', body: 'x' })).body.id;
  assert.equal((await res('DELETE', `/api/notices/${nid}`)).status, 403);
  assert.equal((await admin('DELETE', `/api/notices/${nid}`)).status, 200);
  assert.ok(!(await res('GET', '/api/notices')).body.some(n => n.id === nid));

  // comments: visible to the requester and committee, not to another flat
  const rid = (await res('GET', '/api/requests')).body[0].id;
  assert.equal((await res('POST', `/api/requests/${rid}/comments`, { body: '' })).status, 400);
  assert.equal((await res('POST', `/api/requests/${rid}/comments`, { body: 'Home after 6pm' })).status, 201);
  assert.equal((await admin('POST', `/api/requests/${rid}/comments`, { body: 'Visit tomorrow' })).status, 201);
  assert.deepEqual((await res('GET', `/api/requests/${rid}/comments`)).body.map(c => c.body), ['Home after 6pm', 'Visit tomorrow']);
  assert.equal((await stranger('GET', `/api/requests/${rid}/comments`)).status, 404);
  assert.equal((await stranger('POST', `/api/requests/${rid}/comments`, { body: 'hi' })).status, 404);

  // unread count drops to zero after marking read
  assert.ok((await res('GET', '/api/notifications/unread-count')).body.n > 0);
  await res('POST', '/api/notifications/read');
  assert.equal((await res('GET', '/api/notifications/unread-count')).body.n, 0);
});
