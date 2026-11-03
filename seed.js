// Synthetic demo data for "Sahyadri Heights". No real resident data. Run: npm run seed
// Safe to re-run: it only seeds an empty society (no residents yet). Use a fresh DB_FILE to reseed.
const bcrypt = require('bcryptjs');
const { openDb } = require('./db');

const db = openDb();
const run = (sql, ...p) => db.prepare(sql).run(...p);
const one = (sql, ...p) => db.prepare(sql).get(...p);

if (one("SELECT id FROM users WHERE role!='admin'")) {
  console.log('Residents already exist. Nothing seeded. (Use a fresh DB_FILE to reseed.)');
  process.exit(0);
}

const PW = bcrypt.hashSync(process.env.DEMO_PASSWORD || 'Demo@1234', 10);
const ago = (hours) => new Date(Date.now() - hours * 3600e3).toISOString().slice(0, 19).replace('T', ' ');

run("UPDATE users SET name='Sunil Kulkarni (Secretary)', phone='+91 98500 11220' WHERE role='admin'");
const admin = one("SELECT id FROM users WHERE role='admin'").id;

const user = (name, email, flat, type, status, hoursAgo) =>
  Number(run("INSERT INTO users(name,email,phone,flat,resident_type,password_hash,status,consent_at,created_at) VALUES(?,?,?,?,?,?,?,?,?)",
    name, email, '+91 98200 0' + String(Math.floor(Math.random() * 9000) + 1000), flat, type, PW, status, ago(hoursAgo), ago(hoursAgo)).lastInsertRowid);

const ananya = user('Ananya Rao', 'ananya@sahyadri.test', 'B-304', 'owner', 'approved', 900);
const aarav = user('Aarav Rao', 'aarav@sahyadri.test', 'B-304', 'family', 'approved', 880);
user('Sunita Rao', 'sunita@sahyadri.test', 'B-304', 'family', 'approved', 870);
const rohit = user('Rohit Deshmukh', 'rohit@sahyadri.test', 'C-701', 'tenant', 'approved', 800);
const farah = user('Farah Sheikh', 'farah@sahyadri.test', 'B-1102', 'owner', 'approved', 700);
const kiran = user('Kiran Joshi', 'kiran@sahyadri.test', 'A-902', 'owner', 'approved', 700);
const meera = user('Meera Pillai', 'meera@sahyadri.test', 'A-101', 'owner', 'approved', 700);
user('Vikram Shah', 'vikram@sahyadri.test', 'A-604', 'owner', 'pending', 40);
user('Priya Nair', 'priya@sahyadri.test', 'C-1102', 'tenant', 'pending', 38);
user('Ishaan Mehta', 'ishaan@sahyadri.test', 'A-1203', 'family', 'pending', 20);

run("INSERT INTO leases(user_id,start_date,end_date,owner_name,owner_phone,police_verified_on,agreement,parking) VALUES(?,?,?,?,?,?,?,?)",
  rohit, '2026-04-01', '2027-03-31', 'Meenal Kapoor', '+91 98221 30456', '2026-03-28', 'Registered, on file with the society', 'Slot C-14, basement 1');

const vendor = (name, trade, phone) => Number(run('INSERT INTO vendors(name,trade,phone) VALUES(?,?,?)', name, trade, phone).lastInsertRowid);
const V = {
  plumbing: vendor('Ramesh Plumbing', 'plumbing', '+91 98500 22110'),
  electrical: vendor('Volt Electricals', 'electrical', '+91 98500 22111'),
  lift: vendor('LiftCare Services', 'lift', '1800 266 0099'),
  staff: vendor('Society maintenance staff', 'housekeeping', '+91 98500 33440'),
};
V.housekeeping = V.staff; V.security = V.staff; V.other = V.staff;

const audit = (actor, id, action, detail, hoursAgo) =>
  run("INSERT INTO audit(actor_id,entity,entity_id,action,detail,created_at) VALUES(?,?,?,?,?,?)", actor, 'request', id, action, detail, ago(hoursAgo));

// status: open | assigned | in_progress | closed ; rating only when closed
function request({ u, cat, title, desc, status, vendorId, rating, comment, created, updated, steps }) {
  const id = Number(run('INSERT INTO requests(user_id,category,title,description,status,vendor_id,rating,rating_comment,created_at,updated_at) VALUES(?,?,?,?,?,?,?,?,?,?)',
    u, cat, title, desc || '', status, vendorId || null, rating || null, comment || null, ago(created), ago(updated ?? created)).lastInsertRowid);
  audit(u, id, 'created', `${cat}: ${title}`, created);
  for (const [who, action, detail, h] of steps || []) audit(who === 'admin' ? admin : u, id, action, detail, h);
  return id;
}

