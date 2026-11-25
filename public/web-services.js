// Resident services (docs/services-api.md): Tuck shop, Laundry, Parcels, Events. Loaded after web-modules.js;
// registers pages and delegated events on window.HPWeb. No inline handlers (CSP 'self').
(() => {
  const W = window.HPWeb; if (!W) return;
  const { esc, ic, toast, day, stamp, rupees, RAPI } = HP;
  const { S, PAGES, ACT, page, render, isAdmin } = W;
  const V = RAPI.svc;
  const $ = (s, r = document) => r.querySelector(s);
  const X = { cart: {}, wash: {}, err: '', itemEdit: null };
  const role = () => (S.me ? S.me.role : '');
  const isRes = () => role() === 'resident';
  const isShop = () => role() === 'shop', isLaundry = () => role() === 'laundry';
  const isDesk = () => ['admin', 'staff', 'guard'].includes(role());
  W.noRedraw = (prev => () => (prev && prev()) || (['shop', 'laundry'].includes(S.page) && (Object.keys(X.cart).length > 0 || Object.keys(X.wash).length > 0)) || X.itemEdit != null)(W.noRedraw);

  const head = (title, sub, right = '') => `<header class="rl-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div><div class="row rl-head-r">${HP.liveBadge()}${right}</div></header>`;
  const field = (id, label, input, hint) => `<div class="field"><label for="${id}">${esc(label)}</label>${input}${hint ? `<span class="muted sm">${esc(hint)}</span>` : ''}</div>`;
  const errLine = () => `<p class="err" id="sverr" role="alert">${esc(X.err)}</p>`;
  const setErr = m => { const e = $('#sverr'); if (e) e.textContent = m || ''; };
  const cap = s => String(s || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const tag = (s, map) => { const [cls, label] = map[s] || ['tag-neutral', cap(s)]; return `<span class="tag ${cls}">${esc(label)}</span>`; };
  const SHOP_TAG = { placed: ['tag-accent-2', 'Placed'], ready: ['tag-accent', 'Ready'], delivered: ['tag-outline', 'Delivered'], cancelled: ['tag-neutral', 'Cancelled'] };
  const LAUNDRY_STEPS = [['requested', 'Requested'], ['picked_up', 'Picked up'], ['washing', 'Washing'], ['ready', 'Ready'], ['delivered', 'Delivered']];
  const NEXT_LAUNDRY = { requested: 'picked_up', picked_up: 'washing', washing: 'ready', ready: 'delivered' };
  const CATS = ['groceries', 'dairy', 'snacks', 'household', 'personal care', 'other'];
  // Photo library for shop items (public/img/shop, credited in CREDITS.md there).
  const PHOTOS = ['milk', 'bread', 'eggs', 'rice', 'tea', 'biscuits', 'detergent', 'soap'];
  const photoSel = (id, cur) => `<select class="input" id="${id}" name="image"><option value="">No photo (icon)</option>${PHOTOS.map(p => `<option value="/img/shop/${p}.jpg" ${cur === `/img/shop/${p}.jpg` ? 'selected' : ''}>${esc(cap(p))}</option>`).join('')}</select>`;
  const CAT_IC = { groceries: 'basket', dairy: 'drop', snacks: 'cookie', household: 'broom', 'personal care': 'hand-soap', other: 'package' };
  const lines = o => (o.lines || []).map(l => `${l.qty} × ${esc(l.name || l.item)}`).join(', ');
  const steps = cur => { const n = LAUNDRY_STEPS.findIndex(s => s[0] === cur); return `<span class="sv-steps" aria-label="Stage: ${esc(cap(cur))}">${LAUNDRY_STEPS.map(([k, l], i) => `<span class="sv-step ${i <= n ? 'on' : ''}"><i></i>${esc(l)}</span>`).join('')}</span>`; };

  // =====================================================================
  // Tuck shop
  // =====================================================================
  PAGES.shop = async () => {
    const [items, orders] = await Promise.all([V.items(), V.orders()]);
    if (isRes()) {
      const cartLines = Object.entries(X.cart).map(([id, qty]) => ({ it: items.find(i => i.id === Number(id)), qty })).filter(x => x.it && x.qty > 0);
      const total = cartLines.reduce((t, x) => t + x.it.price * x.qty, 0);
      const card = i => { const q = X.cart[i.id] || 0; return `<article class="form-card sv-item ${q ? 'in' : ''}">${i.image ? `<img class="sv-photo" src="${esc(i.image)}" alt="${esc(i.name)}" loading="lazy">` : `<span class="tile lg">${ic(CAT_IC[i.category] || 'package')}</span>`}
        <span class="col" style="gap:2px;min-width:0;flex:1"><b>${esc(i.name)}</b><span class="muted sm">${esc(i.unit || cap(i.category))} · ${i.stock ? esc(i.stock) + ' left' : 'Sold out'}</span><span class="sv-price">${esc(rupees(i.price))}</span></span>
        <span class="sv-qty">${q ? `<button class="btn btn-secondary" data-act="svcart" data-id="${i.id}" data-d="-1" aria-label="One less ${esc(i.name)}">${ic('minus')}</button><b aria-live="polite">${q}</b>` : ''}<button class="btn btn-primary" data-act="svcart" data-id="${i.id}" data-d="1" ${q >= i.stock ? 'disabled' : ''} aria-label="Add ${esc(i.name)}">${ic('plus')}</button></span></article>`; };
      const mine = orders.slice(0, 8).map(o => `<div class="list-row sv-order"><span class="tile">${ic('shopping-bag')}</span><span class="col" style="gap:2px;flex:1;min-width:0"><span class="muted xs">#${o.id} · ${esc(stamp(o.created_at))}</span><span>${lines(o)}</span><b>${esc(rupees(o.total))}</b></span>
        <span class="sv-state">${tag(o.status, SHOP_TAG)}</span><span class="row-acts">${o.status === 'placed' ? `<button class="btn btn-secondary" data-act="svshopst" data-id="${o.id}" data-s="cancelled">Cancel</button>` : ''}</span></div>`).join('');
      return page(`<div class="rl">${head('Tuck shop', 'Everyday groceries from the society shop, delivered to your door. Pay cash or UPI on delivery.')}
        <div class="sv-shop"><div class="sv-grid">${items.map(card).join('') || '<p class="muted">The shop has no items yet.</p>'}</div>
        <aside class="form-card col sv-cart"><h3 style="margin:0">${ic('shopping-cart')} Your basket</h3>
          ${cartLines.length ? cartLines.map(x => `<div class="row" style="justify-content:space-between"><span>${x.qty} × ${esc(x.it.name)}</span><b>${esc(rupees(x.it.price * x.qty))}</b></div>`).join('') : '<p class="muted" style="margin:0">Tap + to add items.</p>'}
          <div class="row sv-total"><span>Total</span><b>${esc(rupees(total))}</b></div>
          <form id="svorder" class="col" style="gap:var(--space-2)">${field('svnote', 'Note (optional)', '<input class="input" id="svnote" name="note" maxlength="300" placeholder="e.g. Ring the bell twice">')}
          ${errLine()}<button class="btn btn-primary btn-lg" ${cartLines.length ? '' : 'disabled'}>${ic('paper-plane-tilt')}Place order</button></form></aside></div>
        <section class="col" style="gap:var(--space-2)"><h2>Your orders</h2>${mine || '<p class="muted">No orders yet.</p>'}</section></div>`);
    }
    const open = orders.filter(o => ['placed', 'ready'].includes(o.status)), recent = orders.filter(o => !['placed', 'ready'].includes(o.status)).slice(0, 10);
    const acts = o => !isShop() ? '' : `<span class="row-acts">${o.status === 'placed' ? `<button class="btn btn-primary" data-act="svshopst" data-id="${o.id}" data-s="ready">${ic('check')}Ready</button>` : `<button class="btn btn-primary" data-act="svshopst" data-id="${o.id}" data-s="delivered">${ic('truck')}Delivered</button>`}<button class="btn btn-secondary" data-act="svshopst" data-id="${o.id}" data-s="cancelled">Cancel</button></span>`;
    const queue = open.map(o => `<div class="list-row sv-order"><span class="tile">${ic('shopping-bag')}</span><span class="col" style="gap:2px;flex:1;min-width:0"><span class="muted xs">#${o.id} · Flat ${esc(o.flat)} · ${esc(o.resident || '')} · ${esc(stamp(o.created_at))}</span><span>${lines(o)}</span>${o.note ? `<span class="muted sm">${esc(o.note)}</span>` : ''}<b>${esc(rupees(o.total))}</b></span>
      <span class="sv-state">${tag(o.status, SHOP_TAG)}</span>${acts(o)}</div>`).join('');
    const stock = isShop() ? `<section class="col" style="gap:var(--space-2)"><h2>Items and stock</h2><div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Shown</th><th></th></tr></thead><tbody>
      ${items.map(i => X.itemEdit === i.id ? `<tr><td colspan="6"><form id="svitemedit" class="row" data-id="${i.id}" style="gap:8px;flex-wrap:wrap"><input class="input" name="price" type="number" min="1" step="0.5" value="${esc(i.price)}" style="width:110px" aria-label="Price"><input class="input" name="stock" type="number" min="0" step="1" value="${esc(i.stock)}" style="width:100px" aria-label="Stock">${photoSel('svie' + i.id, i.image)}<label class="row" style="gap:6px"><input type="checkbox" name="active" ${i.active ? 'checked' : ''}> Shown</label><button class="btn btn-primary">Save</button><button type="button" class="btn btn-secondary" data-act="svitemedit" data-id="">Cancel</button></form></td></tr>`
        : `<tr><td><span class="row" style="gap:10px;flex-wrap:nowrap">${i.image ? `<img class="sv-thumb" src="${esc(i.image)}" alt="">` : ''}<span><b>${esc(i.name)}</b> <span class="muted sm">${esc(i.unit || '')}</span></span></span></td><td>${esc(cap(i.category))}</td><td>${esc(rupees(i.price))}</td><td>${i.stock <= 3 ? `<span class="tag tag-accent-2">${esc(i.stock)}</span>` : esc(i.stock)}</td><td>${i.active ? 'Yes' : 'Hidden'}</td><td><button class="link-btn" data-act="svitemedit" data-id="${i.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No items yet.</td></tr>'}</tbody></table></div>
      <form id="svitem" class="form-card col"><h3 style="margin:0">Add an item</h3><div class="two">${field('svin', 'Name', '<input class="input" id="svin" name="name" required maxlength="80">')}${field('svic', 'Category', `<select class="input" id="svic" name="category">${CATS.map(c => `<option value="${c}">${esc(cap(c))}</option>`).join('')}</select>`)}</div>
        <div class="three">${field('svip', 'Price (₹)', '<input class="input" id="svip" name="price" type="number" min="1" step="0.5" required>')}${field('svis', 'Stock', '<input class="input" id="svis" name="stock" type="number" min="0" step="1" value="10" required>')}${field('sviu', 'Unit', '<input class="input" id="sviu" name="unit" maxlength="20" placeholder="1 kg, dozen">')}</div>
        ${field('svim', 'Photo', photoSel('svim', ''))}
        ${errLine()}<div class="row"><button class="btn btn-primary">${ic('plus')}Add item</button></div></form></section>` : '';
    const watch = isShop() ? '' : `<p class="callout" style="margin:0">${ic('eye')} The tuck shop owner prepares and delivers orders. You can follow their state here.</p>
      <section class="col" style="gap:var(--space-2)"><h2>Recently finished</h2>${recent.map(o => `<div class="list-row sv-order"><span class="tile">${ic('shopping-bag')}</span><span class="col" style="gap:2px;flex:1;min-width:0"><span class="muted xs">#${o.id} · Flat ${esc(o.flat)} · ${esc(stamp(o.updated_at || o.created_at))}</span><span>${lines(o)}</span></span><span class="sv-state">${tag(o.status, SHOP_TAG)}</span></div>`).join('') || '<p class="muted">Nothing finished yet.</p>'}</section>`;
    const shopHero = isShop() ? HP.hero({ theme: 'shop', name: S.me.name, kicker: `Tuck shop · ${HP.todayLabel()}`, line: open.length ? `<b>${open.length} order${open.length > 1 ? 's' : ''}</b> to prepare · ${items.filter(i => i.stock <= 3).length} item(s) low on stock` : 'No orders waiting. Stock looks after itself as residents order.', actions: [] }) : '';
    page(`<div class="rl">${shopHero}${head('Tuck shop', isShop() ? `${open.length} open order${open.length === 1 ? '' : 's'}. Prepare, then mark delivered.` : `${open.length} open order${open.length === 1 ? '' : 's'} at the tuck shop.`)}
      ${isShop() ? '' : watch.split('\n')[0]}<section class="col" style="gap:var(--space-2)"><h2>${isShop() ? 'Orders to handle' : 'Open orders'}</h2>${queue || '<p class="muted">No open orders.</p>'}</section>${stock}${isShop() ? '' : watch.split('\n').slice(1).join('')}</div>`);
  };
  ACT.svcart = el => { const id = el.dataset.id, d = Number(el.dataset.d); X.cart[id] = Math.max(0, (X.cart[id] || 0) + d); if (!X.cart[id]) delete X.cart[id]; render(); };
  ACT.svshopst = async el => { try { await V.orderStatus(el.dataset.id, el.dataset.s); toast(el.dataset.s === 'cancelled' ? 'Order cancelled' : 'Order ' + el.dataset.s); } catch (x) { toast(x.message, 'error'); } render(); };
  ACT.svitemedit = el => { X.itemEdit = el.dataset.id ? Number(el.dataset.id) : null; render(); };

  // =====================================================================
  // Laundry service
  // =====================================================================
  PAGES.laundry = async () => {
    const [rates, orders] = await Promise.all([V.rates(), V.laundry()]);
    if (isRes()) {
      const total = rates.reduce((t, r) => t + r.price * (X.wash[r.id] || 0), 0);
      const today = istToday();
      const mine = orders.slice(0, 8).map(o => `<article class="form-card col sv-wash"><div class="row" style="justify-content:space-between"><span class="muted sm">#${o.id} · pickup ${esc(day(o.pickup_date))}, ${esc(o.pickup_slot)}</span><b>${esc(rupees(o.total))}</b></div>
        <span>${lines(o)}</span>${o.status === 'cancelled' ? '<span class="tag tag-neutral">Cancelled</span>' : steps(o.status)}${o.status === 'requested' ? `<button class="link-btn" data-act="svwashst" data-id="${o.id}" data-s="cancelled" style="align-self:flex-start">Cancel pickup</button>` : ''}</article>`).join('');
      return page(`<div class="rl">${head('Laundry', 'Book a pickup. Clothes come back washed and ironed; pay on delivery.')}
        <div class="split-eq" style="align-items:start"><form id="svwash" class="form-card col"><h3 style="margin:0">${ic('t-shirt')} Book a pickup</h3>
          <div class="col sv-rates">${rates.map(r => `<div class="row sv-rate"><span style="flex:1">${esc(r.item)} <span class="muted sm">${esc(rupees(r.price))}</span></span><span class="sv-qty">${X.wash[r.id] ? `<button type="button" class="btn btn-secondary" data-act="svwash" data-id="${r.id}" data-d="-1" aria-label="One less">${ic('minus')}</button><b>${X.wash[r.id]}</b>` : ''}<button type="button" class="btn btn-primary" data-act="svwash" data-id="${r.id}" data-d="1" aria-label="Add ${esc(r.item)}">${ic('plus')}</button></span></div>`).join('') || '<p class="muted">No laundry prices yet.</p>'}</div>
          <div class="two">${field('svwd', 'Pickup date', `<input class="input" id="svwd" name="pickup_date" type="date" min="${today}" value="${today}" required>`)}${field('svws', 'Time', `<select class="input" id="svws" name="pickup_slot"><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select>`)}</div>
          ${field('svwn', 'Note (optional)', '<input class="input" id="svwn" name="note" maxlength="300" placeholder="e.g. Starch the shirts">')}
          <div class="row sv-total"><span>Total</span><b>${esc(rupees(total))}</b></div>${errLine()}<button class="btn btn-primary btn-lg" ${total ? '' : 'disabled'}>${ic('calendar-check')}Book pickup</button></form>
          <section class="col" style="gap:var(--space-3)"><h2>Your laundry</h2>${mine || '<p class="muted">No laundry booked yet.</p>'}</section></div></div>`);
    }
    const open = orders.filter(o => !['delivered', 'cancelled'].includes(o.status));
    const rows = open.map(o => `<article class="form-card col sv-wash"><div class="row" style="justify-content:space-between;flex-wrap:wrap"><span class="muted sm">#${o.id} · Flat ${esc(o.flat)} · ${esc(o.resident || '')} · pickup ${esc(day(o.pickup_date))}, ${esc(o.pickup_slot)}</span><b>${esc(rupees(o.total))}</b></div>
      <span>${lines(o)}</span>${o.note ? `<span class="muted sm">${esc(o.note)}</span>` : ''}${steps(o.status)}
      ${isLaundry() ? `<div class="row-acts start"><button class="btn btn-primary" data-act="svwashst" data-id="${o.id}" data-s="${NEXT_LAUNDRY[o.status]}">${ic('arrow-right')}Mark ${esc(cap(NEXT_LAUNDRY[o.status]))}</button></div>` : ''}</article>`).join('');
    const ratesAdmin = isLaundry() ? `<section class="col" style="gap:var(--space-2)"><h2>Price list</h2><div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>Price</th><th>Shown</th><th></th></tr></thead><tbody>
      ${rates.map(r => `<tr><td>${esc(r.item)}</td><td>${esc(rupees(r.price))}</td><td>${r.active ? 'Yes' : 'Hidden'}</td><td><button class="link-btn" data-act="svratetoggle" data-id="${r.id}" data-on="${r.active ? 0 : 1}">${r.active ? 'Hide' : 'Show'}</button></td></tr>`).join('') || '<tr><td colspan="4" class="muted">No prices yet.</td></tr>'}</tbody></table></div>
      <form id="svrate" class="form-card row" style="gap:10px;flex-wrap:wrap;align-items:flex-end">${field('svri', 'Item', '<input class="input" id="svri" name="item" required maxlength="60" placeholder="Shirt (wash and iron)">')}${field('svrp', 'Price (₹)', '<input class="input" id="svrp" name="price" type="number" min="1" step="0.5" required style="width:120px">')}<button class="btn btn-primary">${ic('plus')}Add price</button>${errLine()}</form></section>` : '';
    const washHero = isLaundry() ? HP.hero({ theme: 'wash', name: S.me.name, kicker: `Laundry service · ${HP.todayLabel()}`, line: `<b>${open.filter(o => o.status === 'requested').length}</b> pickups to collect · ${open.filter(o => o.status === 'ready').length} ready to deliver`, actions: [] }) : '';
    page(`<div class="rl">${washHero}${head('Laundry', isLaundry() ? `${open.length} pickup${open.length === 1 ? '' : 's'} in progress. Move each one forward as it happens.` : `${open.length} pickup${open.length === 1 ? '' : 's'} in progress with the laundry service.`)}
      ${isLaundry() ? '' : `<p class="callout" style="margin:0">${ic('eye')} The laundry service collects, washes and delivers. You can follow each pickup here.</p>`}
      <section class="col" style="gap:var(--space-3)"><h2>Pickups and deliveries</h2>${rows || '<p class="muted">No laundry in progress.</p>'}</section>${ratesAdmin}</div>`);
  };
  ACT.svwash = el => { const id = el.dataset.id; X.wash[id] = Math.max(0, (X.wash[id] || 0) + Number(el.dataset.d)); if (!X.wash[id]) delete X.wash[id]; render(); };
  ACT.svwashst = async el => { try { await V.laundryStatus(el.dataset.id, el.dataset.s); toast('Laundry ' + cap(el.dataset.s).toLowerCase()); } catch (x) { toast(x.message, 'error'); } render(); };
  ACT.svratetoggle = async el => { try { await V.updateRate(el.dataset.id, { active: el.dataset.on === '1' }); } catch (x) { toast(x.message, 'error'); } render(); };

  // =====================================================================
  // Parcel desk
  // =====================================================================
  PAGES.parcels = async () => {
    const ps = await V.parcels();
    const waiting = ps.filter(p => p.status === 'waiting'), done = ps.filter(p => p.status !== 'waiting').slice(0, 15);
    const row = p => `<div class="list-row"><span class="tile">${ic(p.status === 'waiting' ? 'package' : 'check-circle')}</span><span class="col" style="gap:2px;flex:1;min-width:0"><span class="muted xs">#${p.id} · ${esc(stamp(p.created_at))}${isRes() ? '' : ' · Flat ' + esc(p.flat)}</span><b>${esc(p.carrier)}</b>${p.note ? `<span class="muted sm">${esc(p.note)}</span>` : ''}${p.collected_at ? `<span class="muted sm">Collected ${esc(stamp(p.collected_at))}${p.collected_by ? ' by ' + esc(p.collected_by) : ''}</span>` : ''}</span>
      <span class="row-acts">${p.status === 'waiting' ? (isDesk() ? `<button class="btn btn-primary" data-act="svcollect" data-id="${p.id}">${ic('hand-arrow-down')}Collected</button>` : '<span class="tag tag-accent-2">At the gate</span>') : '<span class="tag tag-outline">Collected</span>'}</span></div>`;
    const form = isDesk() ? `<form id="svparcel" class="form-card col"><h3 style="margin:0">${ic('package')} Log a delivery</h3><div class="three">${field('svpf', 'Flat', '<input class="input" id="svpf" name="flat" required maxlength="20" placeholder="B-101">')}${field('svpc', 'From', '<input class="input" id="svpc" name="carrier" required maxlength="60" placeholder="Amazon, Swiggy, Blue Dart">')}${field('svpn', 'Note', '<input class="input" id="svpn" name="note" maxlength="200" placeholder="Big box, fragile">')}</div>${errLine()}<div class="row"><button class="btn btn-primary">${ic('bell-ringing')}Log and tell the flat</button></div></form>` : '';
    page(`<div class="rl">${head('Parcels', isRes() ? 'Deliveries for your flat held at the gate.' : `${waiting.length} parcel${waiting.length === 1 ? '' : 's'} waiting to be collected.`)}${form}
      <section class="col" style="gap:var(--space-2)"><h2>Waiting at the gate</h2>${waiting.map(row).join('') || '<p class="muted">No parcels waiting.</p>'}</section>
      <section class="col" style="gap:var(--space-2)"><h2>Collected</h2>${done.map(row).join('') || '<p class="muted">Nothing collected yet.</p>'}</section></div>`);
  };
  ACT.svcollect = async el => { try { await V.collect(el.dataset.id, ''); toast('Marked collected'); } catch (x) { toast(x.message, 'error'); } render(); };

  // =====================================================================
  // Community events
  // =====================================================================
  PAGES.events = async () => {
    const es = await V.events();
    const card = e => { const [d, t] = e.starts_at.split('T'); return `<article class="form-card sv-event ${e.cancelled ? 'off' : ''}"><span class="sv-date"><b>${esc(new Date(d + 'T00:00:00Z').getUTCDate())}</b><span>${esc(new Date(d + 'T00:00:00Z').toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }))}</span></span>
      <span class="col" style="gap:4px;flex:1;min-width:0"><b class="sv-ev-t">${esc(e.title)}</b><span class="muted sm">${esc(day(d))} at ${esc(t)}${e.location ? ' · ' + esc(e.location) : ''}</span>${e.description ? `<span>${esc(e.description)}</span>` : ''}
      <span class="muted sm">${ic('users-three')} ${esc(e.going)} going${e.cancelled ? ' · <b>Cancelled</b>' : ''}</span></span>
      <span class="row-acts">${!e.cancelled && isRes() ? `<button class="btn ${e.me_going ? 'btn-secondary' : 'btn-primary'}" data-act="svrsvp" data-id="${e.id}" data-g="${e.me_going ? 0 : 1}">${ic(e.me_going ? 'x' : 'check')}${e.me_going ? 'Not going' : "I'm going"}</button>` : ''}${!e.cancelled && isAdmin() ? `<button class="btn btn-secondary" data-act="svevcancel" data-id="${e.id}">Cancel event</button>` : ''}</span></article>`; };
    const form = isAdmin() ? `<form id="svevent" class="form-card col"><h3 style="margin:0">${ic('calendar-plus')} Post an event</h3><div class="two">${field('svet', 'Title', '<input class="input" id="svet" name="title" required maxlength="120" placeholder="Diwali get-together">')}${field('svew', 'When', '<input class="input" id="svew" name="starts_at" type="datetime-local" required>')}</div>
      <div class="two">${field('svel', 'Where', '<input class="input" id="svel" name="location" maxlength="120" placeholder="Clubhouse">')}${field('sved', 'Details', '<input class="input" id="sved" name="description" maxlength="1000">')}</div>${errLine()}<div class="row"><button class="btn btn-primary">${ic('megaphone')}Post and tell residents</button></div></form>` : '';
    page(`<div class="rl">${head('Events', 'What is happening in the society.')}${form}<section class="col" style="gap:var(--space-3)">${es.map(card).join('') || '<p class="muted">No upcoming events.</p>'}</section></div>`);
  };
  ACT.svrsvp = async el => { try { await V.rsvp(el.dataset.id, el.dataset.g === '1'); toast(el.dataset.g === '1' ? 'See you there' : 'Removed'); } catch (x) { toast(x.message, 'error'); } render(); };
  ACT.svevcancel = async el => { try { await V.cancelEvent(el.dataset.id); toast('Event cancelled; guests told'); } catch (x) { toast(x.message, 'error'); } render(); };

  // =====================================================================
  // Form submits
  // =====================================================================
  const forms = {
    svorder: async f => { const items = Object.entries(X.cart).map(([id, qty]) => ({ id: Number(id), qty })); const r = await V.order({ items, note: f.note.value }); X.cart = {}; toast(`Order #${r.id} placed: ${rupees(r.total)}`); },
    svitem: async f => { await V.addItem({ name: f.name.value, category: f.category.value, price: Number(f.price.value), stock: Number(f.stock.value), unit: f.unit.value, image: f.image.value || null }); toast('Item added'); },
    svitemedit: async f => { await V.updateItem(f.dataset.id, { price: Number(f.price.value), stock: Number(f.stock.value), active: f.active.checked, image: f.image.value || null }); X.itemEdit = null; toast('Saved'); },
    svwash: async f => { const items = Object.entries(X.wash).map(([id, qty]) => ({ id: Number(id), qty })); const r = await V.bookLaundry({ pickup_date: f.pickup_date.value, pickup_slot: f.pickup_slot.value, note: f.note.value, items }); X.wash = {}; toast(`Pickup #${r.id} booked: ${rupees(r.total)}`); },
    svrate: async f => { await V.addRate({ item: f.item.value, price: Number(f.price.value) }); toast('Price added'); },
    svparcel: async f => { await V.logParcel({ flat: f.flat.value, carrier: f.carrier.value, note: f.note.value }); toast('Logged. The flat has been told.'); },
    svevent: async f => { await V.addEvent({ title: f.title.value, starts_at: f.starts_at.value, location: f.location.value, description: f.description.value }); toast('Event posted'); },
  };
  document.addEventListener('submit', async e => {
    const fn = forms[e.target.id]; if (!fn) return;
    e.preventDefault(); X.err = ''; setErr('');
    try { await fn(e.target); render(); } catch (x) { X.err = x.message; setErr(x.message); }
  });
})();
