// Integration: onboarding -> community card -> gate taps -> presence/log -> staff shifts -> attendance -> card timeline.
// Checks that registration (app.js), accounts (roles.js) and cards/gate (nfc.js) really connect through the HTTP API.
// Tests marked `todo` assert the correct behaviour for suspected bugs; they are reported but do not fail the run.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-icg-'));
  const app = createApp({ dbFile: path.join(dir, 'i.db'), uploadDir: path.join(dir, 'up'), noTimers: true });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const client = () => { let cookie = ''; return async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    const text = await res.text(); let b; try { b = JSON.parse(text); } catch { b = text; }
    return { status: res.status, body: b };
  }; };
  const admin = client();
  assert.equal((await admin('POST', '/api/login', ADMIN)).status, 200);
  const account = async (kind, email, name = kind + ' person') => {
    const r = await admin('POST', '/api/admin/accounts', { name, email, password: PW, kind });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const c = client(); assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    return { id: r.body.id, c };
  };
  const resident = async (email, flat, name = 'Res ' + flat) => {
    assert.equal((await client()('POST', '/api/register', { name, email, flat, resident_type: 'owner', password: PW, consent: true })).status, 201);
    const pend = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    assert.ok(pend, 'registration shows as pending');
    const pre = client(); assert.equal((await pre('POST', '/api/login', { email, password: PW })).status, 403, 'pending cannot sign in');
    assert.equal((await admin('POST', `/api/admin/users/${pend.id}/approve`)).status, 200);
    const c = client(); assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    return { id: pend.id, c };
  };
  return { admin, client, account, resident, close: () => server.close() };
}

test('resident onboarding: register -> pending -> approve -> card -> gate in/out -> presence, log, audit, timeline', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const guard = await t.account('guard', 'g@x.test');
    const asha = await t.resident('asha@x.test', 'A-101', 'Asha');
    // committee issues the community card; resident is notified and sees it
    assert.equal((await admin('POST', `/api/admin/users/${asha.id}/card`, { serial: '04:a1:b2:c3' })).status, 201);
    assert.equal((await guard.c('POST', `/api/admin/users/${asha.id}/card`, { serial: '0499' })).status, 403, 'guard cannot use committee card route');
    assert.equal((await asha.c('POST', `/api/admin/users/${asha.id}/card`, { serial: '0499' })).status, 403);
    let me = (await asha.c('GET', '/api/me/card')).body;
    assert.equal(me.cards.length, 1); assert.equal(me.cards[0].serial, '04A1B2C3');
    assert.ok((await asha.c('GET', '/api/notifications')).body.some(n => /community card is ready/.test(n.message)));
    // the guard's card list shows the committee-issued card
    assert.ok((await guard.c('GET', '/api/gate/cards')).body.some(c => c.serial === '04A1B2C3' && c.user_id === asha.id && c.active === true));
    // residents cannot operate the gate desk
    assert.equal((await asha.c('POST', '/api/gate/tap', { serial: '04A1B2C3' })).status, 403);
    assert.equal((await asha.c('GET', '/api/gate/presence')).status, 403);
    // tap in
    const tin = await guard.c('POST', '/api/gate/tap', { serial: '04 A1 B2 C3' });
    assert.equal(tin.status, 200);
    assert.equal(tin.body.direction, 'in'); assert.equal(tin.body.shift, null, 'residents have no shift');
    assert.equal(tin.body.person.id, asha.id); assert.equal(tin.body.person.flat, 'A-101'); assert.ok(tin.body.at);
    let pr = (await guard.c('GET', '/api/gate/presence')).body;
    assert.deepEqual(pr.inside.map(p => p.id), [asha.id]); assert.equal(pr.cards, 1);
    // tap out
    const tout = (await guard.c('POST', '/api/gate/tap', { serial: '04a1b2c3' })).body;
    assert.equal(tout.direction, 'out');
    pr = (await guard.c('GET', '/api/gate/presence')).body;
    assert.equal(pr.inside.length, 0); assert.equal(pr.recent.length, 2);
    // gate log: allowed + exit, with the flat and the guard's name
    const log = (await guard.c('GET', '/api/gate/log')).body.filter(l => l.kind === 'card');
    assert.ok(log.some(l => l.result === 'allowed' && l.subject === 'Asha' && l.flat === 'A-101' && l.guard_name === 'guard person'));
    assert.ok(log.some(l => l.result === 'exit' && l.subject === 'Asha'));
    // admin can read the same desk
    assert.equal((await admin('GET', '/api/gate/presence')).status, 200);
    // audit
    const audit = (await admin('GET', '/api/admin/audit')).body;
    for (const a of ['registered', 'issued', 'checked_in', 'checked_out']) assert.ok(audit.some(x => x.action === a), 'audit ' + a);
    // resident timeline shows both gate events
    me = (await asha.c('GET', '/api/me/card')).body;
    assert.deepEqual(me.activity.filter(e => e.kind === 'gate').map(e => e.text).sort(), ['Checked in at the gate', 'Checked out at the gate']);
    assert.ok(me.money && me.money.balance === 0);
    // committee view of the same timeline
    const adm = (await admin('GET', `/api/admin/users/${asha.id}/card`)).body;
    assert.equal(adm.name, 'Asha'); assert.equal(adm.activity.filter(e => e.kind === 'gate').length, 2);
  } finally { t.close(); }
});

