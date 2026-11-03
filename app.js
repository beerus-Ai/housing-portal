const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { openDb, PERMISSIONS, ACCESS_ROLES } = require('./db');

const CATEGORIES = ['plumbing', 'electrical', 'lift', 'security', 'housekeeping', 'other'];
const STATUSES = ['open', 'assigned', 'in_progress', 'closed'];
const RESIDENT_TYPES = ['owner', 'tenant', 'family'];
const FEATURES = ['emergency', 'gate', 'contacts', 'notices'];
const SETTING_DEFAULTS = { society_name: 'Sahyadri Heights', society_kind: 'Co-operative Housing Society', google_client_id: '' };
const CSP_BASE = {
  'default-src': ["'self'"], 'img-src': ["'self'", 'data:'], 'style-src': ["'self'", "'unsafe-inline'"], 'script-src': ["'self'"],
  'object-src': ["'none'"], 'base-uri': ["'self'"], 'form-action': ["'self'"], 'frame-ancestors': ["'none'"],
};
const ORDER = { open: 0, assigned: 1, in_progress: 2, closed: 3 };

function createApp(opts = {}) {
  const db = openDb(opts.dbFile);
  const uploadDir = opts.uploadDir || path.join(__dirname, 'uploads');
  fs.mkdirSync(uploadDir, { recursive: true });
  const app = express();
  app.disable('x-powered-by');
  const prod = process.env.NODE_ENV === 'production';
  if (prod && !process.env.SESSION_SECRET) throw new Error('SESSION_SECRET must be set in production');
  app.use(express.json({ limit: '100kb' }));
  app.use((req, res, next) => { if (!req.body || typeof req.body !== 'object') req.body = {}; next(); });
  const getSetting = k => { const r = db.prepare('SELECT value FROM settings WHERE key=?').get(k); return r ? r.value : SETTING_DEFAULTS[k]; };
  const getFeatures = () => {
    let f = {};
    try { f = JSON.parse(getSetting('features') || '{}'); } catch { /* use defaults */ }
    return Object.fromEntries(FEATURES.map(k => [k, f[k] !== false]));
  };
  const publicSettings = () => ({ society_name: getSetting('society_name'), society_kind: getSetting('society_kind'), google_client_id: getSetting('google_client_id'), features: getFeatures() });
  const cspHeader = () => {
    const d = Object.fromEntries(Object.entries(CSP_BASE).map(([k, v]) => [k, [...v]]));
    if (getSetting('google_client_id')) {
      d['script-src'].push('https://accounts.google.com/gsi/client');
      d['connect-src'] = ["'self'", 'https://accounts.google.com/gsi/'];
      d['frame-src'] = ['https://accounts.google.com/gsi/'];
      d['style-src'].push('https://accounts.google.com/gsi/style');
      d['img-src'].push('https://*.googleusercontent.com');
    }
    return Object.entries(d).map(([k, v]) => `${k} ${v.join(' ')}`).join('; ');
  };
  app.use((req, res, next) => {
    res.set({
      'X-Content-Type-Options': 'nosniff', 'X-Frame-Options': 'DENY', 'Referrer-Policy': 'same-origin',
      'Content-Security-Policy': cspHeader(),
      'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Resource-Policy': 'same-origin',
      'Permissions-Policy': 'camera=(self), microphone=(), geolocation=()',
    });
    if (prod) res.set('Strict-Transport-Security', 'max-age=15552000; includeSubDomains');
    if (req.path.startsWith('/api/')) res.set('Cache-Control', 'no-store');
    // CSRF defence in depth: reject cross-origin state-changing API calls (SameSite=Lax is the primary control).
    if (req.path.startsWith('/api/') && !['GET', 'HEAD', 'OPTIONS'].includes(req.method) && req.get('origin')) {
      let ok = false;
      try { ok = new URL(req.get('origin')).host === req.get('host'); } catch { /* bad origin */ }
      if (!ok) return res.status(403).json({ error: 'Cross-origin request blocked' });
    }
    next();
  });
  if (prod) app.set('trust proxy', 1);
  app.use(session({
    secret: process.env.SESSION_SECRET || crypto.randomBytes(32).toString('hex'),
    resave: false, saveUninitialized: false,
    cookie: { httpOnly: true, sameSite: 'lax', secure: prod, maxAge: 8 * 3600e3 },
  }));

  const q = (sql, ...p) => db.prepare(sql).all(...p);
  const one = (sql, ...p) => db.prepare(sql).get(...p);
  const run = (sql, ...p) => db.prepare(sql).run(...p);
  const log = (actor, entity, id, action, detail) =>
    run('INSERT INTO audit(actor_id,entity,entity_id,action,detail) VALUES(?,?,?,?,?)', actor, entity, id, action, detail || null);
  const notify = (uid, msg) => run('INSERT INTO notifications(user_id,message) VALUES(?,?)', uid, msg);
  const str = (v, max) => (typeof v === 'string' ? v.trim().slice(0, max) : '');
  const publicUser = u => u && { id: u.id, name: u.name, email: u.email, phone: u.phone, flat: u.flat, resident_type: u.resident_type, role: u.role, status: u.status };

  // Session is bound to the current password hash, so a password reset signs the user out everywhere.
  const pwFp = u => crypto.createHash('sha256').update(u.password_hash).digest('hex').slice(0, 16);
  const auth = (req, res, next) => {
    const u = req.session.uid && one('SELECT * FROM users WHERE id=?', req.session.uid);
    if (!u || u.status !== 'approved' || req.session.pf !== pwFp(u)) return res.status(401).json({ error: 'Not signed in' });
    // Guards get a strict allow-list so no resident/committee route can ever leak data to them.
    if (u.role === 'guard') {
      const p = req.path, m = req.method;
      const okGuard = (m === 'GET' && p === '/api/me') || (m === 'POST' && (p === '/api/me/password' || p === '/api/gate/verify')) ||
        (m === 'GET' && (p === '/api/gate/log' || p === '/api/pulse')) || p === '/api/notifications' || p.startsWith('/api/notifications/');
      if (!okGuard) return res.status(403).json({ error: 'Not allowed for guard accounts' });
    }
    req.user = u; next();
  };
  const gate = (req, res, next) => (['guard', 'admin'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Gate staff only' }));
  const feat = name => (req, res, next) => (req.user.role === 'admin' || getFeatures()[name] ? next() : res.status(403).json({ error: 'This feature is turned off' }));
  const allowedKeys = u => {
    if (u.role === 'admin') return PERMISSIONS.map(p => p.key);
    if (u.role !== 'resident' || !ACCESS_ROLES.includes(u.resident_type)) return [];
    return q('SELECT permission FROM role_permissions WHERE role=? AND allowed=1', u.resident_type).map(r => r.permission).filter(k => PERMISSIONS.some(p => p.key === k));
  };
  const can = key => (req, res, next) => (allowedKeys(req.user).includes(key) ? next() : res.status(403).json({ error: 'Your role does not have access to this' }));
  const admin = (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Admin only' }));

  const fails = new Map();
  const WINDOW = 15 * 60e3;
  const throttled = (k, max = 5) => {
    const f = fails.get(k);
    if (!f) return false;
    if (Date.now() - f.t >= WINDOW) { fails.delete(k); return false; }
    return f.n >= max;
  };
  const fail = k => {
    if (fails.size > 10000) for (const [key, f] of fails) if (Date.now() - f.t >= WINDOW) fails.delete(key);
    const f = fails.get(k);
    fails.set(k, { n: (f && Date.now() - f.t < WINDOW ? f.n : 0) + 1, t: Date.now() });
  };
  const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', 10); // equalise timing for unknown emails
  const pwStr = v => (typeof v === 'string' ? v.slice(0, 128) : '');

  // ---- auth & onboarding
  app.post('/api/register', (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 100), email = str(b.email, 200).toLowerCase(), flat = str(b.flat, 20);
    const phone = str(b.phone, 20), rtype = b.resident_type, pw = typeof b.password === 'string' ? b.password : '';
    if (!name || !/^\S+@\S+\.\S+$/.test(email) || !flat) return res.status(400).json({ error: 'Name, valid email and flat are required' });
    if (!RESIDENT_TYPES.includes(rtype)) return res.status(400).json({ error: 'Choose owner, tenant or family' });
    if (pw.length < 8 || pw.length > 128) return res.status(400).json({ error: 'Password must be 8 to 128 characters' });
    if (b.consent !== true) return res.status(400).json({ error: 'Consent to data processing is required' });
    if (one('SELECT id FROM users WHERE email=?', email)) return res.status(409).json({ error: 'Email already registered' });
    const r = run("INSERT INTO users(name,email,phone,flat,resident_type,password_hash,consent_at) VALUES(?,?,?,?,?,?,datetime('now'))",
      name, email, phone, flat, rtype, bcrypt.hashSync(pw, 10));
    log(r.lastInsertRowid, 'user', r.lastInsertRowid, 'registered', `${rtype} flat ${flat}`);
    for (const a of q("SELECT id FROM users WHERE role='admin'")) notify(a.id, `New registration awaiting approval: ${name} (flat ${flat})`);
    res.status(201).json({ message: 'Registered. An admin will review your account.' });
  });

  const statusBlock = u => ({
    pending: 'Your account is awaiting admin approval',
    suspended: 'Your account is suspended. Contact the committee.',
    removed: 'This account is no longer active. Contact the committee.',
  })[u.status] || (u.status !== 'approved' ? 'Your registration was not approved' : null);
  app.post('/api/login', (req, res) => {
    const email = str(req.body && req.body.email, 200).toLowerCase();
    const key = req.ip + '|' + email, ipKey = 'ip|' + req.ip;
    if (throttled(key) || throttled(ipKey, 30)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    const u = one('SELECT * FROM users WHERE email=?', email);
    const match = bcrypt.compareSync(pwStr(req.body.password), u ? u.password_hash : DUMMY_HASH);
    const ok = u && match;
    if (!ok) {
      fail(key); fail(ipKey);
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    const blocked = statusBlock(u);
    if (blocked) return res.status(403).json({ error: blocked });
    fails.delete(key);
    req.session.regenerate(() => { req.session.uid = u.id; req.session.pf = pwFp(u); log(u.id, 'user', u.id, 'login'); res.json(publicUser(u)); });
  });

  // Google sign-in: only ever signs in an EXISTING approved account, matched on the verified email.
  const googleVerify = opts.googleVerify || (async credential => {
    const r = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential), { signal: AbortSignal.timeout(5000) });
    if (!r.ok) throw new Error('token rejected');
    return r.json();
  });
  app.post('/api/auth/google', async (req, res) => {
    const ipKey = 'ip|' + req.ip;
    if (throttled(ipKey, 30)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    const clientId = getSetting('google_client_id');
    if (!clientId) return res.status(404).json({ error: 'Google sign-in is not set up' });
    const cred = req.body && req.body.credential;
    if (typeof cred !== 'string' || !cred || cred.length > 4096) return res.status(400).json({ error: 'Missing Google credential' });
    let c;
    try { c = await googleVerify(cred); } catch { c = null; }
    const verified = c && (c.email_verified === true || c.email_verified === 'true');
    const expOk = c && Number(c.exp) * 1000 > Date.now();
    const issOk = c && ['accounts.google.com', 'https://accounts.google.com'].includes(c.iss);
    if (!c || c.aud !== clientId || !issOk || !verified || !expOk || typeof c.email !== 'string') {
      fail(ipKey);
      return res.status(401).json({ error: 'Google sign-in could not be verified' });
    }
    const u = one('SELECT * FROM users WHERE email=?', c.email.trim().toLowerCase());
    if (!u) return res.status(404).json({ error: 'No account for this Google email. Join first, then sign in.' });
    const blocked = statusBlock(u);
    if (blocked) return res.status(403).json({ error: blocked });
    req.session.regenerate(() => { req.session.uid = u.id; req.session.pf = pwFp(u); log(u.id, 'user', u.id, 'login', 'method google'); res.json(publicUser(u)); });
  });
  app.get('/api/settings', (req, res) => res.json(publicSettings()));
  app.patch('/api/me', auth, (req, res) => {
    const name = str(req.body && req.body.name, 100) || req.user.name, phone = req.body && 'phone' in req.body ? str(req.body.phone, 20) : req.user.phone;
    run('UPDATE users SET name=?, phone=? WHERE id=?', name, phone, req.user.id);
    log(req.user.id, 'user', req.user.id, 'profile_updated');
    res.json(publicUser(one('SELECT * FROM users WHERE id=?', req.user.id)));
  });
  app.post('/api/me/password', auth, (req, res) => {
    const cur = typeof (req.body && req.body.current) === 'string' ? req.body.current : '', next = typeof (req.body && req.body.next) === 'string' ? req.body.next : '';
    const pk = 'pw|' + req.user.id;
    if (throttled(pk)) return res.status(429).json({ error: 'Too many attempts. Try again later.' });
    if (!bcrypt.compareSync(cur.slice(0, 128), req.user.password_hash)) { fail(pk); return res.status(403).json({ error: 'Current password is wrong' }); }
    fails.delete(pk);
    if (next.length < 8 || next.length > 128) return res.status(400).json({ error: 'New password must be at least 8 characters' });
    const nh = bcrypt.hashSync(next, 10);
    run('UPDATE users SET password_hash=? WHERE id=?', nh, req.user.id);
    req.session.pf = pwFp({ password_hash: nh });
    log(req.user.id, 'user', req.user.id, 'password_changed');
    res.json({ ok: true });
  });
  app.post('/api/logout', (req, res) => req.session.destroy(() => res.json({ ok: true })));
  app.get('/api/me', auth, (req, res) => res.json({ ...publicUser(req.user), permissions: allowedKeys(req.user), features: getFeatures() }));

  // ---- admin: users
  app.get('/api/admin/users', auth, admin, (req, res) => {
    const s = typeof req.query.status === 'string' && req.query.status ? req.query.status : '';
    const term = typeof req.query.q === 'string' ? req.query.q.trim().slice(0, 100) : '';
    const where = [], p = [];
    if (s) { where.push('status=?'); p.push(s); } else where.push("role!='guard'");
    if (term) {
      const like = '%' + term.replace(/[\\%_]/g, m => '\\' + m) + '%';
      where.push("(name LIKE ? ESCAPE '\\' OR email LIKE ? ESCAPE '\\' OR flat LIKE ? ESCAPE '\\')"); p.push(like, like, like);
    }
    res.json(q(`SELECT id,name,email,phone,flat,resident_type,role,status,created_at FROM users WHERE ${where.join(' AND ')} ORDER BY id DESC`, ...p));
  });
  app.get('/api/admin/users/:id', auth, admin, (req, res) => {
    const u = one('SELECT id,name,email,phone,flat,resident_type,role,status,consent_at,created_at FROM users WHERE id=?', req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    res.json({ ...u, lease: one('SELECT * FROM leases WHERE user_id=?', u.id) || null });
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

  const residentTarget = (req, includeGuard) => {
    const u = one('SELECT * FROM users WHERE id=?', req.params.id);
    return u && u.status !== 'removed' && (u.role === 'resident' || (includeGuard && u.role === 'guard')) ? u : null;
  };
  app.patch('/api/admin/users/:id', auth, admin, (req, res) => {
    const u = residentTarget(req);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const b = req.body || {}, ch = {};
    if ('resident_type' in b) { if (!RESIDENT_TYPES.includes(b.resident_type)) return res.status(400).json({ error: 'Choose owner, tenant or family' }); ch.resident_type = b.resident_type; }
    if ('flat' in b) { const v = typeof b.flat === 'string' ? b.flat.trim() : ''; if (!v || v.length > 20) return res.status(400).json({ error: 'Flat is required (up to 20 characters)' }); ch.flat = v; }
    if ('name' in b) { const v = typeof b.name === 'string' ? b.name.trim() : ''; if (!v || v.length > 100) return res.status(400).json({ error: 'Name is required (up to 100 characters)' }); ch.name = v; }
    if ('phone' in b) { const v = typeof b.phone === 'string' ? b.phone.trim() : ''; if (v.length > 20) return res.status(400).json({ error: 'Phone must be 20 characters or fewer' }); ch.phone = v; }
    if ('status' in b) { if (!['approved', 'suspended'].includes(b.status)) return res.status(400).json({ error: "Status must be 'approved' or 'suspended'" }); ch.status = b.status; }
    const keys = Object.keys(ch).filter(k => ch[k] !== (u[k] == null ? '' : u[k]));
    for (const k of keys) {
      run(`UPDATE users SET ${k}=? WHERE id=?`, ch[k], u.id); // k comes from the fixed whitelist above
      log(req.user.id, 'user', u.id, k === 'status' ? (ch[k] === 'suspended' ? 'suspended' : 'reinstated') : 'updated', k === 'status' ? `${u.status} -> ${ch[k]}` : `${k}: ${u[k] == null ? '' : u[k]} -> ${ch[k]}`);
    }
    if (keys.includes('status')) notify(u.id, ch.status === 'suspended' ? 'Your account was suspended by the committee' : 'Your account was reinstated by the committee');
    res.json(one('SELECT id,name,email,phone,flat,resident_type,role,status,created_at FROM users WHERE id=?', u.id));
  });
  app.post('/api/admin/users/:id/reset-password', auth, admin, (req, res) => {
    const u = residentTarget(req, true);
    if (!u) return res.status(404).json({ error: 'User not found' });
    const pw = req.body && typeof req.body.password === 'string' ? req.body.password : '';
    if (pw.length < 8 || pw.length > 128) return res.status(400).json({ error: 'Password must be 8 to 128 characters' });
    run('UPDATE users SET password_hash=? WHERE id=?', bcrypt.hashSync(pw, 10), u.id); // existing sessions stop matching pwFp
    fails.delete('pw|' + u.id);
    log(req.user.id, 'user', u.id, 'password_reset');
    notify(u.id, 'The committee reset your password. Sign in with the new password.');
    res.json({ ok: true });
  });
  app.delete('/api/admin/users/:id', auth, admin, (req, res) => {
    const u = residentTarget(req);
    if (!u) return res.status(404).json({ error: 'User not found' });
    run("UPDATE users SET status='removed' WHERE id=?", u.id);
    log(req.user.id, 'user', u.id, 'removed', `${u.name} (${u.status})`);
    res.json({ ok: true });
  });

  // ---- admin: settings & access control
  app.get('/api/admin/settings', auth, admin, (req, res) => res.json(publicSettings()));
  app.put('/api/admin/settings', auth, admin, (req, res) => {
    const b = req.body || {}, cur = publicSettings(), next = { ...cur, features: { ...cur.features } };
    for (const k of ['society_name', 'society_kind']) if (k in b) {
      const v = typeof b[k] === 'string' ? b[k].trim() : '';
      if (!v || v.length > 100) return res.status(400).json({ error: `${k === 'society_name' ? 'Society name' : 'Society type'} is required (up to 100 characters)` });
      next[k] = v;
    }
    if ('google_client_id' in b) {
      const v = typeof b.google_client_id === 'string' ? b.google_client_id.trim() : null;
      if (v === null || !/^[A-Za-z0-9._-]{0,200}$/.test(v)) return res.status(400).json({ error: 'Google client ID has invalid characters' });
      next.google_client_id = v;
    }
    if ('features' in b) {
      const f = b.features;
      if (!f || typeof f !== 'object' || Array.isArray(f)) return res.status(400).json({ error: 'Features must be an object' });
      for (const [k, v] of Object.entries(f)) {
        if (!FEATURES.includes(k) || typeof v !== 'boolean') return res.status(400).json({ error: 'Features must be known names set to true or false' });
        next.features[k] = v;
      }
    }
    const put = db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value');
    for (const k of ['society_name', 'society_kind', 'google_client_id']) if (next[k] !== cur[k]) {
      put.run(k, next[k]);
      log(req.user.id, 'settings', null, 'updated', k === 'google_client_id' ? 'google_client_id changed' : `${k}: ${cur[k]} -> ${next[k]}`);
    }
    for (const k of FEATURES) if (next.features[k] !== cur.features[k]) log(req.user.id, 'settings', null, 'feature_' + (next.features[k] ? 'on' : 'off'), k);
    put.run('features', JSON.stringify(next.features));
    res.json(publicSettings());
  });
  const accessMatrix = () => {
    const m = Object.fromEntries(ACCESS_ROLES.map(r => [r, Object.fromEntries(PERMISSIONS.map(p => [p.key, false]))]));
    for (const r of q('SELECT role,permission,allowed FROM role_permissions')) if (m[r.role] && r.permission in m[r.role]) m[r.role][r.permission] = r.allowed === 1;
    return m;
  };
  app.get('/api/admin/access', auth, admin, (req, res) => res.json({ roles: ACCESS_ROLES, permissions: PERMISSIONS, matrix: accessMatrix() }));
  app.put('/api/admin/access', auth, admin, (req, res) => {
    const m = req.body && req.body.matrix;
    if (!m || typeof m !== 'object' || Array.isArray(m)) return res.status(400).json({ error: 'matrix is required' });
    const cur = accessMatrix(), next = JSON.parse(JSON.stringify(cur));
    for (const [role, perms] of Object.entries(m)) {
      if (!ACCESS_ROLES.includes(role) || !perms || typeof perms !== 'object' || Array.isArray(perms)) return res.status(400).json({ error: 'Unknown role' });
      for (const [k, v] of Object.entries(perms)) {
        if (!PERMISSIONS.some(p => p.key === k)) return res.status(400).json({ error: 'Unknown permission' });
        if (typeof v !== 'boolean') return res.status(400).json({ error: 'Permissions must be true or false' });
        next[role][k] = v;
      }
    }
    const diffs = [];
    db.exec('BEGIN');
    try {
      run('DELETE FROM role_permissions');
      const ins = db.prepare('INSERT INTO role_permissions(role,permission,allowed) VALUES(?,?,?)');
      for (const r of ACCESS_ROLES) for (const p of PERMISSIONS) {
        ins.run(r, p.key, next[r][p.key] ? 1 : 0);
        if (next[r][p.key] !== cur[r][p.key]) diffs.push(`${r} ${p.key}: ${cur[r][p.key]} -> ${next[r][p.key]}`);
      }
      for (const d of diffs) log(req.user.id, 'access', null, 'changed', d);
      db.exec('COMMIT');
    } catch (e) { db.exec('ROLLBACK'); throw e; }
    res.json({ roles: ACCESS_ROLES, permissions: PERMISSIONS, matrix: next });
  });

  // ---- vendors
  app.get('/api/vendors', auth, admin, (req, res) => res.json(q('SELECT * FROM vendors ORDER BY trade,name')));
  app.post('/api/vendors', auth, admin, (req, res) => {
    const name = str(req.body.name, 100), trade = str(req.body.trade, 50), phone = str(req.body.phone, 20);
    if (!name || !trade) return res.status(400).json({ error: 'Name and trade are required' });
    const r = run('INSERT INTO vendors(name,trade,phone) VALUES(?,?,?)', name, trade, phone);
    log(req.user.id, 'vendor', r.lastInsertRowid, 'created', name);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  app.put('/api/vendors/:id', auth, admin, (req, res) => {
    const v = one('SELECT * FROM vendors WHERE id=?', req.params.id);
    if (!v) return res.status(404).json({ error: 'Vendor not found' });
    const name = str(req.body.name, 100) || v.name, trade = str(req.body.trade, 50) || v.trade, phone = 'phone' in req.body ? str(req.body.phone, 20) : v.phone;
    run('UPDATE vendors SET name=?, trade=?, phone=? WHERE id=?', name, trade, phone, v.id);
    log(req.user.id, 'vendor', v.id, 'updated', name);
    res.json({ ok: true });
  });
  app.delete('/api/vendors/:id', auth, admin, (req, res) => {
    const v = one('SELECT * FROM vendors WHERE id=?', req.params.id);
    if (!v) return res.status(404).json({ error: 'Vendor not found' });
    if (one('SELECT id FROM requests WHERE vendor_id=? LIMIT 1', v.id)) return res.status(409).json({ error: 'This vendor has requests on record and cannot be deleted' });
    run('DELETE FROM vendors WHERE id=?', v.id);
    log(req.user.id, 'vendor', v.id, 'deleted', v.name);
    res.json({ ok: true });
  });

  // ---- emergencies
  const EMERGENCY_TYPES = ['lift', 'medical', 'fire', 'theft', 'threat', 'violence', 'other'];
  const EMERGENCY_SELECT = `SELECT e.id, e.type, e.note, e.status, u.flat, u.name AS user_name, e.created_at, e.resolved_at
    FROM emergencies e JOIN users u ON u.id=e.user_id`;
  app.post('/api/emergencies', auth, feat('emergency'), can('emergency.raise'), (req, res) => {
    const type = req.body.type;
    if (!EMERGENCY_TYPES.includes(type)) return res.status(400).json({ error: 'Choose a valid emergency type' });
    if (req.body.note != null && typeof req.body.note !== 'string') return res.status(400).json({ error: 'Note must be text' });
    const note = (req.body.note || '').trim();
    if (note.length > 500) return res.status(400).json({ error: 'Note must be 500 characters or fewer' });
    const recent = one("SELECT COUNT(*) AS n FROM emergencies WHERE user_id=? AND created_at >= datetime('now','-1 hour')", req.user.id).n;
    if (recent >= 5) return res.status(429).json({ error: 'Emergency limit reached: at most 5 alerts per hour. Please call the security desk directly.' });
    const r = run('INSERT INTO emergencies(user_id,type,note) VALUES(?,?,?)', req.user.id, type, note || null);
    const id = Number(r.lastInsertRowid);
    log(req.user.id, 'emergency', id, 'raised', type);
    const label = type.charAt(0).toUpperCase() + type.slice(1);
    const msg = `EMERGENCY (${label}) from flat ${req.user.flat || 'n/a'}${note ? ': ' + note : ''}`;
    for (const a of q("SELECT id FROM users WHERE role='admin'")) notify(a.id, msg);
    res.status(201).json({ id });
  });
  app.get('/api/emergencies', auth, feat('emergency'), (req, res) => {
    if (req.user.role === 'admin') return res.json(q(`${EMERGENCY_SELECT} ORDER BY e.id DESC`));
    res.json(q(`${EMERGENCY_SELECT} WHERE u.flat=? ORDER BY e.id DESC`, req.user.flat));
  });
  app.post('/api/emergencies/:id/resolve', auth, admin, feat('emergency'), (req, res) => {
    const e = one('SELECT * FROM emergencies WHERE id=?', req.params.id);
    if (!e) return res.status(404).json({ error: 'Emergency not found' });
    if (e.status === 'resolved') return res.status(409).json({ error: 'Emergency is already resolved' });
    run("UPDATE emergencies SET status='resolved', resolved_at=datetime('now'), resolved_by=? WHERE id=?", req.user.id, e.id);
    log(req.user.id, 'emergency', e.id, 'resolved', e.type);
    notify(e.user_id, `Your ${e.type} emergency alert has been marked resolved by the committee`);
    res.json({ ok: true });
  });

  // ---- society contacts
  const CONTACT_ICONS = ['phone', 'briefcase', 'shield-check', 'wrench', 'elevator', 'first-aid', 'fire', 'drop'];
  app.get('/api/contacts', auth, feat('contacts'), can('contacts.read'), (req, res) => res.json(q('SELECT id,name,role,phone,icon FROM contacts ORDER BY name')));
  app.post('/api/contacts', auth, admin, (req, res) => {
    const name = str(req.body.name, 100), role = str(req.body.role, 100), phone = str(req.body.phone, 40);
    const icon = req.body.icon == null || req.body.icon === '' ? 'phone' : req.body.icon;
    if (!name || !role) return res.status(400).json({ error: 'Name and role are required' });
    if (!/^[+\d][\d\s()+-]{3,19}$/.test(phone)) return res.status(400).json({ error: 'Enter a valid phone number' });
    if (!CONTACT_ICONS.includes(icon)) return res.status(400).json({ error: 'Unknown icon' });
    const r = run('INSERT INTO contacts(name,role,phone,icon) VALUES(?,?,?,?)', name, role, phone, icon);
    log(req.user.id, 'contact', r.lastInsertRowid, 'created', name);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.delete('/api/contacts/:id', auth, admin, (req, res) => {
    const c = one('SELECT * FROM contacts WHERE id=?', req.params.id);
    if (!c) return res.status(404).json({ error: 'Contact not found' });
    run('DELETE FROM contacts WHERE id=?', c.id);
    log(req.user.id, 'contact', c.id, 'deleted', c.name);
    res.json({ ok: true });
  });

  // ---- requests
  const EXT = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };
  const upload = multer({
    storage: multer.diskStorage({
      destination: uploadDir,
      filename: (req, f, cb) => cb(null, crypto.randomUUID() + EXT[f.mimetype]),
    }),
    limits: { fileSize: 5 * 1024 * 1024, files: 1 },
    fileFilter: (req, f, cb) => cb(EXT[f.mimetype] ? null : new Error('Only JPEG, PNG or WebP photos are allowed'), !!EXT[f.mimetype]),
  });
  // Verify the real file signature, not just the client-declared type.
  const MAGIC = { '.jpg': [0xff, 0xd8, 0xff], '.png': [0x89, 0x50, 0x4e, 0x47] };
  const validImage = f => {
    try {
      const ext = path.extname(f.filename), b = Buffer.alloc(12), fd = fs.openSync(f.path, 'r');
      fs.readSync(fd, b, 0, 12, 0); fs.closeSync(fd);
      if (ext === '.webp') return b.toString('latin1', 0, 4) === 'RIFF' && b.toString('latin1', 8, 12) === 'WEBP';
      return MAGIC[ext].every((x, i) => b[i] === x);
    } catch { return false; }
  };
  const REQ_SELECT = `SELECT r.*, u.name AS resident_name, u.flat, v.name AS vendor_name FROM requests r
    JOIN users u ON u.id=r.user_id LEFT JOIN vendors v ON v.id=r.vendor_id`;
  // Residents see their own requests and any request from their own flat (owner and family share a flat view).
  const canSee = (u, r) => u.role === 'admin' || r.user_id === u.id || (!!u.flat && r.flat === u.flat);
  // The requester rates, except a family member's request, which the flat owner rates. Family never rates.
  const canRate = (u, r) => u.role !== 'admin' && r.status === 'closed' && !r.rating &&
    ((r.user_id === u.id && u.resident_type !== 'family') || (u.resident_type === 'owner' && r.flat === u.flat));
  const shape = (r, u) => { const { photo, ...rest } = r; return { ...rest, has_photo: !!photo, can_rate: !!u && canRate(u, r) }; };

  app.post('/api/requests', auth, can('request.create'),
    (req, res, next) => upload.single('photo')(req, res, err => (err ? res.status(400).json({ error: err.message }) : next())),
    (req, res) => {
      if (req.file && !validImage(req.file)) { fs.unlink(req.file.path, () => {}); return res.status(400).json({ error: 'File is not a valid JPEG, PNG or WebP image' }); }
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
    res.set('Cache-Control', 'private, max-age=3600').sendFile(path.join(uploadDir, path.basename(r.photo)), err => { if (err && !res.headersSent) res.status(404).end(); });
  });

  app.get('/api/requests/:id/comments', auth, (req, res) => {
    const r = one(`${REQ_SELECT} WHERE r.id=?`, req.params.id);
    if (!r || !canSee(req.user, r)) return res.status(404).json({ error: 'Request not found' });
    res.json(q('SELECT c.id,c.body,c.created_at,u.name AS author,u.role FROM comments c JOIN users u ON u.id=c.user_id WHERE c.request_id=? ORDER BY c.id', r.id));
  });
  app.post('/api/requests/:id/comments', auth, (req, res) => {
    const r = one(`${REQ_SELECT} WHERE r.id=?`, req.params.id);
    if (!r || !canSee(req.user, r)) return res.status(404).json({ error: 'Request not found' });
    const body = str(req.body && req.body.body, 1000);
    if (!body) return res.status(400).json({ error: 'Write a message first' });
    const c = run('INSERT INTO comments(request_id,user_id,body) VALUES(?,?,?)', r.id, req.user.id, body);
    log(req.user.id, 'request', r.id, 'commented', body.slice(0, 80));
    if (req.user.role === 'admin') { if (r.user_id !== req.user.id) notify(r.user_id, `The committee replied on "${r.title}"`); }
    else for (const a of q("SELECT id FROM users WHERE role='admin'")) notify(a.id, `New message on request "${r.title}" from flat ${req.user.flat}`);
    res.status(201).json({ id: Number(c.lastInsertRowid) });
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
    res.json(q("SELECT id,name,resident_type,status,phone FROM users WHERE flat=? AND role!='admin' AND status NOT IN ('rejected','removed') ORDER BY (resident_type='owner') DESC, id", req.user.flat));
  });
  app.post('/api/household', auth, can('household.manage'), (req, res) => {
    if (req.user.resident_type !== 'owner') return res.status(403).json({ error: 'Only the flat owner can add household members' });
    const b = req.body || {};
    const name = str(b.name, 100), email = str(b.email, 200).toLowerCase(), phone = str(b.phone, 20), rtype = b.resident_type;
    const pw = typeof b.password === 'string' ? b.password : '';
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Name and a valid email are required' });
    if (!['family', 'tenant'].includes(rtype)) return res.status(400).json({ error: 'Add a family member or a tenant' });
    if (pw.length < 8 || pw.length > 128) return res.status(400).json({ error: 'Temporary password must be 8 to 128 characters' });
    if (!req.user.flat) return res.status(400).json({ error: 'Your account has no flat set' });
    if (b.consent !== true) return res.status(400).json({ error: 'Consent to data processing is required' });
    if (one('SELECT id FROM users WHERE email=?', email)) return res.status(409).json({ error: 'Email already registered' });
    const r = run("INSERT INTO users(name,email,phone,flat,resident_type,password_hash,consent_at) VALUES(?,?,?,?,?,?,datetime('now'))",
      name, email, phone, req.user.flat, rtype, bcrypt.hashSync(pw, 10));
    log(req.user.id, 'user', r.lastInsertRowid, 'household_added', `${rtype} flat ${req.user.flat}`);
    for (const a of q("SELECT id FROM users WHERE role='admin'")) notify(a.id, `${req.user.name} added ${name} (${rtype}) to flat ${req.user.flat}: awaiting approval`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });

  // ---- tenant lease (set by the committee, read by the tenant)
  app.get('/api/lease', auth, can('lease.view'), (req, res) => res.json(one('SELECT * FROM leases WHERE user_id=?', req.user.id) || null));
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
    if (u.role === 'guard') return res.json({ v: String(one('SELECT COALESCE(MAX(id),0) AS m FROM notifications WHERE user_id=?', u.id).m) }); // guards only see their own notification marker
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
      if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // neutralise spreadsheet formulas
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const rows = q(`${REQ_SELECT} ORDER BY r.id`);
    const cols = ['id', 'resident_name', 'flat', 'category', 'title', 'status', 'vendor_name', 'rating', 'created_at', 'updated_at'];
    res.type('text/csv').attachment('requests.csv').send([cols.join(','), ...rows.map(r => cols.map(c => esc(r[c])).join(','))].join('\n'));
  });

  // ---- notices & notifications
  app.get('/api/notices', auth, feat('notices'), can('notice.read'), (req, res) => res.json(q('SELECT n.*,u.name AS author FROM notices n JOIN users u ON u.id=n.author_id ORDER BY n.id DESC')));
  app.post('/api/notices', auth, admin, (req, res) => {
    const title = str(req.body.title, 150), body = str(req.body.body, 5000);
    if (!title || !body) return res.status(400).json({ error: 'Title and body are required' });
    const r = run('INSERT INTO notices(title,body,author_id) VALUES(?,?,?)', title, body, req.user.id);
    log(req.user.id, 'notice', r.lastInsertRowid, 'posted', title);
    for (const u of q("SELECT id FROM users WHERE status='approved' AND id!=?", req.user.id)) notify(u.id, `New notice: ${title}`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.delete('/api/notices/:id', auth, admin, (req, res) => {
    const n = one('SELECT * FROM notices WHERE id=?', req.params.id);
    if (!n) return res.status(404).json({ error: 'Notice not found' });
    run('DELETE FROM notices WHERE id=?', n.id);
    log(req.user.id, 'notice', n.id, 'deleted', n.title);
    res.json({ ok: true });
  });
  app.get('/api/notifications/unread-count', auth, (req, res) => res.json({ n: one('SELECT COUNT(*) AS n FROM notifications WHERE user_id=? AND is_read=0', req.user.id).n }));
  app.get('/api/notifications', auth, (req, res) => res.json(q('SELECT * FROM notifications WHERE user_id=? ORDER BY id DESC LIMIT 50', req.user.id)));
  app.post('/api/notifications/read', auth, (req, res) => { run('UPDATE notifications SET is_read=1 WHERE user_id=?', req.user.id); res.json({ ok: true }); });

  // ---- guards (committee creates gate staff accounts)
  app.post('/api/admin/guards', auth, admin, (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 100), email = str(b.email, 200).toLowerCase(), pw = typeof b.password === 'string' ? b.password : '';
    if (!name || !/^\S+@\S+\.\S+$/.test(email)) return res.status(400).json({ error: 'Name and a valid email are required' });
    if (pw.length < 8 || pw.length > 128) return res.status(400).json({ error: 'Password must be 8 to 128 characters' });
    if (one('SELECT id FROM users WHERE email=?', email)) return res.status(409).json({ error: 'Email already registered' });
    const r = run("INSERT INTO users(name,email,password_hash,role,status,consent_at) VALUES(?,?,?,'guard','approved',datetime('now'))", name, email, bcrypt.hashSync(pw, 10));
    log(req.user.id, 'user', r.lastInsertRowid, 'guard_created', email);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.get('/api/admin/guards', auth, admin, (req, res) => res.json(q("SELECT id,name,email,status,created_at FROM users WHERE role='guard' ORDER BY id DESC")));
  app.delete('/api/admin/guards/:id', auth, admin, (req, res) => {
    const g = one("SELECT * FROM users WHERE id=? AND role='guard'", req.params.id);
    if (!g) return res.status(404).json({ error: 'Guard not found' });
    run('DELETE FROM notifications WHERE user_id=?', g.id);
    run('DELETE FROM users WHERE id=?', g.id);
    log(req.user.id, 'user', g.id, 'guard_deleted', g.email);
    res.json({ ok: true });
  });

  // ---- gate access
  const ts = d => d.toISOString().slice(0, 19).replace('T', ' ');
  const parseTime = v => {
    if (typeof v !== 'string') return null;
    let s = v.trim().replace(' ', 'T');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2}(\.\d+)?)?(Z|[+-]\d{2}:\d{2})?$/.test(s)) return null;
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(s)) s += 'Z';
    const d = new Date(s);
    return isNaN(d) ? null : d;
  };
  const residentOnly = (req, res, next) => (req.user.role === 'resident' && req.user.flat ? next() : res.status(403).json({ error: 'Only residents with a flat can use this' }));
  const glog = (kind, subject, flat, result, reason, guardId) =>
    run('INSERT INTO gate_log(kind,subject,flat,result,reason,guard_id) VALUES(?,?,?,?,?,?)', kind, subject || null, flat || null, result, reason || null, guardId);
  const passRow = r => ({
    id: r.id, flat: r.flat, visitor_name: r.visitor_name, purpose: r.purpose, code: r.code, qr: 'HSP:' + r.token,
    valid_from: r.valid_from, valid_until: r.valid_until,
    status: r.status === 'active' && r.valid_until < ts(new Date()) ? 'expired' : r.status,
    created_by_name: r.created_by_name, used_at: r.used_at,
  });
  const PASS_SELECT = 'SELECT p.*, u.name AS created_by_name FROM gate_passes p JOIN users u ON u.id=p.created_by';
  const MAX_ACTIVE_PASSES = 10;

  app.post('/api/gate/passes', auth, feat('gate'), can('gate.pass'), residentOnly, (req, res) => {
    const b = req.body || {};
    const visitor = typeof b.visitor_name === 'string' ? b.visitor_name.trim() : '';
    if (!visitor || visitor.length > 100) return res.status(400).json({ error: 'Visitor name is required (up to 100 characters)' });
    if (b.purpose != null && typeof b.purpose !== 'string') return res.status(400).json({ error: 'Purpose must be text' });
    const purpose = (b.purpose || '').trim();
    if (purpose.length > 200) return res.status(400).json({ error: 'Purpose must be 200 characters or fewer' });
    const now = new Date();
    let from = now, until;
    if (b.valid_from != null && b.valid_from !== '') { from = parseTime(b.valid_from); if (!from) return res.status(400).json({ error: 'valid_from is not a valid date and time' }); }
    if (b.valid_until != null && b.valid_until !== '') { until = parseTime(b.valid_until); if (!until) return res.status(400).json({ error: 'valid_until is not a valid date and time' }); }
    else until = new Date(from.getTime() + 24 * 3600e3);
    if (until <= from) return res.status(400).json({ error: 'valid_until must be after valid_from' });
    if (until - from > 7 * 24 * 3600e3) return res.status(400).json({ error: 'A pass can be valid for at most 7 days' });
    const active = one("SELECT COUNT(*) AS n FROM gate_passes WHERE flat=? AND status='active' AND valid_until>=?", req.user.flat, ts(now)).n;
    if (active >= MAX_ACTIVE_PASSES) return res.status(429).json({ error: `Your flat already has ${MAX_ACTIVE_PASSES} active visitor passes. Cancel one or wait for it to expire.` });
    let code;
    do { code = String(crypto.randomInt(0, 1000000)).padStart(6, '0'); } while (one("SELECT id FROM gate_passes WHERE code=? AND status='active'", code));
    const token = crypto.randomBytes(12).toString('hex');
    const r = run('INSERT INTO gate_passes(flat,created_by,visitor_name,purpose,token,code,valid_from,valid_until) VALUES(?,?,?,?,?,?,?,?)',
      req.user.flat, req.user.id, visitor, purpose || null, token, code, ts(from), ts(until));
    const id = Number(r.lastInsertRowid);
    log(req.user.id, 'gate_pass', id, 'created', `${visitor} flat ${req.user.flat} ${ts(from)} to ${ts(until)}`);
    res.status(201).json({ id, token, code, qr: 'HSP:' + token });
  });
  app.get('/api/gate/passes', auth, feat('gate'), (req, res) => {
    if (req.user.role === 'admin') return res.json(q(`${PASS_SELECT} ORDER BY p.id DESC LIMIT 500`).map(passRow));
    if (req.user.role !== 'resident' || !req.user.flat) return res.status(403).json({ error: 'Only residents with a flat can use this' });
    res.json(q(`${PASS_SELECT} WHERE p.flat=? ORDER BY p.id DESC LIMIT 200`, req.user.flat).map(passRow));
  });
  app.post('/api/gate/passes/:id/cancel', auth, feat('gate'), (req, res) => {
    const p = one('SELECT * FROM gate_passes WHERE id=?', req.params.id);
    const u = req.user;
    if (!p || (u.role !== 'admin' && p.flat !== u.flat)) return res.status(404).json({ error: 'Pass not found' });
    if (u.role !== 'admin' && p.created_by !== u.id && u.resident_type !== 'owner') return res.status(403).json({ error: 'Only the creator, the flat owner or the committee can cancel this pass' });
    if (p.status !== 'active') return res.status(409).json({ error: `Pass is already ${p.status}` });
    const r = run("UPDATE gate_passes SET status='cancelled' WHERE id=? AND status='active'", p.id);
    if (!r.changes) return res.status(409).json({ error: 'Pass is no longer active' });
    log(u.id, 'gate_pass', p.id, 'cancelled', p.visitor_name);
    res.json({ ok: true });
  });
  const myToken = uid => {
    let t = one('SELECT token FROM resident_tokens WHERE user_id=?', uid);
    if (!t) {
      run('INSERT OR IGNORE INTO resident_tokens(user_id,token) VALUES(?,?)', uid, crypto.randomBytes(12).toString('hex'));
      t = one('SELECT token FROM resident_tokens WHERE user_id=?', uid);
    }
    return { token: t.token, qr: 'HSP:' + t.token, nfc: 'HSP:' + t.token };
  };
  app.get('/api/gate/me', auth, feat('gate'), residentOnly, (req, res) => res.json(myToken(req.user.id)));
  app.post('/api/gate/me/rotate', auth, feat('gate'), residentOnly, (req, res) => {
    const token = crypto.randomBytes(12).toString('hex');
    run(`INSERT INTO resident_tokens(user_id,token) VALUES(?,?) ON CONFLICT(user_id) DO UPDATE SET token=excluded.token, created_at=datetime('now')`, req.user.id, token);
    log(req.user.id, 'resident_token', req.user.id, 'rotated');
    res.json({ token, qr: 'HSP:' + token, nfc: 'HSP:' + token });
  });

  const VERIFY_MAX_DENIED = 10;
  app.post('/api/gate/verify', auth, gate, (req, res) => {
    const gid = req.user.id, b = req.body || {};
    const hasToken = typeof b.token === 'string' && b.token.trim() !== '';
    const hasCode = (typeof b.code === 'string' || typeof b.code === 'number') && String(b.code).trim() !== '';
    if (!hasToken && !hasCode) return res.status(400).json({ error: 'Provide a code or a token' });
    if (one("SELECT COUNT(*) AS n FROM gate_log WHERE guard_id=? AND result='denied' AND created_at >= datetime('now','-10 minutes')", gid).n >= VERIFY_MAX_DENIED)
      return res.status(429).json({ error: 'Too many failed checks. Wait a few minutes and try again.' });
    const deny = (reason, p) => {
      glog(p ? 'visitor' : 'unknown', p && p.visitor_name, p && p.flat, 'denied', reason, gid);
      res.json(p ? { result: 'denied', reason, kind: 'visitor', name: p.visitor_name, flat: p.flat, purpose: p.purpose } : { result: 'denied', reason });
    };
    let pass = null;
    if (hasToken) {
      const tok = String(b.token).trim().replace(/^HSP:/i, '').trim().slice(0, 64);
      pass = one('SELECT * FROM gate_passes WHERE token=?', tok);
      if (!pass) {
        const rt = one('SELECT u.* FROM resident_tokens t JOIN users u ON u.id=t.user_id WHERE t.token=?', tok);
        if (rt && rt.status === 'approved' && rt.role === 'resident') {
          glog('resident', rt.name, rt.flat, 'allowed', null, gid);
          return res.json({ result: 'allowed', kind: 'resident', name: rt.name, flat: rt.flat });
        }
        return deny('unknown');
      }
    } else {
      const code = String(b.code).trim().slice(0, 12);
      if (!/^\d{6}$/.test(code)) return deny('unknown');
      pass = one("SELECT * FROM gate_passes WHERE code=? ORDER BY (status='active') DESC, id DESC LIMIT 1", code);
      if (!pass) return deny('unknown');
    }
    if (pass.status === 'cancelled') return deny('cancelled', pass);
    if (pass.status === 'used') return deny('used', pass);
    const now = ts(new Date());
    if (now < pass.valid_from) return deny('not_yet_valid', pass);
    if (now > pass.valid_until) return deny('expired', pass);
    const r = run("UPDATE gate_passes SET status='used', used_at=?, used_by=? WHERE id=? AND status='active'", now, gid, pass.id);
    if (!r.changes) return deny('used', pass);
    glog('visitor', pass.visitor_name, pass.flat, 'allowed', null, gid);
    log(gid, 'gate_pass', pass.id, 'used', `${pass.visitor_name} flat ${pass.flat}`);
    notify(pass.created_by, `Your visitor ${pass.visitor_name} has entered`);
    res.json({ result: 'allowed', kind: 'visitor', name: pass.visitor_name, flat: pass.flat, purpose: pass.purpose });
  });
  app.get('/api/gate/log', auth, gate, (req, res) => res.json(q(`SELECT l.id,l.kind,l.subject,l.flat,l.result,l.reason,u.name AS guard_name,l.created_at
    FROM gate_log l LEFT JOIN users u ON u.id=l.guard_id ORDER BY l.id DESC LIMIT 100`)));

  app.get('/healthz', (req, res) => res.json({ ok: true }));
  app.use(express.static(path.join(__dirname, 'public')));
  app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    const code = err.status || err.statusCode;
    if (code && code >= 400 && code < 500) return res.status(code).json({ error: code === 413 ? 'Request too large' : 'Bad request' });
    console.error(err);
    res.status(500).json({ error: 'Something went wrong' });
  });
  app.locals.db = db;
  return app;
}
module.exports = { createApp };
