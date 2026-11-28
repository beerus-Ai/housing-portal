// Chat (docs/chat-api.md): the committee desk as one shared inbox, neighbour messages between residents with
// blocking, unread counts (per conversation and on /api/pulse), one notification per conversation until opened,
// no phones or emails, audit without message text, and roles refused where they should be. Synthetic data only.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-chat-'));
  const app = createApp({ dbFile: path.join(dir, 'c.db'), uploadDir: path.join(dir, 'up'), noTimers: true });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (method, url, body) => {
      const headers = { cookie };
      if (body) headers['content-type'] = 'application/json';
      const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      return { status: res.status, body: await res.json() };
    };
  };
  const admin = client();
  assert.equal((await admin('POST', '/api/login', ADMIN)).status, 200);
  const ids = {};
  const resident = async (email, flat, phone, approve = true) => {
    const c = client();
    assert.equal((await client()('POST', '/api/register', { name: email.split('@')[0], email, flat, phone, resident_type: 'owner', password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    ids[email] = p.id;
    if (!approve) return null;
    assert.equal((await admin('POST', `/api/admin/users/${p.id}/approve`)).status, 200);
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    return c;
  };
  const account = async (kind, email) => {
    const r = await admin('POST', '/api/admin/accounts', { name: kind + ' one', email, password: PW, kind });
    assert.equal(r.status, 201, kind);
    ids[email] = r.body.id;
    const c = client();
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    return c;
  };
  return { admin, resident, account, ids, client, close: () => server.close() };
}
const notes = async c => (await c('GET', '/api/notifications')).body.map(n => n.message);
const auditRows = async t => { const a = (await t.admin('GET', '/api/admin/audit')).body; return Array.isArray(a) ? a : a.rows || []; };
const pulseUnread = async c => (await c('GET', '/api/pulse')).body.chat_unread;

test('chat desk: one shared committee inbox, replies carry the member name, unread and notifications', async () => {
  const t = await boot();
  try {
    const res = await t.resident('asha@x.test', 'A-101', '9811100001');
    const member = await t.account('member', 'member@x.test');

    // validation: empty, whitespace only, too long; exactly 2000 is fine
    assert.equal((await res('POST', '/api/chat/desk', {})).status, 400);
    assert.equal((await res('POST', '/api/chat/desk', { body: '   ' })).status, 400);
    assert.equal((await res('POST', '/api/chat/desk', { body: 'x'.repeat(2001) })).status, 400);
    assert.equal((await res('POST', '/api/chat/desk', { body: 42 })).status, 400);
    assert.deepEqual((await res('GET', '/api/chat')).body, { conversations: [], unread: 0, desk_id: null, committee: false });

    const html = '<b>Lift</b> noisy & "stuck" <script>x</script>';
    const m1 = await res('POST', '/api/chat/desk', { body: html });
    assert.equal(m1.status, 201);
    const cid = m1.body.conversation_id;
    assert.equal((await res('POST', '/api/chat/desk', { body: 'y'.repeat(2000) })).body.conversation_id, cid, 'one desk thread per person');

    // every committee member sees the thread with 2 unread; pulse carries the total; the shape of pulse is kept
    for (const c of [t.admin, member]) {
      const l = (await c('GET', '/api/chat')).body;
      assert.equal(l.committee, true); assert.equal(l.conversations.length, 1);
      const cv = l.conversations[0];
      assert.equal(cv.id, cid); assert.equal(cv.kind, 'desk'); assert.equal(cv.title, 'asha'); assert.equal(cv.sub, 'Flat A-101'); assert.equal(cv.unread, 2);
      const p = (await c('GET', '/api/pulse')).body;
      assert.equal(p.chat_unread, 2); assert.ok('v' in p && 'a' in p, 'pulse keeps v and a');
    }
    // notified once for the two messages
    assert.equal((await notes(member)).filter(m => /New message for the committee from asha \(Flat A-101\)/.test(m)).length, 1);
    assert.ok(!(await notes(member)).some(m => m.includes('Lift')), 'notifications never carry the text');

    // the member opens it: their unread clears, the other member's does not (read state is per member)
    const open = (await member('GET', `/api/chat/${cid}`)).body;
    assert.equal(open.messages.length, 2);
    assert.equal(open.messages[0].body, html, 'stored as typed');
    assert.equal(open.messages[0].from, 'asha'); assert.equal(open.messages[0].mine, false); assert.equal(open.messages[0].committee, false);
    assert.equal(await pulseUnread(member), 0);
    assert.equal(await pulseUnread(t.admin), 2);

    // the member replies: the resident sees the member's name and is notified once
    assert.equal((await member('POST', `/api/chat/${cid}/messages`, { body: 'We will check the lift today' })).status, 201);
    assert.equal((await member('POST', `/api/chat/${cid}/messages`, { body: 'Technician booked' })).status, 201);
    assert.equal((await notes(res)).filter(m => /The committee replied to your message/.test(m)).length, 1);
    let mine = (await res('GET', '/api/chat')).body;
    assert.equal(mine.desk_id, cid); assert.equal(mine.unread, 2); assert.equal(mine.conversations[0].title, 'Committee'); assert.equal(mine.conversations[0].unread, 2);
    const seen = (await res('GET', `/api/chat/${cid}`)).body;
    assert.deepEqual(seen.messages.map(m => [m.from, m.committee, m.mine]), [['asha', false, true], ['asha', false, true], ['member one', true, false], ['member one', true, false]]);
    mine = (await res('GET', '/api/chat')).body;
    assert.equal(mine.unread, 0); assert.equal(mine.conversations[0].unread, 0);
    assert.equal(await pulseUnread(res), 0);
    assert.equal(await pulseUnread(t.admin), 2, "a colleague's reply is not unread for the committee; the person's messages still are");

    // after opening, the next reply notifies again
    await member('POST', `/api/chat/${cid}/messages`, { body: 'Done' });
    assert.equal((await notes(res)).filter(m => /The committee replied/.test(m)).length, 2);

    // the committee cannot write as a person, and strangers cannot read the thread
    assert.equal((await t.admin('POST', '/api/chat/desk', { body: 'hi' })).status, 403);
    const other = await t.resident('ravi@x.test', 'B-202', '9811100002');
    assert.equal((await other('GET', `/api/chat/${cid}`)).status, 404);
    assert.equal((await other('POST', `/api/chat/${cid}/messages`, { body: 'hi' })).status, 404);
    assert.equal((await other('GET', '/api/chat/999999')).status, 404);
    assert.equal((await t.admin('POST', `/api/chat/${cid}/block`)).status, 403, 'only residents block');
    assert.equal((await res('POST', `/api/chat/${cid}/block`)).status, 400, 'the desk cannot be blocked');

    // privacy: no phone or email anywhere in the chat responses
    const blob = JSON.stringify([(await t.admin('GET', '/api/chat')).body, (await t.admin('GET', `/api/chat/${cid}`)).body, (await res('GET', `/api/chat/${cid}`)).body]);
    assert.ok(!blob.includes('9811100001') && !blob.includes('@x.test') && !blob.includes('@society.test'), 'no phone or email');

    // audit: one row per message, action sent, detail with the conversation id only
    const rows = (await auditRows(t)).filter(a => a.entity === 'chat_message');
    assert.equal(rows.length, 5);
    assert.ok(rows.every(a => a.action === 'sent' && a.detail === `conversation ${cid}`));
    assert.ok(!JSON.stringify(await auditRows(t)).includes('Lift'), 'audit never holds the text');
  } finally { t.close(); }
});

test('chat desk: guards, staff, IT, shop and laundry chat with the committee; neighbour routes are for residents', async () => {
  const t = await boot();
  try {
    const res = await t.resident('neha@x.test', 'C-303');
    const nehaId = t.ids['neha@x.test'];
    const kinds = { guard: 'Security guard', maintenance: 'Staff', cleaner: 'Staff', it: 'IT support', shop: 'Tuck shop', laundry: 'Laundry service' };
    for (const [kind, sub] of Object.entries(kinds)) {
      const c = await t.account(kind, `${kind}@x.test`);
      const r = await c('POST', '/api/chat/desk', { body: `Hello from the ${kind} desk` });
      assert.equal(r.status, 201, kind);
      assert.equal((await c('POST', `/api/chat/${r.body.conversation_id}/messages`, { body: 'Second' })).status, 201, kind);
      const l = (await c('GET', '/api/chat')).body;
      assert.equal(l.desk_id, r.body.conversation_id, kind);
      assert.equal((await c('GET', `/api/chat/${r.body.conversation_id}`)).body.messages.length, 2, kind);
      assert.equal((await c('GET', '/api/chat/residents')).status, 403, kind);
      assert.equal((await c('POST', '/api/chat/direct', { user_id: nehaId, body: 'hi' })).status, 403, kind);
      assert.equal(typeof (await c('GET', '/api/pulse')).body.chat_unread, 'number', kind);
      const cv = (await t.admin('GET', '/api/chat')).body.conversations.find(x => x.id === r.body.conversation_id);
      assert.equal(cv.sub, sub, kind);
    }
    assert.equal((await t.admin('GET', '/api/chat')).body.conversations.length, 6);
    assert.equal((await t.admin('GET', '/api/chat/residents')).status, 403, 'the committee has no neighbour messages');
    assert.equal((await t.admin('POST', '/api/chat/direct', { user_id: nehaId, body: 'hi' })).status, 403);
    assert.equal((await res('GET', '/api/chat')).body.conversations.length, 0, "a resident never sees others' desk threads");
  } finally { t.close(); }
});

test('chat direct: residents write to each other, the committee cannot read it, blocking stops both ways', async () => {
  const t = await boot();
  try {
    const a = await t.resident('anil@x.test', 'D-1', '9822200001');
    const b = await t.resident('bina@x.test', 'D-2', '9822200002');
    const c = await t.resident('chetan@x.test', 'D-3');
    await t.resident('pending@x.test', 'D-4', null, false);
    const A = t.ids['anil@x.test'], B = t.ids['bina@x.test'];

    // the dropdown: approved residents only, not yourself, name and flat only
    const list = (await a('GET', '/api/chat/residents')).body;
    assert.deepEqual(list.map(r => r.flat), ['D-2', 'D-3']);
    assert.deepEqual(Object.keys(list[0]).sort(), ['conversation_id', 'flat', 'id', 'name']);
    assert.equal(list[0].conversation_id, null);

    assert.equal((await a('POST', '/api/chat/direct', { user_id: A, body: 'me' })).status, 400, 'not yourself');
    assert.equal((await a('POST', '/api/chat/direct', { user_id: t.ids['pending@x.test'], body: 'hi' })).status, 404, 'not a pending resident');
    assert.equal((await a('POST', '/api/chat/direct', { user_id: 1, body: 'hi' })).status, 404, 'not the committee');
    assert.equal((await a('POST', '/api/chat/direct', { user_id: B })).status, 400, 'a message is needed');
    const m1 = await a('POST', '/api/chat/direct', { user_id: B, body: 'Hi Bina, is the parcel yours?' });
    assert.equal(m1.status, 201);
    const cid = m1.body.conversation_id;
    assert.equal((await a('POST', '/api/chat/direct', { user_id: B, body: 'Second note' })).body.conversation_id, cid, 'one conversation per pair');
    assert.equal((await b('POST', '/api/chat/direct', { user_id: A, body: 'Yes, thanks' })).body.conversation_id, cid, 'the same pair either way');
    assert.equal((await a('GET', '/api/chat/residents')).body.find(r => r.id === B).conversation_id, cid);

    // bina was told once (two messages); anil was told once for bina's reply
    assert.equal((await notes(b)).filter(m => /anil \(Flat D-1\) sent you a message/.test(m)).length, 1);
    assert.equal((await notes(a)).filter(m => /bina \(Flat D-2\) sent you a message/.test(m)).length, 1);
    const bl = (await b('GET', '/api/chat')).body.conversations;
    assert.equal(bl.length, 1); assert.equal(bl[0].kind, 'direct'); assert.equal(bl[0].title, 'anil'); assert.equal(bl[0].sub, 'Flat D-1');
    assert.equal(bl[0].unread, 0, "bina's own reply moved her read marker"); assert.equal(bl[0].blocked, null);
    assert.equal((await a('GET', '/api/chat')).body.conversations[0].unread, 1);
    assert.equal(await pulseUnread(a), 1);
    const th = (await a('GET', `/api/chat/${cid}`)).body;
    assert.deepEqual(th.messages.map(m => [m.from, m.mine]), [['anil', true], ['anil', true], ['bina', false]]);
    assert.equal(await pulseUnread(a), 0, 'opened');
    assert.ok(!JSON.stringify(th).includes('98222') && !JSON.stringify(th).includes('@x.test'), 'no phone or email');

    // the committee and other residents cannot read neighbour messages
    assert.equal((await t.admin('GET', `/api/chat/${cid}`)).status, 404);
    assert.equal((await t.admin('POST', `/api/chat/${cid}/messages`, { body: 'hi' })).status, 404);
    assert.ok(!(await t.admin('GET', '/api/chat')).body.conversations.some(x => x.id === cid));
    assert.equal(await pulseUnread(t.admin), 0);
    assert.equal((await c('GET', `/api/chat/${cid}`)).status, 404);
    assert.equal((await c('POST', `/api/chat/${cid}/block`)).status, 404);

    // bina blocks anil: nobody can write, either way, by either route
    assert.equal((await b('POST', `/api/chat/${cid}/unblock`)).status, 409, 'not blocked yet');
    assert.equal((await b('POST', `/api/chat/${cid}/block`)).status, 200);
    assert.equal((await b('POST', `/api/chat/${cid}/block`)).status, 409, 'already blocked');
    assert.equal((await b('GET', `/api/chat/${cid}`)).body.conversation.blocked, 'me');
    assert.equal((await a('GET', `/api/chat/${cid}`)).body.conversation.blocked, 'them');
    const r1 = await a('POST', `/api/chat/${cid}/messages`, { body: 'Why?' });
    assert.equal(r1.status, 409); assert.match(r1.body.error, /cannot message/);
    assert.equal((await a('POST', '/api/chat/direct', { user_id: B, body: 'Again' })).status, 409);
    const r2 = await b('POST', `/api/chat/${cid}/messages`, { body: 'Oops' });
    assert.equal(r2.status, 409); assert.match(r2.body.error, /Unblock/);
    // anil can block too; unblocking one side still leaves the other block in force
    assert.equal((await a('POST', `/api/chat/${cid}/block`)).status, 200);
    assert.equal((await b('POST', `/api/chat/${cid}/unblock`)).status, 200);
    assert.equal((await b('POST', `/api/chat/${cid}/messages`, { body: 'Hello?' })).status, 409, "anil's block still stops bina");
    assert.equal((await a('POST', `/api/chat/${cid}/unblock`)).status, 200);
    assert.equal((await b('POST', `/api/chat/${cid}/messages`, { body: 'Sorry, misclick' })).status, 201);

    // audit: blocks and unblocks, messages without text
    const rows = await auditRows(t);
    const blocks = rows.filter(r => r.entity === 'chat_block');
    assert.deepEqual(blocks.map(r => r.action).sort(), ['blocked', 'blocked', 'unblocked', 'unblocked']);
    assert.ok(blocks.every(r => r.detail === `conversation ${cid}`));
    assert.ok(rows.filter(r => r.entity === 'chat_message').every(r => r.action === 'sent' && r.detail === `conversation ${cid}`));
    assert.ok(!JSON.stringify(rows).includes('parcel is yours'), 'no message text in the audit');

    // a resident who leaves the portal can no longer be written to
    assert.equal((await t.admin('POST', `/api/admin/users/${B}/reject`)).status, 200);
    assert.equal((await a('POST', `/api/chat/${cid}/messages`, { body: 'Still there?' })).status, 409);
    assert.ok(!(await a('GET', '/api/chat/residents')).body.some(r => r.id === B));
  } finally { t.close(); }
});

test('chat: signed-out callers are refused', async () => {
  const t = await boot();
  try {
    const anon = t.client();
    for (const [m, u] of [['GET', '/api/chat'], ['GET', '/api/chat/residents'], ['POST', '/api/chat/desk'], ['POST', '/api/chat/direct'], ['GET', '/api/chat/1'], ['POST', '/api/chat/1/messages'], ['POST', '/api/chat/1/block']]) {
      assert.equal((await anon(m, u, m === 'POST' ? { body: 'hi' } : undefined)).status, 401, `${m} ${u}`);
    }
  } finally { t.close(); }
});
