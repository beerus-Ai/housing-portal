// Stronger sign-in: two-factor authentication with an authenticator app (TOTP, RFC 6238) and passkeys (WebAuthn).
// Contract and security notes: docs/auth-api.md. Node only so far (the Java backend has no 2FA yet).
//
// - TOTP: SHA-1, 6 digits, 30 s step, +-1 step window, built on node:crypto HMAC (no dependency).
//   The secret is stored encrypted with AES-256-GCM; the key is HKDF-SHA256 from TOTP_KEY (else SESSION_SECRET).
//   The last accepted step is kept, so a code can never be used twice. Wrong codes share the sign-in throttle.
// - Recovery codes: 10 single-use codes, shown once, stored as salted SHA-256 (they are random, 50 bits each).
// - Passkeys: @simplewebauthn/server. User verification (fingerprint, face or device PIN) is required, so a passkey
//   sign-in counts as two factors and skips the TOTP step.
// - /api/login is unchanged for anyone without 2FA. With 2FA it answers 200 { needs_2fa: true } and keeps a short
//   pending state in the session (p2fa) that is NOT signed in: req.session.uid is only set after the second factor.
// Every enable, disable, reset, passkey add/remove and failed code is audited. Secrets and codes are never logged.
const crypto = require('crypto');

const STEP = 30, DIGITS = 6, WINDOW_STEPS = 1;
const PENDING_MS = 5 * 60e3;        // password accepted, waiting for the code
const ENROL_MS = 30 * 60e3;         // setup started, waiting for the first code
const CHALLENGE_MS = 3 * 60e3;      // WebAuthn challenge lifetime
const MAX_PASSKEYS = 10;
const RECOVERY_COUNT = 10;
const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const RC_ALPHA = 'abcdefghjkmnpqrstuvwxyz23456789'; // no 0/o, 1/l/i

