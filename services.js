// Resident services (2026-11-25, contract docs/services-api.md): tuck shop (the e-commerce interface on the
// product architecture whiteboard), laundry service, parcel desk at the gate and community events.
// The tuck shop owner (role shop) and the laundry service (role laundry) fulfil orders; the committee only sees the state.
// Payment is cash or UPI on delivery for now; the payment gateway is a planned interface. Every change is audited.

const SHOP_CATEGORIES = ['groceries', 'dairy', 'snacks', 'household', 'personal care', 'other'];
const SHOP_FLOW = { placed: ['ready', 'cancelled'], ready: ['delivered', 'collected', 'cancelled'] };
const FULFILMENT = ['delivery', 'pickup'];
// cash or UPI is paid on delivery or collection; 'account' adds a bill to the flat's maintenance dues (credit).
const PAYMENTS = ['cash', 'upi', 'account'];
const LAUNDRY_FLOW = { requested: ['picked_up', 'cancelled'], picked_up: ['washing'], washing: ['ready'], ready: ['delivered'] };
const LAUNDRY_SLOTS = ['morning', 'afternoon', 'evening'];
const YMD = /^\d{4}-\d{2}-\d{2}$/;
const DT = /^\d{4}-\d{2}-\d{2}T([01]\d|2[0-3]):[0-5]\d$/;
const money = v => Math.round(Number(v) * 100) / 100;

