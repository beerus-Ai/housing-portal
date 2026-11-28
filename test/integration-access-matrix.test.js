// Access matrix across every module (docs/roles-api.md, modules-api.md, services-api.md, nfc-api.md and the
// allow-lists in app.js `auth`): for each role, a representative set of routes, with the status the design intends.
// Rows marked { todo } are suspected defects: they assert the intended behaviour and are reported, not hidden.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';
const NOW = new Date('2026-11-25T06:30:00Z'); // 12:00 IST, Wednesday

const ROLES = ['owner', 'tenant', 'family', 'member', 'head', 'sysadmin', 'maint', 'cleaner', 'shop', 'laundry', 'it', 'guard'];
const RES = ['owner', 'tenant', 'family'];
const COM = ['member', 'head', 'sysadmin'];
const GOV = ['head', 'sysadmin'];
const STAFF = ['maint', 'cleaner'];

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-acl-'));
  const app = createApp({ dbFile: path.join(dir, 'a.db'), uploadDir: path.join(dir, 'up'), noTimers: true, clock: () => NOW });
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
      const text = Buffer.from(await res.arrayBuffer()).toString('latin1');
      let json = null; try { json = JSON.parse(text); } catch { /* binary (backup) */ }
      return { status: res.status, body: json };
    };
  };
  const sys = client();
  assert.equal((await sys('POST', '/api/login', ADMIN)).status, 200);
  const users = {};
  const login = async (email) => { const c = client(); assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200, email); return c; };
  const resident = async (email, flat, resident_type) => {
    assert.equal((await client()('POST', '/api/register', { name: email.split('@')[0], email, flat, resident_type, password: PW, consent: true })).status, 201);
    const p = (await sys('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    assert.equal((await sys('POST', `/api/admin/users/${p.id}/approve`)).status, 200);
    users[email] = p.id;
    return login(email);
  };
  const account = async (kind, email) => {
    const r = await sys('POST', '/api/admin/accounts', { name: kind + ' one', email, password: PW, kind });
    assert.equal(r.status, 201, kind);
    users[email] = r.body.id;
    return login(email);
  };
  const c = {
    sysadmin: sys,
    owner: await resident('owner@x.test', 'A-101', 'owner'),
    family: await resident('family@x.test', 'A-101', 'family'),
    tenant: await resident('tenant@x.test', 'B-202', 'tenant'),
    member: await account('member', 'member@x.test'),
    head: await account('head', 'head@x.test'),
    maint: await account('maintenance', 'maint@x.test'),
    cleaner: await account('cleaner', 'cleaner@x.test'),
    shop: await account('shop', 'shop@x.test'),
    laundry: await account('laundry', 'laundry@x.test'),
    it: await account('it', 'it@x.test'),
    guard: await account('guard', 'guard@x.test'),
  };
  const id = {
    owner: users['owner@x.test'], family: users['family@x.test'], tenant: users['tenant@x.test'], maint: users['maint@x.test'],
    guard: users['guard@x.test'], shop: users['shop@x.test'],
  };
  return { c, id, client, login, close: () => server.close() };
}

// Fixture shared by the rows: one item of each module, created by the role that owns it.
async function fixture(t) {
  const { c, id } = t;
  const ok = (r, s, m) => { assert.equal(r.status, s, m + ' ' + JSON.stringify(r.body)); return r.body; };
  const f = {};
  f.shopItem = ok(await c.shop('POST', '/api/shop/items', { name: 'Milk', category: 'dairy', price: 30, stock: 500 }), 201, 'shop item').id;
  f.rate = ok(await c.laundry('POST', '/api/laundry/rates', { item: 'Shirt', price: 20 }), 201, 'laundry rate').id;
  f.amenity = ok(await c.sysadmin('POST', '/api/amenities', { name: 'Clubhouse', open_from: '06:00', open_to: '22:00', slot_minutes: 60 }), 201, 'amenity').id;
  f.inv = ok(await c.sysadmin('POST', '/api/inventory', { name: 'Bulb', category: 'electrical', quantity: 500, unit: 'pcs', min_qty: 1 }), 201, 'inventory').id;
  ok(await c.sysadmin('POST', '/api/admin/dues', { period: '2026-11', amount: 1500, due_date: '2026-12-10', flats: ['A-101'] }), 201, 'dues');
  f.due = (await c.sysadmin('GET', '/api/dues?flat=A-101')).body.dues[0].id;
  f.event = ok(await c.sysadmin('POST', '/api/events', { title: 'Diwali meet', starts_at: '2026-12-01T18:00' }), 201, 'event').id;
  f.req = ok(await c.owner('POST', '/api/requests', { category: 'electrical', title: 'Bulb fused' }), 201, 'request').id;
  ok(await c.sysadmin('POST', `/api/requests/${f.req}/assign`, { staff_id: id.maint }), 200, 'assign staff');
  ok(await c.guard('POST', '/api/gate/cards', { serial: '04A1B2C3', user_id: id.owner }), 201, 'owner card');
  f.ticket = ok(await c.owner('POST', '/api/support', { subject: 'Login', body: 'Cannot see dues', kind: 'question' }), 201, 'ticket').id;
  return f;
}

const ALL = (s) => Object.fromEntries(ROLES.map(r => [r, s]));
// expect(default, {role: status}) -> per-role map; `null` = not asserted (unspecified by the design).
const expect = (dflt, over = {}) => ({ ...ALL(dflt), ...over });
const only = (roles, s, dflt = 403, extra = {}) => expect(dflt, { ...Object.fromEntries(roles.map(r => [r, s])), ...extra });
const idx = r => ROLES.indexOf(r);
const hex = r => 'C0DE' + String(idx(r)).padStart(2, '0');

// Each row: [label, method, path(f, role), body(f, role)|null, expected, prep?(t, f, role) -> f extension]
const ROWS = [
  // ---------- requests (core)
  ['GET requests', 'GET', () => '/api/requests', null, only([...RES, ...COM, ...STAFF], 200)],
  ['POST requests', 'POST', () => '/api/requests', (f, r) => ({ category: 'plumbing', title: 'Leak ' + r }), only(RES, 201, 403, { member: null, head: null, sysadmin: null })],
  ['GET request of flat A-101', 'GET', f => `/api/requests/${f.req}`, null, expect(403, { owner: 200, family: 200, tenant: 404, member: 200, head: 200, sysadmin: 200, maint: 200, cleaner: 404 })],
  ['POST household', 'POST', () => '/api/household', (f, r) => ({ name: 'Kid ' + r, email: `kid-${r}@x.test`, resident_type: 'family', password: PW, consent: true }), expect(403, { owner: 201 })],
  ['GET lease', 'GET', () => '/api/lease', null, expect(403, { owner: 200, tenant: 200, member: 200, head: 200, sysadmin: 200 })],
  // ---------- admin
  ['GET admin stats', 'GET', () => '/api/admin/stats', null, only(COM, 200)],
  ['GET admin users', 'GET', () => '/api/admin/users', null, only(COM, 200)],
  ['GET admin settings', 'GET', () => '/api/admin/settings', null, only(COM, 200)],
  ['PUT admin settings', 'PUT', () => '/api/admin/settings', () => ({ society_name: 'Sahyadri Heights' }), only(GOV, 200)],
  ['GET admin access', 'GET', () => '/api/admin/access', null, only(COM, 200)],
  ['PUT admin access', 'PUT', () => '/api/admin/access', () => ({ matrix: {} }), only(GOV, 200)],
  ['GET admin accounts', 'GET', () => '/api/admin/accounts', null, only(GOV, 200)],
  ['POST admin accounts', 'POST', () => '/api/admin/accounts', (f, r) => ({ name: 'New ' + r, email: `new-${r}@x.test`, password: PW, kind: 'cleaner' }), only(GOV, 201)],
  ['POST admin guards', 'POST', () => '/api/admin/guards', (f, r) => ({ name: 'Guard ' + r, email: `g2-${r}@x.test`, password: PW }), only(GOV, 201)],
  ['GET admin audit', 'GET', () => '/api/admin/audit', null, only(COM, 200)],
  ['GET monthly report', 'GET', () => '/api/admin/reports/monthly?month=2026-11', null, only(COM, 200)],
  ['GET approvals', 'GET', () => '/api/admin/approvals', null, only(COM, 200)],
  ['POST cost-decision (head exists)', 'POST', f => `/api/requests/${f.costReq}/cost-decision`, () => ({ decision: 'approve' }), only(['head'], 200),
    async (t, f, r) => {
      const id = (await t.c.owner('POST', '/api/requests', { category: 'lift', title: 'Lift motor ' + r })).body.id;
      assert.equal((await t.c.sysadmin('POST', `/api/requests/${id}/assign`, { staff_id: t.id.maint })).status, 200);
      const e = await t.c.sysadmin('POST', `/api/requests/${id}/estimate`, { amount: 50000, note: 'motor' });
      assert.equal(e.body.cost_status, 'pending');
      return { costReq: id };
    }],
  ['GET staff list', 'GET', () => '/api/admin/staff', null, only(COM, 200)],
  ['GET attendance', 'GET', () => '/api/admin/attendance', null, only(COM, 200)],
  // ---------- notices and emergencies
  ['GET notices', 'GET', () => '/api/notices', null, only([...RES, ...COM], 200)],
  ['POST notices', 'POST', () => '/api/notices', (f, r) => ({ title: 'Water cut ' + r, body: 'Tomorrow 10-12' }), only(COM, 201)],
  ['POST emergency', 'POST', () => '/api/emergencies', () => ({ type: 'medical', note: 'test' }), only(RES, 201, 403, { member: null, head: null, sysadmin: null })],
  ['GET emergencies', 'GET', () => '/api/emergencies', null, only([...RES, ...COM], 200)],
  // ---------- gate and NFC cards
  ['POST gate verify (no code)', 'POST', () => '/api/gate/verify', () => ({}), only([...COM, 'guard'], 400)],
  ['GET gate log', 'GET', () => '/api/gate/log', null, only([...COM, 'guard'], 200)],
  ['GET gate people', 'GET', () => '/api/gate/people?q=o', null, only([...COM, 'guard'], 200)],
  ['GET gate cards', 'GET', () => '/api/gate/cards', null, only([...COM, 'guard'], 200)],
  ['POST gate cards', 'POST', () => '/api/gate/cards', (f, r) => ({ serial: hex(r), user_id: f.tenantId }), only([...COM, 'guard'], 201)],
  ['DELETE gate card', 'DELETE', f => `/api/gate/cards/${f.tmpCard}`, null, only([...COM, 'guard'], 200),
    async (t, f, r) => ({ tmpCard: (await t.c.sysadmin('POST', '/api/gate/cards', { serial: 'D0' + hex(r), user_id: t.id.tenant })).body.id })],
  ['POST gate tap', 'POST', () => '/api/gate/tap', () => ({ serial: '04:a1:b2:c3' }), only([...COM, 'guard'], 200)],
  ['GET gate presence', 'GET', () => '/api/gate/presence', null, only([...COM, 'guard'], 200)],
  ['GET gate passes', 'GET', () => '/api/gate/passes', null, expect(403, { owner: 200, tenant: 200, family: 200, member: 200, head: 200, sysadmin: 200 })],
  // ---------- parcels (staff: see the todo test below)
  ['POST parcels', 'POST', () => '/api/parcels', () => ({ flat: 'A-101', carrier: 'Amazon' }), only([...COM, 'guard'], 201, 403, { maint: null, cleaner: null })],
  ['GET parcels', 'GET', () => '/api/parcels', null, only([...RES, ...COM, 'guard'], 200, 403, { maint: null, cleaner: null })],
  ['POST parcel collect', 'POST', f => `/api/parcels/${f.parcel}/collect`, () => ({ collected_by: 'x' }), only([...COM, 'guard'], 200, 403, { maint: null, cleaner: null }),
    async t => ({ parcel: (await t.c.guard('POST', '/api/parcels', { flat: 'A-101', carrier: 'Swiggy' })).body.id })],
  // ---------- tuck shop (committee read only)
  ['GET shop items', 'GET', () => '/api/shop/items', null, only([...RES, ...COM, 'shop'], 200)],
  ['POST shop items', 'POST', () => '/api/shop/items', (f, r) => ({ name: 'Bread ' + r, category: 'groceries', price: 40, stock: 5 }), only(['shop'], 201)],
  ['PATCH shop item', 'PATCH', f => `/api/shop/items/${f.shopItem}`, () => ({ price: 30 }), only(['shop'], 200)],
  ['POST shop order', 'POST', () => '/api/shop/orders', f => ({ items: [{ id: f.shopItem, qty: 1 }] }), only(RES, 201)],
  ['GET shop orders', 'GET', () => '/api/shop/orders', null, only([...RES, ...COM, 'shop'], 200)],
  ['POST shop order -> ready', 'POST', f => `/api/shop/orders/${f.order}/status`, () => ({ status: 'ready' }),
    expect(403, { shop: 200, member: 404, head: 404, sysadmin: 404, tenant: 404 }),
    async (t, f) => ({ order: (await t.c.owner('POST', '/api/shop/orders', { items: [{ id: f.shopItem, qty: 1 }] })).body.id })],
  ['POST shop order -> cancelled', 'POST', f => `/api/shop/orders/${f.order}/status`, () => ({ status: 'cancelled' }),
    expect(403, { owner: 200, family: 200, shop: 200, member: 404, head: 404, sysadmin: 404, tenant: 404 }),
    async (t, f) => ({ order: (await t.c.owner('POST', '/api/shop/orders', { items: [{ id: f.shopItem, qty: 1 }] })).body.id })],
  ['POST shop counter', 'POST', () => '/api/shop/counter', f => ({ serial: '04A1B2C3', items: [{ id: f.shopItem, qty: 1 }], payment: 'cash' }), only(['shop'], 201)],
  ['POST shop card lookup', 'POST', () => '/api/shop/card', () => ({ serial: '04A1B2C3' }), only(['shop'], 200)],
  // ---------- laundry (committee read only)
  ['GET laundry rates', 'GET', () => '/api/laundry/rates', null, only([...RES, ...COM, 'laundry'], 200)],
  ['POST laundry rates', 'POST', () => '/api/laundry/rates', (f, r) => ({ item: 'Saree ' + r, price: 80 }), only(['laundry'], 201)],
  ['PATCH laundry rate', 'PATCH', f => `/api/laundry/rates/${f.rate}`, () => ({ price: 20 }), only(['laundry'], 200)],
  ['POST laundry order', 'POST', () => '/api/laundry/orders', f => ({ pickup_date: '2026-11-26', pickup_slot: 'morning', items: [{ id: f.rate, qty: 2 }] }), only(RES, 201)],
  ['GET laundry orders', 'GET', () => '/api/laundry/orders', null, only([...RES, ...COM, 'laundry'], 200)],
  ['POST laundry -> picked_up', 'POST', f => `/api/laundry/orders/${f.lorder}/status`, () => ({ status: 'picked_up' }),
    expect(403, { laundry: 200, member: 404, head: 404, sysadmin: 404, tenant: 404 }),
    async (t, f) => ({ lorder: (await t.c.owner('POST', '/api/laundry/orders', { pickup_date: '2026-11-26', pickup_slot: 'evening', items: [{ id: f.rate, qty: 1 }] })).body.id })],
  // ---------- events
  ['GET events', 'GET', () => '/api/events', null, only([...RES, ...COM], 200)],
  ['POST events', 'POST', () => '/api/events', (f, r) => ({ title: 'Yoga ' + r, starts_at: '2026-12-02T07:00' }), only(COM, 201)],
  ['POST event rsvp', 'POST', f => `/api/events/${f.event}/rsvp`, () => ({ going: true }), only(RES, 200)],
  ['GET charts', 'GET', () => '/api/admin/charts', null, only(COM, 200)],
  // ---------- bulk upload (committee; accounts need the head or admin)
  ['GET bulk templates', 'GET', () => '/api/admin/bulk/templates', null, only(COM, 200)],
  ['POST bulk vendors (dry run)', 'POST', () => '/api/admin/bulk/vendors', () => ({ rows: [{ name: 'V', trade: 'other' }], dry_run: true }), only(COM, 200)],
  ['POST bulk accounts (dry run)', 'POST', () => '/api/admin/bulk/accounts', () => ({ rows: [{ name: 'G', email: 'g@x.test', kind: 'guard' }], dry_run: true }), only(['head', 'sysadmin'], 200)],
  // ---------- carpool (residents offer and ask; the committee sees all and can take a ride down)
  ['GET carpool', 'GET', () => '/api/carpool', null, only([...RES, ...COM], 200)],
  ['POST carpool ride', 'POST', () => '/api/carpool', (f, r) => ({ to_place: 'Station ' + r, depart_at: '2026-12-05T08:00', seats: 2 }), only(RES, 201)],
  // ---------- amenities
  ['GET amenities', 'GET', () => '/api/amenities', null, only([...RES, ...COM], 200)],
  ['POST amenities', 'POST', () => '/api/amenities', (f, r) => ({ name: 'Court ' + r }), only(COM, 201)],
  ['POST booking', 'POST', () => '/api/bookings', (f, r) => ({ amenity_id: f.amenity, date: '2026-11-26', start: `${String(7 + idx(r)).padStart(2, '0')}:00` }), only(RES, 201)],
  ['GET bookings', 'GET', () => '/api/bookings', null, only([...RES, ...COM], 200)],
  // ---------- dues
  ['GET dues', 'GET', () => '/api/dues', null, only([...RES, ...COM], 200)],
  ['GET due of A-101', 'GET', f => `/api/dues/${f.due}`, null, expect(403, { owner: 200, family: 200, tenant: 404, member: 200, head: 200, sysadmin: 200 })],
  ['POST raise dues', 'POST', () => '/api/admin/dues', (f, r) => ({ period: '2026-12', title: 'Sinking fund ' + r, amount: 100, due_date: '2026-12-10', flats: ['A-101'] }), only(COM, 201)],
  ['POST record payment', 'POST', f => `/api/admin/dues/${f.due}/payments`, () => ({ amount: 10, method: 'cash' }), only(COM, 201)],
  ['GET credit', 'GET', () => '/api/credit', null, only(RES, 200)],
  // ---------- inventory (maintenance only among staff)
  ['GET inventory', 'GET', () => '/api/inventory', null, only([...COM, 'maint'], 200)],
  ['POST inventory', 'POST', () => '/api/inventory', (f, r) => ({ name: 'Tape ' + r, category: 'electrical', quantity: 3, unit: 'roll', min_qty: 0 }), only(COM, 201)],
  ['POST inventory move out', 'POST', f => `/api/inventory/${f.inv}/move`, () => ({ change: -1, note: 'used' }), only([...COM, 'maint'], 200)],
  ['POST inventory move in', 'POST', f => `/api/inventory/${f.inv}/move`, () => ({ change: 1, note: 'bought' }), only(COM, 200)],
  ['GET inventory moves', 'GET', f => `/api/inventory/${f.inv}/moves`, null, only([...COM, 'maint'], 200)],
  // ---------- waste (cleaning only among staff)
  ['GET waste schedule', 'GET', () => '/api/waste/schedule', null, only([...RES, ...COM, 'cleaner'], 200)],
  ['POST waste schedule', 'POST', () => '/api/waste/schedule', (f, r) => ({ weekday: idx(r) % 7, kind: 'wet', time: '07:30' }), only(COM, 201)],
  ['GET waste logs', 'GET', () => '/api/waste/logs', null, only([...COM, 'cleaner'], 200)],
  ['POST waste logs', 'POST', () => '/api/waste/logs', () => ({ kind: 'dry', weight_kg: 12 }), only([...COM, 'cleaner'], 201)],
  ['POST waste missed', 'POST', () => '/api/waste/missed', () => ({ kind: 'wet' }), only(RES, 201)],
  ['GET modules summary', 'GET', () => '/api/modules/summary', null, only([...RES, ...COM], 200)],
  ['GET services summary', 'GET', () => '/api/services/summary', null, only([...RES, ...COM], 200)],
  // ---------- staff self-service
  ['GET staff jobs', 'GET', () => '/api/staff/jobs', null, only(STAFF, 200)],
  ['GET staff shift', 'GET', () => '/api/staff/shift', null, only(STAFF, 200)],
  // ---------- IT
  ['GET it health', 'GET', () => '/api/it/health', null, only(['it', 'sysadmin'], 200)],
  ['GET it backup', 'GET', () => '/api/it/backup', null, only(['it', 'sysadmin'], 200)],
  ['PUT it maintenance (clear)', 'PUT', () => '/api/it/maintenance', () => ({ message: '' }), only(['it', 'sysadmin'], 200)],
  // ---------- common to every signed-in account
  ['POST support', 'POST', () => '/api/support', (f, r) => ({ subject: 'Help ' + r, body: 'Something', kind: 'question' }), ALL(201)],
  ['GET support', 'GET', () => '/api/support', null, ALL(200)],
  ['GET owner ticket', 'GET', f => `/api/support/${f.ticket}`, null, expect(404, { owner: 200, it: 200, sysadmin: 200 })],
  ['GET help guides', 'GET', () => '/api/help/guides', null, ALL(200)],
  ['GET me', 'GET', () => '/api/me', null, ALL(200)],
  ['GET notifications', 'GET', () => '/api/notifications', null, ALL(200)],
  ['GET me/card', 'GET', () => '/api/me/card', null, ALL(200)],
  ['GET admin user card', 'GET', f => `/api/admin/users/${f.ownerId}/card`, null, only(COM, 200)],
  ['POST admin user card', 'POST', f => `/api/admin/users/${f.familyId}/card`, (f, r) => ({ serial: 'FA' + hex(r) }), only(COM, 201)],
  // ---------- community card wallet (docs/card-wallet-api.md)
  ['GET wallet', 'GET', () => '/api/wallet', null, only(RES, 200)],
  ['GET admin wallets', 'GET', () => '/api/admin/wallets', null, only(COM, 200)],
  ['GET admin wallet of A-101', 'GET', () => '/api/admin/wallets/A-101', null, only(COM, 200)],
  ['POST wallet topup', 'POST', () => '/api/admin/wallet/topup', () => ({ flat: 'A-101', amount: 10, method: 'cash' }), only(COM, 201)],
  ['POST wallet adjust', 'POST', () => '/api/admin/wallet/adjust', () => ({ flat: 'A-101', amount: 1, note: 'correction' }), only(GOV, 201)],
  ['POST card lookup', 'POST', () => '/api/card/lookup', () => ({ serial: '04A1B2C3' }), only([...COM, 'guard', 'shop', 'laundry'], 200)],
  ['POST laundry counter', 'POST', () => '/api/laundry/counter', f => ({ serial: '04A1B2C3', lines: [{ item: f.rate, qty: 1 }], payment: 'cash' }), only(['laundry'], 201)],
  ['GET parcels by card', 'GET', () => '/api/parcels/card/04A1B2C3', null, only([...COM, 'guard', ...STAFF], 200)],
  ['POST event checkin', 'POST', f => `/api/events/${f.cev}/checkin`, () => ({ serial: '04A1B2C3' }), only([...COM, 'guard'], 201),
    async (t, f, r) => ({ cev: (await t.c.sysadmin('POST', '/api/events', { title: 'Check-in ' + r, starts_at: '2026-12-03T18:00' })).body.id })],
  ['GET event checkins', 'GET', f => `/api/events/${f.event}/checkins`, null, only([...COM, 'guard'], 200)],
  // the owner carries 04A1B2C3; tenant and family cards come and go in the rows above, so they are not asserted
  ['POST me/card/freeze (unfreeze)', 'POST', () => '/api/me/card/freeze', () => ({ frozen: false }), expect(404, { owner: 200, tenant: null, family: null })],
];

test('access matrix: every role against a representative route in every module', async () => {
  const t = await boot();
  try {
    const f = { ...(await fixture(t)), ownerId: t.id.owner, familyId: t.id.family, tenantId: t.id.tenant };
    const wrong = [];
    let checked = 0;
    for (const [label, method, pathOf, bodyOf, exp, prep] of ROWS) {
      for (const role of ROLES) {
        const want = exp[role];
        if (want === null || want === undefined) continue;
        const ff = prep ? { ...f, ...(await prep(t, f, role)) } : f;
        const body = bodyOf && method !== 'GET' && method !== 'DELETE' ? bodyOf(ff, role) : undefined;
        const r = await t.c[role](method, pathOf(ff, role), body);
        checked++;
        if (r.status !== want) wrong.push(`${label} as ${role}: expected ${want}, got ${r.status} ${JSON.stringify(r.body)}`);
      }
    }
    assert.deepEqual(wrong, []);
    assert.ok(checked >= ROWS.length * 10, `only ${checked} cells checked`);
  } finally { t.close(); }
});

test('modules connect: access rules, feature flags and settings set by governance take effect across modules', async () => {
  const t = await boot();
  try {
    const { c } = t;
    // access matrix (head) -> request module (tenant)
    assert.equal((await c.tenant('POST', '/api/requests', { category: 'other', title: 'Before' })).status, 201);
    assert.equal((await c.member('PUT', '/api/admin/access', { matrix: { tenant: { 'request.create': false } } })).status, 403);
    assert.equal((await c.head('PUT', '/api/admin/access', { matrix: { tenant: { 'request.create': false } } })).status, 200);
    assert.equal((await c.tenant('POST', '/api/requests', { category: 'other', title: 'After' })).status, 403);
    assert.ok(!(await c.tenant('GET', '/api/me')).body.permissions.includes('request.create'));
    assert.equal((await c.owner('POST', '/api/requests', { category: 'other', title: 'Owner still can' })).status, 201);
    assert.equal((await c.head('PUT', '/api/admin/access', { matrix: { tenant: { 'request.create': true } } })).status, 200);
    assert.equal((await c.tenant('POST', '/api/requests', { category: 'other', title: 'Back' })).status, 201);
    // feature flag (sysadmin) -> notices module: residents lose it, the committee keeps it
    assert.equal((await c.sysadmin('PUT', '/api/admin/settings', { features: { notices: false } })).status, 200);
    assert.equal((await c.owner('GET', '/api/notices')).status, 403);
    assert.equal((await c.member('GET', '/api/notices')).status, 200);
    assert.equal((await c.sysadmin('PUT', '/api/admin/settings', { features: { notices: true } })).status, 200);
    assert.equal((await c.owner('GET', '/api/notices')).status, 200);
    // credit limit (head) -> tuck shop on account -> dues of the flat -> payment recorded by a committee member
    assert.equal((await c.member('PUT', '/api/admin/settings', { credit_limit: 50 })).status, 403);
    assert.equal((await c.head('PUT', '/api/admin/settings', { credit_limit: 50 })).status, 200);
    assert.equal((await c.owner('GET', '/api/credit')).body.limit, 50);
    const item = (await c.shop('POST', '/api/shop/items', { name: 'Tea', category: 'groceries', price: 40, stock: 10 })).body.id;
    assert.equal((await c.owner('POST', '/api/shop/orders', { items: [{ id: item, qty: 2 }], payment: 'account' })).status, 409, 'over the credit limit');
    const o = await c.family('POST', '/api/shop/orders', { items: [{ id: item, qty: 1 }], payment: 'account' });
    assert.equal(o.status, 201);
    const bill = (await c.owner('GET', '/api/dues')).body.dues.find(d => d.title === `Tuck shop order #${o.body.id}`);
    assert.ok(bill, 'the order became a bill on the flat');
    assert.equal(bill.balance, 40);
    assert.equal((await c.tenant('GET', `/api/dues/${bill.id}`)).status, 404, 'another flat cannot see it');
    assert.equal((await c.owner('POST', `/api/admin/dues/${bill.id}/payments`, { amount: 40, method: 'cash' })).status, 403);
    assert.equal((await c.member('POST', `/api/admin/dues/${bill.id}/payments`, { amount: 40, method: 'cash' })).status, 201);
    const paid = (await c.shop('GET', '/api/shop/orders')).body.find(x => x.id === o.body.id);
    assert.equal(paid.payment_status, 'paid', 'the shop sees the bill paid');
    // governance: suspending a staff account (head) cuts its session
    const accts = (await c.head('GET', '/api/admin/accounts')).body;
    const cl = accts.find(a => a.email === 'cleaner@x.test');
    assert.equal((await c.member('PATCH', `/api/admin/accounts/${cl.id}`, { status: 'suspended' })).status, 403);
    assert.equal((await c.head('PATCH', `/api/admin/accounts/${cl.id}`, { status: 'suspended' })).status, 200);
    assert.equal((await c.cleaner('GET', '/api/waste/logs')).status, 401);
    // cost approval: head exists, so the sysadmin cannot decide; the head can
    const rq = (await c.owner('POST', '/api/requests', { category: 'lift', title: 'Lift' })).body.id;
    assert.equal((await c.sysadmin('POST', `/api/requests/${rq}/assign`, { staff_id: t.id.maint })).status, 200);
    assert.equal((await c.maint('POST', `/api/requests/${rq}/estimate`, { amount: 99999, note: 'new motor' })).body.cost_status, 'pending');
    assert.equal((await c.maint('POST', `/api/staff/jobs/${rq}/update`, { progress: 'started', note: 'checking' })).status, 201);
    assert.equal((await c.sysadmin('POST', `/api/requests/${rq}/status`, { status: 'closed' })).status, 409, 'blocked while cost pending');
    assert.equal((await c.sysadmin('GET', '/api/admin/approvals')).body.can_decide, false);
    assert.equal((await c.head('GET', '/api/admin/approvals')).body.can_decide, true);
    assert.equal((await c.sysadmin('POST', `/api/requests/${rq}/cost-decision`, { decision: 'approve' })).status, 403);
    assert.equal((await c.head('POST', `/api/requests/${rq}/cost-decision`, { decision: 'approve' })).status, 200);
    assert.ok((await c.maint('GET', '/api/notifications')).body.some(n => /approved/.test(n.message)), 'the assignee is told');
  } finally { t.close(); }
});

// ---------- defects found by the agents (now fixed): these lock the corrected behaviour in.
test('the parcel desk is for guards and the committee; staff stay on their department work', async () => {
  const t = await boot();
  try {
    await fixture(t);
    assert.equal((await t.c.maint('POST', '/api/parcels', { flat: 'A-101', carrier: 'Amazon' })).status, 403);
    assert.equal((await t.c.cleaner('GET', '/api/parcels')).status, 403);
  } finally { t.close(); }
});

test('a plain committee member cannot reset a guard password (head or admin only)', async () => {
  const t = await boot();
  try {
    const r = await t.c.member('POST', `/api/admin/users/${t.id.guard}/reset-password`, { password: 'Taken0ver!' });
    const g = t.client();
    const taken = (await g('POST', '/api/login', { email: 'guard@x.test', password: 'Taken0ver!' })).status;
    assert.notEqual(taken, 200, 'the member must not be able to sign in as the guard');
    assert.equal(r.status, 403, 'guard accounts are governed by head/sysadmin (guards create/delete need governance)');
  } finally { t.close(); }
});

test('the committee resident list never includes staff, IT, guard, shop or laundry accounts', async () => {
  const t = await boot();
  try {
    const roles = new Set((await t.c.member('GET', '/api/admin/users')).body.map(u => u.role));
    for (const r of ['staff', 'it', 'guard', 'shop', 'laundry']) assert.ok(!roles.has(r), r + ' accounts belong in /api/admin/accounts');
  } finally { t.close(); }
});
