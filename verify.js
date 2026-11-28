// Email verification at onboarding (2026-11-28, contract docs/email-verification-api.md). When someone registers (or
// the committee or a flat owner adds them), they get a link to confirm their email. Tokens are random and stored only
// as a SHA-256 hash, last 48 hours and work once. The committee sees "Email confirmed" before approving and can require
// it (setting, off by default). Mail goes to VERIFY_EMAIL_WEBHOOK_URL (an n8n workflow that emails the person); without
// it, a development server prints the link to its log and production records that no email could be sent.

const crypto = require('crypto');
const HOURS = 48;
const RESEND_MS = 5 * 60e3;
const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = function mountVerify(app, c) {
  const { db, q, one, run, log, auth, admin, governance, getSetting } = c;
  db.exec(`CREATE TABLE IF NOT EXISTS email_verifications(
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id), token_hash TEXT NOT NULL UNIQUE,
    expires_at TEXT NOT NULL, used_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')))`);
  if (!q('PRAGMA table_info(users)').some(x => x.name === 'email_verified_at')) db.exec('ALTER TABLE users ADD COLUMN email_verified_at TEXT');

  const required = () => getSetting('require_email_verified') === '1';
  const baseUrl = req => (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || (req ? `${req.protocol}://${req.get('host')}` : 'http://localhost:' + (process.env.PORT || 3000))).replace(/\/$/, '');
  const society = () => getSetting('society_name') || 'Sahyadri Heights';

  // Default mailer: the n8n webhook, else the server log (development only). Tests pass their own via createApp({ mailer }).
  const mailer = c.mailer || (async msg => {
    const url = process.env.VERIFY_EMAIL_WEBHOOK_URL;
    if (url) {
      const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(msg), signal: AbortSignal.timeout(15e3) });
      return r.ok;
    }
    if (process.env.NODE_ENV !== 'production') { if (!process.env.NODE_TEST_CONTEXT) console.log(`[email verification] ${msg.to}: ${msg.link}`); return true; }
    return false;
  });

  // Makes a fresh link (older unused links stop working) and sends it. Returns 'sent' | 'unavailable' | 'verified'.
  const send = async (userId, req) => {
    const u = one('SELECT id, name, email, email_verified_at FROM users WHERE id=?', userId);
    if (!u) return 'unavailable';
    if (u.email_verified_at) return 'verified';
    const token = crypto.randomBytes(32).toString('base64url');
    run("UPDATE email_verifications SET used_at=datetime('now') WHERE user_id=? AND used_at IS NULL", u.id);
    run(`INSERT INTO email_verifications(user_id, token_hash, expires_at) VALUES(?,?,datetime('now','+${HOURS} hours'))`, u.id, sha(token));
    const link = `${baseUrl(req)}/verify-email/${token}`;
    const subject = `${society()}: please confirm your email`;
    const text = `Hello ${u.name},\n\nPlease confirm your email for the ${society()} portal by opening this link within ${HOURS} hours:\n${link}\n\nIf you did not register, ignore this email.`;
    const html = `<div style="font:16px/1.5 Arial,sans-serif;color:#201e1d;max-width:560px"><p>Hello ${esc(u.name)},</p><p>Please confirm your email for the ${esc(society())} portal.</p>
      <p><a href="${esc(link)}" style="display:inline-block;background:#0088b0;color:#fff;padding:12px 18px;border-radius:8px;text-decoration:none;font-weight:600">Confirm my email</a></p>
      <p style="font-size:13px;color:#5d5a59">The link works once and expires in ${HOURS} hours. If you did not register, ignore this email.</p></div>`;
    let ok = false;
    try { ok = await mailer({ kind: 'verify_email', to: u.email, name: u.name, subject, text, html, link }); } catch { ok = false; }
    log(null, 'user', u.id, ok ? 'verification_sent' : 'verification_unavailable', ok ? 'email link' : 'no email transport'); // never log the link
    return ok ? 'sent' : 'unavailable';
  };
  app.locals.sendVerification = send;
  app.locals.emailVerificationRequired = required;

  // The link from the email: a small page, so it works on any phone without signing in.
  const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;background:#f3f2f2;color:#201e1d;font:16px/1.5 Arial,sans-serif}main{max-width:520px;margin:10vh auto;padding:0 16px}.card{background:#fff;border:1px solid #d7d3d3;border-radius:14px;padding:24px}h1{font-size:22px;margin:0 0 8px}a{color:#006786;font-weight:600}.bad h1{color:#8c1d2e}</style></head><body><main>${body}</main></body></html>`;
  app.get('/verify-email/:token', (req, res) => {
    res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
    const v = one("SELECT v.*, u.name, u.email_verified_at FROM email_verifications v JOIN users u ON u.id=v.user_id WHERE v.token_hash=?", sha(req.params.token));
    if (!v || v.used_at || v.expires_at < one("SELECT datetime('now') AS n").n) {
      if (v && v.email_verified_at) return res.type('html').send(page('Email confirmed', `<div class="card"><h1>Your email is already confirmed</h1><p><a href="/">Open the portal</a></p></div>`));
      return res.status(400).type('html').send(page('Link expired', `<div class="card bad"><h1>This link has expired or was already used</h1><p>Sign in, or ask for a new link on the sign-in page ("Resend confirmation email").</p><p><a href="/">Open the portal</a></p></div>`));
    }
    run("UPDATE email_verifications SET used_at=datetime('now') WHERE id=?", v.id);
    run("UPDATE users SET email_verified_at=datetime('now') WHERE id=? AND email_verified_at IS NULL", v.user_id);
    log(v.user_id, 'user', v.user_id, 'email_verified', '');
    res.type('html').send(page('Email confirmed', `<div class="card"><h1>Thank you, ${esc(v.name)}. Your email is confirmed.</h1><p>The committee will review your registration. You will be able to sign in once it is approved.</p><p><a href="/">Open the portal</a></p></div>`));
  });

  // Ask for a new link. Always the same answer, so it does not reveal who is registered; at most one email per 5 minutes.
  const lastSent = new Map();
  app.post('/api/verify-email/resend', async (req, res) => {
    const email = String((req.body || {}).email || '').trim().toLowerCase().slice(0, 200);
    const u = email && one('SELECT id, email_verified_at FROM users WHERE email=?', email);
    if (u && !u.email_verified_at && Date.now() - (lastSent.get(u.id) || 0) > RESEND_MS) { lastSent.set(u.id, Date.now()); await send(u.id, req); }
    res.json({ ok: true, message: 'If that email is registered and not yet confirmed, a new link is on its way.' });
  });

  // The committee: is confirmation required before approval? (head or admin may change it)
  app.get('/api/admin/settings/email-verification', auth, admin, (req, res) => res.json({ required: required() }));
  app.put('/api/admin/settings/email-verification', auth, admin, governance, (req, res) => {
    const v = (req.body || {}).required;
    if (typeof v !== 'boolean') return res.status(400).json({ error: 'required must be true or false' });
    if (v !== required()) {
      db.prepare('INSERT INTO settings(key,value) VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run('require_email_verified', v ? '1' : '0');
      log(req.user.id, 'settings', null, 'updated', 'require_email_verified: ' + (v ? 'on' : 'off'));
    }
    res.json({ required: v });
  });
  // The committee can send a fresh link for a pending person (e.g. they lost the email).
  app.post('/api/admin/users/:id/verify-email', auth, admin, async (req, res) => {
    const u = one("SELECT id, email_verified_at FROM users WHERE id=? AND status!='removed'", req.params.id);
    if (!u) return res.status(404).json({ error: 'User not found' });
    if (u.email_verified_at) return res.status(409).json({ error: 'This email is already confirmed' });
    const r = await send(u.id, req);
    log(req.user.id, 'user', u.id, 'verification_resent', r);
    res.json({ result: r });
  });
};
