// Integration: actions in one module show up where other roles look (dashboards, summaries, notifications).
// Covers /api/services/summary, /api/modules/summary, notifications, IT health and emergencies end to end over HTTP.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';
const NOW = new Date('2026-11-25T06:30:00Z'); // Wednesday 12:00 IST
const TODAY = '2026-11-25', TOMORROW = '2026-11-26';
const WEDNESDAY = 2; // modules.js weekday index (Monday = 0)

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-int-dash-'));
  const app = createApp({ dbFile: path.join(dir, 'd.db'), uploadDir: path.join(dir, 'up'), noTimers: true, clock: () => NOW });
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
      const type = res.headers.get('content-type') || '';
      return { status: res.status, body: type.includes('json') ? await res.json() : await res.arrayBuffer() };
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
    const r = await admin('POST', '/api/admin/accounts', { name: kind + ' one', email, password: PW, kind });
    assert.equal(r.status, 201);
    const c = client();
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    c.id = r.body.id;
    return c;
  };
  return { admin, resident, account, close: () => server.close() };
}
const notes = async c => (await c('GET', '/api/notifications')).body.map(n => n.message);
const has = async (c, re) => (await notes(c)).some(m => re.test(m));
const svc = async c => (await c('GET', '/api/services/summary')).body;
const mod = async c => (await c('GET', '/api/modules/summary')).body;

test('parcels: guard logs -> flat notified -> parcels_waiting for resident and committee -> collected clears it', async () => {
  const t = await boot();
  try {
    const a = await t.resident('pa@x.test', 'A-101'), a2 = await t.resident('pa2@x.test', 'A-101'), b = await t.resident('pb@x.test', 'B-202');
    const g = await t.account('guard', 'guard@x.test');
    assert.equal((await svc(a)).parcels_waiting, 0);
    assert.equal((await svc(t.admin)).parcels_waiting, 0);
    assert.equal((await g('POST', '/api/parcels', { flat: 'Z-999', carrier: 'Amazon' })).status, 400, 'no resident in that flat');
    const p1 = await g('POST', '/api/parcels', { flat: 'a-101', carrier: 'Amazon' });
    assert.equal(p1.status, 201, 'flat is normalised to upper case');
    const p2 = (await g('POST', '/api/parcels', { flat: 'A-101', carrier: 'Blue Dart' })).body.id;
    const p3 = (await g('POST', '/api/parcels', { flat: 'B-202', carrier: 'Swiggy' })).body.id;
    assert.ok(await has(a, /Parcel from Amazon waiting at the gate/));
    assert.ok(await has(a2, /Parcel from Amazon waiting at the gate/), 'every resident of the flat is told');
    assert.ok(!(await has(b, /Amazon/)), 'other flats are not told');
    assert.equal((await svc(a)).parcels_waiting, 2);
    assert.equal((await svc(b)).parcels_waiting, 1);
    assert.equal((await svc(t.admin)).parcels_waiting, 3);
    assert.equal((await a('GET', '/api/parcels')).body.length, 2, 'resident sees own flat only');
    assert.equal((await g('GET', '/api/parcels')).body.length, 3);
    assert.equal((await a('POST', `/api/parcels/${p1.body.id}/collect`)).status, 403, 'residents do not mark collection');
    assert.equal((await g('POST', `/api/parcels/${p1.body.id}/collect`, { collected_by: 'pa' })).status, 200);
    assert.equal((await g('POST', `/api/parcels/${p1.body.id}/collect`)).status, 409);
    assert.ok(await has(a, /collected by pa/));
    assert.equal((await svc(a)).parcels_waiting, 1);
    assert.equal((await svc(t.admin)).parcels_waiting, 2);
    assert.equal((await t.admin('POST', `/api/parcels/${p2}/collect`)).status, 200, 'committee can also hand over');
    assert.equal((await g('POST', `/api/parcels/${p3}/collect`)).status, 200);
    assert.equal((await svc(a)).parcels_waiting, 0);
    assert.equal((await svc(b)).parcels_waiting, 0);
    assert.equal((await svc(t.admin)).parcels_waiting, 0);
    assert.ok((await t.admin('GET', '/api/admin/audit')).body.some(x => x.entity === 'parcel' && x.action === 'collected'));
  } finally { t.close(); }
});

