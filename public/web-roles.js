// Pages for the review roles (docs/roles-api.md): staff (Assigned work, Punch in and hand-over), IT (IT overview,
// Support queries, Training guides, Upgrades and maintenance),
// committee extras (Cost approvals, Reports, Staff attendance, Accounts), and for everyone Help, Support and Profile.
// Loaded after web.js; registers pages and delegated events on window.HPWeb. No inline handlers (CSP 'self').
(() => {
  const W = window.HPWeb; if (!W) return;
  const { esc, ic, toast, initials, catLabel, catIcon, statusTag, stamp, day, rid, costTag, rupees, updatesList, positionLabel, PROGRESS, TICKET_KINDS, ticketTag, whenText, RAPI } = HP;
  const { S, PAGES, ACT, page, render, go, isAdmin, isStaff, isIT, isGov } = W;
  const $ = (s, r = document) => r.querySelector(s);
  const R = { form: null, ups: {}, showUps: null, ticket: null, sFilter: '', month: '', days: '7', accDel: null, err: '' };
  // My jobs keeps redrawing live, except while a progress or estimate form is open.
  W.noRedraw = () => S.page === 'myjobs' && R.form != null;
  const sysadmin = () => isAdmin() && (!S.me.position || S.me.position === 'sysadmin');
  const itLike = () => isIT() || sysadmin(); // sees every ticket and may set its status
  const setErr = m => { const e = $('#rlerr'); if (e) e.textContent = m || ''; };

  // ---------- small building blocks
  const head = (title, sub, right = '') => `<header class="rl-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div><div class="row rl-head-r">${HP.liveBadge()}${right}</div></header>`;
  const field = (id, label, input, hint) => `<div class="field"><label for="${id}">${esc(label)}</label>${input}${hint ? `<span class="muted sm">${esc(hint)}</span>` : ''}</div>`;
  const table = (heads, rows, empty) => `<div class="table-wrap"><table class="table"><thead><tr>${heads.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${heads.length}" class="muted">${esc(empty)}</td></tr>`}</tbody></table></div>`;
  const stat = (icon, n, label, sub) => `<div class="eg-card rl-stat"><span class="eg-ic">${ic(icon)}</span><span class="eg-n">${esc(n)}</span><span class="eg-l">${esc(label)}</span>${sub ? `<span class="eg-s">${esc(sub)}</span>` : ''}</div>`;
  const hrs = h => (h == null || h === '' ? '–' : `${Math.round(Number(h) * 10) / 10} h`);
  const num = v => (v == null || v === '' ? '–' : v);
  const errLine = () => `<p class="err" id="rlerr" role="alert">${esc(R.err)}</p>`;
  const KIND_LABEL = { member: 'Committee member', head: 'Head of committee', sysadmin: 'Admin', maintenance: 'Staff · Maintenance', cleaner: 'Staff · Cleaning', shop: 'Staff · Tuck shop', laundry: 'Staff · Laundry', it: 'IT support', guard: 'Security guard' };
  const roleLabel = a => (a.role === 'staff' ? (a.department === 'cleaning' ? 'Staff · Cleaning' : 'Staff · Maintenance') : KIND_LABEL[a.role] || a.role);

  // ---------- staff: My jobs
  const jobCard = r => {
    const open = R.form && R.form.id === r.id ? R.form.kind : null;
    const waiting = r.cost_status === 'pending' || r.cost_status === 'rejected';
    const form = open === 'update' ? `<form id="rlupd" class="col rl-inner" data-id="${r.id}"><h4>Update progress</h4>
        ${field('rlp' + r.id, 'Progress', `<select class="input" id="rlp${r.id}" name="progress">${PROGRESS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>`)}
        ${field('rln' + r.id, 'Note for the resident and committee', `<textarea class="input" id="rln${r.id}" name="note" maxlength="1000" placeholder="What you did, what is left"></textarea>`)}
        ${field('rlph' + r.id, 'Photo (optional)', `<input class="input" id="rlph${r.id}" name="photo" type="file" accept="image/jpeg,image/png,image/webp">`)}
        <div class="row"><button class="btn btn-primary">${ic('paper-plane-tilt')}Send update</button><button type="button" class="btn btn-secondary" data-act="rlclose">Cancel</button></div></form>`
      : open === 'est' ? `<form id="rlest" class="col rl-inner" data-id="${r.id}"><h4>Cost estimate</h4>
        <div class="two">${field('rla' + r.id, 'Amount (₹)', `<input class="input" id="rla${r.id}" name="amount" type="number" min="0" step="1" required inputmode="numeric">`)}${field('rlen' + r.id, 'What it is for', `<input class="input" id="rlen${r.id}" name="note" maxlength="300" placeholder="Parts and labour">`)}</div>
        <p class="muted sm" style="margin:0">Above the society's limit, the head of committee approves before work goes on.</p>
        <div class="row"><button class="btn btn-primary">${ic('currency-inr')}Save estimate</button><button type="button" class="btn btn-secondary" data-act="rlclose">Cancel</button></div></form>` : '';
    const ups = R.showUps === r.id ? `<div class="col rl-inner" style="gap:var(--space-2)"><h4>Job updates</h4>${R.ups[r.id] ? updatesList(r.id, R.ups[r.id]) : '<p class="muted">Loading…</p>'}</div>` : '';
    return `<article class="form-card rl-job"><div class="row rl-job-h"><span class="tile lg">${ic(catIcon(r.category))}</span><span class="col" style="gap:2px;min-width:0;flex:1">
        <span class="muted sm">${rid(r)} · ${esc(catLabel(r.category))} · Flat ${esc(r.flat)} · raised ${esc(day(r.created_at))}</span><span class="list-title rl-job-t">${esc(r.title)}</span></span></div>
      <div class="row" style="gap:6px">${statusTag(r)}${costTag(r)}${r.work_done_at ? '<span class="tag tag-outline">Work done, waiting for the committee</span>' : r.accepted_at ? '<span class="tag tag-accent">Taken up</span>' : ''}</div>
      ${r.description ? `<p class="rl-clip" style="margin:0">${esc(r.description)}</p>` : ''}
      ${waiting ? `<p class="callout" style="margin:0">${ic('hourglass')} ${r.cost_status === 'rejected' ? 'The cost estimate was rejected. Talk to the committee before going on.' : 'The cost is waiting for the head of committee. You can take up the job; work starts after approval.'}</p>` : ''}
      <div class="row">${!r.accepted_at ? `<button class="btn btn-primary btn-lg" data-act="rlaccept" data-id="${r.id}">${ic('hand-arrow-up')}Take up job</button>` : ''}
        <button class="btn ${r.accepted_at ? 'btn-primary' : 'btn-secondary'}" data-act="rlform" data-k="update" data-id="${r.id}" aria-expanded="${open === 'update'}">${ic('note-pencil')}Update progress</button>
        <button class="btn btn-secondary" data-act="rlform" data-k="est" data-id="${r.id}" aria-expanded="${open === 'est'}">${ic('currency-inr')}${r.est_cost != null ? 'Change cost estimate' : 'Add cost estimate'}</button>
        <button class="btn btn-ghost" data-act="rlups" data-id="${r.id}" aria-expanded="${R.showUps === r.id}">${ic('clock-counter-clockwise')}${R.showUps === r.id ? 'Hide updates' : 'Updates'}</button></div>
      ${form}${ups}</article>`;
  };
  PAGES.myjobs = async () => {
    const [j, sh] = await Promise.all([RAPI.staff.jobs(), RAPI.staff.shift().catch(() => null)]);
    const open = (j && j.open) || [], recent = (j && j.recent) || [];
    const shiftChip = sh && sh.current ? `<span class="tag tag-accent">On shift since ${esc(stamp(sh.current.punch_in))}</span><button class="btn btn-secondary" data-act="nav" data-page="shift">${ic('clock-user')}Punch in and hand-over</button>`
      : `<span class="tag tag-neutral">Not on shift</span><button class="btn btn-primary" data-act="rlpunchin">${ic('sign-in')}Punch in</button>`;
    const cleaning = S.me.department === 'cleaning';
    const hero = HP.hero({ theme: cleaning ? 'clean' : 'fix', name: S.me.name, kicker: `${cleaning ? 'Cleaning' : 'Maintenance'} · ${HP.todayLabel()}`,
      line: `${open.length ? `<b>${open.length} job${open.length > 1 ? 's' : ''}</b> assigned to you` : 'No jobs assigned right now'} · ${sh && sh.current ? 'on shift' : 'not on shift'}`,
      actions: [[sh && sh.current ? 'Punch out' : 'Punch in', 'clock-user', 'shift', !open.length], cleaning ? ['Waste collection', 'recycle', 'waste'] : ['Inventory', 'package', 'inventory']] });
    page(`<div class="rl">${hero}${head('Assigned work', `${open.length} open · ${recent.length} closed in the last 7 days`, shiftChip)}
      ${open.length ? `<div class="rl-grid">${open.map(jobCard).join('')}</div>` : '<p class="callout" style="margin:0">No open jobs. New jobs from the committee appear here.</p>'}
      <section class="col" style="gap:var(--space-2)"><h2>Closed this week</h2>${table(['Request', 'Flat', 'Category', 'Closed', 'Rating'], recent.map(r => `<tr><td><b>${esc(rid(r))}</b> ${esc(r.title)}</td><td>${esc(r.flat)}</td><td>${esc(catLabel(r.category))}</td><td>${esc(stamp(r.closed_at || r.updated_at))}</td><td>${r.rating ? esc(r.rating) + ' / 5' : '–'}</td></tr>`), 'Nothing closed in the last 7 days.')}</section></div>`);
    if (R.showUps && !R.ups[R.showUps]) loadUps(R.showUps);
  };
  async function loadUps(id) {
    try { R.ups[id] = await RAPI.requests.updates(id); } catch (x) { R.ups[id] = []; toast(x.message, 'error'); }
    if (S.page === 'myjobs' && R.showUps === id) render();
  }
  ACT.rlaccept = async el => { const r = await RAPI.staff.accept(el.dataset.id); toast(r && r.status === 'in_progress' ? 'Job taken up. The resident has been told.' : 'Job taken up'); render(); };
  ACT.rlform = el => { const id = Number(el.dataset.id), k = el.dataset.k; R.form = R.form && R.form.id === id && R.form.kind === k ? null : { id, kind: k }; render().then(() => { const f = $(k === 'est' ? '#rlest' : '#rlupd'); if (f) { f.scrollIntoView({ block: 'center' }); const i = f.querySelector('select, input'); if (i) i.focus(); } }); };
  ACT.rlclose = () => { R.form = null; render(); };
  ACT.rlups = el => { const id = Number(el.dataset.id); R.showUps = R.showUps === id ? null : id; if (R.showUps) delete R.ups[id]; render(); };

  // ---------- staff: Shift
  PAGES.shift = async () => {
    const s = await RAPI.staff.shift();
    const cur = s.current, mates = (s.colleagues || []).filter(c => c.id !== S.me.id);
    const now = cur ? `<section class="form-card col"><div class="row" style="gap:12px"><span class="tile lg">${ic('clock-user')}</span><span class="col" style="gap:2px"><span class="list-title rl-job-t">On shift</span><span class="muted">Since ${esc(stamp(cur.punch_in))}</span></span></div>
        <form id="rlout" class="col" style="gap:var(--space-3)"><h3>Punch out</h3>
          ${field('rlho', 'Hand over my open jobs to (optional)', `<select class="input" id="rlho" name="handover_to"><option value="">Nobody, I keep my jobs</option>${mates.map(c => `<option value="${c.id}">${esc(c.name)}${c.on_shift ? ' · on shift' : ''}</option>`).join('')}</select>`, 'Every open job of yours moves to them. Both of you and the committee are told.')}
          ${field('rlhn', 'Hand-over note', '<textarea class="input" id="rlhn" name="note" maxlength="500" placeholder="Where things stand, keys, parts ordered"></textarea>')}
          ${errLine()}<div class="row"><button class="btn btn-primary btn-lg">${ic('sign-out')}Punch out</button></div></form></section>`
      : `<section class="form-card col"><div class="row" style="gap:12px"><span class="tile lg">${ic('clock-user')}</span><span class="col" style="gap:2px"><span class="list-title rl-job-t">Not on shift</span><span class="muted">Punch in when you start work.</span></span></div>
        ${errLine()}<div class="row"><button class="btn btn-primary btn-lg" data-act="rlpunchin">${ic('sign-in')}Punch in</button></div></section>`;
    page(`<div class="rl">${head('Punch in and hand-over', 'Punch in when you arrive; punch out when you leave and hand open jobs to a colleague.')}${now}
      <section class="col" style="gap:var(--space-2)"><h2>Recent shifts</h2>${table(['In', 'Out', 'Hours', 'Handed over to', 'Note'], (s.recent || []).map(x => `<tr><td>${esc(stamp(x.punch_in))}</td><td>${x.punch_out ? esc(stamp(x.punch_out)) : '<span class="tag tag-accent">On shift</span>'}</td><td>${esc(hrs(x.hours))}</td><td>${esc(x.handover_to_name || '–')}</td><td>${esc(x.handover_note || '')}</td></tr>`), 'No shifts yet.')}</section>
      <section class="col" style="gap:var(--space-2)"><h2>Colleagues</h2><div class="row">${mates.map(c => `<span class="tag ${c.on_shift ? 'tag-accent' : 'tag-neutral'}">${esc(c.name)} · ${c.on_shift ? 'on shift' : 'off'}</span>`).join('') || '<span class="muted">No other staff accounts.</span>'}</div></section></div>`);
  };
  ACT.rlpunchin = async () => { await RAPI.staff.punchIn(); toast('Punched in'); render(); };

  // ---------- everyone: Help
  PAGES.help = async () => {
    const gs = await RAPI.help.guides();
    page(`<div class="rl">${head(isIT() ? 'Training guides' : 'Help', isIT() ? 'How-to guides for every role. Use them to train new users.' : 'Short how-to guides for what you can do in the portal.', `<button class="btn btn-secondary" data-act="nav" data-page="support">${ic('lifebuoy')}Report a portal problem</button>`)}
      <div class="rl-grid">${gs.map(g => `<article class="form-card rl-guide"><h3>${esc(g.title)}</h3><ol class="rl-steps">${(g.steps || []).map(s => `<li>${esc(s)}</li>`).join('')}</ol></article>`).join('') || '<p class="muted">No guides yet.</p>'}</div></div>`);
  };

  // ---------- everyone: Support (residents, committee, guards, staff raise tickets; IT works the queue)
  const ticketRow = t => `<button class="list-row ${R.ticket === t.id ? 'on' : ''}" data-act="rlticket" data-id="${t.id}"><span class="tile">${ic(t.kind === 'bug' ? 'bug' : t.kind === 'access' ? 'key' : t.kind === 'question' ? 'question' : 'ticket')}</span>
    <span class="col" style="gap:4px;min-width:0"><span class="muted xs">#${esc(t.id)} · ${esc(day(t.updated_at || t.created_at))}${itLike() ? ' · ' + esc(t.user_name || '') + (t.user_role ? ' (' + esc(KIND_LABEL[t.user_role] || t.user_role) + ')' : '') : ''}${t.replies ? ' · ' + esc(t.replies) + ' replies' : ''}</span><span class="list-title">${esc(t.subject)}</span><span style="align-self:flex-start">${ticketTag(t.status)}</span></span></button>`;
  PAGES.support = async () => {
    const it = itLike();
    const list = await RAPI.support.list(it ? R.sFilter : '');
    let detail = '';
    if (R.ticket) {
      try {
        const t = await RAPI.support.get(R.ticket);
        detail = `<section class="form-card col" aria-label="Ticket"><div class="row" style="justify-content:space-between"><span class="muted sm">#${esc(t.id)} · ${esc((TICKET_KINDS.find(k => k[0] === t.kind) || [0, t.kind])[1])} · ${esc(stamp(t.created_at))}${t.user_name ? ' · ' + esc(t.user_name) : ''}</span><button class="link-btn" data-act="rlticketclose">Close</button></div>
          <h3 style="margin:0">${esc(t.subject)}</h3><span>${ticketTag(t.status)}</span><p style="margin:0;white-space:pre-line">${esc(t.body)}</p>
          <div class="col" style="gap:var(--space-2)">${(t.replies || []).map(r => `<div class="rl-reply ${r.role === 'it' ? 'it' : ''}"><span class="muted sm"><b>${esc(r.author)}</b>${r.role ? ' · ' + esc(KIND_LABEL[r.role] || r.role) : ''} · ${esc(stamp(r.created_at))}</span><span style="white-space:pre-line">${esc(r.body)}</span></div>`).join('') || '<p class="muted" style="margin:0">No replies yet.</p>'}</div>
          <form id="rlreply" class="col" data-id="${t.id}" style="gap:var(--space-2)">${field('rlrb', 'Reply', '<textarea class="input" id="rlrb" name="body" required maxlength="3000"></textarea>')}
            ${it ? field('rlrs', 'Status', `<select class="input" id="rlrs" name="status" style="max-width:240px">${[['', 'Keep as it is'], ['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved']].map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>`) : ''}
            ${errLine()}<div class="row"><button class="btn btn-primary">${ic('paper-plane-tilt')}Send reply</button></div></form></section>`;
      } catch (x) { R.ticket = null; detail = `<p class="err">${esc(x.message)}</p>`; }
    }
    const create = it ? '' : `<form id="rlnew" class="form-card col"><h3>Report a portal problem</h3><p class="muted" style="margin:0">For problems with the portal itself. Building repairs go under Raise a request.</p>
      ${field('rlns', 'Subject', '<input class="input" id="rlns" name="subject" required maxlength="150" placeholder="e.g. The photo will not upload">')}
      ${field('rlnk', 'What kind of problem', `<select class="input" id="rlnk" name="kind">${TICKET_KINDS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>`)}
      ${field('rlnb', 'What happened', '<textarea class="input" id="rlnb" name="body" required maxlength="3000" placeholder="What you were doing, what you saw"></textarea>')}
      ${detail ? '' : errLine()}<div class="row"><button class="btn btn-primary">${ic('paper-plane-tilt')}Send to IT support</button></div></form>`;
    const filter = it ? `<div class="field"><label class="sr" for="rlsf">Status</label><select class="input" id="rlsf" style="width:auto">${[['', 'Any status'], ['open', 'Open'], ['in_progress', 'In progress'], ['resolved', 'Resolved']].map(([k, l]) => `<option value="${k}" ${R.sFilter === k ? 'selected' : ''}>${esc(l)}</option>`).join('')}</select></div>` : '';
    page(`<div class="rl">${head(it ? 'Support queries' : 'Support', it ? `${list.filter(t => t.status !== 'resolved').length} not resolved` : 'Tell IT support about a problem with the portal.', filter)}
      <div class="split"><div class="col" style="gap:var(--space-1)"><h2 style="margin-bottom:var(--space-2)">${it ? 'Tickets' : 'Your tickets'}</h2>${list.map(ticketRow).join('') || '<p class="muted">No tickets.</p>'}</div>
      <div class="col" style="gap:var(--space-4)">${detail}${create}</div></div></div>`);
  };
  ACT.rlticket = el => { R.ticket = Number(el.dataset.id); render(); };
  ACT.rlticketclose = () => { R.ticket = null; render(); };

  // ---------- IT: System health
  const uptime = s => { s = Number(s) || 0; const d = Math.floor(s / 86400), h = Math.floor(s % 86400 / 3600), m = Math.floor(s % 3600 / 60); return d ? `${d}d ${h}h` : h ? `${h}h ${m}m` : `${m}m`; };
  const mb = b => (b == null ? '–' : (Number(b) / 1048576).toFixed(1) + ' MB');
  const local = d => new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
  PAGES.health = async () => {
    const h = await RAPI.it.health(), m = (S.settings && S.settings.maintenance) || null;
    const counts = Object.entries(h.counts || {});
    const label = k => k.replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
    page(`<div class="rl">${head('Upgrades and maintenance', 'Server health, backups before upgrades, and the maintenance notice everyone sees.', `<button class="btn btn-secondary" data-act="rlhealth">${ic('arrows-clockwise')}Refresh</button>`)}
      <div class="eg-grid">${stat('clock', uptime(h.uptime_s), 'Up for', 'since the last restart')}${stat('database', mb(h.db_bytes), 'Database size')}${stat('cpu', num(h.memory_mb) + ' MB', 'Memory in use')}${stat('code', num(h.node), 'Node version', [h.version, h.commit && String(h.commit).slice(0, 7)].filter(Boolean).join(' · '))}${h.integrity ? stat('shield-check', h.integrity === 'ok' ? 'OK' : h.integrity, 'Database check') : ''}
        ${counts.map(([k, v]) => stat('list-numbers', num(v), label(k))).join('')}</div>
      ${h.hosting_note ? `<p class="callout" style="margin:0">${ic('info')} ${esc(h.hosting_note)}</p>` : ''}
      <div class="split-eq" style="align-items:start"><section class="form-card col"><h3>Backup</h3><p style="margin:0">Download a consistent copy of the database. Keep it somewhere safe; it holds residents' personal data. The download is recorded in the audit trail.</p>
        <div class="row"><a class="btn btn-primary" href="${esc(RAPI.it.backupUrl)}" download>${ic('download-simple')}Download backup</a></div></section>
      <form id="rlmaint" class="form-card col"><h3>Maintenance notice</h3><p class="muted" style="margin:0">Shown at the top of the portal for everyone. Leave the message empty to remove it.</p>
        ${field('rlmm', 'Message', `<textarea class="input" id="rlmm" name="message" maxlength="300" placeholder="The portal will be down for 15 minutes from 10 pm for an update.">${esc(m ? m.message : '')}</textarea>`)}
        ${field('rlmu', 'Until (optional)', `<input class="input" id="rlmu" name="until" type="datetime-local" style="max-width:260px" value="${m && m.until && !isNaN(new Date(m.until)) && /T/.test(m.until) ? esc(local(new Date(m.until))) : ''}">`)}
        ${errLine()}<div class="row"><button class="btn btn-primary">${ic('floppy-disk')}Save notice</button>${m && m.message ? `<button type="button" class="btn btn-secondary" data-act="rlmaintclear">${ic('x')}Remove notice</button>` : ''}</div></form></div>
      <section class="col" style="gap:var(--space-2)"><h2>Upgrades and maintenance log</h2>${table(['When', 'What', 'By'], (h.system_events || []).map(e => `<tr><td>${esc(stamp(e.created_at))}</td><td>${esc(EVENT[e.action] || e.action.replace(/_/g, ' '))}${e.detail && e.action !== 'backup' ? ': ' + esc(e.detail) : ''}</td><td>${esc(e.actor || 'system')}</td></tr>`), 'Nothing yet. Backups and maintenance notices are listed here.')}</section></div>`);
  };
  ACT.rlhealth = () => render();

  // ---------- IT: overview (IT home). Whiteboard IT duties: support queries, training, upgrades and maintenance.
  const EVENT = { backup: 'Backup downloaded', maintenance_set: 'Maintenance notice set', maintenance_cleared: 'Maintenance notice removed' };
  PAGES.itoverview = async () => {
    const [h, tickets] = await Promise.all([RAPI.it.health(), RAPI.support.list('').catch(() => [])]);
    const t = h.tickets || {}, m = h.maintenance || (S.settings && S.settings.maintenance) || null;
    const healthy = h.ok && h.integrity === 'ok';
    const items = [];
    if (!healthy) items.push({ icon: 'warning', text: 'The database check needs a look', sub: `Result: ${h.integrity || 'unknown'}`, page: 'health', tone: 'urgent', cta: 'Check' });
    tickets.filter(x => x.status === 'open').slice(0, 2).forEach(x => items.push({ icon: x.kind === 'bug' ? 'bug' : x.kind === 'access' ? 'key' : 'lifebuoy', text: x.subject, sub: `New support query from ${x.user_name || 'a user'}`, page: 'support', sel: x.id, act: 'rlticketgo', tone: 'warn', cta: 'Answer' }));
    if (t.in_progress) items.push({ icon: 'hourglass', text: `${t.in_progress} support quer${t.in_progress > 1 ? 'ies' : 'y'} in progress`, page: 'support' });
    if (!h.last_backup) items.push({ icon: 'download-simple', text: 'No backup taken yet', sub: 'Download one before the next upgrade', page: 'health', tone: 'warn', cta: 'Back up' });
    if (m && m.message) items.push({ icon: 'wrench', text: 'Maintenance notice is showing to everyone', sub: m.message, page: 'health', cta: 'Edit' });
    const line = `${healthy ? 'All systems normal' : 'Needs a look'} · up for ${esc(uptime(h.uptime_s))} · ${num(t.open)} open quer${t.open === 1 ? 'y' : 'ies'} · last backup ${h.last_backup ? esc(day(h.last_backup)) : 'never'}`;
    page(`<div class="calm">${HP.hero({ theme: 'it', name: S.me.name, kicker: `IT support · version ${[h.version, h.commit].filter(Boolean).join(' · ')}`, line,
      actions: [['Support queries', 'lifebuoy', 'support', true], ['Upgrades and maintenance', 'wrench', 'health']] })}
      ${HP.notifier(items.slice(0, 4), 'Nothing needs IT right now.')}</div>`);
  };
  ACT.rlticketgo = el => { R.ticket = Number(el.dataset.id); go('support'); };
  ACT.rlmaintclear = async () => { await RAPI.it.maintenance(''); S.settings = await API.settings.public().catch(() => S.settings); toast('Maintenance notice removed'); render(); };

  // ---------- committee: Cost approvals
  PAGES.costs = async () => {
    const ap = await RAPI.admin.approvals(), list = Array.isArray(ap) ? ap : ap.pending || [];
    const limit = ap && ap.approval_limit != null ? ap.approval_limit : null;
    const canDecide = ap && 'can_decide' in ap ? !!ap.can_decide : isGov(); // the API knows whether a head exists
    page(`<div class="rl">${head('Cost approvals', `Estimates above ${limit != null ? rupees(limit) : 'the approval limit'} wait here for the head of committee.`)}
      ${canDecide ? '' : '<p class="callout" style="margin:0">Only the head of committee approves costs. You can see what is waiting.</p>'}
      ${list.length ? `<div class="rl-grid">${list.map(r => `<article class="form-card rl-job"><div class="row rl-job-h"><span class="tile lg">${ic(catIcon(r.category))}</span><span class="col" style="gap:2px;min-width:0;flex:1"><span class="muted sm">${rid(r)} · ${esc(catLabel(r.category))} · Flat ${esc(r.flat)}</span><span class="list-title rl-job-t">${esc(r.title)}</span></span></div>
        <div class="row" style="gap:6px">${costTag(r)}${statusTag(r)}</div><span class="rl-amt">${esc(rupees(r.est_cost))}</span>${r.cost_note ? `<p style="margin:0;white-space:pre-line">${esc(r.cost_note)}</p>` : ''}
        <span class="muted sm">Assigned to ${esc(r.assignee_name || r.vendor_name || 'nobody yet')}</span>
        ${canDecide ? `<form class="costdec col" data-id="${r.id}" style="gap:var(--space-2)">${field('cdq' + r.id, 'Note (optional)', `<input class="input" id="cdq${r.id}" name="note" maxlength="300">`)}<div class="row"><button class="btn btn-primary" name="decision" value="approve">${ic('check')}Approve</button><button class="btn btn-secondary" name="decision" value="reject">${ic('x')}Reject</button><button type="button" class="btn btn-ghost" data-act="open" data-page="requests" data-id="${r.id}">Open request</button></div></form>`
          : `<div class="row"><button type="button" class="btn btn-secondary" data-act="open" data-page="requests" data-id="${r.id}">Open request</button></div>`}</article>`).join('')}</div>` : '<p class="callout" style="margin:0">No costs waiting for approval.</p>'}</div>`);
  };

  // ---------- committee: Reports
  const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };
  PAGES.reports = async () => {
    const month = R.month || thisMonth();
    const r = await RAPI.admin.reports(month);
    const ml = (() => { const [y, m] = String(r.month || month).split('-'); return new Date(Number(y), Number(m) - 1, 1).toLocaleDateString('en-GB', { month: 'long', year: 'numeric' }); })();
    page(`<div class="rl rl-report">${head('Monthly report', `${HP.SOCIETY.name} · ${ml}`, `<div class="field"><label class="sr" for="rlmonth">Month</label><input class="input" id="rlmonth" type="month" value="${esc(month)}" max="${esc(thisMonth())}"></div><button class="btn btn-primary" data-act="rlprint">${ic('printer')}Print</button>`)}
      <div class="eg-grid">${stat('note-pencil', num(r.raised), 'Requests raised')}${stat('check-circle', num(r.closed), 'Closed')}${stat('list-checks', num(r.open_now), 'Open now')}${stat('arrow-counter-clockwise', num(r.reopened), 'Reopened')}
        ${stat('warning', num(r.escalated), 'Escalated', 'past the SLA')}${stat('siren', num(r.emergencies), 'Emergencies')}${stat('user-plus', num(r.new_residents), 'New residents')}${stat('megaphone', num(r.notices), 'Notices posted')}
        ${stat('star', r.avg_rating != null ? r.avg_rating + ' / 5' : '–', 'Average rating')}${stat('user-gear', hrs(r.avg_hours_to_assign), 'Average time to assign')}${stat('timer', hrs(r.avg_hours_to_close), 'Average time to close')}</div>
      <section class="col" style="gap:var(--space-2)"><h2>By category</h2>${table(['Category', 'Raised', 'Closed'], (r.by_category || []).map(c => `<tr><td>${esc(catLabel(c.category))}</td><td>${esc(c.raised)}</td><td>${esc(c.closed)}</td></tr>`), 'No requests this month.')}</section>
      <section class="col" style="gap:var(--space-2)"><h2>By vendor and staff</h2>${table(['Name', 'Kind', 'Closed', 'Average rating'], (r.by_assignee || []).map(a => `<tr><td>${esc(a.name)}</td><td>${esc(a.kind === 'staff' ? 'Society staff' : a.kind === 'vendor' ? 'Vendor' : a.kind)}</td><td>${esc(a.closed)}</td><td>${a.avg_rating != null ? esc(a.avg_rating) + ' / 5' : '–'}</td></tr>`), 'No work closed this month.')}</section>
      <section class="col" style="gap:var(--space-2)"><h2>Committee activity</h2>${table(['Name', 'Position', 'Actions', 'Assigned', 'Status changes', 'Cost decisions'], (r.committee || []).map(c => `<tr><td>${esc(c.name)}</td><td>${esc(HP.POSITION[c.position] || 'Admin')}</td><td>${esc(c.actions)}</td><td>${esc(c.assigned)}</td><td>${esc(c.status_changes)}</td><td>${esc(c.approvals)}</td></tr>`), 'No committee activity this month.')}</section>
      <p class="muted sm rl-printnote">Printed ${esc(new Date().toLocaleString('en-GB'))} from the ${esc(HP.SOCIETY.name)} portal.</p></div>`);
  };
  ACT.rlprint = () => window.print();

  // ---------- committee: Staff attendance
  PAGES.attendance = async () => {
    const rows = await RAPI.admin.attendance(R.days);
    const onNow = rows.filter(x => !x.punch_out).length;
    page(`<div class="rl">${head('Staff attendance', `${onNow} on shift now`, `<div class="field"><label class="sr" for="rldays">Period</label><select class="input" id="rldays" style="width:auto">${[['7', 'Last 7 days'], ['14', 'Last 14 days'], ['30', 'Last 30 days']].map(([k, l]) => `<option value="${k}" ${R.days === k ? 'selected' : ''}>${l}</option>`).join('')}</select></div>`)}
      ${table(['Name', 'Punched in', 'Punched out', 'Hours', 'Handed over to', 'Note'], rows.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(stamp(x.punch_in))}</td><td>${x.punch_out ? esc(stamp(x.punch_out)) : '<span class="tag tag-accent">On shift</span>'}</td><td>${esc(hrs(x.hours))}</td><td>${esc(x.handover_to_name || '–')}</td><td>${esc(x.handover_note || '')}</td></tr>`), 'No shifts in this period.')}</div>`);
  };

  // ---------- head / sysadmin: Accounts
  // Accounts list: the person, role and status; position, suspend and remove sit behind the "⋯" menu.
  const accRow = a => {
    const me = a.id === S.me.id, committee = a.role === 'admin';
    const kind = committee ? (HP.POSITION[a.position] || 'Admin') : roleLabel(a);
    const stag = { approved: ['tag-accent', 'Active'], suspended: ['tag-neutral', 'Suspended'], removed: ['tag-neutral', 'Removed'] }[a.status] || ['tag-neutral', a.status];
    const menu = me ? '<span class="muted sm">This is you</span>' : a.status === 'removed' ? '' : HP.kebab(`More actions for ${a.name}`, [
      committee ? { label: 'Change position', icon: 'arrows-down-up', act: 'rlposopen', data: { id: a.id } } : null,
      { label: a.status === 'suspended' ? 'Reactivate' : 'Suspend', icon: a.status === 'suspended' ? 'play-circle' : 'pause-circle', act: 'rlsus', data: { id: a.id, to: a.status === 'suspended' ? 'approved' : 'suspended' } },
      { label: 'Remove', icon: 'trash', act: 'rldel', data: { id: a.id }, danger: true },
    ]);
    const extra = R.accDel === a.id ? `<tr class="acc-panel"><td colspan="5"><span class="row" style="justify-content:space-between"><span>Remove ${esc(a.name)}? They will no longer be able to sign in.</span><span class="row-acts"><button type="button" class="btn btn-danger" data-act="rldelok" data-id="${a.id}">Remove</button><button type="button" class="btn btn-secondary" data-act="rldelno">Keep</button></span></span></td></tr>`
      : R.accPos === a.id ? `<tr class="acc-panel"><td colspan="5"><span class="row" style="gap:10px"><label for="rlpos${a.id}">Position of ${esc(a.name)}</label><select class="input" id="rlpos${a.id}" data-rlpos="${a.id}" style="width:auto">${['member', 'head', 'sysadmin'].map(p => `<option value="${p}" ${(a.position || 'sysadmin') === p ? 'selected' : ''}>${esc(HP.POSITION[p])}</option>`).join('')}</select><button type="button" class="btn btn-ghost" data-act="rlposclose">Done</button></span></td></tr>` : '';
    return `<tr><td><span class="row" style="gap:var(--space-2);flex-wrap:nowrap"><span class="avatar light">${esc(initials(a.name))}</span><span class="col" style="gap:0"><b>${esc(a.name)}</b><span class="muted xs">${esc(a.email)}</span></span></span></td>
      <td>${esc(kind)}${a.on_shift ? ' <span class="tag tag-accent">on shift</span>' : ''}</td><td><span class="tag ${stag[0]}">${esc(stag[1])}</span></td><td>${esc(day(a.created_at))}</td><td class="acc-menu">${menu}</td></tr>${extra}`;
  };
  PAGES.accounts = async () => {
    if (!isGov()) return page(`<div class="rl">${head('Accounts', '')}<p class="callout" style="margin:0">Only the head of committee or the admin can manage accounts.</p></div>`);
    const list = await RAPI.admin.accounts();
    const order = ['admin', 'staff', 'it', 'guard', 'shop', 'laundry'], sorted = [...list].sort((x, y) => order.indexOf(x.role) - order.indexOf(y.role) || String(x.name).localeCompare(String(y.name)));
    page(`<div class="rl">${head('Accounts', 'Committee, staff, IT, guard and service-provider accounts. Residents are managed under Residents.')}${errLine()}
      ${table(['Person', 'Role', 'Status', 'Added', ''], sorted.map(accRow), 'No accounts yet.')}
      <form id="rlacc" class="form-card col" style="max-width:720px"><h3>Add an account</h3>
        <div class="two">${field('rlan', 'Full name', '<input class="input" id="rlan" name="name" required maxlength="100">')}${field('rlak', 'Role', `<select class="input" id="rlak" name="kind">${Object.entries(KIND_LABEL).map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>`)}</div>
        <div class="two">${field('rlae', 'Email', '<input class="input" id="rlae" name="email" type="email" required autocomplete="off">')}${field('rlap', 'Temporary password (8+ characters)', '<input class="input" id="rlap" name="password" type="password" required minlength="8" autocomplete="new-password">')}</div>
        <div class="row"><button class="btn btn-primary">${ic('user-plus')}Add account</button><span class="muted sm">Ask them to change the password after signing in.</span></div></form></div>`);
  };
  const accRun = fn => async el => { R.err = ''; try { await fn(el); } catch (x) { R.err = x.message; toast(x.message, 'error'); } render(); };
  ACT.rlsus = accRun(async el => { await RAPI.admin.patchAccount(el.dataset.id, { status: el.dataset.to }); toast(el.dataset.to === 'suspended' ? 'Account suspended' : 'Account reactivated'); });
  ACT.rldel = el => { R.accDel = Number(el.dataset.id); R.accPos = null; render(); };
  ACT.rlposopen = el => { R.accPos = Number(el.dataset.id); R.accDel = null; render(); };
  ACT.rlposclose = () => { R.accPos = null; render(); };
  ACT.rldelno = () => { R.accDel = null; render(); };
  ACT.rldelok = accRun(async el => { R.accDel = null; await RAPI.admin.removeAccount(el.dataset.id); toast('Account removed'); });

  // ---------- everyone: Profile
  PAGES.profile = async () => {
    const m = S.me;
    const rows = [['user', 'Name', m.name], ['identification-badge', 'Role', positionLabel(m)], ['envelope-simple', 'Email', m.email], ['phone', 'Phone', m.phone]];
    if (m.flat) rows.splice(2, 0, ['house', 'Flat', m.flat]);
    page(`<div class="rl">${head('Profile', '')}
      <div class="split-eq" style="align-items:start"><section class="form-card col"><div class="row" style="gap:var(--space-3);flex-wrap:nowrap"><span class="avatar" style="width:72px;height:72px;font-size:26px">${esc(initials(m.name))}</span><span class="col" style="gap:2px"><span class="list-title rl-job-t">${esc(m.name)}</span><span class="tag tag-accent" style="align-self:flex-start">${esc(positionLabel(m))}</span></span></div>
        ${rows.map(([i, k, v]) => `<div class="kv">${ic(i)}<span class="muted">${esc(k)}</span><span style="font-weight:600">${esc(v || 'Not added')}</span></div>`).join('')}
        <div class="row"><button class="btn btn-secondary" data-act="logout">${ic('sign-out')}Sign out</button></div></section>
      <div class="col" style="gap:var(--space-4)">${W.flatNav() ? '<p class="callout" style="margin:0">Ask the committee to change your name or phone number.</p>' : `<form id="rlprof" class="form-card col"><h3>Your details</h3>${field('rlpn', 'Full name', `<input class="input" id="rlpn" name="name" required maxlength="100" value="${esc(m.name)}" autocomplete="name">`)}${field('rlpp', 'Mobile', `<input class="input" id="rlpp" name="phone" maxlength="20" inputmode="tel" value="${esc(m.phone || '')}" autocomplete="tel">`)}
        <div class="row"><button class="btn btn-primary">${ic('floppy-disk')}Save</button></div></form>`}
        <form id="rlpw" class="form-card col"><h3>Change password</h3>${field('rlpc', 'Current password', '<input class="input" id="rlpc" name="current" type="password" required autocomplete="current-password">')}${field('rlpx', 'New password (8+ characters)', '<input class="input" id="rlpx" name="next" type="password" required minlength="8" autocomplete="new-password">')}
        ${errLine()}<div class="row"><button class="btn btn-primary">${ic('lock-key')}Change password</button></div></form></div></div></div>`);
  };

  // ---------- events
  document.addEventListener('change', async e => {
    const t = e.target;
    try {
      if (t.id === 'rlmonth') { if (t.value) { R.month = t.value; await render(); } }
      else if (t.id === 'rldays') { R.days = t.value; await render(); }
      else if (t.id === 'rlsf') { R.sFilter = t.value; R.ticket = null; await render(); }
      else if (t.dataset && t.dataset.rlpos) { R.err = ''; try { await RAPI.admin.patchAccount(t.dataset.rlpos, { position: t.value }); toast('Position changed'); } catch (x) { R.err = x.message; toast(x.message, 'error'); } await render(); }
    } catch (x) { toast(x.message, 'error'); }
  });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!/^rl/.test(f.id || '')) return;
    e.preventDefault(); e.stopPropagation(); setErr(''); R.err = '';
    const d = Object.fromEntries(new FormData(f));
    const btn = f.querySelector('button:not([type=button])'); if (btn) btn.disabled = true;
    try {
      if (f.id === 'rlupd') {
        const fd = await HP.fileToUpload(f);
        await RAPI.staff.update(f.dataset.id, fd); R.form = null; delete R.ups[Number(f.dataset.id)];
        toast(d.progress === 'done' ? 'Marked done. The committee will check and close it.' : 'Update sent. The resident can see it.'); await render();
      } else if (f.id === 'rlest') {
        const r = await RAPI.requests.estimate(f.dataset.id, Number(d.amount), (d.note || '').trim()); R.form = null;
        toast(r && r.cost_status === 'pending' ? 'Estimate sent to the head of committee for approval' : 'Estimate saved'); await render();
      } else if (f.id === 'rlout') {
        const body = {}; if (d.handover_to) body.handover_to = Number(d.handover_to); if ((d.note || '').trim()) body.note = d.note.trim();
        await RAPI.staff.punchOut(body); toast(body.handover_to ? 'Punched out. Your open jobs were handed over.' : 'Punched out'); await render();
      } else if (f.id === 'rlnew') {
        const r = await RAPI.support.create({ subject: d.subject.trim(), kind: d.kind, body: d.body.trim() }); R.ticket = r && r.id ? r.id : null; toast('Sent to IT support'); await render();
      } else if (f.id === 'rlreply') {
        await RAPI.support.reply(f.dataset.id, d.body.trim(), d.status || undefined); toast('Reply sent'); await render();
      } else if (f.id === 'rlmaint') {
        const msg = (d.message || '').trim(), until = d.until ? new Date(d.until).toISOString() : undefined;
        await RAPI.it.maintenance(msg, msg ? until : undefined); S.settings = await API.settings.public().catch(() => S.settings);
        toast(msg ? 'Maintenance notice is showing for everyone' : 'Maintenance notice removed'); await render();
      } else if (f.id === 'rlacc') {
        await RAPI.admin.createAccount({ name: d.name.trim(), email: d.email.trim(), password: d.password, kind: d.kind }); toast((KIND_LABEL[d.kind] || 'Account') + ' added'); await render();
      } else if (f.id === 'rlprof') {
        const u = await API.profile.update({ name: d.name.trim(), phone: (d.phone || '').trim() }); Object.assign(S.me, u || { name: d.name.trim(), phone: d.phone }); toast('Details saved'); await render();
      } else if (f.id === 'rlpw') {
        await API.profile.changePassword(d.current, d.next); f.reset(); toast('Password changed');
      }
    } catch (x) { setErr(x.message); toast(x.message, 'error'); }
    finally { if (btn && btn.isConnected) btn.disabled = false; }
  }, true);
})();
