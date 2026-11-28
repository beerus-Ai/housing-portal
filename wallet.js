// Community card wallet (2026-11-28, contract docs/card-wallet-api.md): a prepaid ledger per flat. Money in is cash or UPI
// handed to the committee and recorded (no online gateway); money out is tuck shop and laundry. The balance is SUM(amount)
// and never goes below 0: every debit checks it inside the same transaction. Every change is audited.

const money = v => Math.round(Number(v) * 100) / 100;
const KINDS = ['topup', 'shop', 'laundry', 'refund', 'adjust'];
const METHODS = ['cash', 'upi'];
const shortMsg = b => `Wallet balance is ₹${b}. Top up with the committee or pay another way.`;

// Ledger helpers shared with services.js (wallet payments) and nfc.js (card views).
const ledger = ({ q, one, run }) => {
  const balance = flat => money(one('SELECT COALESCE(SUM(amount),0) AS b FROM wallet_tx WHERE flat=?', flat || '').b);
  const write = (flat, amount, kind, o = {}) => Number(run('INSERT INTO wallet_tx(flat,amount,kind,method,ref_type,ref_id,note,by_user) VALUES(?,?,?,?,?,?,?,?)',
    flat, money(amount), kind, o.method || null, o.ref_type || null, o.ref_id ?? null, o.note || null, o.by_user ?? null).lastInsertRowid);
  // Call inside atomic(): throws { status: 409, message } when the flat cannot pay, so the whole order rolls back.
  const debit = (flat, amount, kind, o = {}) => {
    const b = balance(flat);
    if (b - money(amount) < -1e-9) { const e = new Error(shortMsg(b)); e.status = 409; e.wallet = true; throw e; }
    return write(flat, -Math.abs(amount), kind, o);
  };
  const history = (flat, n = 50) => q('SELECT id, amount, kind, method, note, created_at FROM wallet_tx WHERE flat=? ORDER BY id DESC LIMIT ?', flat, n);
  return { balance, write, debit, history };
};

