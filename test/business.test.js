// Neighbourhood business directory (docs/business-api.md): submit, committee moderation (approve, reject with a reason,
// take down), owner edits go back for review, browse with category and search, one editable 1-5 star rating per
// resident with the average, phones shown on live listings, notifications, audit, other roles refused. Synthetic data only.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-biz-'));
  const app = createApp({ dbFile: path.join(dir, 'b.db'), uploadDir: path.join(dir, 'up'), noTimers: true, clock: () => NOW });
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
  const resident = async (email, flat) => {
    const c = client();
    assert.equal((await client()('POST', '/api/register', { name: email.split('@')[0], email, flat, resident_type: 'owner', password: PW, consent: true })).status, 201);
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
const list = async (c, qs = '') => (await c('GET', '/api/business' + qs)).body;
const BIZ = { name: 'Asha Tiffins', category: 'food', description: 'Home-cooked lunch boxes, delivered by noon', phone: '98000 11111', hours: 'Mon-Sat 11:00-14:00', run_by_resident: true };

test('business directory: submit, moderation, browse with filter and search, phones on live listings', async () => {
  const t = await boot();
  try {
    const owner = await t.resident('owner@x.test', 'A-1');
    const other = await t.resident('other@x.test', 'B-2');

    // validation
    assert.equal((await owner('POST', '/api/business', { ...BIZ, name: '' })).status, 400, 'name needed');
    assert.equal((await owner('POST', '/api/business', { ...BIZ, category: 'weapons' })).status, 400, 'category from the list');
    assert.equal((await owner('POST', '/api/business', { ...BIZ, phone: 'call me' })).status, 400, 'phone needed');
    assert.equal((await owner('POST', '/api/business', { ...BIZ, website: 'javascript:alert(1)' })).status, 400, 'only http(s) websites');
    assert.deepEqual((await owner('GET', '/api/business/categories')).body, ['food', 'tutoring', 'tailoring', 'beauty', 'repairs', 'home services', 'health', 'other']);

    const a = await owner('POST', '/api/business', BIZ);
    assert.equal(a.status, 201); assert.equal(a.body.status, 'pending');
    assert.equal((await owner('POST', '/api/business', BIZ)).status, 409, 'same name twice');
    const tutor = (await other('POST', '/api/business', { name: 'Maths with Ravi', category: 'tutoring', description: 'Class 6 to 10 maths', phone: '+91 98000 22222', hours: 'Evenings', website: 'https://example.test/ravi' })).body.id;
    assert.ok((await notes(t.admin)).some(m => /New business listing to review: Asha Tiffins \(food\), from Flat A-1/.test(m)), 'committee told');

    // pending: hidden from others, visible to the owner and the committee
    assert.equal((await list(other)).some(b => b.id === a.body.id), false);
    const own = (await list(owner)).find(b => b.id === a.body.id);
    assert.equal(own.status, 'pending'); assert.equal(own.mine, true); assert.equal(own.run_by_resident, true); assert.equal(own.phone, '98000 11111');
    assert.equal((await list(t.admin)).filter(b => b.status === 'pending').length, 2);

    // only the committee moderates; reject needs a reason
    assert.equal((await owner('POST', `/api/business/${a.body.id}/decide`, { decision: 'approve' })).status, 403);
    assert.equal((await t.admin('POST', `/api/business/${tutor}/decide`, { decision: 'reject' })).status, 400, 'reason needed');
    assert.equal((await t.admin('POST', `/api/business/${tutor}/decide`, { decision: 'reject', reason: 'Add the area you cover' })).status, 200);
    assert.ok((await notes(other)).some(m => /"Maths with Ravi" was not approved: Add the area you cover/.test(m)));
    assert.equal((await t.admin('POST', `/api/business/${a.body.id}/decide`, { decision: 'approve' })).status, 200);
    assert.equal((await t.admin('POST', `/api/business/${a.body.id}/decide`, { decision: 'approve' })).status, 409, 'already decided');
    assert.ok((await notes(owner)).some(m => /"Asha Tiffins" is live in the directory/.test(m)));

    // the rejected owner sees the reason, edits, and it goes back for review; then it is approved
    const rej = (await list(other)).find(b => b.id === tutor);
    assert.equal(rej.status, 'rejected'); assert.equal(rej.reason, 'Add the area you cover');
    assert.equal((await owner('PUT', `/api/business/${tutor}`, { name: 'X', category: 'food', description: 'x', phone: '9800000000', hours: 'x' })).status, 404, 'not your listing');
    assert.equal((await other('PUT', `/api/business/${tutor}`, { name: 'Maths with Ravi', category: 'tutoring', description: 'Class 6 to 10 maths, Baner and Aundh', phone: '+91 98000 22222', hours: 'Evenings' })).body.status, 'pending');
    assert.equal((await t.admin('POST', `/api/business/${tutor}/decide`, { decision: 'approve' })).status, 200);

    // browse: phones on live listings, category filter, search (LIKE wildcards are literal)
    const live = await list(other);
    assert.deepEqual(live.map(b => b.name), ['Asha Tiffins', 'Maths with Ravi']);
    assert.equal(live[0].phone, '98000 11111'); assert.equal(live[0].reason, null); assert.deepEqual(live[0].listed_by, { name: 'owner', flat: 'A-1' });
    assert.deepEqual((await list(other, '?category=tutoring')).map(b => b.name), ['Maths with Ravi']);
    assert.deepEqual((await list(other, '?q=lunch')).map(b => b.name), ['Asha Tiffins']);
    assert.deepEqual((await list(other, '?q=aundh&category=tutoring')).map(b => b.name), ['Maths with Ravi']);
    assert.deepEqual(await list(other, '?q=%25'), [], 'a % is searched for, not a wildcard');

    // an owner edit of a live listing goes back for review (hidden again from others)
    assert.equal((await owner('PUT', `/api/business/${a.body.id}`, { ...BIZ, hours: 'Mon-Fri 11:00-14:00' })).status, 200);
    assert.equal((await list(other)).some(b => b.id === a.body.id), false);
    assert.equal((await t.admin('POST', `/api/business/${a.body.id}/decide`, { decision: 'approve' })).status, 200);

    // committee takes a live listing down with a reason; the owner is told and cannot edit it back
    assert.equal((await t.admin('POST', `/api/business/${tutor}/remove`, {})).status, 400, 'reason needed');
    assert.equal((await t.admin('POST', `/api/business/${tutor}/remove`, { reason: 'Complaints from residents' })).status, 200);
    assert.ok((await notes(other)).some(m => /took down your business listing "Maths with Ravi": Complaints from residents/.test(m)));
    assert.equal((await list(owner)).some(b => b.id === tutor), false);
    assert.equal((await other('PUT', `/api/business/${tutor}`, { name: 'Maths with Ravi', category: 'tutoring', description: 'x', phone: '9800000000', hours: 'x' })).status, 409);
    assert.equal((await t.admin('POST', `/api/business/${tutor}/remove`, { reason: 'again' })).status, 409);

    // the owner withdraws their own listing
    assert.equal((await other('DELETE', `/api/business/${a.body.id}`)).status, 404, 'not yours');
    assert.equal((await owner('DELETE', `/api/business/${a.body.id}`)).status, 200);
    assert.equal((await list(owner)).some(b => b.id === a.body.id), false);
    assert.equal((await list(t.admin, '?status=all')).find(b => b.id === a.body.id).status, 'withdrawn');

    const audit = (await t.admin('GET', '/api/admin/audit')).body.filter(x => x.entity === 'business');
    for (const act of ['submitted', 'approved', 'rejected', 'edited', 'removed', 'withdrawn']) assert.ok(audit.some(x => x.action === act), 'audited: ' + act);
  } finally { t.close(); }
});

test('business directory: one editable rating per resident, average shown; other roles refused', async () => {
  const t = await boot();
  try {
    const owner = await t.resident('o2@x.test', 'C-3');
    const r1 = await t.resident('r1@x.test', 'D-4');
    const r2 = await t.resident('r2@x.test', 'E-5');
    const id = (await owner('POST', '/api/business', { ...BIZ, name: 'Stitch Point', category: 'tailoring', run_by_resident: false })).body.id;
    assert.equal((await r1('PUT', `/api/business/${id}/review`, { stars: 5 })).status, 404, 'not live yet');
    await t.admin('POST', `/api/business/${id}/decide`, { decision: 'approve' });
    assert.equal((await owner('PUT', `/api/business/${id}/review`, { stars: 5 })).status, 409, 'own listing');
    assert.equal((await r1('PUT', `/api/business/${id}/review`, { stars: 6 })).status, 400);
    assert.equal((await r1('PUT', `/api/business/${id}/review`, { stars: 2.5 })).status, 400);
    assert.equal((await r1('PUT', `/api/business/${id}/review`, { stars: 4, review: 'Neat work' })).status, 200);
    const r = await r2('PUT', `/api/business/${id}/review`, { stars: 1 });
    assert.deepEqual(r.body.rating, { count: 2, average: 2.5 });
    assert.equal((await r2('PUT', `/api/business/${id}/review`, { stars: 3, review: 'Better the second time' })).status, 200, 'editable');
    const seen = (await list(r2)).find(b => b.id === id);
    assert.deepEqual(seen.rating, { count: 2, average: 3.5 }, 'one rating per resident');
    assert.deepEqual(seen.my_review, { stars: 3, review: 'Better the second time' });
    assert.equal(seen.run_by_resident, false);
    assert.deepEqual(seen.reviews.map(x => x.stars).sort(), [3, 4]);
    assert.ok((await t.admin('GET', '/api/admin/audit')).body.some(x => x.entity === 'business_review' && x.action === 'review_edited'));
    assert.equal((await t.admin('POST', '/api/business', BIZ)).status, 403, 'only residents list businesses');
    assert.equal((await t.admin('PUT', `/api/business/${id}/review`, { stars: 5 })).status, 403);
    for (const kind of ['guard', 'cleaner', 'shop']) {
      const c = await t.account(kind, `${kind}@x.test`);
      assert.equal((await c('GET', '/api/business')).status, 403, kind);
    }
  } finally { t.close(); }
});
