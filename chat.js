// Chat (2026-11-28, contract docs/chat-api.md). Two kinds of conversation:
// - desk: any signed-in person who is not on the committee has one thread with the committee, a shared inbox that
//   every committee member can read and answer (replies carry the member's name);
// - direct: a resident writes to another approved resident. Either side can block the other, which stops new
//   messages both ways. The committee cannot read these.
// Messages are plain text (1 to 2000 characters), stored as typed and escaped by the clients. No phone or email is
// ever returned. Each message is audited without its text (entity chat_message, action sent, detail the
// conversation id). A new message notifies the recipient once per conversation until they open it.

const MAX = 2000;
const ROLE_SUB = { guard: 'Security guard', staff: 'Staff', it: 'IT support', shop: 'Tuck shop', laundry: 'Laundry service' };
const subOf = u => (u.role === 'resident' ? (u.flat ? `Flat ${u.flat}` : 'Resident') : ROLE_SUB[u.role] || 'Member');

// Unread messages for one user (also used by /api/pulse in app.js). Committee: messages from the person in every desk
// thread after this member's last read. Everyone else: messages from others in their own conversations.
function unreadFor(one, u) {
  if (!u) return 0;
  if (u.role === 'admin') {
    return one(`SELECT COUNT(*) AS n FROM chat_messages m JOIN chat_conversations c ON c.id=m.conversation_id
      LEFT JOIN chat_reads r ON r.conversation_id=c.id AND r.user_id=? WHERE c.kind='desk' AND m.sender_id=c.user_a AND m.id>COALESCE(r.last_read_id,0)`, u.id).n;
  }
  return one(`SELECT COUNT(*) AS n FROM chat_messages m JOIN chat_conversations c ON c.id=m.conversation_id
    LEFT JOIN chat_reads r ON r.conversation_id=c.id AND r.user_id=? WHERE (c.user_a=? OR c.user_b=?) AND m.sender_id<>? AND m.id>COALESCE(r.last_read_id,0)`, u.id, u.id, u.id, u.id).n;
}

