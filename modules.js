// Society modules from the faculty whiteboard (2026-11-25, docs/architecture/product-and-technology-architecture.md):
// amenity booking, maintenance dues (financial management), inventory and waste management.
// Contract: docs/modules-api.md. Node only so far (Java and React not ported).
// Every state change is audited. Online payment is a planned interface: today the committee records payments.

const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const WASTE_KINDS = ['wet', 'dry', 'recyclable', 'hazardous', 'e-waste'];
const PAY_METHODS = ['cash', 'upi', 'bank', 'cheque'];
const INV_CATEGORIES = ['plumbing', 'electrical', 'cleaning', 'safety', 'garden', 'office', 'other'];
const BOOK_AHEAD_DAYS = 30, MAX_ACTIVE_PER_AMENITY = 2;

const HM = /^([01]\d|2[0-3]):[0-5]\d$/;
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const toMin = t => Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
const toHM = m => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
const validDate = s => YMD.test(s) && !isNaN(Date.parse(s + 'T00:00:00Z')) && new Date(s + 'T00:00:00Z').toISOString().slice(0, 10) === s;
// The society is in India: "today" and "now" for bookings and due dates are in IST.
const istNow = (now = new Date()) => {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' })
    .formatToParts(now).map(x => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
};
const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
const money = v => Math.round(Number(v) * 100) / 100;

module.exports = function mountModules(app, c) {
  const { q, one, run, log, notify, auth, admin, str, committeeIds, applyTriage, desk } = c;
  const clock = c.clock || (() => new Date());
  const notifyCommittee = msg => { for (const id of committeeIds()) notify(id, msg); };
  const notifyFlat = (flat, msg) => { for (const u of q("SELECT id FROM users WHERE role='resident' AND status='approved' AND flat=?", flat)) notify(u.id, msg); };
  const resident = (req, res, next) => (req.user.role === 'resident' && req.user.flat ? next() : res.status(403).json({ error: 'Residents with a flat only' }));
  const adminOrStaff = (req, res, next) => (['admin', 'staff'].includes(req.user.role) ? next() : res.status(403).json({ error: 'Committee or staff only' }));
  const bad = (res, msg) => res.status(400).json({ error: msg });

  // =====================================================================
  // Amenity management
  // =====================================================================
  const amenityBody = (b, base = {}) => {
    const a = {
      name: 'name' in b ? str(b.name, 80) : base.name,
      description: 'description' in b ? str(b.description, 300) || null : base.description ?? null,
      capacity: 'capacity' in b ? (b.capacity === '' || b.capacity == null ? null : Number(b.capacity)) : base.capacity ?? null,
      open_from: 'open_from' in b ? b.open_from : base.open_from || '06:00',
      open_to: 'open_to' in b ? b.open_to : base.open_to || '22:00',
      slot_minutes: 'slot_minutes' in b ? Number(b.slot_minutes) : base.slot_minutes || 60,
      active: 'active' in b ? (b.active ? 1 : 0) : base.active ?? 1,
    };
    if (!a.name) return [null, 'Give the amenity a name'];
    if (a.capacity != null && (!Number.isInteger(a.capacity) || a.capacity < 1 || a.capacity > 10000)) return [null, 'Capacity must be a whole number from 1'];
    if (!HM.test(a.open_from || '') || !HM.test(a.open_to || '')) return [null, 'Opening hours must look like 06:00 and 22:00'];
    if (![30, 60, 90, 120, 180, 240].includes(a.slot_minutes)) return [null, 'Slot length must be 30, 60, 90, 120, 180 or 240 minutes'];
    if (toMin(a.open_to) - toMin(a.open_from) < a.slot_minutes) return [null, 'Opening hours must fit at least one slot'];
    return [a, null];
  };
  const slotsOf = a => { const out = []; for (let m = toMin(a.open_from); m + a.slot_minutes <= toMin(a.open_to); m += a.slot_minutes) out.push([toHM(m), toHM(m + a.slot_minutes)]); return out; };

  app.get('/api/amenities', auth, (req, res) => {
    const rows = q(`SELECT * FROM amenities ${req.user.role === 'admin' ? '' : 'WHERE active=1'} ORDER BY name`);
    res.json(rows.map(a => ({ ...a, active: !!a.active })));
  });
  app.post('/api/amenities', auth, admin, (req, res) => {
    const [a, err] = amenityBody(req.body || {});
    if (err) return bad(res, err);
    if (one('SELECT id FROM amenities WHERE lower(name)=lower(?)', a.name)) return res.status(409).json({ error: 'An amenity with this name already exists' });
    const r = run('INSERT INTO amenities(name,description,capacity,open_from,open_to,slot_minutes,active) VALUES(?,?,?,?,?,?,?)', a.name, a.description, a.capacity, a.open_from, a.open_to, a.slot_minutes, a.active);
    log(req.user.id, 'amenity', r.lastInsertRowid, 'created', a.name);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.patch('/api/amenities/:id', auth, admin, (req, res) => {
    const cur = one('SELECT * FROM amenities WHERE id=?', req.params.id);
    if (!cur) return res.status(404).json({ error: 'Amenity not found' });
    const [a, err] = amenityBody(req.body || {}, cur);
    if (err) return bad(res, err);
    run('UPDATE amenities SET name=?,description=?,capacity=?,open_from=?,open_to=?,slot_minutes=?,active=? WHERE id=?', a.name, a.description, a.capacity, a.open_from, a.open_to, a.slot_minutes, a.active, cur.id);
    log(req.user.id, 'amenity', cur.id, 'updated', `${a.name}${cur.active && !a.active ? ' (closed for booking)' : ''}`);
    res.json({ ok: true });
  });
  // Slots for one day: each slot says whether it is free, booked by your flat, or taken.
  app.get('/api/amenities/:id/slots', auth, (req, res) => {
    const a = one('SELECT * FROM amenities WHERE id=?', req.params.id);
    if (!a || (!a.active && req.user.role !== 'admin')) return res.status(404).json({ error: 'Amenity not found' });
    const date = String(req.query.date || istNow(clock()).date);
    if (!validDate(date)) return bad(res, 'Date must look like 2026-11-25');
    const now = istNow(clock());
    const taken = new Map(q("SELECT b.start, b.flat, b.id, u.name FROM amenity_bookings b JOIN users u ON u.id=b.user_id WHERE b.amenity_id=? AND b.date=? AND b.status='booked'", a.id, date).map(b => [b.start, b]));
    res.json({
      amenity: { ...a, active: !!a.active }, date,
      slots: slotsOf(a).map(([start, end]) => {
        const b = taken.get(start), past = date < now.date || (date === now.date && start <= now.time);
        return { start, end, past, status: b ? (b.flat === req.user.flat ? 'mine' : 'taken') : 'free', ...(b && (req.user.role === 'admin' || b.flat === req.user.flat) ? { booking_id: b.id, flat: b.flat, by: b.name } : {}) };
      }),
    });
  });
  app.post('/api/bookings', auth, resident, (req, res) => {
    const b = req.body || {};
    const a = one('SELECT * FROM amenities WHERE id=? AND active=1', Number(b.amenity_id));
    if (!a) return res.status(404).json({ error: 'Amenity not found or closed for booking' });
    const date = String(b.date || ''), start = String(b.start || '');
    if (!validDate(date)) return bad(res, 'Choose a date');
    const slot = slotsOf(a).find(s => s[0] === start);
    if (!slot) return bad(res, 'Choose one of the listed time slots');
    const now = istNow(clock());
    if (date < now.date || (date === now.date && start <= now.time)) return bad(res, 'That slot has already started');
    if (date > addDays(now.date, BOOK_AHEAD_DAYS)) return bad(res, `Book at most ${BOOK_AHEAD_DAYS} days ahead`);
    const active = one("SELECT COUNT(*) AS n FROM amenity_bookings WHERE amenity_id=? AND flat=? AND status='booked' AND (date>? OR (date=? AND start>?))", a.id, req.user.flat, now.date, now.date, now.time).n;
    if (active >= MAX_ACTIVE_PER_AMENITY) return res.status(409).json({ error: `Your flat already has ${MAX_ACTIVE_PER_AMENITY} upcoming bookings for ${a.name}. Cancel one first.` });
    let r;
    try {
      r = run('INSERT INTO amenity_bookings(amenity_id,user_id,flat,date,start,end_at,note) VALUES(?,?,?,?,?,?,?)', a.id, req.user.id, req.user.flat, date, slot[0], slot[1], str(b.note, 200) || null);
    } catch (e) {
      if (/UNIQUE/i.test(String(e.message))) return res.status(409).json({ error: 'Someone has just booked this slot. Choose another.' });
      throw e;
    }
    log(req.user.id, 'booking', r.lastInsertRowid, 'booked', `${a.name} ${date} ${slot[0]}-${slot[1]} flat ${req.user.flat}`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  const BOOK_SELECT = `SELECT b.*, a.name AS amenity, u.name AS booked_by FROM amenity_bookings b JOIN amenities a ON a.id=b.amenity_id JOIN users u ON u.id=b.user_id`;
  app.get('/api/bookings', auth, (req, res) => {
    const where = [], p = [];
    if (req.user.role === 'admin') { /* every flat */ }
    else if (req.user.role === 'resident' && req.user.flat) { where.push('b.flat=?'); p.push(req.user.flat); }
    else return res.status(403).json({ error: 'Residents and committee only' });
    if (req.query.date && validDate(String(req.query.date))) { where.push('b.date=?'); p.push(String(req.query.date)); }
    if (req.query.scope !== 'all') { where.push("b.status='booked' AND b.date>=?"); p.push(istNow(clock()).date); }
    res.json(q(`${BOOK_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY b.date, b.start LIMIT 300`, ...p));
  });
  app.post('/api/bookings/:id/cancel', auth, (req, res) => {
    const b = one(`${BOOK_SELECT} WHERE b.id=?`, req.params.id);
    const mine = b && req.user.role === 'resident' && b.flat === req.user.flat;
    if (!b || (!mine && req.user.role !== 'admin')) return res.status(404).json({ error: 'Booking not found' });
    if (b.status !== 'booked') return res.status(409).json({ error: 'This booking is already cancelled' });
    run("UPDATE amenity_bookings SET status='cancelled', cancelled_at=datetime('now') WHERE id=?", b.id);
    log(req.user.id, 'booking', b.id, 'cancelled', `${b.amenity} ${b.date} ${b.start} flat ${b.flat}`);
    if (req.user.role === 'admin') notifyFlat(b.flat, `The committee cancelled your ${b.amenity} booking on ${b.date} at ${b.start}${req.body && req.body.reason ? ': ' + str(req.body.reason, 200) : ''}`);
    res.json({ ok: true });
  });

  // =====================================================================
  // Financial management: maintenance dues and recorded payments
  // =====================================================================
  const dueState = d => {
    const paid = money(d.paid || 0), balance = money(d.amount - paid);
    const today = istNow(clock()).date;
    const status = balance <= 0 ? 'paid' : paid > 0 ? 'partial' : d.due_date < today ? 'overdue' : 'unpaid';
    return { ...d, paid, balance: Math.max(0, balance), status, overdue: balance > 0 && d.due_date < today };
  };
  const DUE_SELECT = 'SELECT d.*, COALESCE((SELECT SUM(p.amount) FROM due_payments p WHERE p.due_id=d.id),0) AS paid FROM dues d';
  const flatsWithResidents = () => q("SELECT DISTINCT flat FROM users WHERE role='resident' AND status='approved' AND flat IS NOT NULL AND flat<>'' ORDER BY flat").map(r => r.flat);

  app.post('/api/admin/dues', auth, admin, (req, res) => {
    const b = req.body || {};
    const period = String(b.period || ''), title = str(b.title, 100) || 'Maintenance', amount = Number(b.amount), due = String(b.due_date || '');
    if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return bad(res, 'Period must look like 2026-11');
    if (!Number.isFinite(amount) || amount <= 0 || amount > 1e7) return bad(res, 'Enter the amount in rupees');
    if (!validDate(due)) return bad(res, 'Choose a due date');
    let flats;
    if (b.flats === 'all' || b.flats == null) flats = flatsWithResidents();
    else if (Array.isArray(b.flats)) flats = [...new Set(b.flats.map(f => str(f, 20)).filter(Boolean))];
    else return bad(res, "Flats must be 'all' or a list");
    if (!flats.length) return bad(res, 'No flats to bill yet: approve residents first');
    let created = 0, skipped = 0;
    for (const flat of flats) {
      try { run('INSERT INTO dues(flat,period,title,amount,due_date,created_by) VALUES(?,?,?,?,?,?)', flat, period, title, money(amount), due, req.user.id); created++; notifyFlat(flat, `New ${title.toLowerCase()} bill for ${period}: ₹${money(amount)}, due ${due}`); }
      catch (e) { if (/UNIQUE/i.test(String(e.message))) skipped++; else throw e; }
    }
    log(req.user.id, 'dues', null, 'raised', `${title} ${period}: ₹${money(amount)} x ${created} flats${skipped ? `, ${skipped} already billed` : ''}`);
    res.status(201).json({ created, skipped });
  });
  app.get('/api/dues', auth, (req, res) => {
    const where = [], p = [];
    if (req.user.role === 'resident' && req.user.flat) { where.push('d.flat=?'); p.push(req.user.flat); }
    else if (req.user.role !== 'admin') return res.status(403).json({ error: 'Residents and committee only' });
    if (/^\d{4}-\d{2}$/.test(String(req.query.period || ''))) { where.push('d.period=?'); p.push(String(req.query.period)); }
    if (req.user.role === 'admin' && req.query.flat) { where.push('d.flat=?'); p.push(str(String(req.query.flat), 20)); }
    let rows = q(`${DUE_SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY d.period DESC, d.flat LIMIT 1000`, ...p).map(dueState);
    if (['paid', 'partial', 'unpaid', 'overdue'].includes(req.query.status)) rows = rows.filter(d => d.status === req.query.status);
    const sum = k => money(rows.reduce((t, d) => t + d[k], 0));
    res.json({ dues: rows, totals: { billed: sum('amount'), collected: sum('paid'), outstanding: sum('balance'), overdue: rows.filter(d => d.overdue).length } });
  });
  app.get('/api/dues/:id', auth, (req, res) => {
    const d = one(`${DUE_SELECT} WHERE d.id=?`, req.params.id);
    if (!d || (req.user.role !== 'admin' && !(req.user.role === 'resident' && d.flat === req.user.flat))) return res.status(404).json({ error: 'Bill not found' });
    res.json({ ...dueState(d), payments: q('SELECT p.id,p.amount,p.method,p.reference,p.paid_on,p.created_at,u.name AS recorded_by FROM due_payments p JOIN users u ON u.id=p.recorded_by WHERE p.due_id=? ORDER BY p.id', d.id) });
  });
  app.post('/api/admin/dues/:id/payments', auth, admin, (req, res) => {
    const d = one(`${DUE_SELECT} WHERE d.id=?`, req.params.id);
    if (!d) return res.status(404).json({ error: 'Bill not found' });
    const s = dueState(d), b = req.body || {};
    const amount = money(b.amount), method = b.method, ref = str(b.reference, 100) || null;
    const paidOn = b.paid_on ? String(b.paid_on) : istNow(clock()).date;
    if (s.balance <= 0) return res.status(409).json({ error: 'This bill is already paid in full' });
    if (!Number.isFinite(amount) || amount <= 0) return bad(res, 'Enter the amount received');
    if (amount > s.balance) return bad(res, `That is more than the balance of ₹${s.balance}`);
    if (!PAY_METHODS.includes(method)) return bad(res, 'Choose cash, UPI, bank transfer or cheque');
    if (!validDate(paidOn) || paidOn > istNow(clock()).date) return bad(res, 'Payment date cannot be in the future');
    const r = run('INSERT INTO due_payments(due_id,amount,method,reference,recorded_by,paid_on) VALUES(?,?,?,?,?,?)', d.id, amount, method, ref, req.user.id, paidOn);
    log(req.user.id, 'dues', d.id, 'payment', `flat ${d.flat} ${d.period}: ₹${amount} by ${method}${ref ? ' ref ' + ref : ''}`);
    const left = money(s.balance - amount);
    notifyFlat(d.flat, `Payment of ₹${amount} recorded for ${d.title} ${d.period}. ${left > 0 ? `Balance ₹${left}.` : 'Paid in full, thank you.'}`);
    res.status(201).json({ id: Number(r.lastInsertRowid), balance: left });
  });

  // =====================================================================
  // Inventory management (committee manages; staff can take stock out for jobs)
  // =====================================================================
  const itemRow = i => ({ ...i, low: i.quantity <= i.min_qty });
  app.get('/api/inventory', auth, adminOrStaff, (req, res) => {
    let rows = q('SELECT * FROM inventory_items ORDER BY category, name').map(itemRow);
    if (req.query.low === '1') rows = rows.filter(i => i.low);
    res.json(rows);
  });
  const itemBody = (b, base = {}) => {
    const i = {
      name: 'name' in b ? str(b.name, 80) : base.name,
      category: 'category' in b ? b.category : base.category || 'other',
      unit: 'unit' in b ? str(b.unit, 20) || 'pcs' : base.unit || 'pcs',
      min_qty: 'min_qty' in b ? Number(b.min_qty) : base.min_qty ?? 0,
      location: 'location' in b ? str(b.location, 80) || null : base.location ?? null,
    };
    if (!i.name) return [null, 'Give the item a name'];
    if (!INV_CATEGORIES.includes(i.category)) return [null, 'Choose a category'];
    if (!Number.isInteger(i.min_qty) || i.min_qty < 0 || i.min_qty > 1e6) return [null, 'Reorder level must be a whole number from 0'];
    return [i, null];
  };
  app.post('/api/inventory', auth, admin, (req, res) => {
    const b = req.body || {};
    const [i, err] = itemBody(b);
    if (err) return bad(res, err);
    const qty = b.quantity == null || b.quantity === '' ? 0 : Number(b.quantity);
    if (!Number.isInteger(qty) || qty < 0 || qty > 1e6) return bad(res, 'Quantity must be a whole number from 0');
    if (one('SELECT id FROM inventory_items WHERE lower(name)=lower(?)', i.name)) return res.status(409).json({ error: 'This item is already in the inventory' });
    const r = run('INSERT INTO inventory_items(name,category,unit,quantity,min_qty,location) VALUES(?,?,?,?,?,?)', i.name, i.category, i.unit, qty, i.min_qty, i.location);
    if (qty) run('INSERT INTO inventory_moves(item_id,change,note,user_id) VALUES(?,?,?,?)', r.lastInsertRowid, qty, 'Opening stock', req.user.id);
    log(req.user.id, 'inventory', r.lastInsertRowid, 'created', `${i.name}: ${qty} ${i.unit}`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.patch('/api/inventory/:id', auth, admin, (req, res) => {
    const cur = one('SELECT * FROM inventory_items WHERE id=?', req.params.id);
    if (!cur) return res.status(404).json({ error: 'Item not found' });
    const [i, err] = itemBody(req.body || {}, cur);
    if (err) return bad(res, err);
    run("UPDATE inventory_items SET name=?,category=?,unit=?,min_qty=?,location=?,updated_at=datetime('now') WHERE id=?", i.name, i.category, i.unit, i.min_qty, i.location, cur.id);
    log(req.user.id, 'inventory', cur.id, 'updated', i.name);
    res.json({ ok: true });
  });
  // Stock in (+) or out (-). Staff may only take stock out; the committee does both. Never below zero.
  app.post('/api/inventory/:id/move', auth, adminOrStaff, (req, res) => {
    const it = one('SELECT * FROM inventory_items WHERE id=?', req.params.id);
    if (!it) return res.status(404).json({ error: 'Item not found' });
    const b = req.body || {}, change = Number(b.change), note = str(b.note, 200);
    if (!Number.isInteger(change) || change === 0 || Math.abs(change) > 1e6) return bad(res, 'Enter how many came in (+) or went out (-)');
    if (req.user.role === 'staff' && change > 0) return res.status(403).json({ error: 'Only the committee adds stock' });
    if (it.quantity + change < 0) return res.status(409).json({ error: `Only ${it.quantity} ${it.unit} in stock` });
    const reqId = b.request_id ? Number(b.request_id) : null;
    if (reqId && !one('SELECT id FROM requests WHERE id=?', reqId)) return bad(res, 'Request not found');
    run("UPDATE inventory_items SET quantity=quantity+?, updated_at=datetime('now') WHERE id=?", change, it.id);
    run('INSERT INTO inventory_moves(item_id,change,note,request_id,user_id) VALUES(?,?,?,?,?)', it.id, change, note || null, reqId, req.user.id);
    log(req.user.id, 'inventory', it.id, change > 0 ? 'stock_in' : 'stock_out', `${it.name} ${change > 0 ? '+' : ''}${change}${reqId ? ' for #' + reqId : ''}${note ? ': ' + note : ''}`);
    const after = it.quantity + change;
    if (after <= it.min_qty && it.quantity > it.min_qty) notifyCommittee(`Low stock: ${it.name} is down to ${after} ${it.unit} (reorder level ${it.min_qty})`);
    res.json(itemRow(one('SELECT * FROM inventory_items WHERE id=?', it.id)));
  });
  app.get('/api/inventory/:id/moves', auth, adminOrStaff, (req, res) => {
    if (!one('SELECT id FROM inventory_items WHERE id=?', req.params.id)) return res.status(404).json({ error: 'Item not found' });
    res.json(q('SELECT m.id,m.change,m.note,m.request_id,m.created_at,u.name AS by_name FROM inventory_moves m JOIN users u ON u.id=m.user_id WHERE m.item_id=? ORDER BY m.id DESC LIMIT 100', req.params.id));
  });

  // =====================================================================
  // Waste management: collection schedule, collection log, missed-pickup reports
  // =====================================================================
  const schedRow = s => ({ ...s, day: WEEKDAYS[s.weekday] });
  app.get('/api/waste/schedule', auth, (req, res) => res.json(q('SELECT * FROM waste_schedule ORDER BY weekday, time').map(schedRow)));
  app.post('/api/waste/schedule', auth, admin, (req, res) => {
    const b = req.body || {}, weekday = Number(b.weekday), time = String(b.time || '');
    if (!Number.isInteger(weekday) || weekday < 0 || weekday > 6) return bad(res, 'Choose a day of the week');
    if (!WASTE_KINDS.includes(b.kind)) return bad(res, 'Choose the kind of waste');
    if (!HM.test(time)) return bad(res, 'Time must look like 07:30');
    if (one('SELECT id FROM waste_schedule WHERE weekday=? AND kind=?', weekday, b.kind)) return res.status(409).json({ error: `${b.kind} waste is already collected on ${WEEKDAYS[weekday]}` });
    const r = run('INSERT INTO waste_schedule(weekday,kind,time,note) VALUES(?,?,?,?)', weekday, b.kind, time, str(b.note, 200) || null);
    log(req.user.id, 'waste', r.lastInsertRowid, 'schedule_added', `${b.kind} on ${WEEKDAYS[weekday]} at ${time}`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.delete('/api/waste/schedule/:id', auth, admin, (req, res) => {
    const s = one('SELECT * FROM waste_schedule WHERE id=?', req.params.id);
    if (!s) return res.status(404).json({ error: 'Collection not found' });
    run('DELETE FROM waste_schedule WHERE id=?', s.id);
    log(req.user.id, 'waste', s.id, 'schedule_removed', `${s.kind} on ${WEEKDAYS[s.weekday]}`);
    res.json({ ok: true });
  });
  app.post('/api/waste/logs', auth, adminOrStaff, (req, res) => {
    const b = req.body || {}, date = String(b.date || istNow(clock()).date), kg = Number(b.weight_kg);
    if (!validDate(date) || date > istNow(clock()).date) return bad(res, 'Date cannot be in the future');
    if (!WASTE_KINDS.includes(b.kind)) return bad(res, 'Choose the kind of waste');
    if (!Number.isFinite(kg) || kg <= 0 || kg > 100000) return bad(res, 'Enter the weight in kg');
    const r = run('INSERT INTO waste_logs(date,kind,weight_kg,note,user_id) VALUES(?,?,?,?,?)', date, b.kind, money(kg), str(b.note, 200) || null, req.user.id);
    log(req.user.id, 'waste', r.lastInsertRowid, 'collected', `${date} ${b.kind} ${money(kg)} kg`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  // Totals by kind; "segregated" is the share of waste that was sorted (everything except mixed dry), a simple green KPI.
  app.get('/api/waste/logs', auth, adminOrStaff, (req, res) => {
    const days = Math.min(365, Math.max(1, Number(req.query.days) || 30));
    const from = addDays(istNow(clock()).date, -days + 1);
    const rows = q('SELECT w.*, u.name AS by_name FROM waste_logs w JOIN users u ON u.id=w.user_id WHERE w.date>=? ORDER BY w.date DESC, w.id DESC LIMIT 500', from);
    const byKind = Object.fromEntries(WASTE_KINDS.map(k => [k, money(rows.filter(r => r.kind === k).reduce((t, r) => t + r.weight_kg, 0))]));
    const total = money(Object.values(byKind).reduce((a, b) => a + b, 0));
    res.json({ from, days, logs: rows, totals: { ...byKind, total, segregated_pct: total ? Math.round(((total - byKind.dry) / total) * 100) : null } });
  });
  // A resident reports a missed pickup: it becomes a normal housekeeping request (same lifecycle, triage and alerts).
  app.post('/api/waste/missed', auth, resident, (req, res) => {
    const b = req.body || {};
    if (!WASTE_KINDS.includes(b.kind)) return bad(res, 'Choose which waste was not collected');
    const title = `Missed ${b.kind} waste pickup`, description = str(b.note, 1000);
    const r = run("INSERT INTO requests(user_id,category,title,description,source) VALUES(?,?,?,?,'app')", req.user.id, 'housekeeping', title, description);
    const id = Number(r.lastInsertRowid);
    log(req.user.id, 'request', id, 'created', `housekeeping: ${title}`);
    if (applyTriage) applyTriage(id, title + '. ' + description);
    notifyCommittee(`New housekeeping request from flat ${req.user.flat}: ${title}`);
    if (desk) desk.alert('request', id);
    res.status(201).json({ id });
  });

  // Small counts for dashboards (one call instead of four).
  app.get('/api/modules/summary', auth, (req, res) => {
    const now = istNow(clock());
    if (req.user.role === 'admin') {
      const dues = q(DUE_SELECT).map(dueState);
      return res.json({
        bookings_today: one("SELECT COUNT(*) AS n FROM amenity_bookings WHERE status='booked' AND date=?", now.date).n,
        dues_outstanding: money(dues.reduce((t, d) => t + d.balance, 0)), dues_overdue: dues.filter(d => d.overdue).length,
        low_stock: q('SELECT quantity, min_qty FROM inventory_items').filter(i => i.quantity <= i.min_qty).length,
        waste_kg_7d: money(one('SELECT COALESCE(SUM(weight_kg),0) AS s FROM waste_logs WHERE date>=?', addDays(now.date, -6)).s),
      });
    }
    if (req.user.role !== 'resident' || !req.user.flat) return res.json({});
    const dues = q(`${DUE_SELECT} WHERE d.flat=?`, req.user.flat).map(dueState);
    const next = one(`${BOOK_SELECT} WHERE b.flat=? AND b.status='booked' AND (b.date>? OR (b.date=? AND b.start>?)) ORDER BY b.date, b.start LIMIT 1`, req.user.flat, now.date, now.date, now.time);
    const todayWd = (new Date(now.date + 'T00:00:00Z').getUTCDay() + 6) % 7;
    res.json({
      dues_balance: money(dues.reduce((t, d) => t + d.balance, 0)), dues_overdue: dues.filter(d => d.overdue).length,
      next_booking: next ? { amenity: next.amenity, date: next.date, start: next.start, end: next.end_at } : null,
      waste_today: q('SELECT kind, time FROM waste_schedule WHERE weekday=? ORDER BY time', todayWd),
    });
  });
};
module.exports.WEEKDAYS = WEEKDAYS;
module.exports.WASTE_KINDS = WASTE_KINDS;
module.exports.istNow = istNow;