test('events: committee posts -> residents notified -> next_event -> RSVP count moves both ways -> cancel', async () => {
  const t = await boot();
  try {
    const a = await t.resident('ea@x.test', 'A-1'), b = await t.resident('eb@x.test', 'B-1');
    const g = await t.account('guard', 'eg@x.test');
    assert.equal((await svc(a)).next_event, null);
    assert.equal((await t.admin('POST', '/api/events', { title: 'Past', starts_at: '2026-11-25T11:00' })).status, 400, 'start must be in the future');
    const late = (await t.admin('POST', '/api/events', { title: 'Diwali dinner', starts_at: '2026-11-28T19:00', location: 'Clubhouse' })).body.id;
    assert.ok(await has(a, /New event: Diwali dinner on 2026-11-28 at 19:00/));
    assert.ok(await has(b, /New event: Diwali dinner/));
    assert.ok(!(await has(g, /New event/)), 'only residents are told');
    assert.equal((await svc(a)).next_event.id, late);
    assert.equal((await svc(t.admin)).next_event.id, late);
    const soon = (await t.admin('POST', '/api/events', { title: 'Yoga', starts_at: '2026-11-26T07:00' })).body.id;
    assert.equal((await svc(a)).next_event.id, soon, 'the earliest upcoming event is next');
    // RSVP count goes up and down
    assert.equal((await a('POST', `/api/events/${soon}/rsvp`, { going: true })).body.going, 1);
    const rb = await b('POST', `/api/events/${soon}/rsvp`, {});
    assert.equal(rb.body.going, 2); assert.equal(rb.body.me_going, true);
    assert.equal((await a('POST', `/api/events/${soon}/rsvp`, { going: true })).body.going, 2, 'RSVP is idempotent');
    assert.equal((await t.admin('GET', '/api/events')).body.find(e => e.id === soon).going, 2, 'committee sees the count');
    assert.equal((await t.admin('POST', `/api/events/${soon}/rsvp`, { going: true })).status, 403);
    const off = await a('POST', `/api/events/${soon}/rsvp`, { going: false });
    assert.equal(off.body.going, 1); assert.equal(off.body.me_going, false);
    assert.equal((await b('GET', '/api/events')).body.find(e => e.id === soon).going, 1);
    // cancel: guests told, next_event falls back
    assert.equal((await t.admin('POST', `/api/events/${soon}/cancel`)).status, 200);
    assert.ok(await has(b, /Event cancelled: Yoga/));
    assert.ok(!(await has(a, /Event cancelled: Yoga/)), 'only guests are told');
    assert.equal((await svc(a)).next_event.id, late);
    assert.equal((await b('POST', `/api/events/${soon}/rsvp`, {})).status, 409);
    assert.equal((await t.admin('POST', `/api/events/${late}/cancel`)).status, 200);
    assert.equal((await svc(a)).next_event, null);
  } finally { t.close(); }
});

