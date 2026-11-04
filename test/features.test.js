const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-feat-'));
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
  return { admin, client, person, close };
}

test('emergency: raise notifies admin, validation, visibility, resolve', async () => {
  const { admin, client, person, close } = await boot();
  try {
    const a = await person('ra@example.test', 'B-101', 'owner');
    const b = await person('rb@example.test', 'C-202', 'owner');
    assert.equal((await client()('POST', '/api/emergencies', { type: 'fire' })).status, 401);
    assert.equal((await client()('GET', '/api/emergencies')).status, 401);
    assert.equal((await a('POST', '/api/emergencies', { type: 'earthquake' })).status, 400);
    assert.equal((await a('POST', '/api/emergencies', { type: 'fire', note: 'x'.repeat(501) })).status, 400);
    const r = await a('POST', '/api/emergencies', { type: 'fire', note: 'Smoke in kitchen' });
    assert.equal(r.status, 201);
    assert.ok(r.body.id);
    assert.ok((await admin('GET', '/api/notifications')).body.some(n => /EMERGENCY \(Fire\) from flat B-101: Smoke in kitchen/.test(n.message)));
    const r2 = await b('POST', '/api/emergencies', { type: 'lift' });
    assert.equal(r2.status, 201);

    const mine = (await a('GET', '/api/emergencies')).body;
    assert.equal(mine.length, 1);
    assert.equal(mine[0].flat, 'B-101');
    assert.equal(mine[0].status, 'active');
    const all = (await admin('GET', '/api/emergencies')).body;
    assert.equal(all.length, 2);
    assert.equal(all[0].id, r2.body.id); // newest first

    assert.equal((await a('POST', `/api/emergencies/${r.body.id}/resolve`)).status, 403);
    assert.equal((await admin('POST', '/api/emergencies/9999/resolve')).status, 404);
    assert.equal((await admin('POST', `/api/emergencies/${r.body.id}/resolve`)).status, 200);
    assert.equal((await admin('POST', `/api/emergencies/${r.body.id}/resolve`)).status, 409);
    const done = (await a('GET', '/api/emergencies')).body[0];
    assert.equal(done.status, 'resolved');
    assert.ok(done.resolved_at);
    assert.ok((await a('GET', '/api/notifications')).body.some(n => /resolved/.test(n.message)));
    const audit = (await admin('GET', '/api/admin/audit')).body;
    assert.ok(audit.some(x => x.entity === 'emergency' && x.action === 'raised'));
    assert.ok(audit.some(x => x.entity === 'emergency' && x.action === 'resolved'));
  } finally { close(); }
});

test('emergency: rate limit of 5 per user per hour', async () => {
  const { person, close } = await boot();
  try {
    const a = await person('rl@example.test', 'D-1', 'owner');
    for (let i = 0; i < 5; i++) assert.equal((await a('POST', '/api/emergencies', { type: 'other' })).status, 201);
    const r = await a('POST', '/api/emergencies', { type: 'other' });
    assert.equal(r.status, 429);
    assert.match(r.body.error, /5 alerts per hour/);
  } finally { close(); }
});

test('contacts: create, list, delete, validation, roles', async () => {
  const { admin, client, person, close } = await boot();
  try {
    const a = await person('rc@example.test', 'E-5', 'owner');
    assert.equal((await client()('GET', '/api/contacts')).status, 401);
    assert.deepEqual((await a('GET', '/api/contacts')).body, []);
    assert.equal((await a('POST', '/api/contacts', { name: 'Guard', role: 'Security', phone: '+91 98765 43210' })).status, 403);
    assert.equal((await admin('POST', '/api/contacts', { name: 'Guard', role: 'Security', phone: 'abc' })).status, 400);
    assert.equal((await admin('POST', '/api/contacts', { name: 'Guard', role: 'Security', phone: '12' })).status, 400);
    assert.equal((await admin('POST', '/api/contacts', { name: 'Guard', role: 'Security', phone: '1234567', icon: 'bogus' })).status, 400);
    const z = await admin('POST', '/api/contacts', { name: 'Zed Plumber', role: 'Plumber', phone: '+91 98765 43210', icon: 'wrench' });
    assert.equal(z.status, 201);
    const g = await admin('POST', '/api/contacts', { name: 'Anil Guard', role: 'Security', phone: '022-1234567' });
    assert.equal(g.status, 201);
    const list = (await a('GET', '/api/contacts')).body;
    assert.deepEqual(list.map(c => c.name), ['Anil Guard', 'Zed Plumber']);
    assert.equal(list[0].icon, 'phone');
    assert.deepEqual(Object.keys(list[0]).sort(), ['icon', 'id', 'name', 'phone', 'role']);
    assert.equal((await a('DELETE', `/api/contacts/${z.body.id}`)).status, 403);
    assert.equal((await admin('DELETE', `/api/contacts/${z.body.id}`)).status, 200);
    assert.equal((await admin('DELETE', `/api/contacts/${z.body.id}`)).status, 404);
    assert.equal((await a('GET', '/api/contacts')).body.length, 1);
    const audit = (await admin('GET', '/api/admin/audit')).body;
    assert.ok(audit.some(x => x.entity === 'contact' && x.action === 'created'));
    assert.ok(audit.some(x => x.entity === 'contact' && x.action === 'deleted'));
  } finally { close(); }
});
