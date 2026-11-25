// Roles from the faculty review (2026-11-21): accounts per role, staff self-service (take up, update, punch in/out,
// hand over), head-of-committee cost approval, reopen, monthly reports, and the IT support desk.
// Contract: docs/roles-api.md. Node only so far (Java and React not ported).
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const GUIDES = require('./guides');

// kind -> [role, committee position, staff department]
const KINDS = { member: ['admin', 'member'], head: ['admin', 'head'], sysadmin: ['admin', 'sysadmin'], maintenance: ['staff', null, 'maintenance'], staff: ['staff', null, 'maintenance'],
  cleaner: ['staff', null, 'cleaning'], it: ['it', null], guard: ['guard', null], shop: ['shop', null], laundry: ['laundry', null] };
const PROGRESS = { started: 'Started', waiting_parts: 'Waiting for parts', done: 'Work done' };
const TICKET_KINDS = ['bug', 'question', 'access', 'other'];
const TICKET_STATUS = ['open', 'in_progress', 'resolved'];

module.exports = function mountRoles(app, c) {
  const { db, q, one, run, log, notify, notifyReq, auth, admin, governance, posOf, isGov, canApproveCost, hasHead, committeeIds, canSee, canReopen, shape, str, upload, validImage, uploadDir, approvalLimit, getMaintenance, REQ_SELECT, REOPEN_DAYS, bcrypt } = c;
  const putSetting = (k, v) => db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(k, v);
  const onShift = id => !!one('SELECT 1 AS x FROM staff_shifts WHERE user_id=? AND punch_out IS NULL', id);
  const notifyCommittee = msg => { for (const id of committeeIds()) notify(id, msg); };
  const itIds = () => q("SELECT id FROM users WHERE status='approved' AND (role='it' OR (role='admin' AND COALESCE(position,'sysadmin')='sysadmin'))").map(r => r.id);
  const isIT = u => u.role === 'it' || posOf(u) === 'sysadmin';
  const itOnly = (req, res, next) => (isIT(req.user) ? next() : res.status(403).json({ error: 'IT staff only' }));
  const staffOnly = (req, res, next) => (req.user.role === 'staff' ? next() : res.status(403).json({ error: 'Staff only' }));
  const govCount = () => one("SELECT COUNT(*) AS n FROM users WHERE role='admin' AND status='approved' AND COALESCE(position,'sysadmin') IN ('head','sysadmin')").n;
  const ACC_SELECT = "SELECT id,name,email,role,position,department,status,created_at FROM users WHERE role IN ('admin','staff','it','guard','shop','laundry') AND status!='removed'";
  const accRow = a => ({ ...a, position: a.role === 'admin' ? (a.position || 'sysadmin') : null, on_shift: a.role === 'staff' ? onShift(a.id) : undefined });

  // ---------- accounts for every non-resident role (head of committee or admin only)
  app.get('/api/admin/accounts', auth, admin, governance, (req, res) => res.json(q(`${ACC_SELECT} ORDER BY role, id`).map(accRow)));
  app.post('/api/admin/accounts', auth, admin, governance, (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 100), email = str(b.email, 200).toLowerCase(), pw = typeof b.password === 'string' ? b.password : '';
    const k = KINDS[b.kind];
    if (!k) return res.status(400).json({ error: 'Choose committee member, head, admin, staff, IT or guard' });
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Name and a valid email are required' });
    if (pw.length < 8 || pw.length > 128) return res.status(400).json({ error: 'Password must be 8 to 128 characters' });
    if (one('SELECT id FROM users WHERE email=?', email)) return res.status(409).json({ error: 'Email already registered' });
    const r = run("INSERT INTO users(name,email,password_hash,role,position,department,status,consent_at) VALUES(?,?,?,?,?,?,'approved',datetime('now'))", name, email, bcrypt.hashSync(pw, 10), k[0], k[1], k[2] || null);
    log(req.user.id, 'user', r.lastInsertRowid, 'account_created', `${b.kind}: ${email}`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  const accTarget = id => one("SELECT * FROM users WHERE id=? AND role IN ('admin','staff','it','guard','shop','laundry') AND status!='removed'", id);
  const losesGov = (u, nextPos, nextStatus) => isGov(u) && u.status === 'approved' && (!['head', 'sysadmin'].includes(nextPos) || nextStatus !== 'approved') && govCount() <= 1;
  app.patch('/api/admin/accounts/:id', auth, admin, governance, (req, res) => {
    const u = accTarget(req.params.id);
    if (!u) return res.status(404).json({ error: 'Account not found' });
    const b = req.body || {};
    let pos = posOf(u), status = u.status;
    if ('position' in b) {
      if (u.role !== 'admin' || !['member', 'head', 'sysadmin'].includes(b.position)) return res.status(400).json({ error: 'Position applies to committee accounts: member, head or sysadmin' });
      pos = b.position;
    }
    if ('status' in b) { if (!['approved', 'suspended'].includes(b.status)) return res.status(400).json({ error: "Status must be 'approved' or 'suspended'" }); status = b.status; }
    if (u.id === req.user.id && (status !== 'approved' || pos !== posOf(u))) return res.status(409).json({ error: 'You cannot suspend or demote your own account' });
    if (losesGov(u, pos, status)) return res.status(409).json({ error: 'Keep at least one head of committee or admin account' });
    if (u.role === 'admin' && pos !== posOf(u)) { run('UPDATE users SET position=? WHERE id=?', pos, u.id); log(req.user.id, 'user', u.id, 'position', `${posOf(u)} -> ${pos}`); notify(u.id, `Your committee role is now: ${pos === 'head' ? 'Head of committee' : pos === 'member' ? 'Committee member' : 'Admin'}`); }
    if (status !== u.status) { run('UPDATE users SET status=? WHERE id=?', status, u.id); log(req.user.id, 'user', u.id, status === 'suspended' ? 'suspended' : 'reinstated', u.email); }
    res.json(accRow(one('SELECT id,name,email,role,position,department,status,created_at FROM users WHERE id=?', u.id)));
  });
  app.delete('/api/admin/accounts/:id', auth, admin, governance, (req, res) => {
    const u = accTarget(req.params.id);
    if (!u) return res.status(404).json({ error: 'Account not found' });
    if (u.id === req.user.id) return res.status(409).json({ error: 'You cannot remove your own account' });
    if (losesGov(u, null, 'removed')) return res.status(409).json({ error: 'Keep at least one head of committee or admin account' });
    run("UPDATE users SET status='removed' WHERE id=?", u.id);
    if (u.role === 'staff') run("UPDATE staff_shifts SET punch_out=datetime('now') WHERE user_id=? AND punch_out IS NULL", u.id);
    log(req.user.id, 'user', u.id, 'account_removed', `${u.role}: ${u.email}`);
    res.json({ ok: true });
  });

  // ---------- staff list for allocation, attendance
  app.get('/api/admin/staff', auth, admin, (req, res) => res.json(q("SELECT id,name,email,status FROM users WHERE role='staff' AND status='approved' ORDER BY name")
    .map(s => ({ ...s, on_shift: onShift(s.id), open_jobs: one("SELECT COUNT(*) AS n FROM requests WHERE assignee_id=? AND status!='closed'", s.id).n }))));
  app.get('/api/admin/attendance', auth, admin, (req, res) => {
    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 7, 1), 90);
    res.json(q(`SELECT s.id,s.user_id,u.name,s.punch_in,s.punch_out,h.name AS handover_to_name,s.handover_note,
      ROUND((julianday(COALESCE(s.punch_out,datetime('now')))-julianday(s.punch_in))*24,2) AS hours
      FROM staff_shifts s JOIN users u ON u.id=s.user_id LEFT JOIN users h ON h.id=s.handover_to
      WHERE s.punch_in >= datetime('now', ?) ORDER BY s.id DESC`, `-${days} days`));
  });

  // ---------- staff self-service
  const myJob = (req, res) => {
    const r = one(`${REQ_SELECT} WHERE r.id=?`, req.params.id);
    if (!r || r.assignee_id !== req.user.id) { res.status(404).json({ error: 'Job not found' }); return null; }
    return r;
  };
  app.get('/api/staff/jobs', auth, staffOnly, (req, res) => res.json({
    open: q(`${REQ_SELECT} WHERE r.assignee_id=? AND r.status!='closed' ORDER BY r.id`, req.user.id).map(r => shape(r, req.user)),
    recent: q(`${REQ_SELECT} WHERE r.assignee_id=? AND r.status='closed' AND COALESCE(r.closed_at,r.updated_at) >= datetime('now','-7 days') ORDER BY r.id DESC`, req.user.id).map(r => shape(r, req.user)),
  }));
  app.post('/api/staff/jobs/:id/accept', auth, staffOnly, (req, res) => {
    const r = myJob(req, res); if (!r) return;
    if (r.status === 'closed') return res.status(409).json({ error: 'This job is already closed' });
    if (r.accepted_at) return res.status(409).json({ error: 'You already took up this job' });
    const start = r.status === 'assigned' && !['pending', 'rejected'].includes(r.cost_status);
    run(`UPDATE requests SET accepted_at=datetime('now'), status=?, updated_at=datetime('now') WHERE id=?`, start ? 'in_progress' : r.status, r.id);
    log(req.user.id, 'request', r.id, 'accepted', req.user.name + (start ? ' (assigned -> in_progress)' : ''));
    notifyReq(r, `${req.user.name} has taken up your request "${r.title}"`);
    notifyCommittee(`${req.user.name} took up "${r.title}" (flat ${r.flat})`);
    res.json({ ok: true, status: start ? 'in_progress' : r.status });
  });
  app.post('/api/staff/jobs/:id/update', auth, staffOnly,
    (req, res, next) => upload.single('photo')(req, res, err => (err ? res.status(400).json({ error: err.message }) : next())),
    (req, res) => {
      const drop = () => { if (req.file) fs.unlink(req.file.path, () => {}); };
      if (req.file && !validImage(req.file)) { drop(); return res.status(400).json({ error: 'File is not a valid JPEG, PNG or WebP image' }); }
      const r = one(`${REQ_SELECT} WHERE r.id=?`, req.params.id);
      if (!r || r.assignee_id !== req.user.id) { drop(); return res.status(404).json({ error: 'Job not found' }); }
      if (r.status === 'closed') { drop(); return res.status(409).json({ error: 'This job is already closed' }); }
      const progress = req.body.progress, note = str(req.body.note, 1000);
      if (!PROGRESS[progress]) { drop(); return res.status(400).json({ error: 'Progress must be started, waiting_parts or done' }); }
      const u = run('INSERT INTO job_updates(request_id,user_id,progress,note,photo) VALUES(?,?,?,?,?)', r.id, req.user.id, progress, note || null, req.file ? req.file.filename : null);
      run('INSERT INTO comments(request_id,user_id,body) VALUES(?,?,?)', r.id, req.user.id, `[${PROGRESS[progress]}] ${note || ''}`.trim());
      if (progress === 'done') run("UPDATE requests SET work_done_at=datetime('now'), updated_at=datetime('now') WHERE id=?", r.id);
      else if (progress === 'started' && r.status === 'assigned' && !['pending', 'rejected'].includes(r.cost_status)) run("UPDATE requests SET status='in_progress', accepted_at=COALESCE(accepted_at,datetime('now')), updated_at=datetime('now') WHERE id=?", r.id);
      else run("UPDATE requests SET updated_at=datetime('now') WHERE id=?", r.id);
      log(req.user.id, 'request', r.id, 'progress', PROGRESS[progress] + (note ? ': ' + note.slice(0, 80) : ''));
      notifyReq(r, `Update on "${r.title}": ${PROGRESS[progress]}${note ? ' - ' + note.slice(0, 120) : ''}`);
      if (progress === 'done') notifyCommittee(`${req.user.name} finished "${r.title}" (flat ${r.flat}): please confirm and close`);
      res.status(201).json({ id: Number(u.lastInsertRowid) });
    });
  app.get('/api/requests/:id/updates', auth, (req, res) => {
    const r = one(`${REQ_SELECT} WHERE r.id=?`, req.params.id);
    if (!r || !canSee(req.user, r)) return res.status(404).json({ error: 'Request not found' });
    res.json(q('SELECT j.id,j.progress,j.note,j.photo IS NOT NULL AS has_photo,u.name AS author,j.created_at FROM job_updates j JOIN users u ON u.id=j.user_id WHERE j.request_id=? ORDER BY j.id', r.id)
      .map(x => ({ ...x, has_photo: !!x.has_photo, label: PROGRESS[x.progress] })));
  });
  app.get('/api/requests/:id/updates/:uid/photo', auth, (req, res) => {
    const r = one(`${REQ_SELECT} WHERE r.id=?`, req.params.id);
    const j = r && one('SELECT photo FROM job_updates WHERE id=? AND request_id=?', req.params.uid, r.id);
    if (!r || !j || !j.photo || !canSee(req.user, r)) return res.status(404).end();
    res.set('Cache-Control', 'private, max-age=3600').sendFile(path.join(uploadDir, path.basename(j.photo)), err => { if (err && !res.headersSent) res.status(404).end(); });
  });

  // ---------- cost estimate and head-of-committee approval
  const approverIds = () => q(`SELECT id FROM users WHERE role='admin' AND status='approved' AND position='head'`).map(r => r.id).concat(hasHead() ? [] : q("SELECT id FROM users WHERE role='admin' AND status='approved' AND COALESCE(position,'sysadmin')='sysadmin'").map(r => r.id));
  app.post('/api/requests/:id/estimate', auth, (req, res) => {
    const r = one(`${REQ_SELECT} WHERE r.id=?`, req.params.id);
    if (!r || !(req.user.role === 'admin' || (req.user.role === 'staff' && r.assignee_id === req.user.id))) return res.status(404).json({ error: 'Request not found' });
    if (r.status === 'closed') return res.status(409).json({ error: 'Request is closed' });
    const amount = Number(req.body.amount), note = str(req.body.note, 300);
    if (req.body.amount === '' || req.body.amount == null || !Number.isFinite(amount) || amount < 0 || amount > 1e8) return res.status(400).json({ error: 'Enter the estimated cost in rupees' });
    const limit = approvalLimit(), needs = amount > limit;
    run('UPDATE requests SET est_cost=?, cost_status=?, cost_note=?, updated_at=datetime(\'now\') WHERE id=?', amount, needs ? 'pending' : 'approved', note || null, r.id);
    log(req.user.id, 'request', r.id, 'estimate', `Rs ${amount}${needs ? ' (over Rs ' + limit + ': needs head approval)' : ' (within limit)'}${note ? ': ' + note : ''}`);
    if (needs) for (const id of approverIds()) notify(id, `Cost approval needed: Rs ${amount} for "${r.title}" (flat ${r.flat})`);
    res.json({ ok: true, cost_status: needs ? 'pending' : 'approved', approval_limit: limit });
  });
  app.get('/api/admin/approvals', auth, admin, (req, res) => res.json({
    can_decide: canApproveCost(req.user), approval_limit: approvalLimit(),
    pending: q(`${REQ_SELECT} WHERE r.cost_status='pending' ORDER BY r.id`).map(r => shape(r, req.user)),
  }));
  app.post('/api/requests/:id/cost-decision', auth, admin, (req, res) => {
    if (!canApproveCost(req.user)) return res.status(403).json({ error: hasHead() ? 'Only the head of committee approves costs' : 'Only the head of committee or the admin approves costs' });
    const r = one(`${REQ_SELECT} WHERE r.id=?`, req.params.id);
    if (!r) return res.status(404).json({ error: 'Request not found' });
    if (r.cost_status !== 'pending') return res.status(409).json({ error: 'No cost waiting for approval on this request' });
    const d = req.body.decision, note = str(req.body.note, 300);
    if (!['approve', 'reject'].includes(d)) return res.status(400).json({ error: 'Decision must be approve or reject' });
    run("UPDATE requests SET cost_status=?, cost_note=COALESCE(?,cost_note), updated_at=datetime('now') WHERE id=?", d === 'approve' ? 'approved' : 'rejected', note || null, r.id);
    log(req.user.id, 'request', r.id, 'cost_' + (d === 'approve' ? 'approved' : 'rejected'), `Rs ${r.est_cost}${note ? ': ' + note : ''}`);
    const msg = `Cost of Rs ${r.est_cost} for "${r.title}" was ${d === 'approve' ? 'approved' : 'rejected'} by ${req.user.name}${note ? ': ' + note : ''}`;
    if (r.assignee_id) notify(r.assignee_id, msg);
    for (const id of committeeIds()) if (id !== req.user.id) notify(id, msg);
    res.json({ ok: true });
  });

  // ---------- shifts: punch in / out and hand-over
  app.get('/api/staff/shift', auth, staffOnly, (req, res) => res.json({
    current: one('SELECT * FROM staff_shifts WHERE user_id=? AND punch_out IS NULL', req.user.id) || null,
    recent: q(`SELECT s.*, h.name AS handover_to_name FROM staff_shifts s LEFT JOIN users h ON h.id=s.handover_to WHERE s.user_id=? ORDER BY s.id DESC LIMIT 10`, req.user.id),
    colleagues: q("SELECT id,name FROM users WHERE role='staff' AND status='approved' AND id!=? ORDER BY name", req.user.id).map(x => ({ ...x, on_shift: onShift(x.id) })),
  }));
  app.post('/api/staff/punch-in', auth, staffOnly, (req, res) => {
    if (onShift(req.user.id)) return res.status(409).json({ error: 'You are already on shift' });
    const r = run('INSERT INTO staff_shifts(user_id) VALUES(?)', req.user.id);
    log(req.user.id, 'shift', r.lastInsertRowid, 'punch_in');
    res.status(201).json(one('SELECT * FROM staff_shifts WHERE id=?', r.lastInsertRowid));
  });
  app.post('/api/staff/punch-out', auth, staffOnly, (req, res) => {
    const s = one('SELECT * FROM staff_shifts WHERE user_id=? AND punch_out IS NULL', req.user.id);
    if (!s) return res.status(409).json({ error: 'You are not on shift' });
    const note = str(req.body.note, 500);
    let to = null, moved = [];
    if (req.body.handover_to != null && req.body.handover_to !== '') {
      to = one("SELECT id,name FROM users WHERE id=? AND role='staff' AND status='approved'", req.body.handover_to);
      if (!to || to.id === req.user.id) return res.status(400).json({ error: 'Choose another staff member to hand over to' });
      moved = q("SELECT id,title FROM requests WHERE assignee_id=? AND status!='closed'", req.user.id);
      for (const j of moved) {
        run("UPDATE requests SET assignee_id=?, accepted_at=NULL, updated_at=datetime('now') WHERE id=?", to.id, j.id);
        log(req.user.id, 'request', j.id, 'handed_over', `${req.user.name} -> ${to.name}${note ? ': ' + note : ''}`);
      }
      notify(to.id, `${req.user.name} handed over ${moved.length} job(s) to you${note ? ': ' + note : ''}`);
      if (moved.length) notifyCommittee(`${req.user.name} handed over ${moved.length} job(s) to ${to.name}`);
    }
    run("UPDATE staff_shifts SET punch_out=datetime('now'), handover_to=?, handover_note=? WHERE id=?", to ? to.id : null, note || null, s.id);
    log(req.user.id, 'shift', s.id, 'punch_out', to ? `handed over ${moved.length} job(s) to ${to.name}` : '');
    res.json({ ok: true, handed_over: moved.length });
  });

  // ---------- resident: reopen a closed request
  app.post('/api/requests/:id/reopen', auth, (req, res) => {
    const r = one(`${REQ_SELECT} WHERE r.id=?`, req.params.id);
    if (!r || !canSee(req.user, r)) return res.status(404).json({ error: 'Request not found' });
    if (r.status !== 'closed') return res.status(409).json({ error: 'Only closed requests can be reopened' });
    if (!canReopen(req.user, r)) return res.status(403).json({ error: `Requests can be reopened by the requester or flat owner within ${REOPEN_DAYS} days of closing` });
    const reason = str(req.body.reason, 500);
    if (!reason) return res.status(400).json({ error: 'Say what is still wrong' });
    const back = r.vendor_id || r.assignee_id ? 'assigned' : 'open';
    run(`UPDATE requests SET status=?, rating=NULL, rating_comment=NULL, accepted_at=NULL, work_done_at=NULL, closed_at=NULL, escalated_at=NULL,
      reopen_count=reopen_count+1, created_at=created_at, updated_at=datetime('now') WHERE id=?`, back, r.id);
    run('INSERT INTO comments(request_id,user_id,body) VALUES(?,?,?)', r.id, req.user.id, '[Reopened] ' + reason);
    log(req.user.id, 'request', r.id, 'reopened', `closed -> ${back}: ${reason.slice(0, 120)}`);
    notifyCommittee(`Reopened: "${r.title}" (flat ${r.flat}): ${reason.slice(0, 80)}`);
    if (r.assignee_id) notify(r.assignee_id, `Job reopened: "${r.title}": ${reason.slice(0, 80)}`);
    res.json({ ok: true, status: back });
  });

  // ---------- monthly report (committee; per-member performance for the head)
  app.get('/api/admin/reports/monthly', auth, admin, (req, res) => {
    const now = new Date();
    const month = /^\d{4}-(0[1-9]|1[0-2])$/.test(req.query.month || '') ? req.query.month : `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
    const a = month + '-01', W = "BETWEEN ? AND datetime(?, '+1 month', '-1 second')";
    const n = (sql, ...p) => one(sql, ...p).n || 0;
    const closedAt = "COALESCE(r.closed_at, r.updated_at)";
    res.json({
      month,
      raised: n(`SELECT COUNT(*) AS n FROM requests r WHERE r.created_at ${W}`, a, a),
      closed: n(`SELECT COUNT(*) AS n FROM requests r WHERE r.status='closed' AND ${closedAt} ${W}`, a, a),
      open_now: n("SELECT COUNT(*) AS n FROM requests WHERE status!='closed'"),
      reopened: n(`SELECT COUNT(*) AS n FROM audit WHERE entity='request' AND action='reopened' AND created_at ${W}`, a, a),
      escalated: n(`SELECT COUNT(*) AS n FROM requests WHERE escalated_at ${W}`, a, a),
      emergencies: n(`SELECT COUNT(*) AS n FROM emergencies WHERE created_at ${W}`, a, a),
      new_residents: n(`SELECT COUNT(*) AS n FROM users WHERE role='resident' AND status='approved' AND created_at ${W}`, a, a),
      notices: n(`SELECT COUNT(*) AS n FROM notices WHERE created_at ${W}`, a, a),
      avg_rating: one(`SELECT ROUND(AVG(rating),2) AS v FROM requests r WHERE rating IS NOT NULL AND ${closedAt} ${W}`, a, a).v,
      avg_hours_to_assign: one(`SELECT ROUND(AVG((julianday(x.t)-julianday(r.created_at))*24),1) AS v FROM requests r
        JOIN (SELECT entity_id, MIN(created_at) AS t FROM audit WHERE entity='request' AND action='assigned' GROUP BY entity_id) x ON x.entity_id=r.id WHERE r.created_at ${W}`, a, a).v,
      avg_hours_to_close: one(`SELECT ROUND(AVG((julianday(${closedAt})-julianday(r.created_at))*24),1) AS v FROM requests r WHERE r.status='closed' AND ${closedAt} ${W}`, a, a).v,
      by_category: q(`SELECT category, SUM(created_at ${W}) AS raised, SUM(status='closed' AND ${closedAt} ${W}) AS closed FROM requests r GROUP BY category ORDER BY category`, a, a, a, a)
        .map(x => ({ category: x.category, raised: x.raised || 0, closed: x.closed || 0 })).filter(x => x.raised || x.closed),
      by_assignee: q(`SELECT COALESCE(s.name, v.name) AS name, CASE WHEN s.id IS NOT NULL THEN 'staff' ELSE 'vendor' END AS kind, COUNT(*) AS closed, ROUND(AVG(r.rating),1) AS avg_rating
        FROM requests r LEFT JOIN users s ON s.id=r.assignee_id LEFT JOIN vendors v ON v.id=r.vendor_id
        WHERE r.status='closed' AND ${closedAt} ${W} AND (s.id IS NOT NULL OR v.id IS NOT NULL) GROUP BY 1,2 ORDER BY closed DESC`, a, a),
      committee: q("SELECT id,name,position FROM users WHERE role='admin' AND status='approved' ORDER BY name").map(m => {
        const c = action => n(`SELECT COUNT(*) AS n FROM audit WHERE actor_id=? AND created_at ${W}${action}`, m.id, a, a);
        return { id: m.id, name: m.name, position: m.position || 'sysadmin', actions: c(" AND action!='login'"), assigned: c(" AND entity='request' AND action='assigned'"),
          status_changes: c(" AND entity='request' AND action='status'"), approvals: c(" AND ((entity='user' AND action IN ('approve','reject')) OR action IN ('cost_approved','cost_rejected'))") };
      }),
    });
  });

  // ---------- IT: support desk, guides, health, backup, maintenance notice
  app.post('/api/support', auth, (req, res) => {
    const subject = str(req.body.subject, 150), body = str(req.body.body, 3000), kind = TICKET_KINDS.includes(req.body.kind) ? req.body.kind : 'question';
    if (!subject || !body) return res.status(400).json({ error: 'Subject and description are required' });
    const r = run('INSERT INTO support_tickets(user_id,subject,body,kind) VALUES(?,?,?,?)', req.user.id, subject, body, kind);
    log(req.user.id, 'support', r.lastInsertRowid, 'opened', `${kind}: ${subject}`);
    for (const id of itIds()) if (id !== req.user.id) notify(id, `New support ticket #${r.lastInsertRowid} (${kind}): ${subject}`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  const TK_SELECT = `SELECT t.id,t.subject,t.kind,t.status,t.user_id,u.name AS user_name,u.role AS user_role,t.created_at,t.updated_at,
    (SELECT COUNT(*) FROM support_replies x WHERE x.ticket_id=t.id) AS replies FROM support_tickets t JOIN users u ON u.id=t.user_id`;
  app.get('/api/support', auth, (req, res) => {
    const where = [], p = [];
    if (!isIT(req.user)) { where.push('t.user_id=?'); p.push(req.user.id); }
    if (TICKET_STATUS.includes(req.query.status)) { where.push('t.status=?'); p.push(req.query.status); }
    res.json(q(`${TK_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY (t.status='resolved'), t.id DESC LIMIT 300`, ...p));
  });
  const ticketFor = (req, res) => {
    const t = one('SELECT t.*, u.name AS user_name, u.role AS user_role FROM support_tickets t JOIN users u ON u.id=t.user_id WHERE t.id=?', req.params.id);
    if (!t || (!isIT(req.user) && t.user_id !== req.user.id)) { res.status(404).json({ error: 'Ticket not found' }); return null; }
    return t;
  };
  app.get('/api/support/:id', auth, (req, res) => {
    const t = ticketFor(req, res); if (!t) return;
    res.json({ ...t, replies: q('SELECT r.id,r.body,r.created_at,u.name AS author,u.role FROM support_replies r JOIN users u ON u.id=r.user_id WHERE r.ticket_id=? ORDER BY r.id', t.id) });
  });
  app.post('/api/support/:id/reply', auth, (req, res) => {
    const t = ticketFor(req, res); if (!t) return;
    const body = str(req.body.body, 3000), st = req.body.status;
    if (st != null && (!isIT(req.user) || !TICKET_STATUS.includes(st))) return res.status(400).json({ error: 'Only IT can set the status: open, in_progress or resolved' });
    if (!body && st == null) return res.status(400).json({ error: 'Write a reply first' });
    if (body) run('INSERT INTO support_replies(ticket_id,user_id,body) VALUES(?,?,?)', t.id, req.user.id, body);
    const next = st || (t.user_id === req.user.id && t.status === 'resolved' && body ? 'open' : t.status);
    run("UPDATE support_tickets SET status=?, updated_at=datetime('now') WHERE id=?", next, t.id);
    log(req.user.id, 'support', t.id, body ? 'replied' : 'status', next !== t.status ? `${t.status} -> ${next}` : '');
    if (req.user.id !== t.user_id) notify(t.user_id, `IT replied on your ticket #${t.id} "${t.subject}"${next !== t.status ? ' (now ' + next.replace('_', ' ') + ')' : ''}`);
    else for (const id of itIds()) notify(id, `Reply on ticket #${t.id} "${t.subject}"`);
    res.json({ ok: true, status: next });
  });
  app.get('/api/help/guides', auth, (req, res) => {
    const key = req.user.role === 'admin' ? posOf(req.user) : req.user.role === 'resident' ? 'resident' : req.user.role;
    res.json(isIT(req.user) ? GUIDES : GUIDES.filter(g => g.roles.includes(key) || g.roles.includes('all')));
  });
  const started = Date.now();
  app.get('/api/it/health', auth, itOnly, (req, res) => {
    const pg = one('PRAGMA page_count').page_count, ps = one('PRAGMA page_size').page_size;
    const n = sql => one(sql).n;
    res.json({
      ok: true, uptime_s: Math.round((Date.now() - started) / 1000), node: process.version, db_bytes: pg * ps,
      memory_mb: Math.round(process.memoryUsage().rss / 1048576), version: require('./package.json').version,
      commit: process.env.RENDER_GIT_COMMIT ? process.env.RENDER_GIT_COMMIT.slice(0, 7) : null,
      integrity: one('PRAGMA quick_check').quick_check,
      counts: { users: n('SELECT COUNT(*) AS n FROM users'), requests: n('SELECT COUNT(*) AS n FROM requests'), open_requests: n("SELECT COUNT(*) AS n FROM requests WHERE status!='closed'"),
        open_tickets: n("SELECT COUNT(*) AS n FROM support_tickets WHERE status!='resolved'"), audit_rows: n('SELECT COUNT(*) AS n FROM audit'), staff_on_shift: n('SELECT COUNT(*) AS n FROM staff_shifts WHERE punch_out IS NULL') },
      maintenance: getMaintenance(),
      // IT overview (whiteboard: support queries, training, upgrades/maintenance)
      tickets: { open: n("SELECT COUNT(*) AS n FROM support_tickets WHERE status='open'"), in_progress: n("SELECT COUNT(*) AS n FROM support_tickets WHERE status='in_progress'"),
        resolved_30d: n("SELECT COUNT(*) AS n FROM support_tickets WHERE status='resolved' AND updated_at >= datetime('now','-30 days')") },
      last_backup: (one("SELECT created_at FROM audit WHERE entity='system' AND action='backup' ORDER BY id DESC LIMIT 1") || {}).created_at || null,
      system_events: q("SELECT a.action,a.detail,a.created_at,u.name AS actor FROM audit a LEFT JOIN users u ON u.id=a.actor_id WHERE a.entity='system' ORDER BY a.id DESC LIMIT 8"),
      guides: GUIDES.length,
      hosting_note: process.env.RENDER ? 'Render free plan: the database is wiped on sleep and redeploy. Download a backup before upgrades.' : null,
    });
  });
  app.get('/api/it/backup', auth, itOnly, (req, res) => {
    const file = path.join(os.tmpdir(), 'portal-backup-' + crypto.randomUUID() + '.db');
    try { db.prepare('VACUUM INTO ?').run(file); } catch { return res.status(500).json({ error: 'Backup failed' }); }
    log(req.user.id, 'system', null, 'backup', 'database downloaded');
    res.download(file, `portal-backup-${new Date().toISOString().slice(0, 10)}.db`, () => fs.unlink(file, () => {}));
  });
  app.put('/api/it/maintenance', auth, itOnly, (req, res) => {
    const message = str(req.body.message, 300), until = str(req.body.until, 40);
    putSetting('maintenance', message ? JSON.stringify({ message, until: until || null, by: req.user.name, at: new Date().toISOString() }) : '');
    log(req.user.id, 'system', null, message ? 'maintenance_set' : 'maintenance_cleared', message.slice(0, 120));
    if (message) for (const u of q("SELECT id FROM users WHERE status='approved' AND id!=?", req.user.id)) notify(u.id, 'Planned maintenance: ' + message + (until ? ' (until ' + until + ')' : ''));
    res.json({ maintenance: getMaintenance() });
  });
};
