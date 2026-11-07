// Airbnb-style dashboards: resident Home and committee Dashboard. Loaded after web.js; registers pages on window.HPWeb.
// Layout: greeting, a pill search bar, a row of round shortcut chips, then titled carousels of large cards.
(() => {
  const W = window.HPWeb; if (!W) return;
  const { esc, ic, toast, catIcon, catLabel, statusTag, stamp, day, ageLabel, isOpen, overdue, initials, firstName, noticeIcon, rid, stageOf, TYPE, leaseInfo, adminSummary, residentSummary, ring, todayLabel } = HP;
  const { S, PAGES, ACT, page, go, can, feat, allowed, isAdmin } = W;
  const D = { reqs: [], notices: [], people: [] };
  S.dq = '';

  // ---------- building blocks
  const search = ph => `<div class="field ds-bar"><label class="sr" for="dsearch">Search</label><span class="ds-bar-i">${ic('magnifying-glass')}</span>
    <input class="ds-input" id="dsearch" type="search" autocomplete="off" placeholder="${esc(ph)}" value="${esc(S.dq)}" aria-controls="dresults"><div id="dresults" class="ds-results" aria-live="polite">${results(S.dq)}</div></div>`;
  const chips = list => `<nav class="ds-chips" aria-label="Shortcuts">${list.filter(c => c.show !== false).map(c => `<button type="button" class="ds-chip" data-act="${c.act || 'nav'}" data-page="${c.go}" ${c.sel ? `data-sel="${c.sel}"` : ''}><span class="ds-chip-i">${ic(c.icon)}${c.n ? `<b class="ds-badge">${esc(c.n)}</b>` : ''}</span><span class="ds-chip-t">${esc(c.l)}</span></button>`).join('')}</nav>`;
  const section = (title, body, more) => `<section class="ds-sec"><div class="ds-sec-h"><h2>${esc(title)}</h2>${more ? `<button type="button" class="ds-more" data-act="nav" data-page="${more}">Show all${ic('caret-right')}</button>` : ''}</div>${body}</section>`;
  const carousel = (cards, label) => `<div class="ds-row" role="region" aria-label="${esc(label)}" tabindex="0">${cards.join('')}</div>`;
  // Card art: 'dark' = solid dark teal (primary), 'tint' = soft teal. A request photo wins; otherwise the category photo; otherwise the icon on the solid colour.
  const art = (icon, kind, photoId, cat) => `<div class="ds-art ${kind === 'tint' ? 'art-tint' : 'art-dark'}">${photoId ? `<img src="${API.requests.photoUrl(photoId)}" alt="" loading="lazy">` : `${cat ? W.catPic(cat) : ''}<span class="cat-ic">${ic(icon)}</span>`}</div>`;
  const prog = r => { const n = stageOf(r); return `<span class="ds-prog" aria-hidden="true">${[0, 1, 2, 3, 4].map(i => `<i class="${i <= n ? 'on' : ''}"></i>`).join('')}</span>`; };
  const reqCard = r => `<button type="button" class="ds-card" data-act="open" data-id="${r.id}">${art(catIcon(r.category), 'dark', r.has_photo ? r.id : 0, r.category)}
    <span class="ds-body"><span class="ds-meta">${rid(r)} · ${esc(catLabel(r.category))} · ${esc(ageLabel(r.created_at))}</span><span class="ds-title">${esc(r.title)}</span><span class="ds-foot">${r.can_rate ? '<span class="tag tag-accent-2">Rate the work</span>' : statusTag(r)}</span>${prog(r)}</span></button>`;
  const ctaCard = (icon, title, sub, pg) => `<button type="button" class="ds-card ds-cta" data-act="nav" data-page="${pg}">${art(icon, 'tint')}<span class="ds-body"><span class="ds-title">${esc(title)}</span><span class="ds-meta">${esc(sub)}</span></span></button>`;
  const noticeCard = n => `<button type="button" class="ds-card" data-act="nav" data-page="notices">${art(noticeIcon(n), 'tint')}<span class="ds-body"><span class="ds-meta">${esc(day(n.created_at))} · ${esc(n.author)}</span><span class="ds-title">${esc(n.title)}</span></span></button>`;
  // Category photo card (4:3 photo, dark strip with the label and count); falls back to solid dark teal with the icon when the photo is missing.
  const catCard = (k, l, i, open, raised) => `<button type="button" class="cat-photo ds-catcard" data-act="catfilter" data-c="${k}" aria-label="Show open ${esc(l)} requests">${W.catPic(k)}<span class="cat-ic">${ic(i)}</span><span class="cat-strip"><b>${esc(l)}</b><span>${open} open · ${raised} in 30 days</span></span></button>`;
  const stat = (cls, icon, n, label, sub, pg) => `<button type="button" class="ds-stat ${cls}" data-act="nav" data-page="${pg}"><span class="ds-stat-i">${ic(icon)}</span><span class="ds-stat-n">${esc(n)}</span><span class="ds-stat-l">${esc(label)}</span><span class="ds-stat-s">${esc(sub)}</span></button>`;
  // Channel card: lists the requests that arrived on that channel (setup stays in Settings, not here).
  // Glows when the channel's count is higher than what the committee last viewed (unseen requests).
  const chanCard = (cls, icon, n, label, sub, src) => {
    let seen = 0; try { seen = +(localStorage.getItem('hp.seen.' + src) || 0); } catch {}
    const glow = (Number(n) || 0) > seen;
    return `<button type="button" class="ds-stat ${cls}${glow ? ' ds-glow' : ''}" data-act="srcfilter" data-src="${src}" data-count="${esc(n)}">${glow ? '<span class="ds-dot" aria-hidden="true"></span>' : ''}<span class="ds-stat-i">${ic(icon)}</span><span class="ds-stat-n">${esc(n)}</span><span class="ds-stat-l">${esc(label)}</span><span class="ds-stat-s">${esc(sub)}</span></button>`;
  };

  // ---------- search (requests, notices, people)
  function results(q) {
    q = String(q || '').trim().toLowerCase(); if (!q) return '';
    const has = (...xs) => xs.some(x => String(x == null ? '' : x).toLowerCase().includes(q));
    const rq = D.reqs.filter(r => has(r.title, r.description, r.category, catLabel(r.category), r.flat, rid(r), r.resident_name)).slice(0, 5);
    const nt = D.notices.filter(n => has(n.title, n.body)).slice(0, 4);
    const pp = D.people.filter(p => has(p.name, p.flat, p.email)).slice(0, 5);
    const row = (icon, act, attrs, t, s) => `<button type="button" class="ds-hit" data-act="${act}" ${attrs}><span class="ds-hit-i">${ic(icon)}</span><span class="col" style="gap:0"><b>${esc(t)}</b><span class="muted sm">${esc(s)}</span></span></button>`;
    const grp = (t, rows) => rows.length ? `<div class="ds-grp"><h3>${t}</h3>${rows.join('')}</div>` : '';
    const out = grp('Requests', rq.map(r => row(catIcon(r.category), 'open', `data-id="${r.id}"`, r.title, `${rid(r)} · ${catLabel(r.category)} · Flat ${r.flat}`)))
      + grp('Notices', nt.map(n => row(noticeIcon(n), 'nav', 'data-page="notices"', n.title, day(n.created_at))))
      + grp('People', pp.map(p => isAdmin() ? row('user', 'dperson', `data-q="${esc(p.name)}"`, p.name, `${TYPE[p.resident_type] || p.role} · ${p.flat || ''}`) : row('user', 'nav', 'data-page="household"', p.name, TYPE[p.resident_type] || '')));
    return out || `<p class="muted ds-none">Nothing matches "${esc(q)}".</p>`;
  }
  document.addEventListener('input', e => { if (e.target.id !== 'dsearch') return; S.dq = e.target.value; const r = document.getElementById('dresults'); if (r) r.innerHTML = results(S.dq); });
  ACT.dperson = el => { S.setSec = 'users'; S.suq = el.dataset.q; go('settings'); };

  // ---------- resident Home
  PAGES.home = async () => {
    const t = S.me.resident_type;
    const gateOn = allowed('gatepass');
    const [reqs, notices, passes, hh, lease] = await Promise.all([API.requests.list(), allowed('notices') || t === 'family' ? API.notices.list().catch(() => []) : API.notices.list().catch(() => []),
      gateOn ? API.gate.passes().catch(() => []) : [], t === 'tenant' ? [] : API.household.list().catch(() => []), t === 'tenant' && allowed('lease') ? API.lease.get().catch(() => null) : null]);
    const sorted = [...reqs].sort((x, y) => isOpen(y) - isOpen(x) || y.id - x.id);
    D.reqs = reqs; D.notices = notices; D.people = hh;
    const { toRate } = residentSummary(reqs, S.me, notices);
    const open = reqs.filter(isOpen).length;
    const chipList = [
      { l: 'Requests', icon: 'list-checks', go: 'requests', n: toRate.length || '' }, { l: 'Raise', icon: 'plus-circle', go: 'raise', show: allowed('raise') },
      { l: 'Emergency', icon: 'siren', go: 'emergency', show: allowed('emergency') }, { l: 'Gate pass', icon: 'qr-code', go: 'gatepass', show: gateOn },
      { l: 'Vehicles', icon: 'car', go: 'vehicles', show: allowed('vehicles') }, { l: 'Parking', icon: 'garage', go: 'parking', show: allowed('parking') },
      { l: 'Household', icon: 'users-three', go: 'household', show: allowed('household') && t === 'owner' }, { l: 'Contacts', icon: 'phone-call', go: 'contacts', show: allowed('contacts') },
      { l: 'Notices', icon: 'megaphone', go: 'notices', show: allowed('notices') }, { l: 'Alerts', icon: 'bell', go: 'alerts' }];
    const activePasses = passes.filter(p => p.status === 'active').length;
    const attn = [stat(open ? 's-dark' : 's-tint', 'list-checks', open, 'Open requests', open ? 'Being worked on' : 'Nothing pending', 'requests'), stat(toRate.length ? 's-dark' : 's-tint', 'star', toRate.length, 'To rate', toRate.length ? 'Rate the finished work' : 'All rated', 'requests')];
    if (gateOn) attn.push(stat('s-white', 'qr-code', activePasses, 'Active passes', activePasses ? 'Visitors can walk in' : 'No visitor passes', 'gatepass'));
    if (feat('emergency') && allowed('emergency')) attn.push(stat('s-white', 'siren', '', 'Emergency', 'Raise an alert', 'emergency'));
    const rcards = sorted.slice(0, 12).map(reqCard);
    if (allowed('raise')) rcards.push(ctaCard('plus-circle', rcards.length ? 'Raise another' : 'Raise your first request', 'Takes a minute', 'raise'));
    const parts = [section('Your requests', carousel(rcards.length ? rcards : ['<div class="ds-card ds-empty"><span class="ds-body"><span class="ds-title">No requests yet</span><span class="ds-meta">Nothing raised for your flat.</span></span></div>'], 'Your requests'), 'requests')];
    if (feat('notices') && allowed('notices') !== false && notices.length) parts.push(section('Notices', carousel(notices.slice(0, 10).map(noticeCard), 'Notices'), 'notices'));
    if (gateOn) {
      const pc = passes.slice(0, 8).map(p => `<button type="button" class="ds-card" data-act="dpass" data-id="${p.id}">${art('qr-code', 'tint')}<span class="ds-body"><span class="ds-meta">${esc(stamp(p.valid_from))}</span><span class="ds-title">${esc(p.visitor_name)}</span><span class="ds-foot"><span class="tag ${p.status === 'active' ? 'tag-accent' : 'tag-neutral'}">${esc(p.status)}</span></span></span></button>`);
      pc.unshift(ctaCard('qr-code', 'New visitor pass', 'Share a QR or code', 'gatepass'));
      parts.push(section('Visitors and passes', carousel(pc, 'Visitors and passes'), 'gatepass'));
    }
    const hc = [];
    if (t === 'tenant') { const li = leaseInfo(lease); hc.push(ctaCard('file-text', li ? `${li.left} days left` : 'Your lease', li ? 'Ends ' + li.ends : 'Not on file yet', 'lease')); }
    else {
      hh.forEach((m, i) => hc.push(`<div class="ds-card ds-person"><span class="ds-avatar">${esc(initials(m.name))}</span><span class="ds-body"><span class="ds-title">${esc(m.name)}</span><span class="ds-meta">${esc(TYPE[m.resident_type] || m.resident_type)}${m.status !== 'approved' ? ' · pending approval' : ''}</span></span></div>`));
      if (allowed('household') && t === 'owner') hc.push(ctaCard('user-plus', 'Add someone', 'Family or tenant', 'household'));
    }
    if (hc.length) parts.push(section('Your household', carousel(hc, 'Your household'), allowed('household') && t === 'owner' ? 'household' : ''));
    page(`<div class="ds">
      <header class="ds-hello"><div><h1>Hello, ${esc(firstName(S.me.name))}</h1><p class="muted">Flat ${esc(S.me.flat)} · ${esc(todayLabel())}</p></div>
        <div class="ds-hello-r">${HP.liveBadge()}<span class="ds-sum">${open} open${toRate.length ? ' · ' + toRate.length + ' to rate' : ''}</span></div></header>
      ${search('Search requests, notices and people')}${chips(chipList)}
      ${section('Needs your attention', `<div class="ds-row ds-attn" role="region" aria-label="Needs your attention" tabindex="0">${attn.join('')}</div>`)}${parts.join('')}</div>`);
  };
  ACT.dpass = el => { S.gpSel = Number(el.dataset.id); S.gpCancel = null; go('gatepass', null); };

  // ---------- committee: Estate at a glance (one overview call; skipped silently when it failed)
  const num = v => Number(v) || 0;
  const gcard = (icon, n, label, sub, pg, bar) => `<button type="button" class="eg-card" data-act="nav" data-page="${pg}"><span class="eg-ic">${ic(icon)}</span><span class="eg-n">${esc(n)}</span><span class="eg-l">${esc(label)}</span><span class="eg-s">${esc(sub)}</span>${bar == null ? '' : `<span class="eg-bar" aria-hidden="true"><i style="width:${Math.max(0, Math.min(100, bar))}%"></i></span>`}</button>`;
  function glance(o) {
    if (!o || typeof o !== 'object') return '';
    try {
      const r = o.residents || {}, q = o.requests || {}, g = o.gate || {}, e = o.estate || {}, l = o.leases || {}, n = o.notices || {};
      const gateOn = feat('gate'), parkOn = feat('parking');
      const pend = num(r.pending), tot = num(e.parking_total), asg = num(e.parking_assigned);
      const c = [gcard('users', num(r.approved), 'Residents', `${num(r.owners)} owners · ${num(r.tenants)} tenants · ${num(r.family)} family${pend ? ` · ${pend} pending` : ''}`, pend ? 'approvals' : 'users'),
        gcard('buildings', num(r.flats), 'Flats', 'occupied', 'users'),
        gcard('list-checks', num(q.open), 'Open requests', `${num(q.unassigned)} unassigned · ${num(q.in_progress)} in progress`, 'requests')];
      if (gateOn) c.push(gcard('shield-check', num(g.admitted_today), 'Gate today', `${num(g.denied_today)} denied`, 'gate'), gcard('qr-code', num(g.active_passes), 'Active passes', 'visitor passes', 'gate'), gcard('identification-card', num(g.guards), 'Guards', 'on the roster', 'guards'));
      if (parkOn) c.push(gcard('car', num(e.vehicles), 'Vehicles', 'registered', 'vehicles'), gcard('garage', `${asg}/${tot}`, 'Parking', `${Math.max(0, tot - asg)} free`, 'parking', tot ? asg / tot * 100 : 0));
      c.push(gcard('hard-hat', num(e.workers_active), 'Workers', `${num(e.workers_inactive)} inactive`, 'workers'), gcard('toolbox', num(e.vendors), 'Vendors', 'on the list', 'vendors'),
        gcard('file-text', num(l.ending_60d), 'Leases ending in 60 days', `${num(l.tenants_without_lease)} tenants without a lease`, 'leases'), gcard('megaphone', num(n.last_30d), 'Notices', 'last 30 days', 'notices'));
      return section('Estate at a glance', `<div class="eg-grid">${c.join('')}</div>`);
    } catch { return ''; }
  }

  // ---------- new-request alert: a short chime + a 3s pop-up, then the matching card flashes
  let actx;
  function chime(urgent) {
    try {
      actx = actx || new (window.AudioContext || window.webkitAudioContext)();
      if (actx.state === 'suspended') actx.resume();
      const t0 = actx.currentTime;
      // Emergency: a harsh, loud, repeating two-tone alarm. Normal: a soft, gentle two-note.
      const notes = urgent ? [988, 740, 988, 740, 988, 740] : [587, 784];
      notes.forEach((f, i) => {
        const o = actx.createOscillator(), g = actx.createGain(), t = t0 + i * (urgent ? 0.17 : 0.15);
        o.type = urgent ? 'square' : 'sine'; o.frequency.value = f;
        const peak = urgent ? 0.32 : 0.09, tail = urgent ? 0.15 : 0.32;
        g.gain.setValueAtTime(0.0001, t); g.gain.linearRampToValueAtTime(peak, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + tail);
        o.connect(g); g.connect(actx.destination); o.start(t); o.stop(t + tail + 0.02);
      });
    } catch {}
  }
  function requestPop(r) {
    const urgent = r.category === 'security' || (r.ai && r.ai.priority === 'urgent');
    const destLabel = urgent ? 'Emergencies' : catLabel(r.category);
    const destSel = urgent ? '.ds-stat[data-page="emergencies"]' : `.ds-catcard[data-c="${r.category}"]`;
    const channel = r.source === 'telegram' ? 'Telegram' : r.source === 'whatsapp' ? 'WhatsApp' : 'the app';
    chime(urgent);
    const el = document.createElement('div');
    el.className = 'rq-pop' + (urgent ? ' rq-pop-urgent' : '');
    el.setAttribute('role', 'alert');
    el.innerHTML = `<div class="rq-pop-card"><span class="rq-pop-ic">${ic(urgent ? 'siren' : catIcon(r.category))}</span>
      <div class="rq-pop-b"><span class="rq-pop-k">New request · via ${esc(channel)}</span><span class="rq-pop-t">${esc(r.title)}</span>
      <span class="rq-pop-m">${esc(rid(r))} · Flat ${esc(r.flat || '-')} · <b>&rarr; ${esc(destLabel)}</b></span></div></div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('on'));
    const dest = document.querySelector(destSel);
    if (dest) { dest.classList.add('rq-flash'); setTimeout(() => dest.classList.remove('rq-flash'), 5200); }
    setTimeout(() => { el.classList.remove('on'); setTimeout(() => el.remove(), 300); }, 5000);
  }
  // The dashboard re-renders on every data change (the live pulse). On each render, announce any request
  // whose id is newer than the last one we announced (D.announcedId persists across renders).
  function announceNew(reqs) {
    const maxId = Math.max(0, ...reqs.map(r => r.id || 0));
    if (D.announcedId == null) { D.announcedId = maxId; return; } // baseline on first load, don't pop existing
    if (maxId > D.announcedId) {
      reqs.filter(r => (r.id || 0) > D.announcedId).sort((a, b) => a.id - b.id).slice(-3).forEach(requestPop);
      D.announcedId = maxId;
    }
  }

  // ---------- committee Dashboard
  PAGES.dashboard = async () => {
    const [s, reqs, vendors, audit] = await Promise.all([API.admin.stats(), API.requests.list(), API.vendors.list(), API.admin.audit()]);
    const em = feat('emergency') ? (await API.emergencies.list().catch(() => [])).filter(e => e.status === 'active') : [];
    const ov = await API.admin.overview().catch(() => null);
    const people = await API.admin.allUsers().catch(() => []);
    D.reqs = reqs; D.people = Array.isArray(people) ? people : []; D.notices = await API.notices.list().catch(() => []);
    const a = adminSummary(reqs, s), unassigned = a.open.filter(r => !r.vendor_id);
    const chipList = [{ l: 'Approvals', icon: 'user-check', go: 'approvals', n: s.pending_users || '' }, { l: 'Requests', icon: 'list-checks', go: 'requests' },
      { l: 'Emergencies', icon: 'siren', go: 'emergencies', n: em.length || '', show: feat('emergency') }, { l: 'Notices', icon: 'megaphone', go: 'notices', show: feat('notices') },
      { l: 'Vehicles', icon: 'car', go: 'vehicles', show: allowed('vehicles') }, { l: 'Parking', icon: 'garage', go: 'parking', show: allowed('parking') }, { l: 'Workers', icon: 'hard-hat', go: 'workers' },
      { l: 'Vendors', icon: 'toolbox', go: 'vendors' }, { l: 'Gate', icon: 'shield-check', go: 'gate', show: feat('gate') }, { l: 'Guards', icon: 'identification-card', go: 'guards' }, { l: 'Settings', icon: 'gear-six', go: 'settings' }];
    const attn = [stat(s.pending_users ? 's-dark ds-glow' : 's-tint', 'user-check', s.pending_users, 'Pending approvals', s.pending_users ? 'New residents to verify' : 'All caught up', 'approvals')];
    if (feat('emergency')) attn.push(stat(em.length ? 's-red ds-glow-red' : 's-tint', 'siren', em.length, 'Active emergencies', em.length ? em.map(e => W.emType(e.type)[2] + (e.flat ? ' · ' + e.flat : '')).slice(0, 2).join(', ') : 'None right now', 'emergencies'));
    attn.push(stat(unassigned.length ? 's-dark ds-glow' : 's-tint', 'user-gear', unassigned.length, 'Unassigned requests', unassigned.length ? 'Need a vendor' : 'Everything has a vendor', 'requests'));
    attn.push(`<div class="ds-stat s-white s-ring${a.overdue ? ' ds-glow-red' : ''}"><span class="ds-ringbox" style="background:${ring(a.pct)}"><span><b>${a.pct}%</b></span></span><span class="ds-stat-l">Within 48h SLA</span><span class="ds-stat-s">${a.overdue} past SLA · oldest ${esc(a.oldest)}</span></div>`);
    if (ov && ov.ai) {
      const ai = ov.ai, hot = (ai.urgent_open || 0) + (ai.escalated_open || 0), tg = ai.telegram_requests_30d || 0;
      attn.unshift(chanCard(tg ? 's-dark' : 's-tint', 'telegram-logo', tg, 'Via Telegram', tg ? 'Tap to see them' : 'Free LLM gate is on', 'telegram'));
      attn.unshift(chanCard(hot ? 's-dark' : 's-tint', 'chat-circle-text', ai.whatsapp_requests_30d, 'Via WhatsApp', hot ? `${ai.urgent_open} urgent · ${ai.escalated_open} escalated` : (ai.whatsapp_requests_30d ? 'Tap to see them' : 'AI triage is on'), 'whatsapp'));
    }
    const max = Math.max(1, ...a.weeks), total = a.weeks.reduce((x, y) => x + y, 0);
    const chart = `<div class="ds-chart"><div class="ds-chart-h"><div><div class="ds-big">${a.weeks[7]}</div><div class="muted sm">raised this week · ${total} in 8 weeks</div></div></div>
      <div class="ds-bars" role="img" aria-label="Requests raised per week, last 8 weeks: ${a.weeks.join(', ')}">${a.weeks.map((n, i) => `<div class="ds-bar-c"><span class="muted xs">${n}</span><span class="ds-bar-b ${i === 7 ? 'now' : ''}" style="height:${Math.max(4, Math.round(n / max * 110))}px"></span><span class="muted xs">${i === 7 ? 'Now' : (7 - i) + 'w'}</span></div>`).join('')}</div></div>`;
    const catCards = HP.CATS.map(([k, l, i]) => { const c = s.by_category.find(x => x.category === k) || { open: 0, raised_30d: 0 }; return catCard(k, l, i, c.open, c.raised_30d); });
    const openCards = a.open.slice(0, 12).map(r => `<article class="ds-card ds-work"><button type="button" class="ds-work-open" data-act="open" data-id="${r.id}">${art(catIcon(r.category), 'dark', r.has_photo ? r.id : 0, r.category)}
      <span class="ds-body"><span class="ds-meta">${rid(r)} · Flat ${esc(r.flat)} · <span class="${overdue(r) ? 'late' : ''}">${esc(ageLabel(r.created_at))}</span></span><span class="ds-title">${esc(r.title)}</span><span class="ds-foot">${statusTag(r)}</span></span></button>
      <div class="field ds-assign"><label class="sr" for="as${r.id}">Assign ${esc(r.title)}</label><select class="input" id="as${r.id}" data-change="assign" data-id="${r.id}">${W.vendorOptions(vendors, r.vendor_id)}</select>
      ${r.vendor_id ? `<button type="button" class="btn btn-secondary" data-act="move" data-id="${r.id}" data-s="closed">Mark resolved</button>` : ''}</div></article>`);
    const vc = vendors.length ? s.vendor_ratings.map(v => `<div class="ds-card ds-person"><span class="ds-avatar">${esc(initials(v.name))}</span><span class="ds-body"><span class="ds-title">${esc(v.name)}</span>
      <span class="ds-meta">${v.avg ? ic('star') + ' ' + v.avg + ' / 5' : 'Not rated yet'}</span><span class="ds-meter"><i style="width:${v.avg ? v.avg / 5 * 100 : 0}%"></i></span></span></div>`) : [];
    const act = audit.slice(0, 8).map(x => `<div class="ds-act"><span class="muted sm">${esc(stamp(x.created_at))}</span><span><b>${esc(x.action.replace('_', ' '))}</b> · ${esc(x.entity)} ${esc(x.entity_id)} <span class="muted">by ${esc(x.actor || 'system')}</span></span></div>`).join('');
    page(`<div class="ds">
      <header class="ds-hello"><div><h1>Hello, ${esc(firstName(S.me.name))}</h1><p class="muted">${esc(todayLabel())}</p></div><div class="ds-hello-r">${HP.liveBadge()}<span class="ds-sum">${a.open.length} open requests</span></div></header>
      ${search('Search requests, notices and residents')}
      ${section('Needs your attention', `<div class="ds-row ds-attn" role="region" aria-label="Needs your attention" tabindex="0">${attn.join('')}</div>`)}
      ${glance(ov)}
      ${section('Open requests', carousel(openCards.length ? openCards : ['<div class="ds-card ds-empty"><span class="ds-body"><span class="ds-title">All clear</span><span class="ds-meta">No open requests.</span></span></div>'], 'Open requests'), 'requests')}
      ${section('Recent activity', `<div class="ds-actlist">${act || '<p class="muted">Nothing yet.</p>'}</div>`, 'audit')}</div>`);
    announceNew(reqs);
  };
})();