test('amenity booking -> resident next_booking and committee bookings_today, and back on cancel', async () => {
  const t = await boot();
  try {
    const a = await t.resident('ba@x.test', 'A-1'), b = await t.resident('bb@x.test', 'B-1');
    const am = (await t.admin('POST', '/api/amenities', { name: 'Clubhouse', open_from: '06:00', open_to: '22:00', slot_minutes: 60 })).body.id;
    assert.equal((await mod(t.admin)).bookings_today, 0);
    assert.equal((await mod(a)).next_booking, null);
    assert.equal((await a('POST', '/api/bookings', { amenity_id: am, date: TODAY, start: '11:00' })).status, 400, 'slot already started');
    const k1 = (await a('POST', '/api/bookings', { amenity_id: am, date: TOMORROW, start: '09:00' })).body.id;
    assert.deepEqual((await mod(a)).next_booking, { amenity: 'Clubhouse', date: TOMORROW, start: '09:00', end: '10:00' });
    assert.equal((await mod(t.admin)).bookings_today, 0, 'tomorrow does not count today');
    const k2 = (await a('POST', '/api/bookings', { amenity_id: am, date: TODAY, start: '15:00' })).body.id;
    assert.equal((await mod(a)).next_booking.date, TODAY, 'the sooner booking is next');
    assert.equal((await mod(b)).next_booking, null, 'another flat does not see it');
    assert.equal((await b('POST', '/api/bookings', { amenity_id: am, date: TODAY, start: '15:00' })).status, 409, 'slot taken');
    const k3 = (await b('POST', '/api/bookings', { amenity_id: am, date: TODAY, start: '18:00' })).body.id;
    assert.equal((await mod(t.admin)).bookings_today, 2);
    assert.equal((await a('POST', `/api/bookings/${k2}/cancel`)).status, 200);
    assert.equal((await mod(t.admin)).bookings_today, 1);
    assert.equal((await mod(a)).next_booking.date, TOMORROW);
    assert.equal((await t.admin('POST', `/api/bookings/${k3}/cancel`, { reason: 'Painting' })).status, 200);
    assert.ok(await has(b, /committee cancelled your Clubhouse booking .*Painting/));
    assert.equal((await mod(t.admin)).bookings_today, 0);
    assert.equal((await a('POST', `/api/bookings/${k1}/cancel`)).status, 200);
    assert.equal((await mod(a)).next_booking, null);
  } finally { t.close(); }
});

test('inventory: staff stock-out to the reorder level -> committee notified + low_stock; restock clears it', async () => {
  const t = await boot();
  try {
    const head = await t.account('head', 'ih@x.test'), member = await t.account('member', 'im@x.test');
    const mt = await t.account('maintenance', 'imt@x.test'), cl = await t.account('cleaner', 'icl@x.test');
    const tape = (await t.admin('POST', '/api/inventory', { name: 'PTFE tape', category: 'plumbing', quantity: 10, min_qty: 3 })).body.id;
    assert.equal((await mod(t.admin)).low_stock, 0);
    assert.equal((await cl('POST', `/api/inventory/${tape}/move`, { change: -1 })).status, 403, 'cleaning staff do not see inventory');
    assert.equal((await mt('POST', `/api/inventory/${tape}/move`, { change: 2 })).status, 403, 'staff only take stock out');
    assert.equal((await mt('POST', `/api/inventory/${tape}/move`, { change: -11 })).status, 409);
    const m1 = await mt('POST', `/api/inventory/${tape}/move`, { change: -6, note: 'job' });
    assert.equal(m1.status, 200); assert.equal(m1.body.low, false);
    assert.ok(!(await has(t.admin, /Low stock/)), 'not low yet');
    const m2 = await mt('POST', `/api/inventory/${tape}/move`, { change: -1 });
    assert.equal(m2.body.quantity, 3); assert.equal(m2.body.low, true);
    for (const c of [t.admin, head, member]) assert.ok(await has(c, /Low stock: PTFE tape is down to 3/), 'every committee member is told');
    assert.ok(!(await has(mt, /Low stock/)));
    assert.equal((await mod(t.admin)).low_stock, 1);
    assert.equal((await mod(member)).low_stock, 1);
    await mt('POST', `/api/inventory/${tape}/move`, { change: -1 });
    assert.equal((await notes(t.admin)).filter(m => /Low stock/.test(m)).length, 1, 'told once while it stays low');
    assert.equal((await t.admin('POST', `/api/inventory/${tape}/move`, { change: 8 })).body.low, false);
    assert.equal((await mod(t.admin)).low_stock, 0);
    await mt('POST', `/api/inventory/${tape}/move`, { change: -7 });
    assert.equal((await notes(t.admin)).filter(m => /Low stock/.test(m)).length, 2, 'told again after a restock');
    assert.equal((await mod(t.admin)).low_stock, 1);
    // raising the reorder level also makes it low on the dashboard
    const glue = (await t.admin('POST', '/api/inventory', { name: 'Glue', quantity: 5, min_qty: 1 })).body.id;
    assert.equal((await t.admin('PATCH', `/api/inventory/${glue}`, { min_qty: 5 })).status, 200);
    assert.equal((await mod(t.admin)).low_stock, 2);
    assert.equal((await t.admin('GET', '/api/inventory?low=1')).body.length, 2);
  } finally { t.close(); }
});

