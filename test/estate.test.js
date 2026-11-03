const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-estate-'));
  const app = createApp({ dbFile: path.join(dir, 'e.db'), uploadDir: path.join(dir, 'up') });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (method, url, body) => {
      const headers = { cookie };
      if (body) headers['content-type'] = 'application/json';
      const res = await fetch(base + url, { method, headers, body: body && JSON.stringify(body) });
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { json = text; }
      return { status: res.status, body: json };
    };
  };
  const admin = client();
  await admin('POST', '/api/login', ADMIN);
  const close = () => { server.close(); try { app.locals.db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); };
  const person = async (email, flat, type) => {
    const c = client();
    assert.equal((await client()('POST', '/api/register', { name: email.split('@')[0], email, flat, resident_type: type, password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    assert.equal((await admin('POST', `/api/admin/users/${p.id}/approve`)).status, 200);
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    c.id = p.id;
    return c;
  };
  const guard = async email => {
    const c = client();
    assert.equal((await admin('POST', '/api/admin/guards', { name: 'Gate Guard', email, password: PW })).status, 201);
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    return c;
  };
  return { admin, client, person, guard, close };
}

test('vehicles: add, duplicate, limit, search, isolation, permission', async () => {
  const { admin, person, close } = await boot();
  try {
    const a = await person('va@example.test', 'A-101', 'owner');
    const b = await person('vb@example.test', 'B-202', 'owner');
    const fam = await person('vf@example.test', 'A-101', 'family');
    assert.equal((await a('POST', '/api/vehicles', { plate: 'ab', type: 'car' })).status, 400);
    assert.equal((await a('POST', '/api/vehicles', { plate: 'MH 12-AB 1234', type: 'boat' })).status, 400);
    assert.equal((await a('POST', '/api/vehicles', { plate: 'MH 12 AB 1234', type: 'car', sticker: 'x'.repeat(21) })).status, 400);
    const ok = await a('POST', '/api/vehicles', { plate: 'mh 12-ab 1234', type: 'car', make: 'Maruti', color: 'Red' });
    assert.equal(ok.status, 201);
    // duplicate with different spacing/dashes, even from another flat
    assert.equal((await b('POST', '/api/vehicles', { plate: 'MH12AB1234', type: 'car' })).status, 409);
    const list = (await a('GET', '/api/vehicles')).body;
    assert.equal(list.length, 1);
    assert.equal(list[0].plate, 'MH 12-AB 1234');
    assert.equal(list[0].flat, 'A-101');
    assert.ok(list[0].owner_name);
    // flat isolation
    assert.equal((await b('GET', '/api/vehicles')).body.length, 0);
    assert.equal((await b('DELETE', `/api/vehicles/${ok.body.id}`)).status, 404);
    // family: vehicle.manage off by default, can still view the flat's vehicles
    assert.equal((await fam('POST', '/api/vehicles', { plate: 'KA01XY9999', type: 'bike' })).status, 403);
    assert.equal((await fam('GET', '/api/vehicles')).body.length, 1);
    // limit of 6 per flat
    for (let i = 2; i <= 6; i++) assert.equal((await a('POST', '/api/vehicles', { plate: `GJ05CD000${i}`, type: 'bike' })).status, 201);
    assert.equal((await a('POST', '/api/vehicles', { plate: 'GJ05CD0007', type: 'bike' })).status, 409);
    // admin: all vehicles, search incl. wildcard escaping, flat required and must exist
    assert.equal((await admin('GET', '/api/vehicles')).body.length, 6);
    assert.equal((await admin('GET', '/api/vehicles?q=ab 1234')).body.length, 1);
    assert.equal((await admin('GET', '/api/vehicles?q=A-101')).body.length, 6);
    assert.equal((await admin('GET', '/api/vehicles?q=%25')).body.length, 0);
    assert.equal((await admin('GET', '/api/vehicles?q=va')).body.length, 6); // owner name
    assert.equal((await admin('POST', '/api/vehicles', { plate: 'DL01ZZ0001', type: 'car' })).status, 400);
    assert.equal((await admin('POST', '/api/vehicles', { plate: 'DL01ZZ0001', type: 'car', flat: 'Z-999' })).status, 400);
    assert.equal((await admin('POST', '/api/vehicles', { plate: 'DL01ZZ0001', type: 'car', flat: 'B-202' })).status, 201);
    // permission turned off for tenants/owners
    await admin('PUT', '/api/admin/access', { matrix: { owner: { 'vehicle.manage': false } } });
    assert.equal((await b('POST', '/api/vehicles', { plate: 'DL01ZZ0002', type: 'car' })).status, 403);
    assert.equal((await a('DELETE', `/api/vehicles/${ok.body.id}`)).status, 403);
    await admin('PUT', '/api/admin/access', { matrix: { owner: { 'vehicle.manage': true } } });
    assert.equal((await a('DELETE', `/api/vehicles/${ok.body.id}`)).status, 200);
    const audit = (await admin('GET', '/api/admin/audit')).body;
    assert.ok(audit.some(r => r.entity === 'vehicle' && r.action === 'created'));
    assert.ok(audit.some(r => r.entity === 'vehicle' && r.action === 'deleted'));
  } finally { close(); }
});

test('parking: create range, assign, free, remove, resident isolation, notify', async () => {
  const { admin, person, close } = await boot();
  try {
    const a = await person('pa@example.test', 'A-101', 'owner');
    const b = await person('pb@example.test', 'B-202', 'owner');
    assert.equal((await a('POST', '/api/parking', { prefix: 'B1-', from: 1, count: 3 })).status, 403);
    for (const bad of [{ prefix: 'B1-', count: 0 }, { prefix: 'B1-', count: 201 }, { prefix: 'B1-', count: 2, kind: 'boat' }, { prefix: 'a b', count: 2 }])
      assert.equal((await admin('POST', '/api/parking', bad)).status, 400);
    const mk = await admin('POST', '/api/parking', { prefix: 'B1-', from: 1, count: 12, kind: 'car', level: 'B1' });
    assert.equal(mk.status, 201);
    assert.equal(mk.body.created, 12);
    const again = await admin('POST', '/api/parking', { prefix: 'B1-', from: 10, count: 6, kind: 'car' });
    assert.equal(again.body.created, 3); // 13,14,15 new; 10-12 skipped
    const all = (await admin('GET', '/api/parking')).body;
    assert.deepEqual(all.summary, { total: 15, assigned: 0, free: 15 });
    assert.ok(all.slots.some(s => s.code === 'B1-01' && s.level === 'B1' && s.kind === 'car'));
    const s1 = all.slots.find(s => s.code === 'B1-01'), s2 = all.slots.find(s => s.code === 'B1-02');

    const veh = (await a('POST', '/api/vehicles', { plate: 'MH12AB1234', type: 'car' })).body.id;
    const vb = (await b('POST', '/api/vehicles', { plate: 'MH12CD5678', type: 'car' })).body.id;
    assert.equal((await a('POST', `/api/parking/${s1.id}/assign`, { flat: 'A-101' })).status, 403);
    assert.equal((await admin('POST', `/api/parking/${s1.id}/assign`, { flat: 'Z-999' })).status, 400);
    assert.equal((await admin('POST', `/api/parking/${s1.id}/assign`, { flat: 'A-101', vehicle_id: vb })).status, 400);
    assert.equal((await admin('POST', '/api/parking/99999/assign', { flat: 'A-101' })).status, 404);
    assert.equal((await admin('POST', `/api/parking/${s1.id}/assign`, { flat: 'A-101', vehicle_id: veh })).status, 200);
    assert.equal((await admin('POST', `/api/parking/${s1.id}/assign`, { flat: 'B-202' })).status, 409);
    assert.equal((await admin('POST', `/api/parking/${s2.id}/assign`, { flat: 'A-101' })).status, 200);
    // notify
    const notes = (await a('GET', '/api/notifications')).body;
    assert.ok(notes.some(n => n.message.includes('B1-01')));
    // resident sees only own flat's slots, with overall summary
    const mine = (await a('GET', '/api/parking')).body;
    assert.deepEqual(mine.summary, { total: 15, assigned: 2, free: 13 });
    assert.deepEqual(mine.slots.map(s => s.code), ['B1-01', 'B1-02']);
    assert.equal(mine.slots[0].plate, 'MH12AB1234');
    assert.equal((await b('GET', '/api/parking')).body.slots.length, 0);
    // remove rules
    assert.equal((await admin('DELETE', `/api/parking/${s1.id}`)).status, 409);
    // deleting the vehicle frees its slot
    assert.equal((await a('DELETE', `/api/vehicles/${veh}`)).status, 200);
    const after = (await admin('GET', '/api/parking')).body;
    const s1b = after.slots.find(s => s.id === s1.id);
    assert.equal(s1b.flat, null);
    assert.equal(s1b.vehicle_id, null);
    assert.equal((await admin('POST', `/api/parking/${s2.id}/free`)).status, 200);
    assert.equal((await admin('POST', `/api/parking/${s2.id}/free`)).status, 409);
    assert.ok((await a('GET', '/api/notifications')).body.some(n => n.message.includes('released')));
    assert.equal((await admin('DELETE', `/api/parking/${s2.id}`)).status, 200);
    assert.equal((await admin('GET', '/api/parking')).body.summary.total, 14);
    // permission + feature
    await admin('PUT', '/api/admin/access', { matrix: { owner: { 'parking.view': false } } });
    assert.equal((await a('GET', '/api/parking')).status, 403);
    const audit = (await admin('GET', '/api/admin/audit')).body;
    for (const act of ['slots_created', 'assigned', 'freed', 'slot_deleted']) assert.ok(audit.some(r => r.entity === 'parking' && r.action === act), act);
  } finally { close(); }
});

test('workers: admin CRUD, validation, non-admin 403', async () => {
  const { admin, person, close } = await boot();
  try {
    const a = await person('wa@example.test', 'A-101', 'owner');
    assert.equal((await a('GET', '/api/admin/workers')).status, 403);
    assert.equal((await a('POST', '/api/admin/workers', { name: 'X' })).status, 403);
    for (const bad of [{}, { name: 'x'.repeat(101) }, { name: 'N', role: 'chef' }, { name: 'N', phone: 'abc' }, { name: 'N', status: 'gone' }, { name: 'N', shift: 'x'.repeat(41) }, { name: 'N', notes: 'x'.repeat(301) }])
      assert.equal((await admin('POST', '/api/admin/workers', bad)).status, 400);
    const c = await admin('POST', '/api/admin/workers', { name: 'Ramesh', role: 'gardener', phone: '+91 98765 43210', shift: 'Morning', notes: 'n' });
    assert.equal(c.status, 201);
    let list = (await admin('GET', '/api/admin/workers')).body;
    assert.equal(list.length, 1);
    assert.equal(list[0].status, 'active');
    assert.equal(list[0].role, 'gardener');
    assert.equal((await admin('PUT', `/api/admin/workers/${c.body.id}`, { status: 'inactive', shift: 'Evening' })).status, 200);
    list = (await admin('GET', '/api/admin/workers')).body;
    assert.equal(list[0].status, 'inactive');
    assert.equal(list[0].shift, 'Evening');
    assert.equal(list[0].name, 'Ramesh');
    assert.equal((await admin('PUT', `/api/admin/workers/${c.body.id}`, { role: 'nope' })).status, 400);
    assert.equal((await admin('PUT', '/api/admin/workers/9999', { name: 'Q' })).status, 404);
    assert.equal((await a('DELETE', `/api/admin/workers/${c.body.id}`)).status, 403);
    assert.equal((await admin('DELETE', `/api/admin/workers/${c.body.id}`)).status, 200);
    assert.equal((await admin('DELETE', `/api/admin/workers/${c.body.id}`)).status, 404);
    const audit = (await admin('GET', '/api/admin/audit')).body;
    for (const act of ['created', 'updated', 'deleted']) assert.ok(audit.some(r => r.entity === 'worker' && r.action === act), act);
  } finally { close(); }
});

test('gate overview: guard and admin, real scans, access control', async () => {
  const { admin, person, guard, close } = await boot();
  try {
    const a = await person('ga@example.test', 'A-101', 'owner');
    const g = await guard('guard1@example.test');
    assert.equal((await a('GET', '/api/gate/overview')).status, 403);
    const empty = (await g('GET', '/api/gate/overview')).body;
    assert.deepEqual(empty.today, { allowed: 0, denied: 0, visitors: 0, residents: 0 });
    assert.equal(empty.by_hour.length, 24);
    const pass = (await a('POST', '/api/gate/passes', { visitor_name: 'Visitor One' })).body;
    const pass2 = (await a('POST', '/api/gate/passes', { visitor_name: 'Visitor Two' })).body;
    assert.equal((await g('GET', '/api/gate/overview')).body.active_passes, 2);
    assert.equal((await g('POST', '/api/gate/verify', { code: pass.code })).body.result, 'allowed');
    assert.equal((await g('POST', '/api/gate/verify', { code: pass.code })).body.result, 'denied'); // used
    const me = (await a('GET', '/api/gate/me')).body;
    assert.equal((await g('POST', '/api/gate/verify', { token: me.token })).body.kind, 'resident');
    assert.equal((await g('POST', '/api/gate/verify', { token: 'nope' })).body.result, 'denied');
    for (const who of [g, admin]) {
      const o = (await who('GET', '/api/gate/overview')).body;
      assert.deepEqual(o.today, { allowed: 2, denied: 2, visitors: 1, residents: 1 });
      assert.equal(o.active_passes, 1);
      assert.equal(o.inside, 1);
      assert.equal(o.recent.length, 4);
      assert.deepEqual(Object.keys(o.recent[0]).sort(), ['created_at', 'flat', 'guard_name', 'kind', 'reason', 'result', 'subject']);
      assert.equal(o.recent[0].guard_name, 'Gate Guard');
      assert.equal(o.by_hour.reduce((n, h) => n + h.n, 0), 4);
      assert.ok(o.by_hour.every((h, i) => h.hour === i));
    }
    assert.ok(pass2.code);
  } finally { close(); }
});

test('parking feature flag off: residents blocked, admin unaffected', async () => {
  const { admin, person, close } = await boot();
  try {
    const a = await person('fa@example.test', 'A-101', 'owner');
    assert.equal((await a('GET', '/api/me')).body.features.parking, true);
    assert.ok((await a('GET', '/api/me')).body.permissions.includes('parking.view'));
    assert.equal((await admin('PUT', '/api/admin/settings', { features: { parking: false } })).status, 200);
    assert.equal((await a('GET', '/api/me')).body.features.parking, false);
    for (const [m, u, bd] of [['GET', '/api/vehicles'], ['POST', '/api/vehicles', { plate: 'MH12AB1234', type: 'car' }], ['GET', '/api/parking'], ['DELETE', '/api/vehicles/1']]) {
      const r = await a(m, u, bd);
      assert.equal(r.status, 403, u);
      assert.deepEqual(r.body, { error: 'This feature is turned off' });
    }
    assert.equal((await admin('GET', '/api/parking')).status, 200);
    assert.equal((await admin('GET', '/api/vehicles')).status, 200);
    assert.equal((await admin('PUT', '/api/admin/settings', { features: { bogus: true } })).status, 400);
  } finally { close(); }
});

test('existing databases get new permission rows without losing edits', async () => {
  const { openDb } = require('../db');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-mig-'));
  const file = path.join(dir, 'm.db');
  try {
    let db = openDb(file);
    db.exec("DELETE FROM role_permissions WHERE permission IN ('vehicle.manage','parking.view')");
    db.prepare("UPDATE role_permissions SET allowed=0 WHERE role='owner' AND permission='gate.pass'").run();
    db.close();
    db = openDb(file);
    const get = (r, k) => db.prepare('SELECT allowed FROM role_permissions WHERE role=? AND permission=?').get(r, k).allowed;
    assert.equal(get('owner', 'vehicle.manage'), 1);
    assert.equal(get('tenant', 'vehicle.manage'), 1);
    assert.equal(get('family', 'vehicle.manage'), 0);
    assert.equal(get('family', 'parking.view'), 1);
    assert.equal(get('owner', 'gate.pass'), 0); // edit preserved
    db.close();
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});
