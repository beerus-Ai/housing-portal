// Sign-in security in the browser (web app and /m/): the 2FA code step after the password, passkey sign-in, and the
// profile "Sign-in security" panel (authenticator app and passkeys). Contract: docs/auth-api.md (server: auth-2fa.js).
// WebAuthn goes through navigator.credentials directly with small base64url helpers: no CDN, CSP stays 'self'.
// Forms here use ids starting "hpa-" and buttons use data-hpa (not data-act), so the apps' own handlers never see them.
// Each app sets HPAuth.onSignedIn = user => { ... } to enter the signed-in view.
window.HPAuth = (() => {
  const { $, esc, ic, toast } = HP;

  // ---- base64url <-> ArrayBuffer
  const toBuf = s => { const b = atob(String(s).replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(String(s).length / 4) * 4, '=')); const u = new Uint8Array(b.length); for (let i = 0; i < b.length; i++) u[i] = b.charCodeAt(i); return u.buffer; };
  const toB64u = buf => { if (!buf) return undefined; const u = new Uint8Array(buf); let s = ''; for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
  const supported = () => !!(window.PublicKeyCredential && navigator.credentials && window.isSecureContext !== false);

  // Server JSON options -> the shapes navigator.credentials expects.
  const createOpts = o => ({ ...o, challenge: toBuf(o.challenge), user: { ...o.user, id: toBuf(o.user.id) }, excludeCredentials: (o.excludeCredentials || []).map(c => ({ ...c, id: toBuf(c.id) })) });
  const getOpts = o => ({ ...o, challenge: toBuf(o.challenge), allowCredentials: (o.allowCredentials || []).map(c => ({ ...c, id: toBuf(c.id) })) });
  // PublicKeyCredential -> JSON the server (@simplewebauthn/server) reads.
  const credJson = c => {
    const r = c.response, out = { id: c.id, rawId: toB64u(c.rawId), type: c.type, clientExtensionResults: c.getClientExtensionResults ? c.getClientExtensionResults() : {}, authenticatorAttachment: c.authenticatorAttachment || undefined, response: { clientDataJSON: toB64u(r.clientDataJSON) } };
    if (r.attestationObject) { out.response.attestationObject = toB64u(r.attestationObject); out.response.transports = r.getTransports ? r.getTransports() : []; }
    if (r.authenticatorData) { out.response.authenticatorData = toB64u(r.authenticatorData); out.response.signature = toB64u(r.signature); if (r.userHandle) out.response.userHandle = toB64u(r.userHandle); }
    return out;
  };
  const cancelled = e => e && (e.name === 'NotAllowedError' || e.name === 'AbortError');

  const H = { onSignedIn: null, supported };
  const signedIn = u => { if (H.onSignedIn) H.onSignedIn(u); else location.reload(); };

  // ---------- sign-in screen
  H.passkeyButton = () => supported() ? `<button type="button" class="btn btn-secondary btn-lg hpa-pk" data-hpa="pklogin">${ic('fingerprint')}Sign in with a passkey (fingerprint / face)</button>` : '';
  async function passkeyLogin(btn) {
    const err = $('#autherr') || $('#hpa-err');
    if (err) err.textContent = '';
    btn.disabled = true;
    try {
      const o = await API.auth.passkeyOptions();
      const cred = await navigator.credentials.get({ publicKey: getOpts(o) });
      if (!cred) throw new Error('No passkey was chosen');
      signedIn(await API.auth.passkeyVerify(credJson(cred)));
    } catch (e) {
      const m = cancelled(e) ? 'Passkey sign-in was cancelled' : e.message || 'Passkey sign-in failed';
      if (err && err.isConnected) err.textContent = m; else toast(m, 'error');
    } finally { if (btn.isConnected) btn.disabled = false; }
  }

  // After the password: replaces the sign-in form with the 6-digit code step.
  H.codeStep = form => {
    const box = document.createElement('form');
    box.id = 'hpa-code'; box.className = (form.className || '') + ' col hpa-code'; box.noValidate = true;
    box.innerHTML = `<h2>Two-step sign-in</h2>
      <p class="muted" id="hpa-hint" style="margin:0">Open your authenticator app and type the 6-digit code for this account.</p>
      <div class="field"><label for="hpa-c" id="hpa-lbl">6-digit code</label><input class="input hpa-otp" id="hpa-c" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" pattern="[0-9]{6}" required></div>
      <p class="err" id="hpa-err" role="alert"></p>
      <button class="btn btn-primary btn-lg">${ic('shield-check')}Verify</button>
      <p class="am-switch"><button type="button" class="link-btn" data-hpa="userec">Use a recovery code</button> · <button type="button" class="link-btn" data-hpa="restart">Start again</button></p>`;
    form.replaceWith(box);
    const i = $('#hpa-c'); if (i) i.focus();
  };
  function toggleRecovery(el) {
    const i = $('#hpa-c'), rec = i.inputMode === 'numeric';
    i.value = ''; i.inputMode = rec ? 'text' : 'numeric'; i.maxLength = rec ? 11 : 6; i.autocomplete = rec ? 'off' : 'one-time-code';
    if (rec) i.removeAttribute('pattern'); else i.setAttribute('pattern', '[0-9]{6}');
    $('#hpa-lbl').textContent = rec ? 'Recovery code (like abcde-fghjk)' : '6-digit code';
    $('#hpa-hint').textContent = rec ? 'Each recovery code works once. Use one if you do not have your phone.' : 'Open your authenticator app and type the 6-digit code for this account.';
    el.textContent = rec ? 'Use the authenticator app' : 'Use a recovery code';
    i.focus();
  }

  // ---------- profile: Sign-in security
  const P = { el: null, setup: null, codes: null, off: false, err: '' };
  const fmtSecret = s => String(s).replace(/(.{4})/g, '$1 ').trim();
  const when = s => (HP.stamp ? HP.stamp(s) : s);
  H.mountSecurity = async el => { if (!el) return; P.el = el; P.setup = null; P.codes = null; P.off = false; P.err = ''; await draw(); };
  async function draw() {
    const el = P.el; if (!el || !el.isConnected) return;
    const [st, pks] = await Promise.all([API.security.status(), API.security.passkeys()]);
    const errLine = `<p class="err" id="hpa-perr" role="alert">${esc(P.err)}</p>`;
    let app;
    if (P.codes) {
      app = `<div class="callout col" style="gap:var(--space-2)"><b>Save your recovery codes now</b><span class="muted xs">Each works once if you lose your phone. They will not be shown again.</span>
        <ol class="hpa-codes" style="columns:2;font-family:ui-monospace,monospace;margin:0;padding-left:1.5em">${P.codes.map(c => `<li>${esc(c)}</li>`).join('')}</ol>
        <div class="row"><button type="button" class="btn btn-secondary" data-hpa="dlcodes">${ic('download-simple')}Download</button><button type="button" class="btn btn-secondary" data-hpa="cpcodes">${ic('copy')}Copy</button><button type="button" class="btn btn-primary" data-hpa="donecodes">I have saved them</button></div></div>`;
    } else if (P.setup) {
      app = `<div class="col" style="gap:var(--space-2)"><span class="muted">1. Scan this with an authenticator app (Google Authenticator, Microsoft Authenticator and others).</span>
        <div class="hpa-qr" style="align-self:flex-start;background:#fff;padding:8px;border-radius:12px">${HP.qrSvg(P.setup.otpauth_uri, 200)}</div>
        <span class="muted xs">Cannot scan? Enter this key by hand (time-based):</span><code class="hpa-secret" style="font-size:15px;letter-spacing:.05em;user-select:all">${esc(fmtSecret(P.setup.secret))}</code>
        <form id="hpa-enable" class="col" novalidate><div class="field"><label for="hpa-ec">2. Type the 6-digit code the app shows</label><input class="input" id="hpa-ec" name="code" inputmode="numeric" autocomplete="one-time-code" maxlength="6" required></div>
        ${errLine}<div class="row"><button class="btn btn-primary">${ic('shield-check')}Turn on</button><button type="button" class="btn btn-secondary" data-hpa="cancel">Cancel</button></div></form></div>`;
    } else if (st.enabled) {
      app = `<p style="margin:0"><span class="tag tag-accent">On</span> <span class="muted xs">since ${esc(when(st.enabled_at))} · ${st.recovery_codes_left} recovery code${st.recovery_codes_left === 1 ? '' : 's'} left</span></p>
        ${P.off ? `<form id="hpa-disable" class="col" novalidate><div class="field"><label for="hpa-dp">Current password</label><input class="input" id="hpa-dp" name="password" type="password" required autocomplete="current-password"></div>
          <div class="field"><label for="hpa-dc">Code from the app (or a recovery code)</label><input class="input" id="hpa-dc" name="code" autocomplete="one-time-code" maxlength="11" required></div>
          ${errLine}<div class="row"><button class="btn btn-danger">Turn off</button><button type="button" class="btn btn-secondary" data-hpa="cancel">Keep it on</button></div></form>`
        : `<div class="row"><button type="button" class="btn btn-secondary" data-hpa="off">Turn off</button></div>`}`;
    } else {
      app = `<p class="muted" style="margin:0">After your password, also ask for a 6-digit code from an app on your phone.</p>${errLine}
        <div class="row"><button type="button" class="btn btn-primary" data-hpa="setup">${ic('shield-check')}Set up the authenticator app</button></div>`;
    }
    const keys = pks.map(p => `<div class="row" style="flex-wrap:nowrap;gap:var(--space-2)">${ic('fingerprint')}<span class="col" style="gap:0;flex:1"><b class="sm">${esc(p.name)}</b><span class="muted xs">Added ${esc(when(p.created_at))}${p.last_used_at ? ' · last used ' + esc(when(p.last_used_at)) : ''}</span></span><button type="button" class="btn btn-secondary btn-sm" data-hpa="pkdel" data-id="${Number(p.id)}" aria-label="Remove passkey ${esc(p.name)}">${ic('trash')}Remove</button></div>`).join('');
    el.innerHTML = `<section class="form-card col hpa-sec"><h3>Sign-in security</h3>
      <div class="col" style="gap:var(--space-2)"><b>Authenticator app</b>${app}</div>
      <div class="col" style="gap:var(--space-2)"><b>Passkeys</b><span class="muted xs">Sign in with your fingerprint, face or device PIN instead of a password. A passkey counts as both steps.</span>
        ${keys || '<span class="muted sm">No passkeys yet.</span>'}
        ${supported() ? `<form id="hpa-pkadd" class="row" novalidate><input class="input" id="hpa-pkn" name="name" maxlength="40" placeholder="Name, e.g. My phone" aria-label="Passkey name" style="flex:1;min-width:10em"><button class="btn btn-secondary">${ic('fingerprint')}Add a passkey</button></form>` : '<span class="muted xs">This browser does not support passkeys.</span>'}</div></section>`;
  }
  const codesText = () => 'Recovery codes for ' + (window.HP && HP.SOCIETY ? HP.SOCIETY.name : 'the society portal') + '\nEach code works once.\n\n' + P.codes.join('\n') + '\n';
  const redraw = async msg => { if (msg !== undefined) P.err = msg; try { await draw(); } catch (e) { toast(e.message, 'error'); } };

  const ACT = {
    pklogin: passkeyLogin,
    userec: toggleRecovery,
    restart: () => location.reload(), // the pending state simply expires
    setup: async () => { P.setup = await API.security.setup(); await redraw(''); const i = $('#hpa-ec'); if (i) i.focus(); },
    cancel: () => { P.setup = null; P.off = false; return redraw(''); },
    off: async () => { P.off = true; await redraw(''); const i = $('#hpa-dp'); if (i) i.focus(); },
    donecodes: () => { P.codes = null; return redraw(''); },
    dlcodes: () => { const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([codesText()], { type: 'text/plain' })); a.download = 'recovery-codes.txt'; document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000); },
    cpcodes: async () => { try { await navigator.clipboard.writeText(codesText()); toast('Recovery codes copied'); } catch (e) { toast('Could not copy. Download them instead.', 'error'); } },
    pkdel: async el => { await API.security.passkeyRemove(el.dataset.id); toast('Passkey removed'); await redraw(''); },
  };
  document.addEventListener('click', async e => {
    const el = e.target.closest('[data-hpa]'); if (!el || !ACT[el.dataset.hpa]) return;
    e.preventDefault(); e.stopPropagation();
    try { await ACT[el.dataset.hpa](el); } catch (x) { toast(x.message, 'error'); }
  }, true);

  document.addEventListener('submit', async e => {
    const f = e.target; if (!/^hpa-/.test(f.id || '')) return;
    e.preventDefault(); e.stopPropagation();
    const d = Object.fromEntries(new FormData(f)), btn = f.querySelector('button:not([type=button])');
    if (btn) btn.disabled = true;
    try {
      if (f.id === 'hpa-code') {
        const code = String(d.code || '').trim();
        if (!code) { $('#hpa-c').focus(); return; }
        $('#hpa-err').textContent = '';
        try { signedIn(await API.auth.login2fa(code)); }
        catch (x) { $('#hpa-err').textContent = x.message === 'Sign in again' ? 'That took too long. Start again and sign in with your password.' : x.message; f.classList.remove('shake'); void f.offsetWidth; f.classList.add('shake'); $('#hpa-c').select(); }
      } else if (f.id === 'hpa-enable') {
        try { const r = await API.security.enable(String(d.code || '').trim()); P.setup = null; P.codes = r.recovery_codes; toast('Two-step sign-in is on'); await redraw(''); }
        catch (x) { $('#hpa-perr').textContent = x.message; }
      } else if (f.id === 'hpa-disable') {
        try { await API.security.disable(d.password || '', String(d.code || '').trim()); P.off = false; toast('Two-step sign-in is off'); await redraw(''); }
        catch (x) { $('#hpa-perr').textContent = x.message; }
      } else if (f.id === 'hpa-pkadd') {
        if (!supported()) return;
        try {
          const o = await API.security.passkeyOptions();
          const cred = await navigator.credentials.create({ publicKey: createOpts(o) });
          if (!cred) throw new Error('No passkey was created');
          await API.security.passkeyAdd(credJson(cred), String(d.name || '').trim() || undefined);
          toast('Passkey added'); await redraw('');
        } catch (x) { if (!cancelled(x)) toast(x.name === 'InvalidStateError' ? 'This device already has a passkey for your account' : x.message, 'error'); }
      }
    } finally { if (btn && btn.isConnected) btn.disabled = false; }
  }, true);

  return H;
})();
