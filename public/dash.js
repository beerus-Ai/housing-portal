// Calm dashboards: resident Home and committee Dashboard (greeting, status line, "For you"). Loaded after web.js.
// Detail lives behind the top bar and sidebar; only what needs the person now is shown here.
(() => {
  const W = window.HPWeb; if (!W) return;
  const { esc, ic, catIcon, catLabel, isOpen, noticeIcon, rid, adminSummary, todayLabel, dateLong, RAPI } = HP;
  const API = window.API;
  const { S, PAGES, page, feat, allowed } = W;
  const D = { reqs: [], notices: [] };

  // ---------- resident Home
  // Calm home for residents: greeting, one status line, two actions, and up to four things that need them.
  PAGES.home = async () => {
    const t = S.me.resident_type;
    const [reqs, notices, sv, md] = await Promise.all([API.requests.list(), API.notices.list().catch(() => []),
      RAPI.svc.summary().catch(() => ({})), RAPI.mod.summary().catch(() => ({}))]);
    D.reqs = reqs; D.notices = notices;
    const open = reqs.filter(isOpen), toRate = reqs.filter(r => r.can_rate);
    const items = [];
    toRate.slice(0, 1).forEach(r => items.push({ icon: 'star', text: `Rate the work: ${r.title}`, sub: `${rid(r)} is resolved. Your rating closes it.`, page: 'requests', sel: r.id, act: 'open', tone: 'warn', cta: 'Rate' }));
    if (sv.parcels_waiting) items.push({ icon: 'package', text: `${sv.parcels_waiting} parcel${sv.parcels_waiting > 1 ? 's' : ''} waiting at the gate`, sub: 'Collect from the security desk', page: 'parcels', tone: 'warn', cta: 'See' });
    if (sv.shop_ready) items.push({ icon: 'shopping-bag', text: 'Your tuck shop order is ready', sub: 'On its way to your door', page: 'shop' });
    if (sv.laundry_ready) items.push({ icon: 't-shirt', text: 'Your laundry is ready', sub: 'Delivery coming up', page: 'laundry' });
    if (md.dues_overdue) items.push({ icon: 'receipt', text: `Maintenance dues overdue: ${HP.rupees(md.dues_balance)}`, sub: 'Pay the society office', page: 'dues', tone: 'warn', cta: 'View' });
    if (sv.next_event) items.push({ icon: 'calendar-star', text: sv.next_event.title, sub: `${dateLong(sv.next_event.starts_at.slice(0, 10))} at ${sv.next_event.starts_at.slice(11)}${sv.next_event.location ? ' · ' + sv.next_event.location : ''}`, page: 'events', cta: 'RSVP' });
    const fresh = notices.find(n => Date.now() - Date.parse(String(n.created_at).replace(' ', 'T') + 'Z') < 7 * 864e5);
    if (fresh) items.push({ icon: noticeIcon(fresh), text: fresh.title, sub: 'New notice from the committee', page: 'notices', cta: 'Read' });
    const bits = [open.length ? `${open.length} request${open.length > 1 ? 's' : ''} in progress` : 'No open requests', sv.parcels_waiting ? `${sv.parcels_waiting} parcel${sv.parcels_waiting > 1 ? 's' : ''} at the gate` : ''].filter(Boolean);
    page(`<div class="calm">${HP.hero({ theme: 'home', name: S.me.name, kicker: `Flat ${S.me.flat || ''} · ${todayLabel()}`, line: esc(bits.join(' · ')) + (open.length ? '' : '. Everything is in order.'),
      actions: [allowed('raise') ? ['Raise a request', 'plus-circle', 'raise', true] : null, ['Track my requests', 'list-checks', 'requests']].filter(Boolean) })}
      ${HP.notifier(items.slice(0, 4))}</div>`);
  };
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

  // ---------- committee dashboards: one per position, strictly different.
  //   Head of committee  -> governance: money decisions, escalations, the month's results.
  //   Admin (sysadmin)   -> the system: accounts, verification, health and settings.
  //   Committee member   -> daily operations: requests, assignments, services.
  PAGES.dashboard = async () => {
    const pos = S.me.position || 'sysadmin';
    if (pos === 'head') return headDash();
    if (pos === 'sysadmin') return adminDash();
    return opsDash();
  };

  async function headDash() {
    const [ap, rep, reqs, s] = await Promise.all([RAPI.admin.approvals().catch(() => null), RAPI.admin.reports().catch(() => ({})), API.requests.list(), API.admin.stats()]);
    const em = feat('emergency') ? (await API.emergencies.list().catch(() => [])).filter(e => e.status === 'active') : [];
    const a = adminSummary(reqs, s), costs = ap ? (Array.isArray(ap) ? ap : ap.pending || []) : [];
    const escalated = reqs.filter(r => r.escalated_at && isOpen(r));
    const items = [];
    if (em.length) items.push({ icon: 'siren', text: `${em.length} active emergenc${em.length > 1 ? 'ies' : 'y'}`, sub: 'You are told of every emergency', page: 'emergencies', tone: 'urgent', cta: 'Respond' });
    costs.slice(0, 2).forEach(c => items.push({ icon: 'currency-inr', text: `Approve ${HP.rupees(c.est_cost)}: ${c.title}`, sub: `${rid(c)} · above the society limit, waiting for you`, page: 'costs', tone: 'warn', cta: 'Decide' }));
    if (costs.length > 2) items.push({ icon: 'currency-inr', text: `${costs.length - 2} more cost decisions`, page: 'costs', cta: 'Review' });
    if (escalated.length) items.push({ icon: 'arrow-fat-line-up', text: `${escalated.length} request${escalated.length > 1 ? 's' : ''} escalated past 48 hours`, sub: escalated.slice(0, 2).map(r => r.title).join(' · '), page: 'requests', tone: 'warn', cta: 'Follow up' });
    items.push({ icon: 'chart-line', text: `Monthly report for ${rep.month || 'this month'}`, sub: 'Results and committee activity for the general body', page: 'reports', cta: 'Open' });
    const strip = HP.heroStrip([[rep.raised ?? 0, 'raised this month'], [rep.closed ?? 0, 'closed'], [rep.avg_rating != null ? rep.avg_rating + ' / 5' : '–', 'rating'], [`${a.pct}%`, 'within SLA']]);
    page(`<div class="calm">${HP.hero({ theme: 'gov', name: S.me.name, kicker: `Head of committee · ${todayLabel()}`, strip,
      line: costs.length ? `<b>${costs.length} cost decision${costs.length > 1 ? 's' : ''}</b> waiting for your approval` : 'No money decisions waiting for you.',
      actions: [['Cost approvals', 'currency-inr', 'costs', true], ['Monthly report', 'chart-line', 'reports']] })}
      ${HP.notifier(items.slice(0, 5), 'Nothing needs the head of committee right now.')}</div>`);
    announceNew(reqs);
  }

  async function adminDash() {
    const [accts, s, h, users] = await Promise.all([RAPI.admin.accounts().catch(() => []), API.admin.stats(), RAPI.it.health().catch(() => null), API.admin.allUsers().catch(() => [])]);
    const by = r => accts.filter(x => x.role === r && x.status === 'approved').length;
    const suspended = accts.filter(x => x.status === 'suspended').length + users.filter(u => u.role === 'resident' && u.status === 'suspended').length;
    const items = [];
    if (s.pending_users) items.push({ icon: 'user-check', text: `${s.pending_users} new resident${s.pending_users > 1 ? 's' : ''} to verify`, sub: 'Check against the flat register', page: 'approvals', tone: 'warn', cta: 'Verify' });
    if (h && h.integrity !== 'ok') items.push({ icon: 'warning', text: 'The database check needs a look', page: 'health', tone: 'urgent', cta: 'Check' });
    if (h && !h.last_backup) items.push({ icon: 'download-simple', text: 'No backup taken yet', sub: 'Download one before the next upgrade', page: 'health', tone: 'warn', cta: 'Back up' });
    if (suspended) items.push({ icon: 'pause-circle', text: `${suspended} suspended account${suspended > 1 ? 's' : ''}`, sub: 'Reactivate or remove them', page: 'accounts', cta: 'Review' });
    if (h && h.maintenance && h.maintenance.message) items.push({ icon: 'wrench', text: 'Maintenance notice is showing to everyone', sub: h.maintenance.message, page: 'health', cta: 'Edit' });
    items.push({ icon: 'toggle-right', text: 'Feature switches and access rules', sub: 'Decide what each resident type can do', page: 'settings', cta: 'Open' });
    const residents = users.filter(u => u.role === 'resident' && u.status === 'approved').length;
    const strip = HP.heroStrip([[residents, 'residents'], [by('admin'), 'committee'], [by('staff') + by('shop') + by('laundry'), 'staff'], [by('guard'), 'guards']]);
    page(`<div class="calm">${HP.hero({ theme: 'sys', name: S.me.name, kicker: `Admin · ${todayLabel()}`, strip,
      line: `${h ? (h.integrity === 'ok' ? 'System healthy' : 'System needs a look') + ' · ' : ''}${accts.length + users.length} accounts in the portal`,
      actions: [['Accounts', 'user-gear', 'accounts', true], ['Settings', 'gear-six', 'settings']] })}
      ${HP.notifier(items.slice(0, 5), 'Nothing needs the admin right now.')}</div>`);
  }

  // Committee member: daily operations.
  async function opsDash() {
    const [s, reqs, sv, ap] = await Promise.all([API.admin.stats(), API.requests.list(), RAPI.svc.summary().catch(() => ({})), RAPI.admin.approvals().catch(() => null)]);
    const em = feat('emergency') ? (await API.emergencies.list().catch(() => [])).filter(e => e.status === 'active') : [];
    D.reqs = reqs;
    const a = adminSummary(reqs, s), unassigned = a.open.filter(r => !r.vendor_id && !r.assignee_id);
    const costs = ap ? (Array.isArray(ap) ? ap : ap.pending || []).length : 0;
    const items = [];
    if (em.length) items.push({ icon: 'siren', text: `${em.length} active emergenc${em.length > 1 ? 'ies' : 'y'}`, sub: em.map(e => W.emType(e.type)[2] + (e.flat ? ' · ' + e.flat : '')).slice(0, 2).join(', '), page: 'emergencies', tone: 'urgent', cta: 'Respond' });
    if (s.pending_users) items.push({ icon: 'user-check', text: `${s.pending_users} resident${s.pending_users > 1 ? 's' : ''} to verify`, sub: 'Check against the flat register', page: 'approvals', tone: 'warn', cta: 'Verify' });
    if (unassigned.length) items.push({ icon: 'user-gear', text: `${unassigned.length} request${unassigned.length > 1 ? 's' : ''} need someone assigned`, sub: unassigned.slice(0, 2).map(r => r.title).join(' · '), page: 'requests', tone: a.overdue ? 'warn' : '', cta: 'Assign' });
    if (costs) items.push({ icon: 'currency-inr', text: `${costs} cost estimate${costs > 1 ? 's' : ''} waiting for approval`, sub: 'Above the society limit', page: 'costs', cta: 'Review' });
    if (sv.shop_to_prepare) items.push({ icon: 'storefront', text: `${sv.shop_to_prepare} tuck shop order${sv.shop_to_prepare > 1 ? 's' : ''} with the shop owner`, page: 'shop', cta: 'See' });
    if (sv.laundry_to_pick) items.push({ icon: 't-shirt', text: `${sv.laundry_to_pick} laundry pickup${sv.laundry_to_pick > 1 ? 's' : ''} with the laundry service`, page: 'laundry', cta: 'See' });
    if (sv.parcels_waiting) items.push({ icon: 'package', text: `${sv.parcels_waiting} parcel${sv.parcels_waiting > 1 ? 's' : ''} waiting at the gate`, page: 'parcels' });
    if (sv.next_event) items.push({ icon: 'calendar-star', text: sv.next_event.title, sub: `${dateLong(sv.next_event.starts_at.slice(0, 10))} at ${sv.next_event.starts_at.slice(11)}`, page: 'events' });
    const line = `${a.open.length} open request${a.open.length === 1 ? '' : 's'} · ${a.pct}% within the 48-hour SLA${a.overdue ? ` · <b>${a.overdue} overdue</b>` : ''}`;
    page(`<div class="calm">${HP.hero({ theme: 'ops', name: S.me.name, kicker: `Committee member · ${todayLabel()}`, line,
      actions: [['Requests', 'list-checks', 'requests', true], ['Broadcast a notice', 'megaphone', 'notices']] })}
      ${HP.notifier(items.slice(0, 5), 'Nothing needs the committee right now.')}</div>`);
    announceNew(reqs);
  }
})();
