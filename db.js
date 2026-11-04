const { DatabaseSync } = require('node:sqlite');
const bcrypt = require('bcryptjs');

const PERMISSIONS = [
  { key: 'request.create', label: 'Raise work requests' },
  { key: 'emergency.raise', label: 'Raise emergency alerts' },
  { key: 'gate.pass', label: 'Create visitor gate passes' },
  { key: 'household.manage', label: 'Add household members' },
  { key: 'notice.read', label: 'Read notices' },
  { key: 'contacts.read', label: 'View society contacts' },
  { key: 'lease.view', label: 'View own lease' },
  { key: 'vehicle.manage', label: 'Register vehicles' },
  { key: 'parking.view', label: 'View parking' },
];
const ACCESS_ROLES = ['owner', 'tenant', 'family'];

function openDb(file) {
  const db = new DatabaseSync(file || process.env.DB_FILE || 'portal.db');
  db.exec(`
  PRAGMA foreign_keys = ON;
  CREATE TABLE IF NOT EXISTS users(
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, email TEXT NOT NULL UNIQUE,
    phone TEXT, flat TEXT, resident_type TEXT,
    password_hash TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'resident',
    status TEXT NOT NULL DEFAULT 'pending', consent_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS vendors(
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, trade TEXT NOT NULL, phone TEXT);
  CREATE TABLE IF NOT EXISTS requests(
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    category TEXT NOT NULL, title TEXT NOT NULL, description TEXT, photo TEXT,
    status TEXT NOT NULL DEFAULT 'open', vendor_id INTEGER REFERENCES vendors(id),
    rating INTEGER, rating_comment TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS audit(
    id INTEGER PRIMARY KEY, actor_id INTEGER, entity TEXT NOT NULL, entity_id INTEGER,
    action TEXT NOT NULL, detail TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS notices(
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, body TEXT NOT NULL,
    author_id INTEGER NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS comments(
    id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES requests(id), user_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS leases(
    user_id INTEGER PRIMARY KEY REFERENCES users(id), start_date TEXT NOT NULL, end_date TEXT NOT NULL,
    owner_name TEXT, owner_phone TEXT, police_verified_on TEXT, agreement TEXT, parking TEXT);
  CREATE TABLE IF NOT EXISTS notifications(
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL, message TEXT NOT NULL,
    is_read INTEGER NOT NULL DEFAULT 0, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS emergencies(
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    type TEXT NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')), resolved_at TEXT, resolved_by INTEGER);
  CREATE TABLE IF NOT EXISTS contacts(
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL, phone TEXT NOT NULL,
    icon TEXT NOT NULL DEFAULT 'phone');
  CREATE TABLE IF NOT EXISTS gate_passes(
    id INTEGER PRIMARY KEY, flat TEXT NOT NULL, created_by INTEGER NOT NULL REFERENCES users(id),
    visitor_name TEXT NOT NULL, purpose TEXT, token TEXT NOT NULL UNIQUE, code TEXT NOT NULL,
    valid_from TEXT NOT NULL, valid_until TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'active',
    created_at TEXT NOT NULL DEFAULT (datetime('now')), used_at TEXT, used_by INTEGER);
  CREATE INDEX IF NOT EXISTS gate_passes_code ON gate_passes(code);
  CREATE TABLE IF NOT EXISTS resident_tokens(
    user_id INTEGER PRIMARY KEY REFERENCES users(id), token TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS gate_log(
    id INTEGER PRIMARY KEY, kind TEXT NOT NULL, subject TEXT, flat TEXT, result TEXT NOT NULL, reason TEXT,
    guard_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS vehicles(
    id INTEGER PRIMARY KEY, flat TEXT NOT NULL, user_id INTEGER, plate TEXT NOT NULL, plate_key TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL DEFAULT 'car', make TEXT, color TEXT, sticker TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS parking_slots(
    id INTEGER PRIMARY KEY, code TEXT NOT NULL UNIQUE, level TEXT, kind TEXT NOT NULL DEFAULT 'car',
    flat TEXT, vehicle_id INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS workers(
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, role TEXT NOT NULL DEFAULT 'other', phone TEXT, shift TEXT,
    status TEXT NOT NULL DEFAULT 'active', notes TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY, value TEXT);
  CREATE TABLE IF NOT EXISTS role_permissions(
    role TEXT NOT NULL, permission TEXT NOT NULL, allowed INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(role, permission));
  `);
  // Insert any missing role/permission row with its default; never touches rows the committee already edited.
  const ins = db.prepare('INSERT OR IGNORE INTO role_permissions(role,permission,allowed) VALUES(?,?,?)');
  const off = { owner: [], tenant: ['household.manage'], family: ['household.manage', 'lease.view', 'vehicle.manage'] };
  for (const role of Object.keys(off)) for (const k of PERMISSIONS.map(x => x.key)) ins.run(role, k, off[role].includes(k) ? 0 : 1);
  const admin =db.prepare("SELECT id FROM users WHERE role='admin'").get();
  if (!admin) {
    // Synthetic default admin for dev/demo. Set ADMIN_EMAIL / ADMIN_PASSWORD in production.
    if (process.env.NODE_ENV === 'production' && (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 12))
      throw new Error('Set ADMIN_EMAIL and ADMIN_PASSWORD (12+ chars) before first production start');
    const email = process.env.ADMIN_EMAIL || 'admin@society.test';
    const pw = process.env.ADMIN_PASSWORD || 'Admin@1234';
    db.prepare("INSERT INTO users(name,email,password_hash,role,status,consent_at) VALUES(?,?,?,?,?,datetime('now'))")
      .run('Society Admin', email, bcrypt.hashSync(pw, 10), 'admin', 'approved');
  }
  return db;
}
module.exports = { openDb, PERMISSIONS, ACCESS_ROLES };