test('waste: schedule -> resident waste_today; cleaner logs -> committee waste_kg_7d (7-day window)', async () => {
  const t = await boot();
  try {
    const a = await t.resident('wa@x.test', 'A-1');
    const cl = await t.account('cleaner', 'wcl@x.test'), mt = await t.account('maintenance', 'wmt@x.test');
    assert.deepEqual((await mod(a)).waste_today, []);
    const wet = (await t.admin('POST', '/api/waste/schedule', { weekday: WEDNESDAY, kind: 'wet', time: '07:30' })).body.id;
    await t.admin('POST', '/api/waste/schedule', { weekday: WEDNESDAY, kind: 'dry', time: '06:45' });
    await t.admin('POST', '/api/waste/schedule', { weekday: 3, kind: 'recyclable', time: '08:00' });
    assert.deepEqual((await mod(a)).waste_today, [{ kind: 'dry', time: '06:45' }, { kind: 'wet', time: '07:30' }], 'today only, by time');
    assert.equal((await cl('GET', '/api/waste/schedule')).body.length, 3, 'cleaners see the schedule');
    assert.equal((await t.admin('DELETE', `/api/waste/schedule/${wet}`)).status, 200);
    assert.deepEqual((await mod(a)).waste_today.map(x => x.kind), ['dry']);
    assert.equal((await mod(t.admin)).waste_kg_7d, 0);
    assert.equal((await mt('POST', '/api/waste/logs', { kind: 'wet', weight_kg: 5 })).status, 403, 'maintenance staff do not log waste');
    assert.equal((await cl('POST', '/api/waste/logs', { kind: 'wet', weight_kg: 12.5 })).status, 201);
    assert.equal((await cl('POST', '/api/waste/logs', { kind: 'dry', weight_kg: 4, date: '2026-11-19' })).status, 201, '6 days ago is inside');
    assert.equal((await cl('POST', '/api/waste/logs', { kind: 'dry', weight_kg: 100, date: '2026-11-18' })).status, 201, '7 days ago is outside');
    assert.equal((await cl('POST', '/api/waste/logs', { kind: 'dry', weight_kg: 1, date: TOMORROW })).status, 400);
    assert.equal((await mod(t.admin)).waste_kg_7d, 16.5);
    const logs = (await cl('GET', '/api/waste/logs?days=7')).body;
    assert.equal(logs.totals.total, 16.5, 'logs and dashboard agree');
    assert.equal((await a('GET', '/api/waste/logs')).status, 403);
    // missed pickup becomes a housekeeping request the committee sees
    const miss = await a('POST', '/api/waste/missed', { kind: 'dry', note: 'Bin full' });
    assert.equal(miss.status, 201);
    assert.ok(await has(t.admin, /New housekeeping request from flat A-1: Missed dry waste pickup/));
    assert.ok((await t.admin('GET', '/api/requests')).body.some(r => r.id === miss.body.id && r.category === 'housekeeping'));
  } finally { t.close(); }
});

