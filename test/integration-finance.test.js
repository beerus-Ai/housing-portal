// Finance integration (cross-module): tuck shop, shop counter by card, laundry, credit limit, maintenance dues,
// committee payments, dashboards (/api/modules/summary) and the community card money block (/api/me/card).
// Every rupee figure is cross-checked between endpoints. Contracts: docs/services-api.md, docs/modules-api.md, docs/nfc-api.md.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';
const DAY = 864e5;

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-fin-'));
  const clk = { now: new Date('2026-11-25T06:30:00Z') }; // 12:00 IST
  const app = createApp({ dbFile: path.join(dir, 'f.db'), uploadDir: path.join(dir, 'up'), noTimers: true, clock: () => clk.now });
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
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { json = text; }
      return { status: res.status, body: json };
    };
  };
  const admin = client();
  assert.equal((await admin('POST', '/api/login', ADMIN)).status, 200);
  const login = async (email) => { const c = client(); assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200); return c; };
  const resident = async (email, flat, type = 'owner') => {
    assert.equal((await client()('POST', '/api/register', { name: email.split('@')[0], email, flat, resident_type: type, password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    assert.equal((await admin('POST', `/api/admin/users/${p.id}/approve`)).status, 200);
    const c = await login(email); c.id = p.id; return c;
  };
  const account = async (kind, email) => {
    assert.equal((await admin('POST', '/api/admin/accounts', { name: kind + ' one', email, password: PW, kind })).status, 201);
    return login(email);
  };
  return { admin, client, login, resident, account, clk, close: () => server.close() };
}

const sum = (xs, k) => Math.round(xs.reduce((t, x) => t + x[k], 0) * 100) / 100;
// The same flat must report the same money everywhere.
async function crossCheck(t, res, flat, label = '') {
  const mine = (await res('GET', '/api/dues')).body;
  const adm = (await t.admin('GET', `/api/dues?flat=${encodeURIComponent(flat)}`)).body;
  const summ = (await res('GET', '/api/modules/summary')).body;
  const card = (await res('GET', '/api/me/card')).body.money;
  const credit = (await res('GET', '/api/credit')).body;
  assert.deepStrictEqual(mine.totals, adm.totals, `${label}: resident and committee totals agree`);
  assert.equal(mine.totals.billed, sum(mine.dues, 'amount'), `${label}: billed adds up`);
  assert.equal(mine.totals.collected, sum(mine.dues, 'paid'), `${label}: collected adds up`);
  assert.equal(mine.totals.outstanding, sum(mine.dues, 'balance'), `${label}: outstanding adds up`);
  assert.equal(Math.round((mine.totals.billed - mine.totals.collected) * 100) / 100, mine.totals.outstanding, `${label}: billed - collected = outstanding (no overpayment)`);
  assert.equal(summ.dues_balance, mine.totals.outstanding, `${label}: summary dues_balance = /api/dues outstanding`);
  assert.equal(card.balance, mine.totals.outstanding, `${label}: card balance = /api/dues outstanding`);
  const shopBills = mine.dues.filter(d => /^(Tuck shop order|Laundry) #/.test(d.title));
  assert.equal(card.credit_used, sum(shopBills, 'balance'), `${label}: card credit_used = open shop/laundry bills`);
  assert.equal(credit.used, card.credit_used, `${label}: /api/credit used = card credit_used`);
  assert.equal(credit.limit, card.credit_limit, `${label}: /api/credit limit = card credit_limit`);
  return { mine, summ, card, credit };
}

async function setupShop(t) {
  const shop = await t.account('shop', 'shop@x.test');
  const rice = (await shop('POST', '/api/shop/items', { name: 'Rice', category: 'groceries', price: 350, stock: 20 })).body.id;
  const milk = (await shop('POST', '/api/shop/items', { name: 'Milk', category: 'dairy', price: 33.33, stock: 20 })).body.id;
  return { shop, rice, milk };
}

test('tuck shop: delivery vs pickup, cash/upi/account; only account orders bill the flat; payment_status follows the bill', async () => {
  const t = await boot();
  try {
    const a = await t.resident('a@x.test', 'A-1');
    const { shop, rice, milk } = await setupShop(t);
    // validation
    assert.equal((await a('POST', '/api/shop/orders', { items: [{ id: rice, qty: 1 }], fulfilment: 'drone' })).status, 400);
    assert.equal((await a('POST', '/api/shop/orders', { items: [{ id: rice, qty: 1 }], payment: 'card' })).status, 400);

    const cash = await a('POST', '/api/shop/orders', { items: [{ id: rice, qty: 1 }], fulfilment: 'delivery', payment: 'cash' });
    const upi = await a('POST', '/api/shop/orders', { items: [{ id: milk, qty: 3 }], fulfilment: 'pickup', payment: 'upi' });
    const acc = await a('POST', '/api/shop/orders', { items: [{ id: rice, qty: 2 }, { id: milk, qty: 1 }], fulfilment: 'pickup', payment: 'account' });
    assert.equal(cash.status, 201); assert.equal(cash.body.total, 350);
    assert.equal(upi.status, 201); assert.equal(upi.body.total, 99.99, 'decimal prices sum exactly');
    assert.equal(acc.status, 201); assert.equal(acc.body.total, 733.33);
    // only the account order becomes a bill
    let d = (await a('GET', '/api/dues')).body;
    assert.equal(d.dues.length, 1);
    const bill = d.dues[0];
    assert.equal(bill.title, `Tuck shop order #${acc.body.id}`); assert.equal(bill.amount, 733.33); assert.equal(bill.period, '2026-11');
    assert.equal(bill.due_date, '2026-12-10', 'due 15 days from the order (IST)'); assert.equal(bill.status, 'unpaid');
    let orders = (await a('GET', '/api/shop/orders')).body;
    const os_ = id => orders.find(o => o.id === id);
    assert.equal(os_(cash.body.id).payment_status, 'unpaid');
    assert.equal(os_(upi.body.id).payment_status, 'unpaid');
    assert.equal(os_(acc.body.id).payment_status, 'on_account');
    assert.equal(os_(acc.body.id).due_id, bill.id);
    // line totals match order totals
    for (const o of orders) assert.equal(Math.round(o.lines.reduce((t2, l) => t2 + l.price * l.qty, 0) * 100) / 100, o.total);
    await crossCheck(t, a, 'A-1', 'after orders');

    // fulfilment rules: delivery is delivered, pickup is collected
    for (const id of [cash.body.id, upi.body.id, acc.body.id]) assert.equal((await shop('POST', `/api/shop/orders/${id}/status`, { status: 'ready' })).status, 200);
    assert.equal((await shop('POST', `/api/shop/orders/${cash.body.id}/status`, { status: 'collected' })).status, 409);
    assert.equal((await shop('POST', `/api/shop/orders/${upi.body.id}/status`, { status: 'delivered' })).status, 409);
    assert.equal((await shop('POST', `/api/shop/orders/${cash.body.id}/status`, { status: 'delivered' })).status, 200);
    assert.equal((await shop('POST', `/api/shop/orders/${upi.body.id}/status`, { status: 'collected' })).status, 200);
    assert.equal((await shop('POST', `/api/shop/orders/${acc.body.id}/status`, { status: 'collected' })).status, 200);
    orders = (await a('GET', '/api/shop/orders')).body;
    assert.equal(os_(cash.body.id).payment_status, 'paid', 'cash paid on delivery');
    assert.equal(os_(upi.body.id).payment_status, 'paid', 'UPI paid on pick-up');
    assert.equal(os_(acc.body.id).payment_status, 'on_account', 'handover does not pay an account order');
    assert.equal(os_(acc.body.id).paid_at, null);

    // committee records a part payment, then the rest
    assert.equal((await a('POST', `/api/admin/dues/${bill.id}/payments`, { amount: 100, method: 'cash' })).status, 403, 'residents cannot record payments');
    assert.equal((await shop('POST', `/api/admin/dues/${bill.id}/payments`, { amount: 100, method: 'cash' })).status, 403, 'shop cannot record payments');
    let p = await t.admin('POST', `/api/admin/dues/${bill.id}/payments`, { amount: 400, method: 'upi', reference: 'UPI1' });
    assert.equal(p.status, 201); assert.equal(p.body.balance, 333.33);
    d = (await a('GET', `/api/dues/${bill.id}`)).body;
    assert.equal(d.status, 'partial'); assert.equal(d.paid, 400); assert.equal(d.balance, 333.33); assert.equal(d.payments.length, 1);
    orders = (await a('GET', '/api/shop/orders')).body;
    assert.equal(os_(acc.body.id).payment_status, 'on_account', 'part paid is still on account');
    let x = await crossCheck(t, a, 'A-1', 'part paid');
    assert.equal(x.card.credit_used, 333.33);
    // overpayment is refused and changes nothing
    p = await t.admin('POST', `/api/admin/dues/${bill.id}/payments`, { amount: 333.34, method: 'cash' });
    assert.equal(p.status, 400);
    assert.equal((await a('GET', `/api/dues/${bill.id}`)).body.paid, 400);
    p = await t.admin('POST', `/api/admin/dues/${bill.id}/payments`, { amount: 333.33, method: 'cash' });
    assert.equal(p.status, 201); assert.equal(p.body.balance, 0);
    assert.equal((await t.admin('POST', `/api/admin/dues/${bill.id}/payments`, { amount: 1, method: 'cash' })).status, 409, 'already paid');
    orders = (await a('GET', '/api/shop/orders')).body;
    assert.equal(os_(acc.body.id).payment_status, 'paid', 'order shows paid once the bill is paid');
    x = await crossCheck(t, a, 'A-1', 'paid in full');
    assert.equal(x.card.credit_used, 0); assert.equal(x.card.balance, 0);
    assert.equal(x.mine.totals.collected, 733.33);
    // the card timeline shows the payments
    const act = (await a('GET', '/api/me/card')).body.activity;
    assert.equal(act.filter(e => e.kind === 'payment').length, 2);
    assert.equal(sum(act.filter(e => e.kind === 'payment'), 'amount'), 733.33);
    // invalid payments
    const m = (await t.admin('POST', '/api/admin/dues', { period: '2026-11', amount: 2000, due_date: '2026-11-30', flats: ['A-1'] })).body;
    assert.equal(m.created, 1);
    const mid = (await a('GET', '/api/dues')).body.dues.find(z => z.title === 'Maintenance').id;
    assert.equal((await t.admin('POST', `/api/admin/dues/${mid}/payments`, { amount: 10, method: 'bitcoin' })).status, 400);
    assert.equal((await t.admin('POST', `/api/admin/dues/${mid}/payments`, { amount: 10, method: 'cash', paid_on: '2026-11-26' })).status, 400, 'future date');
    assert.equal((await t.admin('POST', `/api/admin/dues/${mid}/payments`, { amount: -5, method: 'cash' })).status, 400);
    assert.equal((await t.admin('POST', `/api/admin/dues/${mid}/payments`, { amount: 0, method: 'cash' })).status, 400);
    assert.equal((await t.admin('POST', '/api/admin/dues/99999/payments', { amount: 10, method: 'cash' })).status, 404);
    await crossCheck(t, a, 'A-1', 'with maintenance');
  } finally { t.close(); }
});

test('cancel rules: an unpaid account bill is removed with the order; a part-paid one blocks the cancel', async () => {
  const t = await boot();
  try {
    const a = await t.resident('a@x.test', 'A-1');
    const { shop, rice } = await setupShop(t);
    const o1 = (await a('POST', '/api/shop/orders', { items: [{ id: rice, qty: 2 }], payment: 'account' })).body;
    assert.equal((await a('GET', '/api/credit')).body.used, 700);
    assert.equal((await a('POST', `/api/shop/orders/${o1.id}/status`, { status: 'cancelled' })).status, 200);
    assert.equal((await a('GET', '/api/dues')).body.dues.length, 0, 'bill removed');
    assert.equal((await a('GET', '/api/credit')).body.used, 0, 'credit released');
    assert.equal((await shop('GET', '/api/shop/items')).body.find(i => i.id === rice).stock, 20, 'stock back');
    await crossCheck(t, a, 'A-1', 'after cancel');

    const o2 = (await a('POST', '/api/shop/orders', { items: [{ id: rice, qty: 1 }], payment: 'account' })).body;
    const due = (await a('GET', '/api/dues')).body.dues[0];
    assert.equal((await t.admin('POST', `/api/admin/dues/${due.id}/payments`, { amount: 50, method: 'cash' })).status, 201);
    assert.equal((await a('POST', `/api/shop/orders/${o2.id}/status`, { status: 'cancelled' })).status, 409, 'money already paid');
    assert.equal((await shop('POST', `/api/shop/orders/${o2.id}/status`, { status: 'ready' })).status, 200);
    assert.equal((await a('POST', `/api/shop/orders/${o2.id}/status`, { status: 'cancelled' })).status, 403, 'resident cannot cancel once ready');
    assert.equal((await shop('POST', `/api/shop/orders/${o2.id}/status`, { status: 'cancelled' })).status, 409, 'shop cannot cancel a part-paid order either');
    assert.equal((await a('GET', `/api/dues/${due.id}`)).body.balance, 300);
    assert.equal((await shop('GET', '/api/shop/items')).body.find(i => i.id === rice).stock, 19, 'blocked cancel leaves stock alone');
    await crossCheck(t, a, 'A-1', 'blocked cancel');

    // shop owner cancels a ready, unpaid account order: bill gone
    const o3 = (await a('POST', '/api/shop/orders', { items: [{ id: rice, qty: 1 }], payment: 'account', fulfilment: 'pickup' })).body;
    assert.equal((await shop('POST', `/api/shop/orders/${o3.id}/status`, { status: 'ready' })).status, 200);
    assert.equal((await shop('POST', `/api/shop/orders/${o3.id}/status`, { status: 'cancelled' })).status, 200);
    assert.ok(!(await a('GET', '/api/dues')).body.dues.some(d => d.title === `Tuck shop order #${o3.id}`));
    assert.ok((await a('GET', '/api/notifications')).body.some(n => new RegExp(`#${o3.id} was cancelled; the bill was removed`).test(n.message)));
    // delivered orders cannot be cancelled
    const o4 = (await a('POST', '/api/shop/orders', { items: [{ id: rice, qty: 1 }], payment: 'account' })).body;
    await shop('POST', `/api/shop/orders/${o4.id}/status`, { status: 'ready' });
    assert.equal((await shop('POST', `/api/shop/orders/${o4.id}/status`, { status: 'delivered' })).status, 200);
    assert.equal((await shop('POST', `/api/shop/orders/${o4.id}/status`, { status: 'cancelled' })).status, 409);
    await crossCheck(t, a, 'A-1', 'end');
  } finally { t.close(); }
});

test('credit limit: setting flows to /api/credit, card and checks; part payment frees credit; 0 turns credit off', async () => {
  const t = await boot();
  try {
    const a = await t.resident('a@x.test', 'A-1');
    const { shop, rice } = await setupShop(t);
    const ln = await t.account('laundry', 'ln@x.test');
    const shirt = (await ln('POST', '/api/laundry/rates', { item: 'Shirt', price: 25 })).body.id;
    assert.equal((await a('GET', '/api/credit')).body.limit, 3000, 'default limit');
    assert.equal((await t.admin('GET', '/api/admin/settings')).body.credit_limit, 3000);
    assert.equal((await t.admin('PUT', '/api/admin/settings', { credit_limit: -1 })).status, 400);
    assert.equal((await t.admin('PUT', '/api/admin/settings', { credit_limit: 'abc' })).status, 400);
    const member = await t.account('member', 'm@x.test');
    assert.notEqual((await member('PUT', '/api/admin/settings', { credit_limit: 99999 })).status, 200, 'a plain member cannot change the limit');
    assert.equal((await t.admin('PUT', '/api/admin/settings', { credit_limit: 1000 })).status, 200);
    assert.equal((await a('GET', '/api/credit')).body.limit, 1000);
    assert.equal((await a('GET', '/api/me/card')).body.money.credit_limit, 1000);

    // 700 on the shop, 250 on laundry = 950; next 350 would exceed 1000
    assert.equal((await a('POST', '/api/shop/orders', { items: [{ id: rice, qty: 2 }], payment: 'account' })).status, 201);
    const lo = await a('POST', '/api/laundry/orders', { pickup_date: '2026-11-26', pickup_slot: 'morning', items: [{ id: shirt, qty: 10 }], payment: 'account' });
    assert.equal(lo.status, 201); assert.equal(lo.body.total, 250);
    assert.equal((await a('GET', '/api/credit')).body.used, 950);
    const over = await a('POST', '/api/shop/orders', { items: [{ id: rice, qty: 1 }], payment: 'account' });
    assert.equal(over.status, 409); assert.match(over.body.error, /Credit limit is ₹1000; ₹950/);
    assert.equal((await shop('GET', '/api/shop/items')).body.find(i => i.id === rice).stock, 18, 'refused order takes no stock');
    assert.equal((await a('POST', '/api/laundry/orders', { pickup_date: '2026-11-26', pickup_slot: 'evening', items: [{ id: shirt, qty: 3 }], payment: 'account' })).status, 409, '950 + 75 > 1000');
    assert.equal((await a('POST', '/api/laundry/orders', { pickup_date: '2026-11-26', pickup_slot: 'evening', items: [{ id: shirt, qty: 2 }], payment: 'account' })).status, 201, '950 + 50 = 1000 is allowed');
    assert.equal((await a('GET', '/api/credit')).body.used, 1000);
    // cash still works over the limit
    assert.equal((await a('POST', '/api/shop/orders', { items: [{ id: rice, qty: 1 }], payment: 'cash' })).status, 201);
    // maintenance dues do not count as credit
    await t.admin('POST', '/api/admin/dues', { period: '2026-11', amount: 5000, due_date: '2026-11-30' });
    let x = await crossCheck(t, a, 'A-1', 'at limit');
    assert.equal(x.card.credit_used, 1000); assert.equal(x.card.balance, 6000);
    // the committee's settlement of the shop bill frees credit
    const shopBill = x.mine.dues.find(d => d.title.startsWith('Tuck shop order #'));
    assert.equal((await t.admin('POST', `/api/admin/dues/${shopBill.id}/payments`, { amount: 350, method: 'cash' })).status, 201);
    assert.equal((await a('GET', '/api/credit')).body.used, 650);
    assert.equal((await a('POST', '/api/shop/orders', { items: [{ id: rice, qty: 1 }], payment: 'account' })).status, 201, '650 + 350 = 1000');
    // paying the maintenance bill does not change credit
    const maint = x.mine.dues.find(d => d.title === 'Maintenance');
    assert.equal((await t.admin('POST', `/api/admin/dues/${maint.id}/payments`, { amount: 5000, method: 'bank' })).status, 201);
    x = await crossCheck(t, a, 'A-1', 'after settlements');
    assert.equal(x.card.credit_used, 1000); assert.equal(x.card.balance, 1000);
    // switch credit off
    assert.equal((await t.admin('PUT', '/api/admin/settings', { credit_limit: 0 })).status, 200);
    const off = await a('POST', '/api/laundry/orders', { pickup_date: '2026-11-27', pickup_slot: 'morning', items: [{ id: shirt, qty: 1 }], payment: 'account' });
    assert.equal(off.status, 409); assert.match(off.body.error, /switched off/);
    // the setting change is audited
    assert.ok((await t.admin('GET', '/api/admin/audit')).body.some(e => e.entity === 'settings' && /credit_limit: 1000 -> 0/.test(e.detail || e.details || '')));
  } finally { t.close(); }
});

test('shop counter by card: lookup, cash/upi/account sale, credit limit, bill and card money agree', async () => {
  const t = await boot();
  try {
    const a = await t.resident('a@x.test', 'A-1');
    const b = await t.resident('b@x.test', 'B-1');
    const { shop, rice, milk } = await setupShop(t);
    assert.equal((await t.admin('POST', `/api/admin/users/${a.id}/card`, { serial: 'AA01' })).status, 201);
    const cleaner = await t.account('cleaner', 'cl@x.test');
    const cl = (await t.admin('GET', '/api/admin/accounts')).body.find(z => z.email === 'cl@x.test');
    assert.equal((await t.admin('POST', `/api/admin/users/${cl.id}/card`, { serial: 'CC01' })).status, 201);
    // only the shop owner may look up and sell
    assert.equal((await a('POST', '/api/shop/card', { serial: 'AA01' })).status, 403);
    assert.equal((await t.admin('POST', '/api/shop/card', { serial: 'AA01' })).status, 403);
    assert.equal((await a('POST', '/api/shop/counter', { serial: 'AA01', items: [{ id: rice, qty: 1 }] })).status, 403);
    assert.equal((await t.admin('POST', '/api/shop/counter', { serial: 'AA01', items: [{ id: rice, qty: 1 }] })).status, 403);
    assert.equal((await shop('POST', '/api/shop/card', { serial: 'CC01' })).status, 404, 'staff card is not a resident card');
    assert.equal((await shop('POST', '/api/shop/counter', { serial: 'CC01', items: [{ id: rice, qty: 1 }], payment: 'account' })).status, 404);
    assert.equal((await shop('POST', '/api/shop/card', { serial: 'FFFF' })).status, 404);

    let who = (await shop('POST', '/api/shop/card', { serial: 'aa:01' })).body;
    assert.equal(who.flat, 'A-1'); assert.equal(who.credit_used, 0); assert.equal(who.credit_limit, 3000);
    const cash = await shop('POST', '/api/shop/counter', { serial: 'AA01', items: [{ id: milk, qty: 3 }], payment: 'cash' });
    assert.equal(cash.status, 201); assert.equal(cash.body.total, 99.99);
    const upi = await shop('POST', '/api/shop/counter', { serial: 'AA01', items: [{ id: rice, qty: 1 }], payment: 'upi' });
    assert.equal(upi.status, 201);
    const acc = await shop('POST', '/api/shop/counter', { serial: 'AA01', items: [{ id: rice, qty: 4 }, { id: milk, qty: 1 }], payment: 'account' });
    assert.equal(acc.status, 201); assert.equal(acc.body.total, 1433.33);
    assert.equal((await shop('POST', '/api/shop/counter', { serial: 'AA01', items: [{ id: rice, qty: 1 }], payment: 'cheque' })).status, 400);

    const orders = (await a('GET', '/api/shop/orders')).body;
    const o = id => orders.find(z => z.id === id);
    assert.equal(o(cash.body.id).status, 'collected'); assert.equal(o(cash.body.id).fulfilment, 'counter');
    assert.equal(o(cash.body.id).payment_status, 'paid'); assert.equal(o(upi.body.id).payment_status, 'paid');
    assert.equal(o(acc.body.id).payment_status, 'on_account');
    assert.equal((await b('GET', '/api/shop/orders')).body.length, 0, 'other flat sees nothing');
    assert.equal((await b('GET', '/api/dues')).body.dues.length, 0, 'other flat is not billed');
    const bill = (await a('GET', '/api/dues')).body.dues.find(d => d.title === `Tuck shop order #${acc.body.id}`);
    assert.ok(bill); assert.equal(bill.amount, 1433.33);
    who = (await shop('POST', '/api/shop/card', { serial: 'AA01' })).body;
    assert.equal(who.credit_used, 1433.33);
    await crossCheck(t, a, 'A-1', 'counter');
    // the counter sale cannot be cancelled (it is already collected)
    assert.equal((await shop('POST', `/api/shop/orders/${acc.body.id}/status`, { status: 'cancelled' })).status, 409);
    // credit limit applies at the counter as well
    const big = await shop('POST', '/api/shop/counter', { serial: 'AA01', items: [{ id: rice, qty: 5 }], payment: 'account' });
    assert.equal(big.status, 409, '1433.33 + 1750 > 3000');
    assert.equal((await shop('GET', '/api/shop/items')).body.find(i => i.id === rice).stock, 15, 'refused sale takes no stock');
    // stock is checked at the counter
    assert.equal((await shop('POST', '/api/shop/counter', { serial: 'AA01', items: [{ id: rice, qty: 16 }], payment: 'cash' })).status, 409);
    // the resident is told about counter sales
    assert.ok((await a('GET', '/api/notifications')).body.some(n => /added to your maintenance account/.test(n.message)));
  } finally { t.close(); }
});

test('laundry: payment modes, bill on account, cancel only while requested, payment_status after delivery and bill payment', async () => {
  const t = await boot();
  try {
    const a = await t.resident('a@x.test', 'A-1');
    const ln = await t.account('laundry', 'ln@x.test');
    const shirt = (await ln('POST', '/api/laundry/rates', { item: 'Shirt', price: 22.5 })).body.id;
    const saree = (await ln('POST', '/api/laundry/rates', { item: 'Saree', price: 120 })).body.id;
    assert.equal((await a('POST', '/api/laundry/orders', { pickup_date: '2026-11-26', pickup_slot: 'morning', items: [{ id: shirt, qty: 1 }], payment: 'gold' })).status, 400);
    const cash = await a('POST', '/api/laundry/orders', { pickup_date: '2026-11-26', pickup_slot: 'morning', items: [{ id: shirt, qty: 4 }], payment: 'cash' });
    const acc = await a('POST', '/api/laundry/orders', { pickup_date: '2026-11-26', pickup_slot: 'afternoon', items: [{ id: shirt, qty: 2 }, { id: saree, qty: 1 }], payment: 'account' });
    assert.equal(cash.body.total, 90); assert.equal(acc.body.total, 165);
    let dues = (await a('GET', '/api/dues')).body.dues;
    assert.equal(dues.length, 1); assert.equal(dues[0].title, `Laundry #${acc.body.id}`); assert.equal(dues[0].amount, 165);
    // a price change later does not change the bill or the order
    assert.equal((await ln('PATCH', `/api/laundry/rates/${shirt}`, { price: 30 })).status, 200);
    assert.equal((await a('GET', '/api/dues')).body.dues[0].amount, 165);
    // move both through to delivered
    for (const id of [cash.body.id, acc.body.id]) for (const s of ['picked_up', 'washing', 'ready', 'delivered']) assert.equal((await ln('POST', `/api/laundry/orders/${id}/status`, { status: s })).status, 200, s);
    let lo = (await a('GET', '/api/laundry/orders')).body;
    assert.equal(lo.find(z => z.id === cash.body.id).payment_status, 'paid');
    assert.equal(lo.find(z => z.id === acc.body.id).payment_status, 'on_account');
    await crossCheck(t, a, 'A-1', 'laundry delivered');
    const due = dues[0];
    assert.equal((await t.admin('POST', `/api/admin/dues/${due.id}/payments`, { amount: 165, method: 'upi' })).status, 201);
    lo = (await a('GET', '/api/laundry/orders')).body;
    assert.equal(lo.find(z => z.id === acc.body.id).payment_status, 'paid');
    await crossCheck(t, a, 'A-1', 'laundry paid');
    // cancel rules
    const c1 = (await a('POST', '/api/laundry/orders', { pickup_date: '2026-11-27', pickup_slot: 'morning', items: [{ id: saree, qty: 1 }], payment: 'account' })).body;
    assert.equal((await a('POST', `/api/laundry/orders/${c1.id}/status`, { status: 'cancelled' })).status, 200);
    assert.ok(!(await a('GET', '/api/dues')).body.dues.some(d => d.title === `Laundry #${c1.id}`), 'bill removed');
    const c2 = (await a('POST', '/api/laundry/orders', { pickup_date: '2026-11-27', pickup_slot: 'morning', items: [{ id: saree, qty: 1 }], payment: 'account' })).body;
    const d2 = (await a('GET', '/api/dues')).body.dues.find(d => d.title === `Laundry #${c2.id}`);
    await t.admin('POST', `/api/admin/dues/${d2.id}/payments`, { amount: 20, method: 'cash' });
    assert.equal((await ln('POST', `/api/laundry/orders/${c2.id}/status`, { status: 'cancelled' })).status, 409, 'part paid blocks the cancel');
    assert.equal((await ln('POST', `/api/laundry/orders/${c2.id}/status`, { status: 'picked_up' })).status, 200);
    assert.equal((await a('POST', `/api/laundry/orders/${c2.id}/status`, { status: 'cancelled' })).status, 409, 'too late after pickup');
    await crossCheck(t, a, 'A-1', 'laundry end');
  } finally { t.close(); }
});

test('monthly dues coexist with shop bills; duplicate title/period rules; overdue; committee summary adds up', async () => {
  const t = await boot();
  try {
    const a = await t.resident('a@x.test', 'A-1');
    const b = await t.resident('b@x.test', 'B-1');
    const { rice } = await setupShop(t);
    assert.equal((await a('POST', '/api/shop/orders', { items: [{ id: rice, qty: 1 }], payment: 'account' })).status, 201);
    assert.equal((await a('POST', '/api/shop/orders', { items: [{ id: rice, qty: 1 }], payment: 'account' })).status, 201, 'two shop bills in one period are allowed');
    assert.equal((await a('POST', '/api/admin/dues', { period: '2026-11', amount: 1, due_date: '2026-11-30' })).status, 403);
    let r = await t.admin('POST', '/api/admin/dues', { period: '2026-11', amount: 2500, due_date: '2026-11-30' });
    assert.equal(r.status, 201); assert.deepStrictEqual(r.body, { created: 2, skipped: 0 }, 'one per flat with residents; shop bills do not block it');
    r = await t.admin('POST', '/api/admin/dues', { period: '2026-11', amount: 2500, due_date: '2026-11-30' });
    assert.deepStrictEqual(r.body, { created: 0, skipped: 2 }, 'same period and title skipped');
    r = await t.admin('POST', '/api/admin/dues', { period: '2026-11', title: 'Sinking fund', amount: 500, due_date: '2026-11-30', flats: ['A-1'] });
    assert.deepStrictEqual(r.body, { created: 1, skipped: 0 }, 'a different title is a separate bill');
    r = await t.admin('POST', '/api/admin/dues', { period: '2026-12', amount: 2500, due_date: '2026-12-31' });
    assert.deepStrictEqual(r.body, { created: 2, skipped: 0 }, 'a new period is billed again');
    for (const bad of [{ period: '2026-13', amount: 1, due_date: '2026-11-30' }, { period: '2026-11', amount: 0, due_date: '2026-11-30' }, { period: '2026-11', amount: 1, due_date: 'soon' }, { period: '2026-11', amount: 1, due_date: '2026-11-30', flats: 'A-1' }])
      assert.equal((await t.admin('POST', '/api/admin/dues', bad)).status, 400, JSON.stringify(bad));

    let x = await crossCheck(t, a, 'A-1', 'mixed');
    assert.equal(x.mine.dues.length, 5); assert.equal(x.mine.totals.billed, 350 + 350 + 2500 + 500 + 2500);
    assert.equal(x.card.credit_used, 700);
    await crossCheck(t, b, 'B-1', 'B mixed');
    // filters
    assert.equal((await a('GET', '/api/dues?period=2026-12')).body.dues.length, 1);
    assert.equal((await a('GET', '/api/dues?flat=B-1')).body.dues.every(d => d.flat === 'A-1'), true, 'residents cannot filter into another flat');
    // a payment on B
    const bm = (await b('GET', '/api/dues?period=2026-11')).body.dues[0];
    await t.admin('POST', `/api/admin/dues/${bm.id}/payments`, { amount: 1000, method: 'cheque', reference: 'CHQ 1' });
    assert.equal((await b('GET', '/api/dues?status=partial')).body.dues.length, 1);
    // committee totals = sum of all flats = summary
    const all = (await t.admin('GET', '/api/dues')).body;
    const A = (await t.admin('GET', '/api/dues?flat=A-1')).body.totals, B = (await t.admin('GET', '/api/dues?flat=B-1')).body.totals;
    assert.equal(all.totals.outstanding, Math.round((A.outstanding + B.outstanding) * 100) / 100);
    assert.equal(all.totals.billed, Math.round((A.billed + B.billed) * 100) / 100);
    const cs = (await t.admin('GET', '/api/modules/summary')).body;
    assert.equal(cs.dues_outstanding, all.totals.outstanding, 'committee summary includes shop credit');
    assert.equal(cs.dues_overdue, 0);
    // time passes: 2026-12-02 IST -> November bills and nothing else overdue; shop bills due 12-10 not yet
    t.clk.now = new Date('2026-12-02T06:30:00Z');
    x = await crossCheck(t, a, 'A-1', 'later');
    const overdue = x.mine.dues.filter(d => d.overdue).map(d => d.title).sort();
    assert.deepStrictEqual(overdue, ['Maintenance', 'Sinking fund']);
    assert.equal(x.summ.dues_overdue, 2); assert.equal(x.mine.totals.overdue, 2);
    assert.equal((await b('GET', '/api/dues?status=overdue')).body.dues.length, 0, 'part paid shows as partial, not overdue status');
    assert.equal((await b('GET', '/api/dues')).body.totals.overdue, 1, 'but it is counted as overdue');
    t.clk.now = new Date('2026-12-11T06:30:00Z');
    x = await crossCheck(t, a, 'A-1', 'shop bills overdue');
    assert.equal(x.mine.dues.filter(d => d.overdue && d.title.startsWith('Tuck shop')).length, 2);
    const cs2 = (await t.admin('GET', '/api/modules/summary')).body;
    assert.equal(cs2.dues_overdue, (await t.admin('GET', '/api/dues')).body.totals.overdue);
  } finally { t.close(); }
});

test('family and tenant of the same flat share the flat account', async () => {
  const t = await boot();
  try {
    const owner = await t.resident('o@x.test', 'A-1');
    const { shop, rice } = await setupShop(t);
    for (const [email, type] of [['f@x.test', 'family'], ['tn@x.test', 'tenant']]) {
      const r = await owner('POST', '/api/household', { name: type, email, resident_type: type, password: PW, consent: true });
      assert.equal(r.status, 201, JSON.stringify(r.body));
      assert.equal((await t.admin('POST', `/api/admin/users/${r.body.id}/approve`)).status, 200);
    }
    const fam = await t.login('f@x.test'), ten = await t.login('tn@x.test');
    const fo = await fam('POST', '/api/shop/orders', { items: [{ id: rice, qty: 1 }], payment: 'account' });
    assert.equal(fo.status, 201);
    const to = await ten('POST', '/api/shop/orders', { items: [{ id: rice, qty: 2 }], payment: 'account' });
    assert.equal(to.status, 201);
    for (const c of [owner, fam, ten]) {
      const x = await crossCheck(t, c, 'A-1', 'household');
      assert.equal(x.card.credit_used, 1050); assert.equal(x.mine.dues.length, 2);
      assert.equal((await c('GET', '/api/shop/orders')).body.length, 2, 'the whole flat sees the orders');
    }
    // the family member can cancel the tenant's order (same flat) and the bill goes
    assert.equal((await fam('POST', `/api/shop/orders/${to.body.id}/status`, { status: 'cancelled' })).status, 200);
    assert.equal((await owner('GET', '/api/credit')).body.used, 350);
    // a counter sale on the tenant's card bills the same flat
    const tid = (await t.admin('GET', '/api/admin/users?status=approved')).body.find(u => u.email === 'tn@x.test').id;
    assert.equal((await t.admin('POST', `/api/admin/users/${tid}/card`, { serial: 'BEEF01' })).status, 201);
    assert.equal((await shop('POST', '/api/shop/counter', { serial: 'BEEF01', items: [{ id: rice, qty: 1 }], payment: 'account' })).status, 201);
    assert.equal((await shop('POST', '/api/shop/card', { serial: 'BEEF01' })).body.credit_used, 700);
    for (const c of [owner, fam, ten]) assert.equal((await crossCheck(t, c, 'A-1', 'after counter')).card.credit_used, 700);
  } finally { t.close(); }
});
