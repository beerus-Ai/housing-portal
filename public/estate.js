// Estate pages: Vehicles, Parking, Workers and the committee's live Gate overview. Loaded after web.js and dash.js.
// Uses only the shared palette (dark teal, white, soft teal, brand teal). Delegated events (data-act), no inline handlers.
(() => {
  const W = window.HPWeb; if (!W) return;
  const { esc, ic, toast, initials, stamp } = HP;
  const { S, PAGES, ACT, page, go, isAdmin } = W;
  const $ = (s, r = document) => r.querySelector(s);
  const E = { veh: [], vq: '', vtype: 'car', vdel: null, pk: null, pksel: null, pkdel: null, wk: [], wedit: null, wdel: null };
  const setErr = m => { const e = $('#eserr'); if (e) e.textContent = m || ''; };
  const head = (title, sub) => `<header class="es-h"><h1>${esc(title)}</h1><p class="muted">${esc(sub)}</p></header>`;
  const empty = t => `<p class="es-empty">${esc(t)}</p>`;
  const natural = (a, b) => String(a).localeCompare(String(b), undefined, { numeric: true, sensitivity: 'base' });

  // ---------- Vehicles
  const VT = [['car', 'car', 'Car'], ['bike', 'motorcycle', 'Bike'], ['scooter', 'moped', 'Scooter'], ['other', 'car-profile', 'Other']];
  const vt = k => VT.find(t => t[0] === k) || VT[3];
  const vehCard = (v, adm) => `<article class="es-card"><span class="es-ic">${ic(vt(v.type)[1])}</span>
    <span class="col es-grow"><span class="es-plate">${esc(v.plate)}</span><span class="muted sm">${esc([vt(v.type)[2], v.make, v.color].filter(Boolean).join(' · '))}</span>${v.sticker ? `<span class="muted xs">Sticker ${esc(v.sticker)}</span>` : ''}${adm ? `<span class="sm"><b>Flat ${esc(v.flat)}</b>${v.owner_name ? ' · ' + esc(v.owner_name) : ''}</span>` : ''}</span>
    <span class="es-act">${E.vdel === v.id ? `<button type="button" class="btn btn-danger" data-act="evdel" data-id="${v.id}">Remove ${esc(v.plate)}?</button><button type="button" class="btn btn-secondary" data-act="evkeep">Keep</button>`
      : `<button type="button" class="btn btn-secondary" data-act="evask" data-id="${v.id}" aria-label="Remove ${esc(v.plate)}">${ic('trash')}Remove</button>`}</span></article>`;
  const drawVeh = () => {
    const l = $('#veh-list'); if (!l) return;
    const adm = isAdmin(), q = E.vq.trim().toLowerCase();
    const rows = adm && q ? E.veh.filter(v => [v.plate, v.flat, v.owner_name, v.make, v.color].some(x => String(x || '').toLowerCase().includes(q))) : E.veh;
    l.innerHTML = rows.map(v => vehCard(v, adm)).join('') || empty(adm && q ? 'No vehicle matches.' : 'No vehicles registered yet.');
    const c = $('#veh-count'); if (c) c.textContent = rows.length + (adm ? ' of ' + E.veh.length : '') + ' vehicle' + (rows.length === 1 ? '' : 's');
  };
  PAGES.vehicles = async () => {
    const adm = isAdmin();
    E.veh = await API.vehicles.list();
    const tiles = VT.map(([k, i, l]) => `<button type="button" class="type-tile ${E.vtype === k ? 'on' : ''}" data-act="evtype" data-t="${k}" aria-pressed="${E.vtype === k}">${ic(i)}<b>${l}</b></button>`).join('');
    page(`<div class="es">${head('Vehicles', adm ? 'Every registered vehicle in the society.' : 'Vehicles registered to Flat ' + S.me.flat + '.')}
      <div class="es-grid"><div class="col es-main">
        ${adm ? `<div class="field"><label class="sr" for="esvq">Search vehicles</label><input class="input" id="esvq" type="search" autocomplete="off" placeholder="Search by plate, flat or owner" value="${esc(E.vq)}"></div>` : ''}
        <span class="muted sm" id="veh-count" role="status"></span><div id="veh-list" class="es-list"></div></div>
        <form id="esveh" class="es-form col"><h3>Add a vehicle</h3>
          ${adm ? '<div class="field"><label for="evf">Flat</label><input class="input" id="evf" name="flat" required maxlength="20" placeholder="B-304"></div>' : ''}
          <div class="field"><label for="evp">Number plate</label><input class="input" id="evp" name="plate" required maxlength="20" autocomplete="off" autocapitalize="characters" placeholder="MH 12 AB 1234"></div>
          <div class="field"><label id="evtl">Type</label><div class="type-tiles es-tiles" role="group" aria-labelledby="evtl">${tiles}</div></div>
          <div class="two"><div class="field"><label for="evm">Make and model</label><input class="input" id="evm" name="make" maxlength="50"></div><div class="field"><label for="evc">Colour</label><input class="input" id="evc" name="color" maxlength="30"></div></div>
          <div class="field"><label for="evs">Parking sticker (optional)</label><input class="input" id="evs" name="sticker" maxlength="30"></div>
          <p class="err" id="eserr" role="alert"></p><div><button class="btn btn-primary">${ic('plus-circle')}Add vehicle</button></div></form></div></div>`);
    drawVeh();
  };
  ACT.evtype = el => { E.vtype = el.dataset.t; document.querySelectorAll('[data-act=evtype]').forEach(b => { b.classList.toggle('on', b === el); b.setAttribute('aria-pressed', String(b === el)); }); };
  ACT.evask = el => { E.vdel = Number(el.dataset.id); drawVeh(); };
  ACT.evkeep = () => { E.vdel = null; drawVeh(); };
  ACT.evdel = async el => {
    try { await API.vehicles.remove(el.dataset.id); E.vdel = null; E.veh = await API.vehicles.list(); drawVeh(); toast('Vehicle removed'); } catch (x) { E.vdel = null; drawVeh(); toast(x.message); }
  };

  // ---------- Parking
  const PK = { car: ['car', 'Car'], bike: ['motorcycle', 'Bike'], visitor: ['users', 'Visitor'] };
  const pkStat = (cls, icon, n, label) => `<div class="ds-stat es-stat ${cls}"><span class="ds-stat-i">${ic(icon)}</span><span class="ds-stat-n">${esc(n)}</span><span class="ds-stat-l">${esc(label)}</span></div>`;
  const pkStats = sm => `<div class="es-stats">${pkStat('s-white', 'garage', sm.total, 'Total slots')}${pkStat('s-dark', 'car', sm.assigned, 'Assigned')}${pkStat('s-tint', 'check-circle', sm.free, 'Free')}</div>`;
  const slotTile = (s, sel) => `<button type="button" class="pk-slot ${s.flat ? 'taken' : 'free'} ${sel ? 'sel' : ''}" data-act="pksel" data-id="${s.id}" aria-pressed="${sel}" aria-label="Slot ${esc(s.code)}, ${s.flat ? 'assigned to ' + esc(s.flat) : 'free'}">${ic((PK[s.kind] || PK.car)[0])}<b>${esc(s.code)}</b><span>${s.flat ? esc(s.flat) : 'Free'}</span></button>`;
  const levels = slots => { const m = new Map(); slots.forEach(s => { const k = s.level || 'No level'; if (!m.has(k)) m.set(k, []); m.get(k).push(s); }); return [...m.entries()].sort((a, b) => natural(a[0], b[0])).map(([k, v]) => [k, v.sort((a, b) => natural(a.code, b.code))]); };
  const flats = () => [...new Set(E.veh.map(v => v.flat).filter(Boolean))].sort(natural);
  const vehOptions = flat => { const f = String(flat || '').trim().toLowerCase(); const vs = f ? E.veh.filter(v => String(v.flat).toLowerCase() === f) : []; return '<option value="">No vehicle</option>' + vs.map(v => `<option value="${v.id}">${esc(v.plate)} · ${esc(vt(v.type)[2])}</option>`).join(''); };
  const panel = () => {
    const s = E.pk.slots.find(x => x.id === E.pksel);
    if (!s) return `<div class="es-form col"><h3>Manage a slot</h3><p class="muted" style="margin:0">Choose a slot in the grid to assign, free or delete it.</p></div>`;
    const top = `<div class="row" style="justify-content:space-between"><h3>Slot ${esc(s.code)}</h3><button type="button" class="link-btn" data-act="pkclose">Close</button></div><p class="muted sm" style="margin:0">${esc((PK[s.kind] || PK.car)[1])} · ${esc(s.level || 'No level')}</p>`;
    if (s.flat) return `<div class="es-form col">${top}<div class="es-assigned"><b>Flat ${esc(s.flat)}</b><span>${s.plate ? esc(s.plate) : 'No vehicle linked'}</span></div><div><button type="button" class="btn btn-secondary" data-act="pkfree" data-id="${s.id}">${ic('arrow-counter-clockwise')}Free this slot</button></div></div>`;
    return `<div class="es-form col">${top}<form id="espkassign" class="col" data-id="${s.id}"><div class="field"><label for="espkflat">Assign to flat</label><input class="input" id="espkflat" name="flat" required maxlength="20" list="espkflats" autocomplete="off" placeholder="B-304"><datalist id="espkflats">${flats().map(f => `<option value="${esc(f)}"></option>`).join('')}</datalist></div>
      <div class="field"><label for="espkveh">Vehicle</label><select class="input" id="espkveh" name="vehicle_id">${vehOptions('')}</select></div><div><button class="btn btn-primary">Assign slot</button></div></form>
      <div class="row">${E.pkdel === s.id ? `<button type="button" class="btn btn-danger" data-act="pkdelok" data-id="${s.id}">Delete ${esc(s.code)}?</button><button type="button" class="btn btn-secondary" data-act="pkdelkeep">Keep</button>` : `<button type="button" class="btn btn-secondary" data-act="pkdelask" data-id="${s.id}">${ic('trash')}Delete slot</button>`}</div></div>`;
  };
  const drawPk = () => {
    const g = $('#pk-grid'); if (!g || !E.pk) return;
    $('#pk-stats').innerHTML = pkStats(E.pk.summary);
    g.innerHTML = levels(E.pk.slots).map(([lv, ss]) => `<section class="pk-level"><h3>${esc(lv)} <span class="muted sm">${ss.filter(x => !x.flat).length} free of ${ss.length}</span></h3><div class="pk-slots">${ss.map(s => slotTile(s, s.id === E.pksel)).join('')}</div></section>`).join('') || empty('No slots yet. Add some with the form.');
    $('#pk-panel').innerHTML = panel();
  };
  const loadPk = async () => { E.pk = await API.parking.list(); if (!E.pk.slots.some(s => s.id === E.pksel)) E.pksel = null; };
  PAGES.parking = async () => {
    await loadPk();
    if (!isAdmin()) {
      const mine = E.pk.slots, sm = E.pk.summary;
      return page(`<div class="es">${head('Parking', 'Your parking for Flat ' + S.me.flat + ' and the building overview.')}
        <section class="ds-sec"><div class="ds-sec-h"><h2>Your slots</h2></div><div class="es-list">${mine.map(s => `<article class="es-card"><span class="es-ic dark">${ic((PK[s.kind] || PK.car)[0])}</span><span class="col es-grow"><span class="es-plate">${esc(s.code)}</span><span class="muted sm">${esc((PK[s.kind] || PK.car)[1])} · ${esc(s.level || 'No level')}</span>${s.plate ? `<span class="sm">Vehicle ${esc(s.plate)}</span>` : ''}</span></article>`).join('') || empty('No slot is assigned to your flat yet. Ask the committee.')}</div></section>
        <section class="ds-sec"><div class="ds-sec-h"><h2>Building summary</h2></div>${pkStats(sm)}</section></div>`);
    }
    E.veh = await API.vehicles.list().catch(() => []);
    page(`<div class="es">${head('Parking', 'Slots by level. Choose a slot to assign it to a flat and vehicle.')}<div id="pk-stats"></div>
      <div class="es-grid"><div class="col es-main" id="pk-grid"></div>
        <div class="col" style="gap:var(--space-4)"><div id="pk-panel"></div>
          <form id="espkadd" class="es-form col"><h3>Add slots</h3><div class="two"><div class="field"><label for="apx">Prefix</label><input class="input" id="apx" name="prefix" required maxlength="10" value="B1-"></div><div class="field"><label for="apl">Level</label><input class="input" id="apl" name="level" maxlength="30" placeholder="Basement 1"></div></div>
            <div class="three"><div class="field"><label for="apf">From</label><input class="input" id="apf" name="from" type="number" min="1" max="9999" value="1" required></div><div class="field"><label for="apc">How many</label><input class="input" id="apc" name="count" type="number" min="1" max="200" value="10" required></div>
            <div class="field"><label for="apk">Kind</label><select class="input" id="apk" name="kind">${Object.entries(PK).map(([k, v]) => `<option value="${k}">${v[1]}</option>`).join('')}</select></div></div>
            <p class="err" id="eserr" role="alert"></p><div><button class="btn btn-primary">${ic('plus-circle')}Create slots</button></div></form></div></div></div>`);
    drawPk();
  };
  const pkRun = fn => async el => { setErr(''); try { await fn(el); } catch (x) { setErr(x.message); toast(x.message); } };
  ACT.pksel = el => { E.pksel = Number(el.dataset.id); E.pkdel = null; drawPk(); const p = $('#espkflat'); if (p) p.focus(); };
  ACT.pkclose = () => { E.pksel = null; E.pkdel = null; drawPk(); };
  ACT.pkfree = pkRun(async el => { await API.parking.free(el.dataset.id); await loadPk(); drawPk(); toast('Slot freed'); });
  ACT.pkdelask = el => { E.pkdel = Number(el.dataset.id); drawPk(); };
  ACT.pkdelkeep = () => { E.pkdel = null; drawPk(); };
  ACT.pkdelok = pkRun(async el => { await API.parking.removeSlot(el.dataset.id); E.pkdel = null; E.pksel = null; await loadPk(); drawPk(); toast('Slot deleted'); });

  // ---------- Workers
  const ROLES = [['security', 'Security', 'shield-check'], ['housekeeping', 'Housekeeping', 'broom'], ['maintenance', 'Maintenance', 'wrench'], ['gardener', 'Gardener', 'tree'], ['other', 'Other', 'user-gear']];
  const roleOpts = cur => ROLES.map(([k, l]) => `<option value="${k}" ${k === cur ? 'selected' : ''}>${l}</option>`).join('');
  const workerRow = w => {
    if (E.wedit === w.id) return `<form class="es-card es-wedit" data-w="${w.id}"><div class="es-wgrid"><div class="field"><label for="wn${w.id}">Name</label><input class="input" id="wn${w.id}" name="name" required maxlength="100" value="${esc(w.name)}"></div>
      <div class="field"><label for="wr${w.id}">Role</label><select class="input" id="wr${w.id}" name="role">${roleOpts(w.role)}</select></div><div class="field"><label for="wp${w.id}">Phone</label><input class="input" id="wp${w.id}" name="phone" maxlength="20" inputmode="tel" value="${esc(w.phone || '')}"></div>
      <div class="field"><label for="ws${w.id}">Shift</label><input class="input" id="ws${w.id}" name="shift" maxlength="50" value="${esc(w.shift || '')}"></div></div>
      <div class="field"><label for="wo${w.id}">Notes</label><input class="input" id="wo${w.id}" name="notes" maxlength="300" value="${esc(w.notes || '')}"></div>
      <div class="row"><button class="btn btn-primary">Save</button><button type="button" class="btn btn-secondary" data-act="wcancel">Cancel</button></div></form>`;
    const on = w.status !== 'inactive';
    return `<article class="es-card ${on ? '' : 'off'}"><span class="avatar light">${esc(initials(w.name))}</span><span class="col es-grow"><span class="row" style="gap:8px"><b>${esc(w.name)}</b><span class="tag ${on ? 'tag-accent' : 'tag-neutral'}">${on ? 'Active' : 'Inactive'}</span></span>
      <span class="muted sm">${[w.shift, w.phone].filter(Boolean).map(esc).join(' · ') || 'No shift or phone'}</span>${w.notes ? `<span class="sm">${esc(w.notes)}</span>` : ''}</span>
      <span class="es-act">${E.wdel === w.id ? `<button type="button" class="btn btn-danger" data-act="wdelok" data-id="${w.id}">Remove ${esc(w.name)}?</button><button type="button" class="btn btn-secondary" data-act="wcancel">Keep</button>`
        : `<button type="button" class="btn btn-secondary" data-act="wedit" data-id="${w.id}" aria-label="Edit ${esc(w.name)}">${ic('pencil-simple')}Edit</button><button type="button" class="btn btn-secondary" data-act="wtoggle" data-id="${w.id}">${on ? 'Mark inactive' : 'Mark active'}</button><button type="button" class="btn btn-secondary" data-act="wask" data-id="${w.id}" aria-label="Remove ${esc(w.name)}">${ic('trash')}</button>`}</span></article>`;
  };
  const drawWork = () => {
    const l = $('#wk-list'); if (!l) return;
    const known = ROLES.map(r => r[0]);
    l.innerHTML = ROLES.map(([k, label, icon]) => { const ws = E.wk.filter(w => (known.includes(w.role) ? w.role : 'other') === k); if (!ws.length) return '';
      return `<section class="ds-sec"><div class="ds-sec-h"><h2>${ic(icon)} ${esc(label)} <span class="muted sm">${ws.length}</span></h2></div><div class="es-list">${ws.map(workerRow).join('')}</div></section>`; }).join('') || empty('No staff added yet.');
  };
  PAGES.workers = async () => {
    E.wk = await API.admin.workers(); E.wedit = E.wdel = null;
    page(`<div class="es">${head('Workers', 'Society staff: security, housekeeping, maintenance and gardeners.')}<div class="es-grid"><div class="col es-main" id="wk-list"></div>
      <form id="eswork" class="es-form col"><h3>Add a worker</h3><div class="field"><label for="awn">Name</label><input class="input" id="awn" name="name" required maxlength="100"></div>
        <div class="field"><label for="awr">Role</label><select class="input" id="awr" name="role">${roleOpts('security')}</select></div>
        <div class="two"><div class="field"><label for="awp">Phone</label><input class="input" id="awp" name="phone" maxlength="20" inputmode="tel"></div><div class="field"><label for="aws">Shift</label><input class="input" id="aws" name="shift" maxlength="50" placeholder="Day, 8am to 4pm"></div></div>
        <div class="field"><label for="awo">Notes</label><input class="input" id="awo" name="notes" maxlength="300"></div>
        <p class="err" id="eserr" role="alert"></p><div><button class="btn btn-primary">${ic('plus-circle')}Add worker</button></div></form></div></div>`);
    drawWork();
  };
  const wk = id => E.wk.find(w => w.id === Number(id));
  const wReload = async () => { E.wk = await API.admin.workers(); drawWork(); };
  ACT.wedit = el => { E.wedit = Number(el.dataset.id); E.wdel = null; drawWork(); };
  ACT.wask = el => { E.wdel = Number(el.dataset.id); E.wedit = null; drawWork(); };
  ACT.wcancel = () => { E.wedit = E.wdel = null; drawWork(); };
  ACT.wdelok = pkRun(async el => { await API.admin.removeWorker(el.dataset.id); E.wdel = null; await wReload(); toast('Worker removed'); });
  ACT.wtoggle = pkRun(async el => { const w = wk(el.dataset.id); if (!w) return; const status = w.status === 'inactive' ? 'active' : 'inactive';
    await API.admin.updateWorker(w.id, { name: w.name, role: w.role, phone: w.phone || '', shift: w.shift || '', notes: w.notes || '', status }); await wReload(); toast(status === 'active' ? 'Marked active' : 'Marked inactive'); });

  // ---------- Gate overview (committee)
  const ovStat = (cls, icon, n, label) => `<div class="ds-stat es-stat ${cls}"><span class="ds-stat-i">${ic(icon)}</span><span class="ds-stat-n">${esc(n)}</span><span class="ds-stat-l">${esc(label)}</span></div>`;
  const ovHtml = d => {
    const t = d.today || {}, hrs = new Array(24).fill(0);
    (d.by_hour || []).forEach(h => { const i = Number(h.hour); if (i >= 0 && i < 24) hrs[i] = Number(h.n) || 0; });
    const max = Math.max(1, ...hrs), total = hrs.reduce((x, y) => x + y, 0);
    const rows = (d.recent || []).map(x => `<tr><td>${esc(stamp(x.created_at))}</td><td>${esc(x.subject || '')}</td><td>${esc(x.flat || '')}</td><td><span class="gv-chip ${x.result === 'allowed' ? 'ok' : 'no'}">${ic(x.result === 'allowed' ? 'check-circle' : 'x-circle')}${x.result === 'allowed' ? 'Admitted' : 'Denied'}</span></td><td>${esc(x.reason || '')}</td><td>${esc(x.guard_name || '')}</td></tr>`).join('');
    return `<div class="es-stats five">${ovStat('s-dark', 'check-circle', t.allowed || 0, 'Admitted today')}${ovStat('s-white', 'x-circle', t.denied || 0, 'Denied today')}${ovStat('s-tint', 'users', t.visitors || 0, 'Visitors')}${ovStat('s-tint', 'house-line', t.residents || 0, 'Residents')}${ovStat('s-white', 'qr-code', d.active_passes || 0, 'Active passes')}</div>
      <section class="ds-sec"><div class="ds-sec-h"><h2>Scans by hour</h2><span class="muted sm">${total} today</span></div><div class="ds-chart"><div class="gv-bars" role="img" aria-label="Gate scans per hour today: ${hrs.join(', ')}">${hrs.map((n, i) => `<div class="gv-c"><span class="gv-n">${n || ''}</span><span class="gv-b ${n ? '' : 'z'}" style="height:${n ? Math.max(6, Math.round(n / max * 110)) : 3}px"></span><span class="gv-h">${i % 3 === 0 ? i : ''}</span></div>`).join('')}</div></div></section>
      <section class="ds-sec"><div class="ds-sec-h"><h2>Recent scans</h2><span class="muted sm" id="gvtime">Updated ${esc(new Date().toLocaleTimeString())}</span></div>
        <div class="table-wrap"><table class="table gate-table"><thead><tr><th>Time</th><th>Who</th><th>Flat</th><th>Result</th><th>Reason</th><th>Guard</th></tr></thead><tbody>${rows || '<tr><td colspan="6" class="muted">No scans yet.</td></tr>'}</tbody></table></div></section>`;
  };
  let ovTimer = null;
  const ovRefresh = async () => {
    const b = $('#gov-body'); if (!b) return;
    try { const d = await API.gate.overview(); const b2 = $('#gov-body'); if (b2) b2.innerHTML = ovHtml(d); } catch (x) { /* keep the last numbers; the next tick retries */ }
  };
  const gateScanner = PAGES.gate;
  PAGES.gate = async () => {
    if (!isAdmin()) return gateScanner();
    const d = await API.gate.overview();
    page(`<div class="es"><header class="es-h row" style="justify-content:space-between;align-items:flex-end"><div><h1>Gate</h1><p class="muted">Live view of today's entries. Guards scan at the gate.</p></div>
      <div class="row"><span>${HP.liveBadge()}</span><button type="button" class="btn btn-secondary" data-act="nav" data-page="gatelog">${ic('clock-counter-clockwise')}Full log</button><button type="button" class="btn btn-secondary" data-act="nav" data-page="guards">${ic('identification-card')}Guards</button></div></header>
      <div id="gov-body" class="col" style="gap:28px">${ovHtml(d)}</div></div>`);
    clearInterval(ovTimer);
    ovTimer = setInterval(() => { if (S.page !== 'gate' || !isAdmin() || !$('#gov-body')) { clearInterval(ovTimer); ovTimer = null; return; } ovRefresh(); }, 5000);
  };

  // ---------- forms and inputs
  document.addEventListener('input', e => {
    const t = e.target;
    if (t.id === 'esvq') { E.vq = t.value; drawVeh(); }
    else if (t.id === 'espkflat') { const s = $('#espkveh'); if (s) s.innerHTML = vehOptions(t.value); }
  });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!(/^es(veh|work|pkadd|pkassign)$/.test(f.id || '') || f.classList.contains('es-wedit'))) return;
    e.preventDefault(); e.stopPropagation(); setErr('');
    const d = Object.fromEntries(new FormData(f));
    try {
      if (f.id === 'esveh') {
        const body = { plate: d.plate.trim().toUpperCase(), type: E.vtype, make: (d.make || '').trim(), color: (d.color || '').trim(), sticker: (d.sticker || '').trim() };
        if (d.flat) body.flat = d.flat.trim();
        await API.vehicles.add(body); E.veh = await API.vehicles.list(); f.reset(); drawVeh(); toast('Vehicle added');
      } else if (f.id === 'espkadd') {
        await API.parking.addSlots({ prefix: d.prefix.trim(), from: Number(d.from), count: Number(d.count), kind: d.kind, level: (d.level || '').trim() }); await loadPk(); drawPk(); toast('Slots created');
      } else if (f.id === 'espkassign') {
        const body = { flat: d.flat.trim() }; if (d.vehicle_id) body.vehicle_id = Number(d.vehicle_id);
        await API.parking.assign(f.dataset.id, body); await loadPk(); drawPk(); toast('Slot assigned');
      } else if (f.id === 'eswork') {
        await API.admin.addWorker({ name: d.name.trim(), role: d.role, phone: (d.phone || '').trim(), shift: (d.shift || '').trim(), notes: (d.notes || '').trim(), status: 'active' }); f.reset(); await wReload(); toast('Worker added');
      } else {
        const w = wk(f.dataset.w);
        await API.admin.updateWorker(f.dataset.w, { name: d.name.trim(), role: d.role, phone: (d.phone || '').trim(), shift: (d.shift || '').trim(), notes: (d.notes || '').trim(), status: w ? w.status : 'active' }); E.wedit = null; await wReload(); toast('Worker saved');
      }
    } catch (x) { setErr(x.message); toast(x.message); }
  }, true);
})();
