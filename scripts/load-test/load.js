// Capacity test: seeds a realistic database, runs the real server as its own process and drives it with
// a mixed workload at rising concurrency. Writes results.json next to this file.
//   node scripts/load-test/load.js
// The model: every open screen polls /api/pulse every 5 s, plus page loads and occasional writes, so one
// active user is about 0.3 requests per second. Supported users = sustained requests/s ÷ 0.3 at p95 < 500 ms.
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');
const bcrypt = require('bcryptjs');

const ROOT = path.resolve(__dirname, '..', '..');
const DIR = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-load-'));
const DB = path.join(DIR, 'load.db');
const PORT = 3417, BASE = `http://localhost:${PORT}`;
const PW = 'LoadTest-2026';
const SEED = { residents: 2000, requests: 20000, audit: 100000, orders: 5000 };
const LEVELS = [10, 50, 100, 200, 400];
const SECONDS = 10;

function seed() {
  const { openDb } = require(path.join(ROOT, 'db.js'));
  const db = openDb(DB);
  const hash = bcrypt.hashSync(PW, 10);
  db.exec('BEGIN');
  const u = db.prepare("INSERT INTO users(name,email,flat,resident_type,password_hash,role,status,consent_at) VALUES(?,?,?,?,?,'resident','approved',datetime('now'))");
  for (let i = 1; i <= SEED.residents; i++) u.run(`Resident ${i}`, `r${i}@load.test`, `F-${i}`, 'owner', hash);
  const cats = ['plumbing', 'electrical', 'lift', 'housekeeping', 'security', 'other'], st = ['open', 'assigned', 'in_progress', 'closed'];
  const r = db.prepare("INSERT INTO requests(user_id,category,title,description,source,status) VALUES(?,?,?,?,'app',?)");
  const first = db.prepare("SELECT MIN(id) AS a FROM users WHERE role='resident'").get().a;
  for (let i = 0; i < SEED.requests; i++) r.run(first + (i % SEED.residents), cats[i % 6], `Load request ${i}`, 'Generated for the capacity test', st[i % 4]);
  const a = db.prepare("INSERT INTO audit(actor_id,entity,entity_id,action,detail) VALUES(?,?,?,?,?)");
  for (let i = 0; i < SEED.audit; i++) a.run(first + (i % SEED.residents), 'request', 1 + (i % SEED.requests), 'status', 'load');
  const o = db.prepare("INSERT INTO shop_orders(user_id,flat,total,status,fulfilment,payment) VALUES(?,?,?,?,?,?)");
  for (let i = 0; i < SEED.orders; i++) o.run(first + (i % SEED.residents), `F-${1 + (i % SEED.residents)}`, 100 + (i % 500), 'delivered', 'delivery', 'cash');
  db.exec('COMMIT');
  db.close();
  return fs.statSync(DB).size;
}

const wait = ms => new Promise(r => setTimeout(r, ms));
async function login(email) {
  const res = await fetch(BASE + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password: PW }) });
  if (!res.ok) throw new Error('login failed ' + res.status);
  return res.headers.get('set-cookie').split(';')[0];
}
const pct = (arr, p) => { if (!arr.length) return 0; const s = [...arr].sort((x, y) => x - y); return Math.round(s[Math.min(s.length - 1, Math.floor(p / 100 * s.length))]); };

// Mixed workload per virtual user: 70% live refresh, 15% request list, 10% notifications, 5% new request.
async function level(cookies, n) {
  const lat = [], until = Date.now() + SECONDS * 1000; let ok = 0, err = 0;
  const one = async i => {
    const cookie = cookies[i % cookies.length];
    while (Date.now() < until) {
      const x = Math.random(); const t0 = performance.now();
      try {
        let res;
        if (x < 0.70) res = await fetch(BASE + '/api/pulse', { headers: { cookie } });
        else if (x < 0.85) res = await fetch(BASE + '/api/requests', { headers: { cookie } });
        else if (x < 0.95) res = await fetch(BASE + '/api/notifications', { headers: { cookie } });
        else res = await fetch(BASE + '/api/requests', { method: 'POST', headers: { cookie, 'content-type': 'application/json' }, body: JSON.stringify({ category: 'other', title: 'Load test', description: 'x' }) });
        await res.arrayBuffer();
        res.ok ? ok++ : err++;
      } catch { err++; }
      lat.push(performance.now() - t0);
    }
  };
  await Promise.all(Array.from({ length: n }, (_, i) => one(i)));
  const rps = Math.round(ok / SECONDS);
  return { concurrency: n, rps, p50_ms: pct(lat, 50), p95_ms: pct(lat, 95), errors: err };
}

(async () => {
  const t0 = Date.now();
  const bytes = seed();
  console.log(`seeded ${JSON.stringify(SEED)} in ${Date.now() - t0} ms, db ${(bytes / 1048576).toFixed(1)} MB`);
  const srv = spawn(process.execPath, [path.join(ROOT, 'server.js')], { env: { ...process.env, PORT: String(PORT), DB_FILE: DB, UPLOAD_DIR: path.join(DIR, 'up'), NODE_ENV: 'development' }, stdio: 'ignore' });
  try {
    for (let i = 0; i < 50; i++) { try { if ((await fetch(BASE + '/healthz')).ok) break; } catch {} await wait(200); }
    // sign-in speed (bcrypt cost 10 on one core)
    const l0 = performance.now(), cookies = [];
    for (let i = 1; i <= 100; i++) cookies.push(await login(`r${i}@load.test`));
    const loginPerSec = Math.round(100 / ((performance.now() - l0) / 1000));
    const levels = [];
    for (const n of LEVELS) { const r = await level(cookies, n); levels.push(r); console.log(JSON.stringify(r)); }
    const okLevels = levels.filter(l => l.p95_ms < 500 && l.errors === 0);
    const best = okLevels.reduce((m, l) => (l.rps > m.rps ? l : m), { rps: 0 });
    const out = {
      machine: `${os.cpus()[0].model.trim()} · ${os.cpus().length} cores · Node ${process.version}`,
      seed: SEED, db_mb: Math.round(bytes / 1048576 * 10) / 10,
      bytes_per_request_row: Math.round(bytes / (SEED.requests + SEED.audit + SEED.orders + SEED.residents)),
      login_per_sec: loginPerSec, levels,
      sustained_rps: best.rps, active_users_supported: Math.floor(best.rps / 0.3),
    };
    fs.writeFileSync(path.join(__dirname, 'results.json'), JSON.stringify(out, null, 2));
    console.log(JSON.stringify(out));
  } finally { srv.kill(); }
})().catch(e => { console.error(e); process.exit(1); });
