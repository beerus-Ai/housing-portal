// NFC gate cards (2026-11-25, contract docs/nfc-api.md). The guard registers a card to a person; tapping it at the
// gate checks them in, the next tap checks them out, with timestamps. For staff, the tap also starts or ends the shift.
// Cards are read by Web NFC (Chrome on Android) or a USB reader that types the card number. Every change is audited.

const normSerial = s => String(s || '').toUpperCase().replace(/[^0-9A-F]/g, '');

module.exports = function mountNfc(app, c) {
  const { q, one, run, log, notify, auth, str } = c;
  const desk = (req, res, next) => (['guard', 'admin'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Guards and the committee only' }));
  const PERSON = "u.id, u.name, u.role, u.flat, u.department, u.resident_type";
  const WORKERS = ['staff', 'shop', 'laundry'];

  // People the guard can give a card to: approved residents and staff (minimum fields only).
  app.get('/api/gate/people', auth, desk, (req, res) => {
    const term = `%${str(req.query.q, 60).toLowerCase()}%`;
    res.json(q(`SELECT ${PERSON} FROM users u WHERE u.status='approved' AND u.role IN ('resident','staff','shop','laundry')
      AND (lower(u.name) LIKE ? OR lower(COALESCE(u.flat,'')) LIKE ?) ORDER BY u.name LIMIT 20`, term, term));
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
    const g = serial && one(`SELECT g.id AS card_id, ${PERSON} FROM gate_cards g JOIN users u ON u.id=g.user_id WHERE g.serial=? AND g.active=1`, serial);
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

  // Who is inside now, and the latest taps.
  app.get('/api/gate/presence', auth, desk, (req, res) => {
    const inside = q(`SELECT ${PERSON}, p.at FROM gate_presence p JOIN users u ON u.id=p.user_id
      WHERE p.id IN (SELECT MAX(id) FROM gate_presence GROUP BY user_id) AND p.direction='in' ORDER BY p.at DESC`);
    const recent = q(`SELECT p.id, p.direction, p.at, ${PERSON} FROM gate_presence p JOIN users u ON u.id=p.user_id ORDER BY p.id DESC LIMIT 30`);
    res.json({ inside, recent, cards: one('SELECT COUNT(*) AS n FROM gate_cards WHERE active=1').n });
  });
};
module.exports.normSerial = normSerial;
