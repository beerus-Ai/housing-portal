// Society modules from the faculty whiteboard (docs/modules-api.md): amenities, dues, inventory, waste.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';
// Fixed clock: 2026-11-25 12:00 IST (06:30 UTC), so slot and due-date rules are deterministic.
const NOW = new Date('2026-11-25T06:30:00Z');

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-mod-'));
  const app = createApp({ dbFile: path.join(dir, 'm.db'), uploadDir: path.join(dir, 'up'), noTimers: true, clock: () => NOW });
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
  const resident = async (email, flat, type = 'owner') => {
    const c = client();
    assert.equal((await client()('POST', '/api/register', { name: email.split('@')[0], email, flat, resident_type: type, password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    assert.equal((await admin('POST', `/api/admin/users/${p.id}/approve`)).status, 200);
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    return c;
  };
  const staff = async () => {
    assert.equal((await admin('POST', '/api/admin/accounts', { name: 'Staff One', email: 'st@x.test', password: PW, kind: 'staff' })).status, 201);
    const c = client();
    assert.equal((await c('POST', '/api/login', { email: 'st@x.test', password: PW })).status, 200);
    return c;
  };
  const close = () => { server.close(); try { app.locals.db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); };
  return { app, admin, client, resident, staff, close };
}

test('amenities: committee sets up, residents book free slots, no double booking, limits, cancel', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const a = await t.resident('a@x.test', 'A-101'), b = await t.resident('b@x.test', 'B-202');
    assert.equal((await a('POST', '/api/amenities', { name: 'Clubhouse' })).status, 403);
    assert.equal((await admin('POST', '/api/amenities', { name: 'Clubhouse', open_from: '10:00', open_to: '09:00' })).status, 400);
    const club = (await admin('POST', '/api/amenities', { name: 'Clubhouse', capacity: 40, open_from: '08:00', open_to: '20:00', slot_minutes: 120 })).body.id;
    assert.equal((await admin('POST', '/api/amenities', { name: 'clubhouse' })).status, 409);

    const slots = (await a('GET', `/api/amenities/${club}/slots?date=2026-11-25`)).body.slots;
    assert.deepEqual(slots.map(s => s.start), ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00']);
    assert.ok(slots[1].past && !slots[3].past, 'slots before 12:00 IST are past');

    assert.equal((await a('POST', '/api/bookings', { amenity_id: club, date: '2026-11-25', start: '10:00' })).status, 400, 'already started');
    assert.equal((await a('POST', '/api/bookings', { amenity_id: club, date: '2026-11-25', start: '15:00' })).status, 400, 'not a slot');
    assert.equal((await a('POST', '/api/bookings', { amenity_id: club, date: '2027-01-30', start: '14:00' })).status, 400, 'too far ahead');
    const bk = await a('POST', '/api/bookings', { amenity_id: club, date: '2026-11-26', start: '14:00' });
    assert.equal(bk.status, 201);
    assert.equal((await b('POST', '/api/bookings', { amenity_id: club, date: '2026-11-26', start: '14:00' })).status, 409, 'slot taken');

    const seenByB = (await b('GET', `/api/amenities/${club}/slots?date=2026-11-26`)).body.slots.find(s => s.start === '14:00');
    assert.equal(seenByB.status, 'taken'); assert.equal(seenByB.flat, undefined, 'other flats do not see who booked');
    assert.equal((await a('GET', `/api/amenities/${club}/slots?date=2026-11-26`)).body.slots.find(s => s.start === '14:00').status, 'mine');

    assert.equal((await a('POST', '/api/bookings', { amenity_id: club, date: '2026-11-27', start: '08:00' })).status, 201);
    assert.equal((await a('POST', '/api/bookings', { amenity_id: club, date: '2026-11-28', start: '08:00' })).status, 409, 'two upcoming per flat');

    assert.equal((await b('POST', `/api/bookings/${bk.body.id}/cancel`)).status, 404, 'another flat cannot cancel');
    assert.equal((await a('GET', '/api/bookings')).body.length, 2);
    assert.equal((await b('GET', '/api/bookings')).body.length, 0);
    assert.equal((await admin('GET', '/api/bookings')).body.length, 2);
    assert.equal((await a('POST', `/api/bookings/${bk.body.id}/cancel`)).status, 200);
    assert.equal((await b('POST', '/api/bookings', { amenity_id: club, date: '2026-11-26', start: '14:00' })).status, 201, 'freed slot can be rebooked');

    assert.equal((await admin('PATCH', `/api/amenities/${club}`, { active: false })).status, 200);
    assert.equal((await a('GET', '/api/amenities')).body.length, 0, 'closed amenity hidden from residents');
    assert.equal((await a('POST', '/api/bookings', { amenity_id: club, date: '2026-11-29', start: '08:00' })).status, 404);
    const audit = (await admin('GET', '/api/admin/audit')).body;
    assert.ok(audit.some(x => x.entity === 'booking' && x.action === 'cancelled'));
  } finally { t.close(); }
});

test('dues: bill every flat, residents see only their own, partial and full payment, overdue', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const a = await t.resident('a@x.test', 'A-101'), a2 = await t.resident('a2@x.test', 'A-101', 'family'), b = await t.resident('b@x.test', 'B-202');
    assert.equal((await a('POST', '/api/admin/dues', { period: '2026-11', amount: 2500, due_date: '2026-11-30' })).status, 403);
    assert.equal((await admin('POST', '/api/admin/dues', { period: '2026-13', amount: 2500, due_date: '2026-11-30' })).status, 400);
    const r = await admin('POST', '/api/admin/dues', { period: '2026-11', amount: 2500, due_date: '2026-11-30' });
    assert.deepEqual(r.body, { created: 2, skipped: 0 }, 'one bill per flat, not per person');
    assert.deepEqual((await admin('POST', '/api/admin/dues', { period: '2026-11', amount: 2500, due_date: '2026-11-30' })).body, { created: 0, skipped: 2 });
    await admin('POST', '/api/admin/dues', { period: '2026-10', amount: 2500, due_date: '2026-10-31', flats: ['B-202'] });

    const mine = (await a('GET', '/api/dues')).body;
    assert.equal(mine.dues.length, 1); assert.equal(mine.dues[0].flat, 'A-101'); assert.equal(mine.dues[0].status, 'unpaid');
    assert.equal((await a2('GET', '/api/dues')).body.dues.length, 1, 'family of the flat sees the flat bill');
    const bDues = (await b('GET', '/api/dues')).body;
    assert.equal(bDues.dues.find(d => d.period === '2026-10').status, 'overdue');
    assert.equal((await b('GET', `/api/dues/${mine.dues[0].id}`)).status, 404, 'other flats cannot read it');

    const id = mine.dues[0].id;
    assert.equal((await a('POST', `/api/admin/dues/${id}/payments`, { amount: 100, method: 'cash' })).status, 403, 'residents cannot mark themselves paid');
    assert.equal((await admin('POST', `/api/admin/dues/${id}/payments`, { amount: 3000, method: 'cash' })).status, 400, 'more than balance');
    assert.equal((await admin('POST', `/api/admin/dues/${id}/payments`, { amount: 1000, method: 'crypto' })).status, 400);
    assert.equal((await admin('POST', `/api/admin/dues/${id}/payments`, { amount: 1000, method: 'upi', reference: 'UPI123' })).body.balance, 1500);
    assert.equal((await a('GET', `/api/dues/${id}`)).body.status, 'partial');
    await admin('POST', `/api/admin/dues/${id}/payments`, { amount: 1500, method: 'cash' });
    const paid = (await a('GET', `/api/dues/${id}`)).body;
    assert.equal(paid.status, 'paid'); assert.equal(paid.payments.length, 2);
    assert.equal((await admin('POST', `/api/admin/dues/${id}/payments`, { amount: 1, method: 'cash' })).status, 409);

    const all = (await admin('GET', '/api/dues')).body.totals;
    assert.deepEqual(all, { billed: 7500, collected: 2500, outstanding: 5000, overdue: 1 });
    assert.ok((await (async () => (await a('GET', '/api/notifications')).body)()).some(n => /Paid in full/.test(n.message)));
  } finally { t.close(); }
});

