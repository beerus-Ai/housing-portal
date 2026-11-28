// Charts endpoint (docs/charts-api.md): committee only; full week, month and day buckets; counts match the data.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';

test('charts: committee only; buckets are complete; raised, resolved, categories and gate taps add up', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-ch-'));
  const app = createApp({ dbFile: path.join(dir, 'c.db'), uploadDir: path.join(dir, 'up'), noTimers: true });
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
    const res = client();
    assert.equal((await client()('POST', '/api/register', { name: 'Owner', email: 'o@x.test', flat: 'A-1', resident_type: 'owner', password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === 'o@x.test');
    await admin('POST', `/api/admin/users/${p.id}/approve`);
    await res('POST', '/api/login', { email: 'o@x.test', password: PW });
    assert.equal((await res('GET', '/api/admin/charts')).status, 403, 'residents cannot');

    // three requests (two plumbing, one lift); resolve one
    const ids = [];
    for (const [category, title] of [['plumbing', 'Tap'], ['plumbing', 'Pipe'], ['lift', 'Lift stuck']]) ids.push((await res('POST', '/api/requests', { category, title, description: 'x' })).body.id);
    const vendor = (await admin('POST', '/api/vendors', { name: 'Fixit', trade: 'plumbing' })).body.id;
    await admin('POST', `/api/requests/${ids[0]}/assign`, { vendor_id: vendor });
    await admin('POST', `/api/requests/${ids[0]}/status`, { status: 'in_progress' });
    assert.equal((await admin('POST', `/api/requests/${ids[0]}/status`, { status: 'closed' })).status, 200);

    const d = (await admin('GET', '/api/admin/charts')).body;
    assert.equal(d.requests_weekly.length, 12); assert.equal(d.sla_weekly.length, 12); assert.equal(d.dues_monthly.length, 6); assert.equal(d.gate_daily.length, 14);
    const thisWeek = d.requests_weekly[11];
    assert.equal(thisWeek.raised, 3); assert.equal(thisWeek.resolved, 1);
    assert.equal(d.sla_weekly[11].pct, 100, 'resolved within the SLA');
    assert.deepEqual(d.open_by_category, [{ category: 'lift', n: 1 }, { category: 'plumbing', n: 1 }].sort((a, b) => b.n - a.n || a.category.localeCompare(b.category)));
    assert.ok(d.requests_weekly.every((w, i, a) => i === 0 || Date.parse(w.week) - Date.parse(a[i - 1].week) === 7 * 864e5), 'consecutive Mondays');
    assert.equal(new Date(d.requests_weekly[0].week + 'T00:00:00Z').getUTCDay(), 1, 'weeks start on Monday');
    assert.equal((await admin('GET', '/api/admin/charts?weeks=8')).body.requests_weekly.length, 8);
    assert.equal(d.sla_hours, 48);
  } finally { server.close(); }
});
