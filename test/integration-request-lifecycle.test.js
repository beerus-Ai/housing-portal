// Integration: the work-request lifecycle across modules (app.js requests, roles.js staff/cost/reopen/reports,
// modules.js waste, audit, notifications, dashboards). Everything goes through the HTTP API.
// Tests marked { todo } hold the CORRECT expectation for a suspected bug; they run but do not fail the suite.
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
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-life-'));
  const app = createApp({ dbFile: path.join(dir, 'l.db'), uploadDir: path.join(dir, 'up'), noTimers: true });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (method, url, body) => {
      const headers = { cookie };
      let payload;
      if (body instanceof FormData) payload = body;
      else if (body) { headers['content-type'] = 'application/json'; payload = JSON.stringify(body); }
      const res = await fetch(base + url, { method, headers, body: payload });
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      const type = res.headers.get('content-type') || '';
      if (!type.includes('json')) return { status: res.status, body: Buffer.from(await res.arrayBuffer()) };
      return { status: res.status, body: await res.json() };
    };
  };
  const admin = client();
  assert.equal((await admin('POST', '/api/login', ADMIN)).status, 200);
  admin.id = (await admin('GET', '/api/me')).body.id;
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
  const notes = async who => (await who('GET', '/api/notifications')).body.map(n => n.message);
  const has = async (who, re) => (await notes(who)).some(m => re.test(m));
  const close = () => { server.close(); try { app.locals.db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); };
  return { app, admin, client, account, resident, notes, has, close };
}