// ---- base32 (RFC 4648, no padding)
const b32encode = buf => {
  let bits = 0, val = 0, out = '';
  for (const b of buf) { val = (val << 8) | b; bits += 8; while (bits >= 5) { out += B32[(val >>> (bits - 5)) & 31]; bits -= 5; } }
  if (bits > 0) out += B32[(val << (5 - bits)) & 31];
  return out;
};
const b32decode = s => {
  const clean = String(s).toUpperCase().replace(/[\s=-]/g, '');
  let bits = 0, val = 0; const out = [];
  for (const ch of clean) {
    const i = B32.indexOf(ch); if (i < 0) throw new Error('bad base32');
    val = (val << 5) | i; bits += 5;
    if (bits >= 8) { out.push((val >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(out);
};

// ---- HOTP / TOTP (RFC 4226 / RFC 6238)
const hotp = (key, counter, digits = DIGITS) => {
  const msg = Buffer.alloc(8);
  msg.writeBigUInt64BE(BigInt(counter));
  const h = crypto.createHmac('sha1', key).update(msg).digest();
  const off = h[h.length - 1] & 0x0f;
  const bin = ((h[off] & 0x7f) << 24) | (h[off + 1] << 16) | (h[off + 2] << 8) | h[off + 3];
  return String(bin % 10 ** digits).padStart(digits, '0');
};
const stepAt = ms => Math.floor(ms / 1000 / STEP);
const totp = (key, ms, digits = DIGITS) => hotp(key, stepAt(ms), digits);
const safeEq = (a, b) => { const x = Buffer.from(String(a)), y = Buffer.from(String(b)); return x.length === y.length && crypto.timingSafeEqual(x, y); };
// Returns the matching step (only steps after lastStep count, so a code is never accepted twice), else null.
const verifyTotp = (key, code, ms, lastStep = 0) => {
  if (!/^\d{6}$/.test(code)) return null;
  const now = stepAt(ms);
  let hit = null;
  for (let s = now - WINDOW_STEPS; s <= now + WINDOW_STEPS; s++) if (safeEq(hotp(key, s), code) && s > lastStep && hit === null) hit = s; // check every step: constant work
  return hit;
};

const b64u = buf => Buffer.from(buf).toString('base64url');
const fromB64u = s => Buffer.from(String(s), 'base64url');

module.exports = function authExtra(c) {
  const { db, q, one, run, log, notify, auth, admin, str, throttled, fail, fails, pwFp, pwStr, publicUser, statusBlock, posOf, getSetting, bcrypt } = c;
  const now = () => (c.clock ? c.clock() : new Date()).getTime();
  const WA = c.webauthn || require('@simplewebauthn/server'); // tests can replace the library boundary

  db.exec(`
  CREATE TABLE IF NOT EXISTS user_2fa(
    user_id INTEGER PRIMARY KEY REFERENCES users(id),
    secret_enc TEXT, enabled_at TEXT,
    pending_enc TEXT, pending_at INTEGER,
    last_step INTEGER NOT NULL DEFAULT 0);
  CREATE TABLE IF NOT EXISTS user_recovery_codes(
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    salt TEXT NOT NULL, hash TEXT NOT NULL, used_at TEXT);
  CREATE TABLE IF NOT EXISTS user_passkeys(
    id INTEGER PRIMARY KEY, user_id INTEGER NOT NULL REFERENCES users(id),
    cred_id TEXT NOT NULL UNIQUE, public_key TEXT NOT NULL, counter INTEGER NOT NULL DEFAULT 0,
    transports TEXT, name TEXT NOT NULL, created_at TEXT NOT NULL DEFAULT (datetime('now')), last_used_at TEXT);`);

  // ---- encryption at rest: AES-256-GCM, key = HKDF-SHA256(TOTP_KEY || SESSION_SECRET). The user id is the AAD, so a
  // ciphertext copied to another user's row does not decrypt. Without either variable (development only; production
  // already requires SESSION_SECRET) a random key is kept in the settings table so secrets survive a restart.
  const keyMaterial = () => {
    if (process.env.TOTP_KEY) return process.env.TOTP_KEY;
    if (process.env.SESSION_SECRET) return process.env.SESSION_SECRET;
    let r = one("SELECT value FROM settings WHERE key='totp_dev_key'");
    if (!r) { run("INSERT INTO settings(key,value) VALUES('totp_dev_key',?)", crypto.randomBytes(32).toString('hex')); r = one("SELECT value FROM settings WHERE key='totp_dev_key'"); }
    return r.value;
  };
  const KEY = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(keyMaterial()), Buffer.from('sahyadri-heights/totp'), Buffer.from('totp-secret-v1'), 32));
  const HANDLE_KEY = Buffer.from(crypto.hkdfSync('sha256', Buffer.from(keyMaterial()), Buffer.from('sahyadri-heights/webauthn'), Buffer.from('user-handle-v1'), 32));
  const seal = (uid, plain) => {
    const iv = crypto.randomBytes(12), ci = crypto.createCipheriv('aes-256-gcm', KEY, iv);
    ci.setAAD(Buffer.from('user:' + uid));
    const ct = Buffer.concat([ci.update(plain), ci.final()]);
    return 'v1:' + b64u(Buffer.concat([iv, ci.getAuthTag(), ct]));
  };
  const open = (uid, enc) => {
    try {
      if (!enc || !enc.startsWith('v1:')) return null;
      const raw = fromB64u(enc.slice(3)), de = crypto.createDecipheriv('aes-256-gcm', KEY, raw.subarray(0, 12));
      de.setAAD(Buffer.from('user:' + uid)); de.setAuthTag(raw.subarray(12, 28));
      return Buffer.concat([de.update(raw.subarray(28)), de.final()]);
    } catch { return null; } // wrong key (TOTP_KEY / SESSION_SECRET changed) or tampered: fail closed
  };

  const row = uid => one('SELECT * FROM user_2fa WHERE user_id=?', uid);
  const enabled = u => !!(u && one('SELECT 1 AS x FROM user_2fa WHERE user_id=? AND secret_enc IS NOT NULL', u.id));

  // ---- recovery codes
  const rcHash = (salt, code) => crypto.createHash('sha256').update(salt + ':' + code).digest('hex');
  const normRc = s => String(s || '').toLowerCase().replace(/[^a-z0-9]/g, '');
  const newRecoveryCodes = uid => {
    run('DELETE FROM user_recovery_codes WHERE user_id=?', uid);
    const codes = [];
    for (let i = 0; i < RECOVERY_COUNT; i++) {
      let s = ''; for (const b of crypto.randomBytes(10)) s += RC_ALPHA[b % RC_ALPHA.length]; // 31 symbols: slight bias, ~49 bits
      const salt = crypto.randomBytes(16).toString('hex');
      run('INSERT INTO user_recovery_codes(user_id,salt,hash) VALUES(?,?,?)', uid, salt, rcHash(salt, s));
      codes.push(s.slice(0, 5) + '-' + s.slice(5));
    }
    return codes;
  };
  const useRecoveryCode = (uid, input) => {
    const s = normRc(input);
    if (s.length !== 10) return false;
    let hit = null;
    for (const r of q('SELECT id,salt,hash FROM user_recovery_codes WHERE user_id=? AND used_at IS NULL', uid)) if (safeEq(rcHash(r.salt, s), r.hash) && !hit) hit = r;
    if (!hit) return false;
    return run("UPDATE user_recovery_codes SET used_at=datetime('now') WHERE id=? AND used_at IS NULL", hit.id).changes === 1;
  };
  const recoveryLeft = uid => one('SELECT COUNT(*) AS n FROM user_recovery_codes WHERE user_id=? AND used_at IS NULL', uid).n;

  // Checks a TOTP code (and records its step) or, when allowed, consumes a recovery code. Returns 'totp', 'recovery' or null.
  const checkSecondFactor = (uid, rawCode, allowRecovery = true) => {
    const code = String(rawCode == null ? '' : rawCode).replace(/\s/g, '').slice(0, 32);
    const r = row(uid);
    if (!r || !r.secret_enc) return null;
    if (/^\d{6}$/.test(code)) {
      const key = open(uid, r.secret_enc);
      if (!key) return null;
      const s = verifyTotp(key, code, now(), r.last_step);
      if (s === null) return null;
      return run('UPDATE user_2fa SET last_step=? WHERE user_id=? AND last_step<?', s, uid, s).changes === 1 ? 'totp' : null;
    }
    return allowRecovery && useRecoveryCode(uid, code) ? 'recovery' : null;
  };

  const ipKeyOf = req => 'ip|' + req.ip;
  const tooMany = res => res.status(429).json({ error: 'Too many attempts. Try again later.' });
  // Same session as the password login (see app.js /api/login).
  const signIn = (req, res, u, method) => req.session.regenerate(() => {
    req.session.uid = u.id; req.session.pf = pwFp(u);
    log(u.id, 'user', u.id, 'login', 'method ' + method);
    res.json(publicUser(u));
  });

  // Called by /api/login (and Google sign-in) once the password is right and the account is approved.
  const begin = (req, res, u, via) => req.session.regenerate(() => {
    req.session.p2fa = { uid: u.id, pf: pwFp(u), exp: Date.now() + PENDING_MS, via };
    res.json({ needs_2fa: true });
  });

  const mount = app => {
    // ---- second step of sign-in
    app.post('/api/login/2fa', (req, res) => {
      const p = req.session.p2fa, ipKey = ipKeyOf(req);
      if (!p || typeof p.uid !== 'number' || Date.now() > p.exp) { delete req.session.p2fa; return res.status(401).json({ error: 'Sign in again' }); }
      const uk = '2fa|' + p.uid;
      if (throttled(uk) || throttled(ipKey, 30)) return tooMany(res);
      const u = one('SELECT * FROM users WHERE id=?', p.uid);
      if (!u || statusBlock(u) || pwFp(u) !== p.pf || !enabled(u)) { delete req.session.p2fa; return res.status(401).json({ error: 'Sign in again' }); }
      const how = checkSecondFactor(u.id, req.body.code);
      if (!how) {
        fail(uk); fail(ipKey);
        log(u.id, 'user', u.id, '2fa_failed', 'sign-in');
        return res.status(401).json({ error: 'Invalid code' });
      }
      fails.delete(uk);
      if (how === 'recovery') { log(u.id, 'user', u.id, '2fa_recovery_used', recoveryLeft(u.id) + ' left'); notify(u.id, 'A recovery code was used to sign in to your account. If this was not you, tell the committee.'); }
      signIn(req, res, u, (p.via || 'password') + '+' + how);
    });

    // ---- enrolment and status (signed in)
    app.get('/api/me/2fa', auth, (req, res) => {
      const r = row(req.user.id);
      res.json({ enabled: !!(r && r.secret_enc), enabled_at: (r && r.secret_enc && r.enabled_at) || null, recovery_codes_left: r && r.secret_enc ? recoveryLeft(req.user.id) : 0, passkeys: one('SELECT COUNT(*) AS n FROM user_passkeys WHERE user_id=?', req.user.id).n });
    });
    app.post('/api/me/2fa/setup', auth, (req, res) => {
      const u = req.user, r = row(u.id);
      if (r && r.secret_enc) return res.status(409).json({ error: 'Two-factor sign-in is already on. Turn it off first.' });
      const key = crypto.randomBytes(20), secret = b32encode(key);
      const enc = seal(u.id, key);
      if (r) run('UPDATE user_2fa SET pending_enc=?, pending_at=? WHERE user_id=?', enc, now(), u.id);
      else run('INSERT INTO user_2fa(user_id,pending_enc,pending_at) VALUES(?,?,?)', u.id, enc, now());
      const issuer = String(getSetting('society_name') || 'Housing Portal').replace(/:/g, '');
      const label = encodeURIComponent(issuer) + ':' + encodeURIComponent(u.email);
      const otpauth_uri = `otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=${DIGITS}&period=${STEP}`;
      res.json({ secret, otpauth_uri });
    });
    app.post('/api/me/2fa/enable', auth, (req, res) => {
      const u = req.user, uk = '2fa|' + u.id, r = row(u.id);
      if (r && r.secret_enc) return res.status(409).json({ error: 'Two-factor sign-in is already on' });
      if (!r || !r.pending_enc || now() - r.pending_at > ENROL_MS) return res.status(400).json({ error: 'Start the setup again' });
      if (throttled(uk) || throttled(ipKeyOf(req), 30)) return tooMany(res);
      const key = open(u.id, r.pending_enc), code = String(req.body.code == null ? '' : req.body.code).replace(/\s/g, '');
      const s = key && verifyTotp(key, code, now(), 0);
      if (s == null) { fail(uk); fail(ipKeyOf(req)); log(u.id, 'user', u.id, '2fa_failed', 'setup'); return res.status(400).json({ error: 'Invalid code. Check the time on your phone and try again.' }); }
      fails.delete(uk);
      run("UPDATE user_2fa SET secret_enc=pending_enc, pending_enc=NULL, pending_at=NULL, enabled_at=datetime('now'), last_step=? WHERE user_id=?", s, u.id);
      const recovery_codes = newRecoveryCodes(u.id);
      log(u.id, 'user', u.id, '2fa_enabled');
      res.json({ ok: true, recovery_codes });
    });
    app.post('/api/me/2fa/disable', auth, (req, res) => {
      const u = req.user, uk = '2fa|' + u.id, pk = 'pw|' + u.id;
      if (!enabled(u)) return res.status(409).json({ error: 'Two-factor sign-in is not on' });
      if (throttled(pk) || throttled(uk)) return tooMany(res);
      if (!bcrypt.compareSync(pwStr(req.body.password), u.password_hash)) { fail(pk); return res.status(403).json({ error: 'Current password is wrong' }); }
      fails.delete(pk);
      if (!checkSecondFactor(u.id, req.body.code)) { fail(uk); log(u.id, 'user', u.id, '2fa_failed', 'disable'); return res.status(400).json({ error: 'Invalid code' }); }
      fails.delete(uk);
      run('DELETE FROM user_recovery_codes WHERE user_id=?', u.id);
      run('DELETE FROM user_2fa WHERE user_id=?', u.id);
      log(u.id, 'user', u.id, '2fa_disabled');
      res.json({ ok: true });
    });
    // Lost phone: the committee sysadmin clears another user's authenticator app, recovery codes and passkeys.
    app.post('/api/admin/users/:id/2fa/reset', auth, admin, (req, res) => {
      if (posOf(req.user) !== 'sysadmin') return res.status(403).json({ error: 'Only the committee admin can reset two-factor sign-in' });
      const t = one('SELECT id FROM users WHERE id=?', req.params.id);
      if (!t) return res.status(404).json({ error: 'User not found' });
      if (t.id === req.user.id) return res.status(400).json({ error: 'Turn off your own two-factor sign-in from your profile' });
      const had = !!row(t.id), pks = run('DELETE FROM user_passkeys WHERE user_id=?', t.id).changes;
      run('DELETE FROM user_recovery_codes WHERE user_id=?', t.id);
      run('DELETE FROM user_2fa WHERE user_id=?', t.id);
      fails.delete('2fa|' + t.id);
      log(req.user.id, 'user', t.id, '2fa_reset', `authenticator ${had ? 'cleared' : 'none'}; passkeys removed ${pks}`);
      notify(t.id, 'The committee reset your two-factor sign-in. Set it up again from your profile.');
      res.json({ ok: true, passkeys_removed: pks });
    });

    // ---- passkeys (WebAuthn)
    // RP ID and origin come from PUBLIC_URL / RENDER_EXTERNAL_URL. Without them, only localhost works (development).
    const rp = req => {
      const pub = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL;
      if (pub) { try { const x = new URL(pub); return { rpID: x.hostname, origin: x.origin }; } catch { return null; } }
      const host = String(req.get('host') || ''), name = host.replace(/:\d+$/, '').replace(/^\[|\]$/g, '');
      if (!['localhost', '127.0.0.1', '::1'].includes(name)) return null;
      return { rpID: name === 'localhost' ? 'localhost' : name, origin: `${req.protocol}://${host}` };
    };
    const noRp = res => res.status(503).json({ error: 'Passkeys are not set up on this server (set PUBLIC_URL)' });
    const rpName = () => String(getSetting('society_name') || 'Housing Portal');
    const userHandle = uid => crypto.createHmac('sha256', HANDLE_KEY).update(String(uid)).digest().subarray(0, 16); // opaque, no personal data
    const takeChallenge = (req, kind) => {
      const w = req.session.wa; delete req.session.wa; // single use, whatever happens next
      return w && w.kind === kind && Date.now() <= w.exp && typeof w.challenge === 'string' ? w : null;
    };
    // Shape check before the library sees it: a WebAuthn JSON response from navigator.credentials.
    const credShape = (b, kind) => {
      const r = b && b.response;
      if (!r || typeof r !== 'object' || Array.isArray(r) || r.type !== 'public-key') return false;
      const s = (v, max) => typeof v === 'string' && v.length > 0 && v.length <= max && /^[A-Za-z0-9_-]+={0,2}$/.test(v);
      if (!s(r.id, 1400) || !s(r.rawId, 1400) || !r.response || typeof r.response !== 'object') return false;
      if (!s(r.response.clientDataJSON, 4096)) return false;
      return kind === 'reg' ? s(r.response.attestationObject, 65536) : s(r.response.authenticatorData, 4096) && s(r.response.signature, 1024);
    };

    app.post('/api/me/passkeys/register/options', auth, async (req, res) => {
      const R = rp(req); if (!R) return noRp(res);
      const u = req.user, mine = q('SELECT cred_id,transports FROM user_passkeys WHERE user_id=?', u.id);
      if (mine.length >= MAX_PASSKEYS) return res.status(409).json({ error: `You can keep up to ${MAX_PASSKEYS} passkeys. Remove one first.` });
      const o = await WA.generateRegistrationOptions({
        rpName: rpName(), rpID: R.rpID, userID: userHandle(u.id), userName: u.email, userDisplayName: u.name,
        attestationType: 'none', timeout: CHALLENGE_MS,
        authenticatorSelection: { residentKey: 'required', userVerification: 'required' },
        excludeCredentials: mine.map(p => ({ id: p.cred_id, transports: p.transports ? JSON.parse(p.transports) : undefined })),
      });
      req.session.wa = { kind: 'reg', challenge: o.challenge, uid: u.id, exp: Date.now() + CHALLENGE_MS };
      res.json(o);
    });
    app.post('/api/me/passkeys/register/verify', auth, async (req, res) => {
      const R = rp(req); if (!R) return noRp(res);
      const w = takeChallenge(req, 'reg');
      if (!w || w.uid !== req.user.id) return res.status(400).json({ error: 'Start adding the passkey again' });
      if (!credShape(req.body, 'reg')) return res.status(400).json({ error: 'Invalid passkey response' });
      let v;
      try { v = await WA.verifyRegistrationResponse({ response: req.body.response, expectedChallenge: w.challenge, expectedOrigin: R.origin, expectedRPID: R.rpID, requireUserVerification: true }); } catch { v = null; }
      const cred = v && v.verified && v.registrationInfo && v.registrationInfo.credential;
      if (!cred || typeof cred.id !== 'string' || !cred.publicKey) return res.status(400).json({ error: 'The passkey could not be verified' });
      if (one('SELECT 1 AS x FROM user_passkeys WHERE cred_id=?', cred.id)) return res.status(409).json({ error: 'This passkey is already registered' });
      const name = str(req.body.name, 40) || 'Passkey';
      const transports = Array.isArray(cred.transports) ? JSON.stringify(cred.transports.filter(t => typeof t === 'string').slice(0, 8)) : null;
      const ins = run('INSERT INTO user_passkeys(user_id,cred_id,public_key,counter,transports,name) VALUES(?,?,?,?,?,?)', req.user.id, cred.id, b64u(cred.publicKey), Number(cred.counter) || 0, transports, name);
      log(req.user.id, 'passkey', Number(ins.lastInsertRowid), 'passkey_added', name);
      res.status(201).json({ id: Number(ins.lastInsertRowid), name });
    });
    app.get('/api/me/passkeys', auth, (req, res) => res.json(q('SELECT id,name,created_at,last_used_at,transports FROM user_passkeys WHERE user_id=? ORDER BY id', req.user.id)
      .map(p => ({ ...p, transports: p.transports ? JSON.parse(p.transports) : [] }))));
    app.delete('/api/me/passkeys/:id', auth, (req, res) => {
      const p = one('SELECT id,name FROM user_passkeys WHERE id=? AND user_id=?', req.params.id, req.user.id);
      if (!p) return res.status(404).json({ error: 'Passkey not found' });
      run('DELETE FROM user_passkeys WHERE id=?', p.id);
      log(req.user.id, 'passkey', p.id, 'passkey_removed', p.name);
      res.json({ ok: true });
    });

    // Passwordless sign-in. Discoverable credentials: the browser offers the passkeys it has for this site.
    app.post('/api/login/passkey/options', async (req, res) => {
      if (throttled(ipKeyOf(req), 30)) return tooMany(res);
      const R = rp(req); if (!R) return noRp(res);
      const o = await WA.generateAuthenticationOptions({ rpID: R.rpID, userVerification: 'required', timeout: CHALLENGE_MS, allowCredentials: [] });
      req.session.wa = { kind: 'auth', challenge: o.challenge, exp: Date.now() + CHALLENGE_MS };
      res.json(o);
    });
    app.post('/api/login/passkey/verify', async (req, res) => {
      const ipKey = ipKeyOf(req);
      if (throttled(ipKey, 30)) return tooMany(res);
      const R = rp(req); if (!R) return noRp(res);
      const w = takeChallenge(req, 'auth');
      if (!w) return res.status(400).json({ error: 'Start the passkey sign-in again' });
      if (!credShape(req.body, 'auth')) return res.status(400).json({ error: 'Invalid passkey response' });
      const resp = req.body.response, pk = one('SELECT * FROM user_passkeys WHERE cred_id=?', resp.id);
      const bad = () => { fail(ipKey); return res.status(401).json({ error: 'Passkey sign-in failed' }); };
      if (!pk) return bad();
      const uh = resp.response.userHandle;
      if (uh != null && (typeof uh !== 'string' || !safeEq(uh, b64u(userHandle(pk.user_id))))) return bad();
      let v;
      try {
        v = await WA.verifyAuthenticationResponse({
          response: resp, expectedChallenge: w.challenge, expectedOrigin: R.origin, expectedRPID: R.rpID, requireUserVerification: true,
          credential: { id: pk.cred_id, publicKey: new Uint8Array(fromB64u(pk.public_key)), counter: pk.counter, transports: pk.transports ? JSON.parse(pk.transports) : undefined },
        });
      } catch { v = null; } // includes a counter that went backwards (cloned authenticator)
      if (!v || !v.verified || !v.authenticationInfo) { log(pk.user_id, 'passkey', pk.id, 'passkey_failed'); return bad(); }
      const nc = Number(v.authenticationInfo.newCounter) || 0;
      if (pk.counter > 0 && nc <= pk.counter) { log(pk.user_id, 'passkey', pk.id, 'passkey_failed', 'counter did not increase'); return bad(); } // belt and braces over the library check
      const u = one('SELECT * FROM users WHERE id=?', pk.user_id);
      if (!u) return bad();
      const blocked = statusBlock(u);
      if (blocked) return res.status(403).json({ error: blocked });
      run("UPDATE user_passkeys SET counter=?, last_used_at=datetime('now') WHERE id=?", nc, pk.id);
      signIn(req, res, u, 'passkey');
    });
  };

  return { mount, enabled, begin };
};
module.exports.totp = { hotp, totp, verifyTotp, b32encode, b32decode, stepAt };
