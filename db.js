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
  // AI workflow columns and the WhatsApp message log (additive; safe to re-run).
  const cols = db.prepare('PRAGMA table_info(requests)').all().map(c => c.name);
  for (const [name, type] of [['source', "TEXT NOT NULL DEFAULT 'app'"], ['ai_category', 'TEXT'], ['ai_priority', 'TEXT'], ['ai_summary', 'TEXT'], ['ai_vendor_id', 'INTEGER'], ['ai_source', 'TEXT'], ['ai_confidence', 'REAL'], ['escalated_at', 'TEXT'], ['ai_action', 'TEXT']])
    if (!cols.includes(name)) db.exec('ALTER TABLE requests ADD COLUMN ' + name + ' ' + type);
  db.exec(`CREATE TABLE IF NOT EXISTS whatsapp_messages(
    id INTEGER PRIMARY KEY, direction TEXT NOT NULL, phone TEXT NOT NULL, body TEXT NOT NULL, user_id INTEGER, request_id INTEGER,
    status TEXT NOT NULL DEFAULT 'logged', created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  // Multi-channel intake (WhatsApp is the default; Telegram added): the message channel, and the resident's linked Telegram id (additive, safe to re-run).
  if (!db.prepare('PRAGMA table_info(whatsapp_messages)').all().some(c => c.name === 'channel'))
    db.exec("ALTER TABLE whatsapp_messages ADD COLUMN channel TEXT NOT NULL DEFAULT 'whatsapp'");
  if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'telegram_id'))
    db.exec('ALTER TABLE users ADD COLUMN telegram_id TEXT');
  // Roles from the faculty review (2026-11-21): committee position (member/head/sysadmin), staff assignment, cost approval,
  // reopen, staff shifts and the IT support queue. Additive and safe to re-run.
  if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'position'))
    db.exec('ALTER TABLE users ADD COLUMN position TEXT');
  const rcols = db.prepare('PRAGMA table_info(requests)').all().map(c => c.name);
  for (const [name, type] of [['assignee_id', 'INTEGER'], ['accepted_at', 'TEXT'], ['work_done_at', 'TEXT'], ['est_cost', 'REAL'], ['cost_status', 'TEXT'], ['cost_note', 'TEXT'], ['reopen_count', 'INTEGER NOT NULL DEFAULT 0'], ['closed_at', 'TEXT']])
    if (!rcols.includes(name)) db.exec('ALTER TABLE requests ADD COLUMN ' + name + ' ' + type);
  db.exec(`
  CREATE TABLE IF NOT EXISTS job_updates(
    id INTEGER PRIMARY KEY, request_id INTEGER NOT NULL REFERENCES requests(id), user_id INTEGER NOT NULL REFERENCES users(id),
    progress TEXT NOT NULL, note TEXT, photo TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS staff_shifts(
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), punch_in TEXT NOT NULL DEFAULT (datetime('now')),
    punch_out TEXT, handover_to INTEGER, handover_note TEXT);
  CREATE TABLE IF NOT EXISTS support_tickets(
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), subject TEXT NOT NULL, body TEXT NOT NULL,
    kind TEXT NOT NULL DEFAULT 'question', status TEXT NOT NULL DEFAULT 'open',
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS support_replies(
    id INTEGER PRIMARY KEY, ticket_id INTEGER NOT NULL REFERENCES support_tickets(id), user_id INTEGER NOT NULL REFERENCES users(id),
    body TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')));`);
  // Society modules from the faculty whiteboard (2026-11-25): amenity booking, maintenance dues, inventory, waste.
  // Additive and safe to re-run. Contract: docs/modules-api.md.
  db.exec(`
  CREATE TABLE IF NOT EXISTS amenities(
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, description TEXT, capacity INTEGER, open_from TEXT NOT NULL DEFAULT '06:00',
    open_to TEXT NOT NULL DEFAULT '22:00', slot_minutes INTEGER NOT NULL DEFAULT 60, active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS amenity_bookings(
    id INTEGER PRIMARY KEY, amenity_id INTEGER NOT NULL REFERENCES amenities(id), user_id INTEGER NOT NULL REFERENCES users(id),
    flat TEXT NOT NULL, date TEXT NOT NULL, start TEXT NOT NULL, end_at TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'booked',
    note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), cancelled_at TEXT);
  CREATE UNIQUE INDEX IF NOT EXISTS amenity_slot_once ON amenity_bookings(amenity_id, date, start) WHERE status='booked';
  CREATE TABLE IF NOT EXISTS dues(
    id INTEGER PRIMARY KEY, flat TEXT NOT NULL, period TEXT NOT NULL, title TEXT NOT NULL, amount REAL NOT NULL,
    due_date TEXT NOT NULL, created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE UNIQUE INDEX IF NOT EXISTS dues_once ON dues(flat, period, title);
  CREATE TABLE IF NOT EXISTS due_payments(
    id INTEGER PRIMARY KEY, due_id INTEGER NOT NULL REFERENCES dues(id), amount REAL NOT NULL, method TEXT NOT NULL,
    reference TEXT, recorded_by INTEGER NOT NULL REFERENCES users(id), paid_on TEXT NOT NULL DEFAULT (date('now')),
    created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS inventory_items(
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL DEFAULT 'other', unit TEXT NOT NULL DEFAULT 'pcs',
    quantity INTEGER NOT NULL DEFAULT 0, min_qty INTEGER NOT NULL DEFAULT 0, location TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS inventory_moves(
    id INTEGER PRIMARY KEY, item_id INTEGER NOT NULL REFERENCES inventory_items(id), change INTEGER NOT NULL, note TEXT,
    request_id INTEGER, user_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS waste_schedule(
    id INTEGER PRIMARY KEY, weekday INTEGER NOT NULL, kind TEXT NOT NULL, time TEXT NOT NULL, note TEXT);
  CREATE TABLE IF NOT EXISTS waste_logs(
    id INTEGER PRIMARY KEY, date TEXT NOT NULL, kind TEXT NOT NULL, weight_kg REAL NOT NULL, note TEXT,
    user_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));
  -- Resident services (services.js): tuck shop, laundry, parcel desk, community events.
  CREATE TABLE IF NOT EXISTS shop_items(
    id INTEGER PRIMARY KEY, name TEXT NOT NULL, category TEXT NOT NULL, price REAL NOT NULL, stock INTEGER NOT NULL DEFAULT 0, unit TEXT,
    image TEXT, active INTEGER NOT NULL DEFAULT 1, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS shop_orders(
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), flat TEXT NOT NULL, status TEXT NOT NULL DEFAULT 'placed',
    total REAL NOT NULL, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS shop_order_lines(
    id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES shop_orders(id), item_id INTEGER NOT NULL, name TEXT NOT NULL, price REAL NOT NULL, qty INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS laundry_rates(
    id INTEGER PRIMARY KEY, item TEXT NOT NULL, price REAL NOT NULL, active INTEGER NOT NULL DEFAULT 1);
  CREATE TABLE IF NOT EXISTS laundry_orders(
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), flat TEXT NOT NULL, pickup_date TEXT NOT NULL, pickup_slot TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'requested', total REAL NOT NULL, note TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')), updated_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS laundry_lines(
    id INTEGER PRIMARY KEY, order_id INTEGER NOT NULL REFERENCES laundry_orders(id), rate_id INTEGER NOT NULL, item TEXT NOT NULL, price REAL NOT NULL, qty INTEGER NOT NULL);
  CREATE TABLE IF NOT EXISTS parcels(
    id INTEGER PRIMARY KEY, flat TEXT NOT NULL, carrier TEXT NOT NULL, note TEXT, status TEXT NOT NULL DEFAULT 'waiting',
    logged_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')), collected_at TEXT, collected_by TEXT);
  CREATE TABLE IF NOT EXISTS events(
    id INTEGER PRIMARY KEY, title TEXT NOT NULL, description TEXT, starts_at TEXT NOT NULL, location TEXT, cancelled INTEGER NOT NULL DEFAULT 0,
    created_by INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE TABLE IF NOT EXISTS event_rsvps(
    event_id INTEGER NOT NULL REFERENCES events(id), user_id INTEGER NOT NULL REFERENCES users(id), created_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY(event_id, user_id));`);
  if (!db.prepare('PRAGMA table_info(shop_items)').all().some(c => c.name === 'image')) db.exec('ALTER TABLE shop_items ADD COLUMN image TEXT');
  if (!db.prepare('PRAGMA table_info(shop_items)').all().some(c => c.name === 'description')) db.exec('ALTER TABLE shop_items ADD COLUMN description TEXT');
  // Staff department (cleaning | maintenance) decides what a staff member sees; NFC gate cards and check-in/out.
  if (!db.prepare('PRAGMA table_info(users)').all().some(c => c.name === 'department')) db.exec('ALTER TABLE users ADD COLUMN department TEXT');
  // Purchases are connected to the flat's finances: how the order is received, how it is paid, and the bill when on credit.
  for (const [t, cols] of [['shop_orders', [['fulfilment', "TEXT NOT NULL DEFAULT 'delivery'"], ['payment', "TEXT NOT NULL DEFAULT 'cash'"], ['paid_at', 'TEXT'], ['due_id', 'INTEGER']]],
    ['laundry_orders', [['payment', "TEXT NOT NULL DEFAULT 'cash'"], ['paid_at', 'TEXT'], ['due_id', 'INTEGER']]]]) {
    const have = db.prepare(`PRAGMA table_info(${t})`).all().map(c => c.name);
    for (const [name, type] of cols) if (!have.includes(name)) db.exec(`ALTER TABLE ${t} ADD COLUMN ${name} ${type}`);
  }
  db.exec(`CREATE TABLE IF NOT EXISTS gate_cards(
    id INTEGER PRIMARY KEY, serial TEXT NOT NULL, user_id INTEGER NOT NULL REFERENCES users(id), label TEXT, active INTEGER NOT NULL DEFAULT 1,
    created_by INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE UNIQUE INDEX IF NOT EXISTS gate_cards_active ON gate_cards(serial) WHERE active=1;
  CREATE TABLE IF NOT EXISTS gate_presence(
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), card_id INTEGER, direction TEXT NOT NULL, guard_id INTEGER,
    at TEXT NOT NULL DEFAULT (datetime('now')));`);
  // Community card wallet (docs/card-wallet-api.md): a frozen card is refused everywhere; a prepaid ledger per flat; event check-in by card.
  if (!db.prepare('PRAGMA table_info(gate_cards)').all().some(c => c.name === 'frozen')) db.exec('ALTER TABLE gate_cards ADD COLUMN frozen INTEGER NOT NULL DEFAULT 0');
  db.exec(`CREATE TABLE IF NOT EXISTS wallet_tx(
    id INTEGER PRIMARY KEY, flat TEXT NOT NULL, amount REAL NOT NULL, kind TEXT NOT NULL, method TEXT, ref_type TEXT, ref_id INTEGER, note TEXT,
    by_user INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')));
  CREATE INDEX IF NOT EXISTS wallet_tx_flat ON wallet_tx(flat);
  CREATE TABLE IF NOT EXISTS event_checkins(
    event_id INTEGER NOT NULL REFERENCES events(id), user_id INTEGER NOT NULL REFERENCES users(id), at TEXT NOT NULL DEFAULT (datetime('now')),
    by_user INTEGER, PRIMARY KEY(event_id, user_id));`);
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
  seedDemoAccounts(db);
  return db;
}
// Optional demo accounts (one per role) so a freshly wiped hosted instance can be tested straight away.
// Only runs when SEED_PASSWORD (6+ chars, e.g. test123 for the demo) is set in the environment; never stored in the repo.
// Product information for the demo tuck shop range (see public/img/shop/CREDITS.md for the photos).
const SHOP_INFO = [
  ['milk', 'Toned milk, pasteurised. Delivered fresh every morning; keep refrigerated and use within 2 days.'],
  ['bread', 'Soft white sandwich loaf, sliced. Baked daily by a local bakery.'],
  ['eggs', 'Farm eggs, a tray of 12. Keep cool; best within 2 weeks.'],
  ['rice', 'Long-grain basmati rice, aged. Cooks fluffy and separate: rinse, then 1 cup rice to 2 cups water.'],
  ['tea', 'Strong Assam CTC black tea leaves, for chai. About 120 cups per pack.'],
  ['biscuits', 'Glucose biscuits, a family pack. Good with tea.'],
  ['detergent', 'Washing powder for machine and hand wash, 1 kg. Gentle on colours.'],
  ['soap', 'Bath soap, 100 g bar. Mild and moisturising.'],
];
function seedDemoAccounts(db) {
  const pw = process.env.SEED_PASSWORD;
  if (!pw || pw.length < 6) return;
  const hash = bcrypt.hashSync(pw, 10);
  const add = db.prepare("INSERT OR IGNORE INTO users(name,email,flat,resident_type,password_hash,role,status,consent_at) VALUES(?,?,?,?,?,?,'approved',datetime('now'))");
  add.run('Owner One', 'owner1@sahyadri.test', 'B-101', 'owner', hash, 'resident');
  add.run('Tenant One', 'tenant1@sahyadri.test', 'B-102', 'tenant', hash, 'resident');
  add.run('Family One', 'family.test@sahyadri.test', 'B-101', 'family', hash, 'resident');
  add.run('Guard One', 'guard1@sahyadri.test', null, null, hash, 'guard');
  add.run('Staff One', 'staff1@sahyadri.test', null, null, hash, 'staff');
  add.run('Cleaner One', 'cleaner1@sahyadri.test', null, null, hash, 'staff');
  add.run('IT Support', 'it1@sahyadri.test', null, null, hash, 'it');
  add.run('Committee Member', 'member1@sahyadri.test', null, null, hash, 'admin');
  add.run('Committee Head', 'head1@sahyadri.test', null, null, hash, 'admin');
  add.run('Tuck Shop', 'shop1@sahyadri.test', null, null, hash, 'shop');
  add.run('Laundry Service', 'laundry1@sahyadri.test', null, null, hash, 'laundry');
  db.prepare("UPDATE users SET department='maintenance' WHERE email='staff1@sahyadri.test' AND department IS NULL").run();
  db.prepare("UPDATE users SET department='cleaning' WHERE email='cleaner1@sahyadri.test' AND department IS NULL").run();
  db.prepare("UPDATE users SET position='member' WHERE email='member1@sahyadri.test' AND position IS NULL").run();
  db.prepare("UPDATE users SET position='head' WHERE email='head1@sahyadri.test' AND position IS NULL").run();
  // Optional Telegram test resident (flat T-101). The free hosting plan wipes the database on sleep and redeploy,
  // which unlinked the tester every time; recreating it at boot keeps the bot working. Phone and Telegram id
  // come from the environment only (SEED_TELEGRAM_PHONE, optional SEED_TELEGRAM_ID), never the repo.
  const tgPhone = (process.env.SEED_TELEGRAM_PHONE || '').trim();
  if (tgPhone) {
    db.prepare("INSERT OR IGNORE INTO users(name,email,phone,flat,resident_type,password_hash,role,status,consent_at) VALUES(?,?,?,?,?,?,'resident','approved',datetime('now'))")
      .run('Telegram Tester', 'tg.tester@sahyadri.test', tgPhone, 'T-101', 'owner', hash);
    const tgId = (process.env.SEED_TELEGRAM_ID || '').trim();
    if (/^\d+$/.test(tgId)) db.prepare("UPDATE users SET telegram_id=? WHERE email='tg.tester@sahyadri.test' AND telegram_id IS NULL").run(tgId);
  }
  const t = db.prepare("SELECT id FROM users WHERE email='tenant1@sahyadri.test'").get();
  const y = new Date().getFullYear();
  if (t) db.prepare('INSERT OR IGNORE INTO leases(user_id,start_date,end_date,owner_name) VALUES(?,?,?,?)').run(t.id, `${y}-01-01`, `${y + 1}-12-31`, 'Owner One');
  // Example vendors (trade matches a request category so AI vendor suggestion works).
  // No unique key on these tables, so skip rows that already exist (otherwise every restart adds them again).
  const vend = db.prepare('INSERT INTO vendors(name,trade,phone) SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM vendors WHERE name=?1)');
  for (const row of [['AquaFix Plumbing', 'plumbing', '+91 98200 11001'], ['Voltas Electricals', 'electrical', '+91 98200 11002'], ['OtisCare Lifts', 'lift', '+91 98200 11003'], ['SparkleClean Services', 'housekeeping', '+91 98200 11004'], ['SecureGuard Systems', 'security', '+91 98200 11005'], ['FixItAll Handyman', 'other', '+91 98200 11006']]) vend.run(...row);
  // Example "who to call" contacts.
  const cont = db.prepare('INSERT INTO contacts(name,role,phone,icon) SELECT ?,?,?,? WHERE NOT EXISTS (SELECT 1 FROM contacts WHERE name=?1 AND role=?2)');
  for (const row of [['Society Office', 'Manager', '+91 22 2555 0100', 'briefcase'], ['Main Gate Security', 'Guard desk', '+91 98200 22001', 'shield-check'], ['AquaFix Plumbing', 'Plumber on call', '+91 98200 11001', 'drop'], ['Voltas Electricals', 'Electrician on call', '+91 98200 11002', 'wrench'], ['OtisCare Lifts', 'Lift breakdown', '+91 98200 11003', 'elevator'], ['Emergency / Ambulance', 'Medical', '108', 'first-aid'], ['Fire Brigade', 'Fire', '101', 'fire']]) cont.run(...row);
  // A few sample requests so the dashboard lists and charts are not empty (only when there are none).
  if (db.prepare('SELECT COUNT(*) AS n FROM requests').get().n === 0) {
    const owner = db.prepare("SELECT id FROM users WHERE email='owner1@sahyadri.test'").get();
    const req = db.prepare("INSERT INTO requests(user_id,category,title,description,source,status) VALUES(?,?,?,?,?,?)");
    if (owner) { req.run(owner.id, 'plumbing', 'Kitchen tap leaking', 'The kitchen tap has been dripping since yesterday.', 'app', 'open'); req.run(owner.id, 'electrical', 'Corridor light not working', 'The 3rd floor corridor light is out.', 'app', 'open'); }
    if (t) req.run(t.id, 'housekeeping', 'Garbage not collected', 'Garbage on B wing was not collected today.', 'app', 'open');
  }
  // A small tuck shop range and laundry price list so the services can be tried straight away.
  if (db.prepare('SELECT COUNT(*) AS n FROM shop_items').get().n === 0) {
    // Photos: public/img/shop (Wikimedia Commons, credited in CREDITS.md there).
    const si = db.prepare('INSERT INTO shop_items(name,category,price,stock,unit,image) VALUES(?,?,?,?,?,?)');
    for (const r of [['Milk', 'dairy', 30, 40, '500 ml'], ['Bread', 'groceries', 45, 20, 'loaf'], ['Eggs', 'dairy', 90, 15, 'dozen'], ['Rice', 'groceries', 350, 10, '5 kg'],
      ['Tea', 'groceries', 140, 12, '250 g'], ['Biscuits', 'snacks', 30, 30, 'pack'], ['Detergent', 'household', 180, 8, '1 kg'], ['Soap', 'personal care', 45, 25, 'bar']]) si.run(...r, `/img/shop/${r[0].toLowerCase()}.jpg`);
  }
  // Short product information for the shop cards; only fills items that have none, so the shop owner's own text stays.
  const info = db.prepare('UPDATE shop_items SET description=? WHERE lower(name)=? AND description IS NULL');
  for (const [n, d] of SHOP_INFO) info.run(d, n);
  if (db.prepare('SELECT COUNT(*) AS n FROM laundry_rates').get().n === 0) {
    const lr = db.prepare('INSERT INTO laundry_rates(item,price) VALUES(?,?)');
    for (const r of [['Shirt or top (wash and iron)', 20], ['Trousers (wash and iron)', 25], ['Saree (dry clean)', 120], ['Bedsheet', 40], ['Towel', 15], ['Suit (dry clean)', 250]]) lr.run(...r);
  }
  // Demo vehicles, parking slots and workers so the estate pages have data to test.
  if (db.prepare('SELECT COUNT(*) AS n FROM vehicles').get().n === 0) {
    const o1 = db.prepare("SELECT id FROM users WHERE email='owner1@sahyadri.test'").get();
    const veh = db.prepare('INSERT OR IGNORE INTO vehicles(flat,user_id,plate,plate_key,type,make,color) VALUES(?,?,?,?,?,?,?)');
    for (const [flat, plate, type, make, color] of [['B-101', 'MH12 AB 1234', 'car', 'Honda City', 'White'], ['B-102', 'MH12 CD 5678', 'car', 'Maruti Swift', 'Red'], ['B-101', 'MH12 EF 9012', 'bike', 'Honda Activa', 'Black']])
      veh.run(flat, flat === 'B-101' && o1 ? o1.id : null, plate, plate.replace(/[^A-Za-z0-9]/g, '').toUpperCase(), type, make, color);
    const slot = db.prepare('INSERT OR IGNORE INTO parking_slots(code,level,kind,flat) VALUES(?,?,?,?)');
    for (const [code, level, kind, flat] of [['P-01', 'Basement 1', 'car', 'B-101'], ['P-02', 'Basement 1', 'car', 'B-102'], ['P-03', 'Basement 1', 'car', null], ['P-04', 'Ground', 'bike', 'B-101'], ['P-05', 'Ground', 'bike', null]])
      slot.run(code, level, kind, flat);
    const wk = db.prepare('INSERT OR IGNORE INTO workers(name,role,phone,shift,status) VALUES(?,?,?,?,?)');
    wk.run('Ramesh Kumar', 'housekeeping', '+91 98200 33001', 'Morning', 'active');
    wk.run('Suresh Patil', 'gardener', '+91 98200 33002', 'Day', 'active');
    wk.run('Anil More', 'security', '+91 98200 33003', 'Night', 'active');
  }
}
module.exports = { openDb, PERMISSIONS, ACCESS_ROLES };