test('tuck shop: order -> shop owner notified (not committee) -> shop_to_prepare and low_shop_stock both ways', async () => {
  const t = await boot();
  try {
    const a = await t.resident('sa@x.test', 'A-1'), st = await t.account('shop', 'sst@x.test'), head = await t.account('head', 'shd@x.test');
    const milk = (await st('POST', '/api/shop/items', { name: 'Milk', category: 'dairy', price: 30, stock: 5 })).body.id;
    assert.equal((await svc(t.admin)).shop_to_prepare, 0);
    assert.equal((await svc(t.admin)).low_shop_stock, 0);
    const o = (await a('POST', '/api/shop/orders', { items: [{ id: milk, qty: 2 }] })).body.id;
    assert.ok(await has(st, new RegExp(`New tuck shop order #${o} from flat A-1`)));
    for (const c of [t.admin, head]) assert.ok(!(await has(c, /New tuck shop order/)), 'the committee is not asked to fulfil');
    let s = await svc(t.admin);
    assert.equal(s.shop_to_prepare, 1); assert.equal(s.low_shop_stock, 1, 'stock 3 is low');
    assert.equal((await svc(a)).shop_ready, 0);
    assert.equal((await st('POST', `/api/shop/orders/${o}/status`, { status: 'ready' })).status, 200);
    assert.equal((await svc(t.admin)).shop_to_prepare, 0, 'ready is no longer to prepare');
    assert.equal((await svc(a)).shop_ready, 1);
    assert.ok(await has(a, /is ready/));
    assert.equal((await st('POST', `/api/shop/orders/${o}/status`, { status: 'delivered' })).status, 200);
    assert.equal((await svc(a)).shop_ready, 0);
    // a cancelled order leaves the queue and puts stock back
    const o2 = (await a('POST', '/api/shop/orders', { items: [{ id: milk, qty: 1 }] })).body.id;
    assert.equal((await svc(t.admin)).shop_to_prepare, 1);
    assert.equal((await a('POST', `/api/shop/orders/${o2}/status`, { status: 'cancelled' })).status, 200);
    assert.ok(await has(st, new RegExp(`cancelled tuck shop order #${o2}`)));
    s = await svc(t.admin);
    assert.equal(s.shop_to_prepare, 0); assert.equal(s.low_shop_stock, 1);
    assert.equal((await st('PATCH', `/api/shop/items/${milk}`, { stock: 20 })).status, 200);
    assert.equal((await svc(t.admin)).low_shop_stock, 0, 'restock clears low stock');
  } finally { t.close(); }
});

test('laundry: pickup -> laundry service notified -> laundry_to_pick / in_progress / ready move through the flow', async () => {
  const t = await boot();
  try {
    const a = await t.resident('la@x.test', 'A-1'), lo = await t.account('laundry', 'llo@x.test'), st = await t.account('shop', 'lst@x.test');
    const shirt = (await lo('POST', '/api/laundry/rates', { item: 'Shirt', price: 20 })).body.id;
    const o = (await a('POST', '/api/laundry/orders', { pickup_date: TOMORROW, pickup_slot: 'morning', items: [{ id: shirt, qty: 3 }] })).body.id;
    assert.ok(await has(lo, new RegExp(`Laundry pickup #${o} for flat A-1 on ${TOMORROW}`)));
    assert.ok(!(await has(t.admin, /Laundry pickup/)), 'the committee is not asked');
    assert.ok(!(await has(st, /Laundry pickup/)), 'the shop is not asked');
    let s = await svc(t.admin);
    assert.equal(s.laundry_to_pick, 1); assert.equal(s.laundry_in_progress, 0);
    assert.equal((await svc(a)).laundry_open, 1);
    assert.equal((await lo('POST', `/api/laundry/orders/${o}/status`, { status: 'picked_up' })).status, 200);
    s = await svc(t.admin);
    assert.equal(s.laundry_to_pick, 0); assert.equal(s.laundry_in_progress, 1);
    assert.ok(await has(a, new RegExp(`Laundry #${o} is picked up`)));
    await lo('POST', `/api/laundry/orders/${o}/status`, { status: 'washing' });
    await lo('POST', `/api/laundry/orders/${o}/status`, { status: 'ready' });
    assert.equal((await svc(a)).laundry_ready, 1);
    assert.equal((await lo('POST', `/api/laundry/orders/${o}/status`, { status: 'delivered' })).status, 200);
    s = await svc(t.admin);
    assert.equal(s.laundry_in_progress, 0);
    const ra = await svc(a);
    assert.equal(ra.laundry_ready, 0); assert.equal(ra.laundry_open, 0);
    // resident cancel while requested
    const o2 = (await a('POST', '/api/laundry/orders', { pickup_date: TOMORROW, pickup_slot: 'evening', items: [{ id: shirt, qty: 1 }] })).body.id;
    assert.equal((await svc(t.admin)).laundry_to_pick, 1);
    assert.equal((await a('POST', `/api/laundry/orders/${o2}/status`, { status: 'cancelled' })).status, 200);
    assert.ok(await has(lo, new RegExp(`cancelled laundry pickup #${o2}`)));
    assert.equal((await svc(t.admin)).laundry_to_pick, 0);
  } finally { t.close(); }
});

