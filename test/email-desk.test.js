// Email desk: complaints are emailed (via an n8n webhook) when no committee member has the dashboard open,
// and the signed buttons in the email run the same actions as the dashboard.
const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';
const wait = ms => new Promise(r => setTimeout(r, ms));

async function boot() {
  // Fake n8n: records every email the portal asks it to send.
  const mails = [];
  const hook = http.createServer((req, res) => { let b = ''; req.on('data', c => (b += c)); req.on('end', () => { mails.push(JSON.parse(b)); res.end('{}'); }); });
  await new Promise(r => hook.listen(0, '127.0.0.1', r));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-desk-'));
  const app = createApp({ dbFile: path.join(dir, 'a.db'), uploadDir: path.join(dir, 'up'), noTimers: true });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  process.env.ADMIN_EMAIL_WEBHOOK_URL = `http://127.0.0.1:${hook.address().port}/webhook/sahyadri-admin-email`;
  process.env.PUBLIC_URL = base;
  const client = () => {
    let cookie = '';
    return async (method, url, body, extra = {}) => {
      const headers = { cookie, ...extra };
      if (body) headers['content-type'] = 'application/json';
      const res = await fetch(base + url, { method, headers, body: body && JSON.stringify(body) });
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      const text = await res.text();
      let json; try { json = JSON.parse(text); } catch { json = text; }
      return { status: res.status, body: json };
    };
  };
  const admin = client();
  await admin('POST', '/api/login', ADMIN);
  const person = async (email, flat) => {
    const c = client();
    assert.equal((await c('POST', '/api/register', { name: email.split('@')[0], email, flat, phone: '9000000001', resident_type: 'owner', password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    assert.equal((await admin('POST', `/api/admin/users/${p.id}/approve`)).status, 200);
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    return c;
  };
  // Submits a desk form exactly as the browser would (urlencoded POST).
  const desk = async (link, fields) => {
    const u = new URL(link);
    const res = await fetch(base + u.pathname, { method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(fields).toString() });
    return { status: res.status, html: await res.text() };
  };
  const linkFor = (mail, doName) => { const m = mail.html.match(new RegExp(`href="([^"]+/desk/[^"?]+\\?do=${doName})"`)); return m && m[1].replace(/&amp;/g, '&'); };
  const close = () => { server.close(); hook.close(); delete process.env.ADMIN_EMAIL_WEBHOOK_URL; delete process.env.PUBLIC_URL; try { app.locals.db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); };
  return { admin, person, client, mails, desk, linkFor, base, close };
}

test('a new complaint is emailed with action buttons, and an email button assigns the vendor', async () => {
  const { admin, person, mails, desk, linkFor, close } = await boot();
  try {
    await wait(50); mails.length = 0; // ignore the registration email
    await person('desk1@example.test', 'D-101');
    assert.equal((await admin('POST', '/api/vendors', { name: 'AquaFix Plumbing', trade: 'plumbing', phone: '9000000009' })).status, 201);
    // Requests are multipart (optional photo), so post a FormData with the resident's session cookie.
    const login = await fetch(process.env.PUBLIC_URL + '/api/login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: 'desk1@example.test', password: PW }) });
    const fd = new FormData(); fd.set('category', 'plumbing'); fd.set('title', 'Bathroom pipe leaking'); fd.set('description', 'Water on the floor');
    const created = await fetch(process.env.PUBLIC_URL + '/api/requests', { method: 'POST', body: fd, headers: { cookie: login.headers.get('set-cookie').split(';')[0] } });
    assert.equal(created.status, 201);
    const id = (await created.json()).id;
    await wait(150);
    const mail = mails.find(m => m.kind === 'request' && m.id === id);
    assert.ok(mail, 'request email sent');
    assert.match(mail.subject, /Bathroom pipe leaking/);
    assert.match(mail.html, /Assign AquaFix Plumbing/);
    assert.doesNotMatch(mail.html, /<script/i);

    // GET only shows a confirm page; it must never change anything (mail scanners prefetch links).
    const assignDo = (mail.html.match(/\?do=(assign-\d+)/) || [])[1];
    const link = linkFor(mail, assignDo);
    assert.ok(link, 'assign link present');
    const page = await fetch(link);
    assert.equal(page.status, 200);
    assert.match(await page.text(), /Confirm: Assign/);
    assert.equal((await admin('GET', `/api/requests/${id}`)).body.status, 'open');

    // Confirm (POST) runs the real assign route as the committee admin.
    const done = await desk(link, { do: assignDo });
    assert.equal(done.status, 200, done.html);
    assert.match(done.html, /Done: Assign/);
    const after = (await admin('GET', `/api/requests/${id}`)).body;
    assert.equal(after.status, 'assigned');
    assert.ok(after.history.some(h => h.action === 'assigned'));
    assert.ok(after.history.some(h => h.action === 'email_action'));

    // Then start and close from the same email link, and reply to the resident.
    assert.equal((await desk(link, { do: 'start' })).status, 200);
    assert.equal((await desk(link, { do: 'reply', text: 'Plumber arrives at 4pm' })).status, 200);
    assert.equal((await desk(link, { do: 'close' })).status, 200);
    assert.equal((await admin('GET', `/api/requests/${id}`)).body.status, 'closed');
    // A closed request offers no more status actions.
    assert.equal((await desk(link, { do: 'close' })).status, 409);
  } finally { close(); }
});

test('no email while the dashboard is open; emergencies always email; registrations can be approved by email', async () => {
  const { admin, client, mails, desk, linkFor, close } = await boot();
  try {
    // Registration while nobody is on the dashboard -> email with Approve.
    const anon = client();
    assert.equal((await anon('POST', '/api/register', { name: 'New Owner', email: 'new@example.test', flat: 'E-1', phone: '9000000002', resident_type: 'owner', password: PW, consent: true })).status, 201);
    await wait(150);
    const reg = mails.find(m => m.kind === 'user');
    assert.ok(reg);
    assert.equal((await desk(linkFor(reg, 'approve'), { do: 'approve' })).status, 200);
    const owner = client();
    assert.equal((await owner('POST', '/api/login', { email: 'new@example.test', password: PW })).status, 200);

    // Admin has the dashboard open (polling /api/pulse) -> new registrations are not emailed.
    mails.length = 0;
    await admin('GET', '/api/pulse');
    assert.equal((await anon('POST', '/api/register', { name: 'Second', email: 'second@example.test', flat: 'E-2', phone: '9000000003', resident_type: 'owner', password: PW, consent: true })).status, 201);
    await wait(150);
    assert.equal(mails.filter(m => m.kind === 'user').length, 0);

    // ...but an emergency is emailed even while the dashboard is open, and can be resolved from the email.
    const em = await owner('POST', '/api/emergencies', { type: 'fire', note: 'Smoke in the corridor' });
    assert.equal(em.status, 201, JSON.stringify(em.body));
    await wait(150);
    const emMail = mails.find(m => m.kind === 'emergency');
    assert.ok(emMail);
    assert.match(emMail.subject, /^\[URGENT\]/);
    assert.equal((await desk(linkFor(emMail, 'resolve'), { do: 'resolve' })).status, 200);
    assert.equal((await admin('GET', '/api/emergencies')).body.find(e => e.id === em.body.id).status, 'resolved');
  } finally { close(); }
});

test('desk links are tamper-proof and the replay header cannot be forged from outside', async () => {
  const { client, base, close } = await boot();
  try {
    assert.equal((await fetch(base + '/desk/not-a-token')).status, 404);
    assert.equal((await fetch(base + '/desk/eyJrIjoidXNlciIsImkiOjEsImUiOjk5OTk5OTk5OTk5OTl9.forged')).status, 404);
    const anon = client();
    const r = await anon('GET', '/api/admin/users', null, { 'x-desk-key': 'x'.repeat(48), 'x-desk-user': '1' });
    assert.equal(r.status, 401);
  } finally { close(); }
});