test('staff (cleaner + maintenance): account -> card -> tap starts/ends shift -> /api/staff/shift, attendance, timeline', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const guard = await t.account('guard', 'g@x.test');
    const cl = await t.account('cleaner', 'cl@x.test', 'Clean One');
    const mt = await t.account('maintenance', 'mt@x.test', 'Fix One');
    const accs = (await admin('GET', '/api/admin/accounts')).body;
    assert.equal(accs.find(a => a.id === cl.id).department, 'cleaning');
    assert.equal(accs.find(a => a.id === mt.id).department, 'maintenance');
    assert.equal((await admin('POST', `/api/admin/users/${cl.id}/card`, { serial: 'CC:00:01' })).status, 201);
    assert.equal((await admin('POST', `/api/admin/users/${mt.id}/card`, { serial: 'DD-00-02' })).status, 201);
    assert.equal((await cl.c('GET', '/api/me/card')).body.cards[0].serial, 'CC0001');
    assert.equal((await mt.c('GET', '/api/me/card')).body.cards[0].serial, 'DD0002');

    // cleaner in: shift started, visible everywhere
    const a = (await guard.c('POST', '/api/gate/tap', { serial: 'cc0001' })).body;
    assert.equal(a.direction, 'in'); assert.equal(a.shift, 'started'); assert.equal(a.person.department, 'cleaning');
    assert.ok((await cl.c('GET', '/api/staff/shift')).body.current);
    assert.equal((await mt.c('GET', '/api/staff/shift')).body.current, null);
    assert.equal((await admin('GET', '/api/admin/accounts')).body.find(x => x.id === cl.id).on_shift, true);
    assert.equal((await admin('GET', '/api/admin/staff')).body.find(x => x.id === cl.id).on_shift, true);
    // colleagues are the same department (hand-over stays within cleaning or maintenance)
    assert.ok(!(await mt.c('GET', '/api/staff/shift')).body.colleagues.some(x => x.id === cl.id));
    // manual punch-in now conflicts with the card-started shift
    assert.equal((await cl.c('POST', '/api/staff/punch-in')).status, 409);
    // maintenance in
    assert.equal((await guard.c('POST', '/api/gate/tap', { serial: 'DD0002' })).body.shift, 'started');
    // cleaner out: shift ended
    const b = (await guard.c('POST', '/api/gate/tap', { serial: 'CC0001' })).body;
    assert.equal(b.direction, 'out'); assert.equal(b.shift, 'ended');
    assert.equal((await cl.c('GET', '/api/staff/shift')).body.current, null);
    assert.equal((await cl.c('GET', '/api/staff/shift')).body.recent.length, 1);
    // attendance shows both shifts, cleaner closed and maintenance open
    const att = (await admin('GET', '/api/admin/attendance')).body;
    const clRow = att.find(r => r.user_id === cl.id), mtRow = att.find(r => r.user_id === mt.id);
    assert.ok(clRow && clRow.punch_out, 'cleaner shift closed in attendance');
    assert.ok(mtRow && mtRow.punch_out == null, 'maintenance still on shift');
    assert.equal(typeof clRow.hours, 'number');
    // maintenance punches out manually (with the card still "in"): the next tap is "out" with no shift change
    assert.equal((await mt.c('POST', '/api/staff/punch-out', {})).status, 200);
    const c2 = (await guard.c('POST', '/api/gate/tap', { serial: 'DD0002' })).body;
    assert.equal(c2.direction, 'out'); assert.equal(c2.shift, null);
    // staff timelines
    const tl = (await cl.c('GET', '/api/me/card')).body;
    assert.equal(tl.money, null, 'no flat, no money');
    assert.deepEqual(tl.activity.filter(e => e.kind === 'shift').map(e => e.text).sort(), ['Shift ended', 'Shift started']);
    assert.equal(tl.activity.filter(e => e.kind === 'gate').length, 2);
    // shift audit attributed to the staff member
    const audit = (await admin('GET', '/api/admin/audit')).body;
    assert.ok(audit.some(x => x.action === 'punch_in' && /gate card/.test(x.detail || '')));
    // staff cannot operate the gate desk
    assert.equal((await cl.c('POST', '/api/gate/tap', { serial: 'CC0001' })).status, 403);
    assert.equal((await cl.c('GET', '/api/gate/presence')).status, 403);
  } finally { t.close(); }
});

