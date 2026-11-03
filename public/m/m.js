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

  const searchBox = () => `<div class="m-search"><span class="m-search-ic">${ic('magnifying-glass')}</span><input class="input" id="hs" type="search" placeholder="Search requests and notices" autocomplete="off" aria-label="Search requests and notices"></div><div id="hres" class="col" style="gap:8px"></div>`;
  const searchResults = q => {
    q = q.trim().toLowerCase(); if (!q) return '';
    const rs = S.idx.reqs.filter(r => (r.title || '').toLowerCase().includes(q)).slice(0, 5), ns = S.idx.notices.filter(n => (n.title || '').toLowerCase().includes(q)).slice(0, 5);
    return rs.map(r => `<button class="list-row m-card m-hit" data-act="open" data-id="${r.id}"><span class="tile">${ic(catIcon(r.category))}</span><span class="col" style="gap:0"><span class="list-title" style="font-size:16px">${esc(r.title)}</span><span class="muted xs">Request ${rid(r)}</span></span></button>`).join('')
      + ns.map(n => `<button class="list-row m-card m-hit" data-act="quick" data-k="notices-sub"><span class="tile">${ic(noticeIcon(n))}</span><span class="col" style="gap:0"><span class="list-title" style="font-size:16px">${esc(n.title)}</span><span class="muted xs">Notice</span></span></button>`).join('')
      || '<p class="muted sm">No matches.</p>';
  };
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
  function authView() {
    const login = S.mode === 'login';
    const tiles = [['owner', 'key', 'Owner'], ['tenant', 'house-line', 'Tenant'], ['family', 'users', 'Family']]
      .map(([k, i, l]) => `<button type="button" class="type-tile ${S.regType === k ? 'on' : ''}" style="align-items:center" data-act="regtype" data-t="${k}">${ic(i)}<b style="font-size:14px">${l}</b></button>`).join('');
    app.innerHTML = `<div class="phone"><div class="m-hero-photo">${photoSlot('Sahyadri Heights')}</div><form id="authform" class="screen" novalidate>
      <span class="eyebrow">${esc(SOCIETY.name)}</span><h2>${login ? 'Welcome back' : 'Join your society'}</h2>
      ${login ? '' : `<div class="type-tiles" role="group" aria-label="I am a">${tiles}</div>
        <div class="field"><label for="n">Full name</label><input class="input" id="n" name="name" required maxlength="100" autocomplete="name"></div>
        <div class="two" style="grid-template-columns:1fr 1.4fr"><div class="field"><label for="f">Flat</label><input class="input" id="f" name="flat" required maxlength="20" placeholder="B-304"></div>
        <div class="field"><label for="p">Mobile</label><input class="input" id="p" name="phone" maxlength="20" inputmode="tel" autocomplete="tel"></div></div>`}
      <div class="field"><label for="e">Email</label><input class="input" id="e" name="email" type="email" required autocomplete="username"></div>
      <div class="field"><label for="pw">Password${login ? '' : ' (8+ characters)'}</label><input class="input" id="pw" name="password" type="password" required autocomplete="${login ? 'current-password' : 'new-password'}"></div>
      ${login ? '' : `<label class="consent sm"><input type="checkbox" name="consent" required>I consent to these details being stored to manage society services (DPDP Act, 2023).</label>`}
      <p class="err" id="autherr" role="alert"></p><button class="btn btn-primary btn-lg">${login ? 'Sign in' : 'Send for approval'}</button>
      <button type="button" class="link-btn" style="text-align:center;min-height:44px" data-act="mode">${login ? 'New resident? Join your society' : 'Already registered? Sign in'}</button>
      ${(window.Capacitor || matchMedia('(display-mode: standalone)').matches) ? '' : `<p class="install muted">Add this page to your home screen to use it like an app. <a href="/?web">Open the website</a></p>`}</form></div>`;
  }

  // ---------- resident + committee screens
  const SCREENS = {
    async home() { return isAdmin() ? SCREENS.dashboard() : SCREENS.residentHome(); },

    async residentHome() {
      const [reqs, notices] = await Promise.all([API.requests.list(), API.notices.list()]);
      const { open, toRate } = residentSummary(reqs, S.me, notices);
      const t = S.me.resident_type;
      let p2 = ['Notices', String(notices.length), ['quick', 'data-k="notices-sub"']];
      if (t === 'owner') p2 = ['Household', String((await API.household.list()).length), ['tab', 'data-tab="household"']];
      if (t === 'tenant') { const li = leaseInfo(await API.lease.get()); p2 = ['Lease ends', li ? li.left + 'd' : '–', ['tab', 'data-tab="lease"']]; }
      const n0 = notices[0]; S.idx = { reqs, notices };
      const quick = [['plus-circle', 'Raise', 'raise'], ['list-checks', 'Requests', 'requests'], ['megaphone', 'Notices', 'notices-sub'], ['qr-code', 'Gate pass', 'gatepass']]
        .map(([i, l, k]) => `<button data-act="quick" data-k="${k}"><span class="tile">${ic(i)}</span>${l}</button>`).join('');
      screen(`<div class="row" style="flex-wrap:nowrap"><span class="avatar" style="width:40px;height:40px;font-size:14px">${esc(initials(S.me.name))}</span>
        <div class="col grow" style="gap:0"><span class="muted xs">${esc(dateShort())} · ${esc(S.me.flat)}</span><span class="list-title" style="font-size:20px">${greet()}, ${esc(firstName(S.me.name))}</span></div>
        <button class="btn btn-ghost btn-icon" data-act="tab" data-tab="alerts" aria-label="Alerts" style="font-size:24px">${ic('bell')}</button></div>
        ${searchBox()}
        <div class="hero m-hero"><div class="hero-head soft sm">${ic('wrench')}Your requests<span class="chip">${toRate.length ? toRate.length + ' to rate' : 'Up to date'}</span></div>
        <div class="fig">${open.length} open</div><div class="panels" style="--cols:3">
          <button class="panel" data-act="tab" data-tab="requests"><div class="l soft">To rate</div><div class="v">${toRate.length}</div></button>
          <button class="panel" data-act="${p2[2][0]}" ${p2[2][1]}><div class="l soft">${esc(p2[0])}</div><div class="v">${esc(p2[1])}</div></button>
          <button class="panel" data-act="quick" data-k="notices-sub"><div class="l soft">Notices</div><div class="v">${notices.length}</div></button></div></div>
        <div class="quick">${quick}</div>
        ${n0 ? `<div class="row" style="flex-wrap:nowrap;align-items:center"><div style="width:96px;height:96px;border-radius:14px;overflow:hidden;flex:none">${photoSlot('', noticeIcon(n0))}</div><div class="col" style="gap:2px"><span class="kicker">Notice · ${esc(day(n0.created_at))}</span><span class="list-title" style="font-size:16px">${esc(n0.title)}</span></div></div>` : ''}
        `);
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
      const [s, reqs, notices, emg] = await Promise.all([API.admin.stats(), API.requests.list(), API.notices.list().catch(() => []), API.emergencies.list().catch(() => [])]);
      S.idx = { reqs, notices }; const act = emg.filter(e => e.status === 'active').length;
      const a = adminSummary(reqs, s), un = a.open.filter(r => !r.vendor_id).length, max = Math.max(1, ...a.weeks);
      const stat = (i, l, v, tab) => `<button class="stat" data-act="tab" data-tab="${tab}"><div class="l">${ic(i)}${l}</div><div class="v">${esc(v)}</div></button>`;
      screen(`<div class="row" style="flex-wrap:nowrap"><span class="avatar" style="width:40px;height:40px;font-size:14px">${esc(initials(S.me.name))}</span><div class="col grow" style="gap:0"><span class="muted xs">${esc(dateShort())} · Committee</span>
        <span class="list-title" style="font-size:20px">${greet()}, ${esc(firstName(S.me.name))}</span></div><button class="btn btn-ghost btn-icon" data-act="tab" data-tab="alerts" aria-label="Alerts" style="font-size:24px">${ic('bell')}</button></div>
        ${act ? `<button class="emg-banner" data-act="tab" data-tab="emergency">${ic('siren')}<span class="col grow" style="gap:0;text-align:left"><b>${act} active emergenc${act === 1 ? 'y' : 'ies'}</b><span class="sm">Tap to respond</span></span>${ic('caret-right')}</button>` : ''}
        ${searchBox()}
        <div class="hero m-hero"><div class="hero-head soft sm">${ic('clipboard-text')}Open requests<span class="chip">${a.overdue} past 48h</span></div>
        <div class="row" style="justify-content:space-between;flex-wrap:nowrap;margin-top:8px"><span class="fig" style="margin:0">${a.open.length}</span><span class="ring" style="width:76px;height:76px;background:${ring(a.pct)}"><div style="width:56px;height:56px"><b style="font-size:14px">${a.pct}%</b></div></span></div>
        <div class="soft sm" style="margin-top:6px">${un} unassigned · oldest ${a.oldest} · within 48h SLA ${a.pct}%</div></div>
        <div class="stat-grid">${stat('user-check', 'Pending approvals', s.pending_users, 'approvals')}${stat('user-gear', 'Unassigned', un, 'requests')}${stat('star', 'Average rating', s.avg_rating ? s.avg_rating.toFixed(1) : '–', 'requests')}${stat('megaphone', 'Notices, 30 days', s.notices_30d, 'notices')}</div>
        <div class="m-bars" aria-hidden="true">${a.weeks.map(n => `<span style="height:${Math.max(4, Math.round(n / max * 80))}px"></span>`).join('')}</div><span class="muted xs">Requests per week, last 8 weeks</span>
        <div class="two"><button class="btn btn-secondary btn-lg" data-act="quick" data-k="gate">${ic('shield-check')}Verify at gate</button><button class="btn btn-secondary btn-lg" data-act="quick" data-k="gatelog">${ic('clock-counter-clockwise')}Gate log</button></div>
        <button class="btn btn-secondary btn-lg" data-act="quick" data-k="leases-sub">${ic('file-text')}Tenant leases</button>
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
    async 'notices-sub'() { const ns = await API.notices.list(); screen(`${back('Home', 'home')}<h2>Notices</h2>${ns.map(noticeCard).join('') || '<p class="muted">No notices.</p>'}`); },
    async 'contacts-sub'() {
      const CONTACTS = (await API.contacts.list().catch(() => [])).map(c => [c.icon || 'phone', c.name, c.role, c.phone || '']);
      screen(`${back('Back', isAdmin() ? 'home' : 'profile')}<h2>Who to call</h2>${CONTACTS.length ? CONTACTS.map(([i, n, r, p]) => `<a class="member" style="grid-template-columns:48px minmax(0,1fr);text-decoration:none;color:inherit;border-radius:20px" href="tel:${esc(p.replace(/[^+\d]/g, ''))}"><span class="tile lg" style="width:48px;height:48px;border-radius:50%">${ic(i)}</span><span class="col" style="gap:0"><span class="list-title" style="font-size:16px">${esc(n)}</span><span class="muted xs">${esc(r)}</span><span class="sm" style="font-weight:600;color:var(--color-accent-700)">${esc(p)}</span></span></a>`).join('') : '<p class="muted">The committee has not added any contacts yet.</p>'}`);
    },
  };

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
  const ACT = {
    gscan: () => startScan(),
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
    tab: el => (el.dataset.tab === 'alerts' && isAdmin() ? go(S.tab, null, 'alerts') : go(el.dataset.tab)),
    emgpick: el => { S.sheet = el.dataset.k; S.note = ''; render(); },
    emgcancel: () => { S.sheet = null; S.note = ''; render(); },
    emgresolve: async el => { await API.emergencies.resolve(el.dataset.id); toast('Marked resolved'); render(); },
    pform: el => { S.pf = el.dataset.f || null; render(); },
    quick: el => (el.dataset.k.endsWith('-sub') ? go('home', null, el.dataset.k) : go(el.dataset.k)),
    leaseopen: el => { S.leaseId = Number(el.dataset.id); go('home', null, 'lease-edit'); },
    leasesback: () => go('home', null, 'leases-sub'),
    open: el => go('requests', Number(el.dataset.id)),
    logout: async () => { await API.auth.logout(); S.me = null; S.mode = 'login'; S.tab = 'home'; S.sub = null; S.pf = null; S.sheet = null; render(); },
    mode: () => { S.mode = S.mode === 'login' ? 'join' : 'login'; render(); },
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
      const err = $('#autherr'); err.textContent = '';
      try {
        if (S.mode === 'login') { S.me = await API.auth.login(d.email, d.password); S.tab = 'home'; return render(); }
        d.consent = f.consent.checked; d.resident_type = S.regType;
        const r = await API.auth.register(d); S.mode = 'login'; authView(); toast(r.message + ' You will be able to sign in once approved.');
      } catch (x) { err.textContent = x.message; }
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
    } else if (f.id === 'nform') { await API.notices.create(d); toast('Posted. Residents notified.'); render(); }
  }));

  HP.live(async () => {
    if (!S.me) return;
    // never wipe a half-typed field, an open gate form or a visible verify result
    const ae = document.activeElement;
    if (ae && ['INPUT', 'TEXTAREA', 'SELECT'].includes(ae.tagName) && app.contains(ae)) return;
    if (!S.sub && (S.tab === 'gate' || S.tab === 'gatepass' || S.gRes || cam)) return;
    const sc = $('#screen'), top = sc ? sc.scrollTop : 0;
    await render();
    const n = $('#screen'); if (n) n.scrollTop = top;
  });

  (async () => { try { S.me = await API.auth.me(); } catch { S.me = null; } render(); })();
})();
