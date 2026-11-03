// Web app (desktop-first, responsive). Phones are sent to the mobile app at /m/ unless ?web is in the URL.
(() => {
  const { $, esc, ic, toast, api, guard, CATS, catLabel, catIcon, TYPE, stamp, day, ageLabel, isOpen, overdue, todayLabel, initials, firstName,
    statusTag, stepper, stars, noticeIcon, photoSlot, residentSummary, adminSummary, ring, rid, SOCIETY, leaseInfo } = HP;
  const EMERGENCY_TYPES = HP.EMERGENCY_TYPES || [], CONTACT_ICONS = HP.CONTACT_ICONS || [];

  if (matchMedia('(max-width: 640px)').matches && !new URLSearchParams(location.search).has('web')) { location.replace('/m/'); return; }

  const root = $('#root');
  const S = { nav: { pos: 'side', hidden: false }, me: null, leaseId: null, catFilter: '', page: 'home', selId: null, cat: 'plumbing', photo: null, rtype: 'family', regType: 'owner', mode: 'login', filter: '', emType: null, delContact: null, editVendor: null, delVendor: null, vErr: '', gpSel: null, gpNew: null, gpCancel: null, gmRot: false, gdDel: null, gdErr: '' };
  // Menu layout is the user's choice: on the side or on top, shown or hidden. Remembered in this browser.
  const NAVKEY = 'hp.nav';
  const loadNav = () => { try { const v = JSON.parse(localStorage.getItem(NAVKEY)); return { pos: v && v.pos === 'top' ? 'top' : 'side', hidden: !!(v && v.hidden) }; } catch (e) { return { pos: 'side', hidden: false }; } };
  const saveNav = () => { try { localStorage.setItem(NAVKEY, JSON.stringify(S.nav)); } catch (e) { /* storage blocked: choice lasts for this visit only */ } };
  S.nav = loadNav();
  const applyNav = () => {
    const w = document.querySelector('.web'); if (!w) return;
    w.classList.toggle('top-shell', S.nav.pos === 'top'); w.classList.toggle('side-shell', S.nav.pos !== 'top'); w.classList.toggle('nav-hidden', S.nav.hidden);
    const pos = document.querySelector('[data-act=navpos]'), hide = document.querySelector('.side-tools [data-act=navhide]'), show = document.querySelector('.nav-reveal');
    if (pos) { const top = S.nav.pos === 'top'; pos.title = top ? 'Move menu to the side' : 'Move menu to the top'; pos.setAttribute('aria-label', pos.title); pos.querySelector('i').className = 'ph-duotone ' + (top ? 'ph-sidebar-simple' : 'ph-align-top-simple'); pos.querySelector('.side-tt').textContent = top ? 'Menu to side' : 'Menu to top'; }
    if (hide) hide.setAttribute('aria-expanded', String(!S.nav.hidden));
    if (show) show.hidden = !S.nav.hidden;
    const aside = document.querySelector('.sidebar'); if (aside) aside.inert = S.nav.hidden;
  };
  const isAdmin = () => S.me.role === 'admin';
  const NAV = {
    owner: [['home', 'Home', 'house'], ['requests', 'Requests', 'list-checks'], ['raise', 'Raise a request', 'plus-circle'], ['household', 'Household', 'users-three'], ['contacts', 'Contacts', 'phone-call'], ['gatepass', 'Gate pass', 'qr-code'], ['emergency', 'Emergency', 'siren']],
    tenant: [['home', 'Home', 'house'], ['requests', 'Requests', 'list-checks'], ['raise', 'Raise a request', 'plus-circle'], ['lease', 'My lease', 'file-text'], ['gatepass', 'Gate pass', 'qr-code'], ['emergency', 'Emergency', 'siren']],
    family: [['home', 'Home', 'house'], ['requests', 'Flat requests', 'list-checks'], ['raise', 'Raise a request', 'plus-circle'], ['notices', 'Notices', 'megaphone'], ['contacts', 'Contacts', 'phone-call'], ['gatepass', 'Gate pass', 'qr-code'], ['emergency', 'Emergency', 'siren']],
    admin: [['dashboard', 'Dashboard', 'chart-bar'], ['requests', 'Requests', 'list-checks'], ['emergencies', 'Emergencies', 'siren'], ['approvals', 'Approvals', 'user-check'], ['contacts', 'Contacts', 'phone-call'], ['notices', 'Notices', 'megaphone'],
      ['leases', 'Leases', 'file-text'], ['vendors', 'Vendors', 'toolbox'], ['gate', 'Gate', 'shield-check'], ['guards', 'Guards', 'identification-card'], ['audit', 'Audit trail', 'clock-counter-clockwise']],
    guard: [['gate', 'Gate', 'shield-check'], ['gatelog', 'Log', 'clock-counter-clockwise']],
  };
  const isGuard = () => S.me.role === 'guard';
  const navFor = () => NAV[isAdmin() ? 'admin' : isGuard() ? 'guard' : S.me.resident_type] || NAV.owner;
  const home0 = () => isAdmin() ? 'dashboard' : isGuard() ? 'gate' : 'home';
  const go = (page, selId = null) => { stopScan(); S.page = page; S.selId = selId; render(); window.scrollTo(0, 0); };

  // ---------- shell
  async function render() {
    if (!S.me) { stopScan(); return authView(); }
    if (S.page !== 'gate') stopScan();
    let pending = 0, activeEm = 0;
    if (isAdmin()) { pending = (await API.admin.users('pending')).length; try { activeEm = (await API.emergencies.list()).filter(e => e.status === 'active').length; } catch (e) { activeEm = 0; } }
    const navBtn = (k, label, icon, extra = '') => `<button class="btn side-link ${S.page === k ? 'on' : ''}" data-act="nav" data-page="${k}" title="${esc(label)}" ${S.page === k ? 'aria-current="page"' : ''}>${ic(icon)}<span class="side-t">${esc(label)}</span>${extra}</button>`;
    const nav = navFor().map(([k, label, icon]) => navBtn(k, label, icon, k === 'approvals' && pending ? `<span class="tag tag-accent-2">${pending}</span>` : k === 'emergencies' && activeEm ? `<span class="tag tag-danger" aria-label="${activeEm} active emergencies">${activeEm}</span>` : '')).join('');
    const who = isAdmin() || isGuard() ? `${S.me.name}` : `${S.me.name} · ${S.me.flat}`;
    root.innerHTML = `<div class="web side-shell">
      <button class="btn btn-primary nav-reveal" data-act="navhide" title="Show menu" aria-label="Show menu" hidden>${ic('list')}<span class="nav-reveal-t">Menu</span></button>
      <aside class="sidebar">
        <div class="side-brand"><span class="tile lg side-logo">${ic('buildings')}</span>
          <div class="col side-t" style="gap:0"><span class="eyebrow">${esc(SOCIETY.kind)}</span><span class="brand-name">${esc(SOCIETY.name)}</span></div></div>
        <nav aria-label="Main" class="side-nav">${nav}${navBtn('alerts', 'Alerts', 'bell')}</nav>
        <div class="side-meta sm">${HP.liveBadge()}<i class="side-t">${esc(todayLabel())}</i></div>
        <div class="side-tools" role="group" aria-label="Menu layout">
          <button class="btn btn-ghost side-tool" data-act="navpos" title="Move menu to the top" aria-label="Move menu to the top">${ic('align-top-simple')}<span class="side-t side-tt">Menu to top</span></button>
          <button class="btn btn-ghost side-tool" data-act="navhide" title="Hide menu" aria-label="Hide menu" aria-expanded="true">${ic('caret-double-left')}<span class="side-t">Hide menu</span></button></div>
        <div class="side-user"><span class="avatar" title="${esc(who)}">${esc(initials(S.me.name))}</span><span class="sm side-t side-who">${esc(who)}</span>
          <button class="btn btn-secondary side-out" data-act="logout" title="Sign out">${ic('sign-out')}<span class="side-t">Sign out</span></button>
          <a class="side-t xs muted" href="/m/">Open the mobile app</a></div>
      </aside>
      <main id="page" class="page"></main></div>`;
    applyNav();
    try { await PAGES[S.page](); } catch (e) { $('#page').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }
  const page = h => { $('#page').innerHTML = h; };

  // ---------- signed out
  // Sign-in/registration building blocks: icon inside the input, show/hide password toggle.
  const authField = (id, label, icon, input) => `<div class="field af"><label for="${id}">${label}</label><div class="af-wrap"><span class="af-ic">${ic(icon)}</span>${input}</div></div>`;
  const pwField = (login) => `<div class="field af"><label for="pw">Password${login ? '' : ' (8+ characters)'}</label><div class="af-wrap"><span class="af-ic">${ic('lock-key')}</span><input class="input" id="pw" name="password" type="password" required minlength="${login ? 1 : 8}" autocomplete="${login ? 'current-password' : 'new-password'}"><button type="button" class="af-eye" data-act="pwtoggle" aria-label="Show password" aria-pressed="false">${ic('eye')}</button></div></div>`;
  function authView() {
    const login = S.mode === 'login';
    const tiles = [['owner', 'key', 'Owner', 'Holds the sale deed'], ['tenant', 'house-line', 'Tenant', 'Rent agreement'], ['family', 'users', 'Family', 'Added by owner']]
      .map(([k, i, l, s]) => `<button type="button" class="type-tile ${S.regType === k ? 'on' : ''}" data-act="regtype" data-t="${k}">${ic(i)}<b>${l}</b><span>${s}</span></button>`).join('');
    const perks = [['list-checks', 'Raise and track work requests', 'Photos, vendors and a clear five-step tracker'], ['siren', 'Emergency alerts', 'One tap tells the committee and the gate'], ['qr-code', 'Visitor gate passes', 'QR codes and codes your guests can show'], ['megaphone', 'Notices and household', 'Stay informed, manage your flat']]
      .map(([i, t, d]) => `<li><span class="tile">${ic(i)}</span><span class="col" style="gap:0"><b>${t}</b><span class="soft sm">${d}</span></span></li>`).join('');
    root.innerHTML = `<div class="auth"><section class="auth-art"><span class="eyebrow" style="color:var(--color-accent-300)">${esc(SOCIETY.kind)}</span>
      <h1>Welcome to ${esc(SOCIETY.name)}</h1>
      <p class="soft auth-lead">One portal for residents, the committee and the gate.</p>
      <ul class="auth-perks">${perks}</ul>
      <div class="hero-anim" data-lottie="building" role="img" aria-label="Animated apartment building"></div></section>
      <section class="auth-form"><div class="auth-card">
      <div class="auth-seg" role="tablist" aria-label="Sign in or join"><button type="button" role="tab" aria-selected="${login}" class="${login ? 'on' : ''}" data-act="mode" ${login ? 'tabindex="-1"' : ''}>Sign in</button><button type="button" role="tab" aria-selected="${!login}" class="${!login ? 'on' : ''}" data-act="mode" ${!login ? 'tabindex="-1"' : ''}>Join your society</button></div>
      <h2>${login ? 'Welcome back' : 'Create your account'}</h2>
      <p class="muted auth-sub">${login ? 'Sign in to continue to your portal.' : 'The committee approves new residents before you can sign in.'}</p>
      <form id="authform" class="col" novalidate>
        ${login ? '' : `<div class="type-tiles" role="group" aria-label="I am a">${tiles}</div>
          <div class="two">${authField('n', 'Full name', 'user', '<input class="input" id="n" name="name" required maxlength="100" autocomplete="name">')}
          ${authField('f', 'Flat (e.g. B-304)', 'house', '<input class="input" id="f" name="flat" required maxlength="20">')}</div>
          ${authField('p', 'Mobile', 'phone', '<input class="input" id="p" name="phone" maxlength="20" autocomplete="tel" inputmode="tel">')}`}
        ${authField('e', 'Email', 'envelope-simple', '<input class="input" id="e" name="email" type="email" required autocomplete="username">')}
        ${pwField(login)}
        ${login ? '' : `<label class="consent"><input type="checkbox" name="consent" required>I consent to ${esc(SOCIETY.name)} storing these details to manage society services, as required under the DPDP Act, 2023.</label>`}
        <p class="err" id="autherr" role="alert"></p>
        <button class="btn btn-primary btn-lg auth-go">${login ? 'Sign in' : 'Send for approval'}${ic('arrow-right')}<span class="auth-spin" data-lottie="loader" aria-hidden="true"></span></button>
      </form></div></section></div>`;
  }

  // ---------- helpers
  const heroPanels = ps => `<div class="panels" style="--cols:${ps.length}">${ps.map(p => `<button class="panel" data-act="nav" data-page="${p.go}" ${p.sel ? `data-sel="${p.sel}"` : ''}><div class="l soft">${ic(p.icon)}${esc(p.l)}</div><div class="v">${esc(p.v)}</div><div class="s">${esc(p.s)}</div></button>`).join('')}</div>`;
  const noticeRow = n => `<article class="row" style="flex-wrap:nowrap;align-items:flex-start;cursor:pointer" data-act="nav" data-page="notices" tabindex="0" role="link"><span class="tile" style="width:36px;height:36px;font-size:20px">${ic(noticeIcon(n))}</span>
    <span class="col" style="gap:2px"><span class="muted xs">${esc(day(n.created_at))} · ${esc(n.author)}</span><span class="list-title">${esc(n.title)}</span></span></article>`;
  const reqRow = r => `<button class="list-row ${S.selId === r.id ? 'on' : ''}" data-act="open" data-id="${r.id}"><span class="tile">${ic(catIcon(r.category))}</span>
    <span class="col" style="gap:4px"><span class="muted xs">${rid(r)} · ${esc(catLabel(r.category))} · ${esc(day(r.created_at))}${isAdmin() || S.me.resident_type !== 'tenant' ? ' · ' + esc(r.flat) : ''}</span><span class="list-title">${esc(r.title)}</span><span style="align-self:flex-start">${statusTag(r)}</span></span></button>`;
  const vendorOptions = (vs, cur) => `<option value="">Unassigned</option>${vs.map(v => `<option value="${v.id}" ${cur === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}`;

  const emType = k => EMERGENCY_TYPES.find(t => t[0] === k) || [k, 'warning', 'Emergency'];
  const contactIcon = i => (CONTACT_ICONS.map(c => Array.isArray(c) ? c[0] : c).includes(i) ? i : 'phone');
  const contactRow = (c, admin) => `<div class="member" style="grid-template-columns:48px minmax(0,1fr) auto"><span class="tile lg" style="width:48px;height:48px;border-radius:50%">${ic(contactIcon(c.icon))}</span><span class="col" style="gap:0"><span class="list-title">${esc(c.name)}</span><span class="muted sm">${esc(c.role)}</span></span>
    <span class="row" style="gap:var(--space-2);flex-wrap:nowrap"><a href="tel:${esc(String(c.phone).replace(/[^\d+]/g, ''))}" style="font-weight:600;font-size:16px">${esc(c.phone)}</a>${admin ? (S.delContact === c.id
      ? `<button class="btn btn-danger" data-act="cdel" data-id="${c.id}">Delete ${esc(c.name)}?</button><button class="btn btn-secondary" data-act="ccancel">Keep</button>`
      : `<button class="btn btn-secondary" data-act="cask" data-id="${c.id}" aria-label="Delete ${esc(c.name)}">${ic('trash')}Delete</button>`) : ''}</span></div>`;
  const emStatus = e => e.status === 'active' ? '<span class="tag tag-danger">Active</span>' : '<span class="tag tag-accent">Resolved</span>';
  const emCard = e => { const [, i, l] = emType(e.type); return `<article class="em-row ${e.status === 'active' ? 'on' : ''}"><span class="tile lg em-ic">${ic(i)}</span><span class="col" style="gap:2px"><span class="list-title" style="font-size:20px">${esc(l)} · Flat ${esc(e.flat)}</span>
    <span class="muted sm">${esc(e.user_name || '')} · ${esc(stamp(e.created_at))}${e.resolved_at ? ' · resolved ' + esc(stamp(e.resolved_at)) : ''}</span>${e.note ? `<span>${esc(e.note)}</span>` : ''}</span>
    <span class="col" style="align-items:flex-end;gap:8px">${emStatus(e)}${isAdmin() && e.status === 'active' ? `<button class="btn btn-primary" data-act="emresolve" data-id="${e.id}">Mark resolved</button>` : ''}</span></article>`; };

  // ---------- pages
  const PAGES = {
    async home() {
      const [reqs, notices] = await Promise.all([API.requests.list(), API.notices.list()]);
      const { open, toRate, track } = residentSummary(reqs, S.me, notices);
      const t = S.me.resident_type, n0 = notices[0];
      let extra = [];
      if (t === 'owner') extra = [{ l: 'Household', v: String((await API.household.list()).length), s: 'Members on ' + S.me.flat, icon: 'users-three', go: 'household' }];
      if (t === 'tenant') { const li = leaseInfo(await API.lease.get()); extra = [{ l: 'Lease ends', v: li ? li.ends.replace(/ \d{4}$/, '') : '–', s: li ? li.left + ' days left' : 'No lease on file', icon: 'calendar-check', go: 'lease' }]; }
      const notePanel = { l: 'New notices', v: String(notices.length), s: n0 ? n0.title : 'Nothing new', icon: 'megaphone', go: t === 'family' ? 'notices' : 'home' };
      const panels = t === 'family'
        ? [{ l: 'Raised by you', v: String(reqs.filter(r => r.user_id === S.me.id).length), s: 'You can raise and track', icon: 'note-pencil', go: 'requests' },
          { l: 'Awaiting owner rating', v: String(reqs.filter(r => r.status === 'closed' && !r.rating).length), s: 'The flat owner rates the work', icon: 'star', go: 'requests' }, notePanel]
        : [{ l: 'To rate', v: String(toRate.length), s: toRate[0] ? toRate[0].title : 'Nothing to rate', icon: 'star', go: 'requests', sel: toRate[0] ? toRate[0].id : '' }, ...extra, notePanel];
      let trackHtml = '<p class="muted">You have no requests yet.</p>';
      if (track) { const d = await API.requests.get(track.id);
        trackHtml = `<div class="row" style="align-items:baseline"><h3>${esc(track.title)}</h3><span class="muted sm">${rid(track)} · ${esc(track.vendor_name || 'Not yet assigned')}</span></div>${stepper(track, d.history)}`; }
      page(`<div class="g2"><div class="hero"><div class="hero-head">${`<span class="tile">${ic('wrench')}</span>`}<span class="soft">Flat ${esc(S.me.flat)} · ${t === 'family' ? 'household requests' : 'your requests'}</span>
          <span class="chip">${toRate.length ? toRate.length + ' waiting for your rating' : 'All up to date'}</span><button class="btn em-sos" data-act="nav" data-page="emergency">${ic('siren')}Emergency</button></div>
          <div class="fig">${open.length} open</div><div class="soft" style="font-weight:600;margin-top:8px">${track ? `${esc(track.title)} · ${esc(track.vendor_name || 'not yet assigned')} · raised ${esc(day(track.created_at))}` : 'Nothing open'}</div>
          ${heroPanels(panels)}</div><div class="hero-photo">${photoSlot('Sahyadri Heights')}</div></div>
        <section class="col"><h6 style="margin:0">Track your current request</h6>${trackHtml}</section>
        <div class="split-2"><div class="lead">${n0 ? `<article class="col" style="gap:var(--space-2)"><span class="kicker row" style="gap:6px">${ic('megaphone')}Notice · ${esc(day(n0.created_at))}</span><h1>${esc(n0.title)}</h1><p style="font-size:17px;margin:0">${esc(n0.body)}</p><span class="muted sm">Posted by ${esc(n0.author)}</span></article><div style="height:220px;border-radius:14px;overflow:hidden">${photoSlot('Notice', 'megaphone')}</div>` : '<p class="muted">No notices yet.</p>'}</div>
          <aside class="col"><h6 style="margin:0">Also on the board</h6>${notices.slice(1, 5).map(noticeRow).join('')}<button class="btn btn-primary" data-act="nav" data-page="raise" style="align-self:flex-start">${ic('plus-circle')}Raise a request</button></aside></div>`);
    },

    async requests() {
      const [all, vendors] = await Promise.all([API.requests.list(isAdmin() ? { status: S.filter, category: S.catFilter } : {}), isAdmin() ? API.vendors.list() : []]);
      const reqs = (S.catFilter ? all.filter(isOpen) : all).sort((x, y) => isOpen(y) - isOpen(x) || y.id - x.id); // open work first
      const sel = reqs.find(r => r.id === S.selId) || reqs.find(isOpen) || reqs[0];
      const heading = isAdmin() ? 'All requests' : S.me.resident_type === 'family' ? `Flat ${S.me.flat} requests` : 'My requests';
      let detail = '<p class="muted">Nothing here yet. Raise your first request.</p>';
      if (sel) {
        const d = await API.requests.get(sel.id);
        const next = { open: [], assigned: ['in_progress', 'closed'], in_progress: ['closed'], closed: [] }[d.status];
        const rateBlock = d.can_rate ? `<div class="col callout" style="gap:var(--space-2)"><h4>Resolved. How was the work?</h4><div class="row" style="gap:4px">${stars('rate')}</div><span class="sm" style="color:var(--color-accent-800)">Rating closes the request. The committee sees it against the vendor.</span></div>`
          : d.status === 'closed' && !d.rating && !isAdmin() ? '<p class="callout" style="margin:0">Resolved. The flat owner rates the work to close it.</p>'
          : d.rating ? `<p class="row" style="gap:6px;margin:0">${ic('star', '')}You rated this <strong>${d.rating} of 5</strong>${d.rating_comment ? ': ' + esc(d.rating_comment) : ''}.</p>` : '';
        const adminBlock = isAdmin() && d.status !== 'closed' ? `<div class="soft-card col"><h6 style="margin:0">Committee</h6><div class="row"><div class="field grow"><label for="vs">Assign vendor</label><select class="input" id="vs">${vendorOptions(vendors, d.vendor_id)}</select></div>
            <button class="btn btn-secondary" data-act="assign" data-id="${d.id}" style="align-self:flex-end">Assign</button></div>
            <div class="row">${next.map(s => `<button class="btn btn-primary" data-act="move" data-id="${d.id}" data-s="${s}">${s === 'closed' ? 'Mark resolved' : 'Start work'}</button>`).join('')}</div></div>` : '';
        detail = `<span class="kicker">${rid(d)} · ${esc(catLabel(d.category))} · Flat ${esc(d.flat)}</span><h1 style="max-width:none">${esc(d.title)}</h1>${stepper(d, d.history)}
          <div class="lead" style="gap:var(--space-6)"><div class="col"><div class="row" style="gap:var(--space-6);font-size:14px"><div class="col" style="gap:2px"><span class="muted xs">Assigned to</span><span>${esc(d.vendor_name || 'Not yet assigned')}</span></div>
          <div class="col" style="gap:2px"><span class="muted xs">Raised by</span><span>${esc(d.resident_name)}</span></div><div class="col" style="gap:2px"><span class="muted xs">Raised</span><span>${esc(stamp(d.created_at))}</span></div></div>
          <p style="font-size:17px;margin:0;white-space:pre-line">${esc(d.description)}</p>${rateBlock}${adminBlock}
          <div class="col" style="gap:var(--space-2)"><h6 style="margin:0">History</h6>${d.history.map(h => `<div class="hist"><span class="muted">${esc(stamp(h.created_at))}</span><span><strong style="font-weight:600">${esc(h.action.replace('_', ' '))}</strong> ${esc(h.detail || '')} — ${esc(h.actor || 'system')}</span></div>`).join('')}</div></div>
          <figure style="margin:0">${d.has_photo ? `<img class="photo" style="height:240px;border-radius:14px" alt="Photo attached by resident" src="${API.requests.photoUrl(d.id)}">` : `<div style="height:240px;border-radius:14px;overflow:hidden">${photoSlot('No photo attached', 'camera')}</div>`}<figcaption class="muted sm">Photo attached by resident</figcaption></figure></div>`;
        S.selId = d.id;
      }
      const filter = isAdmin() ? `<div class="row"><select class="input" id="fs" style="width:auto" aria-label="Filter by status"><option value="">Any status</option>${['open', 'assigned', 'in_progress', 'closed'].map(s => `<option value="${s}" ${S.filter === s ? 'selected' : ''}>${s.replace('_', ' ')}</option>`).join('')}</select>${S.catFilter ? `<button class="tag tag-accent link-btn" style="text-decoration:none;color:inherit" data-act="clearcat">${esc(catLabel(S.catFilter))} ✕</button>` : ''}<a href="${API.admin.exportUrl}">Export CSV</a></div>` : '';
      page(`<div class="split"><div class="col" style="gap:var(--space-1)"><h2 style="margin-bottom:var(--space-3)">${heading}</h2>${filter}${reqs.map(reqRow).join('') || '<p class="muted">No requests.</p>'}</div><div class="col" style="gap:var(--space-4)">${detail}</div></div>`);
    },

    async raise() {
      const tiles = CATS.map(([k, l, i]) => `<button type="button" class="cat ${S.cat === k ? 'on' : ''}" data-act="cat" data-c="${k}" aria-pressed="${S.cat === k}">${ic(i)}${l}</button>`).join('');
      const steps = [['user-gear', 'The secretary assigns a vendor, usually the same day.'], ['bell-ringing', "You're notified of each status change."], ['star', 'Once resolved, you rate the work to close it.']];
      page(`<div class="split-eq"><form id="raiseform" class="col" style="gap:var(--space-4)"><h2>Raise a request</h2>
        <div class="field"><label id="cl">Category</label><div class="cat-grid" role="group" aria-labelledby="cl">${tiles}</div></div>
        <div class="field"><label for="t">Short title</label><input class="input" id="t" name="title" required maxlength="120" placeholder="e.g. Bathroom tap dripping"></div>
        <div class="field"><label for="w">Where</label><input class="input" id="w" name="where" value="Flat ${esc(S.me.flat)}" maxlength="100"></div>
        <div class="field"><label for="d">What's happening</label><textarea class="input" id="d" name="description" maxlength="1800" placeholder="When it started, how bad it is, best time to visit"></textarea></div>
        <div class="row"><button class="btn btn-primary">${ic('paper-plane-tilt')}Submit request</button><span class="muted sm">The committee is notified straight away.</span></div></form>
        <div class="col" style="gap:var(--space-4);padding-top:52px"><label class="drop" id="drop">${ic('camera')}<span class="list-title">Add a photo</span><span class="sm" id="pn">JPG, PNG or WebP, up to 5 MB</span><input type="file" id="photo" accept="image/jpeg,image/png,image/webp"></label>
        <h6 style="margin:0">What happens next</h6>${steps.map(([i, t]) => `<div class="row" style="flex-wrap:nowrap">${ic(i, '')}<span>${t}</span></div>`).join('').replace(/<i /g, '<i style="font-size:26px;color:var(--color-accent-700)" ')}</div></div>`);
    },

    async household() {
      const ms = await API.household.list();
      const tiles = [['family', 'users', 'Family member', 'Added by owner'], ['tenant', 'house-line', 'Tenant', 'Rent agreement']].map(([k, i, l, s]) => `<button type="button" class="type-tile ${S.rtype === k ? 'on' : ''}" data-act="rtype" data-t="${k}">${ic(i)}<b>${l}</b><span>${s}</span></button>`).join('');
      page(`<div class="split-eq"><div class="col" style="gap:var(--space-4)"><h2>Your household</h2>
        <div class="two">${ms.map((m, i) => `<div class="member"><span class="avatar ${i ? 'blue' : ''}" style="width:44px;height:44px">${esc(initials(m.name))}</span><span class="col" style="gap:2px"><span class="list-title" style="font-size:16px">${esc(m.name)}</span><span class="row xs" style="gap:6px">${esc(TYPE[m.resident_type] || m.resident_type)}<span class="tag ${m.status === 'approved' ? 'tag-accent' : 'tag-accent-2'}">${m.status === 'approved' ? 'Active' : 'Pending approval'}</span></span></span></div>`).join('')}</div>
        <h3 style="margin-top:var(--space-4)">Add someone to ${esc(S.me.flat)}</h3><p style="margin:0">Add a family member or a tenant. The committee approves before their account is active.</p>
        <form id="hhform" class="col"><div class="type-tiles" role="group" aria-label="Type" style="grid-template-columns:repeat(2,minmax(0,1fr))">${tiles}</div>
        <div class="two"><div class="field"><label for="hn">Full name</label><input class="input" id="hn" name="name" required maxlength="100"></div><div class="field"><label for="hp">Mobile</label><input class="input" id="hp" name="phone" maxlength="20"></div></div>
        <div class="two"><div class="field"><label for="he">Email</label><input class="input" id="he" name="email" type="email" required></div><div class="field"><label for="hw">Temporary password (8+ characters)</label><input class="input" id="hw" name="password" type="password" minlength="8" required autocomplete="new-password"></div></div>
        <label class="consent"><input type="checkbox" name="consent" required>I confirm this person agrees to ${esc(SOCIETY.name)} storing these details to manage society services (DPDP Act, 2023).</label>
        <div class="row"><button class="btn btn-primary">Send for approval</button><span class="ok" id="hhok"></span></div></form></div>
        <div style="height:420px;border-radius:22px;overflow:hidden;margin-top:52px">${photoSlot('Sahyadri Heights', 'users-three')}</div></div>`);
    },

    async lease() {
      const [lease, contacts] = await Promise.all([API.lease.get(), API.contacts.list()]); const li = leaseInfo(lease);
      if (!li) return page('<h2>Your lease</h2><p class="callout">No lease is on file yet. The committee adds it after verifying your rent agreement.</p>');
      page(`<div class="split-eq" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div class="col" style="gap:var(--space-4)"><h2>Your lease</h2>
        <div class="hero"><div class="row soft sm" style="gap:8px;font-weight:600">${ic('calendar-check')}Lease on ${esc(S.me.flat)}</div><div class="fig" style="font-size:48px;margin-top:10px">${li.left} days left</div>
        <div class="soft" style="margin-top:6px">Ends ${esc(li.ends)} · renewal notice due by ${esc(li.renewBy)}</div>
        <div style="height:8px;border-radius:8px;background:color-mix(in srgb,var(--color-bg) 22%,transparent);margin-top:18px;overflow:hidden"><span style="display:block;height:100%;width:${li.pct}%;background:var(--color-accent-300)"></span></div></div>
        <div class="soft-card">${li.rows.map(([i, k, v]) => `<div class="kv">${ic(i)}<span class="muted">${esc(k)}</span><span style="font-weight:600">${esc(v)}</span></div>`).join('')}</div></div>
        ${contacts.length ? `<div class="col"><h6 style="margin:0;padding-top:12px">Who to call</h6>${contacts.map(c => contactRow(c, false)).join('')}</div>` : ''}</div>`);
    },

    async emergency() {
      const list = await API.emergencies.list();
      const tiles = EMERGENCY_TYPES.map(([k, i, l]) => `<button type="button" class="em-tile ${S.emType === k ? 'on' : ''}" data-act="emsel" data-k="${k}" aria-pressed="${S.emType === k}">${ic(i)}<span>${esc(l)}</span></button>`).join('');
      const [, ci, cl] = S.emType ? emType(S.emType) : [0, 'siren', ''];
      const confirm = S.emType ? `<form id="emform" class="em-confirm col" role="alertdialog" aria-label="Confirm emergency alert"><div class="row" style="gap:12px;flex-wrap:nowrap"><span class="tile lg em-ic">${ic(ci)}</span><h3 style="margin:0">Send ${esc(cl)} alert for Flat ${esc(S.me.flat)}?</h3></div>
        <p class="em-warn" style="margin:0">${ic('warning')}The committee is alerted immediately. Only send this in a real emergency. Call the emergency services yourself if someone is in danger.</p>
        <div class="field"><label for="emn">Add a note (optional)</label><textarea class="input" id="emn" name="note" maxlength="500" placeholder="Where you are, what is happening"></textarea></div>
        <div class="row"><button class="btn btn-danger">${ic('siren')}Send alert</button><button type="button" class="btn btn-secondary" data-act="emcancel">Cancel</button></div></form>` : '';
      page(`<div class="col" style="max-width:none;gap:var(--space-4)"><h2>Emergency</h2><p style="margin:0;font-size:18px">Tap what is happening. You will be asked to confirm before the committee is alerted.</p>
        <div class="em-grid">${tiles}</div>${confirm}
        <h6 style="margin:var(--space-4) 0 0">Recent alerts for your flat</h6>${list.map(e => emCard(e)).join('') || '<p class="muted">No alerts raised.</p>'}</div>`);
    },

    async emergencies() {
      const list = await API.emergencies.list();
      const act = list.filter(e => e.status === 'active'), done = list.filter(e => e.status !== 'active');
      page(`<div class="col" style="max-width:none;gap:var(--space-4)"><h2>Emergencies</h2>
        ${act.length ? `<div class="em-banner" role="alert">${ic('siren')}<b>${act.length} active emergenc${act.length > 1 ? 'ies' : 'y'}</b></div>${act.map(emCard).join('')}` : '<p class="callout" style="margin:0">No active emergencies.</p>'}
        <h6 style="margin:var(--space-4) 0 0">Resolved</h6>${done.map(emCard).join('') || '<p class="muted">Nothing resolved yet.</p>'}</div>`);
    },

    async contacts() {
      const cs = await API.contacts.list();
      const icons = (CONTACT_ICONS.length ? CONTACT_ICONS : ['phone']).map(c => Array.isArray(c) ? c : [c, c]);
      if (!isAdmin()) return page(`<div class="col" style="max-width:none;gap:var(--space-4)"><h2>Who to call</h2>${cs.map(c => contactRow(c, false)).join('') || '<p class="muted">No contacts yet.</p>'}</div>`);
      page(`<div class="split-eq" style="grid-template-columns:minmax(0,1fr) minmax(0,440px)"><div class="col"><h2>Society contacts</h2><p class="muted" style="margin:0">Residents see these under "Who to call".</p>${cs.map(c => contactRow(c, true)).join('') || '<p class="muted">No contacts yet.</p>'}</div>
        <form id="cform" class="col"><h3>Add contact</h3><div class="field"><label for="cn">Name</label><input class="input" id="cn" name="name" required maxlength="100"></div><div class="field"><label for="cr">Role</label><input class="input" id="cr" name="role" required maxlength="100" placeholder="Security desk"></div>
        <div class="field"><label for="cp">Phone</label><input class="input" id="cp" name="phone" required maxlength="20" inputmode="tel"></div>
        <div class="field"><label for="ci">Icon</label><select class="input" id="ci" name="icon">${icons.map(([k, l]) => `<option value="${esc(k)}">${esc(l)}</option>`).join('')}</select></div>
        <p class="err" id="cerr" role="alert"></p><div><button class="btn btn-primary">Add contact</button></div></form></div>`);
    },

    async notices() {
      const ns = await API.notices.list();
      const form = isAdmin() ? `<form id="nform" class="col" style="gap:var(--space-4)"><h2>Post a notice</h2><div class="field"><label for="nt">Headline</label><input class="input" id="nt" name="title" required maxlength="150" placeholder="e.g. Diwali lighting in the courtyard"></div>
        <div class="field"><label for="nb">Details</label><textarea class="input" id="nb" name="body" required maxlength="5000"></textarea></div><div class="row"><button class="btn btn-primary">${ic('megaphone')}Post and notify residents</button></div></form>` : '';
      page(isAdmin() ? `<div class="split-eq" style="grid-template-columns:minmax(0,560px) minmax(0,1fr)">${form}<div class="col" style="gap:var(--space-4)"><h6 style="margin:0">On the board</h6>${ns.map(noticeRow).join('') || '<p class="muted">No notices.</p>'}</div></div>`
        : `<div class="col" style="max-width:none;gap:var(--space-4)"><h2>Notice board</h2>${ns.map(n => `<article class="notice-card"><span class="tile lg">${ic(noticeIcon(n))}</span><span class="col" style="gap:4px"><span class="muted sm">${esc(day(n.created_at))} · ${esc(n.author)}</span><span class="list-title" style="font-size:22px">${esc(n.title)}</span><span>${esc(n.body)}</span></span></article>`).join('') || '<p class="muted">No notices.</p>'}</div>`);
    },

    async gatepass() {
      const [passes, me] = await Promise.all([API.gate.passes(), isAdmin() ? Promise.resolve(null) : API.gate.me()]);
      const loc = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
      const now = new Date(), later = new Date(now.getTime() + 864e5);
      const sel = passes.find(p => p.id === S.gpSel) || (S.gpNew && S.gpNew.id === S.gpSel ? S.gpNew : null);
      const tag = p => ({ active: '<span class="tag tag-accent">Active</span>', used: '<span class="tag tag-neutral">Used</span>', cancelled: '<span class="tag tag-danger">Cancelled</span>', expired: '<span class="tag tag-neutral">Expired</span>' }[p.status] || `<span class="tag tag-neutral">${esc(p.status)}</span>`);
      const card = p => {
        const code = gateCode(p.code), when = p.valid_from ? `${stamp(p.valid_from)} to ${stamp(p.valid_until)}` : '';
        const text = `Gate pass for ${p.visitor_name || 'visitor'} at ${SOCIETY.name}. Show this code at the gate: ${code}${when ? '. Valid ' + when : ''}.`;
        const isLive = !p.status || p.status === 'active';
        return `<section class="form-card gate-card col" id="gpcard" aria-label="Gate pass"><div class="row" style="justify-content:space-between"><h3>${esc(p.visitor_name || 'Visitor')}</h3><button class="link-btn" data-act="gpclose">Close</button></div>
          <div class="gate-qr">${HP.qrSvg(p.qr || 'HSP:' + p.token, 260)}</div><div class="gate-code" aria-label="Pass code">${esc(code)}</div>
          <p class="muted" style="margin:0;text-align:center">${p.purpose ? esc(p.purpose) + ' · ' : ''}${esc(when)}</p>
          <div class="row" style="justify-content:center">${isLive ? `<button class="btn btn-primary" data-act="gshare" data-text="${esc(text)}">${ic('share-network')}Share code</button>` : tag(p)}
          ${isLive ? (S.gpCancel === p.id ? `<button class="btn btn-danger" data-act="gpcancel" data-id="${p.id}">Cancel this pass?</button><button class="btn btn-secondary" data-act="gpkeep">Keep</button>` : `<button class="btn btn-secondary" data-act="gpask" data-id="${p.id}">${ic('prohibit')}Cancel pass</button>`) : ''}</div></section>`;
      };
      const row = p => `<button class="list-row ${S.gpSel === p.id ? 'on' : ''}" data-act="gpshow" data-id="${p.id}"><span class="tile">${ic('qr-code')}</span><span class="col" style="gap:4px"><span class="muted xs">${esc(stamp(p.valid_from))} to ${esc(stamp(p.valid_until))}${p.created_by_name ? ' · ' + esc(p.created_by_name) : ''}${isAdmin() ? ' · ' + esc(p.flat) : ''}</span><span class="list-title">${esc(p.visitor_name)}</span><span style="align-self:flex-start">${tag(p)}</span></span></button>`;
      const mine = !me ? '' : `<section class="form-card gate-card col"><h3>My gate QR</h3><p class="muted" style="margin:0">Show this at the gate to walk in. The same code is what gets written to an NFC tag or key fob.</p>
        <div class="gate-qr">${HP.qrSvg(me.qr || 'HSP:' + me.token, 240)}</div>
        <div class="row">${S.gmRot ? `<button class="btn btn-danger" data-act="gmrot">Reset the QR? The old one stops working</button><button class="btn btn-secondary" data-act="gmkeep">Keep</button>` : `<button class="btn btn-secondary" data-act="gmask">${ic('arrows-clockwise')}Reset my QR</button>`}</div></section>`;
      page(`<div class="col" style="max-width:none;gap:var(--space-4)"><h2>Gate pass</h2><div class="split-eq" style="grid-template-columns:minmax(0,480px) minmax(0,1fr);align-items:start">
        <div class="col" style="gap:var(--space-4)"><form id="gpform" class="form-card col"><h3>New visitor pass</h3>
          <div class="field"><label for="gpn">Visitor name</label><input class="input" id="gpn" name="visitor_name" required maxlength="100"></div>
          <div class="field"><label for="gpp">Purpose</label><input class="input" id="gpp" name="purpose" maxlength="100" placeholder="Delivery, guest, plumber"></div>
          <div class="two"><div class="field"><label for="gpf">Valid from</label><input class="input" id="gpf" name="valid_from" type="datetime-local" required value="${loc(now)}"></div>
          <div class="field"><label for="gpu">Valid until</label><input class="input" id="gpu" name="valid_until" type="datetime-local" required value="${loc(later)}"></div></div>
          <p class="err" id="gperr" role="alert"></p><div><button class="btn btn-primary">${ic('qr-code')}Create pass</button></div></form>${mine}</div>
        <div class="col" style="gap:var(--space-4)">${sel ? card(sel) : ''}<h3 style="margin:0">${isAdmin() ? 'All passes' : 'Passes for your flat'}</h3>${passes.map(row).join('') || '<p class="muted">No passes yet.</p>'}</div></div></div>`);
    },

    async gate() {
      page(`<div class="col" style="max-width:none;gap:var(--space-4)"><h2>Gate</h2>
        <form id="gvform" class="gate-verify col" novalidate><label for="gcode" class="gate-lbl">Visitor code or pasted token</label>
          <input class="input gate-input" id="gcode" autocomplete="off" autocapitalize="off" spellcheck="false" maxlength="200" placeholder="000 000">
          <div class="row"><button class="btn btn-primary gate-btn">${ic('shield-check')}Verify</button><button type="button" class="btn btn-secondary gate-btn" data-act="gscan" id="gscanbtn" hidden>${ic('camera')}Scan QR</button></div>
          <p class="muted" id="gnoscan" hidden style="margin:0">Scanning is not supported in this browser; type the code.</p></form>
        <div id="gscanbox" class="gate-scan" hidden><video id="gvideo" playsinline muted></video><button type="button" class="btn btn-secondary" data-act="gscanstop">Stop scanning</button></div>
        <div id="gres" aria-live="assertive"></div>
        <h3 style="margin:0">Recent entries</h3><div id="glog"></div></div>`);
      const can = !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia && window.BarcodeDetector);
      $('#gscanbtn').hidden = !can; $('#gnoscan').hidden = can;
      const i = $('#gcode'); if (i) i.focus();
      await refreshGateLog();
    },

    async gatelog() {
      page('<div class="col" style="max-width:none;gap:var(--space-4)"><h2>Entry log</h2><div id="glog"></div></div>');
      await refreshGateLog();
    },

    async guards() {
      const gs = await API.admin.guards();
      page(`<div class="split-eq" style="grid-template-columns:minmax(0,1fr) minmax(0,480px)"><div class="col"><h2>Gate guards</h2>${S.gdErr ? `<p class="err" role="alert">${esc(S.gdErr)}</p>` : ''}
        ${gs.map(g => `<div class="member" style="grid-template-columns:44px minmax(0,1fr) auto"><span class="avatar light" style="width:44px;height:44px">${esc(initials(g.name))}</span><span class="col" style="gap:0"><span class="list-title" style="font-size:16px">${esc(g.name)}</span><span class="muted sm">${esc(g.email)}</span></span>
          <span class="row" style="gap:var(--space-1);flex-wrap:nowrap">${S.gdDel === g.id ? `<button class="btn btn-danger" data-act="gddel" data-id="${g.id}">Remove ${esc(g.name)}?</button><button class="btn btn-secondary" data-act="gddkeep">Keep</button>` : `<button class="btn btn-secondary" data-act="gddask" data-id="${g.id}" aria-label="Remove ${esc(g.name)}">${ic('trash')}Remove</button>`}</span></div>`).join('') || '<p class="muted">No guards yet.</p>'}</div>
        <form id="gdform" class="form-card col"><h3>Add guard</h3><div class="field"><label for="gdn">Name</label><input class="input" id="gdn" name="name" required maxlength="100"></div>
          <div class="field"><label for="gde">Email</label><input class="input" id="gde" name="email" type="email" required autocomplete="off"></div>
          <div class="field"><label for="gdp">Temporary password (at least 8 characters)</label><input class="input" id="gdp" name="password" type="password" required minlength="8" autocomplete="new-password"></div>
          <p class="err" id="gderr" role="alert"></p><div><button class="btn btn-primary">Add guard</button></div></form></div>`);
    },

    async alerts() {
      const ns = await API.notifications.list();
      page(`<div class="col" style="max-width:none"><h2>Alerts</h2>${ns.map(n => `<p class="row" style="gap:8px;margin:0">${n.is_read ? '' : '<span class="tag tag-accent-2">new</span>'}<span>${esc(n.message)}</span><span class="muted xs">${esc(stamp(n.created_at))}</span></p>`).join('') || '<p class="muted">No alerts.</p>'}</div>`);
      await API.notifications.markRead();
    },

    async dashboard() {
      const [s, reqs, vendors, audit] = await Promise.all([API.admin.stats(), API.requests.list(), API.vendors.list(), API.admin.audit()]);
      const em = (await API.emergencies.list().catch(() => [])).filter(e => e.status === 'active');
      const a = adminSummary(reqs, s), unassigned = a.open.filter(r => !r.vendor_id).length;
      const panels = [{ l: 'Pending approvals', v: String(s.pending_users), s: 'New residents to verify', icon: 'user-check', go: 'approvals' }, { l: 'Unassigned', v: String(unassigned), s: 'Need a vendor today', icon: 'user-gear', go: 'requests' },
        { l: 'Average rating', v: s.avg_rating ? s.avg_rating.toFixed(1) + ' / 5' : '–', s: 'All rated requests', icon: 'star', go: 'dashboard' }, { l: 'Notices, 30 days', v: String(s.notices_30d), s: `${s.households} households reached`, icon: 'megaphone', go: 'notices' }];
      const max = Math.max(1, ...a.weeks);
      const tiles = CATS.map(([k, l, i]) => { const c = s.by_category.find(x => x.category === k) || { open: 0, raised_30d: 0 }; const top = Math.max(1, ...s.by_category.map(x => x.raised_30d));
        return `<button class="cat-tile" data-act="catfilter" data-c="${k}" aria-label="Show open ${l} requests"><div class="row" style="gap:8px;font-weight:600;font-size:14px">${ic(i)}${l}</div><div class="n">${c.open}</div><div class="sm" style="opacity:.82">${c.raised_30d} raised in 30 days</div><div class="bar"><span class="${c.open > 1 ? 'hot' : ''}" style="width:${Math.round(c.raised_30d / top * 100)}%"></span></div></button>`; }).join('');
      const vr = s.vendor_ratings.map(v => `<div class="vbar"><span class="avatar light" style="width:40px;height:40px">${esc(initials(v.name))}</span><span class="col" style="gap:4px"><span class="sm" style="font-weight:600">${esc(v.name)}</span><span class="track"><span style="width:${v.avg ? v.avg / 5 * 100 : 0}%"></span></span></span><span class="list-title" style="text-align:right">${v.avg || '–'}</span></div>`).join('') || '<p class="muted">No vendors yet.</p>';
      const rows = a.open.map(r => `<tr><td>${rid(r)}</td><td><span class="row" style="flex-wrap:nowrap;gap:var(--space-2)"><span style="font-size:22px;color:var(--color-accent-700)">${ic(catIcon(r.category))}</span><span class="col" style="gap:0"><button class="link-btn" style="font-weight:600;text-align:left" data-act="open" data-id="${r.id}" data-page="requests">${esc(r.title)}</button><span class="muted xs">${esc(catLabel(r.category))} · ${esc(r.resident_name)}</span></span></span></td>
        <td>${esc(r.flat)}</td><td class="${overdue(r) ? 'late' : ''}">${ageLabel(r.created_at)}</td><td>${statusTag(r)}</td>
        <td><select class="input" data-change="assign" data-id="${r.id}" aria-label="Assign ${esc(r.title)}">${vendorOptions(vendors, r.vendor_id)}</select></td>
        <td>${r.vendor_id ? `<button class="btn btn-secondary" data-act="move" data-id="${r.id}" data-s="closed">Mark resolved</button>` : ''}</td></tr>`).join('');
      page(`${em.length ? `<button class="em-banner" data-act="nav" data-page="emergencies" role="alert">${ic('siren')}<b>${em.length} active emergenc${em.length > 1 ? 'ies' : 'y'}</b><span>${esc(em.map(e => emType(e.type)[2] + ' · ' + e.flat).join(', '))}</span><span class="em-go">View</span></button>` : ''}<div class="hero"><div class="hero-head"><span class="tile">${ic('clipboard-text')}</span><span class="soft">Open work requests</span><span class="chip">${a.overdue} past 48h SLA</span></div>
        <div class="row" style="justify-content:space-between;flex-wrap:nowrap"><div><div class="fig" style="font-size:72px">${a.open.length} open requests</div><div class="soft" style="font-weight:600;margin-top:8px">${unassigned} unassigned · ${s.awaiting_rating} waiting for resident rating · oldest ${a.oldest}</div></div>
        <div class="ring" style="background:${ring(a.pct)}"><div><b>${a.pct}%</b><span>within 48h SLA</span></div></div></div>${heroPanels(panels)}</div>
        <section class="col"><h3>Open by category</h3><div class="cat-tiles">${tiles}</div></section>
        <div class="dash-mid"><section class="col"><div class="row" style="justify-content:space-between"><h3>Requests raised per week</h3><span class="muted sm">Last 8 weeks</span></div>
          <div class="bars">${a.weeks.map(n => `<div><span>${n}</span><span class="b" style="height:${Math.round(n / max * 140)}px"></span></div>`).join('')}</div>
          <div class="bars" style="height:auto">${a.weeks.map((_, i) => `<span class="muted xs" style="text-align:center">${i === 7 ? 'This wk' : (7 - i) + 'w ago'}</span>`).join('')}</div></section>
          <section class="col"><h3>Vendor ratings</h3>${vr}</section></div>
        <section class="col"><h3>Open requests</h3><div class="table-wrap"><table class="table"><thead><tr><th>ID</th><th>Request</th><th>Flat</th><th>Age</th><th>Status</th><th>Assign to</th><th></th></tr></thead><tbody>${rows || '<tr><td colspan="7" class="muted">All clear.</td></tr>'}</tbody></table></div></section>
        <section class="col" style="max-width:none"><div class="row" style="justify-content:space-between"><h4>Audit trail</h4><button class="link-btn" data-act="nav" data-page="audit">View all</button></div>${audit.slice(0, 6).map(x => `<div class="hist"><span class="muted">${esc(stamp(x.created_at))}</span><span><strong style="font-weight:600">${esc(x.action.replace('_', ' '))}</strong> · ${esc(x.entity)} ${esc(x.entity_id)} — ${esc(x.actor || 'system')}</span></div>`).join('')}</section>`);
    },

    async approvals() {
      const us = (await API.admin.users()).filter(u => u.role !== 'admin');
      const ordered = [...us.filter(u => u.status === 'pending'), ...us.filter(u => u.status !== 'pending').slice(0, 10)];
      page(`<div class="col" style="max-width:none;gap:var(--space-4)"><h2>Approval queue</h2><p style="margin:0">Check each person against the flat register before approving.</p>
        <div class="table-wrap"><table class="table"><thead><tr><th>Resident</th><th>Flat</th><th>Type</th><th>Submitted</th><th></th></tr></thead><tbody>${ordered.map(u => `<tr><td><span class="row" style="gap:var(--space-2);flex-wrap:nowrap"><span class="avatar light">${esc(initials(u.name))}</span><span class="col" style="gap:0"><strong style="font-weight:600">${esc(u.name)}</strong><span class="muted xs">${esc(u.email)}</span></span></span></td>
          <td>${esc(u.flat)}</td><td>${esc(TYPE[u.resident_type] || '')}</td><td>${esc(day(u.created_at))}</td>
          <td>${u.status === 'pending' ? `<span class="row" style="gap:var(--space-1);justify-content:flex-end"><button class="btn btn-primary" data-act="decide" data-id="${u.id}" data-d="approve">Approve</button><button class="btn btn-secondary" data-act="decide" data-id="${u.id}" data-d="reject">Reject</button></span>` : `<span class="tag ${u.status === 'approved' ? 'tag-accent' : 'tag-accent-2'}">${u.status === 'approved' ? 'Approved' : 'Rejected'}</span>`}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No residents yet.</td></tr>'}</tbody></table></div></div>`);
    },

    async leases() {
      const ts = await API.admin.leases();
      const sel = ts.find(t => t.user_id === S.leaseId) || ts[0];
      const row = t => { const li = leaseInfo(t.end_date ? t : null);
        return `<button class="lease-item ${sel && sel.user_id === t.user_id ? 'on' : ''}" data-act="lease" data-id="${t.user_id}"><span class="avatar light" style="width:40px;height:40px">${esc(initials(t.name))}</span>
          <span class="col" style="gap:2px"><span class="list-title" style="font-size:16px">${esc(t.name)}</span><span class="muted xs">Flat ${esc(t.flat)}</span>
          <span style="align-self:flex-start">${li ? `<span class="tag ${li.left < 60 ? 'tag-accent-2' : 'tag-accent'}">${li.left} days left</span>` : '<span class="tag tag-neutral">No lease on file</span>'}</span></span></button>`; };
      page(`<div class="col"><h2>Tenant leases</h2><p class="muted" style="margin:0">Record each tenant's lease after checking the rent agreement. Tenants see these details under "My lease".</p></div>
        ${ts.length ? `<div class="lease-grid"><div class="col" style="gap:var(--space-1)">${ts.map(row).join('')}</div>${leaseForm(sel)}</div>` : '<p class="callout">No approved tenants yet. Approve a tenant first.</p>'}`);
      if (sel) S.leaseId = sel.user_id;
    },

    async vendors() {
      const vs = await API.vendors.list();
      page(`<div class="split-eq" style="grid-template-columns:minmax(0,1fr) minmax(0,480px)"><div class="col"><h2>Vendors</h2>${S.vErr ? `<p class="err" role="alert">${esc(S.vErr)}</p>` : ''}${vs.map(vendorRow).join('') || '<p class="muted">No vendors yet.</p>'}</div>
        <form id="vform" class="col"><h3>Add vendor</h3><div class="field"><label for="vn">Name</label><input class="input" id="vn" name="name" required maxlength="100"></div><div class="field"><label for="vt">Trade</label><input class="input" id="vt" name="trade" required maxlength="50" placeholder="plumbing"></div>
        <div class="field"><label for="vp">Phone</label><input class="input" id="vp" name="phone" maxlength="20"></div><div><button class="btn btn-primary">Add vendor</button></div></form></div>`);
    },

    async audit() {
      const a = await API.admin.audit();
      page(`<div class="col" style="max-width:none"><h2>Audit trail</h2><p class="muted" style="margin:0">Every state change: who, what, when. Latest 200.</p>${a.map(x => `<div class="hist"><span class="muted">${esc(stamp(x.created_at))}</span><span><strong style="font-weight:600">${esc(x.action.replace('_', ' '))}</strong> · ${esc(x.entity)} ${esc(x.entity_id)} ${esc(x.detail || '')} — ${esc(x.actor || 'system')}</span></div>`).join('')}</div>`);
    },
  };
  PAGES.adminNotices = PAGES.notices;
  const vendorRow = v => S.editVendor === v.id
    ? `<form class="member veform" data-id="${v.id}" style="grid-template-columns:minmax(0,1fr);gap:var(--space-2)"><div class="three"><div class="field"><label for="ven${v.id}">Name</label><input class="input" id="ven${v.id}" name="name" required maxlength="100" value="${esc(v.name)}"></div>
      <div class="field"><label for="vet${v.id}">Trade</label><input class="input" id="vet${v.id}" name="trade" required maxlength="50" value="${esc(v.trade)}"></div><div class="field"><label for="vep${v.id}">Phone</label><input class="input" id="vep${v.id}" name="phone" maxlength="20" value="${esc(v.phone || '')}"></div></div>
      <div class="row"><button class="btn btn-primary">Save</button><button type="button" class="btn btn-secondary" data-act="vcancel">Cancel</button></div></form>`
    : `<div class="member" style="grid-template-columns:44px minmax(0,1fr) auto auto"><span class="avatar light" style="width:44px;height:44px">${esc(initials(v.name))}</span><span class="col" style="gap:0"><span class="list-title" style="font-size:16px">${esc(v.name)}</span><span class="muted sm">${esc(v.trade)}</span></span><span class="sm">${esc(v.phone || '')}</span>
      <span class="row" style="gap:var(--space-1);flex-wrap:nowrap">${S.delVendor === v.id ? `<button class="btn btn-danger" data-act="vdel" data-id="${v.id}">Delete ${esc(v.name)}?</button><button class="btn btn-secondary" data-act="vcancel">Keep</button>`
      : `<button class="btn btn-secondary" data-act="vedit" data-id="${v.id}" aria-label="Edit ${esc(v.name)}">${ic('pencil-simple')}Edit</button><button class="btn btn-secondary" data-act="vask" data-id="${v.id}" aria-label="Delete ${esc(v.name)}">${ic('trash')}</button>`}</span></div>`;
  const leaseForm = t => `<form id="leaseform" class="form-card" data-id="${t.user_id}"><div class="row" style="justify-content:space-between"><h3>${esc(t.name)} · Flat ${esc(t.flat)}</h3><span class="ok" id="leaseok"></span></div>
    <div class="two"><div class="field"><label for="ls">Lease starts</label><input class="input" id="ls" name="start_date" type="date" required value="${esc(t.start_date || '')}"></div>
    <div class="field"><label for="le">Lease ends</label><input class="input" id="le" name="end_date" type="date" required value="${esc(t.end_date || '')}"></div></div>
    <div class="two"><div class="field"><label for="lo">Flat owner</label><input class="input" id="lo" name="owner_name" maxlength="100" value="${esc(t.owner_name || '')}"></div>
    <div class="field"><label for="lp">Owner phone</label><input class="input" id="lp" name="owner_phone" maxlength="20" inputmode="tel" value="${esc(t.owner_phone || '')}"></div></div>
    <div class="three"><div class="field"><label for="lv">Police verified on</label><input class="input" id="lv" name="police_verified_on" type="date" value="${esc(t.police_verified_on || '')}"></div>
    <div class="field"><label for="la">Rent agreement</label><input class="input" id="la" name="agreement" maxlength="200" placeholder="Registered, on file" value="${esc(t.agreement || '')}"></div>
    <div class="field"><label for="lk">Parking</label><input class="input" id="lk" name="parking" maxlength="100" placeholder="Slot C-14" value="${esc(t.parking || '')}"></div></div>
    <div class="row"><button class="btn btn-primary">${ic('floppy-disk')}Save lease</button><span class="muted sm">The tenant is notified.</span></div></form>`;

  // ---------- gate helpers
  const gateCode = c => String(c || '').replace(/\D/g, '').replace(/(\d{3})(?=\d)/, '$1 ');
  const logTable = rows => `<div class="table-wrap"><table class="table gate-table"><thead><tr><th>Time</th><th>Who</th><th>Flat</th><th>Result</th><th>Reason</th></tr></thead><tbody>${rows.map(x => `<tr><td>${esc(stamp(x.created_at))}</td><td>${esc(x.subject || '')}</td><td>${esc(x.flat || '')}</td><td><span class="tag ${x.result === 'allowed' ? 'tag-accent' : 'tag-danger'}">${x.result === 'allowed' ? 'Allowed' : 'Denied'}</span></td><td>${esc(x.reason || '')}</td></tr>`).join('') || '<tr><td colspan="5" class="muted">No entries yet.</td></tr>'}</tbody></table></div>`;
  async function refreshGateLog() {
    if (!$('#glog')) return;
    try { const rows = await API.gate.log(); const b = $('#glog'); if (b) b.innerHTML = logTable(rows); } catch (e) { const b = $('#glog'); if (b) b.innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }
  let gateTimer = null;
  function showGateResult(h) {
    const r = $('#gres'); if (!r) return;
    r.innerHTML = h; clearTimeout(gateTimer); gateTimer = setTimeout(() => { const x = $('#gres'); if (x) x.innerHTML = ''; }, 8000);
    const i = $('#gcode'); if (i) { i.value = ''; i.focus(); }
  }
  async function gateVerify(body) {
    stopScan();
    let h;
    try {
      const r = await API.gate.verify(body), ok = r.result === 'allowed';
      const who = r.kind === 'resident' ? [r.name, r.flat ? 'Flat ' + r.flat : ''] : [r.name, r.flat ? 'Visiting flat ' + r.flat : '', r.purpose];
      h = ok ? `<div class="gate-res gate-ok" role="alert">${ic('check-circle')}<div class="gate-big">ALLOWED</div><div class="gate-sub">${who.filter(Boolean).map(esc).join(' · ')}</div></div>`
        : `<div class="gate-res gate-no" role="alert">${ic('x-circle')}<div class="gate-big">DENIED</div><div class="gate-sub">${esc(r.reason || 'This code is not valid.')}</div></div>`;
    } catch (x) { h = `<div class="gate-res gate-no" role="alert">${ic('x-circle')}<div class="gate-big">DENIED</div><div class="gate-sub">${esc(x.message)}</div></div>`; }
    showGateResult(h); await refreshGateLog();
  }
  let scanStream = null, scanOn = false;
  function stopScan() {
    scanOn = false;
    if (scanStream) { scanStream.getTracks().forEach(t => t.stop()); scanStream = null; }
    const v = document.getElementById('gvideo'); if (v) v.srcObject = null;
    const b = document.getElementById('gscanbox'); if (b) b.hidden = true;
  }
  async function startScan() {
    if (scanOn) return;
    try {
      const det = new BarcodeDetector({ formats: ['qr_code'] });
      scanStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      const v = $('#gvideo'); if (!v) return stopScan();
      v.srcObject = scanStream; $('#gscanbox').hidden = false; await v.play(); scanOn = true;
      const loop = async () => {
        if (!scanOn) return;
        try { const f = await det.detect(v); if (f.length && f[0].rawValue) { const val = f[0].rawValue; stopScan(); return gateVerify({ token: val }); } } catch (e) { /* frame not ready */ }
        setTimeout(loop, 250);
      };
      loop();
    } catch (x) { stopScan(); toast('Could not open the camera: ' + (x.message || 'permission denied')); }
  }

  // ---------- events (delegated; no inline handlers under the CSP)
  const ACT = {
    catfilter: el => { S.catFilter = el.dataset.c; S.filter = ''; go('requests'); }, // a category card means all not-yet-closed work in that category
    clearcat: () => { S.catFilter = ''; S.filter = ''; render(); },
    lease: el => { S.leaseId = Number(el.dataset.id); render(); },
    navpos: () => { S.nav.pos = S.nav.pos === 'top' ? 'side' : 'top'; saveNav(); applyNav(); },
    navhide: () => { S.nav.hidden = !S.nav.hidden; saveNav(); applyNav(); if (!S.nav.hidden) { const f = document.querySelector('.side-link.on'); if (f) f.focus(); } },
    nav: el => go(el.dataset.page, el.dataset.sel ? Number(el.dataset.sel) : null),
    open: el => go(el.dataset.page || 'requests', Number(el.dataset.id)),
    logout: async () => { stopScan(); await API.auth.logout(); S.me = null; S.mode = 'login'; render(); },
    pwtoggle: el => { const i = document.getElementById('pw'); if (!i) return; const show = i.type === 'password'; i.type = show ? 'text' : 'password'; el.setAttribute('aria-pressed', String(show)); el.setAttribute('aria-label', show ? 'Hide password' : 'Show password'); el.innerHTML = ic(show ? 'eye-slash' : 'eye'); i.focus(); },
    mode: el => { if (el && el.getAttribute('role') === 'tab' && el.classList.contains('on')) return; S.mode = S.mode === 'login' ? 'register' : 'login'; render(); },
    regtype: el => { S.regType = el.dataset.t; document.querySelectorAll('[data-act=regtype]').forEach(b => b.classList.toggle('on', b === el)); },
    rtype: el => { S.rtype = el.dataset.t; document.querySelectorAll('[data-act=rtype]').forEach(b => b.classList.toggle('on', b === el)); },
    cat: el => { S.cat = el.dataset.c; document.querySelectorAll('[data-act=cat]').forEach(b => { b.classList.toggle('on', b === el); b.setAttribute('aria-pressed', b === el); }); },
    rate: async el => { await API.requests.rate(S.selId, Number(el.dataset.n)); toast('Thanks for rating. Request closed.'); render(); },
    assign: async el => { const v = $('#vs').value; if (!v) return toast('Choose a vendor'); await API.requests.assign(el.dataset.id, Number(v)); toast('Assigned'); render(); },
    move: async el => { await API.requests.setStatus(el.dataset.id, el.dataset.s); toast(el.dataset.s === 'closed' ? 'Marked resolved. The resident can now rate it.' : 'Work started'); render(); },
    emsel: el => { S.emType = el.dataset.k; render().then(() => { const n = $('#emn'); if (n) { n.scrollIntoView({ block: 'center' }); n.focus(); } }); },
    emcancel: () => { S.emType = null; render(); },
    emresolve: async el => { await API.emergencies.resolve(el.dataset.id); toast('Marked resolved'); render(); },
    cask: el => { S.delContact = Number(el.dataset.id); render(); },
    ccancel: () => { S.delContact = null; render(); },
    cdel: async el => { S.delContact = null; await API.contacts.remove(el.dataset.id); toast('Contact deleted'); render(); },
    vedit: el => { S.editVendor = Number(el.dataset.id); S.delVendor = null; S.vErr = ''; render(); },
    vask: el => { S.delVendor = Number(el.dataset.id); S.editVendor = null; S.vErr = ''; render(); },
    vcancel: () => { S.delVendor = S.editVendor = null; S.vErr = ''; render(); },
    vdel: async el => { try { await API.vendors.remove(el.dataset.id); S.delVendor = null; S.vErr = ''; toast('Vendor deleted'); } catch (x) { S.delVendor = null; S.vErr = x.message; } render(); },
    gpshow: el => { S.gpSel = Number(el.dataset.id); S.gpCancel = null; render().then(() => { const c = $('#gpcard'); if (c) c.scrollIntoView({ block: 'center' }); }); },
    gpclose: () => { S.gpSel = null; S.gpCancel = null; render(); },
    gpask: el => { S.gpCancel = Number(el.dataset.id); render(); },
    gpkeep: () => { S.gpCancel = null; render(); },
    gpcancel: async el => { S.gpCancel = null; try { await API.gate.cancel(el.dataset.id); toast('Pass cancelled'); } catch (x) { toast(x.message); } render(); },
    gshare: async el => {
      const text = el.dataset.text;
      if (navigator.share) { try { await navigator.share({ title: 'Gate pass', text }); } catch (x) { /* dismissed */ } return; }
      try { await navigator.clipboard.writeText(text); toast('Pass details copied'); } catch (x) { toast('Could not copy. Read the code out instead.'); }
    },
    gmask: () => { S.gmRot = true; render(); },
    gmkeep: () => { S.gmRot = false; render(); },
    gmrot: async () => { S.gmRot = false; try { await API.gate.rotate(); toast('Your gate QR was reset. Re-write any NFC tag.'); } catch (x) { toast(x.message); } render(); },
    gscan: () => startScan(),
    gscanstop: () => stopScan(),
    gddask: el => { S.gdDel = Number(el.dataset.id); render(); },
    gddkeep: () => { S.gdDel = null; render(); },
    gddel: async el => { S.gdDel = null; try { await API.admin.removeGuard(el.dataset.id); S.gdErr = ''; toast('Guard removed'); } catch (x) { S.gdErr = x.message; } render(); },
    decide: async el => { await API.admin.decide(el.dataset.id, el.dataset.d); toast(el.dataset.d === 'approve' ? 'Approved' : 'Rejected'); render(); },
  };
  document.addEventListener('click', guard(async e => { const el = e.target.closest('[data-act]'); if (el && ACT[el.dataset.act]) { e.preventDefault(); await ACT[el.dataset.act](el); } }));
  document.addEventListener('change', guard(async e => {
    const t = e.target;
    if (t.id === 'fs') { S.filter = t.value; return render(); }
    if (t.id === 'photo') { S.photo = t.files[0] || null; $('#pn').textContent = S.photo ? S.photo.name : 'JPG, PNG or WebP, up to 5 MB';
      const old = $('#drop img'); if (old) old.remove(); if (S.photo) { const img = document.createElement('img'); img.alt = 'Selected photo'; img.src = URL.createObjectURL(S.photo); $('#drop').prepend(img); } return; }
    if (t.dataset.change === 'assign') { if (!t.value) return; await API.requests.assign(t.dataset.id, Number(t.value)); toast('Assigned'); render(); }
  }));
  document.addEventListener('submit', guard(async e => {
    const f = e.target; e.preventDefault();
    const d = Object.fromEntries(new FormData(f));
    if (f.id === 'authform') {
      const err = $('#autherr'); err.textContent = ''; f.classList.remove('shake'); f.classList.add('busy'); const btn = f.querySelector('button.auth-go'); if (btn) btn.disabled = true;
      try {
        if (S.mode === 'login') { S.me = await API.auth.login(d.email, d.password); S.page = home0(); return render(); }
        d.consent = f.consent.checked; d.resident_type = S.regType;
        const r = await API.auth.register(d); S.mode = 'login'; await render(); toast(r.message);
      } catch (x) { err.textContent = x.message; f.classList.remove('busy'); if (btn) btn.disabled = false; void f.offsetWidth; f.classList.add('shake'); }
    } else if (f.id === 'raiseform') {
      const fd = new FormData();
      fd.set('category', S.cat); fd.set('title', d.title);
      fd.set('description', [d.where ? 'Where: ' + d.where : '', d.description].filter(Boolean).join('\n'));
      if (S.photo) fd.set('photo', S.photo);
      const r = await API.requests.create(fd); S.photo = null; toast('Request ' + rid({ id: r.id }) + ' raised'); go('requests', r.id);
    } else if (f.id === 'hhform') {
      d.consent = f.consent.checked; d.resident_type = S.rtype;
      await API.household.add(d); toast('Sent to the committee for approval'); render();
    } else if (f.id === 'leaseform') { await API.admin.setLease(f.dataset.id, d); toast('Lease saved. Tenant notified.'); render();
    } else if (f.id === 'nform') { await API.notices.create(d); toast('Posted. Residents notified.'); render(); }
    else if (f.id === 'emform') { await API.emergencies.raise(S.emType, (d.note || '').trim()); S.emType = null; toast('Alert sent. The committee has been notified.'); render(); }
    else if (f.id === 'cform') { try { await API.contacts.create(d); toast('Contact added'); render(); } catch (x) { $('#cerr').textContent = x.message; } }
    else if (f.classList.contains('veform')) { try { await API.vendors.update(f.dataset.id, d); S.editVendor = null; S.vErr = ''; toast('Vendor saved'); } catch (x) { S.vErr = x.message; } render(); }
    else if (f.id === 'gpform') { try { const r = await API.gate.pass({ visitor_name: (d.visitor_name || '').trim(), purpose: (d.purpose || '').trim(), valid_from: new Date(d.valid_from).toISOString(), valid_until: new Date(d.valid_until).toISOString() }); S.gpSel = r.id; S.gpNew = r; S.gpCancel = null; toast('Gate pass created'); render(); } catch (x) { $('#gperr').textContent = x.message; } }
    else if (f.id === 'gvform') { const inp = $('#gcode'); const v = (inp.value || '').trim(); if (!v) { inp.focus(); return; } await gateVerify(/^[\d\s]+$/.test(v) ? { code: v.replace(/\s+/g, '') } : { token: v }); }
    else if (f.id === 'gdform') { try { await API.admin.addGuard({ name: d.name.trim(), email: d.email.trim(), password: d.password }); S.gdErr = ''; toast('Guard added'); render(); } catch (x) { $('#gderr').textContent = x.message; } }
    else if (f.id === 'vform') { await API.vendors.create(d); toast('Vendor added'); render(); }
  }));

  // Live: redraw quietly (keeping the scroll position) when the server reports a change.
  const poller = HP.live(async () => {
    if (!S.me) return;
    if (S.page === 'gate') return refreshGateLog(); // never redraw the gate page: it would wipe the typed code and the result card
    const pg = $('#page'), top = pg ? pg.scrollTop : 0;
    await render();
    const np = $('#page'); if (np) np.scrollTop = top;
  });

  (async () => {
    try { S.me = await API.auth.me(); S.page = home0(); } catch { S.me = null; }
    render();
  })();
})();
