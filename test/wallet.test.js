// Community card wallet (docs/card-wallet-api.md): prepaid ledger per flat, wallet payments with refunds, the laundry counter,
// one card lookup for every counter, parcels and event check-in by card. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';
const NOW = new Date('2026-11-28T05:30:00Z'); // 11:00 IST
const SHORT = b => `Wallet balance is ₹${b}. Top up with the committee or pay another way.`;

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-wallet-'));
  const app = createApp({ dbFile: path.join(dir, 'w.db'), uploadDir: path.join(dir, 'up'), noTimers: true, clock: () => NOW });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const client = () => { let cookie = ''; return async (method, url, body) => {
    const res = await fetch(base + url, { method, headers: { cookie, ...(body ? { 'content-type': 'application/json' } : {}) }, body: body ? JSON.stringify(body) : undefined });
    const sc = res.headers.get('set-cookie'); if (sc) cookie = sc.split(';')[0];
    return { status: res.status, body: await res.json() };
  }; };
  const admin = client(); assert.equal((await admin('POST', '/api/login', ADMIN)).status, 200);
  const login = async email => { const c = client(); assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200, email); return c; };
  const account = async (kind, email) => { const r = await admin('POST', '/api/admin/accounts', { name: kind + ' one', email, password: PW, kind }); assert.equal(r.status, 201, kind); return { c: await login(email), id: r.body.id }; };
  const resident = async (name, email, flat, type = 'owner') => {
    assert.equal((await client()('POST', '/api/register', { name, email, flat, resident_type: type, password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    assert.equal((await admin('POST', `/api/admin/users/${p.id}/approve`)).status, 200);
    return { c: await login(email), id: p.id };
  };
  return { app, admin, client, account, resident, close: () => server.close() };
}

test('wallet: committee tops up, residents see the ledger, governance adjusts, never below 0', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const asha = await t.resident('Asha', 'a@x.test', 'A-1');
    const ravi = await t.resident('Ravi', 'r@x.test', 'A-1', 'family');
    await t.resident('Bina', 'b@x.test', 'B-2');
    const member = await t.account('member', 'm@x.test'), head = await t.account('head', 'h@x.test'), guard = await t.account('guard', 'g@x.test');
    assert.equal((await admin('POST', `/api/admin/users/${asha.id}/card`, { serial: 'AA:01' })).status, 201);

    let w = (await asha.c('GET', '/api/wallet')).body;
    assert.deepEqual(w, { flat: 'A-1', balance: 0, tx: [] });
    assert.equal((await guard.c('GET', '/api/wallet')).status, 403);
    // validation
    assert.equal((await admin('POST', '/api/admin/wallet/topup', { flat: 'A-1', amount: 0, method: 'cash' })).status, 400);
    assert.equal((await admin('POST', '/api/admin/wallet/topup', { flat: 'A-1', amount: 50001, method: 'cash' })).status, 400);
    assert.equal((await admin('POST', '/api/admin/wallet/topup', { flat: 'A-1', amount: 10, method: 'card' })).status, 400);
    assert.equal((await admin('POST', '/api/admin/wallet/topup', { flat: 'Z-9', amount: 10, method: 'cash' })).status, 400, 'no approved resident');
    assert.equal((await admin('POST', '/api/admin/wallet/topup', { serial: 'FFFF', amount: 10, method: 'cash' })).status, 404);
    assert.equal((await asha.c('POST', '/api/admin/wallet/topup', { flat: 'A-1', amount: 10, method: 'cash' })).status, 403);
    // top up by flat and by tapped card
    const t1 = await member.c('POST', '/api/admin/wallet/topup', { flat: 'a-1', amount: 500, method: 'cash' });
    assert.equal(t1.status, 201); assert.equal(t1.body.flat, 'A-1'); assert.equal(t1.body.balance, 500); assert.ok(t1.body.tx_id);
    const t2 = await admin('POST', '/api/admin/wallet/topup', { serial: 'aa 01', amount: 250.555, method: 'upi', reference: 'UPI-123' });
    assert.equal(t2.status, 201); assert.equal(t2.body.balance, 750.56);
    assert.ok((await ravi.c('GET', '/api/notifications')).body.some(n => n.message === '₹500 added to your wallet (cash)'), 'the whole flat is notified');
    w = (await ravi.c('GET', '/api/wallet')).body;
    assert.equal(w.balance, 750.56); assert.equal(w.tx.length, 2);
    assert.deepEqual(Object.keys(w.tx[0]).sort(), ['amount', 'created_at', 'id', 'kind', 'method', 'note'].sort());
    assert.equal(w.tx[0].method, 'upi'); assert.equal(w.tx[0].kind, 'topup');
    // committee list and one flat
    const all = (await member.c('GET', '/api/admin/wallets')).body;
    assert.deepEqual(all.map(x => x.flat), ['A-1', 'B-2']);
    assert.equal(all[0].balance, 750.56); assert.ok(all[0].last_at); assert.equal(all[1].balance, 0); assert.equal(all[1].last_at, null);
    assert.equal((await member.c('GET', '/api/admin/wallets/A-1')).body.tx.length, 2);
    assert.equal((await asha.c('GET', '/api/admin/wallets')).status, 403);
    // adjust: governance only, note required, not 0, never below 0
    assert.equal((await member.c('POST', '/api/admin/wallet/adjust', { flat: 'A-1', amount: -50, note: 'typo' })).status, 403);
    assert.equal((await head.c('POST', '/api/admin/wallet/adjust', { flat: 'A-1', amount: -50 })).status, 400);
    assert.equal((await head.c('POST', '/api/admin/wallet/adjust', { flat: 'A-1', amount: 0, note: 'x' })).status, 400);
    assert.equal((await head.c('POST', '/api/admin/wallet/adjust', { flat: 'A-1', amount: -800, note: 'too much' })).status, 409);
    const adj = await head.c('POST', '/api/admin/wallet/adjust', { flat: 'A-1', amount: -0.56, note: 'rounding' });
    assert.equal(adj.status, 201); assert.deepEqual(adj.body, { flat: 'A-1', balance: 750 });
    const audit = (await admin('GET', '/api/admin/audit')).body;
    assert.ok(audit.some(a => a.entity === 'wallet' && a.action === 'topup'));
    assert.ok(audit.some(a => a.entity === 'wallet' && a.action === 'adjust'));
    // the card view carries the wallet
    const me = (await asha.c('GET', '/api/me/card')).body;
    assert.deepEqual(me.wallet, { balance: 750 }); assert.equal(me.frozen, false);
    assert.ok(me.activity.some(e => e.kind === 'wallet' && e.icon === 'wallet' && e.text === 'Top-up (UPI)' && e.amount === 250.56));
    assert.equal((await guard.c('GET', '/api/me/card')).body.wallet, null);
  } finally { t.close(); }
});

test('wallet payments: shop orders, shop counter and laundry debit in the same transaction, refund on cancel', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const asha = await t.resident('Asha', 'a@x.test', 'A-1');
    const shop = await t.account('shop', 's@x.test'), laundry = await t.account('laundry', 'l@x.test');
    assert.equal((await admin('POST', `/api/admin/users/${asha.id}/card`, { serial: 'AA01' })).status, 201);
    const tea = (await shop.c('POST', '/api/shop/items', { name: 'Tea', category: 'groceries', price: 40, stock: 20 })).body.id;
    const shirt = (await laundry.c('POST', '/api/laundry/rates', { item: 'Shirt', price: 25 })).body.id;
    // wrong payment: the new message
    const badPay = await asha.c('POST', '/api/shop/orders', { items: [{ id: tea, qty: 1 }], payment: 'gold' });
    assert.equal(badPay.status, 400); assert.equal(badPay.body.error, 'Choose cash, UPI, wallet or the maintenance account');
    // empty wallet: refused, nothing written (stock untouched, no order)
    const short = await asha.c('POST', '/api/shop/orders', { items: [{ id: tea, qty: 1 }], payment: 'wallet' });
    assert.equal(short.status, 409); assert.equal(short.body.error, SHORT(0));
    assert.equal((await asha.c('GET', '/api/shop/orders')).body.length, 0);
    assert.equal((await shop.c('GET', '/api/shop/items')).body.find(i => i.id === tea).stock, 20);
    await admin('POST', '/api/admin/wallet/topup', { flat: 'A-1', amount: 200, method: 'cash' });
    // shop order paid by wallet: paid right away
    const o = await asha.c('POST', '/api/shop/orders', { items: [{ id: tea, qty: 2 }], payment: 'wallet' });
    assert.equal(o.status, 201); assert.equal(o.body.payment, 'wallet');
    let order = (await asha.c('GET', '/api/shop/orders')).body.find(x => x.id === o.body.id);
    assert.ok(order.paid_at); assert.equal(order.payment_status, 'paid');
    let w = (await asha.c('GET', '/api/wallet')).body;
    assert.equal(w.balance, 120); assert.equal(w.tx[0].kind, 'shop'); assert.equal(w.tx[0].amount, -80);
    // cancel -> refund of the same amount
    assert.equal((await asha.c('POST', `/api/shop/orders/${o.body.id}/status`, { status: 'cancelled' })).status, 200);
    w = (await asha.c('GET', '/api/wallet')).body;
    assert.equal(w.balance, 200); assert.equal(w.tx[0].kind, 'refund'); assert.equal(w.tx[0].amount, 80);
    // shop counter by card, wallet; the shop card lookup shows the balance
    assert.equal((await shop.c('POST', '/api/shop/card', { serial: 'AA01' })).body.wallet_balance, 200);
    const sale = await shop.c('POST', '/api/shop/counter', { serial: 'AA01', items: [{ id: tea, qty: 3 }], payment: 'wallet' });
    assert.equal(sale.status, 201); assert.equal(sale.body.total, 120);
    const tooMuch = await shop.c('POST', '/api/shop/counter', { serial: 'AA01', items: [{ id: tea, qty: 3 }], payment: 'wallet' });
    assert.equal(tooMuch.status, 409); assert.equal(tooMuch.body.error, SHORT(80));
    // laundry order paid by wallet, then cancelled -> refund
    const lo = await asha.c('POST', '/api/laundry/orders', { pickup_date: '2026-11-29', pickup_slot: 'morning', items: [{ id: shirt, qty: 2 }], payment: 'wallet' });
    assert.equal(lo.status, 201); assert.equal(lo.body.total, 50);
    assert.equal((await asha.c('GET', '/api/wallet')).body.balance, 30);
    assert.equal((await asha.c('POST', `/api/laundry/orders/${lo.body.id}/status`, { status: 'cancelled' })).status, 200);
    assert.equal((await asha.c('GET', '/api/wallet')).body.balance, 80);
    // laundry counter: lines [{item, qty}], status picked_up today, audited counter_order
    assert.equal((await laundry.c('POST', '/api/laundry/counter', { serial: 'FFFF', lines: [{ item: shirt, qty: 1 }], payment: 'cash' })).status, 404);
    assert.equal((await laundry.c('POST', '/api/laundry/counter', { serial: 'AA01', lines: [{ item: shirt, qty: 1 }], payment: 'nope' })).status, 400);
    assert.equal((await shop.c('POST', '/api/laundry/counter', { serial: 'AA01', lines: [{ item: shirt, qty: 1 }], payment: 'cash' })).status, 403);
    const lc = await laundry.c('POST', '/api/laundry/counter', { serial: 'AA01', lines: [{ item: shirt, qty: 2 }], payment: 'wallet' });
    assert.equal(lc.status, 201);
    assert.deepEqual(lc.body, { id: lc.body.id, total: 50, payment: 'wallet', name: 'Asha', flat: 'A-1' });
    const lrow = (await asha.c('GET', '/api/laundry/orders')).body.find(x => x.id === lc.body.id);
    assert.equal(lrow.status, 'picked_up'); assert.equal(lrow.pickup_date, '2026-11-28'); assert.equal(lrow.payment_status, 'paid');
    assert.equal((await asha.c('GET', '/api/wallet')).body.balance, 30);
    const short2 = await laundry.c('POST', '/api/laundry/counter', { serial: 'AA01', lines: [{ item: 'shirt', qty: 2 }], payment: 'wallet' });
    assert.equal(short2.status, 409); assert.equal(short2.body.error, SHORT(30));
    assert.equal((await laundry.c('POST', '/api/laundry/counter', { serial: 'AA01', lines: [{ item: 'Shirt', qty: 1 }], payment: 'cash' })).status, 201, 'rate by name, cash');
    assert.ok((await admin('GET', '/api/admin/audit')).body.some(a => a.entity === 'laundry_order' && a.action === 'counter_order'));
    assert.ok((await asha.c('GET', '/api/notifications')).body.some(n => /handed over with Asha's card/.test(n.message)));
    // the ledger never went below 0
    const sum = (await asha.c('GET', '/api/wallet')).body.tx.reduce((s, x) => s + x.amount, 0);
    assert.equal(Math.round(sum * 100) / 100, 30);
  } finally { t.close(); }
});

test('one card lookup for every counter; parcels and event check-in by card', async () => {
  const t = await boot();
  try {
    const { admin } = t;
    const asha = await t.resident('Asha', 'a@x.test', 'A-1');
    const bina = await t.resident('Bina', 'b@x.test', 'B-2');
    const guard = await t.account('guard', 'g@x.test'), shop = await t.account('shop', 's@x.test'), laundry = await t.account('laundry', 'l@x.test');
    const cleaner = await t.account('cleaner', 'c@x.test');
    await admin('POST', `/api/admin/users/${asha.id}/card`, { serial: 'AA01' });
    await admin('POST', `/api/admin/users/${bina.id}/card`, { serial: 'BB02' });
    await admin('POST', `/api/admin/users/${cleaner.id}/card`, { serial: 'CC03' });
    await admin('POST', '/api/admin/wallet/topup', { flat: 'A-1', amount: 300, method: 'upi' });
    const parcel = (await guard.c('POST', '/api/parcels', { flat: 'A-1', carrier: 'Amazon' })).body.id;
    // lookup: who may, and what each sees
    const g = (await guard.c('POST', '/api/card/lookup', { serial: 'aa:01' })).body;
    assert.deepEqual(g, { id: asha.id, name: 'Asha', role: 'resident', flat: 'A-1', department: null, frozen: false, wallet: { balance: 300 }, credit: { used: 0, limit: 3000 }, parcels_waiting: 1 });
    const s = (await shop.c('POST', '/api/card/lookup', { serial: 'AA01' })).body;
    assert.equal(s.parcels_waiting, null); assert.equal(s.wallet.balance, 300);
    assert.equal((await laundry.c('POST', '/api/card/lookup', { serial: 'AA01' })).status, 200);
    assert.equal((await admin('POST', '/api/card/lookup', { serial: 'AA01' })).body.parcels_waiting, 1);
    const st = (await guard.c('POST', '/api/card/lookup', { serial: 'CC03' })).body;
    assert.equal(st.role, 'staff'); assert.equal(st.department, 'cleaning'); assert.equal(st.wallet, null); assert.equal(st.credit, null);
    assert.equal((await asha.c('POST', '/api/card/lookup', { serial: 'AA01' })).status, 403);
    assert.equal((await cleaner.c('POST', '/api/card/lookup', { serial: 'AA01' })).status, 403);
    const unk = await guard.c('POST', '/api/card/lookup', { serial: 'DEAD' });
    assert.equal(unk.status, 404); assert.equal(unk.body.error, 'Unknown card. Register it at the gate desk.');
    // parcels by card
    const list = await guard.c('GET', '/api/parcels/card/AA01');
    assert.equal(list.status, 200); assert.deepEqual(list.body.map(p => p.id), [parcel]);
    assert.equal((await cleaner.c('GET', '/api/parcels/card/AA01')).status, 200, 'staff may look up parcels by card');
    assert.equal((await asha.c('GET', '/api/parcels/card/AA01')).status, 403);
    const wrong = await guard.c('POST', `/api/parcels/${parcel}/collect`, { serial: 'BB02' });
    assert.equal(wrong.status, 409); assert.equal(wrong.body.error, 'This card is not from flat A-1');
    assert.equal((await guard.c('POST', `/api/parcels/${parcel}/collect`, { serial: 'AA01' })).status, 200);
    assert.equal((await asha.c('GET', '/api/parcels')).body.find(p => p.id === parcel).collected_by, 'Asha');
    assert.equal((await guard.c('GET', '/api/parcels/card/AA01')).body.length, 0);
    // event check-in by card
    const ev = (await admin('POST', '/api/events', { title: 'Diwali meet', starts_at: '2026-12-01T18:00' })).body.id;
    await asha.c('POST', `/api/events/${ev}/rsvp`, { going: true });
    const c1 = await guard.c('POST', `/api/events/${ev}/checkin`, { serial: 'AA01' });
    assert.equal(c1.status, 201); assert.deepEqual(c1.body, { name: 'Asha', flat: 'A-1', rsvp: true, already: false });
    const c2 = await admin('POST', `/api/events/${ev}/checkin`, { serial: 'AA01' });
    assert.equal(c2.status, 200); assert.equal(c2.body.already, true);
    const c3 = await guard.c('POST', `/api/events/${ev}/checkin`, { serial: 'BB02' });
    assert.equal(c3.status, 201); assert.equal(c3.body.rsvp, false);
    assert.equal((await shop.c('POST', `/api/events/${ev}/checkin`, { serial: 'AA01' })).status, 403);
    assert.equal((await guard.c('POST', '/api/events/999/checkin', { serial: 'AA01' })).status, 404);
    const came = (await guard.c('GET', `/api/events/${ev}/checkins`)).body;
    assert.equal(came.length, 2); assert.ok(came.some(x => x.name === 'Asha' && x.rsvp === true));
    assert.equal((await asha.c('GET', `/api/events/${ev}/checkins`)).status, 403);
    assert.ok((await admin('GET', '/api/admin/audit')).body.some(a => a.entity === 'event' && a.action === 'checked_in'));
  } finally { t.close(); }
});
