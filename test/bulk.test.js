// Bulk upload (docs/bulk-upload-api.md): committee-created residents, CSV dry run with per-row errors, import through
// the normal routes (replayed), generated sign-in passwords, head/admin-only accounts, vendors, inventory. Synthetic data.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-bulk-'));
  const app = createApp({ dbFile: path.join(dir, 'b.db'), uploadDir: path.join(dir, 'up'), noTimers: true });
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
  return { admin, client, close: () => server.close() };
}

test('committee creates an approved resident; a temporary password is returned only when none was given', async () => {
  const t = await boot();
  try {
    const r = await t.admin('POST', '/api/admin/residents', { name: 'Asha', email: 'asha@x.test', flat: 'b-304', resident_type: 'tenant' });
    assert.equal(r.status, 201); assert.ok(r.body.password && r.body.password.length >= 12);
    const asha = t.client();
    const me = await asha('POST', '/api/login', { email: 'asha@x.test', password: r.body.password });
    assert.equal(me.status, 200);
    assert.equal((await asha('GET', '/api/me')).body.flat, 'B-304');
    assert.ok((await asha('GET', '/api/notifications')).body.some(n => /Your committee set up your account for flat B-304/.test(n.message)));
    const own = await t.admin('POST', '/api/admin/residents', { name: 'Ravi', email: 'ravi@x.test', flat: 'C-1', resident_type: 'owner', password: PW });
    assert.equal(own.status, 201); assert.equal(own.body.password, undefined, 'a password the committee chose is not echoed');
    assert.equal((await t.admin('POST', '/api/admin/residents', { name: 'X', email: 'asha@x.test', flat: 'C-2', resident_type: 'owner' })).status, 409);
    assert.equal((await t.admin('POST', '/api/admin/residents', { name: 'X', email: 'y@x.test', flat: 'C-2', resident_type: 'guest' })).status, 400);
    assert.equal((await asha('POST', '/api/admin/residents', { name: 'X', email: 'z@x.test', flat: 'C-2', resident_type: 'owner' })).status, 403, 'residents cannot');
  } finally { t.close(); }
});

test('bulk residents: dry run reports every row, import creates only the valid ones with a sign-in sheet', async () => {
  const t = await boot();
  try {
    const tpl = (await t.admin('GET', '/api/admin/bulk/templates')).body;
    assert.deepEqual(tpl.residents.columns, ['name', 'email', 'flat', 'resident_type', 'phone', 'password']);
    assert.equal(tpl.accounts.needs_head, true);
    await t.admin('POST', '/api/admin/residents', { name: 'Existing', email: 'old@x.test', flat: 'A-1', resident_type: 'owner' });
    const rows = [
      { name: 'Meera', email: 'meera@x.test', flat: 'A-101', resident_type: 'Owner', phone: '9800000001' },
      { name: 'Kiran', email: 'kiran@x.test', flat: 'A-102', resident_type: 'tenant' },
      { name: 'No flat', email: 'noflat@x.test', flat: '', resident_type: 'owner' },
      { name: 'Bad type', email: 'bad@x.test', flat: 'A-103', resident_type: 'guest' },
      { name: 'Again', email: 'MEERA@x.test', flat: 'A-104', resident_type: 'family' },
      { name: 'Old', email: 'old@x.test', flat: 'A-105', resident_type: 'owner' },
      { name: 'Short pw', email: 'short@x.test', flat: 'A-106', resident_type: 'owner', password: 'abc' },
    ];
    const dry = await t.admin('POST', '/api/admin/bulk/residents', { rows, dry_run: true });
    assert.equal(dry.status, 200); assert.equal(dry.body.valid, 2);
    assert.deepEqual(dry.body.rows.map(r => [r.row, r.ok, r.error || '']), [
      [2, true, ''], [3, true, ''], [4, false, 'flat is required'], [5, false, 'resident_type must be owner, tenant or family'],
      [6, false, 'the same email appears earlier in the file'], [7, false, 'email already registered'], [8, false, 'password must be 8 to 128 characters (or leave it empty)']]);
    assert.equal((await t.admin('GET', '/api/admin/users?status=approved')).body.filter(u => /meera|kiran/.test(u.email)).length, 0, 'a dry run writes nothing');

    const imp = await t.admin('POST', '/api/admin/bulk/residents', { rows });
    assert.equal(imp.status, 200); assert.equal(imp.body.imported, 2); assert.equal(imp.body.failed, 5);
    const sheet = imp.body.rows.filter(r => r.password);
    assert.deepEqual(sheet.map(r => r.email), ['meera@x.test', 'kiran@x.test']);
    const kiran = t.client();
    assert.equal((await kiran('POST', '/api/login', { email: 'kiran@x.test', password: sheet[1].password })).status, 200);
    assert.equal((await kiran('GET', '/api/me')).body.resident_type, 'tenant');
    const audit = (await t.admin('GET', '/api/admin/audit')).body;
    const rowsA = Array.isArray(audit) ? audit : audit.rows || [];
    assert.ok(rowsA.some(a => a.entity === 'bulk_upload' && /2 of 7 rows imported/.test(a.detail || '')));
    assert.ok(rowsA.filter(a => a.action === 'created_by_committee').length >= 3, 'each resident audited one by one');
  } finally { t.close(); }
});

