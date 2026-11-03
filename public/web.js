// Web app (desktop-first, responsive). Phones are sent to the mobile app at /m/ unless ?web is in the URL.
(() => {
  const { $, esc, ic, toast, api, guard, CATS, catLabel, catIcon, TYPE, stamp, day, ageLabel, isOpen, overdue, todayLabel, initials, firstName,
    statusTag, stepper, stars, noticeIcon, photoSlot, residentSummary, adminSummary, ring, rid, SOCIETY, CONTACTS, leaseInfo } = HP;

  if (matchMedia('(max-width: 640px)').matches && !new URLSearchParams(location.search).has('web')) { location.replace('/m/'); return; }

  const root = $('#root');
  const S = { me: null, leaseId: null, catFilter: '', page: 'home', selId: null, cat: 'plumbing', photo: null, rtype: 'family', regType: 'owner', mode: 'login', filter: '' };
  const isAdmin = () => S.me.role === 'admin';
  const NAV = {
    owner: [['home', 'Home', 'house'], ['requests', 'Requests', 'list-checks'], ['raise', 'Raise a request', 'plus-circle'], ['household', 'Household', 'users-three']],
    tenant: [['home', 'Home', 'house'], ['requests', 'Requests', 'list-checks'], ['raise', 'Raise a request', 'plus-circle'], ['lease', 'My lease', 'file-text']],
    family: [['home', 'Home', 'house'], ['requests', 'Flat requests', 'list-checks'], ['raise', 'Raise a request', 'plus-circle'], ['notices', 'Notices', 'megaphone']],
    admin: [['dashboard', 'Dashboard', 'chart-bar'], ['requests', 'Requests', 'list-checks'], ['approvals', 'Approvals', 'user-check'], ['notices', 'Notices', 'megaphone'],
      ['leases', 'Leases', 'file-text'], ['vendors', 'Vendors', 'toolbox'], ['audit', 'Audit trail', 'clock-counter-clockwise']],
  };
  const navFor = () => NAV[isAdmin() ? 'admin' : S.me.resident_type] || NAV.owner;
  const go = (page, selId = null) => { S.page = page; S.selId = selId; render(); window.scrollTo(0, 0); };

  // ---------- shell
  async function render() {
    if (!S.me) return authView();
    let pending = 0;
    if (isAdmin()) pending = (await API.admin.users('pending')).length;
    const nav = navFor().map(([k, label, icon]) => `<button class="btn ${S.page === k ? 'btn-primary' : 'btn-ghost'}" data-act="nav" data-page="${k}" ${S.page === k ? 'aria-current="page"' : ''}>${ic(icon)}${esc(label)}${k === 'approvals' && pending ? `<span class="tag tag-accent-2">${pending}</span>` : ''}</button>`).join('');
    const who = isAdmin() ? `${S.me.name}` : `${S.me.name} · ${S.me.flat}`;
    root.innerHTML = `<div class="web">
      <header class="col" style="gap:var(--space-2)">
        <div class="masthead">
          <div class="row" style="flex-wrap:nowrap"><span class="tile lg" style="background:var(--color-accent-900);color:var(--color-bg);width:52px;height:52px;border-radius:22px">${ic('buildings')}</span>
            <div class="col" style="gap:0"><span class="eyebrow">${esc(SOCIETY.kind)}</span><span class="brand-name">${esc(SOCIETY.name)}</span></div></div>
          <div class="row"><button class="btn btn-ghost" data-act="nav" data-page="alerts" aria-label="Alerts">${ic('bell')}</button>
            <span class="avatar">${esc(initials(S.me.name))}</span><span class="sm">${esc(who)}</span>
            <button class="btn btn-secondary" data-act="logout">Sign out</button></div>
        </div>
        <div class="navrail"><nav aria-label="Main">${nav}</nav><span class="sm row" style="gap:var(--space-3)">${HP.liveBadge()}<i>${esc(todayLabel())} · ${SOCIETY.flats} flats · ${esc(SOCIETY.towers)}</i></span></div>
      </header>
      <main id="page" class="page"></main>
      <footer class="foot muted">Synthetic demo data only · <a href="/m/">Open the mobile app</a></footer></div>`;
    try { await PAGES[S.page](); } catch (e) { $('#page').innerHTML = `<p class="err">${esc(e.message)}</p>`; }
  }
  const page = h => { $('#page').innerHTML = h; };

  // ---------- signed out
  function authView() {
    const login = S.mode === 'login';
    const tiles = [['owner', 'key', 'Owner', 'Holds the sale deed'], ['tenant', 'house-line', 'Tenant', 'Rent agreement'], ['family', 'users', 'Family', 'Added by owner']]
      .map(([k, i, l, s]) => `<button type="button" class="type-tile ${S.regType === k ? 'on' : ''}" data-act="regtype" data-t="${k}">${ic(i)}<b>${l}</b><span>${s}</span></button>`).join('');
    root.innerHTML = `<div class="auth"><section class="auth-art"><span class="eyebrow" style="color:var(--color-accent-300)">${esc(SOCIETY.kind)}</span>
      <h1>${esc(SOCIETY.name)}: one portal for residents and the committee</h1>
      <p style="font-size:18px;max-width:520px" class="soft">Raise a work request with a photo, follow it to completion and rate the work. Read society notices. The committee approves residents, assigns vendors and sees the whole picture.</p>
      <div style="max-width:420px;border-radius:22px;overflow:hidden;height:200px">${photoSlot('Sahyadri Heights')}</div></section>
      <section class="auth-form"><h2>${login ? 'Sign in' : 'Join your society'}</h2>
      <form id="authform" class="col" novalidate>
        ${login ? '' : `<div class="type-tiles" role="group" aria-label="I am a">${tiles}</div>
          <div class="two"><div class="field"><label for="n">Full name</label><input class="input" id="n" name="name" required maxlength="100" autocomplete="name"></div>
          <div class="field"><label for="f">Flat (e.g. B-304)</label><input class="input" id="f" name="flat" required maxlength="20"></div></div>
          <div class="field"><label for="p">Mobile</label><input class="input" id="p" name="phone" maxlength="20" autocomplete="tel"></div>`}
        <div class="field"><label for="e">Email</label><input class="input" id="e" name="email" type="email" required autocomplete="username"></div>
        <div class="field"><label for="pw">Password${login ? '' : ' (at least 8 characters)'}</label><input class="input" id="pw" name="password" type="password" required minlength="${login ? 1 : 8}" autocomplete="${login ? 'current-password' : 'new-password'}"></div>
        ${login ? '' : `<label class="consent"><input type="checkbox" name="consent" required>I consent to ${esc(SOCIETY.name)} storing these details to manage society services, as required under the DPDP Act, 2023.</label>`}
        <p class="err" id="autherr" role="alert"></p>
        <div class="row"><button class="btn btn-primary">${login ? 'Sign in' : 'Send for approval'}</button>
        <button type="button" class="link-btn" data-act="mode">${login ? 'New resident? Register' : 'Already registered? Sign in'}</button></div>
      </form></section></div>`;
  }

  // ---------- helpers
  const heroPanels = ps => `<div class="panels" style="--cols:${ps.length}">${ps.map(p => `<button class="panel" data-act="nav" data-page="${p.go}" ${p.sel ? `data-sel="${p.sel}"` : ''}><div class="l soft">${ic(p.icon)}${esc(p.l)}</div><div class="v">${esc(p.v)}</div><div class="s">${esc(p.s)}</div></button>`).join('')}</div>`;
  const noticeRow = n => `<article class="row" style="flex-wrap:nowrap;align-items:flex-start;cursor:pointer" data-act="nav" data-page="notices" tabindex="0" role="link"><span class="tile" style="width:36px;height:36px;font-size:20px">${ic(noticeIcon(n))}</span>
    <span class="col" style="gap:2px"><span class="muted xs">${esc(day(n.created_at))} · ${esc(n.author)}</span><span class="list-title">${esc(n.title)}</span></span></article>`;
  const reqRow = r => `<button class="list-row ${S.selId === r.id ? 'on' : ''}" data-act="open" data-id="${r.id}"><span class="tile">${ic(catIcon(r.category))}</span>
    <span class="col" style="gap:4px"><span class="muted xs">${rid(r)} · ${esc(catLabel(r.category))} · ${esc(day(r.created_at))}${isAdmin() || S.me.resident_type !== 'tenant' ? ' · ' + esc(r.flat) : ''}</span><span class="list-title">${esc(r.title)}</span><span style="align-self:flex-start">${statusTag(r)}</span></span></button>`;
  const vendorOptions = (vs, cur) => `<option value="">Unassigned</option>${vs.map(v => `<option value="${v.id}" ${cur === v.id ? 'selected' : ''}>${esc(v.name)}</option>`).join('')}`;

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
          <span class="chip">${toRate.length ? toRate.length + ' waiting for your rating' : 'All up to date'}</span></div>
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
      const li = leaseInfo(await API.lease.get());
      if (!li) return page('<h2>Your lease</h2><p class="callout">No lease is on file yet. The committee adds it after verifying your rent agreement.</p>');
      page(`<div class="split-eq" style="grid-template-columns:minmax(0,1fr) minmax(0,1fr)"><div class="col" style="gap:var(--space-4)"><h2>Your lease</h2>
        <div class="hero"><div class="row soft sm" style="gap:8px;font-weight:600">${ic('calendar-check')}Lease on ${esc(S.me.flat)}</div><div class="fig" style="font-size:48px;margin-top:10px">${li.left} days left</div>
        <div class="soft" style="margin-top:6px">Ends ${esc(li.ends)} · renewal notice due by ${esc(li.renewBy)}</div>
        <div style="height:8px;border-radius:8px;background:color-mix(in srgb,var(--color-bg) 22%,transparent);margin-top:18px;overflow:hidden"><span style="display:block;height:100%;width:${li.pct}%;background:var(--color-accent-300)"></span></div></div>
        <div class="soft-card">${li.rows.map(([i, k, v]) => `<div class="kv">${ic(i)}<span class="muted">${esc(k)}</span><span style="font-weight:600">${esc(v)}</span></div>`).join('')}</div></div>
        <div class="col"><h6 style="margin:0;padding-top:12px">Who to call</h6>${CONTACTS.map(([i, n, r, p]) => `<div class="member" style="grid-template-columns:48px minmax(0,1fr) auto"><span class="tile lg" style="width:48px;height:48px;border-radius:50%">${ic(i)}</span><span class="col" style="gap:0"><span class="list-title">${esc(n)}</span><span class="muted sm">${esc(r)}</span></span><span style="font-weight:600;font-size:14px">${esc(p)}</span></div>`).join('')}</div></div>`);
    },

    async notices() {
      const ns = await API.notices.list();
      const form = isAdmin() ? `<form id="nform" class="col" style="gap:var(--space-4)"><h2>Post a notice</h2><div class="field"><label for="nt">Headline</label><input class="input" id="nt" name="title" required maxlength="150" placeholder="e.g. Diwali lighting in the courtyard"></div>
        <div class="field"><label for="nb">Details</label><textarea class="input" id="nb" name="body" required maxlength="5000"></textarea></div><div class="row"><button class="btn btn-primary">${ic('megaphone')}Post and notify residents</button></div></form>` : '';
      page(isAdmin() ? `<div class="split-eq" style="grid-template-columns:minmax(0,560px) minmax(0,1fr)">${form}<div class="col" style="gap:var(--space-4)"><h6 style="margin:0">On the board</h6>${ns.map(noticeRow).join('') || '<p class="muted">No notices.</p>'}</div></div>`
        : `<div class="col" style="max-width:none;gap:var(--space-4)"><h2>Notice board</h2>${ns.map(n => `<article class="notice-card"><span class="tile lg">${ic(noticeIcon(n))}</span><span class="col" style="gap:4px"><span class="muted sm">${esc(day(n.created_at))} · ${esc(n.author)}</span><span class="list-title" style="font-size:22px">${esc(n.title)}</span><span>${esc(n.body)}</span></span></article>`).join('') || '<p class="muted">No notices.</p>'}</div>`);
    },

    async alerts() {
      const ns = await API.notifications.list();
      page(`<div class="col" style="max-width:none"><h2>Alerts</h2>${ns.map(n => `<p class="row" style="gap:8px;margin:0">${n.is_read ? '' : '<span class="tag tag-accent-2">new</span>'}<span>${esc(n.message)}</span><span class="muted xs">${esc(stamp(n.created_at))}</span></p>`).join('') || '<p class="muted">No alerts.</p>'}</div>`);
      await API.notifications.markRead();
    },

    async dashboard() {
      const [s, reqs, vendors, audit] = await Promise.all([API.admin.stats(), API.requests.list(), API.vendors.list(), API.admin.audit()]);
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
      page(`<div class="hero"><div class="hero-head"><span class="tile">${ic('clipboard-text')}</span><span class="soft">Open work requests · ${esc(SOCIETY.towers)}</span><span class="chip">${a.overdue} past 48h SLA</span></div>
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
      page(`<div class="split-eq" style="grid-template-columns:minmax(0,1fr) minmax(0,480px)"><div class="col"><h2>Vendors</h2>${vs.map(v => `<div class="member" style="grid-template-columns:44px minmax(0,1fr) auto"><span class="avatar light" style="width:44px;height:44px">${esc(initials(v.name))}</span><span class="col" style="gap:0"><span class="list-title" style="font-size:16px">${esc(v.name)}</span><span class="muted sm">${esc(v.trade)}</span></span><span class="sm">${esc(v.phone || '')}</span></div>`).join('') || '<p class="muted">No vendors yet.</p>'}</div>
        <form id="vform" class="col"><h3>Add vendor</h3><div class="field"><label for="vn">Name</label><input class="input" id="vn" name="name" required maxlength="100"></div><div class="field"><label for="vt">Trade</label><input class="input" id="vt" name="trade" required maxlength="50" placeholder="plumbing"></div>
        <div class="field"><label for="vp">Phone</label><input class="input" id="vp" name="phone" maxlength="20"></div><div><button class="btn btn-primary">Add vendor</button></div></form></div>`);
    },

    async audit() {
      const a = await API.admin.audit();
      page(`<div class="col" style="max-width:none"><h2>Audit trail</h2><p class="muted" style="margin:0">Every state change: who, what, when. Latest 200.</p>${a.map(x => `<div class="hist"><span class="muted">${esc(stamp(x.created_at))}</span><span><strong style="font-weight:600">${esc(x.action.replace('_', ' '))}</strong> · ${esc(x.entity)} ${esc(x.entity_id)} ${esc(x.detail || '')} — ${esc(x.actor || 'system')}</span></div>`).join('')}</div>`);
    },
  };
  PAGES.adminNotices = PAGES.notices;
  const leaseForm = t => `<form id="leaseform" class="form-card" data-id="${t.user_id}"><div class="row" style="justify-content:space-between"><h3>${esc(t.name)} · Flat ${esc(t.flat)}</h3><span class="ok" id="leaseok"></span></div>
    <div class="two"><div class="field"><label for="ls">Lease starts</label><input class="input" id="ls" name="start_date" type="date" required value="${esc(t.start_date || '')}"></div>
    <div class="field"><label for="le">Lease ends</label><input class="input" id="le" name="end_date" type="date" required value="${esc(t.end_date || '')}"></div></div>
    <div class="two"><div class="field"><label for="lo">Flat owner</label><input class="input" id="lo" name="owner_name" maxlength="100" value="${esc(t.owner_name || '')}"></div>
    <div class="field"><label for="lp">Owner phone</label><input class="input" id="lp" name="owner_phone" maxlength="20" inputmode="tel" value="${esc(t.owner_phone || '')}"></div></div>
    <div class="three"><div class="field"><label for="lv">Police verified on</label><input class="input" id="lv" name="police_verified_on" type="date" value="${esc(t.police_verified_on || '')}"></div>
    <div class="field"><label for="la">Rent agreement</label><input class="input" id="la" name="agreement" maxlength="200" placeholder="Registered, on file" value="${esc(t.agreement || '')}"></div>
    <div class="field"><label for="lk">Parking</label><input class="input" id="lk" name="parking" maxlength="100" placeholder="Slot C-14" value="${esc(t.parking || '')}"></div></div>
    <div class="row"><button class="btn btn-primary">${ic('floppy-disk')}Save lease</button><span class="muted sm">The tenant is notified.</span></div></form>`;

  // ---------- events (delegated; no inline handlers under the CSP)
  const ACT = {
    catfilter: el => { S.catFilter = el.dataset.c; S.filter = ''; go('requests'); }, // a category card means all not-yet-closed work in that category
    clearcat: () => { S.catFilter = ''; S.filter = ''; render(); },
    lease: el => { S.leaseId = Number(el.dataset.id); render(); },
    nav: el => go(el.dataset.page, el.dataset.sel ? Number(el.dataset.sel) : null),
    open: el => go(el.dataset.page || 'requests', Number(el.dataset.id)),
    logout: async () => { await API.auth.logout(); S.me = null; S.mode = 'login'; render(); },
    mode: () => { S.mode = S.mode === 'login' ? 'register' : 'login'; render(); },
    regtype: el => { S.regType = el.dataset.t; document.querySelectorAll('[data-act=regtype]').forEach(b => b.classList.toggle('on', b === el)); },
    rtype: el => { S.rtype = el.dataset.t; document.querySelectorAll('[data-act=rtype]').forEach(b => b.classList.toggle('on', b === el)); },
    cat: el => { S.cat = el.dataset.c; document.querySelectorAll('[data-act=cat]').forEach(b => { b.classList.toggle('on', b === el); b.setAttribute('aria-pressed', b === el); }); },
    rate: async el => { await API.requests.rate(S.selId, Number(el.dataset.n)); toast('Thanks for rating. Request closed.'); render(); },
    assign: async el => { const v = $('#vs').value; if (!v) return toast('Choose a vendor'); await API.requests.assign(el.dataset.id, Number(v)); toast('Assigned'); render(); },
    move: async el => { await API.requests.setStatus(el.dataset.id, el.dataset.s); toast(el.dataset.s === 'closed' ? 'Marked resolved. The resident can now rate it.' : 'Work started'); render(); },
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
      const err = $('#autherr'); err.textContent = '';
      try {
        if (S.mode === 'login') { S.me = await API.auth.login(d.email, d.password); S.page = isAdmin() ? 'dashboard' : 'home'; return render(); }
        d.consent = f.consent.checked; d.resident_type = S.regType;
        const r = await API.auth.register(d); S.mode = 'login'; await render(); toast(r.message);
      } catch (x) { err.textContent = x.message; }
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
    else if (f.id === 'vform') { await API.vendors.create(d); toast('Vendor added'); render(); }
  }));

  // Live: redraw quietly (keeping the scroll position) when the server reports a change.
  const poller = HP.live(async () => {
    if (!S.me) return;
    const pg = $('#page'), top = pg ? pg.scrollTop : 0;
    await render();
    const np = $('#page'); if (np) np.scrollTop = top;
  });

  (async () => {
    try { S.me = await API.auth.me(); S.page = isAdmin() ? 'dashboard' : 'home'; } catch { S.me = null; }
    render();
  })();
})();
