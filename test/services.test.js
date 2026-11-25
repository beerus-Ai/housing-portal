// Resident services (docs/services-api.md): tuck shop, laundry, parcel desk, community events.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';
const NOW = new Date('2026-11-25T06:30:00Z'); // 12:00 IST

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-svc-'));
  const app = createApp({ dbFile: path.join(dir, 's.db'), uploadDir: path.join(dir, 'up'), noTimers: true, clock: () => NOW });
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
      return { status: res.status, body: await res.json() };
    };
  };
  const admin = client();
  assert.equal((await admin('POST', '/api/login', ADMIN)).status, 200);
  const resident = async (email, flat) => {
    const c = client();
    assert.equal((await client()('POST', '/api/register', { name: email.split('@')[0], email, flat, resident_type: 'owner', password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    assert.equal((await admin('POST', `/api/admin/users/${p.id}/approve`)).status, 200);
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    return c;
  };
  const account = async (kind, email) => {
    assert.equal((await admin('POST', '/api/admin/accounts', { name: kind + ' one', email, password: PW, kind })).status, 201);
    const c = client();
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    return c;
  };
  return { admin, resident, account, close: () => server.close() };
}

test('tuck shop: committee lists items, residents order, stock moves, flow is enforced', async () => {
  const t = await boot();
  try {
    const a = await t.resident('a@x.test', 'A-1'), b = await t.resident('b@x.test', 'B-1'), st = await t.account('staff', 'st@x.test');
    assert.equal((await a('POST', '/api/shop/items', { name: 'Milk', category: 'dairy', price: 30, stock: 5 })).status, 403);
    assert.equal((await t.admin('POST', '/api/shop/items', { name: 'Milk', category: 'dairy', price: 0, stock: 5 })).status, 400);
    const milk = (await t.admin('POST', '/api/shop/items', { name: 'Milk', category: 'dairy', price: 30, stock: 5, unit: '500 ml' })).body.id;
    assert.equal((await t.admin('POST', '/api/shop/items', { name: 'milk', category: 'dairy', price: 30, stock: 5 })).status, 409);
    assert.equal((await a('POST', '/api/shop/orders', { items: [{ id: milk, qty: 6 }] })).status, 409, 'cannot buy more than stock');
    const o = await a('POST', '/api/shop/orders', { items: [{ id: milk, qty: 2 }], note: 'Leave at the door' });
    assert.equal(o.status, 201); assert.equal(o.body.total, 60);
    assert.equal((await a('GET', '/api/shop/items')).body.find(i => i.id === milk).stock, 3);
    assert.equal((await b('GET', '/api/shop/orders')).body.length, 0, 'other flats do not see the order');
    assert.equal((await b('POST', `/api/shop/orders/${o.body.id}/status`, { status: 'cancelled' })).status, 404);
    assert.equal((await a('POST', `/api/shop/orders/${o.body.id}/status`, { status: 'ready' })).status, 403, 'residents only cancel');
    assert.equal((await st('POST', `/api/shop/orders/${o.body.id}/status`, { status: 'delivered' })).status, 409, 'placed -> delivered skips ready');
    assert.equal((await st('POST', `/api/shop/orders/${o.body.id}/status`, { status: 'ready' })).status, 200);
    assert.ok((await a('GET', '/api/notifications')).body.some(n => /is ready/.test(n.message)));
    assert.equal((await a('POST', `/api/shop/orders/${o.body.id}/status`, { status: 'cancelled' })).status, 403, 'too late to cancel once ready');
    assert.equal((await st('POST', `/api/shop/orders/${o.body.id}/status`, { status: 'delivered' })).status, 200);
    // a cancelled order puts the stock back
    const o2 = (await a('POST', '/api/shop/orders', { items: [{ id: milk, qty: 3 }] })).body.id;
    assert.equal((await a('POST', `/api/shop/orders/${o2}/status`, { status: 'cancelled' })).status, 200);
    assert.equal((await t.admin('GET', '/api/shop/items')).body.find(i => i.id === milk).stock, 3);
    assert.ok((await t.admin('GET', '/api/admin/audit')).body.some(x => x.entity === 'shop_order' && x.action === 'delivered'));
  } finally { t.close(); }
});

test('laundry: rates, pickup booking, forward-only status, resident cancel before pickup', async () => {
  const t = await boot();
  try {
    const a = await t.resident('a@x.test', 'A-1'), st = await t.account('staff', 'st@x.test');
    const shirt = (await t.admin('POST', '/api/laundry/rates', { item: 'Shirt', price: 20 })).body.id;
    assert.equal((await t.admin('POST', '/api/laundry/rates', { item: 'shirt', price: 25 })).status, 409);
    assert.equal((await a('POST', '/api/laundry/orders', { pickup_date: '2026-11-24', pickup_slot: 'morning', items: [{ id: shirt, qty: 3 }] })).status, 400, 'past date');
    assert.equal((await a('POST', '/api/laundry/orders', { pickup_date: '2026-12-20', pickup_slot: 'morning', items: [{ id: shirt, qty: 3 }] })).status, 400, 'too far ahead');
    assert.equal((await a('POST', '/api/laundry/orders', { pickup_date: '2026-11-26', pickup_slot: 'night', items: [{ id: shirt, qty: 3 }] })).status, 400, 'bad slot');
    const o = await a('POST', '/api/laundry/orders', { pickup_date: '2026-11-26', pickup_slot: 'morning', items: [{ id: shirt, qty: 3 }] });
    assert.equal(o.status, 201); assert.equal(o.body.total, 60);
    assert.equal((await st('POST', `/api/laundry/orders/${o.body.id}/status`, { status: 'ready' })).status, 409, 'forward one step at a time');
    for (const s of ['picked_up', 'washing', 'ready', 'delivered']) assert.equal((await st('POST', `/api/laundry/orders/${o.body.id}/status`, { status: s })).status, 200, s);
    assert.ok((await a('GET', '/api/notifications')).body.some(n => /Laundry #\d+ is ready/.test(n.message)));
    const o2 = (await a('POST', '/api/laundry/orders', { pickup_date: '2026-11-25', pickup_slot: 'evening', items: [{ id: shirt, qty: 1 }] })).body.id;
    assert.equal((await a('POST', `/api/laundry/orders/${o2}/status`, { status: 'cancelled' })).status, 200);
  } finally { t.close(); }
});

test('parcel desk: guard logs, the flat is told, guard marks collected; residents see only their flat', async () => {
  const t = await boot();
  try {
    const a = await t.resident('a@x.test', 'A-1'), b = await t.resident('b@x.test', 'B-1'), g = await t.account('guard', 'g@x.test');
    assert.equal((await a('POST', '/api/parcels', { flat: 'A-1', carrier: 'Amazon' })).status, 403);
    assert.equal((await g('POST', '/api/parcels', { flat: 'Z-9', carrier: 'Amazon' })).status, 400, 'unknown flat');
    const p = (await g('POST', '/api/parcels', { flat: 'a-1', carrier: 'Amazon', note: 'Small box' })).body.id;
    assert.ok((await a('GET', '/api/notifications')).body.some(n => /Parcel from Amazon waiting/.test(n.message)));
    assert.equal((await a('GET', '/api/parcels')).body.length, 1);
    assert.equal((await b('GET', '/api/parcels')).body.length, 0);
    assert.equal((await g('GET', '/api/parcels')).status, 200);
    assert.equal((await g('POST', `/api/parcels/${p}/collect`, { collected_by: 'a' })).status, 200);
    assert.equal((await g('POST', `/api/parcels/${p}/collect`, {})).status, 409);
    assert.equal((await g('GET', '/api/shop/orders')).status, 403, 'guards stay on their allow-list');
  } finally { t.close(); }
});

test('events: committee posts, residents RSVP, cancel tells the guests; summary counts', async () => {
  const t = await boot();
  try {
    const a = await t.resident('a@x.test', 'A-1');
    assert.equal((await a('POST', '/api/events', { title: 'Diwali', starts_at: '2026-11-30T19:00' })).status, 403);
    assert.equal((await t.admin('POST', '/api/events', { title: 'Old', starts_at: '2026-11-20T19:00' })).status, 400, 'past');
    const e = (await t.admin('POST', '/api/events', { title: 'Diwali get-together', starts_at: '2026-11-30T19:00', location: 'Clubhouse' })).body.id;
    assert.ok((await a('GET', '/api/notifications')).body.some(n => /New event: Diwali/.test(n.message)));
    const r = await a('POST', `/api/events/${e}/rsvp`, { going: true });
    assert.equal(r.body.going, 1); assert.equal(r.body.me_going, true);
    assert.equal((await a('GET', '/api/services/summary')).body.next_event.title, 'Diwali get-together');
    assert.equal((await t.admin('POST', `/api/events/${e}/cancel`)).status, 200);
    assert.ok((await a('GET', '/api/notifications')).body.some(n => /Event cancelled/.test(n.message)));
    assert.equal((await a('POST', `/api/events/${e}/rsvp`, { going: true })).status, 409);
    const s = (await t.admin('GET', '/api/services/summary')).body;
    assert.equal(typeof s.shop_to_prepare, 'number'); assert.equal(typeof s.parcels_waiting, 'number');
  } finally { t.close(); }
});
