const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { openDb } = require('./db');

const CATEGORIES = ['plumbing', 'electrical', 'lift', 'security', 'housekeeping', 'other'];
const STATUSES = ['open', 'assigned', 'in_progress', 'closed'];
const RESIDENT_TYPES = ['owner', 'tenant', 'family'];
const ORDER = { open: 0, assigned: 1, in_progress: 2, closed: 3 };

function createApp(opts = {}) {
  const db = openDb(opts.dbFile);
  const uploadDir = opts.uploadDir || path.join(__dirname, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const app = express();
  app.disable('x-powered-by');
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': "default-src 'self'; img-src 'self' data:; style-src 'self' 'unsafe-inline'; script-src 'self'",
    });
    next();
  });
  if (process.env.NODE_ENV === 'production') app.set('trust proxy', 1);
  app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 8 * 3600e3 },
  }));

  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const log = (actor, entity, id, action, detail) =>
    run('INSERT INTO audit(actor_id,entity,entity_id,action,detail) VALUES(?,?,?,?,?)', actor, entity, id, action, detail || null);
  const notify = (uid, msg) => run('INSERT INTO notifications(user_id,message) VALUES(?,?)', uid, msg);
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const publicUser = u => u && { id: u.id, name: u.name, email: u.email, phone: u.phone, flat: u.flat, resident_type: u.resident_type, role: u.role, status: u.status };

  const auth = (req, res, next) => {
    const u = req.session.uid && one('SELECT * FROM users WHERE id=?', req.session.uid);
    if (!u || u.status !== 'approved') return res.status(401).json({ error: 'Not signed in' });
    req.user = u; next();
  };
  const admin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' }));

  const fails = new Map();
  const throttled = k => { const f = fails.get(k); return f && f.n >= 5 && Date.now() - f.t < 15 * 60e3; };

  // ---- auth & onboarding
  app.post('/api/register', (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 100), email = str(b.email, 200).toLowerCase(), flat = str(b.flat, 20);
    const phone = str(b.phone, 20), rtype = b.resident_type, pw = typeof b.password === 'string' ? b.password : '';
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !flat) return res.status(400).json({ error: 'Name, valid email and flat are required' });
    if (!RESIDENT_TYPES.includes(rtype)) return res.status(400).json({ error: 'Choose owner, tenant or family' });
    if (pw.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters' });
    if (b.consent !== true) return res.status(400).json({ error: 'Consent to data processing is required' });
    if (one('SELECT id FROM users WHERE email=?', email)) return res.status(409).json({ error: 'Email already registered' });
    const r = run("INSERT INTO users(name,email,phone,flat,resident_type,password_hash,consent_at) VALUES(?,?,?,?,?,?,datetime('now'))",
      name, email, phone, flat, rtype, bcrypt.hashSync(pw, 10));
    log(r.lastInsertRowid, 'user', r.lastInsertRowid, 'registered', `${rtype} flat ${flat}`);
    for (const a of q("SELECT id FROM users WHERE role='admin'")) notify(a.id, `New registration awaiting approval: ${name} (flat ${flat})`);
    res.status(201).json({ message: 'Registered. An admin will review your account.' });
  });

  app.post('/api/login', (req, res) => {
    const email = str(req.body && req.body.email, 200).toLowerCase();
    const key = req.ip + '|' + email;
    if (throttled(key)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    const u = one('SELECT * FROM users WHERE email=?', email);
    const ok = u && bcrypt.compareSync(String(req.body.password || ''), u.password_hash);
    if (!ok) {
      const f = fails.get(key) || { n: 0 };
      fails.set(key, { n: f.n + 1, t: Date.now() });
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    if (u.status === 'pending') return res.status(403).json({ error: 'Your account is awaiting admin approval' });
    if (u.status !== 'approved') return res.status(403).json({ error: 'Your registration was not approved' });
    fails.delete(key);
    req.session.regenerate(() => { req.session.uid = u.id; log(u.id, 'user', u.id, 'login'); res.json(publicUser(u)); });
  });
  app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
  app.get('/api/me', auth, (req, res) => res.json(publicUser(req.user)));

  // ---- admin: users
  app.get('/api/admin/users', auth, admin, (req, res) => {
    const s = req.query.status;
    res.json(q(`SELECT id,name,email,phone,flat,resident_type,role,status,created_at FROM users ${s ? 'WHERE status=?' : ''} ORDER BY id DESC`, ...(s ? [s] : [])));
  });
  for (const [act, status] of [['approve', 'approved'], ['reject', 'rejected']]) {
    app.post(`/api/admin/users/:id/${act}`, auth, admin, (req, res) => {
      const u = one('SELECT * FROM users WHERE id=?', req.params.id);
      if (!u || u.role === 'admin') return res.status(404).json({ error: 'User not found' });
      run('UPDATE users SET status=? WHERE id=?', status, u.id);
      log(req.user.id, 'user', u.id, act);
      res.json({ ok: true });
    });
  }

  // ---- vendors
  app.get('/api/vendors', auth, admin, (req, res) => res.json(q('SELECT * FROM vendors ORDER BY trade,name')));
  app.post('/api/vendors', auth, admin, (req, res) => {
    const name = str(req.body.name, 100), trade = str(req.body.trade, 50), phone = str(req.body.phone, 20);
    if (!name || !trade) return res.status(400).json({ error: 'Name and trade are required' });
    const r = run('INSERT INTO vendors(name,trade,phone) VALUES(?,?,?)', name, trade, phone);
    log(req.user.id, 'vendor', r.lastInsertRowid, 'created', name);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  // ---- requests
  const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, f, cb) => cb(null, crypto.randomUUID() + EXT[f.mimetype]),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (req, f, cb) => cb(null, !!EXT[f.mimetype]),
  });
  const REQ_SELECT = `SELECT r.*, u.name AS resident_name, u.flat, v.name AS vendor_name FROM requests r
    JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id`;
  // Residents see their own requests and any request from their own flat (owner and family share a flat view).
  const canSee = (u, r) => u.role === 'admin' || r.user_id === u.id || (!!u.flat && r.flat === u.flat);
  // The requester rates, except a family member's request, which the flat owner rates. Family never rates.
  const canRate = (u, r) => u.role !== 'admin' && r.status === 'closed' && !r.rating &&
    ((r.user_id === u.id && u.resident_type !== 'family') || (u.resident_type === 'owner' && r.flat === u.flat));
  const shape = (r, u) => { const { photo, ...rest } = r; return { ...rest, has_photo: !!photo, can_rate: !!u && canRate(u, r) }; };

  app.post('/api/requests', auth,
    (req, res, next) => upload.single('photo')(req, res, err => (err ? res.status(400).json({ error: err.message }) : next())),
    (req, res) => {
      const category = req.body.category, title = str(req.body.title, 120), description = str(req.body.description, 2000);
      if (!CATEGORIES.includes(category) || !title) {
        if (req.file) fs.unlink(req.file.path, () => {});
        return res.status(400).json({ error: 'Valid category and title are required' });
      }
      const r = run('INSERT INTO requests(user_id,category,title,description,photo) VALUES(?,?,?,?,?)',
        req.user.id, category, title, description, req.file ? req.file.filename : null);
      log(req.user.id, 'request', r.lastInsertRowid, 'created', `${category}: ${title}`);
      for (const a of q("SELECT id FROM users WHERE role='admin'")) notify(a.id, `New ${category} request from flat ${req.user.flat}: ${title}`);
      res.status(201).json({ id: Number(r.lastInsertRowid) });
    });

  app.get('/api/requests', auth, (req, res) => {
    const where = [], p = [];
    if (req.user.role !== 'admin') { where.push('(r.user_id=? OR u.flat=?)'); p.push(req.user.id, req.user.flat || ''); }
    if (STATUSES.includes(req.query.status)) { where.push('r.status=?'); p.push(req.query.status); }
    if (CATEGORIES.includes(req.query.category)) { where.push('r.category=?'); p.push(req.query.category); }
    res.json(q(`${REQ_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY r.id DESC`, ...p).map(r => shape(r, req.user)));
  });
  app.get('/api/requests/:id', auth, (req, res) => {
    const r = one(`${REQ_SELECT} WHERE r.id=?`, req.params.id);
    if (!r || !canSee(req.user, r)) return res.status(404).json({ error: 'Request not found' });
    const history = q(`SELECT a.action,a.detail,a.created_at,u.name AS actor FROM audit a LEFT JOIN users u ON u.id=a.actor_id
      WHERE a.entity='request' AND a.entity_id=? ORDER BY a.id`, r.id);
    res.json({ ...shape(r, req.user), history });
  });
  app.get('/api/requests/:id/photo', auth, (req, res) => {
    const r = one(`${REQ_SELECT} WHERE r.id=?`, req.params.id);
    if (!r || !r.photo || !canSee(req.user, r)) return res.status(404).end();
    res.sendFile(path.join(uploadDir, path.basename(r.photo)));
  });

  app.post('/api/requests/:id/assign', auth, admin, (req, res) => {
    const r = one('SELECT * FROM requests WHERE id=?', req.params.id);
    const v = one('SELECT * FROM vendors WHERE id=?', req.body.vendor_id);
    if (!r || !v) return res.status(404).json({ error: 'Request or vendor not found' });
    if (r.status === 'closed') return res.status(409).json({ error: 'Request is closed' });
    run("UPDATE requests SET vendor_id=?, status=CASE WHEN status='open' THEN 'assigned' ELSE status END, updated_at=datetime('now') WHERE id=?", v.id, r.id);
    log(req.user.id, 'request', r.id, 'assigned', v.name);
    notify(r.user_id, `Your request "${r.title}" was assigned to ${v.name}`);
    res.json({ ok: true });
  });
  app.post('/api/requests/:id/status', auth, admin, (req, res) => {
    const r = one('SELECT * FROM requests WHERE id=?', req.params.id);
    const s = req.body.status;
    if (!r) return res.status(404).json({ error: 'Request not found' });
    if (!STATUSES.includes(s)) return res.status(400).json({ error: 'Invalid status' });
    if (r.status === 'closed') return res.status(409).json({ error: 'Request is already closed' });
    if (ORDER[s] <= ORDER[r.status]) return res.status(409).json({ error: `Cannot move from ${r.status} to ${s}` });
    if (!r.vendor_id) return res.status(409).json({ error: 'Assign a vendor first' });
    run("UPDATE requests SET status=?, updated_at=datetime('now') WHERE id=?", s, r.id);
    log(req.user.id, 'request', r.id, 'status', `${r.status} -> ${s}${req.body.note ? ': ' + str(req.body.note, 300) : ''}`);
    notify(r.user_id, `Your request "${r.title}" is now ${s.replace('_', ' ')}`);
    res.json({ ok: true });
  });
  app.post('/api/requests/:id/rate', auth, (req, res) => {
    const r = one(`${REQ_SELECT} WHERE r.id=?`, req.params.id);
    if (!r || !canSee(req.user, r)) return res.status(404).json({ error: 'Request not found' });
    const n = Number(req.body.rating);
    if (r.status !== 'closed') return res.status(409).json({ error: 'You can rate only closed requests' });
    if (r.rating) return res.status(409).json({ error: 'Already rated' });
    if (!canRate(req.user, r)) return res.status(403).json({ error: 'The flat owner rates the work' });
    if (!Number.isInteger(n) || n < 1 || n > 5) return res.status(400).json({ error: 'Rating must be 1 to 5' });
    run('UPDATE requests SET rating=?, rating_comment=? WHERE id=?', n, str(req.body.comment, 500), r.id);
    log(req.user.id, 'request', r.id, 'rated', String(n));
    if (r.user_id !== req.user.id) notify(r.user_id, `Your request "${r.title}" was rated ${n} of 5 by the flat owner`);
    res.json({ ok: true });
  });

  // ---- household (owner adds family members / tenants to their flat; committee approves)
  app.get('/api/household', auth, (req, res) => {
    if (!req.user.flat) return res.json([]);
    res.json(q("SELECT id,name,resident_type,status,phone FROM users WHERE flat=? AND role!='admin' AND status!='rejected' ORDER BY (resident_type='owner') DESC, id", req.user.flat));
  });
  app.post('/api/household', auth, (req, res) => {
    if (req.user.resident_type !== 'owner') return res.status(403).json({ error: 'Only the flat owner can add household members' });
    const b = req.body || {};
    const name = str(b.name, 100), email = str(b.email, 200).toLowerCase(), phone = str(b.phone, 20), rtype = b.resident_type;
    const pw = typeof b.password === 'string' ? b.password : '';
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Name and a valid email are required' });
    if (!['family', 'tenant'].includes(rtype)) return res.status(400).json({ error: 'Add a family member or a tenant' });
    if (pw.length < 8) return res.status(400).json({ error: 'Temporary password must be at least 8 characters' });
    if (b.consent !== true) return res.status(400).json({ error: 'Consent to data processing is required' });
    if (one('SELECT id FROM users WHERE email=?', email)) return res.status(409).json({ error: 'Email already registered' });
    const r = run("INSERT INTO users(name,email,phone,flat,resident_type,password_hash,consent_at) VALUES(?,?,?,?,?,?,datetime('now'))",
      name, email, phone, req.user.flat, rtype, bcrypt.hashSync(pw, 10));
    log(req.user.id, 'user', r.lastInsertRowid, 'household_added', `${rtype} flat ${req.user.flat}`);
    for (const a of q("SELECT id FROM users WHERE role='admin'")) notify(a.id, `${req.user.name} added ${name} (${rtype}) to flat ${req.user.flat}: awaiting approval`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  // ---- tenant lease (set by the committee, read by the tenant)
  app.get('/api/lease', auth, (req, res) => res.json(one('SELECT * FROM leases WHERE user_id=?', req.user.id) || null));
  app.put('/api/admin/users/:id/lease', auth, admin, (req, res) => {
    const u = one("SELECT * FROM users WHERE id=? AND resident_type='tenant'", req.params.id);
    if (!u) return res.status(404).json({ error: 'Tenant not found' });
    const b = req.body || {}, d = v => (/^\d{4}-\d{2}-\d{2}$/.test(v) ? v : '');
    const f = { start_date: d(b.start_date), end_date: d(b.end_date), owner_name: str(b.owner_name, 100), owner_phone: str(b.owner_phone, 20),
      police_verified_on: d(b.police_verified_on), agreement: str(b.agreement, 200), parking: str(b.parking, 100) };
    if (!f.start_date || !f.end_date || f.end_date <= f.start_date) return res.status(400).json({ error: 'Valid start and end dates are required' });
    run(`INSERT INTO leases(user_id,start_date,end_date,owner_name,owner_phone,police_verified_on,agreement,parking) VALUES(?,?,?,?,?,?,?,?)
      ON CONFLICT(user_id) DO UPDATE SET start_date=excluded.start_date,end_date=excluded.end_date,owner_name=excluded.owner_name,owner_phone=excluded.owner_phone,
      police_verified_on=excluded.police_verified_on,agreement=excluded.agreement,parking=excluded.parking`,
      u.id, f.start_date, f.end_date, f.owner_name, f.owner_phone, f.police_verified_on, f.agreement, f.parking);
    log(req.user.id, 'user', u.id, 'lease_set', `${f.start_date} to ${f.end_date}`);
    notify(u.id, `Your lease details were updated (ends ${f.end_date})`);
    res.json({ ok: true });
  });
  app.get('/api/admin/leases', auth, admin, (req, res) => res.json(q(`SELECT u.id AS user_id, u.name, u.flat, u.email, u.phone, l.start_date, l.end_date, l.owner_name,
    l.owner_phone, l.police_verified_on, l.agreement, l.parking FROM users u LEFT JOIN leases l ON l.user_id=u.id
    WHERE u.resident_type='tenant' AND u.status='approved' ORDER BY (l.end_date IS NOT NULL), l.end_date, u.name`)));

  // ---- live updates: clients poll this and only redraw when the token changes (no data is returned, just a version string)
  app.get('/api/pulse', auth, (req, res) => {
    const u = req.user;
    if (u.role === 'admin') {
      return res.json({ v: [one('SELECT COALESCE(MAX(id),0) AS m FROM audit').m, one("SELECT COUNT(*) AS n FROM users WHERE status='pending'").n, one('SELECT COALESCE(MAX(id),0) AS m FROM notices').m].join('|') });
    }
    const r = one(`SELECT COUNT(*) AS n, COALESCE(MAX(r.updated_at),'') AS m, COALESCE(SUM(r.rating IS NOT NULL),0) AS rated FROM requests r JOIN users x ON x.id=r.user_id WHERE r.user_id=? OR x.flat=?`, u.id, u.flat || '');
    res.json({ v: [r.n, r.m, r.rated, one('SELECT COALESCE(MAX(id),0) AS m FROM notifications WHERE user_id=?', u.id).m, one('SELECT COALESCE(MAX(id),0) AS m FROM notices').m,
      one("SELECT COUNT(*) AS n FROM users WHERE flat=? AND status='approved'", u.flat || '').n].join('|') });
  });

  // ---- dashboard, audit, export
  app.get('/api/admin/stats', auth, admin, (req, res) => {
    res.json({
      by_status: q('SELECT status, COUNT(*) AS n FROM requests GROUP BY status'),
      by_category_open: q("SELECT category, COUNT(*) AS n FROM requests WHERE status!='closed' GROUP BY category"),
      pending_users: one("SELECT COUNT(*) AS n FROM users WHERE status='pending'").n,
      avg_rating: one('SELECT ROUND(AVG(rating),2) AS a FROM requests WHERE rating IS NOT NULL').a,
      oldest_open: q("SELECT id,title,category,created_at FROM requests WHERE status!='closed' ORDER BY id LIMIT 5"),
      by_category: q(`SELECT category, SUM(status!='closed') AS open, SUM(created_at >= datetime('now','-30 days')) AS raised_30d FROM requests GROUP BY category`),
      weekly: q(`SELECT CAST((julianday(date('now')) - julianday(date(created_at))) / 7 AS INTEGER) AS weeks_ago, COUNT(*) AS n
        FROM requests WHERE created_at >= datetime('now','-56 days') GROUP BY weeks_ago`),
      vendor_ratings: q(`SELECT v.id, v.name, v.trade, ROUND(AVG(r.rating),1) AS avg, COUNT(r.rating) AS n FROM vendors v
        LEFT JOIN requests r ON r.vendor_id=v.id AND r.rating IS NOT NULL GROUP BY v.id ORDER BY avg DESC`),
      // SLA: within the 48h target if still young, or closed within 48h of being raised.
      sla: one(`SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN status!='closed' AND julianday('now')-julianday(created_at) > 2 THEN 1 ELSE 0 END),0) AS overdue,
        COALESCE(SUM(CASE WHEN (status='closed' AND julianday(updated_at)-julianday(created_at) <= 2)
                   OR (status!='closed' AND julianday('now')-julianday(created_at) <= 2) THEN 1 ELSE 0 END),0) AS within FROM requests`),
      unassigned: one("SELECT COUNT(*) AS n FROM requests WHERE vendor_id IS NULL AND status!='closed'").n,
      awaiting_rating: one("SELECT COUNT(*) AS n FROM requests WHERE status='closed' AND rating IS NULL").n,
      notices_30d: one("SELECT COUNT(*) AS n FROM notices WHERE created_at >= datetime('now','-30 days')").n,
      households: one("SELECT COUNT(DISTINCT flat) AS n FROM users WHERE status='approved' AND role!='admin'").n,
    });
  });
  app.get('/api/admin/audit', auth, admin, (req, res) => {
    res.json(q(`SELECT a.id,a.entity,a.entity_id,a.action,a.detail,a.created_at,u.name AS actor FROM audit a
      LEFT JOIN users u ON u.id=a.actor_id ORDER BY a.id DESC LIMIT 200`));
  });
  app.get('/api/admin/export.csv', auth, admin, (req, res) => {
    const esc = v => {
      let s = v == null ? '' : String(v);
      if (/^[=+\-@]/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = q(`${REQ_SELECT} ORDER BY r.id`);
    const cols = ['id', 'resident_name', 'flat', 'category', 'title', 'status', 'vendor_name', 'rating', 'created_at', 'updated_at'];
    res.type('text/csv').attachment('requests.csv').send([cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n'));
  });

  // ---- notices & notifications
  app.get('/api/notices', auth, (req, res) => res.json(q('SELECT n.*,u.name AS author FROM notices n JOIN users u ON u.id=n.author_id ORDER BY n.id DESC')));
  app.post('/api/notices', auth, admin, (req, res) => {
    const title = str(req.body.title, 150), body = str(req.body.body, 5000);
    if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });
    const r = run('INSERT INTO notices(title,body,author_id) VALUES(?,?,?)', title, body, req.user.id);
    log(req.user.id, 'notice', r.lastInsertRowid, 'posted', title);
    for (const u of q("SELECT id FROM users WHERE status='approved' AND id!=?", req.user.id)) notify(u.id, `New notice: ${title}`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.get('/api/notifications', auth, (req, res) => res.json(q('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50', req.user.id)));
  app.post('/api/notifications/read', auth, (req, res) => { run('UPDATE notifications SET is_read=1 WHERE user_id=?', req.user.id); res.json({ ok: true }); });

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  app.locals.db = db;
  return app;
}
module.exports = { createApp };
