// Bulk upload (2026-11-28, contract docs/bulk-upload-api.md). The committee uploads a CSV of residents, staff and other
// accounts, vendors or inventory items. A dry run checks every row first; the import then replays the normal API route
// for each valid row as the uploading committee member (email-desk.js replay), so validation, audit and notifications
// are exactly those of a single entry. Also adds POST /api/admin/residents: the committee creates an approved resident.

const crypto = require('crypto');

const RESIDENT_TYPES = ['owner', 'tenant', 'family'];
const ACCOUNT_KINDS = ['member', 'head', 'sysadmin', 'maintenance', 'cleaner', 'it', 'guard', 'shop', 'laundry'];
const { INV_CATEGORIES } = require('./modules'); // one list, shared with the Inventory page
const EMAIL = /^\S+@\S+\.\S+$/;
const MAX_ROWS = 500;

// One template per type: columns (in order), which are required, an example row, and a short help line per column.
const TYPES = {
  residents: {
    label: 'Residents (owners, tenants, family)',
    columns: ['name', 'email', 'flat', 'resident_type', 'phone', 'password'],
    required: ['name', 'email', 'flat', 'resident_type'],
    example: ['Asha Kulkarni', 'asha@example.com', 'B-304', 'tenant', '9800000000', ''],
    help: { resident_type: 'owner, tenant or family', password: 'optional: leave empty and a temporary password is made for the sign-in sheet', phone: 'optional' },
    path: () => '/api/admin/residents',
    body: r => ({ name: r.name, email: r.email, flat: r.flat, resident_type: (r.resident_type || '').toLowerCase(), phone: r.phone || undefined, password: r.password || undefined }),
  },
  accounts: {
    label: 'Staff and other accounts (guard, maintenance, cleaner, shop, laundry, IT, committee)',
    columns: ['name', 'email', 'kind', 'password'],
    required: ['name', 'email', 'kind'],
    example: ['Ravi Shinde', 'ravi@example.com', 'guard', ''],
    help: { kind: ACCOUNT_KINDS.join(', '), password: 'optional: leave empty and a temporary password is made' },
    gov: true, // creating accounts needs the head of committee or the admin (same rule as Accounts)
    path: () => '/api/admin/accounts',
    body: r => ({ name: r.name, email: r.email, kind: (r.kind || '').toLowerCase(), password: r.password }),
  },
  vendors: {
    label: 'Vendors',
    columns: ['name', 'trade', 'phone'],
    required: ['name', 'trade'],
    example: ['AquaFix Plumbing', 'plumbing', '9800000000'],
    help: { trade: 'plumbing, electrical, lift, housekeeping, security or other' },
    path: () => '/api/vendors',
    body: r => ({ name: r.name, trade: (r.trade || '').toLowerCase(), phone: r.phone || '' }),
  },
  inventory: {
    label: 'Inventory items',
    columns: ['name', 'category', 'quantity', 'unit', 'min_qty', 'location'],
    required: ['name', 'category'],
    example: ['PVC tape', 'plumbing', '10', 'roll', '2', 'Store room'],
    help: { category: INV_CATEGORIES.join(', '), quantity: 'whole number, default 0', min_qty: 'reorder level, default 0' },
    path: () => '/api/inventory',
    body: r => ({ name: r.name, category: (r.category || '').toLowerCase(), quantity: r.quantity === '' || r.quantity == null ? 0 : Number(r.quantity), unit: r.unit || 'pcs', min_qty: r.min_qty === '' || r.min_qty == null ? 0 : Number(r.min_qty), location: r.location || '' }),
  },
};

const tempPassword = () => {
  // 12 characters, no look-alikes (0/O, 1/l/I), at least one digit.
  const a = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ', d = '23456789';
  const b = crypto.randomBytes(12);
  let s = ''; for (let i = 0; i < 11; i++) s += (a + d)[b[i] % (a.length + d.length)];
  return s + d[b[11] % d.length];
};

