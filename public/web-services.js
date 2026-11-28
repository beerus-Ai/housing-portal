// Resident services (docs/services-api.md): Tuck shop, Laundry, Parcels, Events. Loaded after web-modules.js;
// registers pages and delegated events on window.HPWeb. No inline handlers (CSP 'self').
(() => {
  const W = window.HPWeb; if (!W) return;
  const { esc, ic, toast, day, stamp, rupees, RAPI } = HP;
  const { S, PAGES, ACT, page, render, isAdmin } = W;
  const V = RAPI.svc;
  const $ = (s, r = document) => r.querySelector(s);
  // counter/who/cpay/cerr: shop counter. lc/lw/lpay/lerr: laundry counter. wflat/wtap/wsel: committee Wallets.
  // pc: parcel collect by card. evOpen/evRes/evFocus: event check-in by card (docs/card-wallet-api.md).
  const X = { cart: {}, wash: {}, err: '', itemEdit: null, ful: 'delivery', pay: 'cash', counter: {}, who: null, cpay: 'cash', cerr: null,
    lc: {}, lw: null, lpay: 'cash', lerr: null, wflat: '', wtap: null, wsel: null, pc: null, evOpen: null, evRes: null, evFocus: false };
  const role = () => (S.me ? S.me.role : '');
  const isRes = () => role() === 'resident';
  const isShop = () => role() === 'shop', isLaundry = () => role() === 'laundry';
  const isDesk = () => ['admin', 'staff', 'guard'].includes(role());
  W.noRedraw = (prev => () => (prev && prev()) || (['shop', 'laundry'].includes(S.page) && (Object.keys(X.cart).length > 0 || Object.keys(X.wash).length > 0 || X.who != null)) || X.itemEdit != null)(W.noRedraw);
  // Card boxes (data-cardbox) take the Windows card reader's typing: never redraw under them. Same for a counter
  // sale in progress and a half-filled top-up.
  const inCardBox = () => { const a = document.activeElement; return !!(a && a.matches && a.matches('[data-cardbox]')); };
  const topupBusy = () => { const a = document.activeElement, amt = $('#svta'); return !!X.wflat || !!(amt && amt.value) || !!(a && a.closest && a.closest('.wl-topup')); };
  W.noRedraw = (prev => () => (prev && prev()) || inCardBox() || (S.page === 'lcounter' && (X.lw != null || Object.keys(X.lc).length > 0)) || (S.page === 'wallets' && topupBusy()))(W.noRedraw);
  const focusBox = sel => { const b = $(sel); if (b) b.focus({ preventScroll: true }); };
  // A card box: a form with one input, submitted with Enter (a USB reader or the Windows card reader types the number + Enter).
  const cardBox = (id, inputId, ph, extra = '') => `<form id="${id}" class="row nfc-type"><label class="sr" for="${inputId}">Card number</label><input class="input" id="${inputId}" name="serial" autocomplete="off" data-cardbox placeholder="${esc(ph)}" ${extra}>${'NDEFReader' in window ? `<button type="button" class="btn btn-secondary" data-act="svnfc" data-f="${id}">${ic('contactless-payment')}NFC</button>` : ''}<button class="btn btn-secondary">${ic('arrow-right')}Find</button></form>`;
  // A refused card (unknown, frozen, not approved) shown in place, not only as a toast.
  const cardErr = e => !e ? '' : `<div class="nfc-res bad wl-cerr" role="alert">${ic(/frozen/i.test(e.msg) ? 'snowflake' : 'x-circle')}<b>${esc(e.msg)}</b>${e.serial ? `<span class="muted">Card ${esc(e.serial)}</span>` : ''}</div>`;
  const cardFail = (x, serial) => ({ msg: x.message, serial, status: x.status });
  // Payment choice at a counter. Wallet is off (with the reason) when the balance does not cover the total.
  const PAY_BTNS = [['cash', 'Cash', 'money'], ['upi', 'UPI', 'qr-code'], ['wallet', 'Wallet', 'wallet'], ['account', 'Maintenance account', 'receipt']];
  const PAY_WORD = { cash: 'in cash', upi: 'by UPI', wallet: 'from the wallet', account: 'to the account' };
  const walletShort = (bal, total) => bal == null || Number(bal) < total;
  const payBtns = (k, cur, bal, total) => `<div class="row" style="gap:8px;flex-wrap:wrap" role="group" aria-label="Payment">${PAY_BTNS.map(([v, l, icn]) => { const off = v === 'wallet' && walletShort(bal, total), on = cur === v && !off; return `<button type="button" class="btn ${on ? 'btn-primary' : 'btn-secondary'}" data-act="svcpay" data-k="${k}" data-v="${v}" aria-pressed="${on}" ${off ? 'disabled' : ''}>${ic(icn)}${l}${v === 'wallet' && bal != null ? ` · ${esc(rupees(bal))}` : ''}</button>`; }).join('')}</div>
    ${walletShort(bal, total) ? `<p class="muted sm wl-hint">${ic('wallet')} ${bal == null ? 'No wallet for this card.' : `Wallet balance ${esc(rupees(bal))} is less than the total. Top up with the committee or pay another way.`}</p>` : ''}`;
  const payOf = (cur, bal, total) => (cur === 'wallet' && walletShort(bal, total) ? null : cur);
  const chargeLabel = (pay, total) => pay ? `Charge ${rupees(total)} ${PAY_WORD[pay]}` : 'Choose how they pay';
  const whoRow = (name, sub, bal) => `<div class="row sv-who"><span class="avatar">${esc(String(name || '?').split(' ').map(w => w[0]).join('').slice(0, 2))}</span><span class="col" style="gap:0;flex:1;min-width:0"><b>${esc(name)}</b><span class="muted sm">${sub}</span></span>${bal != null ? `<span class="wl-chip" title="Wallet balance">${ic('wallet')}${esc(rupees(bal))}</span>` : ''}<button type="button" class="btn btn-ghost" data-act="svwhoclear">Clear</button></div>`;

  const head = (title, sub, right = '') => `<header class="rl-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div><div class="row rl-head-r">${HP.liveBadge()}${right}</div></header>`;
  const field = (id, label, input, hint) => `<div class="field"><label for="${id}">${esc(label)}</label>${input}${hint ? `<span class="muted sm">${esc(hint)}</span>` : ''}</div>`;
  const errLine = () => `<p class="err" id="sverr" role="alert">${esc(X.err)}</p>`;
  const setErr = m => { const e = $('#sverr'); if (e) e.textContent = m || ''; };
  const cap = s => String(s || '').replace(/_/g, ' ').replace(/^./, c => c.toUpperCase());
  const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const tag = (s, map) => { const [cls, label] = map[s] || ['tag-neutral', cap(s)]; return `<span class="tag ${cls}">${esc(label)}</span>`; };
  const SHOP_TAG = { placed: ['tag-accent-2', 'Placed'], ready: ['tag-accent', 'Ready'], delivered: ['tag-outline', 'Delivered'], collected: ['tag-outline', 'Collected'], cancelled: ['tag-neutral', 'Cancelled'] };
  const LAUNDRY_STEPS = [['requested', 'Requested'], ['picked_up', 'Picked up'], ['washing', 'Washing'], ['ready', 'Ready'], ['delivered', 'Delivered']];
  const NEXT_LAUNDRY = { requested: 'picked_up', picked_up: 'washing', washing: 'ready', ready: 'delivered' };
  const CATS = ['groceries', 'dairy', 'snacks', 'household', 'personal care', 'other'];
  // Photo library for shop items (public/img/shop, credited in CREDITS.md there).
  const PHOTOS = ['milk', 'bread', 'eggs', 'rice', 'tea', 'biscuits', 'detergent', 'soap', 'paneer', 'curd', 'butter', 'atta', 'sugar', 'chips', 'bananas', 'toothpaste', 'shampoo'];
  const photoSel = (id, cur) => `<select class="input" id="${id}" name="image"><option value="">No photo (icon)</option>${PHOTOS.map(p => `<option value="/img/shop/${p}.jpg" ${cur === `/img/shop/${p}.jpg` ? 'selected' : ''}>${esc(cap(p))}</option>`).join('')}</select>`;
  const CAT_IC = { groceries: 'basket', dairy: 'drop', snacks: 'cookie', household: 'broom', 'personal care': 'hand-soap', other: 'package' };
  // How the order is received and paid (purchases are linked to the flat's finances).
  const PAY_LABEL = { cash: 'Cash', upi: 'UPI', wallet: 'Wallet', account: 'On account' };
  const payTag = o => { const st = o.payment_status; const [cls, t] = st === 'paid' ? ['tag-outline', `${PAY_LABEL[o.payment]} · paid`] : st === 'on_account' ? ['tag-accent-2', 'On account · in dues'] : ['tag-neutral', `${PAY_LABEL[o.payment] || 'Cash'} on ${o.fulfilment === 'pickup' ? 'pick-up' : 'delivery'}`]; return `<span class="tag ${cls}">${esc(t)}</span>`; };
  const fulTag = o => o.fulfilment ? `<span class="tag tag-outline">${ic(o.fulfilment === 'pickup' ? 'storefront' : o.fulfilment === 'counter' ? 'identification-card' : 'house')} ${o.fulfilment === 'pickup' ? 'Pick-up' : o.fulfilment === 'counter' ? 'At the counter (card)' : 'To the door'}</span>` : '';
  // Delivery or pick-up and the payment method, with the credit left on the maintenance account.
  const checkout = (credit, kind) => `<fieldset class="sv-choice"><legend>${kind === 'shop' ? 'How do you want it?' : 'Pickup and return'}</legend>${kind === 'shop' ? ['delivery', 'pickup'].map(v => `<label class="sv-opt ${X.ful === v ? 'on' : ''}"><input type="radio" name="fulfilment" value="${v}" ${X.ful === v ? 'checked' : ''} data-svful>${ic(v === 'pickup' ? 'storefront' : 'house')}<span><b>${v === 'pickup' ? 'Pick up at the shop' : 'Deliver to my door'}</b><span class="muted sm">${v === 'pickup' ? 'Collect it when it is ready' : 'Flat ' + esc(S.me.flat || '')}</span></span></label>`).join('') : '<p class="muted sm" style="margin:0">Collected from and returned to your door.</p>'}</fieldset>
    <fieldset class="sv-choice"><legend>How will you pay?</legend>${['cash', 'upi', 'account'].map(v => { const off = v === 'account' && credit && credit.limit <= 0; return `<label class="sv-opt ${X.pay === v ? 'on' : ''} ${off ? 'off' : ''}"><input type="radio" name="payment" value="${v}" ${X.pay === v ? 'checked' : ''} ${off ? 'disabled' : ''} data-svpay>${ic(v === 'cash' ? 'money' : v === 'upi' ? 'qr-code' : 'receipt')}<span><b>${v === 'cash' ? 'Cash' : v === 'upi' ? 'UPI' : 'Add to my maintenance account'}</b><span class="muted sm">${v === 'account' ? (credit ? (credit.limit > 0 ? `Pay later with your dues · ${rupees(Math.max(0, credit.limit - credit.used))} of ${rupees(credit.limit)} credit left` : 'Credit is switched off') : 'Pay later with your dues') : `Pay when you ${kind === 'shop' && X.ful === 'pickup' ? 'collect' : 'receive'} it`}</span></span></label>`; }).join('')}</fieldset>`;
  const lines = o => (o.lines || []).map(l => `${l.qty} × ${esc(l.name || l.item)}`).join(', ');
  const steps = cur => { const n = LAUNDRY_STEPS.findIndex(s => s[0] === cur); return `<span class="sv-steps" aria-label="Stage: ${esc(cap(cur))}">${LAUNDRY_STEPS.map(([k, l], i) => `<span class="sv-step ${i <= n ? 'on' : ''}"><i></i>${esc(l)}</span>`).join('')}</span>`; };

  // =====================================================================
  // Tuck shop
  // =====================================================================
  PAGES.shop = async () => {
    const [items, orders, credit] = await Promise.all([V.items(), V.orders(), isRes() ? HP.api('GET', '/api/credit').catch(() => null) : null]);
    if (isRes()) {
      const cartLines = Object.entries(X.cart).map(([id, qty]) => ({ it: items.find(i => i.id === Number(id)), qty })).filter(x => x.it && x.qty > 0);
      const total = cartLines.reduce((t, x) => t + x.it.price * x.qty, 0);
      const card = i => { const q = X.cart[i.id] || 0; return `<article class="form-card sv-item ${q ? 'in' : ''}">${i.image ? `<img class="sv-photo" src="${esc(i.image)}" alt="${esc(i.name)}" loading="lazy">` : `<span class="tile lg">${ic(CAT_IC[i.category] || 'package')}</span>`}
        <span class="col" style="gap:2px;min-width:0;flex:1"><b>${esc(i.name)}</b><span class="muted sm">${esc(i.unit || cap(i.category))} · ${i.stock ? esc(i.stock) + ' left' : 'Sold out'}</span>${i.description ? `<span class="sv-desc sm">${esc(i.description)}</span>` : ''}<span class="sv-price">${esc(rupees(i.price))}</span></span>
        <span class="sv-qty">${q ? `<button class="btn btn-secondary" data-act="svcart" data-id="${i.id}" data-d="-1" aria-label="One less ${esc(i.name)}">${ic('minus')}</button><b aria-live="polite">${q}</b>` : ''}<button class="btn btn-primary" data-act="svcart" data-id="${i.id}" data-d="1" ${q >= i.stock ? 'disabled' : ''} aria-label="Add ${esc(i.name)}">${ic('plus')}</button></span></article>`; };
      const mine = orders.slice(0, 8).map(o => `<div class="list-row sv-order"><span class="tile">${ic('shopping-bag')}</span><span class="col" style="gap:2px;flex:1;min-width:0"><span class="muted xs">#${o.id} · ${esc(stamp(o.created_at))}</span><span>${lines(o)}</span><span class="row" style="gap:6px"><b>${esc(rupees(o.total))}</b>${fulTag(o)}${payTag(o)}</span></span>
        <span class="sv-state">${tag(o.status, SHOP_TAG)}</span><span class="row-acts">${o.status === 'placed' ? `<button class="btn btn-secondary" data-act="svshopst" data-id="${o.id}" data-s="cancelled">Cancel</button>` : ''}</span></div>`).join('');
      return page(`<div class="rl">${head('Tuck shop', 'Everyday groceries from the society shop. Delivered to your door or ready to pick up; pay cash, UPI or on your maintenance account.')}
        <div class="sv-shop"><div class="sv-grid">${items.map(card).join('') || '<p class="muted">The shop has no items yet.</p>'}</div>
        <aside class="form-card col sv-cart"><h3 style="margin:0">${ic('shopping-cart')} Your basket</h3>
          ${cartLines.length ? cartLines.map(x => `<div class="row" style="justify-content:space-between"><span>${x.qty} × ${esc(x.it.name)}</span><b>${esc(rupees(x.it.price * x.qty))}</b></div>`).join('') : '<p class="muted" style="margin:0">Tap + to add items.</p>'}
          <div class="row sv-total"><span>Total</span><b>${esc(rupees(total))}</b></div>
          <form id="svorder" class="col" style="gap:var(--space-2)">${checkout(credit, 'shop')}${field('svnote', 'Note (optional)', '<input class="input" id="svnote" name="note" maxlength="300" placeholder="e.g. Ring the bell twice">')}
          ${errLine()}<button class="btn btn-primary btn-lg" ${cartLines.length ? '' : 'disabled'}>${ic('paper-plane-tilt')}Place order</button></form></aside></div>
        <section class="col" style="gap:var(--space-2)"><h2>Your orders</h2>${mine || '<p class="muted">No orders yet.</p>'}</section></div>`);
    }
    const open = orders.filter(o => ['placed', 'ready'].includes(o.status)), recent = orders.filter(o => !['placed', 'ready'].includes(o.status)).slice(0, 10);
    const acts = o => !isShop() ? '' : `<span class="row-acts">${o.status === 'placed' ? `<button class="btn btn-primary" data-act="svshopst" data-id="${o.id}" data-s="ready">${ic('check')}Ready</button>` : (o.fulfilment === 'pickup' ? `<button class="btn btn-primary" data-act="svshopst" data-id="${o.id}" data-s="collected">${ic('hand-arrow-down')}Collected${o.payment !== 'account' ? ' · paid' : ''}</button>` : `<button class="btn btn-primary" data-act="svshopst" data-id="${o.id}" data-s="delivered">${ic('truck')}Delivered${o.payment !== 'account' ? ' · paid' : ''}</button>`)}<button class="btn btn-secondary" data-act="svshopst" data-id="${o.id}" data-s="cancelled">Cancel</button></span>`;
    const queue = open.map(o => `<div class="list-row sv-order"><span class="tile">${ic('shopping-bag')}</span><span class="col" style="gap:2px;flex:1;min-width:0"><span class="muted xs">#${o.id} · Flat ${esc(o.flat)} · ${esc(o.resident || '')} · ${esc(stamp(o.created_at))}</span><span>${lines(o)}</span>${o.note ? `<span class="muted sm">${esc(o.note)}</span>` : ''}<span class="row" style="gap:6px"><b>${esc(rupees(o.total))}</b>${fulTag(o)}${payTag(o)}</span></span>
      <span class="sv-state">${tag(o.status, SHOP_TAG)}</span>${acts(o)}</div>`).join('');
    const stock = isShop() ? `<section class="col" style="gap:var(--space-2)"><h2>Items and stock</h2><div class="table-wrap"><table class="table"><thead><tr><th>Item</th><th>Category</th><th>Price</th><th>Stock</th><th>Shown</th><th></th></tr></thead><tbody>
      ${items.map(i => X.itemEdit === i.id ? `<tr><td colspan="6"><form id="svitemedit" class="col sv-edit" data-id="${i.id}" style="gap:10px"><b>Edit ${esc(i.name)}</b>
          <div class="two">${field('sven' + i.id, 'Name', `<input class="input" id="sven${i.id}" name="name" required maxlength="80" value="${esc(i.name)}">`)}${field('svec' + i.id, 'Category', `<select class="input" id="svec${i.id}" name="category">${CATS.map(c => `<option value="${c}" ${c === i.category ? 'selected' : ''}>${esc(cap(c))}</option>`).join('')}</select>`)}</div>
          <div class="three">${field('svep' + i.id, 'Price (₹)', `<input class="input" id="svep${i.id}" name="price" type="number" min="1" step="0.5" value="${esc(i.price)}" required>`)}${field('sves' + i.id, 'Stock', `<input class="input" id="sves${i.id}" name="stock" type="number" min="0" step="1" value="${esc(i.stock)}" required>`)}${field('sveu' + i.id, 'Unit', `<input class="input" id="sveu${i.id}" name="unit" maxlength="20" value="${esc(i.unit || '')}">`)}</div>
          ${field('sved' + i.id, 'Description', `<textarea class="input" id="sved${i.id}" name="description" maxlength="300" rows="2" placeholder="What it is, brand, pack size, storage">${esc(i.description || '')}</textarea>`)}
          ${field('svie' + i.id, 'Photo', photoSel('svie' + i.id, i.image))}
          <div class="row" style="gap:10px"><label class="row" style="gap:6px"><input type="checkbox" name="active" ${i.active ? 'checked' : ''}> Shown in the shop</label><span style="flex:1"></span><button type="button" class="btn btn-secondary" data-act="svitemedit" data-id="">Cancel</button><button class="btn btn-primary">${ic('floppy-disk')}Save</button></div></form></td></tr>`
        : `<tr><td><span class="row" style="gap:10px;flex-wrap:nowrap">${i.image ? `<img class="sv-thumb" src="${esc(i.image)}" alt="">` : ''}<span><b>${esc(i.name)}</b> <span class="muted sm">${esc(i.unit || '')}</span></span></span></td><td>${esc(cap(i.category))}</td><td>${esc(rupees(i.price))}</td><td>${i.stock <= 3 ? `<span class="tag tag-accent-2">${esc(i.stock)}</span>` : esc(i.stock)}</td><td>${i.active ? 'Yes' : 'Hidden'}</td><td><button class="link-btn" data-act="svitemedit" data-id="${i.id}">Edit</button></td></tr>`).join('') || '<tr><td colspan="6" class="muted">No items yet.</td></tr>'}</tbody></table></div>
      <form id="svitem" class="form-card col"><h3 style="margin:0">Add an item</h3><div class="two">${field('svin', 'Name', '<input class="input" id="svin" name="name" required maxlength="80">')}${field('svic', 'Category', `<select class="input" id="svic" name="category">${CATS.map(c => `<option value="${c}">${esc(cap(c))}</option>`).join('')}</select>`)}</div>
        <div class="three">${field('svip', 'Price (₹)', '<input class="input" id="svip" name="price" type="number" min="1" step="0.5" required>')}${field('svis', 'Stock', '<input class="input" id="svis" name="stock" type="number" min="0" step="1" value="10" required>')}${field('sviu', 'Unit', '<input class="input" id="sviu" name="unit" maxlength="20" placeholder="1 kg, dozen">')}</div>
        ${field('svid', 'Description', '<textarea class="input" id="svid" name="description" maxlength="300" rows="2" placeholder="What it is, brand, pack size, storage"></textarea>')}
        ${field('svim', 'Photo', photoSel('svim', ''))}
        ${errLine()}<div class="row"><button class="btn btn-primary">${ic('plus')}Add item</button></div></form></section>` : '';
    const watch = isShop() ? '' : `<p class="callout" style="margin:0">${ic('eye')} The tuck shop owner prepares and delivers orders. You can follow their state here.</p>
      <section class="col" style="gap:var(--space-2)"><h2>Recently finished</h2>${recent.map(o => `<div class="list-row sv-order"><span class="tile">${ic('shopping-bag')}</span><span class="col" style="gap:2px;flex:1;min-width:0"><span class="muted xs">#${o.id} · Flat ${esc(o.flat)} · ${esc(stamp(o.updated_at || o.created_at))}</span><span>${lines(o)}</span><span class="row" style="gap:6px">${fulTag(o)}${payTag(o)}</span></span><span class="sv-state">${tag(o.status, SHOP_TAG)}</span></div>`).join('') || '<p class="muted">Nothing finished yet.</p>'}</section>`;
    const cLines = Object.entries(X.counter).map(([id, qty]) => ({ it: items.find(i => i.id === Number(id)), qty })).filter(x => x.it && x.qty > 0);
    const cTotal = cLines.reduce((t, x) => t + x.it.price * x.qty, 0);
    const wBal = X.who && X.who.wallet_balance != null ? Number(X.who.wallet_balance) : null, cPay = payOf(X.cpay, wBal, cTotal);
    const counter = !isShop() ? '' : `<section class="form-card col sv-counter"><h2 style="margin:0">${ic('identification-card')} Counter sale with a community card</h2>
      ${cardBox('svcard', 'svcs', "Tap the resident's card (or type its number)", `value="${esc(X.who ? X.who.serial : '')}"`)}${cardErr(X.cerr)}
      ${X.who ? `${whoRow(X.who.name, `Flat ${esc(X.who.flat)} · credit ${esc(rupees(X.who.credit_used))} of ${esc(rupees(X.who.credit_limit || 0))} used`, wBal)}
        <div class="sv-counter-items">${items.filter(i => i.active).map(i => `<div class="row sv-rate">${i.image ? `<img class="sv-thumb" src="${esc(i.image)}" alt="">` : ''}<span style="flex:1">${esc(i.name)} <span class="muted sm">${esc(rupees(i.price))} · ${esc(i.stock)} left</span></span><span class="sv-qty">${X.counter[i.id] ? `<button type="button" class="btn btn-secondary" data-act="svctr" data-id="${i.id}" data-d="-1" aria-label="One less">${ic('minus')}</button><b>${X.counter[i.id]}</b>` : ''}<button type="button" class="btn btn-primary" data-act="svctr" data-id="${i.id}" data-d="1" ${(X.counter[i.id] || 0) >= i.stock ? 'disabled' : ''} aria-label="Add ${esc(i.name)}">${ic('plus')}</button></span></div>`).join('')}</div>
        ${payBtns('shop', X.cpay, wBal, cTotal)}
        <div class="row sv-total"><span>Total</span><b>${esc(rupees(cTotal))}</b></div><button type="button" class="btn btn-primary btn-lg" data-act="svcharge" ${cLines.length && cPay ? '' : 'disabled'}>${ic('check')}${esc(chargeLabel(cPay, cTotal))}</button>` : '<p class="muted sm" style="margin:0">Tap a resident\'s card to sell at the counter and charge cash, UPI, their wallet or their maintenance account.</p>'}</section>`;
    const shopHero = isShop() ? HP.hero({ theme: 'shop', name: S.me.name, kicker: `Tuck shop · ${HP.todayLabel()}`, line: open.length ? `<b>${open.length} order${open.length > 1 ? 's' : ''}</b> to prepare · ${items.filter(i => i.stock <= 3).length} item(s) low on stock` : 'No orders waiting. Stock looks after itself as residents order.', actions: [] }) : '';
    page(`<div class="rl">${shopHero}${head('Tuck shop', isShop() ? `${open.length} open order${open.length === 1 ? '' : 's'}. Prepare, then mark delivered.` : `${open.length} open order${open.length === 1 ? '' : 's'} at the tuck shop.`)}
      ${isShop() ? counter : watch.split('\n')[0]}<section class="col" style="gap:var(--space-2)"><h2>${isShop() ? 'Orders to handle' : 'Open orders'}</h2>${queue || '<p class="muted">No open orders.</p>'}</section>${stock}${isShop() ? '' : watch.split('\n').slice(1).join('')}</div>`);
    if (isShop() && !X.who) focusBox('#svcs'); // ready for the next card
  };
  ACT.svcart = el => { const id = el.dataset.id, d = Number(el.dataset.d); X.cart[id] = Math.max(0, (X.cart[id] || 0) + d); if (!X.cart[id]) delete X.cart[id]; render(); };
  ACT.svshopst = async el => { try { await V.orderStatus(el.dataset.id, el.dataset.s); toast(el.dataset.s === 'cancelled' ? 'Order cancelled' : 'Order ' + el.dataset.s); } catch (x) { toast(x.message, 'error'); } render(); };
  // The shop's own lookup (POST /api/shop/card) also returns wallet_balance; a frozen card is a 403.
  const lookUp = async serial => {
    if (!serial) return;
    X.cerr = null;
    try { X.who = { ...(await HP.api('POST', '/api/shop/card', { serial })), serial }; } catch (x) { X.who = null; X.cerr = cardFail(x, serial); }
    render();
  };
  ACT.svctr = el => { const id = el.dataset.id; X.counter[id] = Math.max(0, (X.counter[id] || 0) + Number(el.dataset.d)); if (!X.counter[id]) delete X.counter[id]; render(); };
  ACT.svcpay = el => { if (el.dataset.k === 'laundry') X.lpay = el.dataset.v; else X.cpay = el.dataset.v; render(); };
  ACT.svwhoclear = () => { if (S.page === 'lcounter') { X.lw = null; X.lc = {}; X.lerr = null; } else { X.who = null; X.counter = {}; X.cerr = null; } render(); };
  // Web NFC (Chrome on Android): the number goes into the card box of that panel, which is then submitted.
  ACT.svnfc = async el => {
    const fid = el.dataset.f || 'svcard';
    try { const r = new NDEFReader(); await r.scan(); toast('Hold the card to the phone'); // eslint-disable-line no-undef
      r.onreading = e => { const f = document.getElementById(fid); if (!f) return; f.serial.value = e.serialNumber || ''; f.requestSubmit(); }; }
    catch (x) { toast(x.message || 'NFC not available', 'error'); }
  };
  ACT.svcharge = async () => {
    try { const items = Object.entries(X.counter).map(([id, qty]) => ({ id: Number(id), qty })); const r = await HP.api('POST', '/api/shop/counter', { serial: X.who.serial, items, payment: X.cpay });
      toast(`${rupees(r.total)} charged to ${r.name} (${PAY_LABEL[r.payment] || r.payment})`); X.counter = {}; X.who = null; X.cpay = 'cash'; }
    catch (x) { if (x.status === 403) { X.cerr = cardFail(x, X.who.serial); X.who = null; X.counter = {}; } else toast(x.message, 'error'); }
    render();
  };
  ACT.svitemedit = el => { X.itemEdit = el.dataset.id ? Number(el.dataset.id) : null; render(); };

  // =====================================================================
  // Laundry service
  // =====================================================================
  PAGES.laundry = async () => {
    const [rates, orders, credit] = await Promise.all([V.rates(), V.laundry(), isRes() ? HP.api('GET', '/api/credit').catch(() => null) : null]);
    if (isRes()) {
      const total = rates.reduce((t, r) => t + r.price * (X.wash[r.id] || 0), 0);
      const today = istToday();
      const mine = orders.slice(0, 8).map(o => `<article class="form-card col sv-wash"><div class="row" style="justify-content:space-between"><span class="muted sm">#${o.id} · pickup ${esc(day(o.pickup_date))}, ${esc(o.pickup_slot)}</span><span class="row" style="gap:6px"><b>${esc(rupees(o.total))}</b>${payTag(o)}</span></div>
        <span>${lines(o)}</span>${o.status === 'cancelled' ? '<span class="tag tag-neutral">Cancelled</span>' : steps(o.status)}${o.status === 'requested' ? `<button class="link-btn" data-act="svwashst" data-id="${o.id}" data-s="cancelled" style="align-self:flex-start">Cancel pickup</button>` : ''}</article>`).join('');
      return page(`<div class="rl">${head('Laundry', 'Book a pickup. Clothes come back washed and ironed; pay on delivery or on your maintenance account.')}
        <div class="split-eq" style="align-items:start"><form id="svwash" class="form-card col"><h3 style="margin:0">${ic('t-shirt')} Book a pickup</h3>
          <div class="col sv-rates">${rates.map(r => `<div class="row sv-rate"><span style="flex:1">${esc(r.item)} <span class="muted sm">${esc(rupees(r.price))}</span></span><span class="sv-qty">${X.wash[r.id] ? `<button type="button" class="btn btn-secondary" data-act="svwash" data-id="${r.id}" data-d="-1" aria-label="One less">${ic('minus')}</button><b>${X.wash[r.id]}</b>` : ''}<button type="button" class="btn btn-primary" data-act="svwash" data-id="${r.id}" data-d="1" aria-label="Add ${esc(r.item)}">${ic('plus')}</button></span></div>`).join('') || '<p class="muted">No laundry prices yet.</p>'}</div>
          <div class="two">${field('svwd', 'Pickup date', `<input class="input" id="svwd" name="pickup_date" type="date" min="${today}" value="${today}" required>`)}${field('svws', 'Time', `<select class="input" id="svws" name="pickup_slot"><option value="morning">Morning</option><option value="afternoon">Afternoon</option><option value="evening">Evening</option></select>`)}</div>
          ${field('svwn', 'Note (optional)', '<input class="input" id="svwn" name="note" maxlength="300" placeholder="e.g. Starch the shirts">')}${checkout(credit, 'laundry')}
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

  // Laundry counter (laundry role): tap a resident's card, pick items from the rates, choose payment,
  // POST /api/laundry/counter. The order starts as picked_up (handed over at the counter).
  PAGES.lcounter = async () => {
    const rates = (await V.rates()).filter(r => r.active);
    const w = X.lw, bal = w && w.wallet ? Number(w.wallet.balance) : null;
    const picked = rates.filter(r => X.lc[r.id] > 0), total = picked.reduce((t, r) => t + r.price * X.lc[r.id], 0), pay = payOf(X.lpay, bal, total);
    const credit = w && w.credit ? ` · credit ${esc(rupees(w.credit.used))} of ${esc(rupees(w.credit.limit || 0))} used` : '';
    page(`<div class="rl">${HP.hero({ theme: 'wash', name: S.me.name, kicker: `Laundry counter · ${HP.todayLabel()}`, line: 'Tap the resident\'s card, add the clothes they hand over, and take payment.', actions: [] })}
      <section class="form-card col sv-counter"><h2 style="margin:0">${ic('identification-card')} Hand-over with a community card</h2>
        ${cardBox('svlcard', 'svlcs', "Tap the resident's card (or type its number)", `value="${esc(w ? w.serial : '')}"`)}${cardErr(X.lerr)}
        ${w ? `${whoRow(w.name, `Flat ${esc(w.flat)}${credit}`, bal)}
          <div class="sv-counter-items">${rates.map(r => `<div class="row sv-rate"><span style="flex:1">${esc(r.item)} <span class="muted sm">${esc(rupees(r.price))}</span></span><span class="sv-qty">${X.lc[r.id] ? `<button type="button" class="btn btn-secondary" data-act="svlc" data-id="${r.id}" data-d="-1" aria-label="One less ${esc(r.item)}">${ic('minus')}</button><b>${X.lc[r.id]}</b>` : ''}<button type="button" class="btn btn-primary" data-act="svlc" data-id="${r.id}" data-d="1" ${(X.lc[r.id] || 0) >= 50 ? 'disabled' : ''} aria-label="Add ${esc(r.item)}">${ic('plus')}</button></span></div>`).join('') || '<p class="muted">No laundry prices yet. Add them under Laundry orders.</p>'}</div>
          ${payBtns('laundry', X.lpay, bal, total)}
          <div class="row sv-total"><span>Total</span><b>${esc(rupees(total))}</b></div><button type="button" class="btn btn-primary btn-lg" data-act="svlcharge" ${picked.length && pay ? '' : 'disabled'}>${ic('check')}${esc(chargeLabel(pay, total))}</button>`
        : '<p class="muted sm" style="margin:0">Tap a resident\'s card to take their laundry at the counter and charge cash, UPI, their wallet or their maintenance account.</p>'}</section></div>`);
    if (!w) focusBox('#svlcs');
  };
  const laundryLookUp = async serial => {
    if (!serial) return;
    X.lerr = null; X.lw = null; X.lc = {};
    try {
      const r = await HP.api('POST', '/api/card/lookup', { serial });
      if (r.role !== 'resident' || !r.flat) X.lerr = { msg: `This card belongs to ${r.name}, who is not a resident. Only residents' cards work at the counter.`, serial };
      else X.lw = { ...r, serial };
    } catch (x) { X.lerr = cardFail(x, serial); }
    render();
  };
  ACT.svlc = el => { const id = el.dataset.id; X.lc[id] = Math.min(50, Math.max(0, (X.lc[id] || 0) + Number(el.dataset.d))); if (!X.lc[id]) delete X.lc[id]; render(); };
  ACT.svlcharge = async () => {
    if (!X.lw) return;
    const lines = Object.entries(X.lc).map(([id, qty]) => ({ item: Number(id), qty }));
    try {
      const r = await HP.api('POST', '/api/laundry/counter', { serial: X.lw.serial, lines, payment: X.lpay });
      toast(`Laundry #${r.id}: ${rupees(r.total)} from ${r.name}, flat ${r.flat} (${PAY_LABEL[r.payment] || r.payment})`);
      X.lw = null; X.lc = {}; X.lpay = 'cash';
    } catch (x) { if (x.status === 403) { X.lerr = cardFail(x, X.lw.serial); X.lw = null; X.lc = {}; } else toast(x.message, 'error'); }
    render();
  };

  // =====================================================================
  // Parcel desk
  // =====================================================================
  PAGES.parcels = async () => {
    const ps = await V.parcels();
    const waiting = ps.filter(p => p.status === 'waiting'), done = ps.filter(p => p.status !== 'waiting').slice(0, 15);
    const row = p => `<div class="list-row"><span class="tile">${ic(p.status === 'waiting' ? 'package' : 'check-circle')}</span><span class="col" style="gap:2px;flex:1;min-width:0"><span class="muted xs">#${p.id} · ${esc(stamp(p.created_at))}${isRes() ? '' : ' · Flat ' + esc(p.flat)}</span><b>${esc(p.carrier)}</b>${p.note ? `<span class="muted sm">${esc(p.note)}</span>` : ''}${p.collected_at ? `<span class="muted sm">Collected ${esc(stamp(p.collected_at))}${p.collected_by ? ' by ' + esc(p.collected_by) : ''}</span>` : ''}</span>
      <span class="row-acts">${p.status === 'waiting' ? (isDesk() ? `<button class="btn btn-primary" data-act="svcollect" data-id="${p.id}">${ic('hand-arrow-down')}Collected</button>` : '<span class="tag tag-accent-2">At the gate</span>') : '<span class="tag tag-outline">Collected</span>'}</span></div>`;
    const form = isDesk() ? `<form id="svparcel" class="form-card col"><h3 style="margin:0">${ic('package')} Log a delivery</h3><div class="three">${field('svpf', 'Flat', '<input class="input" id="svpf" name="flat" required maxlength="20" placeholder="B-101">')}${field('svpc', 'From', '<input class="input" id="svpc" name="carrier" required maxlength="60" placeholder="Amazon, Swiggy, Blue Dart">')}${field('svpn', 'Note', '<input class="input" id="svpn" name="note" maxlength="200" placeholder="Big box, fragile">')}</div>${errLine()}<div class="row"><button class="btn btn-primary">${ic('bell-ringing')}Log and tell the flat</button></div></form>` : '';
    // Collect with card: tap, see the parcels waiting for that card's flat, hand each one over.
    const pc = X.pc, pcList = pc && pc.list ? pc.list.filter(p => !p.status || p.status === 'waiting') : [];
    const byCard = !isDesk() ? '' : `<section class="form-card col sv-counter"><h3 style="margin:0">${ic('identification-card')} Collect with card</h3>
      ${cardBox('svpcard', 'svpcs', "Tap the resident's card (or type its number)", `value="${esc(pc ? pc.serial : '')}"`)}${cardErr(pc && pc.err)}
      ${pc && pc.list ? `<div class="col" style="gap:6px"><span class="muted sm">${pcList.length ? `${pcList.length} parcel${pcList.length === 1 ? '' : 's'} waiting for flat ${esc(pc.flat || pcList[0].flat || '')}${pc.name ? ' · card of ' + esc(pc.name) : ''}` : `No parcels waiting for this card's flat${pc.flat ? ' (' + esc(pc.flat) + ')' : ''}.`}</span>
        ${pcList.map(p => `<div class="list-row"><span class="tile">${ic('package')}</span><span class="col" style="gap:2px;flex:1;min-width:0"><span class="muted xs">#${p.id} · ${esc(stamp(p.created_at))} · Flat ${esc(p.flat)}</span><b>${esc(p.carrier)}</b>${p.note ? `<span class="muted sm">${esc(p.note)}</span>` : ''}</span><span class="row-acts"><button type="button" class="btn btn-primary" data-act="svpccollect" data-id="${p.id}">${ic('hand-arrow-down')}Collect</button></span></div>`).join('')}
        <div class="row"><button type="button" class="btn btn-ghost" data-act="svpcclear">Next card</button></div></div>`
        : '<p class="muted sm" style="margin:0">The resident taps their card: their flat\'s parcels show here, and each hand-over is recorded in their name.</p>'}</section>`;
    page(`<div class="rl">${head('Parcels', isRes() ? 'Deliveries for your flat held at the gate.' : `${waiting.length} parcel${waiting.length === 1 ? '' : 's'} waiting to be collected.`)}${byCard}${form}
      <section class="col" style="gap:var(--space-2)"><h2>Waiting at the gate</h2>${waiting.map(row).join('') || '<p class="muted">No parcels waiting.</p>'}</section>
      <section class="col" style="gap:var(--space-2)"><h2>Collected</h2>${done.map(row).join('') || '<p class="muted">Nothing collected yet.</p>'}</section></div>`);
    if (isDesk() && !(pc && pc.list && pcList.length)) focusBox('#svpcs');
  };
  ACT.svcollect = async el => { try { await V.collect(el.dataset.id, ''); toast('Marked collected'); } catch (x) { toast(x.message, 'error'); } render(); };
  // GET /api/parcels/card/:serial lists the waiting parcels for the card's flat (a list; an object with parcels[] also works).
  const parcelsByCard = async serial => {
    if (!serial) return;
    try {
      const r = await HP.api('GET', `/api/parcels/card/${encodeURIComponent(serial)}`);
      const list = Array.isArray(r) ? r : (r && r.parcels) || [];
      X.pc = { serial, list, flat: (r && r.flat) || (list[0] && list[0].flat) || '', name: (r && r.name) || '' };
    } catch (x) { X.pc = { serial, err: cardFail(x, serial) }; }
    render();
  };
  ACT.svpccollect = async el => {
    if (!X.pc) return;
    try {
      await HP.api('POST', `/api/parcels/${el.dataset.id}/collect`, { serial: X.pc.serial });
      toast(`Parcel #${el.dataset.id} handed over`);
      X.pc.list = (X.pc.list || []).filter(p => String(p.id) !== el.dataset.id);
    } catch (x) { if (x.status === 403) X.pc = { serial: X.pc.serial, err: cardFail(x, X.pc.serial) }; else toast(x.message, 'error'); }
    render();
  };
  ACT.svpcclear = () => { X.pc = null; render(); };

  // =====================================================================
  // Community events
  // =====================================================================
  PAGES.events = async () => {
    const es = await V.events();
    const card = e => { const [d, t] = e.starts_at.split('T'); return `<article class="form-card sv-event ${e.cancelled ? 'off' : ''}"><span class="sv-date"><b>${esc(new Date(d + 'T00:00:00Z').getUTCDate())}</b><span>${esc(new Date(d + 'T00:00:00Z').toLocaleString('en-IN', { month: 'short', timeZone: 'UTC' }))}</span></span>
      <span class="col" style="gap:4px;flex:1;min-width:0"><b class="sv-ev-t">${esc(e.title)}</b><span class="muted sm">${esc(day(d))} at ${esc(t)}${e.location ? ' · ' + esc(e.location) : ''}</span>${e.description ? `<span>${esc(e.description)}</span>` : ''}
      <span class="muted sm">${ic('users-three')} ${esc(e.going)} going${e.cancelled ? ' · <b>Cancelled</b>' : ''}</span></span>
      <span class="row-acts">${!e.cancelled && isRes() ? `<button class="btn ${e.me_going ? 'btn-secondary' : 'btn-primary'}" data-act="svrsvp" data-id="${e.id}" data-g="${e.me_going ? 0 : 1}">${ic(e.me_going ? 'x' : 'check')}${e.me_going ? 'Not going' : "I'm going"}</button>` : ''}${!e.cancelled && canCheckin() ? `<button type="button" class="btn ${X.evOpen === e.id ? 'btn-primary' : 'btn-secondary'}" data-act="svevci" data-id="${e.id}" aria-expanded="${X.evOpen === e.id}">${ic('identification-card')}Check in by card</button>` : ''}${!e.cancelled && isAdmin() ? `<button class="btn btn-secondary" data-act="svevcancel" data-id="${e.id}">Cancel event</button>` : ''}</span></article>${X.evOpen === e.id ? checkinPanel(e) : ''}`; };
    // Check-in by card (committee, guard): the card box and who has come so far (GET /api/events/:id/checkins).
    const open = X.evOpen && es.some(e => e.id === X.evOpen && !e.cancelled) ? X.evOpen : null;
    const came = open ? await HP.api('GET', `/api/events/${open}/checkins`).catch(() => []) : [];
    const cameList = Array.isArray(came) ? came : (came && came.checkins) || [];
    const res = X.evRes && X.evRes.event === open ? X.evRes : null;
    const checkinPanel = e => `<section class="form-card col sv-counter sv-checkin" aria-label="Check in to ${esc(e.title)}"><h3 style="margin:0">${ic('identification-card')} Check in to ${esc(e.title)}</h3>
      ${cardBox('svevcin', 'svevcs', 'Tap a guest\'s card (or type its number)', `data-id="${e.id}"`)}
      ${!res ? '' : res.error ? cardErr(res.error) : `<div class="nfc-res ${res.already ? 'out' : 'in'}" role="status">${ic(res.already ? 'info' : 'check-circle')}<b>${res.already ? 'Already checked in' : 'Checked in'}: ${esc(res.name)}</b><span>${res.flat ? 'Flat ' + esc(res.flat) + ' · ' : ''}${res.rsvp ? 'Said they were going' : 'Did not RSVP'}</span></div>`}
      <h4 style="margin:0">${cameList.length} checked in</h4>
      <div class="col" style="gap:4px">${cameList.map(c => `<div class="list-row"><span class="tile">${ic('user')}</span><span style="flex:1;min-width:0">${esc(c.name)}${c.flat ? `<span class="muted sm"> · Flat ${esc(c.flat)}</span>` : ''}</span>${c.rsvp === false ? '<span class="tag tag-neutral">No RSVP</span>' : ''}<span class="muted sm" style="white-space:nowrap">${esc(stamp(c.at))}</span></div>`).join('') || '<p class="muted sm" style="margin:0">Nobody yet.</p>'}</div></section>`;
    const form = isAdmin() ? `<form id="svevent" class="form-card col"><h3 style="margin:0">${ic('calendar-plus')} Post an event</h3><div class="two">${field('svet', 'Title', '<input class="input" id="svet" name="title" required maxlength="120" placeholder="Diwali get-together">')}${field('svew', 'When', '<input class="input" id="svew" name="starts_at" type="datetime-local" required>')}</div>
      <div class="two">${field('svel', 'Where', '<input class="input" id="svel" name="location" maxlength="120" placeholder="Clubhouse">')}${field('sved', 'Details', '<input class="input" id="sved" name="description" maxlength="1000">')}</div>${errLine()}<div class="row"><button class="btn btn-primary">${ic('megaphone')}Post and tell residents</button></div></form>` : '';
    page(`<div class="rl">${head('Events', 'What is happening in the society.')}${form}<section class="col" style="gap:var(--space-3)">${es.map(card).join('') || '<p class="muted">No upcoming events.</p>'}</section></div>`);
    if (open && X.evFocus) focusBox('#svevcs'); // only when the panel was opened or a card was just read
    X.evFocus = false;
  };
  const canCheckin = () => isAdmin() || W.isGuard();
  ACT.svevci = el => { const id = Number(el.dataset.id); X.evOpen = X.evOpen === id ? null : id; X.evRes = null; X.evFocus = !!X.evOpen; render(); };
  const eventCheckin = async (id, serial) => {
    if (!serial) return;
    try { X.evRes = { ...(await HP.api('POST', `/api/events/${id}/checkin`, { serial })), event: id }; }
    catch (x) { X.evRes = { event: id, error: cardFail(x, serial) }; }
    X.evFocus = true; render();
  };
  // =====================================================================
  // Carpool (docs/carpool-api.md): residents offer rides and ask for seats; the driver accepts or declines. Phones are
  // shown only between a driver and riders they accepted. The committee sees every ride and can take one down.
  const CP = RAPI.carpool || { list: () => HP.api('GET', '/api/carpool') };
  const cpWhen = dt => { const [d, t] = String(dt).split('T'); return `${day(d)} · ${t}`; };
  const cpTag = st => ({ pending: '<span class="tag tag-accent-2">Waiting for the driver</span>', accepted: '<span class="tag tag-accent">Seat confirmed</span>', declined: '<span class="tag tag-neutral">Declined</span>', cancelled: '<span class="tag tag-neutral">Cancelled</span>' }[st] || '');
  const cpPhone = p => p ? `<a class="cp-phone" href="tel:${esc(String(p).replace(/[^\d+]/g, ''))}">${ic('phone')}${esc(p)}</a>` : '';
  const cpHead = r => `<span class="cp-route"><b>${esc(r.from_place)}</b>${ic('arrow-right')}<b>${esc(r.to_place)}</b></span>
    <span class="muted sm">${ic('clock')} ${esc(cpWhen(r.depart_at))} · ${esc(r.seats_left)} of ${esc(r.seats)} seats free${r.cost_per_seat != null ? ` · ${esc(rupees(r.cost_per_seat))} a seat` : ''}</span>${r.note ? `<span class="sm">${esc(r.note)}</span>` : ''}`;
  PAGES.carpool = async () => {
    const rides = await CP.list();
    const live = r => r.status === 'open' && !r.past;
    const mine = rides.filter(r => r.mine), seats = rides.filter(r => !r.mine && r.my_request && r.my_request.status !== 'cancelled');
    const join = rides.filter(r => !r.mine && live(r) && (!r.my_request || r.my_request.status === 'cancelled'));
    const minDt = (() => { const d = new Date(Date.now() + 15 * 6e4); d.setSeconds(0, 0); return new Date(d - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16); })();
    const form = isRes() ? `<form id="svride" class="form-card col"><h3 style="margin:0">${ic('car')} Offer a ride</h3>
      <div class="two">${field('cpto', 'Going to', '<input class="input" id="cpto" name="to_place" required maxlength="80" placeholder="Hinjewadi Phase 1">')}${field('cpfrom', 'From', '<input class="input" id="cpfrom" name="from_place" maxlength="80" value="Sahyadri Heights">')}</div>
      <div class="three">${field('cpat', 'Leaving at', `<input class="input" id="cpat" name="depart_at" type="datetime-local" required min="${minDt}">`)}${field('cpseats', 'Seats', `<select class="input" id="cpseats" name="seats">${[1, 2, 3, 4, 5, 6].map(n => `<option ${n === 3 ? 'selected' : ''}>${n}</option>`).join('')}</select>`)}${field('cpcost', 'Cost per seat (₹, optional)', '<input class="input" id="cpcost" name="cost_per_seat" type="number" min="0" max="5000" step="10" placeholder="Free">')}</div>
      ${field('cpnote', 'Note', '<input class="input" id="cpnote" name="note" maxlength="300" placeholder="e.g. Leaving from gate 2, back at 7 pm">')}
      ${errLine()}<div class="row"><button class="btn btn-primary">${ic('plus')}Offer ride</button><span class="muted sm">Costs are settled between you. Phone numbers are shared only after you accept a rider.</span></div></form>` : '';
    const reqRows = r => (r.requests || []).filter(x => x.status !== 'cancelled').map(x => `<div class="list-row cp-req"><span class="tile">${ic('user')}</span>
      <span class="col" style="gap:0;min-width:0"><b>${esc(x.name)}</b><span class="muted sm">Flat ${esc(x.flat)} · ${esc(x.seats)} seat${x.seats === 1 ? '' : 's'}</span></span>
      <span class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">${x.status === 'pending' && r.mine && live(r) ? `<button class="btn btn-primary" data-act="cpdecide" data-id="${x.id}" data-d="accept">${ic('check')}Accept</button><button class="btn btn-secondary" data-act="cpdecide" data-id="${x.id}" data-d="decline">Decline</button>` : cpTag(x.status)}${cpPhone(x.phone)}</span></div>`).join('');
    const cancelBtn = (r, label) => X.cpDel === r.id
      ? `<span class="row" style="gap:6px"><button class="btn btn-danger" data-act="cpcancel" data-id="${r.id}">${ic('x')}${label}?</button><button class="btn btn-secondary" data-act="cpkeep">Keep</button></span>`
      : `<button class="btn btn-secondary" data-act="cpask" data-id="${r.id}">${ic('x')}${label}</button>`;
    const myCard = r => `<article class="form-card col cp-card ${live(r) ? '' : 'off'}"><div class="row cp-top"><span class="col" style="gap:2px;min-width:0">${cpHead(r)}</span>
      ${live(r) ? cancelBtn(r, 'Cancel ride') : `<span class="tag tag-neutral">${r.status === 'cancelled' ? 'Cancelled' : 'Left'}</span>`}</div>
      ${(r.requests || []).some(x => x.status !== 'cancelled') ? `<div class="col" style="gap:4px">${reqRows(r)}</div>` : '<p class="muted sm" style="margin:0">No requests yet.</p>'}</article>`;
    const seatCard = r => `<article class="form-card col cp-card"><div class="row cp-top"><span class="col" style="gap:2px;min-width:0">${cpHead(r)}
      <span class="muted sm">Driver: ${esc(r.driver.name)} · Flat ${esc(r.driver.flat)}</span></span>
      <span class="col" style="gap:6px;align-items:flex-end">${cpTag(r.my_request.status)}${cpPhone(r.driver.phone)}${['pending', 'accepted'].includes(r.my_request.status) && live(r) ? `<button class="btn btn-ghost" data-act="cpwithdraw" data-id="${r.my_request.id}">Withdraw</button>` : ''}</span></div></article>`;
    const joinCard = r => `<article class="form-card cp-card"><div class="row cp-top"><span class="col" style="gap:2px;min-width:0">${cpHead(r)}<span class="muted sm">Driver: ${esc(r.driver.name)} · Flat ${esc(r.driver.flat)}</span></span>
      ${isRes() ? (r.seats_left ? `<button class="btn btn-primary" data-act="cpjoin" data-id="${r.id}">${ic('hand-waving')}Ask for a seat</button>` : '<span class="tag tag-neutral">Full</span>')
        : `<span class="row" style="gap:6px"><span class="muted sm">${(r.requests || []).filter(x => x.status === 'accepted').length} riders</span>${live(r) ? cancelBtn(r, 'Take down') : ''}</span>`}</div></article>`;
    const sec = (title, list, card, empty) => `<section class="col" style="gap:var(--space-2)"><h2>${esc(title)}${list.length ? ` <span class="muted">${list.length}</span>` : ''}</h2>${list.map(card).join('') || `<p class="muted">${esc(empty)}</p>`}</section>`;
    page(`<div class="rl">${head('Carpool', isAdmin() ? 'Rides residents share. You can take down a ride that breaks the rules.' : 'Share rides with your neighbours.')}${form}
      ${isRes() ? sec('Your rides', mine, myCard, 'You are not offering a ride.') + sec('Your seats', seats, seatCard, 'You have not asked for a seat.') : ''}
      ${sec(isAdmin() ? 'All rides' : 'Rides you can join', isAdmin() ? rides.filter(live) : join, joinCard, 'No rides offered yet.')}</div>`);
  };
  const cpRun = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (x) { toast(x.message, 'error'); } render(); };
  ACT.cpjoin = el => cpRun(() => HP.api('POST', `/api/carpool/${el.dataset.id}/request`, { seats: 1 }), 'Asked. The driver has been told.');
  ACT.cpdecide = el => cpRun(() => HP.api('POST', `/api/carpool/requests/${el.dataset.id}/decide`, { decision: el.dataset.d }), el.dataset.d === 'accept' ? 'Seat confirmed. You can now see their phone.' : 'Declined');
  ACT.cpwithdraw = el => cpRun(() => HP.api('POST', `/api/carpool/requests/${el.dataset.id}/cancel`), 'Withdrawn. The driver has been told.');
  ACT.cpask = el => { X.cpDel = Number(el.dataset.id); render(); };
  ACT.cpkeep = () => { X.cpDel = null; render(); };
  ACT.cpcancel = el => { X.cpDel = null; cpRun(() => HP.api('POST', `/api/carpool/${el.dataset.id}/cancel`), 'Ride cancelled. Riders have been told.'); };

  ACT.svrsvp = async el => { try { await V.rsvp(el.dataset.id, el.dataset.g === '1'); toast(el.dataset.g === '1' ? 'See you there' : 'Removed'); } catch (x) { toast(x.message, 'error'); } render(); };
  ACT.svevcancel = async el => { try { await V.cancelEvent(el.dataset.id); toast('Event cancelled; guests told'); } catch (x) { toast(x.message, 'error'); } render(); };

  // =====================================================================
  // Wallets (committee): prepaid balance per flat, top-ups in cash or UPI, history per flat
  // =====================================================================
  PAGES.wallets = async () => {
    const [ws, hist] = await Promise.all([HP.api('GET', '/api/admin/wallets'), X.wsel ? HP.api('GET', `/api/admin/wallets/${encodeURIComponent(X.wsel)}`).catch(x => ({ error: x.message })) : null]);
    const sum = ws.reduce((t, w) => t + (Number(w.balance) || 0), 0);
    const rows = ws.map(w => `<tr class="${X.wsel === w.flat ? 'wl-on' : ''}"><td><button type="button" class="link-btn" data-act="svwalflat" data-flat="${esc(w.flat)}" aria-label="History of flat ${esc(w.flat)}">Flat ${esc(w.flat)}</button></td><td class="wl-num">${esc(rupees(w.balance))}</td><td class="muted sm">${w.last_at ? esc(stamp(w.last_at)) : 'No activity yet'}</td></tr>`);
    const histPanel = !X.wsel ? '' : `<section class="form-card col wl-hist" aria-label="Wallet of flat ${esc(X.wsel)}"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Flat ${esc(X.wsel)}</h2>${hist && !hist.error ? `<b class="wl-big">${esc(rupees(hist.balance))}</b>` : ''}<button type="button" class="btn btn-ghost" data-act="svwalclose">${ic('x')}Close</button></div>
      ${hist && hist.error ? `<p class="err" role="alert">${esc(hist.error)}</p>` : W.walletHistory(hist && hist.tx, 'No wallet activity for this flat yet.')}</section>`;
    const tap = X.wtap;
    const topup = `<section class="form-card col wl-topup"><h2 style="margin:0">${ic('plus-circle')} Record a top-up</h2>
      <p class="muted sm" style="margin:0">Cash or UPI handed to the committee. The flat is told at once.</p>
      <form id="svtopup" class="col" style="gap:var(--space-2)">${field('svtf', 'Flat', `<select class="input" id="svtf" name="flat" required><option value="">Choose a flat</option>${ws.map(w => `<option value="${esc(w.flat)}" ${X.wflat === w.flat ? 'selected' : ''}>Flat ${esc(w.flat)} · ${esc(rupees(w.balance))}</option>`).join('')}</select>`)}</form>
      <div class="col wl-tap"><span class="muted sm">or tap the resident's card</span>${cardBox('svwtap', 'svwts', "Tap the resident's card to fill the flat")}
        <p class="sm wl-tapres" id="svwtapres" role="status">${tap ? (tap.err ? `<span class="err">${esc(tap.err.msg)}</span>` : `${ic('check-circle')} Card of <b>${esc(tap.name)}</b>, flat ${esc(tap.flat)}`) : ''}</p></div>
      <div class="two">${field('svta', 'Amount (₹)', '<input class="input" id="svta" name="amount" form="svtopup" type="number" min="1" max="50000" step="0.01" required inputmode="decimal">', '1 to 50,000')}${field('svtm', 'Method', '<select class="input" id="svtm" name="method" form="svtopup"><option value="cash">Cash</option><option value="upi">UPI</option></select>')}</div>
      ${field('svtr', 'Reference (optional)', '<input class="input" id="svtr" name="reference" form="svtopup" maxlength="80" placeholder="UPI transaction id or receipt number">')}
      <p class="err" id="svterr" role="alert"></p><div class="row"><button class="btn btn-primary btn-lg" form="svtopup">${ic('wallet')}Add to wallet</button></div></section>`;
    page(`<div class="rl">${head('Wallets', `Prepaid community card wallets: ${ws.length} flat${ws.length === 1 ? '' : 's'}, ${rupees(sum)} held in total.`)}
      <div class="split-eq wl-grid" style="align-items:start">${topup}<div class="col" style="gap:var(--space-3)">${histPanel}
        <section class="col" style="gap:var(--space-2)"><h2>Balances</h2>${`<div class="table-wrap"><table class="table"><thead><tr><th scope="col">Flat</th><th scope="col">Balance</th><th scope="col">Last activity</th></tr></thead><tbody>${rows.join('') || '<tr><td colspan="3" class="muted">No flats with approved residents yet.</td></tr>'}</tbody></table></div>`}</section></div></div></div>`);
    if (!X.wflat) focusBox('#svwts');
  };
  ACT.svwalflat = el => { X.wsel = el.dataset.flat; render(); };
  ACT.svwalclose = () => { X.wsel = null; render(); };
  // Tapping a card fills the flat in place (no redraw, so a typed amount stays) and moves on to the amount.
  const walletTap = async serial => {
    if (!serial) return;
    const out = $('#svwtapres'), sel = $('#svtf');
    try {
      const r = await HP.api('POST', '/api/card/lookup', { serial });
      if (r.role !== 'resident' || !r.flat) throw Object.assign(new Error(`This card belongs to ${r.name}, who is not a resident with a flat.`), { status: 400 });
      if (sel && ![...sel.options].some(o => o.value === r.flat)) throw new Error(`Flat ${r.flat} has no approved resident yet.`);
      X.wtap = { name: r.name, flat: r.flat }; X.wflat = r.flat;
      if (sel) sel.value = r.flat;
      if (out) out.innerHTML = `${ic('check-circle')} Card of <b>${esc(r.name)}</b>, flat ${esc(r.flat)}${r.wallet ? ` · balance ${esc(rupees(r.wallet.balance))}` : ''}`;
      focusBox('#svta');
    } catch (x) {
      X.wtap = { err: cardFail(x, serial) };
      if (out) out.innerHTML = `<span class="err">${esc(x.message)}</span>`;
      focusBox('#svwts');
    }
  };

  // =====================================================================
  // Form submits (a handler that returns false skips the redraw)
  // =====================================================================
  const forms = {
    svcard: async f => { await lookUp(f.serial.value.trim()); return false; },
    svlcard: async f => { await laundryLookUp(f.serial.value.trim()); return false; },
    svpcard: async f => { await parcelsByCard(f.serial.value.trim()); return false; },
    svevcin: async f => { const v = f.serial.value.trim(); f.serial.value = ''; await eventCheckin(Number(f.serial.dataset.id), v); return false; },
    svwtap: async f => { const v = f.serial.value.trim(); f.serial.value = ''; await walletTap(v); return false; },
    svtopup: async f => {
      const ferr = $('#svterr'); if (ferr) ferr.textContent = '';
      try {
        const r = await HP.api('POST', '/api/admin/wallet/topup', { flat: f.flat.value, amount: Number(f.amount.value), method: f.method.value, reference: f.reference.value.trim() || undefined });
        toast(`${rupees(f.amount.value)} added to flat ${r.flat}. Balance ${rupees(r.balance)}.`);
        X.wsel = r.flat; X.wflat = ''; X.wtap = null;
      } catch (x) { if (ferr) ferr.textContent = x.message; return false; }
    },
    svorder: async f => { const items = Object.entries(X.cart).map(([id, qty]) => ({ id: Number(id), qty })); const r = await V.order({ items, note: f.note.value, fulfilment: X.ful, payment: X.pay }); X.cart = {}; toast(r.payment === 'account' ? `Order #${r.id} placed: ${rupees(r.total)} added to your maintenance account` : `Order #${r.id} placed: ${rupees(r.total)}, pay ${PAY_LABEL[r.payment]} on ${r.fulfilment === 'pickup' ? 'pick-up' : 'delivery'}`); },
    svitem: async f => { await V.addItem({ name: f.name.value, category: f.category.value, price: Number(f.price.value), stock: Number(f.stock.value), unit: f.unit.value, description: f.description.value.trim(), image: f.image.value || null }); toast('Item added'); },
    svitemedit: async f => { await V.updateItem(f.dataset.id, { name: f.name.value.trim(), category: f.category.value, price: Number(f.price.value), stock: Number(f.stock.value), unit: f.unit.value.trim(), description: f.description.value.trim(), active: f.active.checked, image: f.image.value || null }); X.itemEdit = null; toast('Saved'); },
    svwash: async f => { const items = Object.entries(X.wash).map(([id, qty]) => ({ id: Number(id), qty })); const r = await V.bookLaundry({ pickup_date: f.pickup_date.value, pickup_slot: f.pickup_slot.value, note: f.note.value, items, payment: X.pay }); X.wash = {}; toast(`Pickup #${r.id} booked: ${rupees(r.total)}`); },
    svrate: async f => { await V.addRate({ item: f.item.value, price: Number(f.price.value) }); toast('Price added'); },
    svparcel: async f => { await V.logParcel({ flat: f.flat.value, carrier: f.carrier.value, note: f.note.value }); toast('Logged. The flat has been told.'); },
    svride: async f => { await HP.api('POST', '/api/carpool', { to_place: f.to_place.value.trim(), from_place: f.from_place.value.trim(), depart_at: f.depart_at.value, seats: Number(f.seats.value), cost_per_seat: f.cost_per_seat.value === '' ? null : Number(f.cost_per_seat.value), note: f.note.value.trim() }); toast('Ride offered. Neighbours can ask for a seat.'); },
    svevent: async f => { await V.addEvent({ title: f.title.value, starts_at: f.starts_at.value, location: f.location.value, description: f.description.value }); toast('Event posted'); },
  };
  document.addEventListener('change', e => {
    if (e.target.matches('[data-svful]')) { X.ful = e.target.value; render(); }
    if (e.target.matches('[data-svpay]')) { X.pay = e.target.value; render(); }
    if (e.target.id === 'svtf') { X.wflat = e.target.value; X.wtap = null; const o = $('#svwtapres'); if (o) o.textContent = ''; } // no redraw: keep the typed amount
  });
  document.addEventListener('submit', async e => {
    const fn = forms[e.target.id]; if (!fn) return;
    e.preventDefault(); X.err = ''; setErr('');
    try { if (await fn(e.target) !== false) render(); } catch (x) { X.err = x.message; setErr(x.message); }
  });

  // =====================================================================
  // Neighbourhood business directory (docs/business-api.md): residents list a business (theirs or a nearby trusted one);
  // the committee approves, rejects with a reason or takes it down; residents browse by category and search and leave
  // one editable 1-5 star rating. Phones are shown on live listings.
  // Daycare (docs/daycare-api.md): the committee registers providers, decides on places and marks drop-off and pick-up;
  // parents ask for a place with the child's first name and age only, and see today's status.
  // Own state, actions and submit listener, so this block stays separate from the ones above.
  (() => {
    const A = window.API || {};
    const BZ = A.business, DC = A.daycare;
    if (!BZ || !DC) return;
    const BZ_CATS = ['food', 'tutoring', 'tailoring', 'beauty', 'repairs', 'home services', 'health', 'other'];
    const BZ_IC = { food: 'bowl-food', tutoring: 'book-open', tailoring: 'needle', beauty: 'sparkle', repairs: 'wrench', 'home services': 'house-line', health: 'first-aid', other: 'briefcase' };
    const DC_DAYS = [['mon', 'Mon'], ['tue', 'Tue'], ['wed', 'Wed'], ['thu', 'Thu'], ['fri', 'Fri']];
    // bzCat/bzQ: filter. bzForm: 'new' or the listing id being edited. bzRate/bzRej/bzDown/bzDel: the listing whose inline form or confirm is open.
    // dcFor: provider whose "ask for a place" form is open. dcProv: 'new' or the provider id being edited. dcDel/dcStop: confirms.
    const Y = { bzCat: '', bzQ: '', bzForm: null, bzRate: null, bzRej: null, bzDown: null, bzDel: null, dcFor: null, dcProv: null, dcDel: null, dcStop: null };
    const busy = () => { const a = document.activeElement; return !!(a && a.closest && a.closest('.bz-form, .dc-form')); };
    W.noRedraw = (prev => () => (prev && prev()) || (['business', 'daycare'].includes(S.page) && (busy() || Y.bzForm != null || Y.bzRate != null || Y.bzRej != null || Y.bzDown != null || Y.dcFor != null || Y.dcProv != null)))(W.noRedraw);
    const err = id => `<p class="err" id="${id}" role="alert"></p>`;
    const phoneLink = p => p ? `<a class="cp-phone" href="tel:${esc(String(p).replace(/[^\d+]/g, ''))}">${ic('phone')}${esc(p)}</a>` : '';
    const sec = (title, n, body) => `<section class="col" style="gap:var(--space-2)"><h2>${esc(title)}${n ? ` <span class="muted">${n}</span>` : ''}</h2>${body}</section>`;
    const starRow = (avg, count) => count ? `<span class="bz-stars" aria-label="${esc(avg)} out of 5 from ${esc(count)} rating${count === 1 ? '' : 's'}">${[1, 2, 3, 4, 5].map(i => ic('star', i <= Math.round(avg) ? 'on' : '')).join('')}<b>${esc(avg)}</b><span class="muted sm">(${esc(count)})</span></span>` : '<span class="muted sm">No ratings yet</span>';
    const run = async (fn, ok) => { try { await fn(); if (ok) toast(ok); } catch (x) { toast(x.message, 'error'); } render(); };

    // ---------- business directory
    const BZ_TAG = { pending: ['tag-accent-2', 'Waiting for the committee'], approved: ['tag-accent', 'Live'], rejected: ['tag-neutral', 'Not approved'], removed: ['tag-neutral', 'Taken down'] };
    const bzTag = s => { const [c, l] = BZ_TAG[s] || ['tag-neutral', cap(s)]; return `<span class="tag ${c}">${esc(l)}</span>`; };
    const bzForm = b => `<form id="bzsave" class="form-card col bz-form" data-id="${b ? b.id : ''}"><h3 style="margin:0">${ic('storefront')} ${b ? 'Edit listing' : 'List a business'}</h3>
      <div class="two">${field('bzname', 'Business name', `<input class="input" id="bzname" name="name" required maxlength="80" value="${esc(b ? b.name : '')}">`)}${field('bzcat', 'Category', `<select class="input" id="bzcat" name="category" required><option value="">Choose…</option>${BZ_CATS.map(c => `<option value="${esc(c)}" ${b && b.category === c ? 'selected' : ''}>${esc(cap(c))}</option>`).join('')}</select>`)}</div>
      ${field('bzdesc', 'What they offer', `<textarea class="input" id="bzdesc" name="description" required maxlength="500" rows="3">${esc(b ? b.description : '')}</textarea>`)}
      <div class="three">${field('bzphone', 'Phone', `<input class="input" id="bzphone" name="phone" type="tel" required maxlength="20" value="${esc(b ? b.phone || '' : '')}">`)}${field('bzhours', 'Opening hours', `<input class="input" id="bzhours" name="hours" required maxlength="80" placeholder="Mon-Sat 10:00-19:00" value="${esc(b ? b.hours : '')}">`)}${field('bzweb', 'Website (optional)', `<input class="input" id="bzweb" name="website" type="url" maxlength="200" placeholder="https://" value="${esc(b && b.website ? b.website : '')}">`)}</div>
      <label class="row" style="gap:6px"><input type="checkbox" name="run_by_resident" ${b && b.run_by_resident ? 'checked' : ''}> The owner lives in the society (run by a resident)</label>
      ${err('bzerr')}<div class="row"><button class="btn btn-primary">${ic('paper-plane-tilt')}${b ? 'Save and send for review' : 'Send for review'}</button><button type="button" class="btn btn-secondary" data-act="bzclose">Cancel</button><span class="muted sm">The committee checks every listing before it goes live.</span></div></form>`;
    const inlineReason = (formId, label, btn) => `<form id="${formId}" class="row bz-form bz-inline"><label class="sr" for="${formId}r">${esc(label)}</label><input class="input" id="${formId}r" name="reason" required maxlength="300" placeholder="${esc(label)}"><button class="btn btn-danger">${esc(btn)}</button><button type="button" class="btn btn-secondary" data-act="bzclose">Cancel</button></form>`;
    const rateForm = b => `<form id="bzrate" class="col bz-form bz-inline"><fieldset class="bz-pick"><legend>Your rating</legend>${[1, 2, 3, 4, 5].map(i => `<label><input type="radio" name="stars" value="${i}" required ${b.my_review && b.my_review.stars === i ? 'checked' : ''}>${ic('star')}<span class="sr">${i} star${i === 1 ? '' : 's'}</span></label>`).join('')}</fieldset>
      <div class="row"><label class="sr" for="bzrv">Short review</label><input class="input" id="bzrv" name="review" maxlength="300" placeholder="A short review (optional)" value="${esc(b.my_review && b.my_review.review ? b.my_review.review : '')}"><button class="btn btn-primary">Save</button><button type="button" class="btn btn-secondary" data-act="bzclose">Cancel</button></div></form>`;
    const bzCard = b => {
      const site = b.website && /^https?:\/\//i.test(b.website) ? `<a href="${esc(b.website)}" target="_blank" rel="noopener noreferrer">${ic('globe')}Website</a>` : '';
      const reviews = (b.reviews || []).filter(r => r.review).slice(0, 3).map(r => `<p class="bz-rev sm"><b>${esc(r.stars)}★</b> ${esc(r.review)} <span class="muted">· ${esc(r.name)}, Flat ${esc(r.flat)}</span></p>`).join('');
      let acts = '';
      if (isAdmin() && b.status === 'pending') acts = Y.bzRej === b.id ? inlineReason('bzrej', 'Reason for rejecting', 'Reject') : `<button class="btn btn-primary" data-act="bzapprove" data-id="${b.id}">${ic('check')}Approve</button><button class="btn btn-secondary" data-act="bzrejopen" data-id="${b.id}">Reject</button>`;
      else if (isAdmin() && b.status === 'approved') acts = Y.bzDown === b.id ? inlineReason('bzdown', 'Reason for taking it down', 'Take down') : `<button class="btn btn-secondary" data-act="bzdownopen" data-id="${b.id}">${ic('x')}Take down</button>`;
      else if (b.mine) acts = Y.bzDel === b.id ? `<button class="btn btn-danger" data-act="bzwithdraw" data-id="${b.id}">${ic('trash')}Remove listing?</button><button class="btn btn-secondary" data-act="bzclose">Keep</button>`
        : `${b.status !== 'removed' ? `<button class="btn btn-secondary" data-act="bzedit" data-id="${b.id}">${ic('pencil-simple')}Edit</button>` : ''}<button class="btn btn-ghost" data-act="bzdelask" data-id="${b.id}">Remove</button>`;
      else if (isRes() && b.status === 'approved') acts = Y.bzRate === b.id ? rateForm(b) : `<button class="btn btn-secondary" data-act="bzrateopen" data-id="${b.id}">${ic('star')}${b.my_review ? `You rated ${esc(b.my_review.stars)}★ · Edit` : 'Rate'}</button>`;
      return `<article class="form-card col bz-card ${['approved', 'pending'].includes(b.status) ? '' : 'off'}"><div class="row bz-top"><span class="tile">${ic(BZ_IC[b.category] || 'briefcase')}</span>
        <span class="col" style="gap:2px;min-width:0;flex:1"><b class="bz-name">${esc(b.name)}</b><span class="row" style="gap:6px;flex-wrap:wrap"><span class="tag tag-outline">${esc(cap(b.category))}</span>${b.run_by_resident ? `<span class="tag tag-accent">${ic('house')} Run by a resident</span>` : ''}${b.status !== 'approved' || b.mine ? bzTag(b.status) : ''}</span></span>
        ${b.status === 'approved' ? starRow(b.rating.average, b.rating.count) : ''}</div>
        <p style="margin:0">${esc(b.description)}</p>
        <span class="row muted sm bz-meta"><span>${ic('clock')} ${esc(b.hours)}</span>${phoneLink(b.phone)}${site}<span>Listed by ${esc(b.listed_by.name)} · Flat ${esc(b.listed_by.flat)}</span></span>
        ${b.reason ? `<p class="sm bz-reason">${ic('info')} ${esc(b.reason)}</p>` : ''}${reviews}
        ${acts ? `<div class="row bz-acts">${acts}</div>` : ''}</article>`;
    };
    PAGES.business = async () => {
      const rows = await BZ.list({ category: Y.bzCat, q: Y.bzQ });
      const pending = rows.filter(b => b.status === 'pending' && isAdmin()), mine = rows.filter(b => b.mine);
      const live = rows.filter(b => b.status === 'approved' && !b.mine);
      const editing = Y.bzForm === 'new' ? bzForm(null) : Y.bzForm != null ? bzForm(rows.find(b => b.id === Y.bzForm)) : '';
      const find = `<form id="bzfind" class="row bz-find" role="search"><label class="sr" for="bzfcat">Category</label><select class="input" id="bzfcat" name="category" data-bzcat><option value="">All categories</option>${BZ_CATS.map(c => `<option value="${esc(c)}" ${Y.bzCat === c ? 'selected' : ''}>${esc(cap(c))}</option>`).join('')}</select>
        <label class="sr" for="bzfq">Search</label><input class="input" id="bzfq" name="q" type="search" maxlength="60" placeholder="Search tiffin, tuition, tailor…" value="${esc(Y.bzQ)}"><button class="btn btn-secondary">${ic('magnifying-glass')}Search</button>${Y.bzCat || Y.bzQ ? '<button type="button" class="btn btn-ghost" data-act="bzclear">Clear</button>' : ''}</form>`;
      const addBtn = isRes() && Y.bzForm == null ? `<button class="btn btn-primary" data-act="bzadd">${ic('plus')}List a business</button>` : '';
      page(`<div class="rl">${head('Local businesses', isAdmin() ? 'Check new listings before they go live. You can take down a listing that breaks the rules.' : 'Small businesses run by neighbours or trusted nearby. Every listing is checked by the committee.', addBtn)}
        ${editing}${find}
        ${isAdmin() ? sec('Waiting for review', pending.length, pending.map(bzCard).join('') || '<p class="muted">Nothing waiting.</p>') : ''}
        ${isRes() && mine.length ? sec('Your listings', mine.length, mine.map(bzCard).join('')) : ''}
        ${sec(isAdmin() ? 'Live listings' : 'Directory', live.length, `<div class="bz-grid">${live.map(bzCard).join('')}</div>` + (live.length ? '' : `<p class="muted">${Y.bzCat || Y.bzQ ? 'No business matches. Try another category or word.' : 'No businesses listed yet.'}</p>`))}</div>`);
    };
    const closeAll = () => Object.assign(Y, { bzForm: null, bzRate: null, bzRej: null, bzDown: null, bzDel: null });
    ACT.bzadd = () => { closeAll(); Y.bzForm = 'new'; render(); };
    ACT.bzedit = el => { closeAll(); Y.bzForm = Number(el.dataset.id); render(); };
    ACT.bzclose = () => { closeAll(); render(); };
    ACT.bzclear = () => { Y.bzCat = ''; Y.bzQ = ''; render(); };
    ACT.bzrateopen = el => { closeAll(); Y.bzRate = Number(el.dataset.id); render(); };
    ACT.bzrejopen = el => { closeAll(); Y.bzRej = Number(el.dataset.id); render(); };
    ACT.bzdownopen = el => { closeAll(); Y.bzDown = Number(el.dataset.id); render(); };
    ACT.bzdelask = el => { closeAll(); Y.bzDel = Number(el.dataset.id); render(); };
    ACT.bzapprove = el => run(() => BZ.decide(el.dataset.id, 'approve'), 'Approved. The listing is live and the owner has been told.');
    ACT.bzwithdraw = el => { const id = el.dataset.id; closeAll(); run(() => BZ.withdraw(id), 'Listing removed'); };

    // ---------- daycare
    const DC_TAG = { pending: ['tag-accent-2', 'Waiting for the committee'], approved: ['tag-accent', 'Place confirmed'], declined: ['tag-neutral', 'Declined'], cancelled: ['tag-neutral', 'Cancelled'] };
    const dcTag = s => { const [c, l] = DC_TAG[s] || ['tag-neutral', cap(s)]; return `<span class="tag ${c}">${esc(l)}</span>`; };
    const dcDays = days => (days || []).map(d => (DC_DAYS.find(x => x[0] === d) || [d, d])[1]).join(', ');
    const dcToday = t => !t ? '' : t.out_at ? `<span class="dc-now done">${ic('check-circle')} Picked up at ${esc(t.out_at)} (dropped off ${esc(t.in_at)})</span>`
      : t.in_at ? `<span class="dc-now in">${ic('baby')} At daycare since ${esc(t.in_at)}</span>` : t.scheduled ? `<span class="dc-now">${ic('clock')} Not dropped off yet today</span>` : '<span class="muted sm">Not a daycare day</span>';
    const provForm = p => `<form id="dcprov" class="form-card col dc-form" data-id="${p ? p.id : ''}"><h3 style="margin:0">${ic('baby-carriage')} ${p ? 'Edit daycare' : 'Register a daycare'}</h3>
      <div class="two">${field('dcpn', 'Name', `<input class="input" id="dcpn" name="name" required maxlength="80" value="${esc(p ? p.name : '')}">`)}${field('dcploc', 'Location', `<input class="input" id="dcploc" name="location" required maxlength="120" placeholder="Clubhouse ground floor" value="${esc(p ? p.location : '')}">`)}</div>
      <div class="three">${field('dcpmin', 'Youngest (years)', `<input class="input" id="dcpmin" name="age_min" type="number" min="0" max="14" required value="${esc(p ? p.age_min : 1)}">`)}${field('dcpmax', 'Oldest (years)', `<input class="input" id="dcpmax" name="age_max" type="number" min="0" max="14" required value="${esc(p ? p.age_max : 5)}">`)}${field('dcpcap', 'Places', `<input class="input" id="dcpcap" name="capacity" type="number" min="1" max="200" required value="${esc(p ? p.capacity : 10)}">`)}</div>
      <div class="three">${field('dcph', 'Hours', `<input class="input" id="dcph" name="hours" required maxlength="80" placeholder="Mon-Fri 08:30-17:30" value="${esc(p ? p.hours : '')}">`)}${field('dcpfee', 'Fee per month (₹)', `<input class="input" id="dcpfee" name="fee_month" type="number" min="0" step="50" required value="${esc(p ? p.fee_month : '')}">`)}${field('dcpph', 'Phone', `<input class="input" id="dcpph" name="phone" type="tel" required maxlength="20" value="${esc(p ? p.phone : '')}">`)}</div>
      ${field('dcpnotes', 'Notes', `<input class="input" id="dcpnotes" name="notes" maxlength="500" placeholder="e.g. Meals included, bring a water bottle" value="${esc(p && p.notes ? p.notes : '')}">`)}
      ${err('dcperr')}<div class="row"><button class="btn btn-primary">${ic('floppy-disk')}${p ? 'Save' : 'Register'}</button><button type="button" class="btn btn-secondary" data-act="dcclose">Cancel</button><span class="muted sm">Fees are recorded only; parents pay the daycare directly.</span></div></form>`;
    const enrolForm = p => {
      const ages = []; for (let a = p.age_min; a <= p.age_max; a++) ages.push(a);
      const today = istToday();
      return `<form id="dcenrol" class="col dc-form bz-inline" data-id="${p.id}"><div class="three">${field('dcchild', "Child's first name", '<input class="input" id="dcchild" name="child_name" required maxlength="30" autocomplete="off">', 'First name only. No surname or date of birth.')}
        ${field('dcage', 'Age (years)', `<select class="input" id="dcage" name="child_age">${ages.map(a => `<option>${a}</option>`).join('')}</select>`)}${field('dcstart', 'Start date', `<input class="input" id="dcstart" name="start_date" type="date" required min="${today}" value="${today}">`)}</div>
        <fieldset class="dc-days"><legend>Days</legend>${DC_DAYS.map(([v, l]) => `<label><input type="checkbox" name="days" value="${v}" checked>${l}</label>`).join('')}</fieldset>
        ${err('dceerr')}<div class="row"><button class="btn btn-primary">${ic('paper-plane-tilt')}Ask for a place</button><button type="button" class="btn btn-secondary" data-act="dcclose">Cancel</button></div></form>`;
    };
    const provCard = p => `<article class="form-card col dc-card ${p.active ? '' : 'off'}"><div class="row bz-top"><span class="tile">${ic('baby-carriage')}</span>
      <span class="col" style="gap:2px;min-width:0;flex:1"><b class="bz-name">${esc(p.name)}</b><span class="muted sm">Ages ${esc(p.age_min)} to ${esc(p.age_max)} · ${esc(p.hours)} · ${esc(rupees(p.fee_month))} a month</span></span>
      <span class="tag ${p.active && p.places_left ? 'tag-accent' : 'tag-neutral'}">${p.active ? (p.places_left ? `${esc(p.places_left)} of ${esc(p.capacity)} places free` : 'Full') : 'Closed'}</span></div>
      <span class="row muted sm bz-meta"><span>${ic('map-pin')} ${esc(p.location)}</span>${phoneLink(p.phone)}</span>${p.notes ? `<p class="sm" style="margin:0">${esc(p.notes)}</p>` : ''}
      ${isRes() ? (Y.dcFor === p.id ? enrolForm(p) : `<div class="row bz-acts"><button class="btn btn-primary" data-act="dcask" data-id="${p.id}">${ic('hand-waving')}Ask for a place</button></div>`)
        : p.active ? `<div class="row bz-acts">${Y.dcDel === p.id ? `<button class="btn btn-danger" data-act="dcclosep" data-id="${p.id}">${ic('x')}Close it and cancel its places?</button><button class="btn btn-secondary" data-act="dcclose">Keep</button>` : `<button class="btn btn-secondary" data-act="dcedit" data-id="${p.id}">${ic('pencil-simple')}Edit</button><button class="btn btn-ghost" data-act="dcdelask" data-id="${p.id}">Close</button>`}</div>` : ''}</article>`;
    const enrolRow = e => `<div class="list-row dc-row"><span class="tile">${ic('baby')}</span>
      <span class="col" style="gap:2px;min-width:0"><b>${esc(e.child_name)}, ${esc(e.child_age)}</b><span class="muted sm">${esc(e.provider.name)} · from ${esc(day(e.start_date))} · ${esc(dcDays(e.days))}${isAdmin() ? ` · Flat ${esc(e.flat)}` : ''}</span>${e.reason ? `<span class="sm">${esc(e.reason)}</span>` : ''}${!isAdmin() && e.status === 'approved' ? dcToday(e.today) : ''}</span>
      <span class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">${isAdmin() && e.status === 'pending' ? `<button class="btn btn-primary" data-act="dcapprove" data-id="${e.id}">${ic('check')}Approve</button><button class="btn btn-secondary" data-act="dcdecline" data-id="${e.id}">Decline</button>`
        : dcTag(e.status)}${!isAdmin() && ['pending', 'approved'].includes(e.status) ? (Y.dcStop === e.id ? `<button class="btn btn-danger" data-act="dccancel" data-id="${e.id}">Cancel ${e.status === 'approved' ? 'place' : 'request'}?</button><button class="btn btn-secondary" data-act="dcclose">Keep</button>` : `<button class="btn btn-ghost" data-act="dcstopask" data-id="${e.id}">Cancel</button>`) : ''}</span></div>`;
    const regRow = e => `<div class="list-row dc-row"><span class="tile">${ic('baby')}</span><span class="col" style="gap:2px;min-width:0"><b>${esc(e.child_name)}, ${esc(e.child_age)}</b><span class="muted sm">${esc(e.provider.name)} · Flat ${esc(e.flat)}${e.today.scheduled ? '' : ' · extra day'}</span></span>
      <span class="row" style="gap:6px;flex-wrap:wrap;justify-content:flex-end">${e.today.in_at ? `<span class="tag tag-outline">In ${esc(e.today.in_at)}</span>` : `<button class="btn btn-primary" data-act="dcin" data-id="${e.id}">${ic('sign-in')}Dropped off</button>`}
        ${e.today.out_at ? `<span class="tag tag-outline">Out ${esc(e.today.out_at)}</span>` : e.today.in_at ? `<button class="btn btn-primary" data-act="dcout" data-id="${e.id}">${ic('sign-out')}Picked up</button>` : ''}</span></div>`;
    PAGES.daycare = async () => {
      const [provs, enr, reg] = await Promise.all([DC.providers(), DC.enrolments(), isAdmin() ? DC.today() : null]);
      if (isAdmin()) {
        const pend = enr.filter(e => e.status === 'pending');
        const form = Y.dcProv === 'new' ? provForm(null) : Y.dcProv != null ? provForm(provs.find(p => p.id === Y.dcProv)) : '';
        return page(`<div class="rl">${head('Daycare', 'Daycare providers in or near the society. Approve places, and mark children in and out each day.', Y.dcProv == null ? `<button class="btn btn-primary" data-act="dcadd">${ic('plus')}Register a daycare</button>` : '')}${form}
          ${sec(`Today · ${day(reg.date)}`, reg.children.length, `<div class="col" style="gap:4px">${reg.children.map(regRow).join('') || '<p class="muted">No children are booked for today.</p>'}</div>`)}
          ${sec('Waiting for a decision', pend.length, `<div class="col" style="gap:4px">${pend.map(enrolRow).join('') || '<p class="muted">Nothing waiting.</p>'}</div>`)}
          ${sec('Providers', provs.filter(p => p.active).length, provs.map(provCard).join('') || '<p class="muted">No daycare registered yet.</p>')}</div>`);
      }
      const kids = enr.filter(e => e.status !== 'cancelled');
      page(`<div class="rl">${head('Daycare', 'Daycare near home. Ask for a place with your child\'s first name and age; the committee confirms it.')}
        ${kids.length ? sec('Your children', kids.length, `<div class="col" style="gap:4px">${kids.map(enrolRow).join('')}</div>`) : ''}
        ${sec('Daycare providers', provs.length, provs.map(provCard).join('') || '<p class="muted">No daycare is listed yet.</p>')}</div>`);
    };
    const dcCloseAll = () => Object.assign(Y, { dcFor: null, dcProv: null, dcDel: null, dcStop: null });
    ACT.dcadd = () => { dcCloseAll(); Y.dcProv = 'new'; render(); };
    ACT.dcedit = el => { dcCloseAll(); Y.dcProv = Number(el.dataset.id); render(); };
    ACT.dcclose = () => { dcCloseAll(); render(); };
    ACT.dcask = el => { dcCloseAll(); Y.dcFor = Number(el.dataset.id); render(); };
    ACT.dcdelask = el => { dcCloseAll(); Y.dcDel = Number(el.dataset.id); render(); };
    ACT.dcstopask = el => { dcCloseAll(); Y.dcStop = Number(el.dataset.id); render(); };
    ACT.dcclosep = el => { const id = el.dataset.id; dcCloseAll(); run(async () => { const r = await DC.closeProvider(id); toast(r.cancelled ? `Daycare closed. ${r.cancelled} place${r.cancelled === 1 ? '' : 's'} cancelled; parents told.` : 'Daycare closed'); }); };
    ACT.dccancel = el => { const id = el.dataset.id; dcCloseAll(); run(() => DC.cancel(id), 'Cancelled. The committee has been told.'); };
    ACT.dcapprove = el => run(() => DC.decide(el.dataset.id, 'approve'), 'Place confirmed. The parent has been told.');
    ACT.dcdecline = el => run(() => DC.decide(el.dataset.id, 'decline'), 'Declined. The parent has been told.');
    ACT.dcin = el => run(() => DC.checkin(el.dataset.id), 'Marked dropped off');
    ACT.dcout = el => run(() => DC.checkout(el.dataset.id), 'Marked picked up. The parent has been told.');

    // ---------- forms of this block
    const val = (f, n) => (f.elements[n] ? f.elements[n].value.trim() : '');
    const own = {
      bzfind: f => { Y.bzCat = val(f, 'category'); Y.bzQ = val(f, 'q'); },
      bzsave: async f => {
        const body = { name: val(f, 'name'), category: val(f, 'category'), description: val(f, 'description'), phone: val(f, 'phone'), hours: val(f, 'hours'), website: val(f, 'website'), run_by_resident: f.elements.run_by_resident.checked };
        if (f.dataset.id) await BZ.update(f.dataset.id, body); else await BZ.submit(body);
        closeAll(); toast('Sent to the committee. You will be told when it is live.');
      },
      bzrate: async f => { const s = f.querySelector('input[name="stars"]:checked'); await BZ.review(Y.bzRate, Number(s ? s.value : 0), val(f, 'review')); closeAll(); toast('Thanks for rating'); },
      bzrej: async f => { await BZ.decide(Y.bzRej, 'reject', val(f, 'reason')); closeAll(); toast('Rejected. The owner has been told why.'); },
      bzdown: async f => { await BZ.remove(Y.bzDown, val(f, 'reason')); closeAll(); toast('Taken down. The owner has been told why.'); },
      dcprov: async f => {
        const body = { name: val(f, 'name'), location: val(f, 'location'), age_min: Number(val(f, 'age_min')), age_max: Number(val(f, 'age_max')), capacity: Number(val(f, 'capacity')), hours: val(f, 'hours'), fee_month: Number(val(f, 'fee_month')), phone: val(f, 'phone'), notes: val(f, 'notes') };
        if (f.dataset.id) await DC.updateProvider(f.dataset.id, body); else await DC.addProvider(body);
        dcCloseAll(); toast(f.dataset.id ? 'Saved' : 'Daycare registered');
      },
      dcenrol: async f => {
        const days = [...f.querySelectorAll('input[name="days"]:checked')].map(x => x.value);
        await DC.enrol({ provider_id: Number(f.dataset.id), child_name: val(f, 'child_name'), child_age: Number(val(f, 'child_age')), start_date: val(f, 'start_date'), days });
        dcCloseAll(); toast('Asked. The committee will confirm the place.');
      },
    };
    const ERR_OF = { bzsave: 'bzerr', dcprov: 'dcperr', dcenrol: 'dceerr' };
    document.addEventListener('submit', async e => {
      const fn = own[e.target.id]; if (!fn) return;
      e.preventDefault();
      const out = ERR_OF[e.target.id] && document.getElementById(ERR_OF[e.target.id]);
      if (out) out.textContent = '';
      try { await fn(e.target); render(); } catch (x) { if (out) out.textContent = x.message; else toast(x.message, 'error'); }
    });
    document.addEventListener('change', e => { if (e.target.matches('[data-bzcat]')) { Y.bzCat = e.target.value; render(); } });
  })();
})();
