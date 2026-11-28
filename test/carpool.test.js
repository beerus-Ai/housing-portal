// Carpool (docs/carpool-api.md): offer a ride, ask for a seat, driver accepts or declines, phones shared only after
// acceptance, seats never oversold, cancellations notify, committee moderation, other roles refused. Synthetic data only.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-car-'));
  const app = createApp({ dbFile: path.join(dir, 'c.db'), uploadDir: path.join(dir, 'up'), noTimers: true, clock: () => NOW });
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
  const resident = async (email, flat, phone) => {
    const c = client();
    assert.equal((await client()('POST', '/api/register', { name: email.split('@')[0], email, flat, phone, resident_type: 'owner', password: PW, consent: true })).status, 201);
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
const notes = async c => (await c('GET', '/api/notifications')).body.map(n => n.message);
const rideOf = async (c, id) => (await c('GET', '/api/carpool')).body.find(r => r.id === id);

test('carpool: offer, ask, accept or decline, phones only after acceptance, seats never oversold', async () => {
  const t = await boot();
  try {
    const driver = await t.resident('driver@x.test', 'A-1', '9800000001');
    const r1 = await t.resident('rider1@x.test', 'B-2', '9800000002');
    const r2 = await t.resident('rider2@x.test', 'C-3', '9800000003');
    const r3 = await t.resident('rider3@x.test', 'D-4', '9800000004');
    const late = await t.resident('late@x.test', 'E-5', '9800000005');

    // validation
    assert.equal((await driver('POST', '/api/carpool', { depart_at: '2026-11-26T08:30', seats: 2 })).status, 400, 'destination needed');
    assert.equal((await driver('POST', '/api/carpool', { to_place: 'Hinjewadi', depart_at: '2026-11-25T11:00', seats: 2 })).status, 400, 'time in the past');
    assert.equal((await driver('POST', '/api/carpool', { to_place: 'Hinjewadi', depart_at: '2026-11-26T08:30', seats: 9 })).status, 400, 'too many seats');
    assert.equal((await driver('POST', '/api/carpool', { to_place: 'Hinjewadi', depart_at: '2026-11-26T08:30', seats: 2, cost_per_seat: -5 })).status, 400, 'negative cost');
    const ride = await driver('POST', '/api/carpool', { to_place: 'Hinjewadi Phase 1', depart_at: '2026-11-26T08:30', seats: 2, cost_per_seat: 80, note: 'Leaving from gate 2' });
    assert.equal(ride.status, 201);
    const id = ride.body.id;
    assert.equal((await driver('POST', '/api/carpool', { to_place: 'Airport', depart_at: '2026-11-26T08:30', seats: 1 })).status, 409, 'two rides at the same time');

    // riders see the ride, but not the driver's phone or the other riders
    const seen = await rideOf(r1, id);
    assert.equal(seen.from_place, 'Sahyadri Heights'); assert.equal(seen.seats_left, 2); assert.equal(seen.cost_per_seat, 80);
    assert.equal(seen.driver.flat, 'A-1'); assert.equal(seen.driver.phone, null); assert.equal(seen.requests, undefined);
    assert.equal((await driver('POST', `/api/carpool/${id}/request`, {})).status, 409, 'own ride');

    // rider1 asks for 1 seat, rider2 for 2; the driver is told
    const q1 = await r1('POST', `/api/carpool/${id}/request`, {});
    assert.equal(q1.status, 201);
    assert.equal((await r1('POST', `/api/carpool/${id}/request`, {})).status, 409, 'asked twice');
    assert.ok((await notes(driver)).some(m => /rider1 \(Flat B-2\) asks for 1 seat to Hinjewadi Phase 1 on 2026-11-26 at 08:30/.test(m)));
    const q2 = await r2('POST', `/api/carpool/${id}/request`, { seats: 2 });
    assert.equal(q2.status, 201);
    let mine = await rideOf(driver, id);
    assert.equal(mine.mine, true); assert.equal(mine.requests.length, 2); assert.ok(mine.requests.every(x => x.phone === null));
    assert.equal((await r1('POST', `/api/carpool/requests/${q1.body.id}/decide`, { decision: 'accept' })).status, 404, 'only the driver decides');
    assert.equal((await driver('POST', `/api/carpool/requests/${q1.body.id}/decide`, { decision: 'maybe' })).status, 400);

    // accept rider1: 1 seat left, so rider2's 2 seats cannot be accepted; decline them; they cannot ask again
    assert.equal((await driver('POST', `/api/carpool/requests/${q1.body.id}/decide`, { decision: 'accept' })).status, 200);
    assert.ok((await notes(r1)).some(m => /seat to Hinjewadi Phase 1 on 2026-11-26 at 08:30 is confirmed/.test(m)));
    assert.equal((await driver('POST', `/api/carpool/requests/${q2.body.id}/decide`, { decision: 'accept' })).status, 409, 'not enough seats');
    assert.equal((await driver('POST', `/api/carpool/requests/${q2.body.id}/decide`, { decision: 'decline' })).status, 200);
    assert.ok((await notes(r2)).some(m => /could not take you/.test(m)));
    assert.equal((await r2('POST', `/api/carpool/${id}/request`, {})).status, 409, 'declined');

    // rider3 takes the last seat; the ride is then full
    const q3 = await r3('POST', `/api/carpool/${id}/request`, {});
    assert.equal(q3.status, 201);
    assert.equal((await driver('POST', `/api/carpool/requests/${q3.body.id}/decide`, { decision: 'accept' })).status, 200);
    assert.equal((await rideOf(late, id)).seats_left, 0);
    const full = await late('POST', `/api/carpool/${id}/request`, {});
    assert.equal(full.status, 409); assert.match(full.body.error, /full/);

    // phones: accepted riders see the driver's; the driver sees accepted riders'; a declined rider sees nothing
    assert.equal((await rideOf(r1, id)).driver.phone, '9800000001');
    assert.equal((await rideOf(r2, id)).driver.phone, null);
    mine = await rideOf(driver, id);
    assert.deepEqual(mine.requests.map(x => [x.flat, x.status, x.phone]), [['B-2', 'accepted', '9800000002'], ['C-3', 'declined', null], ['D-4', 'accepted', '9800000004']]);

    // rider3 withdraws: the seat frees up, the driver is told, and someone else can ask
    assert.equal((await r3('POST', `/api/carpool/requests/${q3.body.id}/cancel`)).status, 200);
    assert.ok((await notes(driver)).some(m => /rider3 \(Flat D-4\) no longer needs a seat/.test(m)));
    assert.equal((await rideOf(late, id)).seats_left, 1);
    assert.equal((await late('POST', `/api/carpool/${id}/request`, {})).status, 201);

    // the driver cancels: riders with a seat or a pending request are told, and nobody can ask any more
    assert.equal((await driver('POST', `/api/carpool/${id}/cancel`)).status, 200);
    assert.ok((await notes(r1)).some(m => /Carpool to Hinjewadi Phase 1 on 2026-11-26 at 08:30 was cancelled by the driver/.test(m)));
    assert.ok((await notes(late)).some(m => /was cancelled by the driver/.test(m)));
    assert.equal((await rideOf(r1, id)), undefined, 'a cancelled ride leaves the riders list');
    assert.equal((await rideOf(driver, id)).status, 'cancelled', 'the driver still sees it');
    assert.equal((await driver('POST', `/api/carpool/${id}/cancel`)).status, 409);

    // audit trail
    const audit = (await t.admin('GET', '/api/admin/audit')).body;
    const rows = (Array.isArray(audit) ? audit : audit.rows || []).filter(a => /^carpool/.test(a.entity));
    for (const act of ['offered', 'requested', 'accepted', 'declined', 'cancelled']) assert.ok(rows.some(a => a.action === act), 'audited: ' + act);
  } finally { t.close(); }
});

test('carpool: committee moderation; other roles are refused', async () => {
  const t = await boot();
  try {
    const driver = await t.resident('d2@x.test', 'F-6');
    const rider = await t.resident('r9@x.test', 'G-7');
    const id = (await driver('POST', '/api/carpool', { to_place: 'Railway station', depart_at: '2026-11-27T18:00', seats: 3 })).body.id;
    await rider('POST', `/api/carpool/${id}/request`, {});
    const seen = (await t.admin('GET', '/api/carpool')).body.find(r => r.id === id);
    assert.equal(seen.requests.length, 1); assert.equal(seen.requests[0].phone, null, 'the committee does not get phones');
    assert.equal((await t.admin('POST', '/api/carpool', { to_place: 'X', depart_at: '2026-11-27T18:00', seats: 1 })).status, 403, 'only residents offer rides');
    assert.equal((await rider('POST', `/api/carpool/${id}/cancel`)).status, 404, 'a rider cannot cancel the ride');
    assert.equal((await t.admin('POST', `/api/carpool/${id}/cancel`)).status, 200);
    assert.ok((await notes(driver)).some(m => /The committee took down your carpool to Railway station/.test(m)));
    assert.ok((await notes(rider)).some(m => /cancelled by the committee/.test(m)));
    for (const kind of ['guard', 'cleaner', 'shop']) {
      const c = await t.account(kind, `${kind}@x.test`);
      assert.equal((await c('GET', '/api/carpool')).status, 403, kind);
    }
  } finally { t.close(); }
});
