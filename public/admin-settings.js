// Committee settings hub (admin only): General, Access control, Users, Guards, Features, Sign-in.
// Loaded after web.js; registers the 'settings' and 'guards' pages and its own delegated events on window.HPWeb.
(() => {
  const W = window.HPWeb; if (!W) return;
  const { esc, ic, toast, initials, TYPE, SOCIETY } = HP;
  const { S, PAGES, ACT, page, render } = W;
  const $ = (s, r = document) => r.querySelector(s);

  const SECS = [['general', 'General', 'buildings'], ['access', 'Access control', 'lock-key'], ['users', 'Users', 'users-three'], ['guards', 'Guards', 'identification-card'], ['features', 'Features', 'toggle-right'], ['signin', 'Sign-in', 'sign-in']];
  const FEATS = [['emergency', 'Emergency alerts', 'Residents can raise alerts that reach the committee.'], ['gate', 'Gate and visitor passes', 'Gate passes, QR codes and the guard screen.'], ['contacts', 'Contacts', 'The "Who to call" directory.'], ['notices', 'Notices', 'The notice board.']];
  const KINDS = ['Co-operative Housing Society', 'Apartment Owners Association', 'Residential Complex', 'Gated Community'];
  const ST = { settings: null, access: null, draft: null, orig: null, users: [], guards: [], pw: null, del: null, gdel: null, q: '', stf: '' };
  const clone = o => JSON.parse(JSON.stringify(o || {}));
  const sec = () => (SECS.some(s => s[0] === S.setSec) ? S.setSec : 'general');
  const setErr = m => { const e = $('#sterr'); if (e) e.textContent = m || ''; };
  const run = fn => async (...a) => { setErr(''); try { await fn(...a); } catch (x) { setErr(x.message); toast(x.message); } };

  const sw = (attrs, label, on) => `<label class="st-sw"><input type="checkbox" role="switch" ${attrs} ${on ? 'checked' : ''}><span class="st-sw-t" aria-hidden="true"></span><span class="sr">${esc(label)}</span></label>`;
  const field = (id, label, input, hint) => `<div class="field"><label for="${id}">${label}</label>${input}${hint ? `<span class="muted sm">${hint}</span>` : ''}</div>`;
  const saveRow = label => `<div class="row"><button class="btn btn-primary">${ic('floppy-disk')}${label}</button><span class="ok" id="stok" role="status"></span></div>`;

  // ---------- sections
  const general = () => {
    const s = ST.settings, kinds = KINDS.includes(s.society_kind) || !s.society_kind ? KINDS : [s.society_kind, ...KINDS];
    return `<h2>General</h2><p class="muted">Shown on the sign-in page, the menu and in messages to residents.</p>
      <form id="stgeneral" class="col st-form">${field('stn', 'Society name', `<input class="input" id="stn" name="society_name" required maxlength="100" value="${esc(s.society_name)}">`)}
      ${field('stk', 'Type of society', `<select class="input" id="stk" name="society_kind">${kinds.map(k => `<option ${k === s.society_kind ? 'selected' : ''}>${esc(k)}</option>`).join('')}</select>`)}
      ${saveRow('Save')}</form>`;
  };

  const access = () => {
    const a = ST.access, roles = a.roles || ['owner', 'tenant', 'family'];
    const head = roles.map(r => `<th scope="col">${esc(TYPE[r] ? TYPE[r].replace(' member', '') : r)}</th>`).join('') + '<th scope="col">Committee</th>';
    const rows = a.permissions.map(p => `<tr><th scope="row">${esc(p.label)}</th>${roles.map(r => `<td>${sw(`data-role="${esc(r)}" data-perm="${esc(p.key)}"`, `${p.label}: ${r}`, !!(ST.draft[r] && ST.draft[r][p.key]))}</td>`).join('')}
      <td><span class="st-lock" title="The committee always has access">${ic('lock-simple')}<span class="sm">Always</span></span></td></tr>`).join('');
    return `<h2>Access control</h2><p class="muted">Choose what each kind of resident can do. The committee always has full access.</p>
      <div class="table-wrap"><table class="table st-matrix"><thead><tr><th scope="col">Permission</th>${head}</tr></thead><tbody>${rows}</tbody></table></div>
      <div class="st-savebar"><span id="stdirty" class="muted" role="status"></span><button type="button" class="btn btn-secondary" data-act="stdiscard" id="stdiscard">Discard</button><button type="button" class="btn btn-primary" data-act="stsaveaccess" id="stsaveaccess">Save changes</button></div>`;
  };
  const isDirty = () => JSON.stringify(ST.draft) !== JSON.stringify(ST.orig);
  const paintDirty = () => { const d = isDirty(), t = $('#stdirty'); if (!t) return; t.innerHTML = d ? `<span class="st-dot"></span>Unsaved changes` : 'All changes saved'; $('#stdiscard').disabled = !d; $('#stsaveaccess').disabled = !d; };

  const features = () => `<h2>Features</h2><p class="muted">Switch off what your society does not use. It disappears for residents straight away.</p>
    <form id="stfeatures" class="col st-form"><div class="st-list">${FEATS.map(([k, l, d]) => `<div class="st-item"><span class="col" style="gap:0"><b>${l}</b><span class="muted sm">${d}</span></span>${sw(`name="${k}"`, l, ST.settings.features && ST.settings.features[k] !== false)}</div>`).join('')}</div>${saveRow('Save')}</form>`;

  const signin = () => `<h2>Sign-in</h2><p class="muted">Let residents sign in with their Google account.</p>
    <form id="stsignin" class="col st-form">${field('stg', 'Google client ID', `<input class="input" id="stg" name="google_client_id" maxlength="200" autocomplete="off" spellcheck="false" placeholder="1234-abc.apps.googleusercontent.com" value="${esc(ST.settings.google_client_id || '')}">`, 'Leave empty to turn Google sign-in off.')}
      <ol class="st-how"><li>In Google Cloud Console, create an OAuth client of type "Web application".</li><li>Add this site's address under Authorised JavaScript origins.</li><li>Paste the client ID here and save.</li></ol>
      <p class="callout st-note">${ic('info')} Google only signs in people who already have an approved account here. It never creates one.</p>${saveRow('Save')}</form>`;

  const userRow = u => {
    const stag = { approved: 'tag-accent', pending: 'tag-accent-2', suspended: 'tag-danger', rejected: 'tag-neutral' }[u.status] || 'tag-neutral';
    const ctl = u.status === 'approved' || u.status === 'suspended';
    return `<li class="st-user" data-id="${u.id}"><div class="st-user-h"><span class="avatar light">${esc(initials(u.name))}</span><span class="col" style="gap:0;flex:1;min-width:0"><b>${esc(u.name)}</b><span class="muted sm st-ell">${esc(u.email)}</span></span>
      <span class="row" style="gap:6px"><span class="tag tag-outline">${esc(TYPE[u.resident_type] || u.resident_type || u.role)}</span><span class="tag ${stag}">${esc(u.status)}</span></span></div>
      <div class="st-user-c">
        <div class="field st-sel"><label for="ut${u.id}">Type</label><select class="input" id="ut${u.id}" data-utype="${u.id}">${['owner', 'tenant', 'family'].map(t => `<option value="${t}" ${u.resident_type === t ? 'selected' : ''}>${TYPE[t]}</option>`).join('')}</select></div>
        <form class="st-uflat" data-id="${u.id}"><div class="field"><label for="uf${u.id}">Flat</label><div class="row" style="flex-wrap:nowrap;gap:6px"><input class="input" id="uf${u.id}" name="flat" required maxlength="20" value="${esc(u.flat || '')}"><button class="btn btn-secondary">Save</button></div></div></form>
        <div class="row st-acts">${ctl ? `<button type="button" class="btn btn-secondary" data-act="stsuspend" data-id="${u.id}" data-to="${u.status === 'approved' ? 'suspended' : 'approved'}">${ic(u.status === 'approved' ? 'pause-circle' : 'play-circle')}${u.status === 'approved' ? 'Suspend' : 'Reactivate'}</button>` : ''}
          <button type="button" class="btn btn-secondary" data-act="stpw" data-id="${u.id}" aria-expanded="${ST.pw === u.id}">${ic('key')}Reset password</button>
          ${ST.del === u.id ? `<button type="button" class="btn btn-danger" data-act="stdelok" data-id="${u.id}">Remove ${esc(u.name)}?</button><button type="button" class="btn btn-secondary" data-act="stdelkeep">Keep</button>` : `<button type="button" class="btn btn-secondary" data-act="stdel" data-id="${u.id}" aria-label="Remove ${esc(u.name)}">${ic('trash')}Remove</button>`}</div>
        ${ST.pw === u.id ? `<form class="st-upw row" data-id="${u.id}"><div class="field grow"><label for="up${u.id}">New password (8+ characters)</label><input class="input" id="up${u.id}" name="password" type="password" required minlength="8" autocomplete="new-password"></div><button class="btn btn-primary" style="align-self:flex-end">Set password</button><button type="button" class="btn btn-secondary" data-act="stpw" data-id="${u.id}" style="align-self:flex-end">Cancel</button></form>` : ''}
      </div></li>`;
  };
  const filtered = () => { const q = ST.q.trim().toLowerCase(); return ST.users.filter(u => (!ST.stf || u.status === ST.stf) && (!q || [u.name, u.email, u.flat].some(x => String(x || '').toLowerCase().includes(q)))); };
  const drawUsers = () => { const l = $('#stlist'); if (!l) return; const f = filtered(); l.innerHTML = f.map(userRow).join('') || '<li class="muted">No residents match.</li>'; const c = $('#stcount'); if (c) c.textContent = f.length + ' of ' + ST.users.length; };
  const users = () => `<h2>Users</h2><p class="muted">Approve or reject new residents on the Approvals page. Manage everyone else here.</p>
    <div class="row st-filters"><div class="field grow"><label class="sr" for="stq">Search residents</label><input class="input" id="stq" type="search" placeholder="Search by name, email or flat" autocomplete="off" value="${esc(ST.q)}"></div>
      <div class="field"><label class="sr" for="stsf">Status</label><select class="input" id="stsf"><option value="">Any status</option>${['approved', 'pending', 'suspended', 'rejected'].map(s => `<option value="${s}" ${ST.stf === s ? 'selected' : ''}>${s[0].toUpperCase() + s.slice(1)}</option>`).join('')}</select></div><span class="muted sm" id="stcount"></span></div>
    <ul class="st-users" id="stlist"></ul>`;

  const guards = () => `<h2>Guards</h2><p class="muted">Guards sign in to the gate screen only.</p>
    <ul class="st-users">${ST.guards.map(g => `<li class="st-user"><div class="st-user-h"><span class="avatar light">${esc(initials(g.name))}</span><span class="col" style="gap:0;flex:1;min-width:0"><b>${esc(g.name)}</b><span class="muted sm st-ell">${esc(g.email)}</span></span>
      ${ST.gdel === g.id ? `<button type="button" class="btn btn-danger" data-act="stgdok" data-id="${g.id}">Remove ${esc(g.name)}?</button><button type="button" class="btn btn-secondary" data-act="stgdkeep">Keep</button>` : `<button type="button" class="btn btn-secondary" data-act="stgd" data-id="${g.id}" aria-label="Remove ${esc(g.name)}">${ic('trash')}Remove</button>`}</div></li>`).join('') || '<li class="muted">No guards yet.</li>'}</ul>
    <form id="stguard" class="col st-form st-card"><h3>Add a guard</h3>${field('sgn', 'Name', '<input class="input" id="sgn" name="name" required maxlength="100">')}
      ${field('sge', 'Email', '<input class="input" id="sge" name="email" type="email" required autocomplete="off">')}${field('sgp', 'Temporary password (8+ characters)', '<input class="input" id="sgp" name="password" type="password" required minlength="8" autocomplete="new-password">')}
      <div class="row"><button class="btn btn-primary">Add guard</button></div></form>`;

  // ---------- page
  PAGES.settings = async () => {
    const s = sec();
    let loadErr = '';
    try {
      if (s === 'access') { ST.access = await API.admin.access(); ST.orig = clone(ST.access.matrix); ST.draft = clone(ST.access.matrix); }
      else if (s === 'users') { ST.users = (await API.admin.allUsers()).filter(u => u.role !== 'admin' && u.role !== 'guard'); if (S.suq != null) { ST.q = S.suq; S.suq = null; } }
      else if (s === 'guards') ST.guards = await API.gate.guards();
      else ST.settings = await API.admin.settings();
    } catch (x) { loadErr = x.message; }
    const body = loadErr ? '' : { general, access, users, guards, features, signin }[s]();
    page(`<div class="st"><header class="st-head"><h1>Settings</h1></header><div class="st-grid">
      <nav class="st-nav" aria-label="Settings sections">${SECS.map(([k, l, i]) => `<button type="button" class="st-tab ${k === s ? 'on' : ''}" data-act="stsec" data-s="${k}" ${k === s ? 'aria-current="page"' : ''}>${ic(i)}<span>${l}</span></button>`).join('')}</nav>
      <section class="st-panel" aria-live="polite"><p class="err" id="sterr" role="alert">${esc(loadErr)}</p>${body}</section></div></div>`);
    if (!loadErr && s === 'access') paintDirty();
    if (!loadErr && s === 'users') drawUsers();
  };
  PAGES.guards = () => { S.setSec = 'guards'; return PAGES.settings(); };

  // ---------- events
  ACT.stsec = el => { if (el.dataset.s === sec() && S.page === 'settings') return; if (isDirty() && sec() === 'access' && S.page === 'settings' && !confirmLeave()) return; S.setSec = el.dataset.s; S.page = 'settings'; ST.pw = ST.del = ST.gdel = null; render(); };
  // No window.confirm: a dirty matrix just warns inline and a second click leaves.
  let warned = false;
  const confirmLeave = () => { if (warned) { warned = false; return true; } warned = true; setErr('You have unsaved changes. Save or discard them, or choose the section again to leave.'); return false; };
  ACT.stdiscard = () => { ST.draft = clone(ST.orig); document.querySelectorAll('input[data-role]').forEach(i => { i.checked = !!(ST.draft[i.dataset.role] && ST.draft[i.dataset.role][i.dataset.perm]); }); paintDirty(); };
  ACT.stsaveaccess = run(async () => { await API.admin.setAccess(ST.draft); toast('Access saved'); warned = false; render(); });
  const reload = async () => { ST.users = (await API.admin.allUsers()).filter(u => u.role !== 'admin' && u.role !== 'guard'); drawUsers(); };
  ACT.stsuspend = run(async el => { await API.admin.patchUser(el.dataset.id, { status: el.dataset.to }); toast(el.dataset.to === 'suspended' ? 'Suspended' : 'Reactivated'); await reload(); });
  ACT.stpw = el => { const id = Number(el.dataset.id); ST.pw = ST.pw === id ? null : id; ST.del = null; drawUsers(); const i = $(`#up${id}`); if (i) i.focus(); };
  ACT.stdel = el => { ST.del = Number(el.dataset.id); ST.pw = null; drawUsers(); };
  ACT.stdelkeep = () => { ST.del = null; drawUsers(); };
  ACT.stdelok = run(async el => { await API.admin.removeUser(el.dataset.id); ST.del = null; toast('Removed'); await reload(); });
  ACT.stgd = el => { ST.gdel = Number(el.dataset.id); render(); };
  ACT.stgdkeep = () => { ST.gdel = null; render(); };
  ACT.stgdok = run(async el => { ST.gdel = null; await API.gate.removeGuard(el.dataset.id); toast('Guard removed'); render(); });

  document.addEventListener('input', e => {
    if (e.target.id === 'stq') { ST.q = e.target.value; drawUsers(); }
  });
  document.addEventListener('change', run(async e => {
    const t = e.target;
    if (t.matches && t.matches('input[data-role]')) { (ST.draft[t.dataset.role] = ST.draft[t.dataset.role] || {})[t.dataset.perm] = t.checked; warned = false; paintDirty(); }
    else if (t.id === 'stsf') { ST.stf = t.value; drawUsers(); }
    else if (t.dataset && t.dataset.utype) { try { await API.admin.patchUser(t.dataset.utype, { resident_type: t.value }); toast('Type updated'); } finally { await reload(); } }
  }));
  document.addEventListener('submit', async e => {
    const f = e.target; if (!(/^st/.test(f.id) || f.classList.contains('st-uflat') || f.classList.contains('st-upw'))) return;
    e.preventDefault();
    const ok = m => { const o = $('#stok'); if (o) o.textContent = m; toast(m); };
    const d = Object.fromEntries(new FormData(f));
    try {
      if (f.id === 'stgeneral') {
        const r = await API.admin.setSettings({ society_name: d.society_name.trim(), society_kind: d.society_kind });
        ST.settings = Object.assign(ST.settings || {}, { society_name: d.society_name.trim(), society_kind: d.society_kind }, r && r.society_name ? r : {});
        Object.assign(SOCIETY, { name: ST.settings.society_name, kind: ST.settings.society_kind }); document.title = SOCIETY.name + ' Portal'; setErr(''); await render(); toast('Saved');
      } else if (f.id === 'stfeatures') {
        const features = {}; FEATS.forEach(([k]) => { features[k] = f.elements[k].checked; });
        await API.admin.setSettings({ features }); S.me.features = Object.assign({}, S.me.features, features); setErr(''); await render(); toast('Features saved');
      } else if (f.id === 'stsignin') {
        const id = (d.google_client_id || '').trim(); await API.admin.setSettings({ google_client_id: id }); S.gid = id; setErr(''); ok(id ? 'Google sign-in is on' : 'Google sign-in is off');
      } else if (f.id === 'stguard') {
        await API.gate.addGuard({ name: d.name.trim(), email: d.email.trim(), password: d.password }); setErr(''); toast('Guard added'); await render();
      } else if (f.classList.contains('st-uflat')) {
        await API.admin.patchUser(f.dataset.id, { flat: d.flat.trim() }); toast('Flat updated'); await reload();
      } else if (f.classList.contains('st-upw')) {
        await API.admin.resetPassword(f.dataset.id, d.password); ST.pw = null; toast('Password reset'); drawUsers();
      }
    } catch (x) { setErr(x.message); toast(x.message); }
  }, true);
})();