test('full lifecycle: raise -> triage -> assign staff -> take up -> estimate -> head approves -> done -> close -> rate -> reopen -> reports and audit', async () => {
  const t = await boot();
  try {
    const head = await t.account('head', 'head@x.test');
    const member = await t.account('member', 'mem@x.test');
    const plumber = await t.account('maintenance', 'fix@x.test');
    const owner = await t.resident('own@x.test', 'A-101');
    const other = await t.resident('oth@x.test', 'B-202');

    // Raise without a photo (JSON) and with a photo (multipart).
    const noPhoto = await owner('POST', '/api/requests', { category: 'plumbing', title: 'Kitchen pipe leaking', description: 'Water leak under the sink, urgent flooding' });
    assert.equal(noPhoto.status, 201);
    const fd = new FormData();
    fd.append('category', 'electrical'); fd.append('title', 'Corridor light out'); fd.append('description', 'Bulb not working');
    fd.append('photo', new Blob([PNG], { type: 'image/png' }), 'p.png');
    const withPhoto = await owner('POST', '/api/requests', fd);
    assert.equal(withPhoto.status, 201);
    assert.equal((await owner('POST', '/api/requests', { category: 'nope', title: 'x' })).status, 400);
    const id = noPhoto.body.id;

    // AI triage: stored, visible to the committee only.
    const ad = (await t.admin('GET', `/api/requests/${id}`)).body;
    assert.ok(ad.ai, 'committee sees triage'); assert.equal(ad.ai.category, 'plumbing'); assert.equal(ad.ai.source, 'rules');
    assert.ok(['urgent', 'high', 'normal', 'low'].includes(ad.ai.priority)); assert.ok(ad.ai.summary);
    assert.equal(ad.has_photo, false); assert.equal(ad.status, 'open');
    const od = (await owner('GET', `/api/requests/${id}`)).body;
    assert.equal(od.ai, undefined, 'resident never sees AI fields'); assert.equal(od.ai_category, undefined);
    assert.equal((await owner('GET', `/api/requests/${withPhoto.body.id}`)).body.has_photo, true);
    assert.equal((await owner('GET', `/api/requests/${withPhoto.body.id}/photo`)).status, 200);
    assert.equal((await other('GET', `/api/requests/${id}`)).status, 404, 'other flat cannot see it');

    // Committee notified (every committee position).
    for (const c of [t.admin, head, member]) assert.ok(await t.has(c, /New plumbing request from flat A-101: Kitchen pipe leaking/));
    assert.ok(!(await t.has(plumber, /New plumbing request/)), 'staff are not told about unassigned requests');

    // Status cannot move without an assignee; staff cannot see before assignment.
    assert.equal((await t.admin('POST', `/api/requests/${id}/status`, { status: 'in_progress' })).status, 409);
    assert.equal((await plumber('GET', `/api/requests/${id}`)).status, 404);
    assert.equal((await t.admin('POST', `/api/requests/${id}/assign`, { staff_id: owner.id })).status, 404, 'only staff can be assigned');

    // Assign to maintenance staff.
    const staffList = (await t.admin('GET', '/api/admin/staff')).body;
    assert.ok(staffList.some(s => s.id === plumber.id));
    assert.equal((await member('POST', `/api/requests/${id}/assign`, { staff_id: plumber.id })).status, 200, 'a member may allocate');
    let d = (await t.admin('GET', `/api/requests/${id}`)).body;
    assert.equal(d.status, 'assigned'); assert.equal(d.assignee_id, plumber.id); assert.equal(d.accepted_at, null);
    assert.ok(await t.has(plumber, /New job assigned to you: "Kitchen pipe leaking"/));
    assert.ok(await t.has(owner, /was assigned to .*society staff/));
    assert.equal((await t.admin('GET', '/api/admin/staff')).body.find(s => s.id === plumber.id).open_jobs, 1);

    // Staff sees it, takes it up.
    const jobs = (await plumber('GET', '/api/staff/jobs')).body;
    assert.deepEqual(jobs.open.map(j => j.id), [id]);
    assert.equal((await plumber('GET', '/api/requests')).body.length, 1, 'staff see only their jobs');
    assert.equal((await plumber('GET', `/api/requests/${withPhoto.body.id}`)).status, 404);
    const acc = await plumber('POST', `/api/staff/jobs/${id}/accept`);
    assert.equal(acc.status, 200); assert.equal(acc.body.status, 'in_progress');
    assert.equal((await plumber('POST', `/api/staff/jobs/${id}/accept`)).status, 409);
    assert.ok(await t.has(owner, /has taken up your request/));
    assert.ok(await t.has(head, /took up "Kitchen pipe leaking"/));

    // Progress update with a photo: saved as an update and a comment the resident sees.
    const up = new FormData(); up.append('progress', 'waiting_parts'); up.append('note', 'Need a new valve');
    up.append('photo', new Blob([PNG], { type: 'image/png' }), 'u.png');
    assert.equal((await plumber('POST', `/api/staff/jobs/${id}/update`, up)).status, 201);
    assert.equal((await plumber('POST', `/api/staff/jobs/${id}/update`, { progress: 'bogus' })).status, 400);
    const ups = (await owner('GET', `/api/requests/${id}/updates`)).body;
    assert.equal(ups.length, 1); assert.equal(ups[0].label, 'Waiting for parts'); assert.equal(ups[0].has_photo, true);
    assert.equal((await owner('GET', `/api/requests/${id}/updates/${ups[0].id}/photo`)).status, 200);
    assert.ok((await owner('GET', `/api/requests/${id}/comments`)).body.some(c => /\[Waiting for parts\] Need a new valve/.test(c.body)));
    assert.ok(await t.has(owner, /Update on "Kitchen pipe leaking": Waiting for parts/));

    // Cost estimate over approval_limit (default 10000): pending, head notified, member not.
    assert.equal((await t.admin('GET', '/api/admin/settings')).body.approval_limit, 10000);
    const est = await plumber('POST', `/api/requests/${id}/estimate`, { amount: 15000, note: 'Replace riser section' });
    assert.equal(est.status, 200); assert.equal(est.body.cost_status, 'pending');
    assert.ok(await t.has(head, /Cost approval needed: Rs 15000/));
    assert.ok(!(await t.has(member, /Cost approval needed/)));
    assert.ok(!(await t.has(t.admin, /Cost approval needed/)), 'sysadmin is not the approver while a head exists');
    const ap = (await member('GET', '/api/admin/approvals')).body;
    assert.equal(ap.can_decide, false); assert.deepEqual(ap.pending.map(r => r.id), [id]);
    assert.equal((await head('GET', '/api/admin/approvals')).body.can_decide, true);
    assert.equal((await t.admin('GET', '/api/admin/approvals')).body.can_decide, false);
    assert.equal((await t.admin('POST', `/api/requests/${id}/status`, { status: 'closed' })).status, 409, 'blocked while cost pending');
    assert.equal((await member('POST', `/api/requests/${id}/cost-decision`, { decision: 'approve' })).status, 403);
    assert.equal((await t.admin('POST', `/api/requests/${id}/cost-decision`, { decision: 'approve' })).status, 403, 'sysadmin cannot when a head exists');
    assert.equal((await plumber('POST', `/api/requests/${id}/cost-decision`, { decision: 'approve' })).status, 403);
    assert.equal((await head('POST', `/api/requests/${id}/cost-decision`, { decision: 'maybe' })).status, 400);
    assert.equal((await head('POST', `/api/requests/${id}/cost-decision`, { decision: 'approve', note: 'ok' })).status, 200);
    assert.equal((await head('POST', `/api/requests/${id}/cost-decision`, { decision: 'approve' })).status, 409);
    assert.ok(await t.has(plumber, /Cost of Rs 15000 for "Kitchen pipe leaking" was approved/));
    assert.ok(await t.has(member, /was approved by/));
    assert.equal((await t.admin('GET', `/api/requests/${id}`)).body.cost_status, 'approved');

    // Work done -> committee asked to close.
    assert.equal((await plumber('POST', `/api/staff/jobs/${id}/update`, { progress: 'done', note: 'Fixed' })).status, 201);
    assert.ok((await t.admin('GET', `/api/requests/${id}`)).body.work_done_at);
    for (const c of [t.admin, head, member]) assert.ok(await t.has(c, /finished "Kitchen pipe leaking".*please confirm and close/));

    // Rating before close is refused; staff cannot close.
    assert.equal((await owner('POST', `/api/requests/${id}/rate`, { rating: 5 })).status, 409);
    assert.equal((await plumber('POST', `/api/requests/${id}/status`, { status: 'closed' })).status, 403);
    assert.equal((await t.admin('POST', `/api/requests/${id}/status`, { status: 'closed', note: 'Verified' })).status, 200);
    assert.equal((await t.admin('POST', `/api/requests/${id}/status`, { status: 'closed' })).status, 409);
    assert.ok(await t.has(owner, /"Kitchen pipe leaking" is now closed/));
    d = (await owner('GET', `/api/requests/${id}`)).body;
    assert.equal(d.status, 'closed'); assert.ok(d.closed_at); assert.equal(d.can_rate, true); assert.equal(d.can_reopen, true);
    assert.equal((await plumber('POST', `/api/staff/jobs/${id}/update`, { progress: 'started' })).status, 409);
    assert.deepEqual((await plumber('GET', '/api/staff/jobs')).body.recent.map(j => j.id), [id]);

    // Rate.
    assert.equal((await t.admin('POST', `/api/requests/${id}/rate`, { rating: 5 })).status, 403);
    assert.equal((await owner('POST', `/api/requests/${id}/rate`, { rating: 9 })).status, 400);
    assert.equal((await owner('POST', `/api/requests/${id}/rate`, { rating: 4, comment: 'Good' })).status, 200);
    assert.equal((await owner('POST', `/api/requests/${id}/rate`, { rating: 4 })).status, 409);

    // Reports before reopen.
    let rep = (await t.admin('GET', '/api/admin/reports/monthly')).body;
    assert.equal(rep.raised, 2); assert.equal(rep.closed, 1); assert.equal(rep.open_now, 1); assert.equal(rep.avg_rating, 4);
    assert.ok(rep.avg_hours_to_assign != null);
    assert.deepEqual(rep.by_category.find(c => c.category === 'plumbing'), { category: 'plumbing', raised: 1, closed: 1 });
    const ba = rep.by_assignee.find(x => x.name === 'maintenance fix');
    assert.ok(ba); assert.equal(ba.kind, 'staff'); assert.equal(ba.closed, 1); assert.equal(ba.avg_rating, 4);
    const headRow = rep.committee.find(m => m.id === head.id), memRow = rep.committee.find(m => m.id === member.id), sysRow = rep.committee.find(m => m.id === t.admin.id);
    assert.equal(headRow.approvals, 1); assert.equal(memRow.assigned, 1); assert.equal(sysRow.status_changes, 1);
    const stats = (await t.admin('GET', '/api/admin/stats')).body;
    assert.equal(stats.avg_rating, 4);
    assert.equal(stats.by_status.find(s => s.status === 'closed').n, 1);
    assert.equal(stats.by_status.find(s => s.status === 'open').n, 1);
    const ov = (await t.admin('GET', '/api/admin/overview')).body;
    assert.equal(ov.requests.open, 1); assert.equal(ov.requests.unassigned, 1); assert.equal(ov.requests.closed_30d, 1); assert.equal(ov.ai.triaged, 2);

    // Reopen within 7 days -> back to assigned, rating cleared, staff and committee notified, staff sees it again.
    assert.equal((await other('POST', `/api/requests/${id}/reopen`, { reason: 'x' })).status, 404);
    assert.equal((await owner('POST', `/api/requests/${id}/reopen`, {})).status, 400);
    const ro = await owner('POST', `/api/requests/${id}/reopen`, { reason: 'Leaking again' });
    assert.equal(ro.status, 200); assert.equal(ro.body.status, 'assigned');
    d = (await t.admin('GET', `/api/requests/${id}`)).body;
    assert.equal(d.rating, null); assert.equal(d.reopen_count, 1); assert.equal(d.work_done_at, null); assert.equal(d.closed_at, null);
    assert.ok(await t.has(plumber, /Job reopened: "Kitchen pipe leaking": Leaking again/));
    assert.ok(await t.has(head, /Reopened: "Kitchen pipe leaking"/));
    assert.deepEqual((await plumber('GET', '/api/staff/jobs')).body.open.map(j => j.id), [id]);
    rep = (await t.admin('GET', '/api/admin/reports/monthly')).body;
    assert.equal(rep.reopened, 1); assert.equal(rep.closed, 0); assert.equal(rep.open_now, 2);

    // Close again (cost still approved) -> counted once more.
    assert.equal((await plumber('POST', `/api/staff/jobs/${id}/accept`)).status, 200);
    assert.equal((await t.admin('POST', `/api/requests/${id}/status`, { status: 'closed' })).status, 200);
    assert.equal((await t.admin('GET', '/api/admin/reports/monthly')).body.closed, 1);

    // Audit trail: every step on the request is recorded, with the right actor.
    const hist = (await t.admin('GET', `/api/requests/${id}`)).body.history;
    const actions = hist.map(h => h.action);
    for (const a of ['created', 'assigned', 'accepted', 'progress', 'estimate', 'cost_approved', 'status', 'rated', 'reopened'])
      assert.ok(actions.includes(a), 'audit has ' + a + ' in ' + actions.join(','));
    assert.equal(hist.find(h => h.action === 'cost_approved').actor, 'head head');
    assert.equal(hist.find(h => h.action === 'accepted').actor, 'maintenance fix');
    assert.equal(hist.find(h => h.action === 'created').actor, 'own');
    assert.ok((await owner('GET', `/api/requests/${id}`)).body.history.length >= 10, 'resident sees the history too');
  } finally { t.close(); }
});

