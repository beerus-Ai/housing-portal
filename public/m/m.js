// Mobile app (installable PWA). Same API and data as the web app, laid out for a 390px phone with a bottom tab bar.
(() => {
  const { $, esc, ic, toast, api, guard, CATS, catLabel, catIcon, TYPE, stamp, day, ageLabel, isOpen, overdue, initials, firstName,
    statusTag, stepper, stars, noticeIcon, photoSlot, residentSummary, adminSummary, ring, rid, SOCIETY, leaseInfo } = HP;
  const EMERGENCY_TYPES = HP.EMERGENCY_TYPES || [];

  if ('serviceWorker' in navigator) navigator.serviceWorker.register('/m/sw.js').catch(() => {});
  const app = $('#app');
  const S = { me: null, leaseId: null, tab: 'home', sub: null, selId: null, cat: 'plumbing', photo: null, rtype: 'family', regType: 'owner', mode: 'login', sheet: null, note: '', pf: null, emgActive: 0, idx: { reqs: [], notices: [] } };
  const isAdmin = () => S.me.role === 'admin';
  const isGuard = () => S.me.role === 'guard';
  // permission / feature gates from GET /api/me; anything missing counts as allowed
  const can = k => isAdmin() || !Array.isArray(S.me.permissions) || S.me.permissions.includes(k);
  const feat = k => !S.me.features || S.me.features[k] !== false;
  S.set = { access: null, matrix: null, features: null, users: [], q: '', open: null, confirm: null, reset: false, guards: [], gconfirm: null };
  S.gp = { view: null, confirm: null, list: [] }; S.gRes = null;
  const TABS = {
    resident: () => [['home', 'Home', 'house'], ['emergency', 'Emergency', 'siren'], ['alerts', 'Alerts', 'bell'], ['profile', 'Profile', 'user-circle']],
    guard: () => [['gate', 'Gate', 'shield-check'], ['gatelog', 'Log', 'clock-counter-clockwise'], ['profile', 'Profile', 'user-circle']],
    admin: () => [['home', 'Dashboard', 'chart-bar'], ['requests', 'Requests', 'list-checks'], ['emergency', 'Emergency', 'siren'], ['approvals', 'Approvals', 'user-check'], ['notices', 'Notices', 'megaphone']],
  };
  const go = (tab, selId = null, sub = null) => { stopScan(); S.gp.confirm = null; S.tab = tab; S.selId = selId; S.sub = sub; render(); window.scrollTo(0, 0); };
  const greet = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
  const dateShort = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long' });
  const back = (label, to) => `<button class="back" data-act="tab" data-tab="${to}">${ic('caret-left')}${esc(label)}</button>`;
  const vendorOpts = (vs, cur) => `<option value="">Assign a vendor…</option>${vs.map(v => `<option value="${v.id}" ${cur === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}`;
  const noticeCard = n => `<div class="member" style="grid-template-columns:48px minmax(0,1fr);border-radius:20px"><span class="tile lg" style="width:48px;height:48px;border-radius:16px;font-size:26px">${ic(noticeIcon(n))}</span>
    <span class="col" style="gap:2px"><span class="muted xs">${esc(day(n.created_at))} · ${esc(n.author)}</span><span class="list-title" style="font-size:16px">${esc(n.title)}</span><span class="sm">${esc(n.body)}</span></span></div>`;
  const reqCard = r => `<button class="list-row m-card" style="grid-template-columns:40px minmax(0,1fr) auto;align-items:center" data-act="open" data-id="${r.id}"><span class="tile">${ic(catIcon(r.category))}</span>
    <span class="col" style="gap:2px"><span class="list-title" style="font-size:15px">${esc(r.title)}</span><span class="muted xs">${rid(r)} · ${esc(r.flat)} · ${esc(day(r.created_at))}</span><span style="align-self:flex-start">${statusTag(r)}</span></span>
    ${isAdmin() && isOpen(r) ? `<span class="${overdue(r) ? 'late' : ''} sm">${ageLabel(r.created_at)}</span>` : ''}</button>`;

  const searchBox = () => `<div class="m-search am-search"><span class="m-search-ic">${ic('magnifying-glass')}</span><input class="input" id="hs" type="search" placeholder="Search requests and notices" autocomplete="off" aria-label="Search requests and notices"></div><div id="hres" class="col" style="gap:8px"></div>`;
  const searchResults = q => {
    q = q.trim().toLowerCase(); if (!q) return '';
    const rs = S.idx.reqs.filter(r => (r.title || '').toLowerCase().includes(q)).slice(0, 5), ns = S.idx.notices.filter(n => (n.title || '').toLowerCase().includes(q)).slice(0, 5);
    return rs.map(r => `<button class="list-row m-card m-hit" data-act="open" data-id="${r.id}"><span class="tile">${ic(catIcon(r.category))}</span><span class="col" style="gap:0"><span class="list-title" style="font-size:16px">${esc(r.title)}</span><span class="muted xs">Request ${rid(r)}</span></span></button>`).join('')
      + ns.map(n => `<button class="list-row m-card m-hit" data-act="quick" data-k="notices-sub"><span class="tile">${ic(noticeIcon(n))}</span><span class="col" style="gap:0"><span class="list-title" style="font-size:16px">${esc(n.title)}</span><span class="muted xs">Notice</span></span></button>`).join('')
      || '<p class="muted sm">No matches.</p>';
  };
  // ---------- airbnb-style building blocks
  const amHead = (title, sub, adm) => `<div class="am-head">${HP.logo(44, 'am-logo')}<div class="col grow" style="gap:0;min-width:0"><span class="am-soc">${esc(SOCIETY.name)}</span><span class="muted xs">${esc(sub)}</span></div>
    ${adm ? `<button class="btn btn-ghost btn-icon" data-act="tab" data-tab="profile" aria-label="Profile" style="font-size:24px">${ic('user-circle')}</button>` : ''}<button class="btn btn-ghost btn-icon" data-act="tab" data-tab="alerts" aria-label="Alerts" style="font-size:24px">${ic('bell')}</button></div><h1 class="am-h1">${esc(title)}</h1>`;
  const amChips = list => `<div class="am-chips" role="list">${list.filter(c => c[3]).map(([i, l, k]) => `<button class="am-chip" role="listitem" data-act="${['approvals', 'requests', 'emergency', 'notices'].includes(k) && isAdmin() ? 'tab' : 'quick'}" data-tab="${k}" data-k="${k}"><span class="am-chip-ic">${ic(i)}</span><span>${esc(l)}</span></button>`).join('')}</div>`;
  const amSection = (t, cards) => `<section class="am-sec"><h2 class="am-h2">${esc(t)}</h2><div class="am-row">${cards}</div></section>`;
  const amCard = (icon, title, sub, act, k, g) => `<button class="am-card g${(g % 6) + 1}" data-act="${act}" data-k="${esc(k)}"><span class="am-art">${ic(icon)}</span><span class="am-t">${esc(title)}</span><span class="am-s">${esc(sub)}</span></button>`;
  const amReq = (r, i) => `<button class="am-card g${(i % 6) + 1}" data-act="open" data-id="${r.id}"><span class="am-art">${r.has_photo ? `<img src="${API.requests.photoUrl(r.id)}" alt="" loading="lazy">` : ic(catIcon(r.category))}</span>
    <span class="am-t">${esc(r.title)}</span><span class="am-s">${rid(r)} · ${esc(day(r.created_at))}</span><span class="am-tag">${statusTag(r)}</span></button>`;
  const emgType = k => EMERGENCY_TYPES.find(t => t[0] === k) || [k, 'warning', k];
  const emgTag = e => e.status === 'active' ? '<span class="tag tag-accent-2">Active</span>' : '<span class="tag tag-neutral">Resolved</span>';
  const emgRow = (e, admin) => { const t = emgType(e.type); return `<div class="m-card"><div class="row" style="flex-wrap:nowrap;gap:12px"><span class="tile lg" style="width:48px;height:48px;border-radius:16px;font-size:26px">${ic(t[1])}</span>
    <span class="col grow" style="gap:2px"><span class="list-title" style="font-size:16px">${esc(t[2])}</span><span class="muted xs">${admin ? esc(e.flat) + ' · ' + esc(e.user_name || '') + ' · ' : ''}${esc(stamp(e.created_at))}</span>${e.note ? `<span class="sm">${esc(e.note)}</span>` : ''}</span>${emgTag(e)}</div>
    ${admin && e.status === 'active' ? `<button class="btn btn-primary btn-lg" data-act="emgresolve" data-id="${e.id}">${ic('check-circle')}Mark resolved</button>` : ''}</div>`; };

  async function render() {
    if (!S.me) return authView();
    stopScan();
    if (isGuard() && !['gate', 'gatelog', 'profile'].includes(S.tab)) { S.tab = 'gate'; S.sub = null; }
    const tabs = TABS[isGuard() ? 'guard' : isAdmin() ? 'admin' : 'resident']();
    let pending = 0;
    if (isAdmin()) {
      pending = (await API.admin.users('pending').catch(() => [])).length;
      S.emgActive = (await API.emergencies.list().catch(() => [])).filter(e => e.status === 'active').length;
    }
    const bar = tabs.map(([k, l, i]) => `<button class="tab ${S.tab === k && !S.sub ? 'on' : ''}" data-act="tab" data-tab="${k}" ${S.tab === k ? 'aria-current="page"' : ''}>${ic(i)}${esc(l)}${k === 'approvals' && pending ? `<span class="tag tag-accent-2">${pending}</span>` : ''}${k === 'emergency' && S.emgActive ? `<span class="badge-red">${S.emgActive}</span>` : ''}</button>`).join('');
    const fab = !isAdmin() && !isGuard() && !S.sub && S.tab !== 'raise' ? `<button class="fab" data-act="quick" data-k="raise" aria-label="New request">${ic('plus')}</button>` : '';
    app.innerHTML = `<div class="phone">${HP.liveBadge()}<main class="screen" id="screen"></main>${fab}<nav class="tabbar ${tabs.length > 4 ? 'five' : tabs.length < 4 ? 'three' : ''}" aria-label="Main">${bar}</nav></div>`;
    try { await (S.sub ? SUB[S.sub] : SCREENS[S.tab])(); } catch (e) { $('#screen').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }
  const screen = h => { $('#screen').innerHTML = h; };

  // ---------- signed out
  // Sign-in/registration building blocks: icon inside the input, show/hide password toggle.
  const authField = (id, label, icon, input) => `<div class="field af"><label for="${id}">${label}</label><div class="af-wrap"><span class="af-ic">${ic(icon)}</span>${input}</div></div>`;
  const pwField = (login) => `<div class="field af"><label for="pw">Password${login ? '' : ' (8+ characters)'}</label><div class="af-wrap"><span class="af-ic">${ic('lock-key')}</span><input class="input" id="pw" name="password" type="password" required minlength="${login ? 1 : 8}" autocomplete="${login ? 'current-password' : 'new-password'}"><button type="button" class="af-eye" data-act="pwtoggle" aria-label="Show password" aria-pressed="false">${ic('eye')}</button></div></div>`;
  function authView() {
    const login = S.mode === 'login';
    const tiles = [['owner', 'key', 'Owner'], ['tenant', 'house-line', 'Tenant'], ['family', 'users', 'Family']]
      .map(([k, i, l]) => `<button type="button" class="type-tile ${S.regType === k ? 'on' : ''}" style="align-items:center" data-act="regtype" data-t="${k}">${ic(i)}<b style="font-size:14px">${l}</b></button>`).join('');
    app.innerHTML = `<div class="phone auth-phone am-auth"><div class="auth-top">${HP.logo(72, 'am-auth-logo')}<h1>${esc(SOCIETY.name)}</h1></div>
      <form id="authform" class="screen auth-sheet" novalidate>
      <h2>${login ? 'Welcome back' : 'Join'}</h2>
      ${login ? '' : `<div class="type-tiles" role="group" aria-label="I am a">${tiles}</div>
        ${authField('n', 'Full name', 'user', '<input class="input" id="n" name="name" required maxlength="100" autocomplete="name">')}
        <div class="two" style="grid-template-columns:1fr 1.4fr">${authField('f', 'Flat', 'house', '<input class="input" id="f" name="flat" required maxlength="20" placeholder="B-304">')}
        ${authField('p', 'Mobile', 'phone', '<input class="input" id="p" name="phone" maxlength="20" inputmode="tel" autocomplete="tel">')}</div>`}
      ${authField('e', 'Email', 'envelope-simple', '<input class="input" id="e" name="email" type="email" required autocomplete="username">')}
      ${pwField(login)}
      ${login ? '' : `<label class="consent sm"><input type="checkbox" name="consent" required>I consent to my details being stored (DPDP Act, 2023).</label>`}
      <p class="err" id="autherr" role="alert"></p>
      <button class="btn btn-primary btn-lg auth-go">${login ? 'Sign in' : 'Send for approval'}<span class="auth-spin" data-lottie="loader" aria-hidden="true"></span></button>
      <p class="am-switch">${login ? 'New here?' : 'Have an account?'} <button type="button" class="link-btn" data-act="mode">${login ? 'Join' : 'Sign in'}</button></p></form></div>`;
  }

  // ---------- resident + committee screens
  const SCREENS = {
    async home() { return isAdmin() ? SCREENS.dashboard() : SCREENS.residentHome(); },

    async residentHome() {
      const gateOn = feat('gate') && can('gate.pass'), hhOn = can('household.manage') && S.me.resident_type === 'owner', noteOn = feat('notices') && can('notice.read');
      const [reqs, notices, passes, hh] = await Promise.all([API.requests.list(), noteOn ? API.notices.list().catch(() => []) : [], gateOn ? API.gate.passes().catch(() => []) : [], hhOn ? API.household.list().catch(() => []) : []]);
      const { open } = residentSummary(reqs, S.me, notices); S.idx = { reqs, notices };
      const chips = [['list-checks', 'Requests', 'requests', true], ['plus-circle', 'Raise', 'raise', can('request.create')], ['siren', 'Emergency', 'emergency', feat('emergency') && can('emergency.raise')],
        ['qr-code', 'Gate pass', 'gatepass', gateOn], ['users-three', 'Household', 'household', hhOn], ['address-book', 'Contacts', 'contacts-sub', feat('contacts') && can('contacts.read')], ['megaphone', 'Notices', 'notices-sub', noteOn]];
      const sorted = [...reqs].sort((x, y) => isOpen(y) - isOpen(x) || y.id - x.id).slice(0, 8);
      const secs = [
        amSection('Your requests', sorted.map((r, i) => amReq(r, i)).join('') + (can('request.create') ? amCard('plus-circle', 'Raise a request', 'Takes a minute', 'quick', 'raise', sorted.length) : '')),
        noteOn && notices.length ? amSection('Notices', notices.slice(0, 6).map((n, i) => amCard(noticeIcon(n), n.title, day(n.created_at), 'quick', 'notices-sub', i + 2)).join('')) : '',
        gateOn ? amSection('Visitors and passes', passes.slice(0, 6).map((p, i) => amCard('qr-code', p.visitor_name, stamp(p.valid_until), 'quick', 'gatepass', i + 1)).join('') + amCard('user-plus', 'Invite a visitor', 'New gate pass', 'quick', 'gatepass', 4)) : '',
        hhOn ? amSection('Household', hh.slice(0, 6).map((m, i) => amCard('user-circle', m.name, TYPE[m.resident_type] || '', 'quick', 'household', i + 3)).join('') + amCard('user-plus', 'Add someone', 'Family or tenant', 'quick', 'household', 5)) : ''].join('');
      screen(`${amHead(`${greet()}, ${firstName(S.me.name)}`, `${dateShort()} · ${S.me.flat}`, false)}${searchBox()}${amChips(chips)}
        <p class="am-sum"><b>${open.length}</b> open request${open.length === 1 ? '' : 's'}</p>${secs}`);
    },

    // ---------- gate: resident passes
    async gatepass() {
      const [passes, me] = await Promise.all([API.gate.passes().catch(() => []), API.gate.me().catch(() => null)]);
      S.gp.list = passes;
      const v = S.gp.view, c = S.gp.confirm;
      const now = new Date(), later = new Date(now.getTime() + 864e5);
      const inp = d => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);
      const qrCard = v ? `<div class="m-card gp-card"><div class="gp-qr">${HP.qrSvg(v.qr || 'HSP:' + v.token, 280)}</div>
        <span class="muted xs" style="text-align:center">${esc(v.visitor_name || '')}${v.purpose ? ' · ' + esc(v.purpose) : ''}</span>
        <div class="gp-code" aria-label="Pass code">${esc(v.code)}</div>
        <span class="muted sm" style="text-align:center">Valid ${esc(stamp(v.valid_from))} to ${esc(stamp(v.valid_until))}</span>
        <span style="align-self:center">${gpTag(v.status || 'active')}</span>
        <button class="btn btn-primary btn-lg" data-act="gpshare">${ic('share-network')}Share</button>
        ${(v.status || 'active') === 'active' ? (c === 'cancel' ? `<div class="callout col" style="gap:8px"><b class="sm">Cancel this pass? The visitor will be turned away.</b><div class="two"><button class="btn btn-primary" data-act="gpcancelyes">Yes, cancel</button><button class="btn btn-secondary" data-act="gpno">Keep it</button></div></div>`
          : `<button class="btn btn-secondary btn-lg" data-act="gpcancelask">${ic('x-circle')}Cancel pass</button>`) : ''}
        <button class="link-btn" style="text-align:center;min-height:44px" data-act="gpclose">Close</button></div>` : '';
      const meCard = me ? `<div class="m-card gp-card"><h3>My gate QR</h3><div class="gp-qr">${HP.qrSvg(me.qr || 'HSP:' + me.token, 240)}</div>
        <p class="muted sm" style="margin:0;text-align:center">Show this at the gate to walk in. The same code is what is written on an NFC tag, so a tag can be tapped instead.</p>
        ${c === 'rotate' ? `<div class="callout col" style="gap:8px"><b class="sm">Reset your QR? The old QR and any NFC tag stop working.</b><div class="two"><button class="btn btn-primary" data-act="gprotyes">Yes, reset</button><button class="btn btn-secondary" data-act="gpno">Keep it</button></div></div>`
          : `<button class="btn btn-secondary btn-lg" data-act="gprotask">${ic('arrows-clockwise')}Reset my QR</button>`}</div>` : '';
      screen(`${back('Home', 'home')}<h2>Gate pass</h2>${qrCard}
        <form id="gpform" class="m-card col"><h3>Invite a visitor</h3><div class="field"><label for="gvn">Visitor name</label><input class="input" id="gvn" name="visitor_name" required maxlength="100"></div>
        <div class="field"><label for="gpu">Purpose (optional)</label><input class="input" id="gpu" name="purpose" maxlength="100" placeholder="e.g. Delivery, guest"></div>
        <div class="field"><label for="gvf">Valid from</label><input class="input" id="gvf" name="valid_from" type="datetime-local" required value="${inp(now)}"></div>
        <div class="field"><label for="gvu">Valid until</label><input class="input" id="gvu" name="valid_until" type="datetime-local" required value="${inp(later)}"></div>
        <p class="err" id="gperr" role="alert"></p><button class="btn btn-primary btn-lg">${ic('qr-code')}Create pass</button></form>
        <h3>Passes for Flat ${esc(S.me.flat)}</h3>${passes.map(p => `<button class="list-row m-card" style="grid-template-columns:40px minmax(0,1fr) auto;align-items:center" data-act="gpopen" data-id="${p.id}"><span class="tile">${ic('qr-code')}</span>
          <span class="col" style="gap:2px"><span class="list-title" style="font-size:15px">${esc(p.visitor_name)}</span><span class="muted xs">${esc(stamp(p.valid_from))} to ${esc(stamp(p.valid_until))}</span></span>${gpTag(p.status)}</button>`).join('') || '<p class="muted">No passes yet.</p>'}
        ${meCard}`);
    },

    // ---------- gate: guard / committee verify
    async gate() {
      const canScan = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.BarcodeDetector);
      screen(`${isAdmin() ? back('Dashboard', 'home') : ''}<h2>Gate</h2>
        <form id="gateform" class="col" style="gap:12px"><input class="input gate-code" id="gcode" name="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="000000" aria-label="6-digit code"><button class="btn btn-primary btn-lg gate-go">${ic('shield-check')}Verify</button></form>
        ${canScan ? `<button class="btn btn-secondary btn-lg" data-act="gscan">${ic('scan')}Scan QR</button><div id="gcam"></div>` : '<p class="muted sm" style="margin:0">QR scanning is not supported on this device. Type the 6-digit code instead.</p>'}
        <div id="gres" aria-live="assertive"></div>`);
      if (S.gRes) showRes(S.gRes, true);
      const i = $('#gcode'); if (i && !S.gRes) i.focus();
    },

    async gatelog() {
      const rows = await API.gate.log();
      screen(`${isAdmin() ? back('Dashboard', 'home') : ''}<h2>Gate log</h2>${rows.map(r => `<div class="m-card"><div class="row" style="flex-wrap:nowrap;justify-content:space-between;gap:8px"><span class="list-title" style="font-size:16px">${esc(r.subject || 'Unknown')}</span><span class="tag ${r.result === 'allowed' ? 'tag-accent' : 'tag-accent-2'}">${r.result === 'allowed' ? 'Allowed' : 'Denied'}</span></div>
        <span class="muted xs">${esc(stamp(r.created_at))}${r.flat ? ' · Flat ' + esc(r.flat) : ''}${r.guard_name ? ' · ' + esc(r.guard_name) : ''}</span>${r.result !== 'allowed' && r.reason ? `<span class="sm">${esc(reasonText(r.reason))}</span>` : ''}</div>`).join('') || '<p class="muted">No entries yet.</p>'}`);
    },

    async requests() {
      const reqs = (await API.requests.list()).sort((x, y) => isOpen(y) - isOpen(x) || y.id - x.id); // open work first
      if (S.selId) {
        const d = await API.requests.get(S.selId);
        const vendors = isAdmin() ? await API.vendors.list() : [];
        const next = { open: [], assigned: ['in_progress', 'closed'], in_progress: ['closed'], closed: [] }[d.status];
        const rate = d.can_rate ? `<div class="col callout" style="gap:var(--space-1)"><span class="list-title" style="font-size:16px">Rate the work to close it</span><div class="row" style="justify-content:space-between;gap:0;flex-wrap:nowrap">${stars('rate')}</div></div>`
          : d.status === 'closed' && !d.rating && !isAdmin() ? '<p class="callout sm" style="margin:0">Resolved. The flat owner rates the work to close it.</p>'
          : d.rating ? `<p class="row" style="gap:6px;margin:0">${ic('star')}You rated this <strong>${d.rating} of 5</strong>. Thank you.</p>` : '';
        const adm = isAdmin() && d.status !== 'closed' ? `<div class="m-card"><select class="input" id="vs" aria-label="Vendor">${vendorOpts(vendors, d.vendor_id)}</select><div class="two"><button class="btn btn-secondary" data-act="assign" data-id="${d.id}">Assign</button>
          ${next.map(s => `<button class="btn btn-primary" data-act="move" data-id="${d.id}" data-s="${s}">${s === 'closed' ? 'Mark resolved' : 'Start work'}</button>`).join('')}</div></div>` : '';
        return screen(`${back('Requests', 'requests')}<div class="m-photo">${d.has_photo ? `<img class="photo" alt="Photo attached by resident" src="${API.requests.photoUrl(d.id)}">` : photoSlot('No photo attached', 'camera')}</div>
          <span class="kicker">${rid(d)} · ${esc(catLabel(d.category))} · ${esc(d.flat)}</span><h3>${esc(d.title)}</h3><p class="sm" style="margin:0;white-space:pre-line">${esc(d.description)}</p>
          ${stepper(d, d.history, true)}${adm}${rate}`);
      }
      screen(`<h2>${isAdmin() ? 'Requests' : S.me.resident_type === 'family' ? 'Flat requests' : 'My requests'}</h2>${reqs.map(reqCard).join('') || '<p class="muted">Nothing here yet.</p>'}`);
    },

    async raise() {
      const tiles = CATS.map(([k, l, i]) => `<button type="button" class="cat ${S.cat === k ? 'on' : ''}" style="font-size:11px;padding:8px 0" data-act="cat" data-c="${k}" aria-pressed="${S.cat === k}">${ic(i)}${l}</button>`).join('');
      screen(`<h2>New request</h2><form id="raiseform" class="col" style="gap:var(--space-3);flex:1"><div class="cat-grid" style="grid-template-columns:repeat(3,minmax(0,1fr));gap:6px" role="group" aria-label="Category">${tiles}</div>
        <label class="drop" id="drop" style="height:200px">${ic('camera')}<span class="list-title" style="font-size:16px">Take or add a photo</span><span class="xs" id="pn">JPG, PNG or WebP, up to 5 MB</span><input type="file" id="photo" accept="image/jpeg,image/png,image/webp" capture="environment"></label>
        <div class="field"><label for="t">Short title</label><input class="input" id="t" name="title" required maxlength="120" placeholder="e.g. Bathroom tap dripping"></div>
        <div class="field"><label for="w">Where</label><input class="input" id="w" name="where" value="Flat ${esc(S.me.flat)}" maxlength="100"></div>
        <div class="field"><label for="d">Details (optional)</label><textarea class="input" id="d" name="description" maxlength="1800"></textarea></div>
        <button class="btn btn-primary btn-lg">${ic('paper-plane-tilt')}Submit request</button></form>`);
    },

    async household() {
      const ms = await API.household.list();
      const open = S.sub === 'add';
      const tiles = [['family', 'users', 'Family member'], ['tenant', 'house-line', 'Tenant']].map(([k, i, l]) => `<button type="button" class="type-tile ${S.rtype === k ? 'on' : ''}" style="align-items:center" data-act="rtype" data-t="${k}">${ic(i)}<b style="font-size:14px">${l}</b></button>`).join('');
      screen(`${back('Profile', 'profile')}<h2>Household</h2><span class="muted sm">Flat ${esc(S.me.flat)}</span>${ms.map((m, i) => `<div class="member" style="grid-template-columns:44px minmax(0,1fr);padding:12px;border-radius:20px"><span class="avatar ${i ? 'blue' : ''}" style="width:44px;height:44px">${esc(initials(m.name))}</span><span class="col" style="gap:2px"><span class="list-title" style="font-size:16px">${esc(m.name)}</span><span class="row xs" style="gap:6px">${esc(TYPE[m.resident_type] || '')}<span class="tag ${m.status === 'approved' ? 'tag-accent' : 'tag-accent-2'}">${m.status === 'approved' ? 'Active' : 'Pending approval'}</span></span></span></div>`).join('')}
        <form id="hhform" class="col"><h3>Add someone</h3><div class="type-tiles" style="grid-template-columns:repeat(2,minmax(0,1fr))">${tiles}</div>
        <div class="field"><label for="hn">Full name</label><input class="input" id="hn" name="name" required maxlength="100"></div><div class="field"><label for="hp">Mobile</label><input class="input" id="hp" name="phone" inputmode="tel" maxlength="20"></div>
        <div class="field"><label for="he">Email</label><input class="input" id="he" name="email" type="email" required></div><div class="field"><label for="hw">Temporary password (8+)</label><input class="input" id="hw" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
        <label class="consent sm"><input type="checkbox" name="consent" required>This person agrees to their details being stored (DPDP Act, 2023).</label><button class="btn btn-primary btn-lg">${ic('user-plus')}Send for approval</button></form>
        <button class="link-btn" style="text-align:center;min-height:44px" data-act="logout">Sign out</button>`);
      void open;
    },

    async lease() {
      const li = leaseInfo(await API.lease.get());
      screen(`<h2>Your lease</h2>${li ? `<div class="hero m-hero"><div class="soft sm" style="font-weight:600">Lease on ${esc(S.me.flat)}</div><div class="fig" style="font-size:36px;margin-top:6px">${li.left} days left</div><div class="soft sm" style="margin-top:4px">Ends ${esc(li.ends)}</div>
        <div style="height:6px;border-radius:6px;background:color-mix(in srgb,var(--color-bg) 22%,transparent);margin-top:12px;overflow:hidden"><span style="display:block;height:100%;width:${li.pct}%;background:var(--color-accent-300)"></span></div></div>
        <div class="soft-card" style="padding:4px 14px;border-radius:20px">${li.rows.map(([i, k, v]) => `<div class="row" style="flex-wrap:nowrap;padding:8px 0;gap:var(--space-2)">${ic(i).replace('<i ', '<i style="font-size:18px;color:var(--color-accent-700)" ')}<span class="col" style="gap:0"><span class="muted xs">${esc(k)}</span><span class="sm" style="font-weight:600">${esc(v)}</span></span></div>`).join('')}</div>`
        : '<p class="callout">No lease is on file yet. The committee adds it after verifying your rent agreement.</p>'}
        <button class="link-btn" style="text-align:center;min-height:44px" data-act="logout">Sign out</button>`);
    },

    async notices() {
      const ns = await API.notices.list();
      const form = isAdmin() ? `<form id="nform" class="m-card"><h3>Post a notice</h3><div class="field"><label for="nt">Headline</label><input class="input" id="nt" name="title" required maxlength="150"></div>
        <div class="field"><label for="nb">Details</label><textarea class="input" id="nb" name="body" required maxlength="5000"></textarea></div><button class="btn btn-primary btn-lg">${ic('megaphone')}Post and notify</button></form>` : '';
      screen(`<h2>Notices</h2>${form}${ns.map(noticeCard).join('') || '<p class="muted">No notices.</p>'}${isAdmin() ? `<button class="link-btn" style="text-align:center;min-height:44px" data-act="logout">Sign out</button>` : ''}`);
    },

    async approvals() {
      const us = (await API.admin.users()).filter(u => u.role !== 'admin');
      const rows = [...us.filter(u => u.status === 'pending'), ...us.filter(u => u.status !== 'pending').slice(0, 6)];
      screen(`<h2>Approvals</h2><span class="muted sm">Check against the flat register before approving.</span>${rows.map(u => `<div class="m-card"><div class="row" style="flex-wrap:nowrap;gap:10px"><span class="avatar light" style="width:44px;height:44px">${esc(initials(u.name))}</span>
        <span class="col" style="gap:0"><span class="list-title" style="font-size:16px">${esc(u.name)}</span><span class="muted xs">${esc(u.flat)} · ${esc(TYPE[u.resident_type] || '')} · ${esc(day(u.created_at))}</span></span></div>
        ${u.status === 'pending' ? `<div class="two"><button class="btn btn-primary" data-act="decide" data-id="${u.id}" data-d="approve">Approve</button><button class="btn btn-secondary" data-act="decide" data-id="${u.id}" data-d="reject">Reject</button></div>`
          : `<span class="tag ${u.status === 'approved' ? 'tag-accent' : 'tag-accent-2'}" style="align-self:flex-start">${u.status === 'approved' ? 'Approved' : 'Rejected'}</span>`}</div>`).join('') || '<p class="muted">No residents yet.</p>'}`);
    },

    async dashboard() {
      const [s, reqs, notices, emg, pend] = await Promise.all([API.admin.stats(), API.requests.list(), API.notices.list().catch(() => []), API.emergencies.list().catch(() => []), API.admin.users('pending').catch(() => [])]);
      S.idx = { reqs, notices }; const act = emg.filter(e => e.status === 'active');
      const a = adminSummary(reqs, s), unList = a.open.filter(r => !r.vendor_id), un = unList.length;
      const chips = [['user-check', 'Approvals', 'approvals', true], ['list-checks', 'Requests', 'requests', true], ['siren', 'Emergencies', 'emergency', feat('emergency')], ['megaphone', 'Notices', 'notices', feat('notices')],
        ['shield-check', 'Gate', 'gate', feat('gate')], ['gear-six', 'Settings', 'settings-sub', true]];
      const big = (i, n, l, tab, g) => `<button class="am-card am-big g${g}" data-act="${tab.endsWith('-sub') ? 'quick' : 'tab'}" data-tab="${tab}" data-k="${tab}"><span class="am-art">${ic(i)}</span><span class="am-num">${esc(n)}</span><span class="am-t">${esc(l)}</span></button>`;
      const attn = big('user-check', pend.length, 'Pending approvals', 'approvals', 1) + big('siren', act.length, 'Active emergencies', 'emergency', 4) + big('user-gear', un, 'Unassigned requests', 'requests', 3);
      const week = big('clipboard-text', a.open.length, 'Open requests', 'requests', 2) + big('timer', a.overdue, 'Past 48 hours', 'requests', 4) + big('star', s.avg_rating ? s.avg_rating.toFixed(1) : '-', 'Average rating', 'requests', 5) + big('megaphone', s.notices_30d, 'Notices, 30 days', 'notices', 6);
      const recent = [...reqs].sort((x, y) => y.id - x.id).slice(0, 8).map((r, i) => amReq(r, i)).join('');
      screen(`${amHead(`${greet()}, ${firstName(S.me.name)}`, `${dateShort()} · Committee`, true)}${searchBox()}${amChips(chips)}
        ${amSection('Needs your attention', attn)}${amSection('This week', week)}${recent ? amSection('Recent activity', recent) : ''}
        <div class="two"><button class="btn btn-secondary btn-lg" data-act="quick" data-k="gatelog">${ic('clock-counter-clockwise')}Gate log</button><button class="btn btn-secondary btn-lg" data-act="quick" data-k="leases-sub">${ic('file-text')}Leases</button></div>
        <button class="link-btn" style="text-align:center;min-height:44px" data-act="logout">Sign out</button>`);
    },

    async alerts() { return SUB.alerts(!isAdmin()); },

    async emergency() {
      const list = await API.emergencies.list().catch(() => []);
      if (isAdmin()) {
        const sorted = [...list.filter(e => e.status === 'active'), ...list.filter(e => e.status !== 'active')];
        return screen(`<h2>Emergencies</h2>${S.emgActive ? `<div class="emg-banner static">${ic('siren')}<b>${S.emgActive} active</b></div>` : '<p class="callout">No active emergencies.</p>'}${sorted.map(e => emgRow(e, true)).join('')}`);
      }
      const sel = S.sheet ? emgType(S.sheet) : null;
      const tiles = EMERGENCY_TYPES.map(([k, i, l]) => `<button class="emg-tile" data-act="emgpick" data-k="${esc(k)}"><span class="tile lg">${ic(i)}</span><b>${esc(l)}</b></button>`).join('');
      const sheet = sel ? `<div class="sheet-back" data-act="emgcancel"></div><form id="emgform" class="sheet" role="dialog" aria-label="Confirm emergency alert"><span class="tile lg" style="align-self:center">${ic(sel[1])}</span><h3 style="text-align:center">Send ${esc(sel[2])} alert?</h3>
        <p class="muted sm" style="text-align:center;margin:0">The committee and security will be told it is from Flat ${esc(S.me.flat)}.</p>
        <div class="field"><label for="enote">Note (optional)</label><textarea class="input" id="enote" name="note" maxlength="300" style="min-height:80px">${esc(S.note)}</textarea></div>
        <button class="btn btn-primary btn-lg emg-send">${ic('paper-plane-tilt')}Send alert</button><button type="button" class="btn btn-secondary btn-lg" data-act="emgcancel">Cancel</button></form>` : '';
      screen(`<h2>Emergency</h2><p class="muted sm" style="margin:0">Tap what is happening. The committee is alerted straight away.</p><div class="emg-grid">${tiles}</div>
        <h3>Recent alerts for your flat</h3>${list.map(e => emgRow(e, false)).join('') || '<p class="muted">No alerts raised.</p>'}${sheet}`);
    },

    async profile() {
      if (isGuard()) return screen(`<div class="col" style="align-items:center;gap:6px;text-align:center"><span class="avatar" style="width:84px;height:84px;font-size:30px">${esc(initials(S.me.name))}</span><h2 style="margin:0">${esc(S.me.name)}</h2><span class="muted sm">Security guard</span></div>
        <button class="btn btn-primary btn-lg" data-act="logout">${ic('sign-out')}Sign out</button>`);
      const m = S.me, ms = await API.household.list().catch(() => []);
      const pct = Math.round([m.name, m.phone, m.flat, m.email].filter(v => v && String(v).trim()).length / 4 * 100);
      const row = (i, k, v) => `<div class="row" style="flex-wrap:nowrap;padding:8px 0;gap:var(--space-2)">${ic(i)}<span class="col" style="gap:0"><span class="muted xs">${k}</span><span class="sm" style="font-weight:600">${v ? esc(v) : 'Not added'}</span></span></div>`;
      const f = S.pf === 'edit' ? `<form id="profform" class="m-card"><div class="field"><label for="pn1">Full name</label><input class="input" id="pn1" name="name" required maxlength="100" value="${esc(m.name)}" autocomplete="name"></div>
        <div class="field"><label for="pp1">Mobile</label><input class="input" id="pp1" name="phone" maxlength="20" inputmode="tel" value="${esc(m.phone || '')}" autocomplete="tel"></div><p class="err" id="perr" role="alert"></p>
        <div class="two"><button class="btn btn-primary btn-lg">Save</button><button type="button" class="btn btn-secondary btn-lg" data-act="pform" data-f="">Cancel</button></div></form>` : '';
      const pw = S.pf === 'pw' ? `<form id="pwform" class="m-card"><div class="field"><label for="pc">Current password</label><input class="input" id="pc" name="current" type="password" required autocomplete="current-password"></div>
        <div class="field"><label for="pnw">New password (8+ characters)</label><input class="input" id="pnw" name="next" type="password" required minlength="8" autocomplete="new-password"></div><p class="err" id="perr" role="alert"></p>
        <div class="two"><button class="btn btn-primary btn-lg">Update</button><button type="button" class="btn btn-secondary btn-lg" data-act="pform" data-f="">Cancel</button></div></form>` : '';
      screen(`<div class="col" style="align-items:center;gap:6px;text-align:center"><span class="avatar" style="width:84px;height:84px;font-size:30px">${esc(initials(m.name))}</span><h2 style="margin:0">${esc(m.name)}</h2><span class="muted sm">Flat ${esc(m.flat)} · ${esc(TYPE[m.resident_type] || '')}</span></div>
        <div class="m-card"><b class="sm">Profile ${pct}% complete</b><div class="pbar" role="progressbar" aria-valuenow="${pct}" aria-valuemin="0" aria-valuemax="100"><span style="width:${pct}%"></span></div>${pct < 100 ? '<span class="muted xs">Add the missing details below.</span>' : ''}</div>
        <div class="soft-card" style="padding:4px 14px;border-radius:20px">${row('user', 'Name', m.name)}${row('house', 'Flat', m.flat)}${row('identification-badge', 'Resident type', TYPE[m.resident_type] || '')}${row('phone', 'Phone', m.phone)}${row('envelope-simple', 'Email', m.email)}</div>
        ${f || '<button class="btn btn-secondary btn-lg" data-act="pform" data-f="edit">' + ic('pencil-simple') + 'Edit details</button>'}
        <div class="m-card"><h3>Household</h3>${ms.map(x => `<div class="row" style="flex-wrap:nowrap;gap:10px"><span class="avatar blue" style="width:36px;height:36px;font-size:13px">${esc(initials(x.name))}</span><span class="sm">${esc(x.name)} · ${esc(TYPE[x.resident_type] || '')}</span></div>`).join('') || '<span class="muted sm">No other members yet.</span>'}
          <button class="btn btn-secondary btn-lg" data-act="tab" data-tab="household">${ic('users-three')}Manage household</button></div>
        ${isAdmin() ? `<button class="btn btn-secondary btn-lg" data-act="quick" data-k="settings-sub">${ic('gear-six')}Settings</button>` : ''}
        <button class="btn btn-secondary btn-lg" data-act="quick" data-k="contacts-sub">${ic('address-book')}Who to call</button>
        ${pw || '<button class="btn btn-secondary btn-lg" data-act="pform" data-f="pw">' + ic('lock-key') + 'Change password</button>'}
        <button class="btn btn-primary btn-lg" data-act="logout">${ic('sign-out')}Sign out</button>`);
    },
  };
  // committee: the Requests tab is the assignment queue; reuse the same list/detail screen.
  const SUB = {
    async alerts(tab) {
      const ns = await API.notifications.list();
      screen(`${tab === true ? '' : back('Back', 'home')}<h2>Alerts</h2>${ns.map(n => `<div class="m-card"><span class="sm">${esc(n.message)}</span><span class="muted xs">${n.is_read ? '' : '<span class="tag tag-accent-2">New</span> '}${esc(stamp(n.created_at))}</span></div>`).join('') || '<p class="muted">No alerts.</p>'}`);
      await API.notifications.markRead();
    },
    async 'leases-sub'() {
      const ts = await API.admin.leases();
      screen(`${back('Dashboard', 'home')}<h2>Tenant leases</h2>${ts.map(t => { const li = leaseInfo(t.end_date ? t : null);
        return `<button class="list-row m-card" style="grid-template-columns:44px minmax(0,1fr)" data-act="leaseopen" data-id="${t.user_id}"><span class="avatar light" style="width:44px;height:44px">${esc(initials(t.name))}</span>
          <span class="col" style="gap:2px"><span class="list-title" style="font-size:16px">${esc(t.name)}</span><span class="muted xs">Flat ${esc(t.flat)}</span>
          <span style="align-self:flex-start">${li ? `<span class="tag ${li.left < 60 ? 'tag-accent-2' : 'tag-accent'}">${li.left} days left</span>` : '<span class="tag tag-neutral">No lease on file</span>'}</span></span></button>`; }).join('') || '<p class="callout">No approved tenants yet.</p>'}`);
    },
    async 'lease-edit'() {
      const t = (await API.admin.leases()).find(x => x.user_id === S.leaseId);
      if (!t) return go('home', null, 'leases-sub');
      const f = (id, label, name, val, extra = '') => `<div class="field"><label for="${id}">${label}</label><input class="input" id="${id}" name="${name}" value="${esc(val || '')}" ${extra}></div>`;
      screen(`<button class="back" data-act="leasesback">${ic('caret-left')}Leases</button><h3>${esc(t.name)} · ${esc(t.flat)}</h3>
        <form id="leaseform" class="col" data-id="${t.user_id}">${f('ls', 'Lease starts', 'start_date', t.start_date, 'type="date" required')}${f('le', 'Lease ends', 'end_date', t.end_date, 'type="date" required')}
        ${f('lo', 'Flat owner', 'owner_name', t.owner_name, 'maxlength="100"')}${f('lp', 'Owner phone', 'owner_phone', t.owner_phone, 'maxlength="20" inputmode="tel"')}
        ${f('lv', 'Police verified on', 'police_verified_on', t.police_verified_on, 'type="date"')}${f('la', 'Rent agreement', 'agreement', t.agreement, 'maxlength="200"')}${f('lk', 'Parking', 'parking', t.parking, 'maxlength="100"')}
        <button class="btn btn-primary btn-lg">${ic('floppy-disk')}Save lease</button></form>`);
    },
    async 'settings-sub'() {
      const row = (i, t, d, sub) => `<button class="am-list" data-act="quick" data-k="${sub}"><span class="am-li">${ic(i)}</span><span class="col grow" style="gap:0;text-align:left"><b>${t}</b><span class="muted sm">${d}</span></span>${ic('caret-right')}</button>`;
      screen(`${back('Dashboard', 'home')}<h1 class="am-h1">Settings</h1>${row('buildings', 'General', 'Society name and type', 'set-general')}${row('shield-check', 'Access control', 'Who can do what', 'set-access')}
        ${row('users-three', 'Users', 'Search, edit, suspend', 'set-users')}${row('toggle-right', 'Features', 'Switch parts of the app on or off', 'set-features')}${row('shield-star', 'Guards', 'Security staff accounts', 'set-guards')}`);
    },
    async 'set-general'() {
      const st = await API.admin.settings();
      screen(`${setBack()}<h1 class="am-h1">General</h1><form id="setform" class="m-card am-form"><div class="field"><label for="sn">Society name</label><input class="input" id="sn" name="society_name" required maxlength="100" value="${esc(st.society_name || SOCIETY.name)}"></div>
        <div class="field"><label for="sk">Society type</label><input class="input" id="sk" name="society_kind" maxlength="100" value="${esc(st.society_kind || SOCIETY.kind)}"></div><p class="err" id="serr" role="alert"></p><button class="btn btn-primary btn-lg">Save</button></form>`);
    },
    async 'set-access'() {
      const ac = await API.admin.access(); S.set.access = ac; S.set.matrix = JSON.parse(JSON.stringify(ac.matrix || {}));
      const roles = ac.roles || ['owner', 'tenant', 'family'];
      screen(`${setBack()}<h1 class="am-h1">Access control</h1><div class="m-card am-form">${(ac.permissions || []).map(p => `<div class="am-perm"><b>${esc(p.label)}</b><div class="am-sws">${roles.map(r => `<div class="col" style="gap:2px;align-items:center"><span class="muted xs">${esc(TYPE[r] || r)}</span>${swBtn(!!(S.set.matrix[r] || {})[p.key], 'mtgl', `data-r="${esc(r)}" data-p="${esc(p.key)}"`, `${p.label}: ${TYPE[r] || r}`)}</div>`).join('')}</div></div>`).join('')}
        <p class="err" id="serr" role="alert"></p><button class="btn btn-primary btn-lg" data-act="accsave">Save access</button></div>`);
    },
    async 'set-features'() {
      const st = await API.admin.settings(); S.set.features = { emergency: true, gate: true, contacts: true, notices: true, ...(st.features || {}) };
      const L = { emergency: ['siren', 'Emergency alerts'], gate: ['shield-check', 'Gate passes'], contacts: ['address-book', 'Society contacts'], notices: ['megaphone', 'Notices'] };
      screen(`${setBack()}<h1 class="am-h1">Features</h1><div class="m-card am-form">${Object.keys(L).map(k => `<div class="am-perm am-frow"><span class="am-li">${ic(L[k][0])}</span><b class="grow">${L[k][1]}</b>${swBtn(S.set.features[k] !== false, 'ftgl', `data-f="${k}"`, L[k][1])}</div>`).join('')}
        <p class="err" id="serr" role="alert"></p><button class="btn btn-primary btn-lg" data-act="featsave">Save features</button></div>`);
    },
    async 'set-users'() {
      S.set.users = await API.admin.allUsers({}); S.set.q = ''; S.set.open = null; S.set.confirm = null; S.set.reset = false;
      screen(`${setBack()}<h1 class="am-h1">Users</h1><div class="m-search am-search"><span class="m-search-ic">${ic('magnifying-glass')}</span><input class="input" id="us" type="search" placeholder="Search name, flat or email" autocomplete="off" aria-label="Search users"></div><p class="err" id="serr" role="alert"></p><div id="ulist" class="col" style="gap:12px"></div>`);
      drawUsers();
    },
    async 'set-guards'() {
      S.set.guards = await API.gate.guards(); S.set.gconfirm = null;
      screen(`${setBack()}<h1 class="am-h1">Guards</h1><div id="glist" class="col" style="gap:12px"></div><form id="gform" class="m-card am-form"><h3>Add a guard</h3><div class="field"><label for="gn">Name</label><input class="input" id="gn" name="name" required maxlength="100"></div>
        <div class="field"><label for="ge">Email</label><input class="input" id="ge" name="email" type="email" required autocomplete="off"></div><div class="field"><label for="gw">Password (8+)</label><input class="input" id="gw" name="password" type="password" minlength="8" required autocomplete="new-password"></div>
        <p class="err" id="serr" role="alert"></p><button class="btn btn-primary btn-lg">${ic('user-plus')}Add guard</button></form>`);
      drawGuards();
    },
    async 'notices-sub'() { const ns = await API.notices.list(); screen(`${back('Home', 'home')}<h2>Notices</h2>${ns.map(noticeCard).join('') || '<p class="muted">No notices.</p>'}`); },
    async 'contacts-sub'() {
      const CONTACTS = (await API.contacts.list().catch(() => [])).map(c => [c.icon || 'phone', c.name, c.role, c.phone || '']);
      screen(`${back('Back', isAdmin() ? 'home' : 'profile')}<h2>Who to call</h2>${CONTACTS.length ? CONTACTS.map(([i, n, r, p]) => `<a class="member" style="grid-template-columns:48px minmax(0,1fr);text-decoration:none;color:inherit;border-radius:20px" href="tel:${esc(p.replace(/[^+\d]/g, ''))}"><span class="tile lg" style="width:48px;height:48px;border-radius:50%">${ic(i)}</span><span class="col" style="gap:0"><span class="list-title" style="font-size:16px">${esc(n)}</span><span class="muted xs">${esc(r)}</span><span class="sm" style="font-weight:600;color:var(--color-accent-700)">${esc(p)}</span></span></a>`).join('') : '<p class="muted">The committee has not added any contacts yet.</p>'}`);
    },
  };

  // ---------- settings helpers
  const setBack = () => `<button class="back" data-act="quick" data-k="settings-sub">${ic('caret-left')}Settings</button>`;
  const swBtn = (on, act, attrs, label) => `<button type="button" class="am-sw ${on ? 'on' : ''}" role="switch" aria-checked="${on}" aria-label="${esc(label)}" data-act="${act}" ${attrs}><span class="am-knob"></span><span class="am-st">${on ? 'On' : 'Off'}</span></button>`;
  const setErr = m => { const e = $('#serr'); if (e) e.textContent = m || ''; };
  const trySet = async fn => { setErr(''); try { await fn(); } catch (x) { setErr(x.message); toast(x.message); } };
  function drawUsers() {
    const box = $('#ulist'); if (!box) return;
    const q = S.set.q.trim().toLowerCase();
    const us = S.set.users.filter(u => !q || [u.name, u.flat, u.email].some(v => (v || '').toLowerCase().includes(q)));
    box.innerHTML = us.map(u => {
      const o = S.set.open === u.id, sus = u.status === 'suspended';
      const types = ['owner', 'tenant', 'family'].map(t => `<button type="button" class="am-seg ${u.resident_type === t ? 'on' : ''}" data-act="utype" data-id="${u.id}" data-t="${t}">${esc(TYPE[t])}</button>`).join('');
      const more = o ? `<div class="am-more"><div class="am-segs" role="group" aria-label="Resident type">${types}</div>
        <div class="two"><button class="btn btn-secondary" data-act="usus" data-id="${u.id}">${sus ? 'Reactivate' : 'Suspend'}</button><button class="btn btn-secondary" data-act="ureset" data-id="${u.id}">Reset password</button></div>
        ${S.set.reset ? `<div class="am-inline"><input class="input" id="rp" type="text" minlength="8" placeholder="New password (8+)" autocomplete="off" aria-label="New password"><button class="btn btn-primary" data-act="ursave" data-id="${u.id}">Set</button></div>` : ''}
        ${S.set.confirm === u.id ? `<div class="callout col" style="gap:8px"><b class="sm">Remove ${esc(u.name)}? This cannot be undone.</b><div class="two"><button class="btn btn-primary" data-act="urmyes" data-id="${u.id}">Yes, remove</button><button class="btn btn-secondary" data-act="urmno">Keep</button></div></div>` : `<button class="btn btn-secondary" data-act="urmask" data-id="${u.id}">${ic('trash')}Remove</button>`}</div>` : '';
      return `<div class="m-card am-user"><button class="am-urow" data-act="uopen" data-id="${u.id}" aria-expanded="${o}"><span class="avatar light" style="width:44px;height:44px">${esc(initials(u.name))}</span><span class="col grow" style="gap:0;text-align:left"><b>${esc(u.name)}</b><span class="muted xs">${esc(u.flat || '')} · ${esc(TYPE[u.resident_type] || u.role || '')}</span></span><span class="tag ${u.status === 'approved' ? 'tag-accent' : 'tag-accent-2'}">${esc(u.status)}</span></button>${more}</div>`;
    }).join('') || '<p class="muted">No users found.</p>';
  }
  function drawGuards() {
    const box = $('#glist'); if (!box) return;
    box.innerHTML = S.set.guards.map(g => `<div class="m-card"><div class="row" style="flex-wrap:nowrap;gap:10px"><span class="avatar light" style="width:44px;height:44px">${esc(initials(g.name))}</span><span class="col grow" style="gap:0"><b>${esc(g.name)}</b><span class="muted xs">${esc(g.email || '')}</span></span></div>
      ${S.set.gconfirm === g.id ? `<div class="callout col" style="gap:8px"><b class="sm">Remove ${esc(g.name)}?</b><div class="two"><button class="btn btn-primary" data-act="grmyes" data-id="${g.id}">Yes, remove</button><button class="btn btn-secondary" data-act="grmno">Keep</button></div></div>` : `<button class="btn btn-secondary" data-act="grmask" data-id="${g.id}">${ic('trash')}Remove</button>`}</div>`).join('') || '<p class="muted">No guards yet.</p>';
  }
  const userById = id => S.set.users.find(u => String(u.id) === String(id));

  // ---------- gate helpers
  const gpTag = st => `<span class="tag ${st === 'active' ? 'tag-accent' : 'tag-neutral'}">${esc({ active: 'Active', used: 'Used', cancelled: 'Cancelled', expired: 'Expired' }[st] || st)}</span>`;
  const REASONS = { expired: 'This pass has expired.', used: 'This pass was already used.', cancelled: 'This pass was cancelled by the resident.', not_found: 'Code not recognised.', unknown: 'Code not recognised.', invalid: 'Code not recognised.', not_yet_valid: 'This pass is not valid yet.', inactive: 'This resident is not active.' };
  const reasonText = r => REASONS[r] || (r ? String(r).replace(/_/g, ' ').replace(/^./, c => c.toUpperCase()) : 'Not allowed.');
  let resTimer = null, cam = null;
  function showRes(r, quiet) {
    const box = $('#gres'); if (!box) return;
    const ok = r.result === 'allowed';
    box.innerHTML = `<div class="gate-res ${ok ? 'ok' : 'no'}" role="status"><b class="gate-big">${ok ? 'ALLOWED' : 'DENIED'}</b>${ok
      ? `<span class="gate-name">${esc(r.name || '')}</span><span>${r.flat ? 'Flat ' + esc(r.flat) : ''}</span>${r.purpose ? `<span>${esc(r.purpose)}</span>` : ''}${r.kind === 'resident' ? '<span>Resident</span>' : ''}`
      : `<span class="gate-name">${esc(reasonText(r.reason))}</span>${r.name ? `<span>${esc(r.name)}${r.flat ? ', Flat ' + esc(r.flat) : ''}</span>` : ''}`}</div>`;
    if (!quiet && navigator.vibrate) { try { navigator.vibrate(ok ? 150 : [120, 80, 120]); } catch { /* ignore */ } }
    clearTimeout(resTimer);
    resTimer = setTimeout(() => { S.gRes = null; const b = $('#gres'); if (b) b.innerHTML = ''; const i = $('#gcode'); if (i) i.focus(); }, 8000);
  }
  async function doVerify(body) {
    let r;
    try { r = await API.gate.verify(body); } catch (x) { r = { result: 'denied', reason: x.message }; }
    S.gRes = r; showRes(r);
    const i = $('#gcode'); if (i) { i.value = ''; i.focus(); }
  }
  function stopScan() {
    if (!cam) return;
    clearTimeout(cam.t); if (cam.stream) cam.stream.getTracks().forEach(t => t.stop());
    cam = null; const b = $('#gcam'); if (b) b.innerHTML = '';
  }
  async function startScan() {
    if (cam) return stopScan();
    const box = $('#gcam'); if (!box) return;
    const me = cam = { stream: null, t: 0 };
    try {
      me.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
      if (cam !== me) return me.stream.getTracks().forEach(t => t.stop());
      const v = document.createElement('video'); v.setAttribute('playsinline', ''); v.muted = true; v.className = 'gate-cam'; v.srcObject = me.stream; box.appendChild(v); await v.play();
      const det = new BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (cam !== me) return;
        try { const f = await det.detect(v); if (f.length && f[0].rawValue) { stopScan(); return doVerify({ token: f[0].rawValue }); } } catch { /* keep scanning */ }
        if (cam === me) me.t = setTimeout(tick, 250);
      };
      tick();
    } catch { stopScan(); toast('Camera not available. Type the code instead.'); }
  }
  document.addEventListener('visibilitychange', () => { if (document.hidden) stopScan(); });

  // ---------- events
  const flipSw = (el, on) => { el.classList.toggle('on', on); el.setAttribute('aria-checked', String(on)); el.querySelector('.am-st').textContent = on ? 'On' : 'Off'; };
  const ACT = {
    gscan: () => startScan(),
    mtgl: el => { const m = S.set.matrix, r = el.dataset.r, p = el.dataset.p; m[r] = m[r] || {}; m[r][p] = !m[r][p]; flipSw(el, m[r][p]); },
    ftgl: el => { const f = el.dataset.f; S.set.features[f] = S.set.features[f] === false; flipSw(el, S.set.features[f]); },
    accsave: () => trySet(async () => { await API.admin.setAccess(S.set.matrix); toast('Access saved'); }),
    featsave: () => trySet(async () => { await API.admin.setSettings({ features: S.set.features }); S.me.features = { ...(S.me.features || {}), ...S.set.features }; toast('Features saved'); }),
    uopen: el => { const id = Number(el.dataset.id); S.set.open = S.set.open === id ? null : id; S.set.confirm = null; S.set.reset = false; drawUsers(); },
    utype: el => trySet(async () => { await API.admin.patchUser(el.dataset.id, { resident_type: el.dataset.t }); userById(el.dataset.id).resident_type = el.dataset.t; toast('Type changed'); drawUsers(); }),
    usus: el => trySet(async () => { const u = userById(el.dataset.id), st = u.status === 'suspended' ? 'approved' : 'suspended'; await API.admin.patchUser(u.id, { status: st }); u.status = st; toast(st === 'suspended' ? 'Suspended' : 'Reactivated'); drawUsers(); }),
    ureset: () => { S.set.reset = !S.set.reset; drawUsers(); const i = $('#rp'); if (i) i.focus(); },
    ursave: el => trySet(async () => { const v = ($('#rp') || {}).value || ''; if (v.length < 8) throw new Error('Password must be at least 8 characters.'); await API.admin.resetPassword(el.dataset.id, v); S.set.reset = false; toast('Password reset'); drawUsers(); }),
    urmask: el => { S.set.confirm = Number(el.dataset.id); drawUsers(); },
    urmno: () => { S.set.confirm = null; drawUsers(); },
    urmyes: el => trySet(async () => { await API.admin.removeUser(el.dataset.id); S.set.users = S.set.users.filter(u => String(u.id) !== el.dataset.id); S.set.open = null; S.set.confirm = null; toast('User removed'); drawUsers(); }),
    grmask: el => { S.set.gconfirm = Number(el.dataset.id); drawGuards(); },
    grmno: () => { S.set.gconfirm = null; drawGuards(); },
    grmyes: el => trySet(async () => { await API.gate.removeGuard(el.dataset.id); S.set.guards = S.set.guards.filter(g => String(g.id) !== el.dataset.id); S.set.gconfirm = null; toast('Guard removed'); drawGuards(); }),
    gpopen: el => { const p = (S.gp.list || []).find(x => String(x.id) === el.dataset.id); if (p) { S.gp.view = p; S.gp.confirm = null; render(); window.scrollTo(0, 0); } },
    gpclose: () => { S.gp.view = null; S.gp.confirm = null; render(); },
    gpcancelask: () => { S.gp.confirm = 'cancel'; render(); },
    gprotask: () => { S.gp.confirm = 'rotate'; render(); },
    gpno: () => { S.gp.confirm = null; render(); },
    gpcancelyes: async () => { await API.gate.cancel(S.gp.view.id); S.gp.view = { ...S.gp.view, status: 'cancelled' }; S.gp.confirm = null; toast('Pass cancelled'); render(); },
    gprotyes: async () => { await API.gate.rotate(); S.gp.confirm = null; toast('Your gate QR was reset'); render(); },
    gpshare: async () => {
      const v = S.gp.view, text = `Gate pass for ${v.visitor_name} at ${SOCIETY.name}, Flat ${S.me.flat}. Code ${v.code}. Valid until ${stamp(v.valid_until)}.`;
      if (navigator.share) { try { await navigator.share({ title: 'Gate pass', text }); } catch { /* cancelled */ } return; }
      try { await navigator.clipboard.writeText(text); toast('Pass details copied'); } catch { toast('Could not copy. Read the code out instead.'); }
    },
    tab: el => el.dataset.tab === 'settings-sub' ? go('home', null, 'settings-sub') : (el.dataset.tab === 'alerts' && isAdmin() ? go(S.tab, null, 'alerts') : go(el.dataset.tab)),
    emgpick: el => { S.sheet = el.dataset.k; S.note = ''; render(); },
    emgcancel: () => { S.sheet = null; S.note = ''; render(); },
    emgresolve: async el => { await API.emergencies.resolve(el.dataset.id); toast('Marked resolved'); render(); },
    pform: el => { S.pf = el.dataset.f || null; render(); },
    quick: el => (el.dataset.k.endsWith('-sub') || el.dataset.k.startsWith('set-') ? go('home', null, el.dataset.k) : go(el.dataset.k)),
    leaseopen: el => { S.leaseId = Number(el.dataset.id); go('home', null, 'lease-edit'); },
    leasesback: () => go('home', null, 'leases-sub'),
    open: el => go('requests', Number(el.dataset.id)),
    logout: async () => { await API.auth.logout(); S.me = null; S.mode = 'login'; S.tab = 'home'; S.sub = null; S.pf = null; S.sheet = null; render(); },
    mode: el => { if (el && el.getAttribute('role') === 'tab' && el.classList.contains('on')) return; S.mode = S.mode === 'login' ? 'join' : 'login'; render(); },
    pwtoggle: el => { const i = document.getElementById('pw'); if (!i) return; const show = i.type === 'password'; i.type = show ? 'text' : 'password'; el.setAttribute('aria-pressed', String(show)); el.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); el.innerHTML = ic(show ? 'eye-slash' : 'eye'); i.focus(); },
    regtype: el => { S.regType = el.dataset.t; document.querySelectorAll('[data-act=regtype]').forEach(b => b.classList.toggle('on', b === el)); },
    rtype: el => { S.rtype = el.dataset.t; document.querySelectorAll('[data-act=rtype]').forEach(b => b.classList.toggle('on', b === el)); },
    cat: el => { S.cat = el.dataset.c; document.querySelectorAll('[data-act=cat]').forEach(b => { b.classList.toggle('on', b === el); b.setAttribute('aria-pressed', b === el); }); },
    rate: async el => { await API.requests.rate(S.selId, Number(el.dataset.n)); toast('Thank you. Request closed.'); render(); },
    assign: async el => { const v = $('#vs').value; if (!v) return toast('Choose a vendor'); await API.requests.assign(el.dataset.id, Number(v)); toast('Assigned'); render(); },
    move: async el => { await API.requests.setStatus(el.dataset.id, el.dataset.s); toast(el.dataset.s === 'closed' ? 'Marked resolved' : 'Work started'); render(); },
    decide: async el => { await API.admin.decide(el.dataset.id, el.dataset.d); toast(el.dataset.d === 'approve' ? 'Approved' : 'Rejected'); render(); },
  };
  document.addEventListener('click', guard(async e => { const el = e.target.closest('[data-act]'); if (el && ACT[el.dataset.act]) { e.preventDefault(); await ACT[el.dataset.act](el); } }));
  document.addEventListener('input', e => {
    if (e.target.id === 'hs') { const r = $('#hres'); if (r) r.innerHTML = searchResults(e.target.value); }
    else if (e.target.id === 'us') { S.set.q = e.target.value; drawUsers(); }
    else if (e.target.id === 'enote') S.note = e.target.value;
  });
  document.addEventListener('change', guard(async e => {
    if (e.target.id !== 'photo') return;
    S.photo = e.target.files[0] || null; $('#pn').textContent = S.photo ? S.photo.name : 'JPG, PNG or WebP, up to 5 MB';
    const old = $('#drop img'); if (old) old.remove();
    if (S.photo) { const img = document.createElement('img'); img.alt = 'Selected photo'; img.src = URL.createObjectURL(S.photo); $('#drop').prepend(img); }
  }));
  document.addEventListener('submit', guard(async e => {
    const f = e.target; e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    if (f.id === 'authform') {
      const err = $('#autherr'); err.textContent = ''; f.classList.remove('shake'); f.classList.add('busy'); const btn = f.querySelector('button.auth-go'); if (btn) btn.disabled = true;
      try {
        if (S.mode === 'login') { S.me = await API.auth.login(d.email, d.password); S.tab = 'home'; return render(); }
        d.consent = f.consent.checked; d.resident_type = S.regType;
        const r = await API.auth.register(d); S.mode = 'login'; authView(); toast(r.message + ' You will be able to sign in once approved.');
      } catch (x) { err.textContent = x.message; f.classList.remove('busy'); if (btn) btn.disabled = false; void f.offsetWidth; f.classList.add('shake'); }
    } else if (f.id === 'raiseform') {
      const fd = new FormData();
      fd.set('category', S.cat); fd.set('title', d.title);
      fd.set('description', [d.where ? 'Where: ' + d.where : '', d.description].filter(Boolean).join('\n'));
      if (S.photo) fd.set('photo', S.photo);
      const r = await API.requests.create(fd); S.photo = null; toast('Request ' + rid({ id: r.id }) + ' raised'); go('requests', r.id);
    } else if (f.id === 'gateform') {
      const code = (d.code || '').replace(/\D/g, ''); if (code.length !== 6) { toast('Enter the 6-digit code'); return; }
      await doVerify({ code });
    } else if (f.id === 'gpform') {
      const err = $('#gperr'); err.textContent = '';
      try {
        const vf = new Date(d.valid_from), vu = new Date(d.valid_until);
        if (isNaN(vf) || isNaN(vu) || vu <= vf) { err.textContent = 'Valid until must be after valid from.'; return; }
        const body = { visitor_name: d.visitor_name.trim(), purpose: (d.purpose || '').trim(), valid_from: vf.toISOString(), valid_until: vu.toISOString() };
        const r = await API.gate.pass(body);
        S.gp.view = { ...body, ...r, status: 'active' }; S.gp.confirm = null; toast('Pass created'); render(); window.scrollTo(0, 0);
      } catch (x) { err.textContent = x.message; }
    } else if (f.id === 'emgform') {
      const t = S.sheet; await API.emergencies.raise(t, (d.note || '').trim()); S.sheet = null; S.note = ''; toast('Alert sent to the committee'); render();
    } else if (f.id === 'profform' || f.id === 'pwform') {
      const err = $('#perr'); err.textContent = '';
      try {
        if (f.id === 'profform') { const u = await API.profile.update({ name: d.name, phone: d.phone }); S.me = { ...S.me, ...u }; toast('Details saved'); }
        else { await API.profile.changePassword(d.current, d.next); toast('Password changed'); }
        S.pf = null; render();
      } catch (x) { err.textContent = x.message; }
    } else if (f.id === 'hhform') {
      d.consent = f.consent.checked; d.resident_type = S.rtype; await API.household.add(d); toast('Sent to the committee for approval'); render();
    } else if (f.id === 'leaseform') { await API.admin.setLease(f.dataset.id, d); toast('Lease saved. Tenant notified.'); go('home', null, 'leases-sub');
    } else if (f.id === 'setform') {
      await trySet(async () => { const r = await API.admin.setSettings({ society_name: d.society_name.trim(), society_kind: (d.society_kind || '').trim() }); SOCIETY.name = (r && r.society_name) || d.society_name.trim(); SOCIETY.kind = (r && r.society_kind) || d.society_kind; toast('Saved'); });
    } else if (f.id === 'gform') {
      await trySet(async () => { await API.gate.addGuard({ name: d.name.trim(), email: d.email.trim(), password: d.password }); toast('Guard added'); go('home', null, 'set-guards'); });
    } else if (f.id === 'nform') { await API.notices.create(d); toast('Posted. Residents notified.'); render(); }
  }));

  HP.live(async () => {
    if (!S.me) return;
    // never wipe a half-typed field, an open gate form or a visible verify result
    const ae = document.activeElement;
    if (ae && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName) && app.contains(ae)) return;
    if (S.sub && S.sub.startsWith('set-')) return;
    if (!S.sub && (S.tab === 'gate' || S.tab === 'gatepass' || S.gRes || cam)) return;
    const sc = $('#screen'), top = sc ? sc.scrollTop : 0;
    await render();
    const n = $('#screen'); if (n) n.scrollTop = top;
  });

  (async () => {
    try { const ps = await API.settings.public(); if (ps) Object.assign(SOCIETY, { ...(ps.society_name ? { name: ps.society_name } : {}), ...(ps.society_kind ? { kind: ps.society_kind } : {}) }); } catch { /* keep defaults */ }
    try { S.me = await API.auth.me(); } catch { S.me = null; }
    render();
  })();
})();