test('card replacement and duplicate serial formats', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const guard = await t.account('guard', 'g@x.test');
    const r1 = await t.resident('r1@x.test', 'B-1');
    const r2 = await t.resident('r2@x.test', 'B-2');
    assert.equal((await admin('POST', `/api/admin/users/${r1.id}/card`, { serial: 'AA:BB:CC:01' })).status, 201);
    // same card, different separators/case -> same holder is idempotent (200), other holder conflicts (409)
    assert.equal((await admin('POST', `/api/admin/users/${r1.id}/card`, { serial: 'aabbcc01' })).status, 200);
    assert.equal((await admin('POST', `/api/admin/users/${r2.id}/card`, { serial: 'aa-bb-cc-01' })).status, 409);
    assert.equal((await admin('POST', `/api/admin/users/${r2.id}/card`, { serial: 'AA BB CC 01' })).status, 409);
    assert.equal((await guard.c('POST', '/api/gate/cards', { serial: 'Aa:Bb:Cc:01', user_id: r2.id })).status, 409);
    // invalid lengths
    assert.equal((await admin('POST', `/api/admin/users/${r2.id}/card`, { serial: 'AB' })).status, 400);
    assert.equal((await admin('POST', `/api/admin/users/${r2.id}/card`, { serial: 'A'.repeat(41) })).status, 400);
    assert.equal((await admin('POST', `/api/admin/users/${r2.id}/card`, { serial: '' })).status, 400);
    assert.equal((await admin('POST', '/api/admin/users/99999/card', { serial: 'ABCD' })).status, 404);
    // replacement: new card deactivates the old one
    await guard.c('POST', '/api/gate/tap', { serial: 'AABBCC01' }); // in
    assert.equal((await admin('POST', `/api/admin/users/${r1.id}/card`, { serial: 'AABBCC09' })).status, 201);
    const me = (await r1.c('GET', '/api/me/card')).body;
    assert.deepEqual(me.cards.map(c => c.serial), ['AABBCC09']);
    assert.equal((await guard.c('POST', '/api/gate/tap', { serial: 'AABBCC01' })).status, 404, 'old card refused');
    assert.ok((await guard.c('GET', '/api/gate/log')).body.some(l => l.kind === 'card' && l.result === 'denied' && l.subject === 'AABBCC01'));
    const cards = (await guard.c('GET', '/api/gate/cards')).body;
    assert.equal(cards.find(c => c.serial === 'AABBCC01').active, false);
    // the new card continues the same presence state (person was in -> now out)
    assert.equal((await guard.c('POST', '/api/gate/tap', { serial: 'AABBCC09' })).body.direction, 'out');
    // the released old serial can be given to someone else
    assert.equal((await admin('POST', `/api/admin/users/${r2.id}/card`, { serial: 'AABBCC01' })).status, 201);
    assert.equal((await guard.c('POST', '/api/gate/tap', { serial: 'AABBCC01' })).body.person.id, r2.id);
    assert.equal((await guard.c('GET', '/api/gate/presence')).body.cards, 2);
  } finally { t.close(); }
});

