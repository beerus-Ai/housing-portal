// Sound cues on /api/pulse: the committee hears new requests; the committee and guards hear active emergencies.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';

test('pulse carries sound cues: newest request for the committee, active emergency for committee and guards', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-sound-'));
  const app = createApp({ dbFile: path.join(dir, 's.db'), uploadDir: path.join(dir, 'up'), noTimers: true });
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
    assert.equal((await admin('POST', '/api/admin/accounts', { name: 'Guard one', email: 'g@x.test', password: PW, kind: 'guard' })).status, 201);
    const guard = client(); assert.equal((await guard('POST', '/api/login', { email: 'g@x.test', password: PW })).status, 200);
    assert.equal((await client()('POST', '/api/register', { name: 'Asha', email: 'a@x.test', flat: 'A-1', resident_type: 'owner', password: PW, consent: true })).status, 201);
    const pend = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === 'a@x.test');
    await admin('POST', `/api/admin/users/${pend.id}/approve`);
    const res = client(); assert.equal((await res('POST', '/api/login', { email: 'a@x.test', password: PW })).status, 200);

    const a0 = (await admin('GET', '/api/pulse')).body.a;
    assert.deepEqual(a0, { rq: 0, ru: 0, em: 0, em_on: 0 });
    assert.equal((await res('POST', '/api/requests', { title: 'Tap leaking', description: 'Kitchen tap drips all night', category: 'plumbing' })).status, 201);
    const a1 = (await admin('GET', '/api/pulse')).body.a;
    assert.ok(a1.rq > a0.rq, 'a new request raises rq');
    assert.equal(a1.em_on, 0);
    assert.equal(a1.ru, 0, 'a plumbing request is not urgent');
    const e = await res('POST', '/api/emergencies', { type: 'fire', note: 'Smoke in corridor' });
    assert.equal(e.status, 201, JSON.stringify(e.body));
    const a2 = (await admin('GET', '/api/pulse')).body.a;
    assert.ok(a2.em > 0 && a2.em_on === 1, 'an active emergency is reported');
    const ga = (await guard('GET', '/api/pulse')).body.a;
    assert.equal(ga.em_on, 1, 'guards hear emergencies');
    assert.equal(ga.rq, 0, 'guards are not told about requests');
    assert.equal((await res('GET', '/api/pulse')).body.a.em_on, 0, 'residents get no alarm cues');
  } finally { server.close(); }
});