test('inventory: committee stocks, staff takes out for a job, never below zero, low-stock alert', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const st = await t.staff(), a = await t.resident('a@x.test', 'A-101');
    assert.equal((await a('GET', '/api/inventory')).status, 403);
    const id = (await admin('POST', '/api/inventory', { name: 'LED tube 20W', category: 'electrical', quantity: 5, min_qty: 2, location: 'Store room' })).body.id;
    assert.equal((await admin('POST', '/api/inventory', { name: 'led TUBE 20w', category: 'electrical' })).status, 409);
    assert.equal((await st('POST', '/api/inventory', { name: 'X', category: 'other' })).status, 403);
    assert.equal((await st('POST', `/api/inventory/${id}/move`, { change: 3 })).status, 403, 'staff cannot add stock');
    assert.equal((await st('POST', `/api/inventory/${id}/move`, { change: -6 })).status, 409);
    const after = (await st('POST', `/api/inventory/${id}/move`, { change: -3, note: 'Corridor lights' })).body;
    assert.equal(after.quantity, 2); assert.equal(after.low, true);
    assert.ok((await admin('GET', '/api/notifications')).body.some(n => /Low stock: LED tube 20W/.test(n.message)));
    assert.equal((await admin('GET', '/api/inventory?low=1')).body.length, 1);
    assert.equal((await admin('POST', `/api/inventory/${id}/move`, { change: 10, note: 'Purchase' })).body.quantity, 12);
    const moves = (await st('GET', `/api/inventory/${id}/moves`)).body;
    assert.deepEqual(moves.map(m => m.change), [10, -3, 5]);
  } finally { t.close(); }
});