function mountChat(app, c) {
  const { q, one, run, log, notify, auth, committeeIds } = c;
  const isCom = u => u.role === 'admin';
  const isRes = u => u.role === 'resident' && !!u.flat;
  const resident = (req, res, next) => (isRes(req.user) ? next() : res.status(403).json({ error: 'Residents with a flat only' }));
  const nf = res => res.status(404).json({ error: 'Conversation not found' });
  const user = id => one('SELECT id, name, flat, role, status FROM users WHERE id=?', id);
  const activeResident = id => one("SELECT id, name, flat, role, status FROM users WHERE id=? AND role='resident' AND status='approved' AND flat IS NOT NULL AND flat<>''", id);
  const blockedBy = (a, b) => !!one('SELECT 1 AS x FROM chat_blocks WHERE blocker_id=? AND blocked_id=?', a, b);
  const otherOf = (cv, me) => (cv.user_a === me ? cv.user_b : cv.user_a);
  const canSee = (u, cv) => (cv.kind === 'desk' ? isCom(u) || cv.user_a === u.id : cv.user_a === u.id || cv.user_b === u.id);
  const conv = (u, id) => { const cv = /^\d+$/.test(String(id)) && one('SELECT * FROM chat_conversations WHERE id=?', Number(id)); return cv && canSee(u, cv) ? cv : null; };
  const bodyOf = b => {
    const t = b && b.body;
    if (typeof t !== 'string' || !t.trim()) return { error: 'Write a message' };
    if (t.length > MAX) return { error: `Keep a message to ${MAX} characters` };
    return { text: t };
  };
  const markRead = (cid, uid, upto) => run(`INSERT INTO chat_reads(conversation_id,user_id,last_read_id,notified) VALUES(?,?,?,0)
    ON CONFLICT(conversation_id,user_id) DO UPDATE SET last_read_id=MAX(last_read_id, excluded.last_read_id), notified=0`, cid, uid, upto);
  // Notify once per conversation until the recipient opens it (the flag is cleared by markRead).
  const nudge = (cid, uid, msg) => {
    const r = one('SELECT notified FROM chat_reads WHERE conversation_id=? AND user_id=?', cid, uid);
    if (r && r.notified) return;
    run(`INSERT INTO chat_reads(conversation_id,user_id,last_read_id,notified) VALUES(?,?,0,1)
      ON CONFLICT(conversation_id,user_id) DO UPDATE SET notified=1`, cid, uid);
    notify(uid, msg);
  };
  const unreadIn = (u, cv) => {
    const last = (one('SELECT last_read_id FROM chat_reads WHERE conversation_id=? AND user_id=?', cv.id, u.id) || {}).last_read_id || 0;
    return cv.kind === 'desk' && isCom(u)
      ? one('SELECT COUNT(*) AS n FROM chat_messages WHERE conversation_id=? AND sender_id=? AND id>?', cv.id, cv.user_a, last).n
      : one('SELECT COUNT(*) AS n FROM chat_messages WHERE conversation_id=? AND sender_id<>? AND id>?', cv.id, u.id, last).n;
  };
  const blockState = (u, cv) => {
    if (cv.kind !== 'direct') return null;
    const o = otherOf(cv, u.id);
    return blockedBy(u.id, o) ? 'me' : blockedBy(o, u.id) ? 'them' : null;
  };
  // A conversation as the caller sees it. Names and flats only: never a phone or an email.
  const shape = (u, cv) => {
    let title, sub, other = null;
    if (cv.kind === 'desk') {
      if (isCom(u)) { const p = user(cv.user_a) || { name: 'Former member', role: '' }; title = p.name; sub = subOf(p); other = { id: cv.user_a, name: p.name }; }
      else { title = 'Committee'; sub = 'Society committee desk'; }
    } else {
      const o = user(otherOf(cv, u.id)) || { name: 'Former resident', role: 'resident' };
      title = o.name; sub = subOf(o); other = { id: otherOf(cv, u.id), name: o.name, flat: o.flat || null };
    }
    const m = one('SELECT id, sender_id, body, created_at FROM chat_messages WHERE conversation_id=? ORDER BY id DESC LIMIT 1', cv.id);
    return { id: cv.id, kind: cv.kind, title, sub, other, unread: unreadIn(u, cv), blocked: blockState(u, cv),
      last: m ? { body: m.body.slice(0, 120), mine: m.sender_id === u.id, at: m.created_at } : null, last_at: cv.last_at };
  };
  // Stores the message, moves the sender's read marker, audits (no text) and nudges the recipients.
  const send = (u, cv, text) => {
    const r = run('INSERT INTO chat_messages(conversation_id,sender_id,body) VALUES(?,?,?)', cv.id, u.id, text);
    const mid = Number(r.lastInsertRowid);
    run("UPDATE chat_conversations SET last_at=datetime('now') WHERE id=?", cv.id);
    markRead(cv.id, u.id, mid);
    log(u.id, 'chat_message', mid, 'sent', `conversation ${cv.id}`);
    if (cv.kind === 'desk') {
      if (isCom(u)) nudge(cv.id, cv.user_a, 'The committee replied to your message. Open Chat to read it.');
      else for (const a of committeeIds()) nudge(cv.id, a, `New message for the committee from ${u.name} (${subOf(u)}). Open Chat to read it.`);
    } else nudge(cv.id, otherOf(cv, u.id), `${u.name} (${subOf(u)}) sent you a message. Open Chat to read it.`);
    return mid;
  };
  const startConv = (u, kind, a, b) => {
    const r = run('INSERT INTO chat_conversations(kind,user_a,user_b) VALUES(?,?,?)', kind, a, b);
    const id = Number(r.lastInsertRowid);
    log(u.id, 'chat_conversation', id, 'started', kind);
    return one('SELECT * FROM chat_conversations WHERE id=?', id);
  };

  // Conversations with at least one message, newest first. Non-committee callers also get their desk thread id.
  app.get('/api/chat', auth, (req, res) => {
    const u = req.user;
    const rows = isCom(u)
      ? q("SELECT c.* FROM chat_conversations c WHERE c.kind='desk' AND EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id=c.id) ORDER BY c.last_at DESC, c.id DESC LIMIT 300")
      : q(`SELECT c.* FROM chat_conversations c WHERE (c.user_a=? OR (c.kind='direct' AND c.user_b=?)) AND EXISTS (SELECT 1 FROM chat_messages m WHERE m.conversation_id=c.id)
          ORDER BY c.last_at DESC, c.id DESC LIMIT 300`, u.id, u.id);
    const desk = isCom(u) ? null : one("SELECT id FROM chat_conversations WHERE kind='desk' AND user_a=?", u.id);
    res.json({ conversations: rows.map(cv => shape(u, cv)), unread: unreadFor(one, u), desk_id: desk ? desk.id : null, committee: isCom(u) });
  });

  // Residents a resident can write to: approved, with a flat, not themselves. Name and flat only.
  app.get('/api/chat/residents', auth, resident, (req, res) => {
    const me = req.user.id;
    res.json(q(`SELECT u.id, u.name, u.flat, (SELECT c.id FROM chat_conversations c WHERE c.kind='direct' AND c.user_a=MIN(u.id,?) AND c.user_b=MAX(u.id,?)) AS conversation_id
      FROM users u WHERE u.role='resident' AND u.status='approved' AND u.flat IS NOT NULL AND u.flat<>'' AND u.id<>? ORDER BY u.flat, u.name`, me, me, me));
  });

  // Write to the committee (creates the caller's desk thread on the first message).
  app.post('/api/chat/desk', auth, (req, res) => {
    const u = req.user;
    if (isCom(u)) return res.status(403).json({ error: 'Committee members reply from the inbox' });
    const b = bodyOf(req.body);
    if (b.error) return res.status(400).json({ error: b.error });
    const cv = one("SELECT * FROM chat_conversations WHERE kind='desk' AND user_a=?", u.id) || startConv(u, 'desk', u.id, null);
    res.status(201).json({ id: send(u, cv, b.text), conversation_id: cv.id });
  });

  // Write to another resident (creates the conversation on the first message).
  app.post('/api/chat/direct', auth, resident, (req, res) => {
    const u = req.user, b0 = req.body || {}, to = Number(b0.user_id);
    if (to === u.id) return res.status(400).json({ error: 'You cannot message yourself' });
    const o = Number.isInteger(to) && activeResident(to);
    if (!o) return res.status(404).json({ error: 'Resident not found' });
    if (blockedBy(u.id, o.id)) return res.status(409).json({ error: 'You blocked this resident. Unblock them to send a message' });
    if (blockedBy(o.id, u.id)) return res.status(409).json({ error: 'You cannot message this resident' });
    const b = bodyOf(b0);
    if (b.error) return res.status(400).json({ error: b.error });
    const [a, z] = u.id < o.id ? [u.id, o.id] : [o.id, u.id];
    const cv = one("SELECT * FROM chat_conversations WHERE kind='direct' AND user_a=? AND user_b=?", a, z) || startConv(u, 'direct', a, z);
    res.status(201).json({ id: send(u, cv, b.text), conversation_id: cv.id });
  });

  // Open a conversation: its messages (last 300) and the caller's unread count cleared.
  app.get('/api/chat/:id', auth, (req, res) => {
    const u = req.user, cv = conv(u, req.params.id);
    if (!cv) return nf(res);
    const msgs = q(`SELECT m.id, m.sender_id, m.body, m.created_at, s.name, s.role FROM chat_messages m LEFT JOIN users s ON s.id=m.sender_id
      WHERE m.conversation_id=? ORDER BY m.id DESC LIMIT 300`, cv.id).reverse();
    if (msgs.length) markRead(cv.id, u.id, msgs[msgs.length - 1].id);
    else markRead(cv.id, u.id, 0);
    res.json({ conversation: shape(u, cv), messages: msgs.map(m => ({ id: m.id, mine: m.sender_id === u.id, from: m.name || 'Former member', committee: m.role === 'admin', body: m.body, at: m.created_at })) });
  });

  app.post('/api/chat/:id/messages', auth, (req, res) => {
    const u = req.user, cv = conv(u, req.params.id);
    if (!cv) return nf(res);
    if (cv.kind === 'direct') {
      if (!isRes(u)) return res.status(403).json({ error: 'Residents with a flat only' });
      const o = otherOf(cv, u.id);
      if (blockedBy(u.id, o)) return res.status(409).json({ error: 'You blocked this resident. Unblock them to send a message' });
      if (blockedBy(o, u.id)) return res.status(409).json({ error: 'You cannot message this resident' });
      if (!activeResident(o)) return res.status(409).json({ error: 'This resident is no longer on the portal' });
    }
    const b = bodyOf(req.body);
    if (b.error) return res.status(400).json({ error: b.error });
    res.status(201).json({ id: send(u, cv, b.text), conversation_id: cv.id });
  });

  // Block or unblock the other resident of a direct conversation. Audited (entity chat_block, id = the other resident).
  const blockRoute = on => (req, res) => {
    const u = req.user, cv = conv(u, req.params.id);
    if (!cv) return nf(res);
    if (cv.kind !== 'direct') return res.status(400).json({ error: 'The committee desk cannot be blocked' });
    const o = otherOf(cv, u.id), was = blockedBy(u.id, o);
    if (on === was) return res.status(409).json({ error: on ? 'Already blocked' : 'Not blocked' });
    if (on) run('INSERT INTO chat_blocks(blocker_id,blocked_id) VALUES(?,?)', u.id, o);
    else run('DELETE FROM chat_blocks WHERE blocker_id=? AND blocked_id=?', u.id, o);
    log(u.id, 'chat_block', o, on ? 'blocked' : 'unblocked', `conversation ${cv.id}`);
    res.json({ ok: true, blocked: on });
  };
  app.post('/api/chat/:id/block', auth, resident, blockRoute(true));
  app.post('/api/chat/:id/unblock', auth, resident, blockRoute(false));
}

module.exports = mountChat;
module.exports.unreadFor = unreadFor;