test('cost rejection blocks progress; re-estimate within limit unblocks; with no head the sysadmin approves', async () => {
  const t = await boot();
  try {
    const member = await t.account('member', 'm@x.test');
    const fixer = await t.account('maintenance', 'f@x.test');
    const owner = await t.resident('o@x.test', 'C-1');
    const id = (await owner('POST', '/api/requests', { category: 'lift', title: 'Lift stuck', description: 'lift door jam' })).body.id;
    assert.equal((await t.admin('POST', `/api/requests/${id}/assign`, { staff_id: fixer.id })).status, 200);
    // Estimate before take-up: accept only sets accepted_at.
    assert.equal((await fixer('POST', `/api/requests/${id}/estimate`, { amount: 50000 })).body.cost_status, 'pending');
    assert.ok(await t.has(t.admin, /Cost approval needed: Rs 50000/), 'no head: sysadmin is the approver');
    const acc = await fixer('POST', `/api/staff/jobs/${id}/accept`);
    assert.equal(acc.body.status, 'assigned');
    assert.equal((await t.admin('POST', `/api/requests/${id}/status`, { status: 'in_progress' })).status, 409);
    assert.equal((await member('POST', `/api/requests/${id}/cost-decision`, { decision: 'reject' })).status, 403);
    assert.equal((await t.admin('POST', `/api/requests/${id}/cost-decision`, { decision: 'reject', note: 'too much' })).status, 200);
    assert.ok(await t.has(fixer, /was rejected/));
    assert.equal((await fixer('POST', `/api/staff/jobs/${id}/update`, { progress: 'started' })).status, 201);
    assert.equal((await t.admin('GET', `/api/requests/${id}`)).body.status, 'assigned', 'rejected cost keeps it from starting');
    assert.equal((await t.admin('POST', `/api/requests/${id}/status`, { status: 'closed' })).status, 409);
    assert.equal((await fixer('POST', `/api/requests/${id}/estimate`, { amount: 8000 })).body.cost_status, 'approved');
    assert.equal((await fixer('POST', `/api/staff/jobs/${id}/update`, { progress: 'started' })).status, 201);
    assert.equal((await t.admin('GET', `/api/requests/${id}`)).body.status, 'in_progress');
    assert.equal((await fixer('POST', `/api/requests/${id}/estimate`, { amount: -1 })).status, 400);
    assert.equal((await owner('POST', `/api/requests/${id}/estimate`, { amount: 1 })).status, 404, 'residents cannot estimate');
    const rep = (await t.admin('GET', '/api/admin/reports/monthly')).body;
    assert.equal(rep.committee.find(m => m.id === t.admin.id).approvals, 2, 'one resident approval + one cost rejection');
  } finally { t.close(); }
});

