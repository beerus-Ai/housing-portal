// Shared by the web app (/) and the mobile app (/m/). No inline scripts (strict CSP); all output is escaped with esc().
window.HP = (() => {
  const $ = (s, r = document) => r.querySelector(s);
  const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const ic = (name, cls = '') => `<i class="ph-duotone ph-${esc(name)} ${cls}" aria-hidden="true"></i>`;

  let toastTimer;
  function toast(m) {
    let t = $('#toast');
    if (!t) { t = document.createElement('div'); t.id = 'toast'; t.setAttribute('role', 'status'); t.setAttribute('aria-live', 'polite'); document.body.appendChild(t); }
    t.textContent = m; t.classList.add('show'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 3200);
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
  const guard = fn => async (...a) => { try { await fn(...a); } catch (e) { toast(e.message); } };

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
  const SOCIETY = { name: 'Sahyadri Heights', kind: 'Co-operative Housing Society · Pune', flats: 412, towers: 'Towers A–C' };
  // Synthetic society contacts (demo data only).
  const CONTACTS = [['briefcase', 'Sunil Kulkarni', 'Secretary', '+91 98500 11220'], ['shield-check', 'Main gate', 'Security, 24 hours', '+91 20 2589 0011'],
    ['wrench', 'Society maintenance', 'Plumbing and housekeeping', '+91 98500 33440'], ['elevator', 'LiftCare Services', 'Lift emergencies', '1800 266 0099']];
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

  return { $, esc, ic, toast, api, guard, CATS, catLabel, catIcon, TYPE, dt, day, stamp, hoursOld, ageLabel, isOpen, overdue, todayLabel, initials, firstName,
    STEP_DEF, stageOf, statusTag, stepper, stars, noticeIcon, photoSlot, residentSummary, adminSummary, ring, fileToUpload, rid, SOCIETY, CONTACTS, dateLong, leaseInfo, live, liveBadge };
})();
