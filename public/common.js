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
  const ROLE_LABEL = { staff: 'Maintenance staff', it: 'IT support', guard: 'Security guard', admin: 'Committee' };
  const positionLabel = me => (!me ? '' : me.role === 'admin' ? (POSITION[me.position] || 'Admin') : ROLE_LABEL[me.role] || TYPE[me.resident_type] || 'Resident');
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

  return { $, esc, ic, toast, api, guard, CATS, catLabel, catIcon, TYPE, dt, day, stamp, hoursOld, ageLabel, isOpen, overdue, todayLabel, initials, firstName,
    STEP_DEF, stageOf, statusTag, stepper, stars, noticeIcon, photoSlot, residentSummary, adminSummary, ring, fileToUpload, rid, SOCIETY, EMERGENCY_TYPES, CONTACT_ICONS, qrSvg, logo, dateLong, leaseInfo, live, liveBadge,
    POSITION, positionLabel, isGov, PROGRESS, progressLabel, rupees, costTag, updatesList, updatePhotoUrl, TICKET_KINDS, ticketTag, maintBanner, whenText, RAPI };
})();