module.exports = function mountBulk(app, c) {
  const { q, one, run, log, notify, auth, admin, str, bcrypt, isGov, desk } = c;
  const bad = (res, error) => res.status(400).json({ error });

  // ---------- the committee creates an approved resident (bulk onboarding uses this per row)
  app.post('/api/admin/residents', auth, admin, (req, res) => {
    const b = req.body || {};
    const name = str(b.name, 100), email = str(b.email, 200).toLowerCase(), flat = str(b.flat, 20).toUpperCase(), phone = str(b.phone, 20);
    if (!name || !EMAIL.test(email) || !flat) return bad(res, 'Name, valid email and flat are required');
    if (!RESIDENT_TYPES.includes(b.resident_type)) return bad(res, 'Choose owner, tenant or family');
    const given = typeof b.password === 'string' && b.password !== '';
    if (given && (b.password.length < 8 || b.password.length > 128)) return bad(res, 'Password must be 8 to 128 characters');
    if (one('SELECT id FROM users WHERE email=?', email)) return res.status(409).json({ error: 'Email already registered' });
    const pw = given ? b.password : tempPassword();
    // consent_at records that the committee collected the resident's consent when onboarding them (docs/privacy-and-consent.md).
    const r = run("INSERT INTO users(name,email,phone,flat,resident_type,password_hash,role,status,consent_at) VALUES(?,?,?,?,?,?,'resident','approved',datetime('now'))",
      name, email, phone || null, flat, b.resident_type, bcrypt.hashSync(pw, 10));
    const id = Number(r.lastInsertRowid);
    log(req.user.id, 'user', id, 'created_by_committee', `${b.resident_type} flat ${flat}: ${email}`);
    if (app.locals.sendVerification) app.locals.sendVerification(id, req).catch(() => {}); // they confirm their own email too
    notify(id, `Welcome to the society portal. Your committee set up your account for flat ${flat}. Please change your password under Profile.`);
    res.status(201).json(given ? { id } : { id, password: pw });
  });

  app.get('/api/admin/bulk/templates', auth, admin, (req, res) => {
    res.json(Object.fromEntries(Object.entries(TYPES).map(([k, t]) => [k, { label: t.label, columns: t.columns, required: t.required, example: t.example, help: t.help, needs_head: !!t.gov }])));
  });

  // Checks one row without writing anything. Returns an error string, or '' when the row looks importable.
  const check = (type, r, seen) => {
    const t = TYPES[type];
    for (const col of t.required) if (!String(r[col] ?? '').trim()) return `${col} is required`;
    const email = String(r.email || '').trim().toLowerCase();
    if ('email' in r || t.columns.includes('email')) {
      if (!EMAIL.test(email)) return 'email is not valid';
      if (seen.has('e:' + email)) return 'the same email appears earlier in the file';
      if (one('SELECT id FROM users WHERE email=?', email)) return 'email already registered';
      seen.add('e:' + email);
    }
    if (type === 'residents' && !RESIDENT_TYPES.includes(String(r.resident_type).toLowerCase())) return 'resident_type must be owner, tenant or family';
    if (type === 'accounts' && !ACCOUNT_KINDS.includes(String(r.kind).toLowerCase())) return `kind must be one of: ${ACCOUNT_KINDS.join(', ')}`;
    if (r.password && (String(r.password).length < 8 || String(r.password).length > 128)) return 'password must be 8 to 128 characters (or leave it empty)';
    if (type === 'inventory') {
      if (!INV_CATEGORIES.includes(String(r.category).toLowerCase())) return `category must be one of: ${INV_CATEGORIES.join(', ')}`;
      for (const k of ['quantity', 'min_qty']) if (r[k] !== undefined && r[k] !== '' && !(Number.isInteger(Number(r[k])) && Number(r[k]) >= 0)) return `${k} must be a whole number from 0`;
      const n = String(r.name).trim().toLowerCase();
      if (seen.has('i:' + n)) return 'the same item appears earlier in the file';
      if (one('SELECT id FROM inventory_items WHERE lower(name)=?', n)) return 'already in the inventory';
      seen.add('i:' + n);
    }
    if (type === 'vendors') {
      const n = String(r.name).trim().toLowerCase();
      if (seen.has('v:' + n)) return 'the same vendor appears earlier in the file';
      seen.add('v:' + n);
    }
    return '';
  };

  // POST /api/admin/bulk/:type { rows: [{ column: value }], dry_run }
  app.post('/api/admin/bulk/:type', auth, admin, async (req, res) => {
    const t = TYPES[req.params.type];
    if (!t) return res.status(404).json({ error: 'Unknown upload type' });
    if (t.gov && !isGov(req.user)) return res.status(403).json({ error: 'Only the head of committee or the admin can create accounts' });
    const rows = (req.body || {}).rows;
    if (!Array.isArray(rows) || !rows.length) return bad(res, 'The file has no rows');
    if (rows.length > MAX_ROWS) return bad(res, `Up to ${MAX_ROWS} rows at a time; split the file`);
    const clean = rows.map(r => Object.fromEntries(t.columns.map(col => [col, String((r && r[col]) ?? '').trim()])));
    const seen = new Set();
    const checked = clean.map((r, i) => ({ row: i + 2, error: check(req.params.type, r, seen) })); // row 1 is the header
    const valid = checked.filter(x => !x.error).length;
    if ((req.body || {}).dry_run) return res.json({ type: req.params.type, total: rows.length, valid, rows: checked.map(x => ({ row: x.row, ok: !x.error, error: x.error || undefined })) });

    // Import: one replay per valid row, as this committee member. Rows that failed the check are skipped and reported.
    const out = [];
    for (let i = 0; i < clean.length; i++) {
      if (checked[i].error) { out.push({ row: checked[i].row, ok: false, error: checked[i].error }); continue; }
      const body = t.body(clean[i]);
      let shown = null;
      if (req.params.type === 'accounts' && !body.password) { body.password = tempPassword(); shown = body.password; }
      const r = await desk.replay(req.user.id, req.socket.localPort, 'POST', t.path(clean[i]), body);
      const ok = r.status >= 200 && r.status < 300;
      const pw = ok ? (r.body.password || shown) : null;
      out.push({ row: checked[i].row, ok, id: ok ? r.body.id : undefined, error: ok ? undefined : r.body.error || `failed (${r.status})`,
        ...(pw ? { email: body.email, name: body.name, password: pw } : {}) });
    }
    const done = out.filter(x => x.ok).length;
    log(req.user.id, 'bulk_upload', null, req.params.type, `${done} of ${rows.length} rows imported`);
    res.json({ type: req.params.type, total: rows.length, imported: done, failed: rows.length - done, rows: out });
  });
};
module.exports.TYPES = TYPES;