module.exports = function mountWallet(app, c) {
  const { q, one, run, log, notify, auth, admin, governance, str } = c;
  const W = ledger(c);
  const bad = (res, msg) => res.status(400).json({ error: msg });
  const hasResident = flat => !!one("SELECT 1 AS x FROM users WHERE role='resident' AND status='approved' AND flat=?", flat);
  const notifyFlat = (flat, msg) => { for (const u of q("SELECT id FROM users WHERE role='resident' AND status='approved' AND flat=?", flat)) notify(u.id, msg); };
  const view = flat => ({ flat, balance: W.balance(flat), tx: W.history(flat) });
  const atomic = fn => { run('BEGIN'); try { const v = fn(); run('COMMIT'); return v; } catch (e) { run('ROLLBACK'); throw e; } };

  // The resident's own wallet (money is per flat, so every resident of the flat sees the same one).
  app.get('/api/wallet', auth, (req, res) => (req.user.role === 'resident' && req.user.flat ? res.json(view(req.user.flat)) : res.status(403).json({ error: 'Residents with a flat only' })));

  // Committee: balances for every flat with an approved resident (0 when nothing was recorded).
  app.get('/api/admin/wallets', auth, admin, (req, res) => {
    res.json(q(`SELECT f.flat, COALESCE(SUM(w.amount),0) AS balance, MAX(w.created_at) AS last_at
      FROM (SELECT DISTINCT flat FROM users WHERE role='resident' AND status='approved' AND flat IS NOT NULL AND flat!='') f
      LEFT JOIN wallet_tx w ON w.flat=f.flat GROUP BY f.flat ORDER BY f.flat`).map(r => ({ flat: r.flat, balance: money(r.balance), last_at: r.last_at || null })));
  });
  app.get('/api/admin/wallets/:flat', auth, admin, (req, res) => {
    const flat = str(req.params.flat, 20).toUpperCase();
    if (!flat || (!hasResident(flat) && !one('SELECT 1 AS x FROM wallet_tx WHERE flat=? LIMIT 1', flat))) return res.status(404).json({ error: 'No wallet for that flat' });
    res.json(view(flat));
  });

  // Record money handed to the committee (cash or UPI). Give the flat, or tap the resident's card.
  app.post('/api/admin/wallet/topup', auth, admin, (req, res) => {
    const b = req.body || {}, amount = Number(b.amount), method = b.method;
    if (!Number.isFinite(amount) || amount < 1 || amount > 50000) return bad(res, 'Top up from ₹1 to ₹50000');
    if (!METHODS.includes(method)) return bad(res, 'Choose cash or UPI');
    let flat = str(b.flat, 20).toUpperCase();
    if (!flat && b.serial != null && b.serial !== '') {
      const h = app.locals.cardHolder && app.locals.cardHolder(b.serial);
      if (!h) return res.status(404).json({ error: 'Unknown card. Register it at the gate desk.' });
      if (h.role !== 'resident' || !h.flat) return bad(res, 'This card is not a resident card');
      flat = h.flat;
    }
    if (!flat || !hasResident(flat)) return bad(res, 'No approved resident lives in that flat');
    const amt = money(amount), label = method === 'upi' ? 'UPI' : 'cash';
    const txId = W.write(flat, amt, 'topup', { method, note: str(b.reference, 120) || null, by_user: req.user.id });
    log(req.user.id, 'wallet', txId, 'topup', `flat ${flat}: +${amt} ${method}${b.reference ? ' ref ' + str(b.reference, 120) : ''}`);
    notifyFlat(flat, `₹${amt} added to your wallet (${label})`);
    res.status(201).json({ flat, balance: W.balance(flat), tx_id: txId });
  });

  // Corrections (head of committee or sysadmin): signed amount with a reason; never below 0.
  app.post('/api/admin/wallet/adjust', auth, admin, governance, (req, res) => {
    const b = req.body || {}, amount = money(b.amount), note = str(b.note, 200), flat = str(b.flat, 20).toUpperCase();
    if (!Number.isFinite(amount) || amount === 0 || Math.abs(amount) > 50000) return bad(res, 'Give an amount other than 0 (up to ₹50000 either way)');
    if (!note) return bad(res, 'Say why the wallet is adjusted');
    if (!flat || !hasResident(flat)) return bad(res, 'No approved resident lives in that flat');
    let txId;
    try {
      txId = atomic(() => {
        const bal = W.balance(flat);
        if (bal + amount < -1e-9) { const e = new Error(`Wallet balance is ₹${bal}; this adjustment would take it below ₹0`); e.status = 409; e.wallet = true; throw e; }
        return W.write(flat, amount, 'adjust', { note, by_user: req.user.id });
      });
    } catch (e) { if (e.wallet) return res.status(409).json({ error: e.message }); throw e; }
    log(req.user.id, 'wallet', txId, 'adjust', `flat ${flat}: ${amount > 0 ? '+' : ''}${amount} (${note})`);
    notifyFlat(flat, `Your wallet was adjusted by ₹${amount} by the committee: ${note}`);
    res.status(201).json({ flat, balance: W.balance(flat) });
  });

  // One lookup for every counter: who carries this card, and what the counter needs to know.
  app.post('/api/card/lookup', auth, (req, res) => {
    const r = req.user.role;
    if (!['guard', 'admin', 'shop', 'laundry'].includes(r)) return res.status(403).json({ error: 'Not allowed for this account' });
    const got = app.locals.resolveCard((req.body || {}).serial);
    if (got.error) return res.status(got.code).json({ error: got.error });
    const h = got.h, isRes = h.role === 'resident' && !!h.flat;
    const used = isRes && app.locals.creditUsed ? app.locals.creditUsed(h.flat) : 0;
    res.json({ id: h.id, name: h.name, role: h.role, flat: h.flat || null, department: h.role === 'staff' ? (h.department || 'maintenance') : null, frozen: !!h.frozen,
      wallet: isRes ? { balance: W.balance(h.flat) } : null,
      credit: isRes ? { used, limit: c.creditLimit ? c.creditLimit() : null } : null,
      parcels_waiting: ['guard', 'admin'].includes(r) ? (h.flat ? one("SELECT COUNT(*) AS n FROM parcels WHERE flat=? AND status='waiting'", h.flat).n : 0) : null });
  });
  return W;
};
module.exports.ledger = ledger;
module.exports.KINDS = KINDS;
module.exports.shortMsg = shortMsg;
