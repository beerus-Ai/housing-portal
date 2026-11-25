// Society modules from the faculty whiteboard (docs/modules-api.md): Amenities, Maintenance dues, Inventory, Waste.
// Loaded after web-roles.js; registers pages and delegated events on window.HPWeb. No inline handlers (CSP 'self').
(() => {
  const W = window.HPWeb; if (!W) return;
  const { esc, ic, toast, day, stamp, rupees, dateLong, RAPI } = HP;
  const { S, PAGES, ACT, page, render, go, isAdmin, isStaff } = W;
  const M = RAPI.mod;
  const $ = (s, r = document) => r.querySelector(s);
  const X = { amenity: null, date: null, payFor: null, moveFor: null, moves: {}, showMoves: null, dueStatus: '', duePeriod: '', days: '30', err: '' };
  const isRes = () => S.me && S.me.role === 'resident';
  // Forms stay open while the page redraws live.
  const prevNoRedraw = W.noRedraw;
  W.noRedraw = () => (prevNoRedraw && prevNoRedraw()) || (['dues', 'inventory'].includes(S.page) && (X.payFor != null || X.moveFor != null));

  // IST dates, matching the server.
  const istToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());
  const addDays = (ymd, n) => new Date(Date.parse(ymd + 'T00:00:00Z') + n * 864e5).toISOString().slice(0, 10);
  const WEEKDAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
  const WASTE = [['wet', 'Wet (kitchen)', 'leaf'], ['dry', 'Dry (mixed)', 'trash'], ['recyclable', 'Recyclable', 'recycle'], ['hazardous', 'Hazardous', 'warning-circle'], ['e-waste', 'E-waste', 'archive']];
  const wasteLabel = k => (WASTE.find(w => w[0] === k) || [k, k])[1];
  const wasteIcon = k => (WASTE.find(w => w[0] === k) || [0, 0, 'trash'])[2];
  const INV_CATS = ['plumbing', 'electrical', 'cleaning', 'safety', 'garden', 'office', 'other'];
  const cap = s => String(s || '').charAt(0).toUpperCase() + String(s || '').slice(1);
  const METHODS = [['cash', 'Cash'], ['upi', 'UPI'], ['bank', 'Bank transfer'], ['cheque', 'Cheque']];

  const head = (title, sub, right = '') => `<header class="rl-head"><div><h1>${esc(title)}</h1>${sub ? `<p class="muted">${esc(sub)}</p>` : ''}</div><div class="row rl-head-r">${HP.liveBadge()}${right}</div></header>`;
  const field = (id, label, input, hint) => `<div class="field"><label for="${id}">${esc(label)}</label>${input}${hint ? `<span class="muted sm">${esc(hint)}</span>` : ''}</div>`;
  const table = (heads, rows, empty) => `<div class="table-wrap"><table class="table"><thead><tr>${heads.map(h => `<th scope="col">${esc(h)}</th>`).join('')}</tr></thead><tbody>${rows.join('') || `<tr><td colspan="${heads.length}" class="muted">${esc(empty)}</td></tr>`}</tbody></table></div>`;
  const stat = (icon, n, label, sub, act) => `<${act ? `button type="button" data-act="nav" data-page="${act}"` : 'div'} class="eg-card md-stat"><span class="eg-ic">${ic(icon)}</span><span class="eg-n">${esc(n)}</span><span class="eg-l">${esc(label)}</span>${sub ? `<span class="eg-s">${esc(sub)}</span>` : ''}</${act ? 'button' : 'div'}>`;
  const errLine = () => `<p class="err" id="mderr" role="alert">${esc(X.err)}</p>`;
  const setErr = m => { const e = $('#mderr'); if (e) e.textContent = m || ''; };
  // Two-step confirm (no browser dialogs): the first tap arms the button, a second tap within 4 s does it.
  const sure = (el, key, label) => {
    if (X.sure === key) { X.sure = null; return true; }
    X.sure = key; el.classList.add('md-armed'); el.innerHTML = ic('warning-circle') + esc(label);
    setTimeout(() => { if (X.sure === key) { X.sure = null; if (el.isConnected) render(); } }, 4000);
    return false;
  };
  const dueTag = d => { const m = { paid: ['tag-outline', 'Paid'], partial: ['tag-accent', 'Part paid'], unpaid: ['tag-neutral', 'Unpaid'], overdue: ['tag-accent-2', 'Overdue'] }[d.status] || ['tag-neutral', d.status]; return `<span class="tag ${m[0]}">${esc(m[1])}</span>`; };

  // =====================================================================
  // Amenities
  // =====================================================================
  PAGES.amenities = async () => {
    const list = await M.amenities();
    const open = list.filter(a => a.active);
    if (!X.amenity || !list.some(a => a.id === X.amenity)) X.amenity = open[0] ? open[0].id : null;
    const today = istToday();
    if (!X.date || X.date < today) X.date = today;
    const [sl, mine] = await Promise.all([X.amenity ? M.slots(X.amenity, X.date).catch(() => null) : null, M.bookings()]);
    const picker = open.length ? `<div class="md-chips" role="group" aria-label="Choose an amenity">${open.map(a => `<button type="button" class="btn ${a.id === X.amenity ? 'btn-primary' : 'btn-secondary'}" data-act="mdam" data-id="${a.id}" aria-pressed="${a.id === X.amenity}">${ic('calendar-check')}${esc(a.name)}</button>`).join('')}</div>` : '';
    const days = Array.from({ length: 7 }, (_, i) => addDays(today, i));
    const dayBar = `<div class="md-chips" role="group" aria-label="Choose a day">${days.map(d => `<button type="button" class="btn btn-sm ${d === X.date ? 'btn-primary' : 'btn-ghost'}" data-act="mdday" data-d="${d}" aria-pressed="${d === X.date}">${esc(d === today ? 'Today' : new Date(d + 'T00:00:00').toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric' }))}</button>`).join('')}
      <input class="input md-date" type="date" id="mddate" value="${esc(X.date)}" min="${today}" max="${addDays(today, 30)}" aria-label="Pick another date"></div>`;
    const a = sl && sl.amenity;
    const slotBtn = s => {
      const cls = s.status === 'mine' ? 'md-slot mine' : s.status === 'taken' ? 'md-slot taken' : s.past ? 'md-slot past' : 'md-slot free';
      const label = s.status === 'mine' ? 'Your booking' : s.status === 'taken' ? (isAdmin() && s.flat ? `Flat ${s.flat}` : 'Booked') : s.past ? 'Past' : isRes() ? 'Book' : 'Free';
      const act = s.status === 'free' && !s.past && isRes() ? `data-act="mdbook" data-s="${s.start}"` : s.booking_id && (s.status === 'mine' || isAdmin()) && !s.past ? `data-act="mdcancel" data-id="${s.booking_id}"` : 'disabled';
      return `<button type="button" class="${cls}" ${act} aria-label="${esc(s.start)} to ${esc(s.end)}: ${esc(label)}"><b>${esc(s.start)}–${esc(s.end)}</b><span>${esc(label)}</span></button>`;
    };
    const grid = a ? `<section class="form-card col"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><h2 style="margin:0">${esc(a.name)} · ${esc(dateLong(X.date))}</h2>
        <span class="muted">${esc(a.open_from)}–${esc(a.open_to)}${a.capacity ? ` · up to ${esc(a.capacity)} people` : ''}</span></div>
        ${a.description ? `<p class="muted" style="margin:0">${esc(a.description)}</p>` : ''}
        <div class="md-slots">${sl.slots.map(slotBtn).join('')}</div>
        ${isRes() ? '<p class="muted sm" style="margin:0">Up to 2 upcoming bookings per amenity for your flat. Tap your booking to cancel it.</p>' : '<p class="muted sm" style="margin:0">Tap a booked slot to cancel it; the flat is told.</p>'}</section>`
      : `<p class="callout" style="margin:0">${isAdmin() ? 'No amenities yet. Add the clubhouse, gym or hall below.' : 'No amenities are open for booking yet.'}</p>`;
    const myRows = mine.map(b => `<tr><td><b>${esc(b.amenity)}</b></td><td>${esc(dateLong(b.date))}</td><td>${esc(b.start)}–${esc(b.end_at)}</td>${isAdmin() ? `<td>${esc(b.flat)}</td><td>${esc(b.booked_by)}</td>` : ''}<td><button class="btn btn-ghost btn-sm" data-act="mdcancel" data-id="${b.id}">${ic('x-circle')}Cancel</button></td></tr>`);
    const manage = isAdmin() ? `<section class="form-card col"><h2 style="margin:0">Manage amenities</h2>
        ${table(['Amenity', 'Hours', 'Slot', 'Capacity', 'Status', ''], list.map(x => `<tr><td><b>${esc(x.name)}</b></td><td>${esc(x.open_from)}–${esc(x.open_to)}</td><td>${esc(x.slot_minutes)} min</td><td>${esc(x.capacity || '–')}</td>
          <td>${x.active ? '<span class="tag tag-accent">Open</span>' : '<span class="tag tag-neutral">Closed</span>'}</td><td><button class="btn btn-ghost btn-sm" data-act="mdamtoggle" data-id="${x.id}" data-on="${x.active ? 0 : 1}">${x.active ? 'Close for booking' : 'Open for booking'}</button></td></tr>`), 'No amenities yet.')}
        <form id="mdamnew" class="col" style="gap:var(--space-3)"><h3 style="margin:0">Add an amenity</h3>
          <div class="md-form">${field('mdan', 'Name', '<input class="input" id="mdan" name="name" maxlength="80" required placeholder="Clubhouse">')}
            ${field('mdaf', 'Opens', '<input class="input" id="mdaf" name="open_from" type="time" value="06:00" required>')}
            ${field('mdat', 'Closes', '<input class="input" id="mdat" name="open_to" type="time" value="22:00" required>')}
            ${field('mdas', 'Slot length', `<select class="input" id="mdas" name="slot_minutes">${[30, 60, 90, 120, 180, 240].map(m => `<option value="${m}" ${m === 60 ? 'selected' : ''}>${m} min</option>`).join('')}</select>`)}
            ${field('mdac', 'Capacity (optional)', '<input class="input" id="mdac" name="capacity" type="number" min="1" inputmode="numeric">')}</div>
          ${field('mdad', 'Description (optional)', '<input class="input" id="mdad" name="description" maxlength="300" placeholder="Ground floor, AC, 40 seats">')}
          ${errLine()}<div class="row"><button class="btn btn-primary">${ic('plus')}Add amenity</button></div></form></section>` : '';
    page(`<div class="rl md">${head('Amenities', isAdmin() ? `${open.length} open for booking · ${mine.length} upcoming bookings` : 'Book the clubhouse, gym and other shared spaces')}
      ${picker}${a ? dayBar : ''}${grid}
      <section class="col" style="gap:var(--space-2)"><h2>${isAdmin() ? 'Upcoming bookings' : 'Your flat\'s bookings'}</h2>
        ${table(isAdmin() ? ['Amenity', 'Date', 'Time', 'Flat', 'Booked by', ''] : ['Amenity', 'Date', 'Time', ''], myRows, 'No upcoming bookings.')}</section>${manage}</div>`);
  };
  ACT.mdam = el => { X.amenity = Number(el.dataset.id); render(); };
  ACT.mdday = el => { X.date = el.dataset.d; render(); };
  ACT.mdbook = async el => {
    try { await M.book({ amenity_id: X.amenity, date: X.date, start: el.dataset.s }); toast('Booked. It is on your flat\'s list.'); }
    catch (x) { toast(x.message, 'error'); }
    await render();
  };
  ACT.mdcancel = async el => {
    if (!sure(el, 'bk' + el.dataset.id, 'Tap again to cancel')) return;
    try { await M.cancelBooking(el.dataset.id); toast('Booking cancelled'); } catch (x) { toast(x.message, 'error'); }
    await render();
  };
  ACT.mdamtoggle = async el => { try { await M.patchAmenity(el.dataset.id, { active: el.dataset.on === '1' }); toast(el.dataset.on === '1' ? 'Open for booking' : 'Closed for booking'); } catch (x) { toast(x.message, 'error'); } await render(); };

  // =====================================================================
  // Maintenance dues (financial management)
  // =====================================================================
  PAGES.dues = async () => {
    const r = await M.dues(isAdmin() ? { status: X.dueStatus, period: X.duePeriod } : {});
    const d = r.dues, t = r.totals;
    if (isRes()) {
      const cards = d.map(b => `<article class="form-card md-bill"><div class="row" style="justify-content:space-between;gap:8px;flex-wrap:wrap"><span class="col" style="gap:2px"><span class="muted sm">${esc(b.period)} · due ${esc(dateLong(b.due_date))}</span><span class="list-title">${esc(b.title)}</span></span>${dueTag(b)}</div>
        <div class="md-amts"><span><span class="muted sm">Bill</span><b>${esc(rupees(b.amount))}</b></span><span><span class="muted sm">Paid</span><b>${esc(rupees(b.paid))}</b></span><span><span class="muted sm">Balance</span><b>${esc(rupees(b.balance))}</b></span></div></article>`);
      page(`<div class="rl md">${head('Maintenance dues', `Flat ${S.me.flat}`)}
        <div class="eg-grid md-stats">${stat('wallet', rupees(t.outstanding) || '₹0', 'Balance to pay', t.overdue ? `${t.overdue} overdue` : 'Nothing overdue')}${stat('check-circle', rupees(t.collected) || '₹0', 'Paid so far')}</div>
        <p class="callout" style="margin:0">${ic('currency-inr')} Pay at the society office or by UPI to the society account, then the committee records it here. Online payment is coming later.</p>
        ${d.length ? `<div class="rl-grid">${cards.join('')}</div>` : '<p class="muted">No bills for your flat yet.</p>'}</div>`);
      return;
    }
    const thisMonth = istToday().slice(0, 7);
    const rows = d.map(b => {
      const form = X.payFor === b.id ? `<tr class="md-inline"><td colspan="8"><form id="mdpay" class="md-form" data-id="${b.id}">
          ${field('mdpa', 'Amount received (₹)', `<input class="input" id="mdpa" name="amount" type="number" min="1" step="0.01" max="${b.balance}" value="${b.balance}" required>`)}
          ${field('mdpm', 'Method', `<select class="input" id="mdpm" name="method">${METHODS.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('')}</select>`)}
          ${field('mdpr', 'Reference (optional)', '<input class="input" id="mdpr" name="reference" maxlength="100" placeholder="UPI ref, cheque no.">')}
          ${field('mdpd', 'Paid on', `<input class="input" id="mdpd" name="paid_on" type="date" value="${istToday()}" max="${istToday()}">`)}
          <div class="row md-form-btns"><button class="btn btn-primary">${ic('check-circle')}Record payment</button><button type="button" class="btn btn-secondary" data-act="mdpayclose">Cancel</button></div></form>${errLine()}</td></tr>` : '';
      return `<tr><td><b>${esc(b.flat)}</b></td><td>${esc(b.period)}</td><td>${esc(b.title)}</td><td>${esc(rupees(b.amount))}</td><td>${esc(rupees(b.paid))}</td><td>${esc(rupees(b.balance))}</td><td>${dueTag(b)}</td>
        <td>${b.balance > 0 ? `<button class="btn btn-secondary btn-sm" data-act="mdpayopen" data-id="${b.id}" aria-expanded="${X.payFor === b.id}">${ic('currency-inr')}Record payment</button>` : ''}</td></tr>${form}`;
    });
    page(`<div class="rl md">${head('Maintenance dues', `${d.length} bills shown`)}
      <div class="eg-grid md-stats">${stat('receipt', rupees(t.billed) || '₹0', 'Billed')}${stat('check-circle', rupees(t.collected) || '₹0', 'Collected', t.billed ? `${Math.round((t.collected / t.billed) * 100)}% of billed` : '')}${stat('wallet', rupees(t.outstanding) || '₹0', 'Outstanding')}${stat('clock', t.overdue, 'Overdue bills')}</div>
      <form id="mdraise" class="form-card col"><h2 style="margin:0">Raise bills</h2>
        <div class="md-form">${field('mdrp', 'Month', `<input class="input" id="mdrp" name="period" type="month" value="${thisMonth}" required>`)}
          ${field('mdrt', 'Title', '<input class="input" id="mdrt" name="title" maxlength="100" value="Maintenance" required>')}
          ${field('mdra', 'Amount per flat (₹)', '<input class="input" id="mdra" name="amount" type="number" min="1" step="1" required inputmode="numeric">')}
          ${field('mdrd', 'Due date', `<input class="input" id="mdrd" name="due_date" type="date" value="${addDays(istToday(), 10)}" required>`)}
          ${field('mdrf', 'Flats', '<input class="input" id="mdrf" name="flats" placeholder="All flats" maxlength="400">', 'Leave empty for every flat with residents, or list flats: A-101, B-202')}</div>
        ${X.payFor == null ? errLine() : ''}<div class="row"><button class="btn btn-primary">${ic('receipt')}Raise bills</button><span class="muted sm">Each flat is billed once per month and title, and its residents are told.</span></div></form>
      <section class="col" style="gap:var(--space-2)"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Bills</h2>
        <div class="row" style="gap:8px">${field('mdfs', 'Status', `<select class="input" id="mdfs">${[['', 'All'], ['overdue', 'Overdue'], ['unpaid', 'Unpaid'], ['partial', 'Part paid'], ['paid', 'Paid']].map(([k, l]) => `<option value="${k}" ${X.dueStatus === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}
          ${field('mdfp', 'Month', `<input class="input" id="mdfp" type="month" value="${esc(X.duePeriod)}">`)}</div></div>
        ${table(['Flat', 'Month', 'Title', 'Bill', 'Paid', 'Balance', 'Status', ''], rows, 'No bills match.')}</section></div>`);
  };
  ACT.mdpayopen = el => { X.payFor = X.payFor === Number(el.dataset.id) ? null : Number(el.dataset.id); X.err = ''; render().then(() => { const i = $('#mdpa'); if (i) i.focus(); }); };
  ACT.mdpayclose = () => { X.payFor = null; render(); };

  // =====================================================================
  // Inventory
  // =====================================================================
  PAGES.inventory = async () => {
    const items = await M.inventory();
    const low = items.filter(i => i.low);
    const rows = items.map(i => {
      const open = X.moveFor === i.id;
      const form = open ? `<tr class="md-inline"><td colspan="7"><form id="mdmove" class="md-form" data-id="${i.id}">
          ${field('mdmd', isAdmin() ? 'Direction' : 'Taking out', isAdmin() ? '<select class="input" id="mdmd" name="dir"><option value="out">Out (used)</option><option value="in">In (bought)</option></select>' : '<input type="hidden" name="dir" value="out"><span class="muted">Stock out</span>')}
          ${field('mdmq', `How many (${esc(i.unit)})`, '<input class="input" id="mdmq" name="qty" type="number" min="1" step="1" required inputmode="numeric">')}
          ${field('mdmr', 'For request # (optional)', '<input class="input" id="mdmr" name="request_id" type="number" min="1" inputmode="numeric">')}
          ${field('mdmn', 'Note (optional)', '<input class="input" id="mdmn" name="note" maxlength="200" placeholder="Corridor B lights">')}
          <div class="row md-form-btns"><button class="btn btn-primary">${ic('check-circle')}Save</button><button type="button" class="btn btn-secondary" data-act="mdmoveclose">Cancel</button></div></form>${errLine()}</td></tr>` : '';
      const hist = X.showMoves === i.id ? `<tr class="md-inline"><td colspan="7">${X.moves[i.id] ? (X.moves[i.id].length ? `<ul class="md-moves">${X.moves[i.id].map(m => `<li><b>${m.change > 0 ? '+' : ''}${esc(m.change)}</b> ${esc(i.unit)} · ${esc(m.by_name)} · ${esc(stamp(m.created_at))}${m.request_id ? ` · request #${esc(m.request_id)}` : ''}${m.note ? ` · ${esc(m.note)}` : ''}</li>`).join('')}</ul>` : '<p class="muted">No stock movements yet.</p>') : '<p class="muted">Loading…</p>'}</td></tr>` : '';
      return `<tr><td><b>${esc(i.name)}</b></td><td>${esc(cap(i.category))}</td><td><b>${esc(i.quantity)}</b> ${esc(i.unit)}</td><td>${esc(i.min_qty)}</td><td>${esc(i.location || '–')}</td>
        <td>${i.low ? '<span class="tag tag-accent-2">Reorder</span>' : '<span class="tag tag-outline">In stock</span>'}</td>
        <td class="md-acts"><button class="btn btn-secondary btn-sm" data-act="mdmoveopen" data-id="${i.id}" aria-expanded="${open}">${ic(isAdmin() ? 'plus' : 'minus')}${isAdmin() ? 'Stock in/out' : 'Take out'}</button>
          <button class="btn btn-ghost btn-sm" data-act="mdmoves" data-id="${i.id}" aria-expanded="${X.showMoves === i.id}">${ic('clock')}History</button></td></tr>${form}${hist}`;
    });
    const add = isAdmin() ? `<form id="mditem" class="form-card col"><h2 style="margin:0">Add an item</h2>
        <div class="md-form">${field('mdin', 'Item', '<input class="input" id="mdin" name="name" maxlength="80" required placeholder="LED tube 20W">')}
          ${field('mdic', 'Category', `<select class="input" id="mdic" name="category">${INV_CATS.map(k => `<option value="${k}">${esc(cap(k))}</option>`).join('')}</select>`)}
          ${field('mdiq', 'Quantity now', '<input class="input" id="mdiq" name="quantity" type="number" min="0" step="1" value="0" inputmode="numeric">')}
          ${field('mdiu', 'Unit', '<input class="input" id="mdiu" name="unit" maxlength="20" value="pcs">')}
          ${field('mdim', 'Reorder level', '<input class="input" id="mdim" name="min_qty" type="number" min="0" step="1" value="0" inputmode="numeric">', 'Alert the committee at or below this')}
          ${field('mdil', 'Location (optional)', '<input class="input" id="mdil" name="location" maxlength="80" placeholder="Store room">')}</div>
        ${X.moveFor == null ? errLine() : ''}<div class="row"><button class="btn btn-primary">${ic('package')}Add item</button></div></form>` : '';
    page(`<div class="rl md">${head('Inventory', isAdmin() ? 'Spare parts, cleaning supplies and society equipment' : 'Take out what you use for a job; the committee is told when stock runs low')}
      <div class="eg-grid md-stats">${stat('package', items.length, 'Items')}${stat('warning-circle', low.length, 'To reorder', low.slice(0, 2).map(i => i.name).join(', '))}</div>
      ${table(['Item', 'Category', 'In stock', 'Reorder at', 'Location', 'Status', ''], rows, isAdmin() ? 'No items yet. Add the first one below.' : 'No items yet.')}${add}</div>`);
    if (X.showMoves && !X.moves[X.showMoves]) loadMoves(X.showMoves);
  };
  async function loadMoves(id) {
    try { X.moves[id] = await M.moves(id); } catch (x) { X.moves[id] = []; toast(x.message, 'error'); }
    if (S.page === 'inventory' && X.showMoves === id) render();
  }
  ACT.mdmoveopen = el => { const id = Number(el.dataset.id); X.moveFor = X.moveFor === id ? null : id; X.err = ''; render().then(() => { const i = $('#mdmq'); if (i) i.focus(); }); };
  ACT.mdmoveclose = () => { X.moveFor = null; render(); };
  ACT.mdmoves = el => { const id = Number(el.dataset.id); X.showMoves = X.showMoves === id ? null : id; if (X.showMoves) delete X.moves[id]; render(); };

  // =====================================================================
  // Waste
  // =====================================================================
  PAGES.waste = async () => {
    const team = isAdmin() || isStaff();
    const [sched, logs] = await Promise.all([M.schedule(), team ? M.wasteLogs(X.days) : null]);
    const todayWd = (new Date(istToday() + 'T00:00:00Z').getUTCDay() + 6) % 7;
    const week = WEEKDAYS.map((name, wd) => {
      const items = sched.filter(s => s.weekday === wd);
      return `<div class="md-day ${wd === todayWd ? 'today' : ''}"><span class="md-day-h">${esc(name.slice(0, 3))}${wd === todayWd ? ' · today' : ''}</span>${items.map(s => `<span class="md-pick">${ic(wasteIcon(s.kind))}<span><b>${esc(wasteLabel(s.kind))}</b><span class="muted sm">${esc(s.time)}${s.note ? ' · ' + esc(s.note) : ''}</span></span>${isAdmin() ? `<button class="btn btn-ghost btn-sm md-x" data-act="mdschdel" data-id="${s.id}" aria-label="Remove ${esc(wasteLabel(s.kind))} on ${esc(name)}">${ic('x-circle')}</button>` : ''}</span>`).join('') || '<span class="muted sm">No pickup</span>'}</div>`;
    }).join('');
    const kindOpts = WASTE.map(([k, l]) => `<option value="${k}">${esc(l)}</option>`).join('');
    const addSched = isAdmin() ? `<form id="mdsched" class="md-form"><h3 style="margin:0;grid-column:1/-1">Add a pickup</h3>
        ${field('mdsw', 'Day', `<select class="input" id="mdsw" name="weekday">${WEEKDAYS.map((n, i) => `<option value="${i}">${n}</option>`).join('')}</select>`)}
        ${field('mdsk', 'Waste', `<select class="input" id="mdsk" name="kind">${kindOpts}</select>`)}
        ${field('mdst', 'Time', '<input class="input" id="mdst" name="time" type="time" value="07:00" required>')}
        ${field('mdsn', 'Note (optional)', '<input class="input" id="mdsn" name="note" maxlength="200" placeholder="Keep bins at the gate">')}
        <div class="row md-form-btns"><button class="btn btn-primary">${ic('plus')}Add pickup</button></div></form>` : '';
    const missed = isRes() ? `<form id="mdmissed" class="form-card col"><h2 style="margin:0">Pickup missed?</h2>
        <div class="md-form">${field('mdxk', 'Which waste', `<select class="input" id="mdxk" name="kind">${kindOpts}</select>`)}
          ${field('mdxn', 'Details (optional)', '<input class="input" id="mdxn" name="note" maxlength="300" placeholder="Bin outside my door is still full">')}</div>
        ${errLine()}<div class="row"><button class="btn btn-primary">${ic('truck')}Report missed pickup</button><span class="muted sm">It becomes a housekeeping request you can follow.</span></div></form>` : '';
    let team_ = '';
    if (team) {
      const t = logs.totals;
      team_ = `<div class="eg-grid md-stats">${stat('trash', `${t.total} kg`, `Collected, last ${logs.days} days`)}${stat('recycle', t.segregated_pct == null ? '–' : `${t.segregated_pct}%`, 'Segregated', 'Everything except mixed dry')}${stat('leaf', `${t.wet} kg`, 'Wet (compost)')}${stat('archive', `${t.recyclable + t['e-waste']} kg`, 'Recyclable and e-waste')}</div>
        <form id="mdlog" class="form-card col"><h2 style="margin:0">Log a collection</h2>
          <div class="md-form">${field('mdld', 'Date', `<input class="input" id="mdld" name="date" type="date" value="${istToday()}" max="${istToday()}" required>`)}
            ${field('mdlk', 'Waste', `<select class="input" id="mdlk" name="kind">${kindOpts}</select>`)}
            ${field('mdlw', 'Weight (kg)', '<input class="input" id="mdlw" name="weight_kg" type="number" min="0.1" step="0.1" required inputmode="decimal">')}
            ${field('mdln', 'Note (optional)', '<input class="input" id="mdln" name="note" maxlength="200">')}</div>
          ${errLine()}<div class="row"><button class="btn btn-primary">${ic('check-circle')}Save</button></div></form>
        <section class="col" style="gap:var(--space-2)"><div class="row" style="justify-content:space-between;flex-wrap:wrap;gap:8px"><h2 style="margin:0">Collections</h2>
          ${field('mdwd', 'Period', `<select class="input" id="mdwd">${[['7', 'Last 7 days'], ['30', 'Last 30 days'], ['90', 'Last 90 days']].map(([k, l]) => `<option value="${k}" ${X.days === k ? 'selected' : ''}>${l}</option>`).join('')}</select>`)}</div>
          ${table(['Date', 'Waste', 'Weight', 'By', 'Note'], logs.logs.map(l => `<tr><td>${esc(dateLong(l.date))}</td><td>${esc(wasteLabel(l.kind))}</td><td>${esc(l.weight_kg)} kg</td><td>${esc(l.by_name)}</td><td>${esc(l.note || '')}</td></tr>`), 'Nothing logged in this period.')}</section>`;
    }
    page(`<div class="rl md">${head(isRes() ? 'Waste collection' : 'Waste', 'Separate wet, dry and recyclable waste; keep bins out before the pickup time')}
      <section class="form-card col"><h2 style="margin:0">Weekly pickups</h2><div class="md-week">${week}</div>${addSched}</section>${missed}${team_}</div>`);
  };
  ACT.mdschdel = async el => { if (!sure(el, 'ws' + el.dataset.id, 'Remove?')) return; try { await M.removeSchedule(el.dataset.id); toast('Pickup removed'); } catch (x) { toast(x.message, 'error'); } await render(); };

  // =====================================================================
  // Form submits and filters
  // =====================================================================
  document.addEventListener('change', async e => {
    const t = e.target;
    try {
      if (t.id === 'mddate') { if (t.value) { X.date = t.value; await render(); } }
      else if (t.id === 'mdfs') { X.dueStatus = t.value; await render(); }
      else if (t.id === 'mdfp') { X.duePeriod = t.value; await render(); }
      else if (t.id === 'mdwd') { X.days = t.value; await render(); }
    } catch (x) { toast(x.message, 'error'); }
  });
  document.addEventListener('submit', async e => {
    const f = e.target; if (!/^md/.test(f.id || '')) return;
    e.preventDefault(); e.stopPropagation(); setErr(''); X.err = '';
    const d = Object.fromEntries(new FormData(f));
    const btn = f.querySelector('button:not([type=button])'); if (btn) btn.disabled = true;
    try {
      if (f.id === 'mdamnew') {
        await M.addAmenity({ name: d.name.trim(), open_from: d.open_from, open_to: d.open_to, slot_minutes: Number(d.slot_minutes), capacity: d.capacity ? Number(d.capacity) : null, description: (d.description || '').trim() });
        toast(`${d.name.trim()} added and open for booking`); X.amenity = null; await render();
      } else if (f.id === 'mdraise') {
        const flats = (d.flats || '').split(/[,\s]+/).map(x => x.trim()).filter(Boolean);
        const r = await M.raiseDues({ period: d.period, title: d.title.trim(), amount: Number(d.amount), due_date: d.due_date, flats: flats.length ? flats : 'all' });
        toast(`${r.created} bill${r.created === 1 ? '' : 's'} raised${r.skipped ? `, ${r.skipped} flat${r.skipped === 1 ? ' was' : 's were'} already billed` : ''}`); await render();
      } else if (f.id === 'mdpay') {
        const r = await M.pay(f.dataset.id, { amount: Number(d.amount), method: d.method, reference: (d.reference || '').trim(), paid_on: d.paid_on });
        X.payFor = null; toast(r.balance > 0 ? `Payment recorded. Balance ${rupees(r.balance)}.` : 'Paid in full. The flat has been told.'); await render();
      } else if (f.id === 'mditem') {
        await M.addItem({ name: d.name.trim(), category: d.category, quantity: Number(d.quantity || 0), unit: (d.unit || 'pcs').trim(), min_qty: Number(d.min_qty || 0), location: (d.location || '').trim() });
        toast('Item added'); await render();
      } else if (f.id === 'mdmove') {
        const n = Number(d.qty), change = d.dir === 'in' ? n : -n;
        const body = { change, note: (d.note || '').trim() }; if (d.request_id) body.request_id = Number(d.request_id);
        const it = await M.move(f.dataset.id, body); X.moveFor = null; delete X.moves[Number(f.dataset.id)];
        toast(`${it.name}: ${it.quantity} ${it.unit} left${it.low ? '. Time to reorder.' : ''}`); await render();
      } else if (f.id === 'mdsched') {
        await M.addSchedule({ weekday: Number(d.weekday), kind: d.kind, time: d.time, note: (d.note || '').trim() }); toast('Pickup added to the schedule'); await render();
      } else if (f.id === 'mdlog') {
        await M.logWaste({ date: d.date, kind: d.kind, weight_kg: Number(d.weight_kg), note: (d.note || '').trim() }); toast('Collection saved'); await render();
      } else if (f.id === 'mdmissed') {
        const r = await M.missed({ kind: d.kind, note: (d.note || '').trim() }); toast(`Reported as request #${r.id}. The committee has been told.`); go('requests', r.id);
      }
    } catch (x) { X.err = x.message; setErr(x.message); toast(x.message, 'error'); }
    finally { if (btn && btn.isConnected) btn.disabled = false; }
  }, true);
})();
