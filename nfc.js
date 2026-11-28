// NFC gate cards (2026-11-25, contract docs/nfc-api.md). The guard registers a card to a person; tapping it at the
// gate checks them in, the next tap checks them out, with timestamps. For staff, the tap also starts or ends the shift.
// Cards are read by Web NFC (Chrome on Android) or a USB reader that types the card number. Every change is audited.

// Separators (space : - .) are dropped; anything else that is not hex makes the number invalid (no silent collisions).
const normSerial = s => { const v = String(s || '').toUpperCase().replace(/[\s:.\-]/g, ''); return /^[0-9A-F]*$/.test(v) ? v : ''; };

module.exports = function mountNfc(app, c) {
  const { q, one, run, log, notify, auth, str } = c;
  const desk = (req, res, next) => (['guard', 'admin'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Guards and the committee only' }));
  const PERSON = "u.id, u.name, u.role, u.flat, u.department, u.resident_type";
  const WORKERS = ['staff', 'shop', 'laundry'];

  // People the guard can give a card to: approved residents and staff (minimum fields only).
  // With q: the 20 best matches (search). Without q: everyone, up to 500, for the "Who carries this card?" dropdown.
  app.get('/api/gate/people', auth, desk, (req, res) => {
    const s = str(req.query.q, 60).toLowerCase(), term = `%${s}%`;
    res.json(q(`SELECT ${PERSON} FROM users u WHERE u.status='approved' AND u.role IN ('resident','staff','shop','laundry')
      AND (lower(u.name) LIKE ? OR lower(COALESCE(u.flat,'')) LIKE ?) ORDER BY u.name LIMIT ${s ? 20 : 500}`, term, term));
  });
  app.get('/api/gate/cards', auth, desk, (req, res) => {
    res.json(q(`SELECT u.id AS user_id, u.name, u.role, u.flat, u.department, u.resident_type, g.id, g.serial, g.label, g.active, g.created_at FROM gate_cards g JOIN users u ON u.id=g.user_id ORDER BY g.active DESC, u.name`)
      .map(x => ({ ...x, active: !!x.active })));
  });
  app.post('/api/gate/cards', auth, desk, (req, res) => {
    const b = req.body || {}, serial = normSerial(b.serial);
    if (serial.length < 4 || serial.length > 40) return res.status(400).json({ error: 'Tap the card, or type its number (4 to 40 hex characters)' });
    const u = one("SELECT id, name FROM users WHERE id=? AND status='approved' AND role IN ('resident','staff','shop','laundry')", Number(b.user_id));
    if (!u) return res.status(400).json({ error: 'Choose the person who will carry this card' });
    const taken = one('SELECT g.id, u.name FROM gate_cards g JOIN users u ON u.id=g.user_id WHERE g.serial=? AND g.active=1', serial);
    if (taken) return res.status(409).json({ error: `This card already belongs to ${taken.name}` });
    run('UPDATE gate_cards SET active=0 WHERE user_id=? AND active=1', u.id); // one active card per person
    run('DELETE FROM gate_cards WHERE serial=? AND active=0', serial);
    const r = run('INSERT INTO gate_cards(serial,user_id,label,created_by) VALUES(?,?,?,?)', serial, u.id, str(b.label, 60) || null, req.user.id);
    log(req.user.id, 'gate_card', r.lastInsertRowid, 'registered', `${serial} for ${u.name}`);
    notify(u.id, 'A gate card has been registered for you. Tap it at the gate when you come in and when you leave.');
    res.status(201).json({ id: Number(r.lastInsertRowid), serial });
  });
  app.delete('/api/gate/cards/:id', auth, desk, (req, res) => {
    const g = one('SELECT * FROM gate_cards WHERE id=? AND active=1', req.params.id);
    if (!g) return res.status(404).json({ error: 'Card not found' });
    run('UPDATE gate_cards SET active=0 WHERE id=?', g.id);
    log(req.user.id, 'gate_card', g.id, 'deactivated', g.serial);
    res.json({ ok: true });
  });

  // A tap toggles in/out for the card holder.
  app.post('/api/gate/tap', auth, desk, (req, res) => {
    const serial = normSerial((req.body || {}).serial);
    const g = serial && one(`SELECT g.id AS card_id, u.status, ${PERSON} FROM gate_cards g JOIN users u ON u.id=g.user_id WHERE g.serial=? AND g.active=1`, serial);
    // Only approved people get in: a suspended, removed or not-yet-approved holder is refused and logged.
    if (g && g.status !== 'approved') {
      run("INSERT INTO gate_log(kind,subject,flat,result,reason,guard_id) VALUES('card',?,?,'denied',?,?)", g.name, g.flat || null, g.status === 'pending' ? 'Not yet approved' : 'Account ' + g.status, req.user.id);
      return res.status(403).json({ error: `${g.name}'s account is ${g.status === 'pending' ? 'not approved yet' : g.status}. Do not let them in on this card.`, serial });
    }
    if (!g) {
      run("INSERT INTO gate_log(kind,subject,result,reason,guard_id) VALUES('card',?,'denied','Unknown card',?)", serial || '-', req.user.id);
      return res.status(404).json({ error: 'Unknown card. Register it first.', serial });
    }
    const last = one('SELECT direction FROM gate_presence WHERE user_id=? ORDER BY id DESC LIMIT 1', g.id);
    const direction = last && last.direction === 'in' ? 'out' : 'in';
    const r = run('INSERT INTO gate_presence(user_id,card_id,direction,guard_id) VALUES(?,?,?,?)', g.id, g.card_id, direction, req.user.id);
    run("INSERT INTO gate_log(kind,subject,flat,result,guard_id) VALUES('card',?,?,?,?)", g.name, g.flat || null, direction === 'in' ? 'allowed' : 'exit', req.user.id);
    // Staff: the card is also their attendance.
    let shift = null;
    if (WORKERS.includes(g.role)) {
      const open = one('SELECT id FROM staff_shifts WHERE user_id=? AND punch_out IS NULL', g.id);
      if (direction === 'in' && !open) { run('INSERT INTO staff_shifts(user_id) VALUES(?)', g.id); shift = 'started'; }
      if (direction === 'out' && open) { run("UPDATE staff_shifts SET punch_out=datetime('now') WHERE id=?", open.id); shift = 'ended'; }
      if (shift) log(g.id, 'shift', null, shift === 'started' ? 'punch_in' : 'punch_out', 'gate card');
    }
    log(req.user.id, 'gate_presence', r.lastInsertRowid, direction === 'in' ? 'checked_in' : 'checked_out', g.name);
    const at = one('SELECT at FROM gate_presence WHERE id=?', r.lastInsertRowid).at;
    res.json({ direction, at, shift, person: { id: g.id, name: g.name, role: g.role, flat: g.flat, department: g.department } });
  });

  // ---------- the card is each person's community ID: issued at onboarding, tied to money and activity
  const ISSUE_ROLES = "('resident','staff','shop','laundry','guard','it','admin')";
  const issue = (serial, userId, byId) => {
    serial = normSerial(serial);
    if (serial.length < 4 || serial.length > 40) return [400, 'Tap the card, or type its number (4 to 40 hex characters)'];
    const u = one(`SELECT id, name FROM users WHERE id=? AND role IN ${ISSUE_ROLES} AND status IN ('approved','pending')`, userId);
    if (!u) return [404, 'Person not found'];
    const taken = one('SELECT u.name, g.user_id FROM gate_cards g JOIN users u ON u.id=g.user_id WHERE g.serial=? AND g.active=1', serial);
    if (taken) return taken.user_id === u.id ? [200, serial] : [409, `This card already belongs to ${taken.name}`];
    run('UPDATE gate_cards SET active=0 WHERE user_id=? AND active=1', u.id); // one card per person: a new card replaces the old one
    run('DELETE FROM gate_cards WHERE serial=? AND active=0', serial);
    const r = run('INSERT INTO gate_cards(serial,user_id,created_by) VALUES(?,?,?)', serial, u.id, byId);
    log(byId, 'gate_card', r.lastInsertRowid, 'issued', `${serial} to ${u.name}`);
    notify(u.id, 'Your community card is ready. Tap it at the gate, at the tuck shop and for your shifts.');
    return [201, serial];
  };
  // The committee issues a card while onboarding someone (verification or a new account).
  app.post('/api/admin/users/:id/card', auth, (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Committee only' })), (req, res) => {
    const [code, v] = issue((req.body || {}).serial, Number(req.params.id), req.user.id);
    return code >= 400 ? res.status(code).json({ error: v }) : res.status(code).json({ serial: v });
  });
  // One timeline per person: gate, purchases, laundry, payments, bookings and shifts. Money is per flat.
  const activity = u => {
    const ev = [];
    for (const p of q('SELECT direction, at FROM gate_presence WHERE user_id=? ORDER BY id DESC LIMIT 15', u.id)) ev.push({ at: p.at, kind: 'gate', icon: p.direction === 'in' ? 'sign-in' : 'sign-out', text: p.direction === 'in' ? 'Checked in at the gate' : 'Checked out at the gate' });
    for (const s of q('SELECT punch_in, punch_out FROM staff_shifts WHERE user_id=? ORDER BY id DESC LIMIT 10', u.id)) { ev.push({ at: s.punch_in, kind: 'shift', icon: 'clock-user', text: 'Shift started' }); if (s.punch_out) ev.push({ at: s.punch_out, kind: 'shift', icon: 'clock-user', text: 'Shift ended' }); }
    if (u.flat) {
      for (const o of q('SELECT id, total, payment, fulfilment, status, created_at FROM shop_orders WHERE flat=? ORDER BY id DESC LIMIT 10', u.flat)) ev.push({ at: o.created_at, kind: 'shop', icon: 'shopping-bag', text: `Tuck shop #${o.id} (${o.fulfilment === 'counter' ? 'at the counter' : o.status})`, amount: o.total, payment: o.payment });
      for (const o of q('SELECT id, total, payment, status, created_at FROM laundry_orders WHERE flat=? ORDER BY id DESC LIMIT 10', u.flat)) ev.push({ at: o.created_at, kind: 'laundry', icon: 't-shirt', text: `Laundry #${o.id} (${o.status.replace('_', ' ')})`, amount: o.total, payment: o.payment });
      for (const p of q('SELECT p.amount, p.method, p.created_at, d.title FROM due_payments p JOIN dues d ON d.id=p.due_id WHERE d.flat=? ORDER BY p.id DESC LIMIT 10', u.flat)) ev.push({ at: p.created_at, kind: 'payment', icon: 'receipt', text: `Paid: ${p.title}`, amount: p.amount, payment: p.method });
      for (const b of q("SELECT b.date, b.start, a.name, b.created_at FROM amenity_bookings b JOIN amenities a ON a.id=b.amenity_id WHERE b.flat=? AND b.status='booked' ORDER BY b.id DESC LIMIT 5", u.flat)) ev.push({ at: b.created_at, kind: 'booking', icon: 'calendar-check', text: `Booked ${b.name} for ${b.date} ${b.start}` });
    }
    ev.sort((a, b) => String(b.at).localeCompare(String(a.at)));
    const money = u.flat ? (() => {
      const dues = q('SELECT d.amount, (SELECT COALESCE(SUM(amount),0) FROM due_payments WHERE due_id=d.id) AS paid, d.title FROM dues d WHERE d.flat=?', u.flat);
      const bal = dues.reduce((t, d) => t + Math.max(0, d.amount - d.paid), 0);
      const credit = dues.filter(d => /^(Tuck shop order|Laundry) #/.test(d.title)).reduce((t, d) => t + Math.max(0, d.amount - d.paid), 0);
      return { balance: Math.round(bal * 100) / 100, credit_used: Math.round(credit * 100) / 100, credit_limit: c.creditLimit ? c.creditLimit() : null };
    })() : null;
    return { cards: q('SELECT id, serial, created_at FROM gate_cards WHERE user_id=? AND active=1', u.id), money, activity: ev.slice(0, 30) };
  };
  app.get('/api/me/card', auth, (req, res) => res.json(activity(req.user)));
  app.get('/api/admin/users/:id/card', auth, (req, res, next) => (req.user.role === 'admin' ? next() : res.status(403).json({ error: 'Committee only' })), (req, res) => {
    const u = one(`SELECT id, name, role, flat FROM users WHERE id=? AND role IN ${ISSUE_ROLES}`, req.params.id);
    if (!u) return res.status(404).json({ error: 'Person not found' });
    res.json({ name: u.name, ...activity(u) });
  });
  // Card lookup for the shop counter: who is this, and how much credit is left for the flat.
  const holder = serial => one(`SELECT u.id, u.name, u.role, u.flat FROM gate_cards g JOIN users u ON u.id=g.user_id WHERE g.serial=? AND g.active=1 AND u.status='approved'`, normSerial(serial));
  app.post('/api/shop/card', auth, (req, res) => {
    if (req.user.role !== 'shop') return res.status(403).json({ error: 'Tuck shop only' });
    const h = holder((req.body || {}).serial);
    if (!h || h.role !== 'resident' || !h.flat) return res.status(404).json({ error: 'No resident card with that number' });
    const m = activity(h).money;
    res.json({ name: h.name, flat: h.flat, credit_used: m.credit_used, credit_limit: m.credit_limit });
  });
  app.locals.cardHolder = holder;
  // Called when someone is removed: their cards stop working and they are no longer counted inside.
  app.locals.retireCards = (userId, byId) => {
    const n = run('UPDATE gate_cards SET active=0 WHERE user_id=? AND active=1', userId).changes;
    const last = one('SELECT direction FROM gate_presence WHERE user_id=? ORDER BY id DESC LIMIT 1', userId);
    if (last && last.direction === 'in') run("INSERT INTO gate_presence(user_id,direction,guard_id) VALUES(?,'out',?)", userId, byId);
    if (n) log(byId, 'gate_card', null, 'deactivated', `cards of removed user ${userId}`);
  };

  // Who is inside now, and the latest taps.
  app.get('/api/gate/presence', auth, desk, (req, res) => {
    const inside = q(`SELECT ${PERSON}, p.at FROM gate_presence p JOIN users u ON u.id=p.user_id
      WHERE p.id IN (SELECT MAX(id) FROM gate_presence GROUP BY user_id) AND p.direction='in' ORDER BY p.at DESC`);
    const recent = q(`SELECT p.id, p.direction, p.at, ${PERSON} FROM gate_presence p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 30`);
    res.json({ inside, recent, cards: one('SELECT COUNT(*) AS n FROM gate_cards WHERE active=1').n });
  });
};
module.exports.normSerial = normSerial;