module.exports = function mountServices(app, c) {
  const { q, one, run, log, notify, auth, str, committeeIds, istNow } = c;
  const creditLimit = c.creditLimit || (() => 3000);
  const clock = c.clock || (() => new Date());
  const today = () => istNow(clock()).date;
  const nowLocal = () => { const n = istNow(clock()); return `${n.date}T${n.time}`; };
  const bad = (res, msg) => res.status(400).json({ error: msg });
  const role = r => (req, res, next) => (r.includes(req.user.role) ? next() : res.status(403).json({ error: 'Not allowed for this account' }));
  const shopOwner = role(['shop']);
  const laundryOp = role(['laundry']);
  const desk = role(['admin', 'guard']); // the parcel desk is the guards' (the committee can help)
  const committee = role(['admin']);
  const resident = (req, res, next) => (req.user.role === 'resident' && req.user.flat ? next() : res.status(403).json({ error: 'Residents with a flat only' }));
  // New orders go to the provider who fulfils them (not the committee, which only sees the state).
  const notifyRole = (r, msg) => { for (const u of q("SELECT id FROM users WHERE role=? AND status='approved'", r)) notify(u.id, msg); };
  const notifyFlat = (flat, msg) => { for (const u of q("SELECT id FROM users WHERE role='resident' AND status='approved' AND flat=?", flat)) notify(u.id, msg); };
  // ---------- money: purchases on credit become bills on the flat's maintenance account (Financial management)
  const dueBalance = id => { const d = one('SELECT amount, (SELECT COALESCE(SUM(amount),0) FROM due_payments WHERE due_id=dues.id) AS paid FROM dues WHERE id=?', id); return d ? money(d.amount - d.paid) : 0; };
  // Credit = unpaid bills that belong to the flat's shop and laundry orders (linked by due_id, never by title).
  const creditUsed = flat => money(q('SELECT due_id FROM shop_orders WHERE flat=? AND due_id IS NOT NULL UNION SELECT due_id FROM laundry_orders WHERE flat=? AND due_id IS NOT NULL', flat, flat).reduce((t, d) => t + Math.max(0, dueBalance(d.due_id)), 0));
  // Several writes that must all happen or none (order, bill, lines, stock).
  const atomic = fn => { run('BEGIN'); try { const v = fn(); run('COMMIT'); return v; } catch (e) { run('ROLLBACK'); throw e; } };
  const chargeAccount = (flat, title, amount, userId) => {
    const n = istNow(clock()), period = n.date.slice(0, 7), dueDate = istNow(new Date(clock().getTime() + 15 * 864e5)).date;
    // A committee bill could already use this title for the period: keep both by marking ours as a purchase.
    const taken = one('SELECT id FROM dues WHERE flat=? AND period=? AND title=?', flat, period, title);
    const r = run('INSERT INTO dues(flat,period,title,amount,due_date,created_by) VALUES(?,?,?,?,?,?)', flat, period, taken ? `${title} (purchase)` : title, money(amount), dueDate, userId);
    return Number(r.lastInsertRowid);
  };
  // Cancelling removes the bill if nothing was paid on it yet; returns false when money was already paid.
  const voidCharge = dueId => { if (!dueId) return true; if (one('SELECT COUNT(*) AS n FROM due_payments WHERE due_id=?', dueId).n) return false; run('DELETE FROM dues WHERE id=?', dueId); return true; };
  const payState = o => o.status === 'cancelled' ? 'cancelled' : o.payment === 'account' ? (o.due_id && dueBalance(o.due_id) <= 0 ? 'paid' : 'on_account') : o.paid_at ? 'paid' : 'unpaid';
  const creditCheck = (flat, total) => { const lim = creditLimit(), used = creditUsed(flat); return lim <= 0 ? 'Credit is switched off. Pay by cash or UPI.' : used + total > lim ? `Credit limit is ₹${lim}; ₹${used} is already on the account. Pay by cash or UPI, or settle the account first.` : null; };
  app.get('/api/credit', auth, (req, res) => (req.user.role === 'resident' && req.user.flat ? res.json({ limit: creditLimit(), used: creditUsed(req.user.flat) }) : res.status(403).json({ error: 'Residents with a flat only' })));
  const linesOk = (lines, max = 30) => Array.isArray(lines) && lines.length && lines.length <= max && lines.every(l => Number.isInteger(Number(l.id)) && Number.isInteger(Number(l.qty)) && Number(l.qty) >= 1 && Number(l.qty) <= 50);

  // =====================================================================
  // Tuck shop
  // =====================================================================
  const itemBody = (b, base = {}) => {
    const i = {
      name: 'name' in b ? str(b.name, 80) : base.name,
      category: 'category' in b ? b.category : base.category || 'groceries',
      price: 'price' in b ? Number(b.price) : base.price,
      stock: 'stock' in b ? Number(b.stock) : base.stock ?? 0,
      unit: 'unit' in b ? str(b.unit, 20) || null : base.unit ?? null,
      active: 'active' in b ? (b.active ? 1 : 0) : base.active ?? 1,
      image: 'image' in b ? (b.image || null) : base.image ?? null,
    };
    if (!i.name) return [null, 'Give the item a name'];
    if (i.image != null && !/^\/img\/shop\/[a-z0-9-]+\.(jpg|png|webp)$/.test(i.image)) return [null, 'Choose a photo from the shop library'];
    if (!SHOP_CATEGORIES.includes(i.category)) return [null, 'Choose a category'];
    if (!(i.price > 0) || i.price > 100000) return [null, 'Price must be more than 0'];
    if (!Number.isInteger(i.stock) || i.stock < 0 || i.stock > 100000) return [null, 'Stock must be a whole number from 0'];
    i.price = money(i.price);
    return [i, null];
  };
  app.get('/api/shop/items', auth, (req, res) => {
    const all = ['admin', 'shop'].includes(req.user.role);
    res.json(q(`SELECT * FROM shop_items ${all ? '' : 'WHERE active=1'} ORDER BY category, name`).map(i => ({ ...i, active: !!i.active })));
  });
  app.post('/api/shop/items', auth, shopOwner, (req, res) => {
    const [i, err] = itemBody(req.body || {}); if (err) return bad(res, err);
    if (one('SELECT id FROM shop_items WHERE lower(name)=lower(?)', i.name)) return res.status(409).json({ error: 'An item with that name already exists' });
    const r = run('INSERT INTO shop_items(name,category,price,stock,unit,active,image) VALUES(?,?,?,?,?,?,?)', i.name, i.category, i.price, i.stock, i.unit, i.active, i.image);
    log(req.user.id, 'shop_item', r.lastInsertRowid, 'created', `${i.name} at ${i.price}`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.patch('/api/shop/items/:id', auth, shopOwner, (req, res) => {
    const base = one('SELECT * FROM shop_items WHERE id=?', req.params.id); if (!base) return res.status(404).json({ error: 'Item not found' });
    const [i, err] = itemBody(req.body || {}, base); if (err) return bad(res, err);
    run('UPDATE shop_items SET name=?,category=?,price=?,stock=?,unit=?,active=?,image=? WHERE id=?', i.name, i.category, i.price, i.stock, i.unit, i.active, i.image, base.id);
    log(req.user.id, 'shop_item', base.id, 'updated', `${i.name}: price ${i.price}, stock ${i.stock}${i.active ? '' : ', hidden'}`);
    res.json({ ok: true });
  });
  const orderOut = o => ({ ...o, payment_status: payState(o), lines: q('SELECT item_id,name,price,qty FROM shop_order_lines WHERE order_id=? ORDER BY id', o.id) });
  app.post('/api/shop/orders', auth, resident, (req, res) => {
    const b = req.body || {};
    if (!linesOk(b.items)) return bad(res, 'Add at least one item (up to 50 of each)');
    const fulfilment = b.fulfilment || 'delivery', payment = b.payment || 'cash';
    if (!FULFILMENT.includes(fulfilment)) return bad(res, 'Choose delivery to your door or pick-up at the shop');
    if (!PAYMENTS.includes(payment)) return bad(res, 'Choose cash, UPI or your maintenance account');
    const lines = [];
    for (const l of b.items) {
      const it = one('SELECT * FROM shop_items WHERE id=? AND active=1', Number(l.id));
      if (!it) return bad(res, 'One of the items is no longer sold');
      const qty = Number(l.qty) + lines.filter(x => x.id === it.id).reduce((t, x) => t + x.qty, 0);
      if (qty > it.stock) return res.status(409).json({ error: `Only ${it.stock} ${it.name} left` });
      lines.push({ id: it.id, name: it.name, price: it.price, qty: Number(l.qty) });
    }
    const total = money(lines.reduce((t, l) => t + l.price * l.qty, 0));
    if (payment === 'account') { const why = creditCheck(req.user.flat, total); if (why) return res.status(409).json({ error: why }); }
    const id = atomic(() => {
      const r = run('INSERT INTO shop_orders(user_id,flat,total,note,fulfilment,payment) VALUES(?,?,?,?,?,?)', req.user.id, req.user.flat, total, str(b.note, 300) || null, fulfilment, payment);
      const id = Number(r.lastInsertRowid);
      if (payment === 'account') run('UPDATE shop_orders SET due_id=? WHERE id=?', chargeAccount(req.user.flat, `Tuck shop order #${id}`, total, req.user.id), id);
      for (const l of lines) {
        run('INSERT INTO shop_order_lines(order_id,item_id,name,price,qty) VALUES(?,?,?,?,?)', id, l.id, l.name, l.price, l.qty);
        run('UPDATE shop_items SET stock=stock-? WHERE id=?', l.qty, l.id);
      }
      return id;
    });
    log(req.user.id, 'shop_order', id, 'placed', `flat ${req.user.flat}: ${lines.length} items, ${total}, ${fulfilment}, ${payment}`);
    notifyRole('shop', `New tuck shop order #${id} from flat ${req.user.flat} (₹${total}, ${fulfilment === 'pickup' ? 'pick-up' : 'deliver to door'}, ${payment === 'account' ? 'on account' : payment.toUpperCase() + ' on ' + (fulfilment === 'pickup' ? 'pick-up' : 'delivery')})`);
    res.status(201).json({ id, total, fulfilment, payment });
  });
  app.post('/api/shop/counter', auth, shopOwner, (req, res) => {
    const b = req.body || {}, h = app.locals.cardHolder && app.locals.cardHolder(b.serial);
    if (!h || h.role !== 'resident' || !h.flat) return res.status(404).json({ error: 'Tap a resident card first' });
    if (!linesOk(b.items)) return bad(res, 'Add at least one item');
    const payment = b.payment || 'cash';
    if (!PAYMENTS.includes(payment)) return bad(res, 'Choose cash, UPI or the maintenance account');
    const lines = [];
    for (const l of b.items) {
      const it = one('SELECT * FROM shop_items WHERE id=? AND active=1', Number(l.id));
      if (!it) return bad(res, 'One of the items is no longer sold');
      const qty = Number(l.qty) + lines.filter(x => x.id === it.id).reduce((t, x) => t + x.qty, 0);
      if (qty > it.stock) return res.status(409).json({ error: `Only ${it.stock} ${it.name} left` });
      lines.push({ id: it.id, name: it.name, price: it.price, qty: Number(l.qty) });
    }
    const total = money(lines.reduce((t, l) => t + l.price * l.qty, 0));
    if (payment === 'account') { const why = creditCheck(h.flat, total); if (why) return res.status(409).json({ error: why }); }
    const id = atomic(() => {
      const r = run("INSERT INTO shop_orders(user_id,flat,total,fulfilment,payment,status,paid_at) VALUES(?,?,?,'counter',?,'collected',?)", h.id, h.flat, total, payment, payment === 'account' ? null : new Date().toISOString().slice(0, 19).replace('T', ' '));
      const id = Number(r.lastInsertRowid);
      for (const l of lines) { run('INSERT INTO shop_order_lines(order_id,item_id,name,price,qty) VALUES(?,?,?,?,?)', id, l.id, l.name, l.price, l.qty); run('UPDATE shop_items SET stock=stock-? WHERE id=?', l.qty, l.id); }
      if (payment === 'account') run('UPDATE shop_orders SET due_id=? WHERE id=?', chargeAccount(h.flat, `Tuck shop order #${id}`, total, req.user.id), id);
      return id;
    });
    log(req.user.id, 'shop_order', id, 'counter_sale', `card of ${h.name} (${h.flat}): ${total}, ${payment}`);
    notifyFlat(h.flat, `Tuck shop: ₹${total} bought with ${h.name}'s card${payment === 'account' ? ', added to your maintenance account' : ' (' + payment.toUpperCase() + ')'}`);
    res.status(201).json({ id, total, payment, name: h.name, flat: h.flat });
  });
  app.get('/api/shop/orders', auth, (req, res) => {
    if (req.user.role === 'resident') return res.json(q('SELECT * FROM shop_orders WHERE flat=? ORDER BY id DESC LIMIT 100', req.user.flat || '').map(orderOut));
    if (!['admin', 'shop'].includes(req.user.role)) return res.status(403).json({ error: 'Not allowed for this account' });
    res.json(q("SELECT o.*, u.name AS resident FROM shop_orders o JOIN users u ON u.id=o.user_id ORDER BY (o.status IN ('delivered','cancelled')), o.id DESC LIMIT 200").map(orderOut));
  });
  app.post('/api/shop/orders/:id/status', auth, (req, res) => {
    const o = one('SELECT * FROM shop_orders WHERE id=?', req.params.id);
    const isTeam = req.user.role === 'shop';
    if (!o || (!isTeam && !(req.user.role === 'resident' && o.flat === req.user.flat))) return res.status(404).json({ error: 'Order not found' });
    const to = (req.body || {}).status;
    if (!(SHOP_FLOW[o.status] || []).includes(to)) return res.status(409).json({ error: `A ${o.status} order cannot move to ${to}` });
    if (!isTeam && !(to === 'cancelled' && o.status === 'placed')) return res.status(403).json({ error: 'You can cancel an order until it is ready' });
    if ((to === 'delivered' && o.fulfilment === 'pickup') || (to === 'collected' && o.fulfilment !== 'pickup')) return res.status(409).json({ error: o.fulfilment === 'pickup' ? 'This order is picked up at the shop: mark it collected' : 'This order is delivered: mark it delivered' });
    if (to === 'cancelled' && !voidCharge(o.due_id)) return res.status(409).json({ error: 'Money was already paid on this order. Ask the committee to refund it first.' });
    const handover = ['delivered', 'collected'].includes(to) && o.payment !== 'account';
    run(`UPDATE shop_orders SET status=?, updated_at=datetime('now')${handover ? ", paid_at=datetime('now')" : ''}${to === 'cancelled' ? ', due_id=NULL' : ''} WHERE id=?`, to, o.id);
    if (to === 'cancelled') for (const l of q('SELECT item_id, qty FROM shop_order_lines WHERE order_id=?', o.id)) run('UPDATE shop_items SET stock=stock+? WHERE id=?', l.qty, l.item_id);
    log(req.user.id, 'shop_order', o.id, to, `${o.status} -> ${to}`);
    if (isTeam) notifyFlat(o.flat, to === 'ready' ? (o.fulfilment === 'pickup' ? `Tuck shop order #${o.id} is ready to pick up` : `Your tuck shop order #${o.id} is ready and on its way`) : to === 'delivered' ? `Tuck shop order #${o.id} delivered` : to === 'collected' ? `Tuck shop order #${o.id} collected` : `Tuck shop order #${o.id} was cancelled${o.due_id ? '; the bill was removed from your account' : ''}`);
    else notifyRole('shop', `Flat ${o.flat} cancelled tuck shop order #${o.id}`);
    res.json({ ok: true, status: to });
  });

  // =====================================================================
  // Laundry service
  // =====================================================================
  app.get('/api/laundry/rates', auth, (req, res) => {
    const all = ['admin', 'laundry'].includes(req.user.role);
    res.json(q(`SELECT * FROM laundry_rates ${all ? '' : 'WHERE active=1'} ORDER BY item`).map(r => ({ ...r, active: !!r.active })));
  });
  app.post('/api/laundry/rates', auth, laundryOp, (req, res) => {
    const item = str((req.body || {}).item, 60), price = Number((req.body || {}).price);
    if (!item) return bad(res, 'Name the item, e.g. Shirt (wash and iron)');
    if (!(price > 0) || price > 10000) return bad(res, 'Price must be more than 0');
    if (one('SELECT id FROM laundry_rates WHERE lower(item)=lower(?)', item)) return res.status(409).json({ error: 'That item already has a rate' });
    const r = run('INSERT INTO laundry_rates(item,price) VALUES(?,?)', item, money(price));
    log(req.user.id, 'laundry_rate', r.lastInsertRowid, 'created', `${item} ${money(price)}`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.patch('/api/laundry/rates/:id', auth, laundryOp, (req, res) => {
    const r0 = one('SELECT * FROM laundry_rates WHERE id=?', req.params.id); if (!r0) return res.status(404).json({ error: 'Rate not found' });
    const b = req.body || {};
    const price = 'price' in b ? Number(b.price) : r0.price, active = 'active' in b ? (b.active ? 1 : 0) : r0.active;
    if (!(price > 0) || price > 10000) return bad(res, 'Price must be more than 0');
    run('UPDATE laundry_rates SET price=?, active=? WHERE id=?', money(price), active, r0.id);
    log(req.user.id, 'laundry_rate', r0.id, 'updated', `${r0.item} ${money(price)}${active ? '' : ', hidden'}`);
    res.json({ ok: true });
  });
  const laundryOut = o => ({ ...o, payment_status: payState(o), lines: q('SELECT rate_id,item,price,qty FROM laundry_lines WHERE order_id=? ORDER BY id', o.id) });
  app.post('/api/laundry/orders', auth, resident, (req, res) => {
    const b = req.body || {};
    if (!YMD.test(b.pickup_date || '') || b.pickup_date < today()) return bad(res, 'Choose a pickup date from today');
    if (b.pickup_date > istNow(new Date(clock().getTime() + 14 * 864e5)).date) return bad(res, 'Pickups can be booked up to 14 days ahead');
    if (!LAUNDRY_SLOTS.includes(b.pickup_slot)) return bad(res, 'Choose morning, afternoon or evening');
    const payment = b.payment || 'cash';
    if (!PAYMENTS.includes(payment)) return bad(res, 'Choose cash, UPI or your maintenance account');
    if (!linesOk(b.items)) return bad(res, 'Add at least one item (up to 50 of each)');
    const lines = [];
    for (const l of b.items) {
      const rt = one('SELECT * FROM laundry_rates WHERE id=? AND active=1', Number(l.id));
      if (!rt) return bad(res, 'One of the items is no longer offered');
      lines.push({ id: rt.id, item: rt.item, price: rt.price, qty: Number(l.qty) });
    }
    const total = money(lines.reduce((t, l) => t + l.price * l.qty, 0));
    if (payment === 'account') { const why = creditCheck(req.user.flat, total); if (why) return res.status(409).json({ error: why }); }
    const id = atomic(() => {
      const r = run('INSERT INTO laundry_orders(user_id,flat,pickup_date,pickup_slot,total,note,payment) VALUES(?,?,?,?,?,?,?)', req.user.id, req.user.flat, b.pickup_date, b.pickup_slot, total, str(b.note, 300) || null, payment);
      const id = Number(r.lastInsertRowid);
      if (payment === 'account') run('UPDATE laundry_orders SET due_id=? WHERE id=?', chargeAccount(req.user.flat, `Laundry #${id}`, total, req.user.id), id);
      for (const l of lines) run('INSERT INTO laundry_lines(order_id,rate_id,item,price,qty) VALUES(?,?,?,?,?)', id, l.id, l.item, l.price, l.qty);
      return id;
    });
    log(req.user.id, 'laundry_order', id, 'requested', `flat ${req.user.flat}: ${b.pickup_date} ${b.pickup_slot}, ${total}`);
    notifyRole('laundry', `Laundry pickup #${id} for flat ${req.user.flat} on ${b.pickup_date} (${b.pickup_slot})`);
    res.status(201).json({ id, total });
  });
  app.get('/api/laundry/orders', auth, (req, res) => {
    if (req.user.role === 'resident') return res.json(q('SELECT * FROM laundry_orders WHERE flat=? ORDER BY id DESC LIMIT 100', req.user.flat || '').map(laundryOut));
    if (!['admin', 'laundry'].includes(req.user.role)) return res.status(403).json({ error: 'Not allowed for this account' });
    res.json(q("SELECT o.*, u.name AS resident FROM laundry_orders o JOIN users u ON u.id=o.user_id ORDER BY (o.status IN ('delivered','cancelled')), o.pickup_date, o.id LIMIT 200").map(laundryOut));
  });
  app.post('/api/laundry/orders/:id/status', auth, (req, res) => {
    const o = one('SELECT * FROM laundry_orders WHERE id=?', req.params.id);
    const isTeam = req.user.role === 'laundry';
    if (!o || (!isTeam && !(req.user.role === 'resident' && o.flat === req.user.flat))) return res.status(404).json({ error: 'Laundry order not found' });
    const to = (req.body || {}).status;
    if (!(LAUNDRY_FLOW[o.status] || []).includes(to)) return res.status(409).json({ error: `A ${o.status.replace('_', ' ')} order cannot move to ${String(to).replace('_', ' ')}` });
    if (!isTeam && to !== 'cancelled') return res.status(403).json({ error: 'You can cancel before the pickup' });
    if (to === 'cancelled' && !voidCharge(o.due_id)) return res.status(409).json({ error: 'Money was already paid on this order. Ask the committee to refund it first.' });
    run(`UPDATE laundry_orders SET status=?, updated_at=datetime('now')${to === 'delivered' && o.payment !== 'account' ? ", paid_at=datetime('now')" : ''}${to === 'cancelled' ? ', due_id=NULL' : ''} WHERE id=?`, to, o.id);
    log(req.user.id, 'laundry_order', o.id, to, `${o.status} -> ${to}`);
    const msg = { picked_up: 'picked up', washing: 'being washed', ready: 'ready', delivered: 'delivered', cancelled: 'cancelled' }[to];
    if (isTeam) notifyFlat(o.flat, `Laundry #${o.id} is ${msg}`); else notifyRole('laundry', `Flat ${o.flat} cancelled laundry pickup #${o.id}`);
    res.json({ ok: true, status: to });
  });

  // =====================================================================
  // Parcel desk (guard, staff or committee log deliveries; the flat is notified)
  // =====================================================================
  app.post('/api/parcels', auth, desk, (req, res) => {
    const b = req.body || {}, flat = str(b.flat, 20).toUpperCase(), carrier = str(b.carrier, 60);
    if (!flat || !one("SELECT id FROM users WHERE role='resident' AND status='approved' AND flat=?", flat)) return bad(res, 'No approved resident lives in that flat');
    if (!carrier) return bad(res, 'Who delivered it? e.g. Amazon, Swiggy, Blue Dart');
    const r = run('INSERT INTO parcels(flat,carrier,note,logged_by) VALUES(?,?,?,?)', flat, carrier, str(b.note, 200) || null, req.user.id);
    log(req.user.id, 'parcel', r.lastInsertRowid, 'received', `${carrier} for ${flat}`);
    notifyFlat(flat, `Parcel from ${carrier} waiting at the gate (#${r.lastInsertRowid})`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.get('/api/parcels', auth, (req, res) => {
    const sel = 'SELECT p.*, u.name AS logged_by_name FROM parcels p JOIN users u ON u.id=p.logged_by';
    if (req.user.role === 'resident') return res.json(q(`${sel} WHERE p.flat=? ORDER BY (p.status='collected'), p.id DESC LIMIT 100`, req.user.flat || ''));
    if (!['admin', 'staff', 'guard'].includes(req.user.role)) return res.status(403).json({ error: 'Not allowed for this account' });
    res.json(q(`${sel} ORDER BY (p.status='collected'), p.id DESC LIMIT 200`));
  });
  app.post('/api/parcels/:id/collect', auth, desk, (req, res) => {
    const p = one('SELECT * FROM parcels WHERE id=?', req.params.id); if (!p) return res.status(404).json({ error: 'Parcel not found' });
    if (p.status === 'collected') return res.status(409).json({ error: 'Already collected' });
    const by = str((req.body || {}).collected_by, 80) || null;
    run("UPDATE parcels SET status='collected', collected_at=datetime('now'), collected_by=? WHERE id=?", by, p.id);
    log(req.user.id, 'parcel', p.id, 'collected', by ? `by ${by}` : '');
    notifyFlat(p.flat, `Parcel #${p.id} from ${p.carrier} collected${by ? ' by ' + by : ''}`);
    res.json({ ok: true });
  });

  // =====================================================================
  // Community events (committee posts; residents say they are going)
  // =====================================================================
  const eventOut = (e, uid) => ({ ...e, cancelled: !!e.cancelled, going: one('SELECT COUNT(*) AS n FROM event_rsvps WHERE event_id=?', e.id).n,
    me_going: !!one('SELECT 1 AS x FROM event_rsvps WHERE event_id=? AND user_id=?', e.id, uid) });
  app.get('/api/events', auth, (req, res) => {
    const from = req.query.past ? '0000' : today();
    res.json(q('SELECT e.*, u.name AS by_name FROM events e JOIN users u ON u.id=e.created_by WHERE substr(e.starts_at,1,10)>=? ORDER BY e.starts_at LIMIT 100', from).map(e => eventOut(e, req.user.id)));
  });
  app.post('/api/events', auth, committee, (req, res) => {
    const b = req.body || {}, title = str(b.title, 120), where = str(b.location, 120);
    if (!title) return bad(res, 'Give the event a title');
    if (!DT.test(b.starts_at || '') || b.starts_at < nowLocal()) return bad(res, 'Choose a start date and time in the future');
    const r = run('INSERT INTO events(title,description,starts_at,location,created_by) VALUES(?,?,?,?,?)', title, str(b.description, 1000) || null, b.starts_at, where || null, req.user.id);
    log(req.user.id, 'event', r.lastInsertRowid, 'created', `${title} on ${b.starts_at}`);
    for (const u of q("SELECT id FROM users WHERE role='resident' AND status='approved'")) notify(u.id, `New event: ${title} on ${b.starts_at.replace('T', ' at ')}`);
    res.status(201).json({ id: Number(r.lastInsertRowid) });
  });
  app.post('/api/events/:id/cancel', auth, committee, (req, res) => {
    const e = one('SELECT * FROM events WHERE id=?', req.params.id); if (!e) return res.status(404).json({ error: 'Event not found' });
    if (e.cancelled) return res.status(409).json({ error: 'Already cancelled' });
    run('UPDATE events SET cancelled=1 WHERE id=?', e.id);
    log(req.user.id, 'event', e.id, 'cancelled', e.title);
    for (const r of q('SELECT user_id FROM event_rsvps WHERE event_id=?', e.id)) notify(r.user_id, `Event cancelled: ${e.title}`);
    res.json({ ok: true });
  });
  app.post('/api/events/:id/rsvp', auth, resident, (req, res) => {
    const e = one('SELECT * FROM events WHERE id=?', req.params.id); if (!e) return res.status(404).json({ error: 'Event not found' });
    if (e.cancelled) return res.status(409).json({ error: 'This event was cancelled' });
    if ((req.body || {}).going === false) run('DELETE FROM event_rsvps WHERE event_id=? AND user_id=?', e.id, req.user.id);
    else run('INSERT OR IGNORE INTO event_rsvps(event_id,user_id) VALUES(?,?)', e.id, req.user.id);
    res.json(eventOut(e, req.user.id));
  });

  // Small counts for the dashboards' "For you" list.
  app.get('/api/services/summary', auth, (req, res) => {
    const next = one('SELECT id,title,starts_at,location FROM events WHERE cancelled=0 AND starts_at>=? ORDER BY starts_at LIMIT 1', nowLocal()) || null;
    if (req.user.role === 'resident') {
      const f = req.user.flat || '';
      return res.json({ next_event: next,
        parcels_waiting: one("SELECT COUNT(*) AS n FROM parcels WHERE flat=? AND status='waiting'", f).n,
        shop_ready: one("SELECT COUNT(*) AS n FROM shop_orders WHERE flat=? AND status='ready'", f).n,
        laundry_ready: one("SELECT COUNT(*) AS n FROM laundry_orders WHERE flat=? AND status='ready'", f).n,
        laundry_open: one("SELECT COUNT(*) AS n FROM laundry_orders WHERE flat=? AND status NOT IN ('delivered','cancelled')", f).n });
    }
    res.json({ next_event: next,
      parcels_waiting: one("SELECT COUNT(*) AS n FROM parcels WHERE status='waiting'").n,
      shop_to_prepare: one("SELECT COUNT(*) AS n FROM shop_orders WHERE status='placed'").n,
      laundry_to_pick: one("SELECT COUNT(*) AS n FROM laundry_orders WHERE status='requested'").n,
      laundry_in_progress: one("SELECT COUNT(*) AS n FROM laundry_orders WHERE status IN ('picked_up','washing','ready')").n,
      low_shop_stock: one('SELECT COUNT(*) AS n FROM shop_items WHERE active=1 AND stock<=3').n });
  });
};
module.exports.SHOP_CATEGORIES = SHOP_CATEGORIES;
module.exports.LAUNDRY_SLOTS = LAUNDRY_SLOTS;