test('IT health: support ticket and backup show up in tickets, last_backup and system_events', async () => {
  const t = await boot();
  try {
    const a = await t.resident('ta@x.test', 'A-1'), it = await t.account('it', 'tit@x.test'), member = await t.account('member', 'tmb@x.test');
    assert.equal((await member('GET', '/api/it/health')).status, 403, 'committee members are not IT');
    let h = (await it('GET', '/api/it/health')).body;
    assert.equal(h.tickets.open, 0); assert.equal(h.counts.open_tickets, 0); assert.equal(h.last_backup, null);
    const tk = (await a('POST', '/api/support', { subject: 'Cannot upload photo', body: 'Fails on save', kind: 'bug' })).body.id;
    assert.ok(await has(it, new RegExp(`New support ticket #${tk}`)));
    assert.ok(await has(t.admin, new RegExp(`New support ticket #${tk}`)), 'the sysadmin is IT too');
    assert.ok(!(await has(member, /New support ticket/)));
    h = (await it('GET', '/api/it/health')).body;
    assert.equal(h.tickets.open, 1); assert.equal(h.counts.open_tickets, 1);
    assert.equal((await it('POST', `/api/support/${tk}/reply`, { body: 'Looking', status: 'in_progress' })).status, 200);
    h = (await it('GET', '/api/it/health')).body;
    assert.equal(h.tickets.open, 0); assert.equal(h.tickets.in_progress, 1); assert.equal(h.counts.open_tickets, 1);
    assert.ok(await has(a, /IT replied on your ticket/));
    assert.equal((await it('POST', `/api/support/${tk}/reply`, { status: 'resolved' })).status, 200);
    h = (await it('GET', '/api/it/health')).body;
    assert.equal(h.tickets.in_progress, 0); assert.equal(h.tickets.resolved_30d, 1); assert.equal(h.counts.open_tickets, 0);
    const bk = await it('GET', '/api/it/backup');
    assert.equal(bk.status, 200); assert.ok(bk.body.byteLength > 0);
    h = (await it('GET', '/api/it/health')).body;
    assert.ok(h.last_backup, 'last_backup is set');
    assert.equal(h.system_events[0].action, 'backup');
    assert.equal(h.system_events[0].actor, 'it one');
    assert.equal((await it('PUT', '/api/it/maintenance', { message: 'Upgrade tonight', until: '23:00' })).status, 200);
    h = (await it('GET', '/api/it/health')).body;
    assert.equal(h.system_events[0].action, 'maintenance_set');
    assert.equal(h.maintenance.message, 'Upgrade tonight');
    assert.ok(await has(a, /Planned maintenance: Upgrade tonight/));
  } finally { t.close(); }
});

test('emergency: raised by a resident -> every approved committee account incl. head is notified -> resolved', async () => {
  const t = await boot();
  try {
    const a = await t.resident('xa@x.test', 'A-1'), b = await t.resident('xb@x.test', 'B-1');
    const head = await t.account('head', 'xh@x.test'), member = await t.account('member', 'xm@x.test');
    const g = await t.account('guard', 'xg@x.test');
    const e = await a('POST', '/api/emergencies', { type: 'medical', note: 'Fainted in lift lobby' });
    assert.equal(e.status, 201);
    for (const c of [t.admin, head, member]) assert.ok(await has(c, /EMERGENCY \(Medical\) from flat A-1: Fainted/), 'committee and head are told');
    assert.ok(!(await has(b, /EMERGENCY/)));
    assert.ok(!(await has(g, /EMERGENCY/)));
    assert.equal((await head('GET', '/api/emergencies')).body.find(x => x.id === e.body.id).status, 'active');
    assert.equal((await b('GET', '/api/emergencies')).body.length, 0, 'other flats do not see it');
    assert.equal((await a('POST', `/api/emergencies/${e.body.id}/resolve`)).status, 403);
    assert.equal((await head('POST', `/api/emergencies/${e.body.id}/resolve`)).status, 200);
    assert.ok(await has(a, /medical emergency alert has been marked resolved/));
    assert.equal((await a('GET', '/api/emergencies')).body[0].status, 'resolved');
  } finally { t.close(); }
});
