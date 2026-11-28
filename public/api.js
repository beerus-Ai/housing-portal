// Front-end API layer: the single place that knows the server's URLs. Both apps call API.* and never build URLs themselves.
// Every method returns parsed JSON and throws Error(message) (with .status) on failure. Loaded after common.js.
window.API = (() => {
  const call = HP.api;
  const qs = p => { const e = Object.entries(p || {}).filter(([, v]) => v !== '' && v != null); return e.length ? '?' + new URLSearchParams(e) : ''; };
  const id = x => encodeURIComponent(x);
  return {
    roles: HP.RAPI, // faculty-review roles (docs/roles-api.md): accounts, staff jobs and shifts, cost approval, reopen, reports, support, guides, IT tools; defined in common.js so /m/ can use it
    auth: {
      me: () => call('GET', '/api/me'),
      login: (email, password) => call('POST', '/api/login', { email, password }),
      logout: () => call('POST', '/api/logout'),
      register: body => call('POST', '/api/register', body),
      pulse: () => call('GET', '/api/pulse'), // { v: version string, a: { rq, ru, em, em_on } } sound cues: newest request/order id, newest urgent or security request id, newest active emergency id, active emergency count
      google: credential => call('POST', '/api/auth/google', { credential }), // Google Identity Services ID token; signs in an EXISTING approved account matched by verified email
    },
    profile: {
      update: body => call('PATCH', '/api/me', body), // { name, phone }
      changePassword: (current, next) => call('POST', '/api/me/password', { current, next }),
    },
    requests: {
      list: params => call('GET', '/api/requests' + qs(params)), // admin filters: { status, category, source: 'whatsapp'|'telegram'|'app' }
      aiAction: id => call('POST', `/api/requests/${encodeURIComponent(id)}/ai-action`), // approve the suggested action -> { ok, action, plate?|vendor? }
      aiDismiss: id => call('POST', `/api/requests/${encodeURIComponent(id)}/ai-action/dismiss`), // { ok }
      get: rid => call('GET', `/api/requests/${id(rid)}`),
      create: formData => call('POST', '/api/requests', formData), // multipart: category, title, description, photo
      photoUrl: rid => `/api/requests/${id(rid)}/photo`,
      assign: (rid, vendorId) => call('POST', `/api/requests/${id(rid)}/assign`, { vendor_id: vendorId }),
      setStatus: (rid, status, note) => call('POST', `/api/requests/${id(rid)}/status`, { status, note }),
      rate: (rid, rating, comment) => call('POST', `/api/requests/${id(rid)}/rate`, { rating, comment }),
      comments: rid => call('GET', `/api/requests/${id(rid)}/comments`),
      addComment: (rid, body) => call('POST', `/api/requests/${id(rid)}/comments`, { body }),
    },
    notices: {
      list: () => call('GET', '/api/notices'),
      create: body => call('POST', '/api/notices', body), // { title, body }
      remove: nid => call('DELETE', `/api/notices/${id(nid)}`),
    },
    notifications: {
      list: () => call('GET', '/api/notifications'),
      unreadCount: () => call('GET', '/api/notifications/unread-count'),
      markRead: () => call('POST', '/api/notifications/read'),
    },
    household: {
      list: () => call('GET', '/api/household'),
      add: body => call('POST', '/api/household', body),
    },
    emergencies: {
      list: () => call('GET', '/api/emergencies'), // resident: own flat; committee: all. [{ id, type, note, status: 'active'|'resolved', flat, user_name, created_at, resolved_at }]
      raise: (type, note) => call('POST', '/api/emergencies', { type, note }),
      resolve: eid => call('POST', `/api/emergencies/${id(eid)}/resolve`),
    },
    contacts: {
      list: () => call('GET', '/api/contacts'), // [{ id, name, role, phone, icon }]
      create: body => call('POST', '/api/contacts', body), // committee: { name, role, phone, icon }
      remove: cid => call('DELETE', `/api/contacts/${id(cid)}`),
    },
    gate: {
      pass: body => call('POST', '/api/gate/passes', body), // resident: { visitor_name, purpose?, valid_from?, valid_until? } -> { id, token, code, qr: 'HSP:<token>' }
      passes: () => call('GET', '/api/gate/passes'), // resident: own flat; committee: all. [{ id, flat, visitor_name, purpose, code, qr, valid_from, valid_until, status: 'active'|'used'|'cancelled'|'expired', created_by_name, used_at }]
      cancel: pid => call('POST', `/api/gate/passes/${id(pid)}/cancel`),
      me: () => call('GET', '/api/gate/me'), // resident's permanent gate token: { token, qr: 'HSP:<token>', nfc: 'HSP:<token>' }
      rotate: () => call('POST', '/api/gate/me/rotate'),
      verify: body => call('POST', '/api/gate/verify', body), // guard/committee: { code } or { token } (token may carry the 'HSP:' prefix) -> { result: 'allowed'|'denied', kind, name, flat, purpose, reason }
      overview: () => call('GET', '/api/gate/overview'), // committee/guard: { today: { allowed, denied, visitors, residents }, active_passes, inside: n, recent: [log rows], by_hour: [{ hour, n }] }
      log: () => call('GET', '/api/gate/log'), // guard/committee: latest 100 [{ id, kind, subject, flat, result, reason, guard_name, created_at }]
      guards: () => call('GET', '/api/admin/guards'),
      addGuard: body => call('POST', '/api/admin/guards', body), // committee: { name, email, password }
      removeGuard: gid => call('DELETE', `/api/admin/guards/${id(gid)}`),
    },
    settings: {
      public: () => call('GET', '/api/settings'), // no sign-in needed: { society_name, society_kind, google_client_id ('' when off), features: { emergency, gate, contacts, notices } }
    },
    vehicles: {
      list: params => call('GET', '/api/vehicles' + qs(params)), // resident: own flat's vehicles; committee: all, optional { q } (plate/flat/owner). [{ id, flat, owner_name, plate, type, make, color, sticker, created_at }]
      add: body => call('POST', '/api/vehicles', body), // { plate, type: 'car'|'bike'|'scooter'|'other', make?, color?, sticker? } (resident flat is implied; committee may pass { flat })
      remove: vid => call('DELETE', `/api/vehicles/${id(vid)}`),
    },
    parking: {
      list: () => call('GET', '/api/parking'), // committee: { summary: { total, assigned, free }, slots: [{ id, code, level, kind: 'car'|'bike'|'visitor', flat, vehicle_id, plate }] }; resident: same shape limited to their flat's slots plus summary
      addSlots: body => call('POST', '/api/parking', body), // committee: { prefix: 'B1-', from: 1, count: 20, kind, level } creates slots B1-01..B1-20
      assign: (sid, body) => call('POST', `/api/parking/${id(sid)}/assign`, body), // committee: { flat, vehicle_id? }
      free: sid => call('POST', `/api/parking/${id(sid)}/free`),
      removeSlot: sid => call('DELETE', `/api/parking/${id(sid)}`),
    },
    lease: { get: () => call('GET', '/api/lease') },
    // Bulk upload (docs/bulk-upload-api.md): the committee imports a CSV; a dry run checks every row first.
    bulk: {
      templates: () => call('GET', '/api/admin/bulk/templates'), // committee: { residents|accounts|vendors|inventory: { label, columns, required, example, help, needs_head } }
      upload: (type, rows, dryRun) => call('POST', `/api/admin/bulk/${encodeURIComponent(type)}`, { rows, dry_run: !!dryRun }), // committee (accounts: head or admin): dry run -> { total, valid, rows: [{ row, ok, error? }] }; import -> { total, imported, failed, rows: [{ row, ok, id?, error?, email?, name?, password? }] } (password only when the portal made one)
      resident: body => call('POST', '/api/admin/residents', body), // committee: { name, email, flat, resident_type, phone?, password? } -> 201 { id, password? }
    },
    // Carpool (docs/carpool-api.md): residents offer rides and ask for seats; phones shared only after acceptance. Times are IST 'YYYY-MM-DDTHH:MM'.
    carpool: {
      list: () => call('GET', '/api/carpool'), // resident or committee: upcoming rides [{ id, from_place, to_place, depart_at, seats, seats_left, cost_per_seat, note, status, past, mine, driver: { id, name, flat, phone|null }, my_request: { id, seats, status }|null, requests?: [{ id, name, flat, seats, status, created_at, phone|null }] }]
      offer: body => call('POST', '/api/carpool', body), // resident: { to_place, from_place? (default 'Sahyadri Heights'), depart_at, seats (1..6), cost_per_seat?, note? } -> 201 { id }; 409 same time twice
      cancel: rid => call('POST', `/api/carpool/${id(rid)}/cancel`), // driver, or the committee (takes it down); riders are notified
      ask: (rid, seats = 1) => call('POST', `/api/carpool/${id(rid)}/request`, { seats }), // resident: -> 201 { id, status: 'pending' }; 409 own ride, full, already asked, declined, left
      decide: (qid, decision) => call('POST', `/api/carpool/requests/${id(qid)}/decide`, { decision }), // driver: 'accept'|'decline'; 409 not enough seats
      withdraw: qid => call('POST', `/api/carpool/requests/${id(qid)}/cancel`), // rider: pending or accepted seat
    },
    // Community card wallet (docs/card-wallet-api.md): prepaid ledger per flat, frozen cards, one lookup for every counter. Amounts are rupees.
    wallet: {
      mine: () => call('GET', '/api/wallet'), // resident with a flat: { flat, balance, tx: [{ id, amount (+in, -out), kind: 'topup'|'shop'|'laundry'|'refund'|'adjust', method: 'cash'|'upi'|null, note, created_at }] } (last 50, newest first)
      all: () => call('GET', '/api/admin/wallets'), // committee: [{ flat, balance, last_at }] every flat with an approved resident (balance 0 if none)
      flat: f => call('GET', `/api/admin/wallets/${id(f)}`), // committee: same shape as mine()
      topup: body => call('POST', '/api/admin/wallet/topup', body), // committee: { flat? | serial?, amount (1..50000), method: 'cash'|'upi', reference? } -> 201 { flat, balance, tx_id }; 404 unknown card
      adjust: body => call('POST', '/api/admin/wallet/adjust', body), // head or sysadmin: { flat, amount (±, not 0), note } -> 201 { flat, balance }; 409 if it would go below 0
    },
    card: {
      me: () => call('GET', '/api/me/card'), // { cards: [{ id, serial, frozen, created_at }], frozen, wallet: { balance }|null, money, activity: [{ at, kind (… 'wallet'), icon, text, amount }] }
      freeze: frozen => call('POST', '/api/me/card/freeze', { frozen: !!frozen }), // any signed-in user with an active card -> { frozen }
      lookup: serial => call('POST', '/api/card/lookup', { serial }), // guard, committee, shop, laundry: { id, name, role, flat, department, frozen, wallet: { balance }|null, credit: { used, limit }|null, parcels_waiting: n|null }; 404 unknown, 403 frozen or not approved
      shopCard: serial => call('POST', '/api/shop/card', { serial }), // shop: { name, flat, credit_used, credit_limit, wallet_balance }
      shopCounter: body => call('POST', '/api/shop/counter', body), // shop: { serial, items: [{ id, qty }], payment: 'cash'|'upi'|'account'|'wallet' } -> 201 { id, total, payment, name, flat }; 409 short wallet
      laundryCounter: body => call('POST', '/api/laundry/counter', body), // laundry: { serial, lines: [{ item: rateId, qty }], payment } -> 201 { id, total, payment, name, flat } (order is picked_up today)
      parcels: serial => call('GET', `/api/parcels/card/${id(serial)}`), // guard, staff, committee: waiting parcels of the card's flat [{ id, flat, carrier, note, status, created_at, logged_by_name }]
      collectParcel: (pid, serial) => call('POST', `/api/parcels/${id(pid)}/collect`, { serial }), // guard, committee: 409 'This card is not from flat X'
      checkin: (eid, serial) => call('POST', `/api/events/${id(eid)}/checkin`, { serial }), // committee, guard: 201 { name, flat, rsvp, already: false } or 200 { …, already: true }
      checkins: eid => call('GET', `/api/events/${id(eid)}/checkins`), // committee, guard: [{ user_id, name, role, flat, at, by_name, rsvp }]
    },
    vendors: {
      list: () => call('GET', '/api/vendors'),
      create: body => call('POST', '/api/vendors', body),
      update: (vid, body) => call('PUT', `/api/vendors/${id(vid)}`, body),
      remove: vid => call('DELETE', `/api/vendors/${id(vid)}`),
    },
    admin: {
      users: status => call('GET', '/api/admin/users' + qs({ status })),
      user: uid => call('GET', `/api/admin/users/${id(uid)}`),
      decide: (uid, decision) => call('POST', `/api/admin/users/${id(uid)}/${decision === 'approve' ? 'approve' : 'reject'}`),
      leases: () => call('GET', '/api/admin/leases'),
      setLease: (uid, body) => call('PUT', `/api/admin/users/${id(uid)}/lease`, body),
      stats: () => call('GET', '/api/admin/stats'),
      audit: () => call('GET', '/api/admin/audit'),
      exportUrl: '/api/admin/export.csv',
      workers: () => call('GET', '/api/admin/workers'), // [{ id, name, role: 'security'|'housekeeping'|'maintenance'|'gardener'|'other', phone, shift, status: 'active'|'inactive', notes }]
      addWorker: body => call('POST', '/api/admin/workers', body),
      updateWorker: (wid, body) => call('PUT', `/api/admin/workers/${id(wid)}`, body),
      removeWorker: wid => call('DELETE', `/api/admin/workers/${id(wid)}`),
      overview: () => call('GET', '/api/admin/overview'), // one call for the dashboard: { residents:{approved,pending,suspended,owners,tenants,family,flats}, requests:{open,unassigned,in_progress,closed_30d}, emergencies:{active,resolved_30d}, gate:{admitted_today,denied_today,active_passes,guards}, estate:{vehicles,parking_total,parking_assigned,workers_active,workers_inactive,vendors}, leases:{ending_60d,tenants_without_lease}, notices:{last_30d} }
      ai: () => call('GET', '/api/admin/ai'), // { mode: 'rules'|'llm', sla_hours, whatsapp_live, webhook_path, webhook_secret, telegram_live, telegram_webhook_path, telegram_webhook_secret, counts: { whatsapp_requests, telegram_requests, messages_in, messages_out, triaged, messages_review, messages_ignored }, review: [{ id, phone, body, created_at, resident, flat }], messages: [{ id, direction: 'in'|'out', channel: 'whatsapp'|'telegram', phone, body, status, request_id, created_at, resident, flat }] }
      simulateWhatsApp: (phone, text, group) => call('POST', '/api/admin/whatsapp/simulate', group ? { phone, text, group: true } : { phone, text }), // { created: requestId|null, replies: [string], decision: 'create'|'review'|'ignore'|'none' }
      simulateTelegram: (fromId, text, group) => call('POST', '/api/admin/telegram/simulate', group ? { from_id: fromId, text, group: true } : { from_id: fromId, text }), // { created: requestId|null, replies: [string], decision: 'create'|'review'|'ignore'|'none' }
      setTelegramWebhook: baseUrl => call('POST', '/api/admin/telegram/set-webhook', baseUrl ? { base_url: baseUrl } : {}), // { ok: bool, url, result } — needs TELEGRAM_BOT_TOKEN
      createRequestFromMessage: id => call('POST', `/api/admin/whatsapp/messages/${encodeURIComponent(id)}/create-request`), // { created: requestId }
      dismissMessage: id => call('POST', `/api/admin/whatsapp/messages/${encodeURIComponent(id)}/dismiss`), // { ok: true }
      draftNotice: text => call('POST', '/api/admin/ai/draft-notice', { text }), // { title, body, source: 'rules'|'llm' }
      digest: () => call('GET', '/api/admin/digest'), // { text, source, stats }
      settings: () => call('GET', '/api/admin/settings'), // same shape as settings.public plus any extra admin-only keys
      setSettings: body => call('PUT', '/api/admin/settings', body), // { society_name?, society_kind?, google_client_id?, features?: { emergency?, gate?, contacts?, notices? } }
      access: () => call('GET', '/api/admin/access'), // { roles: ['owner','tenant','family'], permissions: [{ key, label }], matrix: { owner: { 'gate.pass': true, ... }, ... } }
      setAccess: matrix => call('PUT', '/api/admin/access', { matrix }),
      allUsers: params => call('GET', '/api/admin/users' + qs(params)), // { status?, q? }
      patchUser: (uid, body) => call('PATCH', `/api/admin/users/${id(uid)}`, body), // { resident_type?, flat?, name?, phone?, status?: 'approved'|'suspended' }
      resetPassword: (uid, password) => call('POST', `/api/admin/users/${id(uid)}/reset-password`, { password }),
      removeUser: uid => call('DELETE', `/api/admin/users/${id(uid)}`),
    },
  };
})();
