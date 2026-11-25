// NFC gate cards (docs/nfc-api.md): register, tap in/out with timestamps, staff shifts, strict access.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';

test('gate cards: guard registers a card, taps toggle in and out, staff shifts follow, residents are refused', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-nfc-'));
  const app = createApp({ dbFile: path.join(dir, 'n.db'), uploadDir: path.join(dir, 'up'), noTimers: true });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const client = () => { let cookie = ''; return async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json() };
  }; };
  try {
    const admin = client();
    assert.equal((await admin('POST', '/api/login', ADMIN)).status, 200);
    const mk = async (kind, email) => { assert.equal((await admin('POST', '/api/admin/accounts', { name: kind + ' one', email, password: PW, kind })).status, 201); const c = client(); assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200); return c; };
    const guard = await mk('guard', 'g@x.test'), cleaner = await mk('cleaner', 'c@x.test');
    const res = client();
    assert.equal((await client()('POST', '/api/register', { name: 'Asha', email: 'a@x.test', flat: 'A-1', resident_type: 'owner', password: PW, consent: true })).status, 201);
    const pend = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === 'a@x.test');
    await admin('POST', `/api/admin/users/${pend.id}/approve`);
    await res('POST', '/api/login', { email: 'a@x.test', password: PW });

    // residents cannot use the card desk
    assert.equal((await res('POST', '/api/gate/tap', { serial: '04:A1' })).status, 403);
    // find people, register cards
    const people = (await guard('GET', '/api/gate/people?q=one')).body;
    const cl = people.find(p => p.role === 'staff');
    assert.ok(cl && cl.department === 'cleaning');
    assert.equal((await guard('POST', '/api/gate/cards', { serial: 'zz', user_id: cl.id })).status, 400, 'too short');
    assert.equal((await guard('POST', '/api/gate/cards', { serial: '04:a1:b2:c3', user_id: cl.id })).status, 201);
    assert.equal((await guard('POST', '/api/gate/cards', { serial: '04A1B2C3', user_id: pend.id })).status, 409, 'same card, other separators');
    assert.equal((await guard('POST', '/api/gate/cards', { serial: '04-11-22-33', user_id: pend.id })).status, 201);
    // taps toggle in, out, in
    const t1 = (await guard('POST', '/api/gate/tap', { serial: '04 a1 b2 c3' })).body;
    assert.equal(t1.direction, 'in'); assert.equal(t1.shift, 'started'); assert.ok(t1.at);
    assert.equal((await cleaner('GET', '/api/staff/shift')).body.current != null, true, 'tap started the shift');
    assert.equal((await guard('POST', '/api/gate/tap', { serial: '04112233' })).body.direction, 'in');
    let pr = (await guard('GET', '/api/gate/presence')).body;
    assert.equal(pr.inside.length, 2); assert.equal(pr.cards, 2);
    const t2 = (await guard('POST', '/api/gate/tap', { serial: '04A1B2C3' })).body;
    assert.equal(t2.direction, 'out'); assert.equal(t2.shift, 'ended');
    assert.equal((await cleaner('GET', '/api/staff/shift')).body.current, null);
    pr = (await guard('GET', '/api/gate/presence')).body;
    assert.equal(pr.inside.length, 1); assert.equal(pr.recent.length, 3);
    // unknown card is refused and logged; a deactivated card stops working
    assert.equal((await guard('POST', '/api/gate/tap', { serial: 'DEADBEEF' })).status, 404);
    assert.ok((await guard('GET', '/api/gate/log')).body.some(l => l.kind === 'card' && l.result === 'denied'));
    const card = (await guard('GET', '/api/gate/cards')).body.find(c => c.serial === '04112233');
    const del = await guard('DELETE', `/api/gate/cards/${card.id}`); assert.equal(del.status, 200, JSON.stringify(del.body) + ' ' + JSON.stringify(card));
    assert.equal((await guard('POST', '/api/gate/tap', { serial: '04112233' })).status, 404);
    assert.ok((await admin('GET', '/api/admin/audit')).body.some(a => a.action === 'checked_out'));
  } finally { server.close(); }
});