test('reopen window: refused after 7 days; family member cannot rate; owner rates for them', async () => {
  const t = await boot();
  try {
    const fixer = await t.account('maintenance', 'f@x.test');
    const owner = await t.resident('o@x.test', 'D-1');
    const fam = await t.resident('fam@x.test', 'D-1', 'family');
    const id = (await fam('POST', '/api/requests', { category: 'plumbing', title: 'Tap drip' })).body.id;
    assert.equal((await owner('GET', `/api/requests/${id}`)).status, 200, 'owner sees family request');
    await t.admin('POST', `/api/requests/${id}/assign`, { staff_id: fixer.id });
    assert.equal((await t.admin('POST', `/api/requests/${id}/status`, { status: 'closed' })).status, 200);
    assert.equal((await fam('GET', `/api/requests/${id}`)).body.can_rate, false);
    assert.equal((await fam('POST', `/api/requests/${id}/rate`, { rating: 5 })).status, 403);
    assert.equal((await owner('POST', `/api/requests/${id}/rate`, { rating: 5 })).status, 200);
    assert.ok(await t.has(fam, /rated 5 of 5 by the flat owner/));
    t.app.locals.db.prepare("UPDATE requests SET closed_at=datetime('now','-8 days') WHERE id=?").run(id);
    assert.equal((await owner('GET', `/api/requests/${id}`)).body.can_reopen, false);
    assert.equal((await owner('POST', `/api/requests/${id}/reopen`, { reason: 'again' })).status, 403);
  } finally { t.close(); }
});