test('guard cannot reach resident data', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const guard = await t.account('guard', 'g@x.test');
    const r = await t.resident('r@x.test', 'C-1');
    await admin('POST', `/api/admin/users/${r.id}/card`, { serial: 'EE01' });
    const blocked = [
      ['GET', '/api/admin/users'], ['GET', `/api/admin/users/${r.id}/card`], ['GET', '/api/admin/accounts'], ['GET', '/api/admin/attendance'],
      ['GET', '/api/admin/audit'], ['GET', '/api/requests'], ['GET', '/api/dues'], ['GET', '/api/household'], ['GET', '/api/admin/staff'],
      ['GET', '/api/staff/shift'], ['POST', `/api/admin/users/${r.id}/approve`], ['DELETE', `/api/admin/users/${r.id}`],
      ['PATCH', `/api/admin/users/${r.id}`, { status: 'suspended' }], ['GET', '/api/shop/items'], ['POST', '/api/shop/card', { serial: 'EE01' }],
    ];
    for (const [m, u, b] of blocked) assert.equal((await guard.c(m, u, b)).status, 403, `${m} ${u}`);
    // the guard's own card timeline is only their own
    const own = (await guard.c('GET', '/api/me/card')).body;
    assert.deepEqual(own.cards, []); assert.equal(own.money, null);
    // people search returns minimum fields only (no email or phone)
    const people = (await guard.c('GET', '/api/gate/people?q=c-1')).body;
    assert.equal(people.length, 1);
    for (const k of ['email', 'phone', 'password_hash', 'status']) assert.ok(!(k in people[0]), 'no ' + k);
    // tap response and presence carry no contact details
    const tap = (await guard.c('POST', '/api/gate/tap', { serial: 'EE01' })).body;
    assert.ok(!('email' in tap.person) && !('phone' in tap.person));
    for (const p of (await guard.c('GET', '/api/gate/presence')).body.inside) assert.ok(!('email' in p) && !('phone' in p));
  } finally { t.close(); }
});

test('removed staff account: open shift closed on removal', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const guard = await t.account('guard', 'g@x.test');
    const cl = await t.account('cleaner', 'cl@x.test');
    await admin('POST', `/api/admin/users/${cl.id}/card`, { serial: 'CC01' });
    assert.equal((await guard.c('POST', '/api/gate/tap', { serial: 'CC01' })).body.shift, 'started');
    assert.equal((await admin('DELETE', `/api/admin/accounts/${cl.id}`)).status, 200);
    const att = (await admin('GET', '/api/admin/attendance')).body.find(r => r.user_id === cl.id);
    assert.ok(att.punch_out, 'removal closes the open shift');
    assert.equal((await cl.c('GET', '/api/me/card')).status, 401, 'removed account is signed out');
  } finally { t.close(); }
});

// ---------------- suspected bugs: correct behaviour asserted, marked todo ----------------

test('BUG: suspended resident card still checks in at the gate', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const guard = await t.account('guard', 'g@x.test');
    const r = await t.resident('r@x.test', 'D-1');
    await admin('POST', `/api/admin/users/${r.id}/card`, { serial: 'AB01' });
    assert.equal((await admin('PATCH', `/api/admin/users/${r.id}`, { status: 'suspended' })).status, 200);
    assert.equal((await t.client()('POST', '/api/login', { email: 'r@x.test', password: PW })).status, 403, 'suspended cannot sign in');
    // the tuck shop already refuses the card (holder() requires approved) ...
    const shop = await t.account('shop', 's@x.test');
    assert.equal((await shop.c('POST', '/api/shop/card', { serial: 'AB01' })).status, 404);
    // ... but the gate does not
    const tap = await guard.c('POST', '/api/gate/tap', { serial: 'AB01' });
    assert.notEqual(tap.status, 200, 'suspended card should be refused at the gate: ' + JSON.stringify(tap.body));
  } finally { t.close(); }
});