test('community card: issued at onboarding, tied to money and activity, used at the tuck shop counter', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-card-'));
  const app = createApp({ dbFile: path.join(dir, 'c.db'), uploadDir: path.join(dir, 'up'), noTimers: true });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const client = () => { let cookie = ''; return async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json() };
  }; };
  try {
    const admin = client(); await admin('POST', '/api/login', ADMIN);
    const mk = async (kind, email) => { await admin('POST', '/api/admin/accounts', { name: kind, email, password: PW, kind }); const c = client(); await c('POST', '/api/login', { email, password: PW }); return c; };
    const shop = await mk('shop', 's@x.test'), cleaner = await mk('cleaner', 'cl@x.test');
    // onboarding: approve the resident and issue a card in the same step
    assert.equal((await client()('POST', '/api/register', { name: 'Asha', email: 'a@x.test', flat: 'A-1', resident_type: 'owner', password: PW, consent: true })).status, 201);
    const asha = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === 'a@x.test');
    await admin('POST', `/api/admin/users/${asha.id}/approve`);
    assert.equal((await admin('POST', `/api/admin/users/${asha.id}/card`, { serial: 'AA:BB:CC:01' })).status, 201);
    assert.equal((await shop('POST', `/api/admin/users/${asha.id}/card`, { serial: 'AA:BB:CC:02' })).status, 403, 'only the committee issues cards');
    const res = client(); await res('POST', '/api/login', { email: 'a@x.test', password: PW });
    let me = (await res('GET', '/api/me/card')).body;
    assert.equal(me.cards[0].serial, 'AABBCC01');
    assert.ok((await res('GET', '/api/notifications')).body.some(n => /community card is ready/.test(n.message)));
    // a new card replaces the old one
    assert.equal((await admin('POST', `/api/admin/users/${asha.id}/card`, { serial: 'AABBCC03' })).status, 201);
    assert.equal((await res('GET', '/api/me/card')).body.cards.length, 1);
    // staff card: issued to the cleaner, and the cleaner sees their own card
    const cl = (await admin('GET', '/api/admin/accounts')).body.find(a => a.email === 'cl@x.test');
    assert.equal((await admin('POST', `/api/admin/users/${cl.id}/card`, { serial: 'CC01' })).status, 201);
    assert.equal((await cleaner('GET', '/api/me/card')).body.cards[0].serial, 'CC01');
    // tuck shop counter: tap the resident card, see who it is, charge the maintenance account
    const rice = (await shop('POST', '/api/shop/items', { name: 'Rice', category: 'groceries', price: 350, stock: 5 })).body.id;
    assert.equal((await shop('POST', '/api/shop/card', { serial: 'AABBCC01' })).status, 404, 'the replaced card no longer works');
    const who = (await shop('POST', '/api/shop/card', { serial: 'aa bb cc 03' })).body;
    assert.equal(who.flat, 'A-1'); assert.equal(who.credit_used, 0);
    const sale = await shop('POST', '/api/shop/counter', { serial: 'AABBCC03', items: [{ id: rice, qty: 2 }], payment: 'account' });
    assert.equal(sale.status, 201); assert.equal(sale.body.total, 700);
    assert.ok((await res('GET', '/api/dues')).body.dues.some(d => d.title === `Tuck shop order #${sale.body.id}` && d.amount === 700));
    me = (await res('GET', '/api/me/card')).body;
    assert.equal(me.money.credit_used, 700); assert.ok(me.money.balance >= 700);
    assert.ok(me.activity.some(e => e.kind === 'shop' && /at the counter/.test(e.text)));
    // the committee sees the same card timeline
    assert.equal((await admin('GET', `/api/admin/users/${asha.id}/card`)).body.money.credit_used, 700);
  } finally { server.close(); }
});