test('punch-out hand-over moves every open job (not closed ones) to the colleague', async () => {
  const t = await boot();
  try {
    const a = await t.account('maintenance', 'a@x.test');
    const b = await t.account('maintenance', 'b@x.test');
    const owner = await t.resident('o@x.test', 'E-1');
    const ids = [];
    for (const title of ['Pipe one', 'Pipe two', 'Pipe three']) {
      const id = (await owner('POST', '/api/requests', { category: 'plumbing', title })).body.id;
      assert.equal((await t.admin('POST', `/api/requests/${id}/assign`, { staff_id: a.id })).status, 200);
      ids.push(id);
    }
    await a('POST', `/api/staff/jobs/${ids[0]}/accept`);
    await t.admin('POST', `/api/requests/${ids[2]}/status`, { status: 'closed' });
    assert.equal((await a('POST', '/api/staff/punch-out', {})).status, 409, 'not on shift');
    assert.equal((await a('POST', '/api/staff/punch-in')).status, 201);
    assert.equal((await a('POST', '/api/staff/punch-in')).status, 409);
    assert.equal((await a('POST', '/api/staff/punch-out', { handover_to: owner.id })).status, 400, 'only staff');
    assert.equal((await a('POST', '/api/staff/punch-out', { handover_to: a.id })).status, 400, 'not self');
    const po = await a('POST', '/api/staff/punch-out', { handover_to: b.id, note: 'Valve in store' });
    assert.equal(po.status, 200); assert.equal(po.body.handed_over, 2);
    assert.deepEqual((await b('GET', '/api/staff/jobs')).body.open.map(j => j.id).sort(), [ids[0], ids[1]].sort());
    assert.equal((await a('GET', '/api/staff/jobs')).body.open.length, 0);
    assert.equal((await a('GET', `/api/requests/${ids[1]}`)).status, 404, 'old assignee loses access');
    const moved = (await t.admin('GET', `/api/requests/${ids[0]}`)).body;
    assert.equal(moved.assignee_id, b.id); assert.equal(moved.accepted_at, null); assert.equal(moved.status, 'in_progress');
    assert.equal((await t.admin('GET', `/api/requests/${ids[2]}`)).body.assignee_id, a.id, 'closed job stays');
    assert.ok(await t.has(b, /handed over 2 job\(s\) to you: Valve in store/));
    assert.ok(await t.has(t.admin, /handed over 2 job\(s\) to maintenance b/));
    assert.ok((await t.admin('GET', `/api/requests/${ids[1]}`)).body.history.some(h => h.action === 'handed_over'));
    const att = (await t.admin('GET', '/api/admin/attendance')).body;
    assert.equal(att[0].handover_to_name, 'maintenance b'); assert.equal(att[0].handover_note, 'Valve in store'); assert.ok(att[0].punch_out);
    assert.equal((await b('POST', `/api/staff/jobs/${ids[0]}/accept`)).status, 200, 'new assignee takes it up');
    const staff = (await t.admin('GET', '/api/admin/staff')).body;
    assert.equal(staff.find(s => s.id === b.id).open_jobs, 2); assert.equal(staff.find(s => s.id === a.id).open_jobs, 0);
  } finally { t.close(); }
});

