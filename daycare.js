// Daycare services (2026-11-28, contract docs/daycare-api.md). The committee registers daycare providers in or near the
// society. A parent asks for a place with the child's first name and age only (minimum data: no surname, no date of
// birth), a start date and weekdays; the committee approves or declines, and the parent can cancel. Approved
// enrolments never exceed a provider's capacity. Each day the committee marks drop-off and pick-up, and the parent sees
// today's status. Fees are recorded only: there is no payment. Dates and times are India time. Every change is audited.

const DAYS = ['mon', 'tue', 'wed', 'thu', 'fri'];
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const validDate = s => YMD.test(s || '') && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
const CHILD = /^[\p{L}][\p{L}'-]{0,29}$/u; // one word: a first name, no surname
const PHONE = /^\+?[\d\s-]{6,20}$/;
const weekday = ymd => ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'][new Date(ymd + 'T00:00:00Z').getUTCDay()];

module.exports = function mountDaycare(app, c) {
  const { q, one, run, log, notify, auth, admin, str, committeeIds, istNow } = c;
  const clock = c.clock || (() => new Date());
  const now = () => istNow(clock());
  const bad = (res, error) => res.status(400).json({ error });
  const resident = (req, res, next) => (req.user.role === 'resident' && req.user.flat ? next() : res.status(403).json({ error: 'Residents with a flat only' }));
  const residentOrCommittee = (req, res, next) => (['resident', 'admin'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed for this account' }));
  const notifyCommittee = msg => { for (const id of committeeIds()) notify(id, msg); };
  const taken = pid => one("SELECT COUNT(*) AS n FROM daycare_enrolments WHERE provider_id=? AND status='approved'", pid).n;

  const parseProvider = b => {
    const name = str(b.name, 80), hours = str(b.hours, 80), location = str(b.location, 120), phone = str(b.phone, 20), notes = str(b.notes, 500);
    const ageMin = Number(b.age_min), ageMax = Number(b.age_max), capacity = Number(b.capacity), fee = Math.round(Number(b.fee_month) * 100) / 100;
    if (!name) return ['Give the daycare a name'];
    if (!Number.isInteger(ageMin) || !Number.isInteger(ageMax) || ageMin < 0 || ageMax > 14 || ageMin > ageMax) return ['Ages must be whole years from 0 to 14, minimum not above maximum'];
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > 200) return ['Capacity must be 1 to 200 children'];
    if (!hours) return ['Give the opening hours'];
    if (!(fee >= 0) || fee > 100000) return ['Fee per month must be between ₹0 and ₹1,00,000'];
    if (!location) return ['Give the location'];
    if (!PHONE.test(phone) || phone.replace(/\D/g, '').length < 6) return ['Give a phone number for the daycare'];
    return [null, { name, age_min: ageMin, age_max: ageMax, capacity, hours, fee_month: fee, location, phone, notes: notes || null }];
  };

  const providerOut = (p, full) => ({
    id: p.id, name: p.name, age_min: p.age_min, age_max: p.age_max, capacity: p.capacity, places_left: Math.max(0, p.capacity - taken(p.id)),
    hours: p.hours, fee_month: p.fee_month, location: p.location, phone: p.phone, notes: p.notes, active: !!p.active, ...(full ? { created_at: p.created_at } : {}),
  });

  // ---------- providers
  app.get('/api/daycare/providers', auth, residentOrCommittee, (req, res) => {
    const isAdmin = req.user.role === 'admin';
    res.json(q(`SELECT * FROM daycare_providers ${isAdmin ? '' : 'WHERE active=1'} ORDER BY active DESC, name COLLATE NOCASE, id`).map(p => providerOut(p, isAdmin)));
  });

  app.post('/api/daycare/providers', auth, admin, (req, res) => {
    const [err, f] = parseProvider(req.body || {});
    if (err) return bad(res, err);
    const r = run('INSERT INTO daycare_providers(name,age_min,age_max,capacity,hours,fee_month,location,phone,notes,created_by) VALUES(?,?,?,?,?,?,?,?,?,?)',
      f.name, f.age_min, f.age_max, f.capacity, f.hours, f.fee_month, f.location, f.phone, f.notes, req.user.id);
    log(req.user.id, 'daycare_provider', r.lastInsertRowid, 'registered', `${f.name}, ages ${f.age_min}-${f.age_max}, ${f.capacity} places`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  app.put('/api/daycare/providers/:id', auth, admin, (req, res) => {
    const p = one('SELECT * FROM daycare_providers WHERE id=?', req.params.id);
    if (!p || !p.active) return res.status(404).json({ error: 'Daycare not found' });
    const [err, f] = parseProvider(req.body || {});
    if (err) return bad(res, err);
    const n = taken(p.id);
    if (f.capacity < n) return res.status(409).json({ error: `${n} children are enrolled: capacity cannot go below that` });
    run('UPDATE daycare_providers SET name=?, age_min=?, age_max=?, capacity=?, hours=?, fee_month=?, location=?, phone=?, notes=? WHERE id=?',
      f.name, f.age_min, f.age_max, f.capacity, f.hours, f.fee_month, f.location, f.phone, f.notes, p.id);
    log(req.user.id, 'daycare_provider', p.id, 'edited', `${f.name}, ${f.capacity} places`);
    res.json({ ok: true });
  });

  // Close a provider: pending and approved enrolments are cancelled and the parents are told.
  app.delete('/api/daycare/providers/:id', auth, admin, (req, res) => {
    const p = one('SELECT * FROM daycare_providers WHERE id=?', req.params.id);
    if (!p || !p.active) return res.status(404).json({ error: 'Daycare not found' });
    const open = q("SELECT id, parent_id, child_name FROM daycare_enrolments WHERE provider_id=? AND status IN ('pending','approved')", p.id);
    run('UPDATE daycare_providers SET active=0 WHERE id=?', p.id);
    run("UPDATE daycare_enrolments SET status='cancelled', reason='The daycare was closed', decided_by=?, decided_at=datetime('now') WHERE provider_id=? AND status IN ('pending','approved')", req.user.id, p.id);
    log(req.user.id, 'daycare_provider', p.id, 'closed', `${p.name}: ${open.length} enrolment(s) cancelled`);
    for (const e of open) notify(e.parent_id, `${p.name} is no longer listed, so ${e.child_name}'s place was cancelled`);
    res.json({ ok: true, cancelled: open.length });
  });

  // ---------- enrolments
  const enrolSelect = `SELECT e.*, p.name AS provider_name, p.hours AS provider_hours, p.fee_month, p.phone AS provider_phone, u.name AS parent_name
    FROM daycare_enrolments e JOIN daycare_providers p ON p.id=e.provider_id JOIN users u ON u.id=e.parent_id`;
  const enrolOut = (e, today) => {
    const a = one('SELECT in_at, out_at FROM daycare_attendance WHERE enrolment_id=? AND date=?', e.id, today);
    return {
      id: e.id, provider: { id: e.provider_id, name: e.provider_name, hours: e.provider_hours, fee_month: e.fee_month, phone: e.provider_phone },
      child_name: e.child_name, child_age: e.child_age, start_date: e.start_date, days: String(e.days).split(','), status: e.status, reason: e.reason,
      flat: e.flat, parent: e.parent_name, created_at: e.created_at, decided_at: e.decided_at,
      today: { date: today, scheduled: e.status === 'approved' && e.start_date <= today && String(e.days).split(',').includes(weekday(today)), in_at: a ? a.in_at : null, out_at: a ? a.out_at : null },
    };
  };

  // Residents see their flat's enrolments; the committee sees all (?status= to filter).
  app.get('/api/daycare/enrolments', auth, residentOrCommittee, (req, res) => {
    const today = now().date, isAdmin = req.user.role === 'admin';
    const where = [], args = [];
    if (!isAdmin) { where.push('e.flat=?'); args.push(req.user.flat || ''); }
    if (req.query.status) { where.push('e.status=?'); args.push(String(req.query.status)); }
    const rows = q(`${enrolSelect} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY CASE e.status WHEN 'pending' THEN 0 WHEN 'approved' THEN 1 ELSE 2 END, e.id DESC LIMIT 300`, ...args);
    res.json(rows.map(e => enrolOut(e, today)));
  });

  app.post('/api/daycare/enrolments', auth, resident, (req, res) => {
    const b = req.body || {}, today = now().date;
    const p = one('SELECT * FROM daycare_providers WHERE id=? AND active=1', Number(b.provider_id));
    if (!p) return res.status(404).json({ error: 'Daycare not found' });
    const child = str(b.child_name, 30);
    if (!CHILD.test(child)) return bad(res, "Give the child's first name only");
    const age = Number(b.child_age);
    if (!Number.isInteger(age) || age < 0 || age > 14) return bad(res, "Give the child's age in whole years");
    if (age < p.age_min || age > p.age_max) return bad(res, `${p.name} takes children aged ${p.age_min} to ${p.age_max}`);
    if (!validDate(b.start_date) || b.start_date < today) return bad(res, 'Choose a start date from today on');
    const days = Array.isArray(b.days) ? [...new Set(b.days.map(String))] : [];
    if (!days.length || days.some(d => !DAYS.includes(d))) return bad(res, 'Choose one or more weekdays (Monday to Friday)');
    const daysStr = DAYS.filter(d => days.includes(d)).join(',');
    if (one("SELECT id FROM daycare_enrolments WHERE provider_id=? AND flat=? AND child_name=? COLLATE NOCASE AND status IN ('pending','approved')", p.id, req.user.flat, child)) return res.status(409).json({ error: `${child} already has a place or a request at ${p.name}` });
    const r = run('INSERT INTO daycare_enrolments(provider_id,parent_id,flat,child_name,child_age,start_date,days) VALUES(?,?,?,?,?,?,?)', p.id, req.user.id, req.user.flat, child, age, b.start_date, daysStr);
    log(req.user.id, 'daycare_enrolment', r.lastInsertRowid, 'requested', `${p.name} from ${b.start_date} (${daysStr})`);
    notifyCommittee(`Daycare request: a place at ${p.name} from ${b.start_date} for a child aged ${age}, Flat ${req.user.flat}`);
    res.status(201).json({ id: Number(r.lastInsertRowid), status: 'pending' });
  });

  app.post('/api/daycare/enrolments/:id/decide', auth, admin, (req, res) => {
    const e = one(`${enrolSelect} WHERE e.id=?`, req.params.id);
    if (!e) return res.status(404).json({ error: 'Enrolment not found' });
    const d = (req.body || {}).decision, reason = str((req.body || {}).reason, 300) || null;
    if (!['approve', 'decline'].includes(d)) return bad(res, 'Decision must be approve or decline');
    if (e.status !== 'pending') return res.status(409).json({ error: 'This request is not waiting for a decision' });
    if (d === 'approve') {
      const p = one('SELECT capacity, active FROM daycare_providers WHERE id=?', e.provider_id);
      if (!p.active) return res.status(409).json({ error: 'This daycare is closed' });
      if (taken(e.provider_id) >= p.capacity) return res.status(409).json({ error: `${e.provider_name} is full` });
    }
    const status = d === 'approve' ? 'approved' : 'declined';
    run("UPDATE daycare_enrolments SET status=?, reason=?, decided_by=?, decided_at=datetime('now') WHERE id=?", status, reason, req.user.id, e.id);
    log(req.user.id, 'daycare_enrolment', e.id, status, `${e.provider_name}${reason ? ': ' + reason : ''}`);
    notify(e.parent_id, d === 'approve'
      ? `${e.child_name} has a place at ${e.provider_name} from ${e.start_date}`
      : `${e.provider_name} could not take ${e.child_name}${reason ? ': ' + reason : ''}`);
    res.json({ ok: true, status });
  });

  // A parent in the flat cancels a pending request or an approved place; the committee is told.
  app.post('/api/daycare/enrolments/:id/cancel', auth, resident, (req, res) => {
    const e = one(`${enrolSelect} WHERE e.id=?`, req.params.id);
    if (!e || e.flat !== req.user.flat) return res.status(404).json({ error: 'Enrolment not found' });
    if (!['pending', 'approved'].includes(e.status)) return res.status(409).json({ error: 'Nothing to cancel' });
    run("UPDATE daycare_enrolments SET status='cancelled', decided_at=datetime('now') WHERE id=?", e.id);
    log(req.user.id, 'daycare_enrolment', e.id, 'cancelled', e.provider_name);
    notifyCommittee(`Flat ${e.flat} cancelled a daycare place at ${e.provider_name}`);
    res.json({ ok: true });
  });

  // ---------- today's register (the committee marks drop-off and pick-up)
  app.get('/api/daycare/today', auth, admin, (req, res) => {
    const today = now().date;
    const rows = q(`${enrolSelect} WHERE e.status='approved' AND e.start_date<=? ORDER BY p.name COLLATE NOCASE, e.child_name COLLATE NOCASE`, today).map(e => enrolOut(e, today));
    // Children scheduled today, plus anyone already marked in (an extra day).
    res.json({ date: today, weekday: weekday(today), children: rows.filter(e => e.today.scheduled || e.today.in_at) });
  });

  const mark = kind => (req, res) => {
    const e = one(`${enrolSelect} WHERE e.id=?`, req.params.id);
    if (!e) return res.status(404).json({ error: 'Enrolment not found' });
    const n = now();
    if (e.status !== 'approved' || e.start_date > n.date) return res.status(409).json({ error: 'This child has no place today' });
    const a = one('SELECT * FROM daycare_attendance WHERE enrolment_id=? AND date=?', e.id, n.date);
    if (kind === 'in') {
      if (a) return res.status(409).json({ error: `${e.child_name} was already dropped off at ${a.in_at}` });
      run('INSERT INTO daycare_attendance(enrolment_id,date,in_at,in_by) VALUES(?,?,?,?)', e.id, n.date, n.time, req.user.id);
      log(req.user.id, 'daycare_enrolment', e.id, 'dropped_off', `${n.date} ${n.time}`);
    } else {
      if (!a) return res.status(409).json({ error: `${e.child_name} has not been dropped off today` });
      if (a.out_at) return res.status(409).json({ error: `${e.child_name} was already picked up at ${a.out_at}` });
      run('UPDATE daycare_attendance SET out_at=?, out_by=? WHERE id=?', n.time, req.user.id, a.id);
      log(req.user.id, 'daycare_enrolment', e.id, 'picked_up', `${n.date} ${n.time}`);
      notify(e.parent_id, `${e.child_name} was picked up from ${e.provider_name} at ${n.time}`);
    }
    res.json({ ok: true, date: n.date, time: n.time });
  };
  app.post('/api/daycare/enrolments/:id/checkin', auth, admin, mark('in'));
  app.post('/api/daycare/enrolments/:id/checkout', auth, admin, mark('out'));
};
module.exports.DAYS = DAYS;
