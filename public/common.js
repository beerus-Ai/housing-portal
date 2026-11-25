// Shared by the web app (/) and the mobile app (/m/). No inline scripts (strict CSP); all output is escaped with esc().
window.HP = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls = '') => `<i class="ph-duotone ph-${esc(name)} ${cls}" aria-hidden="true"></i>`;

  let toastTimer;
  function toast(m, kind) {
    const err = kind === 'error';
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
    t.setAttribute('aria-live', err ? 'assertive' : 'polite');
    t.innerHTML = (err ? '<span class="toast-ico toast-err">' + ic('warning-circle') + '</span>' : '<span class="toast-ico" data-lottie="check" data-loop="false"></span>') + '<span class="toast-msg"></span>';
    t.querySelector('.toast-msg').textContent = m; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), err ? 4200 : 3200);
  }
  async function api(method, url, body) {
    const opt = { method, headers: {} };
    if (body instanceof FormData) opt.body = body;
    else if (body) { opt.headers['content-type'] = 'application/json'; opt.body = JSON.stringify(body); }
    const r = await fetch(url, opt);
    const data = await r.json().catch(() => ({}));
    if (!r.ok) { const e = new Error(data.error || 'Request failed'); e.status = r.status; throw e; }
    return data;
  }
  const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message, 'error'); } };

  const CATS = [['plumbing', 'Plumbing', 'drop'], ['electrical', 'Electrical', 'lightning'], ['lift', 'Lift', 'elevator'],
    ['housekeeping', 'Housekeeping', 'broom'], ['security', 'Security', 'shield-check'], ['other', 'Other', 'dots-three-circle']];
  const catLabel = k => (CATS.find(c => c[0] === k) || [k, k])[1];
  const catIcon = k => (CATS.find(c => c[0] === k) || [0, 0, 'wrench'])[2];
  const TYPE = { owner: 'Owner', tenant: 'Tenant', family: 'Family member' };

  // Dates arrive from SQLite as UTC 'YYYY-MM-DD HH:MM:SS'.
  const dt = s => (s ? new Date(s.replace(' ', 'T') + 'Z') : null);
  const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const day = s => { const d = dt(s); return d ? `${d.getDate()} ${MON[d.getMonth()]}` : ''; };
  const stamp = s => { const d = dt(s); return d ? `${d.getDate()} ${MON[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''; };
  const hoursOld = s => (Date.now() - dt(s).getTime()) / 3600e3;
  const ageLabel = s => { const h = Math.max(0, Math.round(hoursOld(s))); return h < 48 ? (h < 1 ? 'now' : h + 'h') : Math.floor(h / 24) + 'd'; };
  const isOpen = r => r.status !== 'closed';
  const overdue = r => isOpen(r) && hoursOld(r.created_at) > 48;
  const todayLabel = () => new Date().toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  const initials = n => String(n || '?').replace(/\(.*\)/, '').trim().split(/\s+/).map(w => w[0]).slice(0, 2).join('').toUpperCase();
  const firstName = n => String(n || '').replace(/^[A-Z]\.\s*/, '').split(/\s+/)[0];

  // The lifecycle is open -> assigned -> in_progress -> closed (committee). A closed request waits for the resident's rating;
  // the rating completes the design's fifth step. So: Resolved = closed, Closed = closed and rated.
  const STEP_DEF = [['Raised', 'note-pencil'], ['Assigned', 'user-gear'], ['In progress', 'wrench'], ['Resolved', 'check'], ['Closed', 'star']];
  const stageOf = r => (r.status === 'closed' ? (r.rating ? 4 : 3) : r.status === 'in_progress' ? 2 : r.status === 'assigned' ? 1 : 0);
  function statusTag(r) {
    const m = { open: ['Open', 'tag-accent-2'], assigned: ['Assigned', 'tag-accent'], in_progress: ['In progress', 'tag-accent'] }[r.status];
    if (m) return `<span class="tag ${m[1]}">${m[0]}</span>`;
    return r.rating ? '<span class="tag tag-outline">Closed</span>' : '<span class="tag tag-neutral">Resolved: awaiting rating</span>';
  }
  function stepTimes(history) {
    const at = {};
    for (const h of history || []) {
      const d = h.detail || '';
      if (h.action === 'created') at[0] = h.created_at;
      else if (h.action === 'assigned') at[1] = at[1] || h.created_at;
      else if (h.action === 'status' && /-> in_progress/.test(d)) at[2] = h.created_at;
      else if (h.action === 'status' && /-> closed/.test(d)) at[3] = h.created_at;
      else if (h.action === 'rated') at[4] = h.created_at;
    }
    return at;
  }
  function stepper(r, history, vertical) {
    const idx = stageOf(r), at = stepTimes(history);
    const items = STEP_DEF.map(([label, icon], i) => {
      const st = i < idx ? 'done' : i === idx ? 'now' : 'todo';
      const when = i <= idx ? stamp(at[i] || (i === 0 ? r.created_at : '')) : '';
      return `<div class="step ${st}"><div class="step-top"><span class="dot">${ic(i <= idx ? icon : 'circle')}</span><span class="line"></span></div>
        <div class="step-text"><span class="step-label">${label}</span><span class="text-muted step-at">${esc(when)}</span></div></div>`;
    }).join('');
    return `<div class="steps ${vertical ? 'v' : ''}" role="list" aria-label="Progress">${items}</div>`;
  }
  const stars = (name) => [1, 2, 3, 4, 5].map(n => `<button type="button" class="btn btn-ghost star" data-act="${name}" data-n="${n}" aria-label="${n} of 5">${ic('star')}</button>`).join('');

  const NOTICE_ICONS = [[/water|tank|plumb/i, 'drop'], [/diwali|festival|light|celebrat/i, 'sparkle'], [/meeting|agm|general/i, 'users-three'],
    [/lift|elevator/i, 'elevator'], [/security|gate|cctv/i, 'shield-check'], [/fire|safety/i, 'warning']];
  const noticeIcon = n => (NOTICE_ICONS.find(([re]) => re.test(n.title)) || [0, 'megaphone'])[1];

  const photoSlot = (text, icon = 'buildings') => `<div class="photo-slot">${ic(icon)}<span>${esc(text)}</span></div>`;

  // Derived numbers shared by both apps' resident home screens.
  function residentSummary(reqs, me, notices) {
    const open = reqs.filter(isOpen), toRate = reqs.filter(r => r.can_rate);
    const track = open.find(r => r.status === 'in_progress') || open[0] || reqs[0];
    return { open, toRate, track, notices };
  }
  function adminSummary(reqs, s) {
    const open = reqs.filter(isOpen);
    const total = s.sla.total || 0;
    const pct = total ? Math.round(s.sla.within / total * 100) : 100;
    const oldest = open.length ? ageLabel(open.reduce((m, r) => (r.created_at < m ? r.created_at : m), open[0].created_at)) : '–';
    const weeks = Array.from({ length: 8 }, (_, i) => { const w = s.weekly.find(x => x.weeks_ago === 7 - i); return w ? w.n : 0; });
    return { open, pct, oldest, weeks, overdue: s.sla.overdue };
  }
  const ring = pct => `conic-gradient(var(--color-accent) 0 ${pct}%, color-mix(in srgb, var(--color-bg) 18%, transparent) ${pct}% 100%)`;

  const rid = r => 'R-' + String(1000 + Number(r.id));
  const SOCIETY = { name: 'Sahyadri Heights', kind: 'Co-operative Housing Society' };
  // Emergency types: [key, icon, label]. The server validates the key against the same list.
  const EMERGENCY_TYPES = [['lift', 'elevator', 'Stuck in lift'], ['medical', 'first-aid', 'Medical'], ['fire', 'fire', 'Fire'], ['theft', 'mask-sad', 'Theft'], ['threat', 'warning', 'Threat'], ['violence', 'hand-fist', 'Violence'], ['other', 'siren', 'Other']];
  // Icons a committee contact can use.
  const CONTACT_ICONS = ['phone', 'briefcase', 'shield-check', 'wrench', 'elevator', 'first-aid', 'fire', 'drop'];
  // QR code as an inline SVG string (vendored qrcode-generator). Payload convention: 'HSP:' + token.
  const qrSvg = (text, px = 220) => { if (!window.qrcode) return ''; const q = window.qrcode(0, 'M'); q.addData(String(text)); q.make(); const svg = q.createSvgTag({ cellSize: 4, margin: 2, scalable: true }); return svg.replace('<svg', `<svg width="${px}" height="${px}" role="img" aria-label="QR code"`); };
  // Brand mark (public/logo.svg). Use everywhere a logo is shown.
  const logo = (px = 40, cls = '') => `<img class="logo ${cls}" src="/logo.svg" width="${px}" height="${px}" alt="">`;
  const dateLong = s => { const d = new Date(s + 'T00:00:00'); return isNaN(d) ? '' : `${d.getDate()} ${MON[d.getMonth()]} ${d.getFullYear()}`; };
  // Lease numbers for the tenant screens.
  function leaseInfo(l) {
    if (!l) return null;
    const start = new Date(l.start_date + 'T00:00:00'), end = new Date(l.end_date + 'T00:00:00'), now = new Date();
    const total = end - start, left = Math.max(0, Math.ceil((end - now) / 864e5));
    const pct = total > 0 ? Math.min(100, Math.max(0, Math.round((now - start) / total * 100))) : 0;
    const renew = new Date(end); renew.setMonth(renew.getMonth() - 2);
    return { left, pct, ends: dateLong(l.end_date), renewBy: dateLong(renew.toISOString().slice(0, 10)),
      rows: [['calendar', 'Lease period', `${dateLong(l.start_date)} – ${dateLong(l.end_date)}`], ['user', 'Flat owner', [l.owner_name, l.owner_phone].filter(Boolean).join(' · ') || 'Not recorded'],
        ['shield-check', 'Police verification', l.police_verified_on ? 'Verified on ' + dateLong(l.police_verified_on) : 'Pending'], ['file-text', 'Rent agreement', l.agreement || 'Not recorded'], ['car', 'Parking', l.parking || 'None allotted']] };
  }

  // ---------- sound alerts (chime for a new request or order, siren for an emergency). Tones are made with Web Audio,
  // so there are no sound files and the CSP stays 'self'. Browsers only allow sound after the first click or key press.
  const sound = (() => {
    let ctx = null, last = null, silenced = 0, sirenAt = 0, banner = null;
    const on = () => localStorage.getItem('hp.sound') !== 'off';
    const audio = () => { try { ctx = ctx || new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } return ctx; };
    const unlock = () => { const c = audio(); if (c && c.state === 'suspended') c.resume(); };
    ['pointerdown', 'keydown'].forEach(ev => document.addEventListener(ev, unlock, { capture: true, passive: true }));
    function tone(c, t0, f0, f1, dur, type, vol) {
      const o = c.createOscillator(), g = c.createGain();
      o.type = type; o.frequency.setValueAtTime(f0, t0); if (f1 !== f0) o.frequency.linearRampToValueAtTime(f1, t0 + dur);
      g.gain.setValueAtTime(0.0001, t0); g.gain.exponentialRampToValueAtTime(vol, t0 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
      o.connect(g).connect(c.destination); o.start(t0); o.stop(t0 + dur + 0.05);
    }
    function play(kind) {
      if (!on()) return;
      const c = audio(); if (!c) return;
      if (c.state === 'suspended') { c.resume(); if (c.state === 'suspended') { toast('Click anywhere to turn on sound alerts'); return; } }
      const t = c.currentTime + 0.05;
      if (kind === 'siren') for (let i = 0; i < 3; i++) { tone(c, t + i * 0.9, 650, 1250, 0.45, 'sawtooth', 0.18); tone(c, t + i * 0.9 + 0.45, 1250, 650, 0.45, 'sawtooth', 0.18); }
      else { tone(c, t, 880, 880, 0.18, 'sine', 0.25); tone(c, t + 0.2, 1320, 1320, 0.32, 'sine', 0.25); }
    }
    function showBanner(n) {
      if (banner) { banner.querySelector('b').textContent = n > 1 ? n + ' active emergencies' : 'Active emergency'; return; }
      banner = document.createElement('div'); banner.className = 'em-alarm'; banner.setAttribute('role', 'alert');
      banner.innerHTML = `<span class="em-alarm-ic">${ic('siren')}</span><span class="em-alarm-t"><b>${n > 1 ? n + ' active emergencies' : 'Active emergency'}</b><span>Open Emergencies to respond. The alarm repeats until it is resolved or silenced.</span></span><button type="button" class="btn" data-em-silence>Silence</button>`;
      banner.querySelector('[data-em-silence]').addEventListener('click', () => { silenced = last ? last.em : 0; hideBanner(); });
      document.body.appendChild(banner);
    }
    const hideBanner = () => { if (banner) { banner.remove(); banner = null; } };
    // Called with every pulse. The first pulse only sets the baseline, so opening the page never plays old alerts,
    // except an emergency that is still active: that is announced at once.
    function check(a) {
      if (!a) return;
      const first = last === null; const prev = last || { rq: a.rq, ru: a.ru, em: 0 }; last = a;
      if (a.em_on > 0 && a.em > silenced) {
        showBanner(a.em_on);
        if (a.em > prev.em || first || Date.now() - sirenAt > 20000) { sirenAt = Date.now(); play('siren'); }
      } else hideBanner();
      if (!first && (a.ru || 0) > (prev.ru || 0) && !(a.em > prev.em)) play('siren'); // urgent or security request: alarm once
      else if (!first && a.rq > prev.rq && !(a.em > prev.em)) play('chime');
    }
    function toggle() { localStorage.setItem('hp.sound', on() ? 'off' : 'on'); if (on()) { unlock(); play('chime'); } return on(); }
    return { check, play, toggle, on };
  })();
  // Any element with data-sound-toggle switches sound alerts on or off and shows the state.
  const soundLabel = () => sound.on() ? 'Sound on' : 'Sound off';
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-sound-toggle]'); if (!b) return;
    sound.toggle(); b.innerHTML = `${ic(sound.on() ? 'speaker-high' : 'speaker-slash')}<span>${soundLabel()}</span>`; toast(sound.on() ? 'Sound alerts on' : 'Sound alerts off');
  });
  const soundBtn = (cls = 'top-btn') => `<button type="button" class="${cls}" data-sound-toggle title="Play a sound for new requests and emergencies">${ic(sound.on() ? 'speaker-high' : 'speaker-slash')}<span>${soundLabel()}</span></button>`;

  // Live updates: poll /api/pulse and call redraw() only when something changed and the user is not typing.
  function live(redraw, { every = 5000 } = {}) {
    let last = null, busy = false;
    const stamp = () => new Date().toLocaleTimeString('en-GB');
    const mark = (cls) => document.querySelectorAll('.live').forEach(el => { el.classList.toggle('stale', cls === 'stale'); const t = el.querySelector('.live-t'); if (t) t.textContent = cls === 'stale' ? 'Offline' : 'Live · ' + stamp(); });
    // Never redraw under the user: a focused field, or any form with unsaved typing or a chosen photo, blocks the refresh.
    const dirty = () => [...document.querySelectorAll('form input:not([type=checkbox]):not([type=file]), form textarea')].some(e => e.value !== e.defaultValue)
      || [...document.querySelectorAll('input[type=file]')].some(e => e.files && e.files.length);
    const editing = () => { const a = document.activeElement; return (a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName) && a.type !== 'file' && a.closest('form, td, .field, .m-card')) || dirty(); };
    async function tick() {
      if (busy || document.hidden) return; busy = true;
      try {
        const p = await API.auth.pulse();
        sound.check(p.a);
        if (last !== null && p.v !== last && !editing()) { await redraw(); }
        if (last === null || !editing()) last = p.v;
        mark();
      } catch (e) { mark(e.status === 401 ? 'stale' : 'stale'); } finally { busy = false; }
    }
    setInterval(tick, every); document.addEventListener('visibilitychange', tick); window.addEventListener('online', tick);
    return { reset: () => { last = null; }, mark };
  }
  const liveBadge = () => `<span class="live" role="status" title="Updates automatically"><i></i><span class="live-t">Live</span></span>`;

  async function fileToUpload(form) { const fd = new FormData(form); const f = fd.get('photo'); if (f && !f.size) fd.delete('photo'); return fd; }

  // ---------- roles from the faculty review (docs/roles-api.md): staff, IT, committee positions. Shared by both apps.
  const POSITION = { member: 'Committee member', head: 'Head of committee', sysadmin: 'Admin' };
  const ROLE_LABEL = { staff: 'Maintenance staff', it: 'IT support', guard: 'Security guard', admin: 'Committee', shop: 'Tuck shop owner', laundry: 'Laundry service' };
  const positionLabel = me => (!me ? '' : me.role === 'admin' ? (POSITION[me.position] || 'Admin') : me.role === 'staff' ? (me.department === 'cleaning' ? 'Cleaning staff' : 'Maintenance staff') : ROLE_LABEL[me.role] || TYPE[me.resident_type] || 'Resident');
  // Governance = head or sysadmin (an empty position is an older admin account). The API decides; the UI only hides buttons.
  const isGov = me => !!me && me.role === 'admin' && (!me.position || me.position === 'head' || me.position === 'sysadmin');
  const PROGRESS = [['started', 'Started', 'play-circle'], ['waiting_parts', 'Waiting for parts', 'hourglass'], ['done', 'Work done', 'check-circle']];
  const progressLabel = k => (PROGRESS.find(p => p[0] === k) || [k, k])[1];
  const progressIcon = k => (PROGRESS.find(p => p[0] === k) || [0, 0, 'note-pencil'])[2];
  const rupees = n => (n == null || n === '' ? '' : '₹' + Number(n).toLocaleString('en-IN'));
  function costTag(r) {
    if (!r || r.est_cost == null) return '';
    const m = { approved: ['tag-accent', 'Cost approved'], pending: ['tag-accent-2', 'Cost waiting for approval'], rejected: ['tag-neutral', 'Cost rejected'] }[r.cost_status] || ['tag-outline', 'Estimate'];
    return `<span class="tag ${m[0]}">${esc(m[1])} · ${esc(rupees(r.est_cost))}</span>`;
  }
  const updatePhotoUrl = (rid, uid) => `/api/requests/${encodeURIComponent(rid)}/updates/${encodeURIComponent(uid)}/photo`;
  // Job updates timeline (staff progress notes). Newest first.
  function updatesList(rid, ups) {
    if (!ups || !ups.length) return '<p class="muted" style="margin:0">No job updates yet.</p>';
    return `<ol class="jt" aria-label="Job updates">${[...ups].sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)) || b.id - a.id).map(u => `<li class="jt-i"><span class="jt-ic">${ic(progressIcon(u.progress))}</span>
      <span class="col" style="gap:2px;min-width:0"><span><b>${esc(progressLabel(u.progress))}</b> <span class="muted sm">${esc(stamp(u.created_at))} · ${esc(u.author || '')}</span></span>${u.note ? `<span style="white-space:pre-line">${esc(u.note)}</span>` : ''}
      ${u.has_photo ? `<a href="${updatePhotoUrl(rid, u.id)}" target="_blank" rel="noopener"><img class="jt-photo" src="${updatePhotoUrl(rid, u.id)}" alt="Photo from the job update" loading="lazy"></a>` : ''}</span></li>`).join('')}</ol>`;
  }
  const TICKET_KINDS = [['bug', 'Something is broken'], ['question', 'A question'], ['access', 'Sign-in or access'], ['other', 'Something else']];
  const ticketTag = s => { const m = { open: ['tag-accent-2', 'Open'], in_progress: ['tag-accent', 'In progress'], resolved: ['tag-outline', 'Resolved'] }[s] || ['tag-neutral', s]; return `<span class="tag ${m[0]}">${esc(m[1])}</span>`; };
  const whenText = s => { const d = /T/.test(String(s)) ? new Date(s) : dt(String(s)); return d && !isNaN(d) ? `${d.getDate()} ${MON[d.getMonth()]}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : String(s || ''); };
  const maintBanner = st => (st && st.maintenance && st.maintenance.message ? `<div class="maint-banner" role="status">${ic('wrench')}<span><b>Maintenance:</b> ${esc(st.maintenance.message)}${st.maintenance.until ? ` <span class="maint-until">until ${esc(whenText(st.maintenance.until))}</span>` : ''}</span></div>` : '');
  const q = p => { const e = Object.entries(p || {}).filter(([, v]) => v !== '' && v != null); return e.length ? '?' + new URLSearchParams(e) : ''; };
  const enc = encodeURIComponent;
  // Role API (docs/roles-api.md). Kept here so /m/ can use it without another script tag.
  const RAPI = {
    staff: {
      jobs: () => api('GET', '/api/staff/jobs'),
      accept: id => api('POST', `/api/staff/jobs/${enc(id)}/accept`),
      update: (id, body) => api('POST', `/api/staff/jobs/${enc(id)}/update`, body), // FormData (progress, note, photo) or JSON
      shift: () => api('GET', '/api/staff/shift'),
      punchIn: () => api('POST', '/api/staff/punch-in'),
      punchOut: body => api('POST', '/api/staff/punch-out', body),
    },
    requests: {
      updates: id => api('GET', `/api/requests/${enc(id)}/updates`),
      estimate: (id, amount, note) => api('POST', `/api/requests/${enc(id)}/estimate`, { amount, note }),
      costDecision: (id, decision, note) => api('POST', `/api/requests/${enc(id)}/cost-decision`, { decision, note }),
      reopen: (id, reason) => api('POST', `/api/requests/${enc(id)}/reopen`, { reason }),
      assignStaff: (id, staffId) => api('POST', `/api/requests/${enc(id)}/assign`, { staff_id: staffId }),
    },
    admin: {
      staff: () => api('GET', '/api/admin/staff'),
      approvals: () => api('GET', '/api/admin/approvals'),
      reports: month => api('GET', '/api/admin/reports/monthly' + q({ month })),
      attendance: days => api('GET', '/api/admin/attendance' + q({ days })),
      accounts: () => api('GET', '/api/admin/accounts'),
      createAccount: body => api('POST', '/api/admin/accounts', body),
      patchAccount: (id, body) => api('PATCH', `/api/admin/accounts/${enc(id)}`, body),
      removeAccount: id => api('DELETE', `/api/admin/accounts/${enc(id)}`),
    },
    support: {
      list: status => api('GET', '/api/support' + q({ status })),
      get: id => api('GET', `/api/support/${enc(id)}`),
      create: body => api('POST', '/api/support', body),
      reply: (id, body, status) => api('POST', `/api/support/${enc(id)}/reply`, status ? { body, status } : { body }),
    },
    help: { guides: () => api('GET', '/api/help/guides') },
    // Society modules (docs/modules-api.md): amenities, dues, inventory, waste.
    // Resident services (docs/services-api.md): tuck shop, laundry, parcel desk, community events.
    svc: {
      summary: () => api('GET', '/api/services/summary'),
      items: () => api('GET', '/api/shop/items'),
      addItem: body => api('POST', '/api/shop/items', body),
      updateItem: (id, body) => api('PATCH', `/api/shop/items/${id}`, body),
      orders: () => api('GET', '/api/shop/orders'),
      order: body => api('POST', '/api/shop/orders', body),
      orderStatus: (id, status) => api('POST', `/api/shop/orders/${id}/status`, { status }),
      rates: () => api('GET', '/api/laundry/rates'),
      addRate: body => api('POST', '/api/laundry/rates', body),
      updateRate: (id, body) => api('PATCH', `/api/laundry/rates/${id}`, body),
      laundry: () => api('GET', '/api/laundry/orders'),
      bookLaundry: body => api('POST', '/api/laundry/orders', body),
      laundryStatus: (id, status) => api('POST', `/api/laundry/orders/${id}/status`, { status }),
      parcels: () => api('GET', '/api/parcels'),
      logParcel: body => api('POST', '/api/parcels', body),
      collect: (id, by) => api('POST', `/api/parcels/${id}/collect`, { collected_by: by }),
      events: () => api('GET', '/api/events'),
      addEvent: body => api('POST', '/api/events', body),
      cancelEvent: id => api('POST', `/api/events/${id}/cancel`),
      rsvp: (id, going) => api('POST', `/api/events/${id}/rsvp`, { going }),
    },
    mod: {
      summary: () => api('GET', '/api/modules/summary'),
      amenities: () => api('GET', '/api/amenities'),
      addAmenity: body => api('POST', '/api/amenities', body),
      patchAmenity: (id, body) => api('PATCH', `/api/amenities/${enc(id)}`, body),
      slots: (id, date) => api('GET', `/api/amenities/${enc(id)}/slots` + q({ date })),
      bookings: scope => api('GET', '/api/bookings' + q({ scope })),
      book: body => api('POST', '/api/bookings', body),
      cancelBooking: (id, reason) => api('POST', `/api/bookings/${enc(id)}/cancel`, reason ? { reason } : {}),
      dues: p => api('GET', '/api/dues' + q(p)),
      due: id => api('GET', `/api/dues/${enc(id)}`),
      raiseDues: body => api('POST', '/api/admin/dues', body),
      pay: (id, body) => api('POST', `/api/admin/dues/${enc(id)}/payments`, body),
      inventory: low => api('GET', '/api/inventory' + q({ low: low ? '1' : '' })),
      addItem: body => api('POST', '/api/inventory', body),
      move: (id, body) => api('POST', `/api/inventory/${enc(id)}/move`, body),
      moves: id => api('GET', `/api/inventory/${enc(id)}/moves`),
      schedule: () => api('GET', '/api/waste/schedule'),
      addSchedule: body => api('POST', '/api/waste/schedule', body),
      removeSchedule: id => api('DELETE', `/api/waste/schedule/${enc(id)}`),
      wasteLogs: days => api('GET', '/api/waste/logs' + q({ days })),
      logWaste: body => api('POST', '/api/waste/logs', body),
      missed: body => api('POST', '/api/waste/missed', body),
    },
    it: {
      health: () => api('GET', '/api/it/health'),
      backupUrl: '/api/it/backup',
      maintenance: (message, until) => api('PUT', '/api/it/maintenance', until ? { message, until } : { message }),
    },
  };

  // Community card: card number, money for the flat, and the person's activity (gate, shop, laundry, payments, shifts).
  const cardPanel = (d, opts = {}) => `<div class="cardp">
    <div class="cardp-card"><span class="cardp-chip">${ic('contactless-payment')}</span><span class="cardp-k">Community card</span><b class="cardp-n">${d.cards && d.cards.length ? esc(d.cards[0].serial.replace(/(.{2})(?=.)/g, '$1 ')) : 'No card yet'}</b><span class="cardp-s">${esc(opts.name || '')}${d.cards && d.cards.length ? ' · issued ' + esc(day(d.cards[0].created_at)) : ''}</span></div>
    ${d.money ? `<div class="cardp-money"><span><b>${esc(rupees(d.money.balance))}</b><span>owed on the maintenance account</span></span><span><b>${esc(rupees(d.money.credit_used))}</b><span>of ${esc(rupees(d.money.credit_limit || 0))} shop and laundry credit used</span></span></div>` : ''}
    <div class="cardp-act"><h3>Activity</h3>${(d.activity || []).map(e => `<div class="cardp-row"><span class="ntf-ic">${ic(e.icon)}</span><span class="col" style="gap:0;flex:1;min-width:0"><b>${esc(e.text)}</b><span class="muted sm">${esc(stamp(e.at))}${e.payment ? ' · ' + esc(e.payment === 'account' ? 'on account' : e.payment.toUpperCase()) : ''}</span></span>${e.amount != null ? `<b>${esc(rupees(e.amount))}</b>` : ''}</div>`).join('') || '<p class="muted">No activity yet.</p>'}</div></div>`;
  // "⋯" row menu: keeps lists to the person or thing; actions open on demand. Items: { label, icon, act, data:{k:v}, danger }.
  const kebab = (label, items) => `<span class="kb"><button type="button" class="btn btn-ghost kb-btn" data-kb aria-haspopup="menu" aria-expanded="false" aria-label="${esc(label)}" title="More">${ic('dots-three-vertical')}</button>
    <span class="kb-menu" role="menu" hidden>${items.filter(Boolean).map(it => `<button type="button" role="menuitem" class="kb-item${it.danger ? ' danger' : ''}" data-act="${it.act}" ${Object.entries(it.data || {}).map(([k, v]) => `data-${k}="${esc(v)}"`).join(' ')}>${ic(it.icon)}<span>${esc(it.label)}</span></button>`).join('')}</span></span>`;
  const closeMenus = except => document.querySelectorAll('.kb-menu:not([hidden])').forEach(m => { if (m !== except) { m.hidden = true; const b = m.parentElement.querySelector('[data-kb]'); if (b) b.setAttribute('aria-expanded', 'false'); } });
  document.addEventListener('click', e => {
    const b = e.target.closest('[data-kb]');
    if (b) { const m = b.parentElement.querySelector('.kb-menu'); closeMenus(m); m.hidden = !m.hidden; b.setAttribute('aria-expanded', String(!m.hidden)); if (!m.hidden) { const f = m.querySelector('.kb-item'); if (f) f.focus(); } return; }
    if (e.target.closest('.kb-item')) { setTimeout(() => closeMenus(), 0); return; }
    if (!e.target.closest('.kb-menu')) closeMenus();
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape') closeMenus(); });

  // Calm dashboards (every role): a greeting with a moving illustration, one status line and one or two actions,
  // then a short "For you" list. Detail lives behind the top bar and the sidebar, not on the dashboard.
  const greeting = () => { const h = Number(new Intl.DateTimeFormat('en-GB', { hour: 'numeric', hourCycle: 'h23', timeZone: 'Asia/Kolkata' }).format(new Date())); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
  // theme: home | ops | gov | sys | it | clean | fix | shop | wash | gate (colours and layout per role, css/calm.css).
  const hero = ({ name, kicker, line, actions = [], theme = 'home', strip = '' }) => {
    const svg = (window.HP_ILLUS || {})[theme] || '';
    return `<section class="hero hero-${theme}">
    <div class="hero-txt"><span class="hero-k">${esc(kicker)}</span><h1>${esc(greeting())}, ${esc(firstName(name))}</h1><p class="hero-line">${line}</p>
      <div class="row hero-acts">${actions.map(([label, icon, pg, primary]) => `<button type="button" class="btn ${primary ? 'btn-primary' : 'btn-secondary'} btn-lg" data-act="nav" data-page="${pg}">${ic(icon)}${esc(label)}</button>`).join('')}</div>${strip}</div>
    <div class="hero-art" aria-hidden="true"><span class="hero-blob"></span>${svg || '<span class="hero-anim" data-lottie="building"></span>'}</div></section>`;
  };
  // A small strip of 2-4 numbers inside the hero (head and admin dashboards).
  const heroStrip = cells => `<div class="hero-strip">${cells.map(([n, l]) => `<span><b class="fig">${esc(n)}</b><span>${esc(l)}</span></span>`).join('')}</div>`;
  // items: { icon, text, sub, page, sel?, tone: 'urgent' | 'warn' | '' , cta }
  const notifier = (items, empty = "You're all caught up.") => `<section class="ntf" aria-label="For you"><h2>For you</h2>${items.length
    ? `<div class="ntf-list">${items.map((n, i) => `<button type="button" class="ntf-row ${n.tone || ''}" style="--i:${i}" data-act="${n.act || 'nav'}" data-page="${n.page}" ${n.sel ? `data-id="${n.sel}" data-sel="${n.sel}"` : ''}>
        <span class="ntf-ic">${ic(n.icon)}${n.tone === 'urgent' ? '<i class="ntf-pulse" aria-hidden="true"></i>' : ''}</span><span class="ntf-txt"><b>${esc(n.text)}</b>${n.sub ? `<span>${esc(n.sub)}</span>` : ''}</span><span class="ntf-go">${esc(n.cta || 'Open')}${ic('caret-right')}</span></button>`).join('')}</div>`
    : `<div class="ntf-empty"><span class="ntf-anim" data-lottie="check" data-loop="false"></span><b>${esc(empty)}</b><span class="muted">New things will appear here.</span></div>`}</section>`;

  return { sound, soundBtn, $, esc, ic, toast, api, guard, CATS, catLabel, catIcon, TYPE, dt, day, stamp, hoursOld, ageLabel, isOpen, overdue, todayLabel, initials, firstName, greeting, hero, heroStrip, notifier, kebab, cardPanel,
    STEP_DEF, stageOf, statusTag, stepper, stars, noticeIcon, photoSlot, residentSummary, adminSummary, ring, fileToUpload, rid, SOCIETY, EMERGENCY_TYPES, CONTACT_ICONS, qrSvg, logo, dateLong, leaseInfo, live, liveBadge,
    POSITION, positionLabel, isGov, PROGRESS, progressLabel, rupees, costTag, updatesList, updatePhotoUrl, TICKET_KINDS, ticketTag, maintBanner, whenText, RAPI };
})();
