const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-tg-'));
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

test('telegram webhook rejects a bad or missing secret', async () => {
  const { admin, client, close } = await boot();
  const anon = client();
  try {
    const cfg = (await admin('GET', '/api/admin/ai')).body;
    assert.ok(cfg.telegram_webhook_secret);
    assert.equal(cfg.telegram_live, false);
    assert.equal(cfg.telegram_webhook_path, '/api/telegram/webhook');
    const upd = { message: { from: { id: 1 }, chat: { id: 1, type: 'private' }, text: 'hi' } };
    assert.equal((await anon('POST', '/api/telegram/webhook', upd)).status, 401);
    assert.equal((await anon('POST', '/api/telegram/webhook', upd, { 'x-telegram-bot-api-secret-token': 'nope' })).status, 401);
  } finally { close(); }
});

test('telegram: resident links by sharing contact, then a real message becomes a request', async () => {
  const { admin, person, client, close } = await boot();
  const anon = client();
  try {
    await person('tg1@example.test', 'C-301', 'owner', '9000033333');
    const sec = (await admin('GET', '/api/admin/ai')).body.telegram_webhook_secret;
    const hdr = { 'x-telegram-bot-api-secret-token': sec };
    const post = up => anon('POST', '/api/telegram/webhook', up, hdr);

    // Share own contact from a private chat -> links this Telegram id to the registered phone.
    const link = await post({ message: { from: { id: 555 }, chat: { id: 555, type: 'private' }, contact: { phone_number: '+91 90000 33333', user_id: 555 } } });
    assert.equal(link.body.linked, true);

    // A linked resident's genuine request creates a ticket (source 'telegram') and a reply goes back.
    const real = await post({ message: { from: { id: 555 }, chat: { id: 555, type: 'private' }, text: 'Lift is not working since morning' } });
    assert.equal(real.body.created, 1);

    const cfg = (await admin('GET', '/api/admin/ai')).body;
    assert.equal(cfg.counts.telegram_requests, 1);
    assert.ok(cfg.messages.some(m => m.channel === 'telegram' && m.direction === 'in'));
    assert.ok(cfg.messages.some(m => m.channel === 'telegram' && m.direction === 'out'), 'a confirmation was sent');
  } finally { close(); }
});

test('telegram: chatter is ignored, unsure waits for review, unknown sender in a group gets nothing', async () => {
  const { admin, person, client, close } = await boot();
  const anon = client();
  try {
    await person('tg2@example.test', 'C-302', 'owner', '9000044444');
    const sec = (await admin('GET', '/api/admin/ai')).body.telegram_webhook_secret;
    const hdr = { 'x-telegram-bot-api-secret-token': sec };
    const post = up => anon('POST', '/api/telegram/webhook', up, hdr);
    await post({ message: { from: { id: 777 }, chat: { id: 777, type: 'private' }, contact: { phone_number: '+919000044444', user_id: 777 } } });

    const chatter = await post({ message: { from: { id: 777 }, chat: { id: -100, type: 'supergroup' }, text: 'Good morning everyone, have a great day' } });
    assert.deepEqual([chatter.body.created, chatter.body.ignored], [0, 1]);

    const unknown = await post({ message: { from: { id: 888 }, chat: { id: -100, type: 'supergroup' }, text: 'Lift is not working since morning' } });
    assert.deepEqual([unknown.body.created, unknown.body.ignored], [0, 1]);

    const unsure = await post({ message: { from: { id: 777 }, chat: { id: 777, type: 'private' }, text: 'Is the lift working?' } });
    assert.equal(unsure.body.review, 1);
    assert.equal((await admin('GET', '/api/admin/ai')).body.review.length, 1);
  } finally { close(); }
});

test('telegram simulate is committee-only and runs the gate', async () => {
  const { admin, person, client, close } = await boot();
  try {
    const owner = await person('tg3@example.test', 'C-303', 'owner', '9000055555');
    const sec = (await admin('GET', '/api/admin/ai')).body.telegram_webhook_secret;
    // link first
    await client()('POST', '/api/telegram/webhook', { message: { from: { id: 999 }, chat: { id: 999, type: 'private' }, contact: { phone_number: '+919000055555', user_id: 999 } } }, { 'x-telegram-bot-api-secret-token': sec });

    assert.equal((await owner('POST', '/api/admin/telegram/simulate', { from_id: '999', text: 'x' })).status, 403);
    assert.equal((await admin('POST', '/api/admin/telegram/simulate', { from_id: '', text: 'x' })).status, 400);
    const out = await admin('POST', '/api/admin/telegram/simulate', { from_id: '999', text: 'Water is leaking from the ceiling in the parking' });
    assert.equal(out.status, 200);
    assert.ok(out.body.created);
  } finally { close(); }
});