test('waste: schedule for everyone, staff log collections, resident reports a missed pickup as a request', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const st = await t.staff(), a = await t.resident('a@x.test', 'A-101');
    assert.equal((await a('POST', '/api/waste/schedule', { weekday: 2, kind: 'wet', time: '07:00' })).status, 403);
    assert.equal((await admin('POST', '/api/waste/schedule', { weekday: 2, kind: 'wet', time: '07:00' })).status, 201);
    assert.equal((await admin('POST', '/api/waste/schedule', { weekday: 2, kind: 'wet', time: '08:00' })).status, 409);
    await admin('POST', '/api/waste/schedule', { weekday: 2, kind: 'dry', time: '09:00' });
    const sched = (await a('GET', '/api/waste/schedule')).body;
    assert.deepEqual(sched.map(s => [s.day, s.kind]), [['Wednesday', 'wet'], ['Wednesday', 'dry']]);
    assert.deepEqual((await a('GET', '/api/modules/summary')).body.waste_today.map(w => w.kind), ['wet', 'dry'], '2026-11-25 is a Wednesday');

    assert.equal((await a('POST', '/api/waste/logs', { kind: 'wet', weight_kg: 10 })).status, 403);
    assert.equal((await st('POST', '/api/waste/logs', { kind: 'wet', weight_kg: 30 })).status, 201);
    assert.equal((await st('POST', '/api/waste/logs', { kind: 'dry', weight_kg: 10, date: '2026-11-24' })).status, 201);
    assert.equal((await st('POST', '/api/waste/logs', { kind: 'dry', weight_kg: 10, date: '2026-12-01' })).status, 400);
    const logs = (await admin('GET', '/api/waste/logs?days=7')).body;
    assert.equal(logs.totals.total, 40); assert.equal(logs.totals.segregated_pct, 75);

    const r = await a('POST', '/api/waste/missed', { kind: 'dry', note: 'Bin outside A-101 still full' });
    assert.equal(r.status, 201);
    const req = (await admin('GET', `/api/requests/${r.body.id}`)).body;
    assert.equal(req.category, 'housekeeping'); assert.equal(req.title, 'Missed dry waste pickup'); assert.equal(req.status, 'open');
  } finally { t.close(); }
});

test('summary: committee and resident dashboard counts', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const a = await t.resident('a@x.test', 'A-101');
    const club = (await admin('POST', '/api/amenities', { name: 'Gym', open_from: '06:00', open_to: '22:00' })).body.id;
    await a('POST', '/api/bookings', { amenity_id: club, date: '2026-11-25', start: '18:00' });
    await admin('POST', '/api/admin/dues', { period: '2026-11', amount: 2000, due_date: '2026-11-20' });
    await admin('POST', '/api/inventory', { name: 'Mop', category: 'cleaning', quantity: 0, min_qty: 1 });
    const s = (await admin('GET', '/api/modules/summary')).body;
    assert.deepEqual(s, { bookings_today: 1, dues_outstanding: 2000, dues_overdue: 1, low_stock: 1, waste_kg_7d: 0 });
    const r = (await a('GET', '/api/modules/summary')).body;
    assert.equal(r.dues_balance, 2000); assert.equal(r.next_booking.amenity, 'Gym'); assert.equal(r.next_booking.start, '18:00');
  } finally { t.close(); }
});
