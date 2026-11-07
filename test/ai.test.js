const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');
const AI = require('../ai');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-ai-'));
  const app = createApp({ dbFile: path.join(dir, 'a.db'), uploadDir: path.join(dir, 'up'), noTimers: true });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
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
  const close = () => { server.close(); try { app.locals.db.close(); } catch {} fs.rmSync(dir, { recursive: true, force: true }); };
  const person = async (email, flat, type, phone) => {
    const c = client();
    assert.equal((await client()('POST', '/api/register', { name: email.split('@')[0], email, flat, phone, resident_type: type, password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    assert.equal((await admin('POST', `/api/admin/users/${p.id}/approve`)).status, 200);
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    c.id = p.id;
    return c;
  };
  return { app, admin, client, person, close };
}

test('redact removes phones, emails and flat numbers before any model call', () => {
  const r = AI.redact('Call me on +91 98765 43210 or amit@example.test, flat B-101 tap leaks');
  assert.ok(!/98765|amit@|B-101/.test(r), r);
  assert.ok(r.includes('tap leaks'));
});

test('rule triage: category, priority and vendor suggestion', () => {
  const t = AI.triageRules('Sparks coming from the switch board in the hall', [{ id: 7, trade: 'Electrical' }]);
  assert.equal(t.category, 'electrical');
  assert.equal(t.priority, 'urgent');
  assert.equal(t.vendor_id, 7);
  assert.equal(AI.triageRules('Please paint the corridor when possible').priority, 'low');
  assert.equal(AI.triageRules('hello').category, 'other');
});

test('new requests are triaged for the committee only', async () => {
  const { admin, person, close } = await boot();
  try {
    await admin('POST', '/api/vendors', { name: 'Sparky', trade: 'electrical' });
    const o = await person('t1@example.test', 'A-101', 'owner', '9876543210');
    const c = await o('POST', '/api/requests', { category: 'other', title: 'Sparks from the socket', description: 'Burning smell too' });
    assert.equal(c.status, 201);
    const forAdmin = (await admin('GET', `/api/requests/${c.body.id}`)).body;
    assert.equal(forAdmin.ai.category, 'electrical');
    assert.equal(forAdmin.ai.priority, 'urgent');
    assert.ok(forAdmin.ai.vendor_id);
    const forOwner = (await o('GET', `/api/requests/${c.body.id}`)).body;
    assert.equal(forOwner.ai, undefined);
    assert.equal(forOwner.ai_priority, undefined);
    const note = (await admin('GET', '/api/notifications')).body.find(n => /AI: urgent/.test(n.message));
    assert.ok(note, 'admin notified with urgency');
  } finally { close(); }
});

test('whatsapp webhook: secret, unknown number, intake, status, emergency guidance', async () => {
  const { admin, person, client, close } = await boot();
  try {
    const o = await person('wa@example.test', 'B-202', 'owner', '+91 98765 43210');
    const cfg = (await admin('GET', '/api/admin/ai')).body;
    assert.ok(cfg.webhook_secret);
    const anon = client();
    assert.equal((await anon('POST', '/api/whatsapp/webhook', { from: '919876543210', text: 'tap leaking' })).status, 401);
    assert.equal((await anon('POST', '/api/whatsapp/webhook', { from: '919876543210', text: 'tap leaking' }, { 'x-webhook-secret': 'nope' })).status, 401);
    // unknown number: no request, a polite reply is logged
    const unk = await anon('POST', '/api/whatsapp/webhook', { from: '911111111111', text: 'lift stuck' }, { 'x-webhook-secret': cfg.webhook_secret });
    assert.deepEqual([unk.body.received, unk.body.created], [1, 0]);
    // known number (matched on the last 10 digits) becomes a request from the right flat
    const ok = await anon('POST', '/api/whatsapp/webhook', { from: '919876543210', text: 'The kitchen tap is leaking badly. Please send a plumber.' }, { 'x-webhook-secret': cfg.webhook_secret });
    assert.equal(ok.body.created, 1);
    const reqs = (await o('GET', '/api/requests')).body;
    assert.equal(reqs.length, 1);
    assert.equal(reqs[0].source, 'whatsapp');
    assert.equal(reqs[0].category, 'plumbing');
    assert.equal(reqs[0].flat, 'B-202');
    // status and emergency commands do not create requests
    await anon('POST', '/api/whatsapp/webhook', { from: '919876543210', text: 'status' }, { 'x-webhook-secret': cfg.webhook_secret });
    const sos = await anon('POST', '/api/whatsapp/webhook', { from: '919876543210', text: 'fire in the building' }, { 'x-webhook-secret': cfg.webhook_secret });
    assert.equal(sos.body.created, 0);
    assert.equal((await o('GET', '/api/requests')).body.length, 1);
    // Meta Cloud API payload and the ?secret= form
    const meta = { entry: [{ changes: [{ value: { messages: [{ from: '919876543210', type: 'text', text: { body: 'Garbage not collected today' } }] } }] }] };
    const m = await anon('POST', '/api/whatsapp/webhook?secret=' + cfg.webhook_secret, meta);
    assert.equal(m.body.created, 1);
    // committee updates reach the resident on WhatsApp
    const v = (await admin('POST', '/api/vendors', { name: 'Pipes Co', trade: 'plumbing' })).body;
    await admin('POST', `/api/requests/${reqs[0].id}/assign`, { vendor_id: v.id });
    const log = (await admin('GET', '/api/admin/ai')).body;
    assert.ok(log.messages.some(x => x.direction === 'out' && /assigned to Pipes Co/.test(x.body)), 'status sent to WhatsApp');
    assert.ok(log.messages.some(x => x.direction === 'out' && /not registered/.test(x.body)));
    assert.ok(log.messages.some(x => x.direction === 'out' && /Emergency button/.test(x.body)));
    assert.equal(log.counts.whatsapp_requests, 2);
    // the verify handshake
    assert.equal((await anon('GET', `/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=${cfg.webhook_secret}&hub.challenge=abc`)).body, 'abc');
    assert.equal((await anon('GET', '/api/whatsapp/webhook?hub.mode=subscribe&hub.verify_token=x&hub.challenge=abc')).status, 403);
    // residents cannot read the AI console or simulate
    assert.equal((await o('GET', '/api/admin/ai')).status, 403);
    assert.equal((await o('POST', '/api/admin/whatsapp/simulate', { phone: '1', text: 'x' })).status, 403);
  } finally { close(); }
});

test('admin simulator uses the same intake path', async () => {
  const { admin, person, close } = await boot();
  try {
    await person('sim@example.test', 'C-303', 'tenant', '9000011111');
    assert.equal((await admin('POST', '/api/admin/whatsapp/simulate', { phone: '', text: 'x' })).status, 400);
    const r = await admin('POST', '/api/admin/whatsapp/simulate', { phone: '9000011111', text: 'Lift is not working since morning' });
    assert.equal(r.status, 200);
    assert.ok(r.body.created);
    assert.match(r.body.replies[0], /logged as lift/);
  } finally { close(); }
});

test('SLA escalation flags overdue requests once and tells the committee', async () => {
  const { app, admin, person, close } = await boot();
  try {
    const o = await person('sla@example.test', 'D-404', 'owner', '9000022222');
    const c = await o('POST', '/api/requests', { category: 'lift', title: 'Lift door noisy' });
    assert.equal((await admin('POST', '/api/admin/escalations/run')).body.escalated, 0);
    app.locals.db.prepare("UPDATE requests SET created_at=datetime('now','-3 days') WHERE id=?").run(c.body.id);
    assert.equal((await admin('POST', '/api/admin/escalations/run')).body.escalated, 1);
    assert.equal((await admin('POST', '/api/admin/escalations/run')).body.escalated, 0, 'only once');
    assert.ok((await admin('GET', '/api/notifications')).body.some(n => /Escalated: "Lift door noisy"/.test(n.message)));
    assert.ok((await o('GET', '/api/notifications')).body.some(n => /escalated it to the committee/.test(n.message)));
    const ov = (await admin('GET', '/api/admin/overview')).body;
    assert.equal(ov.ai.escalated_open, 1);
    assert.equal(ov.ai.mode, 'rules');
    const hist = (await admin('GET', `/api/requests/${c.body.id}`)).body.history;
    assert.ok(hist.some(h => h.action === 'escalated'));
  } finally { close(); }
});

test('notice drafter and weekly digest', async () => {
  const { admin, person, close } = await boot();
  try {
    assert.equal((await admin('POST', '/api/admin/ai/draft-notice', { text: 'hi' })).status, 400);
    const d = (await admin('POST', '/api/admin/ai/draft-notice', { text: 'water tank cleaning on sunday 10am to 12pm' })).body;
    assert.match(d.title, /Water supply/);
    assert.match(d.body, /^Dear residents,/);
    assert.match(d.body, /Managing Committee$/);
    assert.ok(d.body.includes('Water tank cleaning on sunday 10am to 12pm.'));
    const o = await person('dg@example.test', 'E-505', 'owner', '9000033333');
    await o('POST', '/api/requests', { category: 'plumbing', title: 'Flooding in bathroom' });
    const g = (await admin('GET', '/api/admin/digest')).body;
    assert.match(g.text, /1 open request/);
    assert.match(g.text, /urgent/);
    assert.equal(g.source, 'rules');
    assert.equal((await o('GET', '/api/admin/digest')).status, 403);
  } finally { close(); }
});

test('message gate: chatter is ignored, unsure goes to review, real requests are logged', () => {
  const AIm = require('../ai');
  const d = t => AIm.classifyRules(t).decision;
  assert.equal(d('Good morning everyone!'), 'ignore');
  assert.equal(d('Thanks for organising the Diwali party'), 'ignore');
  assert.equal(d('Who is coming to the AGM on Sunday?'), 'ignore');
  assert.equal(d('Is the lift working?'), 'review');
  assert.equal(d('Water tank cleaning on Sunday'), 'review');
  assert.equal(d('Lift is not working since morning'), 'create');
  assert.equal(d('Garbage not collected today'), 'create');
  assert.equal(d('Sparks coming from the switch board'), 'create');
});

test('public group: chatter makes no ticket and no reply, review queue, committee approves or dismisses', async () => {
  const { admin, person, client, close } = await boot();
  const anon = client();
  try {
    await person('grp@example.test', 'E-505', 'owner', '9000033333');
    const cfg = (await admin('GET', '/api/admin/ai')).body;
    const hdr = { 'x-webhook-secret': cfg.webhook_secret };
    const post = text => anon('POST', '/api/whatsapp/webhook', { from: '919000033333', text, group: true }, hdr);
    const chat = await post('Good morning everyone, have a great day');
    assert.deepEqual([chat.body.created, chat.body.ignored], [0, 1]);
    const unknown = await anon('POST', '/api/whatsapp/webhook', { from: '911234500000', text: 'Lift is not working', group: true }, hdr);
    assert.deepEqual([unknown.body.created, unknown.body.ignored], [0, 1]);
    const unsure = await post('Is the lift working?');
    assert.equal(unsure.body.review, 1);
    const real = await post('Lift is not working since morning');
    assert.equal(real.body.created, 1);
    let log = (await admin('GET', '/api/admin/ai')).body;
    assert.equal(log.review.length, 1);
    assert.equal(log.counts.messages_review, 1);
    assert.equal(log.messages.filter(m => m.direction === 'out').length, 1, 'only the real request is answered');
    const id = log.review[0].id;
    const ok = await admin('POST', `/api/admin/whatsapp/messages/${id}/create-request`, {});
    assert.equal(ok.status, 201);
    assert.ok(ok.body.created);
    assert.equal((await admin('POST', `/api/admin/whatsapp/messages/${id}/create-request`, {})).status, 404, 'cannot approve twice');
    await post('Is the water tank clean?');
    log = (await admin('GET', '/api/admin/ai')).body;
    assert.equal((await admin('POST', `/api/admin/whatsapp/messages/${log.review[0].id}/dismiss`, {})).status, 200);
    assert.equal((await admin('GET', '/api/admin/ai')).body.review.length, 0);
    assert.equal((await anon('POST', `/api/admin/whatsapp/messages/${id}/dismiss`, {})).status, 401);
  } finally { close(); }
});