test('missed waste pickup becomes a triaged housekeeping request that runs the normal lifecycle with a cleaner', async () => {
  const t = await boot();
  try {
    const member = await t.account('member', 'm@x.test');
    const cleaner = await t.account('cleaner', 'c@x.test');
    const owner = await t.resident('o@x.test', 'F-1');
    assert.equal((await owner('POST', '/api/waste/missed', { kind: 'nope' })).status, 400);
    assert.equal((await t.admin('POST', '/api/waste/missed', { kind: 'wet' })).status, 403);
    const r = await owner('POST', '/api/waste/missed', { kind: 'wet', note: 'Bin full since morning' });
    assert.equal(r.status, 201);
    const id = r.body.id;
    const d = (await t.admin('GET', `/api/requests/${id}`)).body;
    assert.equal(d.category, 'housekeeping'); assert.equal(d.title, 'Missed wet waste pickup'); assert.equal(d.status, 'open'); assert.equal(d.source, 'app');
    assert.ok(d.ai, 'triaged like any request');
    assert.ok(d.history.some(h => h.action === 'created'));
    assert.ok((await owner('GET', '/api/requests')).body.some(x => x.id === id));
    assert.ok((await t.admin('GET', '/api/requests?category=housekeeping')).body.some(x => x.id === id));
    for (const c of [t.admin, member]) assert.ok(await t.has(c, /New housekeeping request from flat F-1: Missed wet waste pickup/));
    assert.equal((await t.admin('POST', `/api/requests/${id}/assign`, { staff_id: cleaner.id })).status, 200);
    assert.deepEqual((await cleaner('GET', '/api/staff/jobs')).body.open.map(j => j.id), [id]);
    assert.equal((await cleaner('GET', '/api/waste/logs')).status, 200, 'cleaner reaches waste logs');
    assert.equal((await cleaner('GET', '/api/inventory')).status, 403, 'cleaner does not reach inventory');
    assert.equal((await cleaner('POST', `/api/staff/jobs/${id}/accept`)).status, 200);
    assert.equal((await cleaner('POST', `/api/staff/jobs/${id}/update`, { progress: 'done' })).status, 201);
    assert.equal((await t.admin('POST', `/api/requests/${id}/status`, { status: 'closed' })).status, 200);
    assert.ok(await t.has(owner, /"Missed wet waste pickup" is now closed/));
    const rep = (await t.admin('GET', '/api/admin/reports/monthly')).body;
    assert.deepEqual(rep.by_category.find(c => c.category === 'housekeeping'), { category: 'housekeeping', raised: 1, closed: 1 });
    assert.equal(rep.by_assignee.find(x => x.name === 'cleaner c').closed, 1);
  } finally { t.close(); }
});

