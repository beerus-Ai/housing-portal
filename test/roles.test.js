// Roles from the faculty review (2026-11-21): docs/roles-api.md, docs/user-stories.md.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';
const PNG = Buffer.from('89504e470d0a1a0a0000000d4948445200000001000000010806000000', 'hex');

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-roles-'));
  const app = createApp({ dbFile: path.join(dir, 'r.db'), uploadDir: path.join(dir, 'up'), noTimers: true });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const client = () => {
    let cookie = '';
    const c = async (method, url, body) => {
      const headers = { cookie };
      let payload;
      if (body instanceof FormData) payload = body;
      else if (body) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
      const res = await fetch(base + url, { method, headers, body: payload });
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      const type = res.headers.get('content-type') || '';
      if (!type.includes('json')) return { status: res.status, body: Buffer.from(await res.arrayBuffer()), headers: res.headers };
      return { status: res.status, body: await res.json() };
    };
    return c;
  };
  const admin = client();
  assert.equal((await admin('POST', '/api/login', ADMIN)).status, 200);
  const account = async (kind, email) => {
    const r = await admin('POST', '/api/admin/accounts', { name: kind + ' ' + email.split('@')[0], email, password: PW, kind });
    assert.equal(r.status, 201, JSON.stringify(r.body));
    const c = client();
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    c.id = r.body.id;
    return c;
  };
  const resident = async (email, flat, type = 'owner') => {
    const c = client();
    assert.equal((await client()('POST', '/api/register', { name: email.split('@')[0], email, flat, resident_type: type, password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    assert.equal((await admin('POST', `/api/admin/users/${p.id}/approve`)).status, 200);
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    c.id = p.id;
    return c;
  };
  const request = async (who, title = 'Bathroom tap leaking') => {
    const fd = new FormData(); fd.append('category', 'plumbing'); fd.append('title', title); fd.append('description', 'Water on the floor');
    const r = await who('POST', '/api/requests', fd);
    assert.equal(r.status, 201);
    return r.body.id;
  };
  const close = () => { server.close(); try { app.locals.db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); };
  return { app, admin, client, account, resident, request, close };
}

test('accounts: positions, governance limits, last governance account kept', async () => {
  const t = await boot();
  try {
    const me = await t.admin('GET', '/api/me');
    assert.equal(me.body.position, 'sysadmin'); // older committee accounts are treated as admin
    const member = await t.account('member', 'm@society.test');
    const head = await t.account('head', 'h@society.test');
    assert.equal((await member('GET', '/api/me')).body.position, 'member');
    assert.equal((await head('GET', '/api/me')).body.position, 'head');
    // a committee member keeps daily work but cannot change settings, access rules or accounts
    assert.equal((await member('GET', '/api/admin/stats')).status, 200);
    for (const [m, u, b] of [['PUT', '/api/admin/settings', { society_name: 'X' }], ['PUT', '/api/admin/access', { matrix: {} }], ['GET', '/api/admin/accounts'],
      ['POST', '/api/admin/accounts', { kind: 'staff' }], ['POST', '/api/admin/guards', { name: 'G' }]]) {
      const r = await member(m, u, b);
      assert.equal(r.status, 403, m + ' ' + u);
      assert.equal(r.body.error, 'Only the head of committee or the admin can do this');
    }
    assert.equal((await head('PUT', '/api/admin/settings', { approval_limit: 5000 })).body.approval_limit, 5000);
    assert.equal((await t.admin('POST', '/api/admin/accounts', { name: 'x', email: 'bad', password: PW, kind: 'staff' })).status, 400);
    assert.equal((await t.admin('POST', '/api/admin/accounts', { name: 'x', email: 'x@y.z', password: PW, kind: 'owner' })).status, 400);
    assert.equal((await t.admin('POST', '/api/admin/accounts', { name: 'x', email: 'm@society.test', password: PW, kind: 'staff' })).status, 409);
    const list = (await head('GET', '/api/admin/accounts')).body;
    assert.ok(list.some(a => a.email === 'm@society.test' && a.position === 'member'));
    // promote/demote, self-protection, keep one governance account
    assert.equal((await head('PATCH', `/api/admin/accounts/${member.id}`, { position: 'head' })).body.position, 'head');
    assert.equal((await head('PATCH', `/api/admin/accounts/${member.id}`, { position: 'member' })).body.position, 'member');
    assert.equal((await head('PATCH', `/api/admin/accounts/${head.id}`, { status: 'suspended' })).status, 409);
    const sys = (await t.admin('GET', '/api/me')).body.id;
    assert.equal((await head('DELETE', `/api/admin/accounts/${sys}`)).status, 200); // head remains
    assert.equal((await t.admin('GET', '/api/me')).status, 401);
    const other = (await head('GET', '/api/admin/accounts')).body.filter(a => ['head', 'sysadmin'].includes(a.position));
    assert.equal(other.length, 1);
    // residents never appear in accounts, staff/IT never appear in the resident list
    const st = (await head('POST', '/api/admin/accounts', { name: 'S', email: 's@society.test', password: PW, kind: 'staff' })).body.id;
    assert.ok(st);
    assert.ok(!(await head('GET', '/api/admin/users')).body.some(u => u.email === 's@society.test'));
    // an approve/reject call cannot touch staff accounts
    assert.equal((await head('POST', `/api/admin/users/${st}/reject`)).status, 404);
  } finally { t.close(); }
});

test('staff: allow-list, assignment, take up, updates with photo, done, committee closes', async () => {
  const t = await boot();
  try {
    const staff = await t.account('staff', 'staff@society.test');
    const owner = await t.resident('o@x.test', 'A-1');
    const id = await t.request(owner);
    const other = await t.request(owner, 'Not for staff');
    // staff cannot see committee or resident routes, nor unassigned requests
    for (const [m, u] of [['GET', '/api/admin/stats'], ['GET', '/api/notices'], ['GET', '/api/household'], ['POST', '/api/requests'], ['PATCH', '/api/me'], ['GET', '/api/it/health']])
      assert.equal((await staff(m, u)).status, 403, m + ' ' + u);
    assert.equal((await staff('GET', `/api/requests/${id}`)).status, 404);
    assert.deepEqual((await staff('GET', '/api/requests')).body, []);
    // committee assigns to staff
    const roster = (await t.admin('GET', '/api/admin/staff')).body;
    assert.equal(roster[0].id, staff.id);
    assert.equal((await t.admin('POST', `/api/requests/${id}/assign`, { staff_id: 999 })).status, 404);
    assert.equal((await t.admin('POST', `/api/requests/${id}/assign`, { staff_id: staff.id })).status, 200);
    let r = (await owner('GET', `/api/requests/${id}`)).body;
    assert.equal(r.status, 'assigned'); assert.equal(r.assignee_name, 'staff staff');
    const jobs = (await staff('GET', '/api/staff/jobs')).body;
    assert.deepEqual(jobs.open.map(j => j.id), [id]);
    assert.equal((await staff('GET', `/api/requests/${other}`)).status, 404);
    assert.equal((await staff('POST', `/api/staff/jobs/${other}/accept`)).status, 404);
    // take up -> in progress, resident notified
    assert.equal((await staff('POST', `/api/staff/jobs/${id}/accept`)).body.status, 'in_progress');
    assert.equal((await staff('POST', `/api/staff/jobs/${id}/accept`)).status, 409);
    assert.ok((await owner('GET', '/api/notifications')).body.some(n => /taken up/.test(n.message)));
    // progress update with photo; bad progress rejected
    assert.equal((await staff('POST', `/api/staff/jobs/${id}/update`, { progress: 'fixed' })).status, 400);
    const fd = new FormData(); fd.append('progress', 'waiting_parts'); fd.append('note', 'Need a new washer'); fd.append('photo', new Blob([PNG], { type: 'image/png' }), 'p.png');
    assert.equal((await staff('POST', `/api/staff/jobs/${id}/update`, fd)).status, 201);
    const ups = (await owner('GET', `/api/requests/${id}/updates`)).body;
    assert.equal(ups[0].label, 'Waiting for parts'); assert.equal(ups[0].has_photo, true);
    const ph = await owner('GET', `/api/requests/${id}/updates/${ups[0].id}/photo`);
    assert.equal(ph.status, 200);
    assert.ok((await owner('GET', `/api/requests/${id}/comments`)).body.some(c => c.body.includes('Need a new washer')));
    assert.equal((await staff('POST', `/api/staff/jobs/${id}/update`, { progress: 'done', note: 'Replaced washer' })).status, 201);
    assert.ok((await staff('GET', `/api/requests/${id}`)).body.work_done_at);
    assert.ok((await t.admin('GET', '/api/notifications')).body.some(n => /please confirm and close/.test(n.message)));
    // the committee closes; staff may not change status
    assert.equal((await staff('POST', `/api/requests/${id}/status`, { status: 'closed' })).status, 403);
    assert.equal((await t.admin('POST', `/api/requests/${id}/status`, { status: 'closed' })).status, 200);
    assert.deepEqual((await staff('GET', '/api/staff/jobs')).body.recent.map(j => j.id), [id]);
    assert.equal((await staff('POST', `/api/staff/jobs/${id}/update`, { progress: 'done' })).status, 409);
    // a request with no vendor and no staff still cannot move
    assert.equal((await t.admin('POST', `/api/requests/${other}/status`, { status: 'in_progress' })).body.error, 'Assign a vendor or staff member first');
  } finally { t.close(); }
});

test('shifts: punch in/out, hand-over moves open jobs, attendance', async () => {
  const t = await boot();
  try {
    const a = await t.account('staff', 'a@society.test');
    const b = await t.account('staff', 'b@society.test');
    const owner = await t.resident('o@x.test', 'A-1');
    const j1 = await t.request(owner, 'Job one'), j2 = await t.request(owner, 'Job two');
    for (const j of [j1, j2]) await t.admin('POST', `/api/requests/${j}/assign`, { staff_id: a.id });
    assert.equal((await a('POST', '/api/staff/punch-out')).status, 409);
    assert.equal((await a('POST', '/api/staff/punch-in')).status, 201);
    assert.equal((await a('POST', '/api/staff/punch-in')).status, 409);
    const sh = (await a('GET', '/api/staff/shift')).body;
    assert.ok(sh.current); assert.deepEqual(sh.colleagues.map(c => c.id), [b.id]);
    assert.ok((await t.admin('GET', '/api/admin/staff')).body.find(s => s.id === a.id).on_shift);
    assert.equal((await a('POST', '/api/staff/punch-out', { handover_to: a.id })).status, 400);
    const out = await a('POST', '/api/staff/punch-out', { handover_to: b.id, note: 'Washer is in the store room' });
    assert.equal(out.body.handed_over, 2);
    assert.deepEqual((await b('GET', '/api/staff/jobs')).body.open.map(j => j.id).sort(), [j1, j2].sort());
    assert.deepEqual((await a('GET', '/api/staff/jobs')).body.open, []);
    assert.ok((await b('GET', '/api/notifications')).body.some(n => /handed over 2 job/.test(n.message)));
    const att = (await t.admin('GET', '/api/admin/attendance')).body;
    assert.equal(att[0].handover_to_name, 'staff b'); assert.ok(att[0].punch_out);
    assert.ok((await t.admin('GET', `/api/requests/${j1}`)).body.history.some(h => h.action === 'handed_over'));
  } finally { t.close(); }
});

test('cost approval: over the limit waits for the head; members cannot decide', async () => {
  const t = await boot();
  try {
    const head = await t.account('head', 'h@society.test');
    const member = await t.account('member', 'm@society.test');
    const staff = await t.account('staff', 's@society.test');
    const owner = await t.resident('o@x.test', 'A-1');
    const id = await t.request(owner);
    await t.admin('POST', `/api/requests/${id}/assign`, { staff_id: staff.id });
    assert.equal((await staff('POST', `/api/requests/${id}/estimate`, { amount: 'abc' })).status, 400);
    assert.equal((await staff('POST', `/api/requests/${id}/estimate`, { amount: 500 })).body.cost_status, 'approved'); // within default limit 10000
    assert.equal((await staff('POST', `/api/requests/${id}/estimate`, { amount: 25000, note: 'New pump' })).body.cost_status, 'pending');
    assert.ok((await head('GET', '/api/notifications')).body.some(n => /Cost approval needed/.test(n.message)));
    // work cannot start while waiting
    assert.equal((await staff('POST', `/api/staff/jobs/${id}/accept`)).body.status, 'assigned');
    assert.equal((await t.admin('POST', `/api/requests/${id}/status`, { status: 'in_progress' })).body.error, 'Waiting for the head of committee to approve the cost');
    const ap = (await member('GET', '/api/admin/approvals')).body;
    assert.equal(ap.can_decide, false); assert.equal(ap.pending[0].id, id);
    assert.equal((await member('POST', `/api/requests/${id}/cost-decision`, { decision: 'approve' })).status, 403);
    assert.equal((await t.admin('POST', `/api/requests/${id}/cost-decision`, { decision: 'approve' })).status, 403); // a head exists, so the admin cannot decide
    assert.equal((await head('POST', `/api/requests/${id}/cost-decision`, { decision: 'maybe' })).status, 400);
    assert.equal((await head('POST', `/api/requests/${id}/cost-decision`, { decision: 'approve', note: 'OK' })).status, 200);
    assert.equal((await head('POST', `/api/requests/${id}/cost-decision`, { decision: 'approve' })).status, 409);
    assert.ok((await staff('GET', '/api/notifications')).body.some(n => /was approved/.test(n.message)));
    assert.equal((await t.admin('POST', `/api/requests/${id}/status`, { status: 'in_progress' })).status, 200);
    // with no head account, the admin decides
    await head('POST', '/api/logout');
    const t2 = await boot();
    try {
      const o2 = await t2.resident('o@x.test', 'A-1');
      const i2 = await t2.request(o2);
      await t2.admin('POST', `/api/requests/${i2}/estimate`, { amount: 99999 });
      assert.equal((await t2.admin('GET', '/api/admin/approvals')).body.can_decide, true);
      assert.equal((await t2.admin('POST', `/api/requests/${i2}/cost-decision`, { decision: 'reject' })).status, 200);
      assert.equal((await t2.admin('GET', `/api/requests/${i2}`)).body.cost_status, 'rejected');
    } finally { t2.close(); }
  } finally { t.close(); }
});

test('reopen: requester or owner within the window; rating cleared; others refused', async () => {
  const t = await boot();
  try {
    const owner = await t.resident('o@x.test', 'A-1');
    const tenant = await t.resident('t@x.test', 'B-2', 'tenant');
    const vend = (await t.admin('POST', '/api/vendors', { name: 'AquaFix', trade: 'plumbing', phone: '1' })).body.id;
    const id = await t.request(owner);
    assert.equal((await owner('POST', `/api/requests/${id}/reopen`, { reason: 'x' })).status, 409); // not closed yet
    await t.admin('POST', `/api/requests/${id}/assign`, { vendor_id: vend });
    await t.admin('POST', `/api/requests/${id}/status`, { status: 'closed' });
    assert.equal((await owner('POST', `/api/requests/${id}/rate`, { rating: 2 })).status, 200);
    assert.equal((await owner('GET', `/api/requests/${id}`)).body.can_reopen, true);
    assert.equal((await tenant('POST', `/api/requests/${id}/reopen`, { reason: 'x' })).status, 404);
    assert.equal((await t.admin('POST', `/api/requests/${id}/reopen`, { reason: 'x' })).status, 403);
    assert.equal((await owner('POST', `/api/requests/${id}/reopen`, {})).status, 400);
    const r = await owner('POST', `/api/requests/${id}/reopen`, { reason: 'Still dripping' });
    assert.equal(r.body.status, 'assigned');
    const d = (await owner('GET', `/api/requests/${id}`)).body;
    assert.equal(d.rating, null); assert.equal(d.reopen_count, 1); assert.equal(d.can_reopen, false);
    assert.ok((await t.admin('GET', '/api/notifications')).body.some(n => /Reopened/.test(n.message)));
    // outside the window: close again and age the closing date
    await t.admin('POST', `/api/requests/${id}/status`, { status: 'closed' });
    t.app.locals.db.prepare("UPDATE requests SET closed_at=datetime('now','-8 days') WHERE id=?").run(id);
    assert.equal((await owner('POST', `/api/requests/${id}/reopen`, { reason: 'again' })).status, 403);
  } finally { t.close(); }
});

test('monthly report: counts, by assignee, committee activity', async () => {
  const t = await boot();
  try {
    const member = await t.account('member', 'm@society.test');
    const staff = await t.account('staff', 's@society.test');
    const owner = await t.resident('o@x.test', 'A-1');
    const id = await t.request(owner);
    await t.request(owner, 'Second');
    await member('POST', `/api/requests/${id}/assign`, { staff_id: staff.id });
    await member('POST', `/api/requests/${id}/status`, { status: 'closed' });
    await owner('POST', `/api/requests/${id}/rate`, { rating: 4 });
    const rep = (await member('GET', '/api/admin/reports/monthly')).body;
    assert.equal(rep.raised, 2); assert.equal(rep.closed, 1); assert.equal(rep.open_now, 1); assert.equal(rep.avg_rating, 4);
    assert.deepEqual(rep.by_assignee, [{ name: 'staff s', kind: 'staff', closed: 1, avg_rating: 4 }]);
    const m = rep.committee.find(c => c.id === member.id);
    assert.equal(m.assigned, 1); assert.equal(m.status_changes, 1); assert.equal(m.position, 'member');
    assert.equal((await member('GET', '/api/admin/reports/monthly?month=2001-01')).body.raised, 0);
    assert.equal((await owner('GET', '/api/admin/reports/monthly')).status, 403);
  } finally { t.close(); }
});

test('IT: support tickets, guides per role, health, backup, maintenance notice', async () => {
  const t = await boot();
  try {
    const it = await t.account('it', 'it@society.test');
    const guard = await t.account('guard', 'g@society.test');
    const owner = await t.resident('o@x.test', 'A-1');
    const other = await t.resident('p@x.test', 'A-2');
    // anyone, including a guard, can raise a ticket
    assert.equal((await owner('POST', '/api/support', { subject: '', body: 'x' })).status, 400);
    const tk = (await owner('POST', '/api/support', { subject: 'Cannot upload photo', body: 'It spins forever', kind: 'bug' })).body.id;
    assert.equal((await guard('POST', '/api/support', { subject: 'Scanner', body: 'Camera blocked' })).status, 201);
    assert.ok((await it('GET', '/api/notifications')).body.some(n => /New support ticket/.test(n.message)));
    assert.equal((await owner('GET', '/api/support')).body.length, 1);
    assert.equal((await it('GET', '/api/support')).body.length, 2);
    assert.equal((await other('GET', `/api/support/${tk}`)).status, 404);
    assert.equal((await owner('POST', `/api/support/${tk}/reply`, { body: 'x', status: 'resolved' })).status, 400); // only IT sets status
    assert.equal((await it('POST', `/api/support/${tk}/reply`, { body: 'Fixed in the new version', status: 'resolved' })).body.status, 'resolved');
    assert.ok((await owner('GET', '/api/notifications')).body.some(n => /IT replied/.test(n.message)));
    assert.equal((await owner('POST', `/api/support/${tk}/reply`, { body: 'Still broken' })).body.status, 'open'); // requester reply reopens
    assert.equal((await owner('GET', `/api/support/${tk}`)).body.replies.length, 2);
    // guides filtered by role
    const og = (await owner('GET', '/api/help/guides')).body.map(g => g.id);
    assert.ok(og.includes('resident-request') && !og.includes('staff-jobs') && !og.includes('it'));
    assert.ok((await guard('GET', '/api/help/guides')).body.some(g => g.id === 'guard'));
    assert.ok((await it('GET', '/api/help/guides')).body.length >= 10);
    // IT tools: residents and committee members refused; IT and the admin allowed
    assert.equal((await owner('GET', '/api/it/health')).status, 403);
    assert.equal((await it('GET', '/api/admin/stats')).status, 403);
    const h = (await it('GET', '/api/it/health')).body;
    assert.equal(h.integrity, 'ok'); assert.ok(h.db_bytes > 0); assert.ok(h.counts.users >= 4);
    const bk = await it('GET', '/api/it/backup');
    assert.equal(bk.status, 200);
    assert.equal(bk.body.subarray(0, 15).toString('latin1'), 'SQLite format 3');
    assert.equal((await t.admin('GET', '/api/it/health')).status, 200);
    assert.equal((await it('PUT', '/api/it/maintenance', { message: 'Upgrade on Sunday 10pm', until: '23:00' })).body.maintenance.message, 'Upgrade on Sunday 10pm');
    assert.equal((await t.client()('GET', '/api/settings')).body.maintenance.until, '23:00');
    assert.ok((await owner('GET', '/api/notifications')).body.some(n => /Planned maintenance/.test(n.message)));
    assert.equal((await it('PUT', '/api/it/maintenance', { message: '' })).body.maintenance, null);
    assert.ok((await t.admin('GET', '/api/admin/audit')).body.some(a => a.action === 'backup'));
  } finally { t.close(); }
});

test('broadcast: a notice also goes to residents who linked Telegram', async () => {
  const t = await boot();
  try {
    const owner = await t.resident('o@x.test', 'A-1');
    await t.resident('p@x.test', 'A-2');
    t.app.locals.db.prepare("UPDATE users SET telegram_id='555' WHERE id=?").run(owner.id);
    const r = await t.admin('POST', '/api/notices', { title: 'Water cut', body: 'No water 10am to 1pm on Sunday' });
    assert.equal(r.status, 201); assert.equal(r.body.telegram_sent, 1);
    const out = t.app.locals.db.prepare("SELECT * FROM whatsapp_messages WHERE channel='telegram' AND direction='out'").all();
    assert.equal(out.length, 1); assert.equal(out[0].phone, '555'); assert.match(out[0].body, /Water cut/);
  } finally { t.close(); }
});
