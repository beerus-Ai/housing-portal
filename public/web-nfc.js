// Gate desk (guards; the committee can open it too): tap an NFC card to check a person in or out, see who is
// inside, and register cards. Cards are read with Web NFC (Chrome on Android, HTTPS) or a USB reader that types the
// card number into the box and presses Enter. Contract: docs/nfc-api.md. No inline handlers (CSP 'self').
(() => {
  const W = window.HPWeb; if (!W) return;
  const { esc, ic, toast, stamp, RAPI } = HP;
  const { S, PAGES, ACT, page, render } = W;
  const $ = (s, r = document) => r.querySelector(s);
  // pending: a card read in register mode before the person was chosen (tap first or choose first, either order works).
  const N = { mode: 'tap', last: null, person: null, people: [], q: '', reader: null, scanning: false, err: '', pending: '' };
  const hasNfc = () => 'NDEFReader' in window;
  const api = (m, u, b) => HP.api(m, u, b);
  const fmt = at => stamp(at);
  const who = p => `${esc(p.name)}<span class="muted sm"> · ${esc(p.flat ? 'Flat ' + p.flat : p.role === 'staff' ? (p.department === 'cleaning' ? 'Cleaning staff' : 'Maintenance staff') : p.role === 'shop' ? 'Tuck shop' : p.role === 'laundry' ? 'Laundry' : p.role)}</span>`;
  // Keep the page still while the guard is typing or registering.
  W.noRedraw = (prev => () => (prev && prev()) || (S.page === 'cards' && (N.mode === 'register' || document.activeElement === $('#nfcin'))))(W.noRedraw);

  async function register(serial) {
    try {
      await api('POST', '/api/gate/cards', { serial, user_id: N.person.id });
      toast(`Card registered for ${N.person.name}`);
      Object.assign(N, { person: null, pending: '', q: '', people: [], mode: 'tap', last: null });
    } catch (x) { N.err = x.message; N.pending = ''; }
    render();
  }
  async function handleSerial(serial) {
    if (S.page !== 'cards') return; // the NFC reader keeps listening after the guard leaves the gate desk
    N.err = '';
    if (N.mode === 'register') {
      if (!N.person) { N.pending = serial; return render(); } // keep the card; register it as soon as a person is chosen
      return register(serial);
    }
    try { N.last = await api('POST', '/api/gate/tap', { serial }); }
    catch (x) { N.last = { error: x.message, serial, unknown: x.status === 404 || /Unknown card/.test(x.message) }; }
    render();
  }
  async function startNfc() {
    if (!hasNfc()) return toast('This browser cannot read NFC. Use Chrome on an Android phone, or a USB card reader.', 'error');
    try {
      const r = new NDEFReader(); // eslint-disable-line no-undef
      await r.scan();
      N.scanning = true; N.reader = r;
      r.onreading = e => handleSerial(e.serialNumber || '');
      r.onreadingerror = () => toast('Could not read that card. Hold it still and try again.', 'error');
      render();
    } catch (x) { toast(x.message || 'NFC permission was not given', 'error'); }
  }

  PAGES.cards = async () => {
    const [pr, cards] = await Promise.all([api('GET', '/api/gate/presence'), api('GET', '/api/gate/cards')]);
    const L = N.last;
    const result = !L ? `<div class="nfc-idle"><span class="nfc-ring">${ic('contactless-payment')}</span><b>${N.mode === 'register' ? 'Tap the new card' : 'Tap a card'}</b><span class="muted">${N.scanning ? 'Listening for NFC cards…' : hasNfc() ? 'Start NFC, then hold a card to the phone.' : 'Or type the card number below.'}</span></div>`
      : L.error ? `<div class="nfc-res bad">${ic('x-circle')}<b>${esc(L.error)}</b><span class="muted">Card ${esc(L.serial || '')}</span>${L.unknown ? `<button type="button" class="btn btn-primary" data-act="nfcregcard">${ic('plus-circle')}Register this card</button>` : ''}</div>`
      : `<div class="nfc-res ${L.direction}">${ic(L.direction === 'in' ? 'sign-in' : 'sign-out')}<b>${L.direction === 'in' ? 'Checked in' : 'Checked out'}: ${esc(L.person.name)}</b><span>${esc(fmt(L.at))}${L.shift ? ` · shift ${esc(L.shift)}` : ''}</span></div>`;
    const reg = N.mode === 'register' ? `<section class="form-card col nfc-reg"><h3 style="margin:0">${ic('identification-card')} Register a card</h3>
        <div class="field"><label for="nfcq">Who carries this card?</label><input class="input" id="nfcq" type="search" autocomplete="off" placeholder="Search a name or flat" value="${esc(N.q)}"></div>
        <div class="col nfc-people">${N.people.map(p => `<button type="button" class="list-row ${N.person && N.person.id === p.id ? 'on' : ''}" data-act="nfcpick" data-id="${p.id}"><span class="tile">${ic(p.role === 'resident' ? 'house' : 'hard-hat')}</span><span>${who(p)}</span></button>`).join('') || (N.q ? '<p class="muted">Nobody matches.</p>' : '')}</div>
        ${N.pending ? `<p class="callout" style="margin:0">${ic('identification-card')} Card <b>${esc(N.pending)}</b> read. Now choose who carries it.</p>`
          : N.person ? `<p class="callout" style="margin:0">${ic('contactless-payment')} Now tap ${esc(N.person.name)}'s card (or type its number below).</p>`
          : `<p class="muted sm" style="margin:0">Tap the card first or choose the person first, in either order.</p>`}
        <div class="row"><button type="button" class="btn btn-secondary" data-act="nfcmode" data-m="tap">Cancel</button></div></section>` : '';
    page(`<div class="rl">${HP.hero({ theme: 'gate', name: S.me.name, kicker: `Gate desk · ${HP.todayLabel()}`, line: `<b>${pr.inside.length}</b> people inside · ${pr.cards} cards registered`, actions: [] })}
      <div class="split-eq" style="align-items:start">
        <section class="form-card col nfc-pad">${result}
          <div class="row" style="gap:10px;flex-wrap:wrap">${hasNfc() ? `<button type="button" class="btn btn-primary btn-lg" data-act="nfcstart" ${N.scanning ? 'disabled' : ''}>${ic('contactless-payment')}${N.scanning ? 'NFC is on' : 'Start NFC'}</button>` : ''}
            <button type="button" class="btn ${N.mode === 'register' ? 'btn-primary' : 'btn-secondary'}" data-act="nfcmode" data-m="${N.mode === 'register' ? 'tap' : 'register'}">${ic('plus-circle')}${N.mode === 'register' ? 'Registering…' : 'Register a card'}</button></div>
          <form id="nfcform" class="row" style="gap:8px;flex-wrap:nowrap"><label class="sr" for="nfcin">Card number</label><input class="input" id="nfcin" name="serial" autocomplete="off" placeholder="Card number (USB reader types it here)" autofocus><button class="btn btn-secondary">${ic('arrow-right')}Go</button></form>
          <p class="err" role="alert">${esc(N.err)}</p></section>
        ${reg || `<section class="col" style="gap:var(--space-2)"><h2>Inside now</h2>${pr.inside.map(p => `<div class="list-row"><span class="tile">${ic('user')}</span><span style="flex:1;min-width:0">${who(p)}</span><span class="muted sm" style="white-space:nowrap;flex-shrink:0">since ${esc(fmt(p.at))}</span></div>`).join('') || '<p class="muted">Nobody checked in.</p>'}</section>`}</div>
      <section class="col" style="gap:var(--space-2)"><h2>Latest taps</h2>${pr.recent.slice(0, 12).map(t => `<div class="list-row"><span class="tile">${ic(t.direction === 'in' ? 'sign-in' : 'sign-out')}</span><span style="flex:1">${who(t)}</span><span class="tag ${t.direction === 'in' ? 'tag-accent' : 'tag-neutral'}">${t.direction === 'in' ? 'In' : 'Out'}</span><span class="muted sm">${esc(fmt(t.at))}</span></div>`).join('') || '<p class="muted">No taps yet.</p>'}</section>
      <section class="col" style="gap:var(--space-2)"><h2>Registered cards</h2>${cards.filter(c => c.active).map(c => `<div class="list-row"><span class="tile">${ic('identification-card')}</span><span style="flex:1">${who(c)}<span class="muted xs"> · ${esc(c.serial)}</span></span>${HP.kebab('Card of ' + c.name, [{ label: 'Deactivate card', icon: 'prohibit', act: 'nfcoff', data: { id: c.id }, danger: true }])}</div>`).join('') || '<p class="muted">No cards registered yet.</p>'}</section></div>`);
    // Focus: the card box takes a USB reader's typing; keep the search box focused while the guard types a name.
    const qb = $('#nfcq');
    if (N.mode === 'register' && qb && searching && !N.person) { qb.focus(); qb.setSelectionRange(qb.value.length, qb.value.length); }
    else if (N.mode === 'register' && qb && !N.person) qb.focus();
    else { const i = $('#nfcin'); if (i) i.focus(); }
    searching = false;
  };
  let searching = false;

  ACT.nfcstart = () => startNfc();
  // Clicking "Register a card" is a user gesture, so NFC can start right away (Web NFC needs one).
  ACT.nfcmode = el => { Object.assign(N, { mode: el.dataset.m, person: null, pending: '', err: '', last: null }); if (N.mode === 'register' && hasNfc() && !N.scanning) startNfc(); render(); };
  ACT.nfcregcard = () => { const s = N.last && N.last.serial; Object.assign(N, { mode: 'register', person: null, pending: s || '', err: '', last: null }); render(); };
  ACT.nfcpick = el => { N.person = N.people.find(p => p.id === Number(el.dataset.id)) || null; N.err = ''; if (N.person && N.pending) return register(N.pending); render(); };
  ACT.nfcoff = async el => { try { await api('DELETE', `/api/gate/cards/${el.dataset.id}`); toast('Card deactivated'); } catch (x) { toast(x.message, 'error'); } render(); };
  let t = null;
  document.addEventListener('input', e => {
    if (e.target.id !== 'nfcq') return;
    N.q = e.target.value; clearTimeout(t);
    t = setTimeout(async () => { try { N.people = N.q.trim() ? await api('GET', '/api/gate/people?q=' + encodeURIComponent(N.q.trim())) : []; } catch { N.people = []; }
      const box = $('.nfc-people'); if (box) { searching = document.activeElement === $('#nfcq'); render(); } }, 250);
  });
  document.addEventListener('submit', e => {
    if (e.target.id !== 'nfcform') return;
    e.preventDefault(); const v = e.target.serial.value.trim(); e.target.serial.value = '';
    if (v) handleSerial(v);
  });
})();