// The design's named requests
request({ u: rohit, cat: 'plumbing', title: 'Low water pressure in both bathrooms', desc: 'Pressure drops to a trickle after 8am.', status: 'open', created: 26 });
request({ u: ananya, cat: 'plumbing', title: 'Kitchen sink leaking under the cabinet', desc: 'Water pools under the sink every time it runs. The cabinet base is starting to swell. Home after 6pm on weekdays.',
  status: 'in_progress', vendorId: V.plumbing, created: 96, updated: 30,
  steps: [['admin', 'assigned', 'Ramesh Plumbing', 92], ['admin', 'status', 'assigned -> in_progress: visit done, part on order', 30]] });
request({ u: farah, cat: 'lift', title: 'Lift B stops between 6th and 7th floor', desc: 'Happened twice this week; doors open after a minute.', status: 'open', created: 72 });
request({ u: kiran, cat: 'housekeeping', title: 'Garbage not collected from A-wing 9th floor', desc: 'Two days running.', status: 'in_progress', vendorId: V.staff, created: 50, updated: 46,
  steps: [['admin', 'assigned', 'Society maintenance staff', 47], ['admin', 'status', 'assigned -> in_progress', 46]] });
request({ u: meera, cat: 'security', title: 'Gate 2 CCTV camera offline', desc: 'Screen at the guard cabin shows no feed.', status: 'open', created: 20 });
request({ u: rohit, cat: 'electrical', title: 'Geyser not heating in master bathroom', desc: 'Water stays cold even after 30 minutes.', status: 'closed', vendorId: V.electrical, created: 170, updated: 140,
  steps: [['admin', 'assigned', 'Volt Electricals', 166], ['admin', 'status', 'assigned -> in_progress', 160], ['admin', 'status', 'in_progress -> closed: thermostat replaced', 140]] });
request({ u: ananya, cat: 'electrical', title: 'Corridor light flickering outside B-304', desc: 'Tube light flickers all evening.', status: 'closed', vendorId: V.electrical, created: 216, updated: 190,
  steps: [['admin', 'assigned', 'Volt Electricals', 210], ['admin', 'status', 'assigned -> in_progress', 200], ['admin', 'status', 'in_progress -> closed: choke replaced', 190]] });
request({ u: rohit, cat: 'housekeeping', title: 'Balcony drain blocked', desc: 'Rainwater collects on the balcony.', status: 'closed', vendorId: V.staff, rating: 5, comment: 'Done the same day', created: 380, updated: 372,
  steps: [['admin', 'assigned', 'Society maintenance staff', 378], ['admin', 'status', 'in_progress -> closed: drain cleared', 374], [null, 'rated', '5', 372]] });
request({ u: ananya, cat: 'electrical', title: 'Doorbell not working', desc: 'No sound from the doorbell.', status: 'closed', vendorId: V.electrical, rating: 4, created: 460, updated: 440,
  steps: [['admin', 'assigned', 'Volt Electricals', 455], ['admin', 'status', 'in_progress -> closed: wiring fixed', 445], [null, 'rated', '4', 440]] });

// Background volume for the 8-week chart and vendor ratings (deterministic)
const cats = ['plumbing', 'electrical', 'lift', 'housekeeping', 'security'];
const residents = [farah, kiran, meera]; // background volume belongs to other flats, so each demo persona sees only their own story
const perWeek = [9, 12, 8, 14, 11, 16, 10];
const scores = { plumbing: [5, 5, 4, 5, 4], electrical: [4, 4, 5, 4, 4], lift: [3, 4, 3, 3, 4], housekeeping: [4, 4, 3, 4, 4], security: [4, 4, 4, 3, 4] };
let n = 0;
perWeek.forEach((count, w) => {
  for (let i = 0; i < count; i++, n++) {
    const cat = cats[n % cats.length];
    const created = (w + 1) * 168 + 12 + (i * 11) % 120;
    request({ u: residents[n % residents.length], cat, title: `${cat[0].toUpperCase() + cat.slice(1)} issue ${n + 1}`, status: 'closed', vendorId: V[cat],
      rating: scores[cat][n % 5], created, updated: created - 10 - (n % 30) });
  }
});

const notice = (title, body, hoursAgo) => run('INSERT INTO notices(title,body,author_id,created_at) VALUES(?,?,?,?)', title, body, admin, ago(hoursAgo));
notice('Annual general meeting moved to 16 November', 'Agenda and accounts will be shared a week before.', 120);
notice('Diwali lighting in the courtyard, 1 November', 'Volunteers meet at the clubhouse at 5pm.', 70);
notice('Water supply off on Tuesday, 10am to 2pm', 'Overhead tanks in Towers A and B are being cleaned. Please store water on Monday night.', 30);

console.log('Seeded Sahyadri Heights demo data.');
console.log('Committee: admin@society.test / Admin@1234 (override with ADMIN_EMAIL / ADMIN_PASSWORD on a fresh DB)');
console.log('Residents (password Demo@1234): ananya@sahyadri.test (owner), rohit@sahyadri.test (tenant), aarav@sahyadri.test (family)');