test('bulk accounts need the head or admin; vendors and inventory import through their own routes', async () => {
  const t = await boot();
  try {
    const acc = await t.admin('POST', '/api/admin/bulk/accounts', { rows: [
      { name: 'Ravi Shinde', email: 'guard2@x.test', kind: 'guard' }, { name: 'Sunil', email: 'clean@x.test', kind: 'Cleaner', password: PW },
      { name: 'Nope', email: 'nope@x.test', kind: 'chef' }] });
    assert.equal(acc.status, 200); assert.equal(acc.body.imported, 2);
    assert.equal(acc.body.rows[2].error, 'kind must be one of: member, head, sysadmin, maintenance, cleaner, it, guard, shop, laundry');
    const gpw = acc.body.rows[0].password; assert.ok(gpw);
    assert.equal(acc.body.rows[1].password, undefined, 'a password the committee put in the file is not echoed back');
    const guard = t.client();
    assert.equal((await guard('POST', '/api/login', { email: 'guard2@x.test', password: gpw })).status, 200);
    // a committee member (not head or admin) cannot bulk-create accounts
    const mem = (await t.admin('POST', '/api/admin/bulk/accounts', { rows: [{ name: 'Mem', email: 'mem@x.test', kind: 'member', password: PW }] })).body.rows[0];
    const member = t.client(); await member('POST', '/api/login', { email: 'mem@x.test', password: PW });
    assert.ok(mem.ok);
    assert.equal((await member('POST', '/api/admin/bulk/accounts', { rows: [{ name: 'G', email: 'g3@x.test', kind: 'guard' }] })).status, 403);

    const ven = await t.admin('POST', '/api/admin/bulk/vendors', { rows: [{ name: 'AquaFix', trade: 'Plumbing', phone: '9800000009' }, { name: 'aquafix', trade: 'plumbing' }, { name: 'Volt', trade: '' }] });
    assert.equal(ven.body.imported, 1); assert.deepEqual(ven.body.rows.map(r => r.ok), [true, false, false]);
    assert.ok((await t.admin('GET', '/api/vendors')).body.some(v => v.name === 'AquaFix' && v.trade === 'plumbing'));

    const inv = await t.admin('POST', '/api/admin/bulk/inventory', { rows: [
      { name: 'PVC tape', category: 'plumbing', quantity: '10', unit: 'roll', min_qty: '2', location: 'Store' },
      { name: 'Bulb', category: 'lighting', quantity: '5' }, { name: 'Mop', category: 'cleaning', quantity: '-1' }] });
    assert.equal(inv.body.imported, 1); assert.match(inv.body.rows[1].error, /category must be one of/); assert.match(inv.body.rows[2].error, /quantity must be a whole number/);
    const tape = (await t.admin('GET', '/api/inventory')).body.find(i => i.name === 'PVC tape');
    assert.equal(tape.quantity, 10); assert.equal(tape.unit, 'roll');

    assert.equal((await t.admin('POST', '/api/admin/bulk/parking', { rows: [{}] })).status, 404);
    assert.equal((await t.admin('POST', '/api/admin/bulk/vendors', { rows: [] })).status, 400);
    assert.equal((await t.admin('POST', '/api/admin/bulk/vendors', { rows: Array.from({ length: 501 }, (_, i) => ({ name: 'V' + i, trade: 'other' })) })).status, 400);
  } finally { t.close(); }
});