// ---------------- suspected bugs: correct expectation, marked todo ----------------

test('department: a cleaner should not be assigned (or see) a plumbing job', async () => {
  const t = await boot();
  try {
    const cleaner = await t.account('cleaner', 'c@x.test');
    const owner = await t.resident('o@x.test', 'G-1');
    const id = (await owner('POST', '/api/requests', { category: 'plumbing', title: 'Burst pipe' })).body.id;
    const r = await t.admin('POST', `/api/requests/${id}/assign`, { staff_id: cleaner.id });
    assert.ok(r.status >= 400, `cleaner was assigned a plumbing job: ${r.status}`);
    assert.equal((await cleaner('GET', '/api/staff/jobs')).body.open.length, 0);
  } finally { t.close(); }
});

test('hand-over: maintenance jobs should not move to a cleaner', async () => {
  const t = await boot();
  try {
    const fixer = await t.account('maintenance', 'f@x.test');
    const cleaner = await t.account('cleaner', 'c@x.test');
    const owner = await t.resident('o@x.test', 'G-2');
    const id = (await owner('POST', '/api/requests', { category: 'electrical', title: 'Short circuit' })).body.id;
    await t.admin('POST', `/api/requests/${id}/assign`, { staff_id: fixer.id });
    await fixer('POST', '/api/staff/punch-in');
    const r = await fixer('POST', '/api/staff/punch-out', { handover_to: cleaner.id });
    assert.ok(r.status >= 400 || r.body.handed_over === 0, 'electrical job handed to cleaner');
  } finally { t.close(); }
});

test('stats.unassigned should not count staff-assigned requests', async () => {
  const t = await boot();
  try {
    const fixer = await t.account('maintenance', 'f@x.test');
    const owner = await t.resident('o@x.test', 'H-1');
    const id = (await owner('POST', '/api/requests', { category: 'plumbing', title: 'Drip' })).body.id;
    await t.admin('POST', `/api/requests/${id}/assign`, { staff_id: fixer.id });
    assert.equal((await t.admin('GET', '/api/admin/stats')).body.unassigned, 0);
  } finally { t.close(); }
});

test('access rules: a role without request.create cannot raise a request via missed waste pickup', async () => {
  const t = await boot();
  try {
    const tenant = await t.resident('t@x.test', 'J-1', 'tenant');
    assert.equal((await t.admin('PUT', '/api/admin/access', { matrix: { tenant: { 'request.create': false } } })).status, 200);
    assert.equal((await tenant('POST', '/api/requests', { category: 'plumbing', title: 'x' })).status, 403);
    assert.equal((await tenant('POST', '/api/waste/missed', { kind: 'wet' })).status, 403);
  } finally { t.close(); }
});

test('new-request alerts should go only to approved committee accounts', async () => {
  const t = await boot();
  try {
    const member = await t.account('member', 'm@x.test');
    assert.equal((await t.admin('PATCH', `/api/admin/accounts/${member.id}`, { status: 'suspended' })).status, 200);
    const owner = await t.resident('o@x.test', 'K-1');
    await owner('POST', '/api/requests', { category: 'plumbing', title: 'Leak' });
    const n = t.app.locals.db.prepare("SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND message LIKE 'New plumbing request%'").get(member.id).n;
    assert.equal(n, 0);
  } finally { t.close(); }
});