test('BUG: removed resident card still checks in at the gate', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const guard = await t.account('guard', 'g@x.test');
    const r = await t.resident('r@x.test', 'D-2');
    await admin('POST', `/api/admin/users/${r.id}/card`, { serial: 'AB02' });
    assert.equal((await admin('DELETE', `/api/admin/users/${r.id}`)).status, 200);
    const card = (await guard.c('GET', '/api/gate/cards')).body.find(c => c.serial === 'AB02');
    assert.ok(!card || card.active === false, 'card should be deactivated on removal');
    assert.notEqual((await guard.c('POST', '/api/gate/tap', { serial: 'AB02' })).status, 200);
  } finally { t.close(); }
});

test('BUG: suspended/removed staff card still taps in and starts a new shift', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const guard = await t.account('guard', 'g@x.test');
    const cl = await t.account('cleaner', 'cl@x.test');
    const mt = await t.account('maintenance', 'mt@x.test');
    await admin('POST', `/api/admin/users/${cl.id}/card`, { serial: 'CC01' });
    await admin('POST', `/api/admin/users/${mt.id}/card`, { serial: 'CC02' });
    assert.equal((await admin('PATCH', `/api/admin/accounts/${cl.id}`, { status: 'suspended' })).status, 200);
    assert.equal((await admin('DELETE', `/api/admin/accounts/${mt.id}`)).status, 200);
    const a = await guard.c('POST', '/api/gate/tap', { serial: 'CC01' });
    const b = await guard.c('POST', '/api/gate/tap', { serial: 'CC02' });
    const att = (await admin('GET', '/api/admin/attendance')).body;
    assert.equal(att.filter(r => r.user_id === cl.id || r.user_id === mt.id).length, 0, 'no shifts for suspended/removed staff: ' + JSON.stringify([a.body, b.body]));
  } finally { t.close(); }
});

test('BUG: a removed person stays "inside" in presence forever', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const guard = await t.account('guard', 'g@x.test');
    const r = await t.resident('r@x.test', 'D-3');
    await admin('POST', `/api/admin/users/${r.id}/card`, { serial: 'AB03' });
    await guard.c('POST', '/api/gate/tap', { serial: 'AB03' });
    await admin('DELETE', `/api/admin/users/${r.id}`);
    const inside = (await guard.c('GET', '/api/gate/presence')).body.inside;
    assert.ok(!inside.some(p => p.id === r.id), 'removed resident should not be listed inside');
  } finally { t.close(); }
});

test('BUG: guard registration (POST /api/gate/cards) gives a person a second active card', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const guard = await t.account('guard', 'g@x.test');
    const r = await t.resident('r@x.test', 'E-1');
    await admin('POST', `/api/admin/users/${r.id}/card`, { serial: 'AB10' });
    assert.equal((await guard.c('POST', '/api/gate/cards', { serial: 'AB11', user_id: r.id })).status, 201);
    const cards = (await r.c('GET', '/api/me/card')).body.cards;
    assert.equal(cards.length, 1, 'one card per person: ' + JSON.stringify(cards));
  } finally { t.close(); }
});

test('BUG: non-hex characters are silently stripped, so different card numbers collide', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const r1 = await t.resident('r1@x.test', 'F-1');
    const r2 = await t.resident('r2@x.test', 'F-2');
    const a = await admin('POST', `/api/admin/users/${r1.id}/card`, { serial: 'XY1234' });
    const b = await admin('POST', `/api/admin/users/${r2.id}/card`, { serial: 'ZQ1234' });
    assert.ok(a.status === 400 || (a.status === 201 && b.status === 201 && a.body.serial !== b.body.serial),
      'XY1234 and ZQ1234 must not both map to 1234: ' + JSON.stringify([a, b]));
  } finally { t.close(); }
});

test('BUG: committee can issue a card to a pending (unapproved) registrant, and it opens the gate', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const guard = await t.account('guard', 'g@x.test');
    assert.equal((await t.client()('POST', '/api/register', { name: 'Pend', email: 'p@x.test', flat: 'G-1', resident_type: 'owner', password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === 'p@x.test');
    await admin('POST', `/api/admin/users/${p.id}/card`, { serial: 'AB20' });
    assert.notEqual((await guard.c('POST', '/api/gate/tap', { serial: 'AB20' })).status, 200, 'pending person should not pass the gate');
  } finally { t.close(); }
});
