// Gate desk (guards; the committee can open it too): tap an NFC card to check a person in or out, see who is
// inside, and register cards. Scanning opens a full-screen scanner. Registering: scan the card first, then choose who
// carries it from a dropdown. Cards are read with Web NFC (Chrome on Android, HTTPS or localhost) or a USB reader that
// types the card number and presses Enter. Contract: docs/nfc-api.md. No inline handlers (CSP 'self').
(() => {
  const W = window.HPWeb; if (!W) return;
  const { esc, ic, toast, stamp } = HP;
  const { S, PAGES, ACT, page, render } = W;
  const $ = (s, r = document) => r.querySelector(s);
  // scan: null (no scanner open) | 'tap' (check in/out) | 'register'. card: the number read while registering.
  const N = { scan: null, last: null, card: '', who: '', people: [], reader: null, scanning: false, err: '', nfcErr: '' };
  const hasNfc = () => 'NDEFReader' in window;
  const api = (m, u, b) => HP.api(m, u, b);
  const fmt = at => stamp(at);
  const norm = s => String(s || '').toUpperCase().replace(/[\s:.\-]/g, ''); // same as normSerial in nfc.js
  const sub = p => p.flat ? 'Flat ' + p.flat : p.role === 'staff' ? (p.department === 'cleaning' ? 'Cleaning staff' : 'Maintenance staff') : p.role === 'shop' ? 'Tuck shop' : p.role === 'laundry' ? 'Laundry' : p.role;
  const who = p => `${esc(p.name)}<span class="muted sm"> · ${esc(sub(p))}</span>`;
  // Why the phone cannot listen, in words the guard can act on (Web NFC needs Chrome on Android and a secure page).
  const nfcWhy = () => !window.isSecureContext
    ? `NFC needs a secure page, and this one is http://${location.host}. Open the live site (https), or on the phone run adb reverse tcp:3000 tcp:3000 and open http://localhost:3000/?web.`
    : !hasNfc() ? (isWin() ? 'A browser on a PC cannot read NFC cards (Web NFC is only in Chrome on Android). Install the Sahyadri Card Reader on this PC: it reads the laptop NFC or a USB reader and types the card number here.' : 'This browser cannot read NFC cards: Web NFC works in Chrome on Android. Use a USB reader that types the card number, or type it below.') : '';
  const isWin = () => /Windows/.test(navigator.userAgent);
  // Windows PCs: the tray app in windows-reader/ (served from public/downloads) types the card number into #nfcin.
  const winApp = () => !hasNfc() && isWin() ? `<a class="btn btn-secondary" href="/downloads/SahyadriCardReader.zip" download>${ic('download-simple')}Get the Windows card reader</a>` : '';
  // Keep the page still while a scanner is open or the guard is typing a card number.
  W.noRedraw = (prev => () => (prev && prev()) || (S.page === 'cards' && (!!N.scan || document.activeElement === $('#nfcin'))))(W.noRedraw);

  async function handleSerial(raw) {
    if (S.page !== 'cards') return; // the NFC reader keeps listening after the guard leaves the gate desk
    const serial = norm(raw);
    N.err = '';
    if (N.scan === 'register') { N.card = serial; N.who = ''; return render(); } // step 2: choose the person
    try { N.last = await api('POST', '/api/gate/tap', { serial }); }
    catch (x) { N.last = { error: x.message, serial, unknown: x.status === 404 }; }
    render();
  }
  async function startNfc() {
    N.nfcErr = '';
    if (N.scanning || nfcWhy()) return;
    try {
      const r = new NDEFReader(); // eslint-disable-line no-undef
      await r.scan();
      N.scanning = true; N.reader = r;
      r.onreading = e => handleSerial(e.serialNumber || '');
      r.onreadingerror = () => { N.nfcErr = 'The phone saw a card but could not read it. Hold it flat against the back of the phone for a second. Some cards (MIFARE Classic) cannot be read by Chrome: use a USB reader or type the number.'; render(); };
    } catch (x) { N.nfcErr = x && x.name === 'NotAllowedError' ? 'NFC permission was refused. Allow NFC for this site in Chrome (site settings), then try again.' : (x && x.message) || 'Could not start NFC.'; }
    render();
  }
  async function openScan(kind, card = '') {
    Object.assign(N, { scan: kind, card: norm(card), who: '', err: '', last: kind === 'tap' ? N.last : null });
    if (kind === 'register') { try { N.people = await api('GET', '/api/gate/people'); } catch (x) { N.people = []; N.err = x.message; } }
    startNfc(); // the click that opened the scanner is the user gesture Web NFC needs
    render();
  }

  const scanner = () => {
    if (!N.scan) return '';
    const status = nfcWhy() || N.nfcErr || (N.scanning ? 'Listening… hold the card to the back of the phone.' : 'Starting NFC…');
    const listen = `<span class="nfc-ring big ${N.scanning ? 'on' : ''}">${ic('contactless-payment')}</span>`;
    const input = `<form id="nfcform" class="row nfc-type"><label class="sr" for="nfcin">Card number</label><input class="input" id="nfcin" name="serial" autocomplete="off" placeholder="Or type the card number (a USB reader types it here)"><button class="btn btn-secondary">${ic('arrow-right')}Go</button></form>`;
    const L = N.last;
    let body;
    if (N.scan === 'register' && N.card) {
      body = `<span class="nfc-ring big done">${ic('identification-card')}</span><h2>Card detected</h2><p class="nfc-serial">${esc(N.card)}</p>
        <div class="field nfc-who"><label for="nfcwho">Who carries this card?</label>
          <select class="input" id="nfcwho"><option value="">Choose a person</option>${N.people.map(p => `<option value="${p.id}" ${String(p.id) === N.who ? 'selected' : ''}>${esc(p.name)} · ${esc(sub(p))}</option>`).join('')}</select>
          ${N.people.length ? '' : '<p class="muted sm">Nobody can get a card yet: residents and staff must be approved first.</p>'}</div>
        <p class="err" role="alert">${esc(N.err)}</p>
        <div class="row nfc-actions"><button type="button" class="btn btn-primary btn-lg" data-act="nfcsave" ${N.who ? '' : 'disabled'}>${ic('check-circle')}Register card</button>
          <button type="button" class="btn btn-secondary" data-act="nfcrescan">${ic('arrow-counter-clockwise')}Scan a different card</button></div>`;
    } else if (N.scan === 'register') {
      body = `${listen}<h2>Tap the new card</h2><p class="muted">${esc(status)}</p>${winApp()}${input}<p class="err" role="alert">${esc(N.err)}</p>`;
    } else {
      const res = !L ? '' : L.error ? `<div class="nfc-res bad">${ic('x-circle')}<b>${esc(L.error)}</b><span class="muted">Card ${esc(L.serial || '')}</span>${L.unknown ? `<button type="button" class="btn btn-primary" data-act="nfcregcard">${ic('plus-circle')}Register this card</button>` : ''}</div>`
        : `<div class="nfc-res ${L.direction}">${ic(L.direction === 'in' ? 'sign-in' : 'sign-out')}<b>${L.direction === 'in' ? 'Checked in' : 'Checked out'}: ${esc(L.person.name)}</b><span>${esc(fmt(L.at))}${L.shift ? ` · shift ${esc(L.shift)}` : ''}</span></div>`;
      body = `${listen}<h2>Tap a card</h2><p class="muted">${esc(status)}</p>${winApp()}${res}${input}`;
    }
    return `<div class="nfc-scan" role="dialog" aria-modal="true" aria-label="${N.scan === 'register' ? 'Register a card' : 'Scan cards'}">
      <button type="button" class="btn btn-secondary nfc-close" data-act="nfcclose" aria-label="Close the scanner">${ic('x')}Close</button>
      <div class="nfc-scan-body">${body}</div></div>`;
  };

  PAGES.cards = async () => {
    const [pr, cards] = await Promise.all([api('GET', '/api/gate/presence'), api('GET', '/api/gate/cards')]);
    const L = N.last;
    const result = !L ? `<div class="nfc-idle"><span class="nfc-ring">${ic('contactless-payment')}</span><b>Tap a card</b><span class="muted">${hasNfc() && window.isSecureContext ? 'Open the scanner, then hold a card to the phone.' : 'A USB reader or the Windows card reader types the card number below.'}</span>${winApp()}</div>`
      : L.error ? `<div class="nfc-res bad">${ic('x-circle')}<b>${esc(L.error)}</b><span class="muted">Card ${esc(L.serial || '')}</span>${L.unknown ? `<button type="button" class="btn btn-primary" data-act="nfcregcard">${ic('plus-circle')}Register this card</button>` : ''}</div>`
      : `<div class="nfc-res ${L.direction}">${ic(L.direction === 'in' ? 'sign-in' : 'sign-out')}<b>${L.direction === 'in' ? 'Checked in' : 'Checked out'}: ${esc(L.person.name)}</b><span>${esc(fmt(L.at))}${L.shift ? ` · shift ${esc(L.shift)}` : ''}</span></div>`;
    page(`<div class="rl">${HP.hero({ theme: 'gate', name: S.me.name, kicker: `Gate desk · ${HP.todayLabel()}`, line: `<b>${pr.inside.length}</b> people inside · ${pr.cards} cards registered`, actions: [] })}
      <div class="split-eq" style="align-items:start">
        <section class="form-card col nfc-pad">${result}
          <div class="row" style="gap:10px;flex-wrap:wrap"><button type="button" class="btn btn-primary btn-lg" data-act="nfcscan">${ic('contactless-payment')}Scan cards</button>
            <button type="button" class="btn btn-secondary btn-lg" data-act="nfcreg">${ic('plus-circle')}Register a card</button></div>
          ${N.scan ? '' : `<form id="nfcform" class="row" style="gap:8px;flex-wrap:nowrap"><label class="sr" for="nfcin">Card number</label><input class="input" id="nfcin" name="serial" autocomplete="off" placeholder="Card number (USB reader types it here)"><button class="btn btn-secondary">${ic('arrow-right')}Go</button></form>`}</section>
        <section class="col" style="gap:var(--space-2)"><h2>Inside now</h2>${pr.inside.map(p => `<div class="list-row"><span class="tile">${ic('user')}</span><span style="flex:1;min-width:0">${who(p)}</span><span class="muted sm" style="white-space:nowrap;flex-shrink:0">since ${esc(fmt(p.at))}</span></div>`).join('') || '<p class="muted">Nobody checked in.</p>'}</section></div>
      <section class="col" style="gap:var(--space-2)"><h2>Latest taps</h2>${pr.recent.slice(0, 12).map(t => `<div class="list-row"><span class="tile">${ic(t.direction === 'in' ? 'sign-in' : 'sign-out')}</span><span style="flex:1">${who(t)}</span><span class="tag ${t.direction === 'in' ? 'tag-accent' : 'tag-neutral'}">${t.direction === 'in' ? 'In' : 'Out'}</span><span class="muted sm">${esc(fmt(t.at))}</span></div>`).join('') || '<p class="muted">No taps yet.</p>'}</section>
      <section class="col" style="gap:var(--space-2)"><h2>Registered cards</h2>${cards.filter(c => c.active).map(c => `<div class="list-row"><span class="tile">${ic('identification-card')}</span><span style="flex:1">${who(c)}<span class="muted xs"> · ${esc(c.serial)}</span></span>${HP.kebab('Card of ' + c.name, [{ label: 'Deactivate card', icon: 'prohibit', act: 'nfcoff', data: { id: c.id }, danger: true }])}</div>`).join('') || '<p class="muted">No cards registered yet.</p>'}</section></div>
      ${scanner()}`);
    // Focus: the dropdown once a card is read; otherwise the card box, which takes a USB reader's typing.
    const sel = $('#nfcwho'), box = $('#nfcin');
    if (sel) sel.focus(); else if (box) box.focus();
  };

  ACT.nfcscan = () => openScan('tap');
  ACT.nfcreg = () => openScan('register');
  ACT.nfcregcard = () => openScan('register', N.last && N.last.serial);
  ACT.nfcrescan = () => { N.card = ''; N.who = ''; N.err = ''; render(); };
  ACT.nfcclose = () => { Object.assign(N, { scan: null, card: '', who: '', err: '' }); render(); };
  ACT.nfcsave = async () => {
    const p = N.people.find(x => String(x.id) === N.who);
    if (!p || !N.card) return;
    try {
      await api('POST', '/api/gate/cards', { serial: N.card, user_id: p.id });
      toast(`Card registered for ${p.name}`);
      Object.assign(N, { scan: null, card: '', who: '', err: '', last: null });
    } catch (x) { N.err = x.message; }
    render();
  };
  ACT.nfcoff = async el => { try { await api('DELETE', `/api/gate/cards/${el.dataset.id}`); toast('Card deactivated'); } catch (x) { toast(x.message, 'error'); } render(); };
  document.addEventListener('change', e => {
    if (e.target.id !== 'nfcwho') return;
    N.who = e.target.value;
    const b = $('[data-act="nfcsave"]'); if (b) b.disabled = !N.who; // no redraw: keep the dropdown as it is
  });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && N.scan && S.page === 'cards') ACT.nfcclose(); });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'nfcform') return;
    e.preventDefault(); const v = e.target.serial.value.trim(); e.target.serial.value = '';
    if (v) handleSerial(v);
  });
})();
