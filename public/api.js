// Front-end API layer: the single place that knows the server's URLs. Both apps call API.* and never build URLs themselves.
// Every method returns parsed JSON and throws Error(message) (with .status) on failure. Loaded after common.js.
window.API = (() => {
  const call = HP.api;
  const qs = p => { const e = Object.entries(p || {}).filter(([, v]) => v !== '' && v != null); return e.length ? '?' + new URLSearchParams(e) : ''; };
  const id = x => encodeURIComponent(x);
  return {
    auth: {
      me: () => call('GET', '/api/me'),
      login: (email, password) => call('POST', '/api/login', { email, password }),
      logout: () => call('POST', '/api/logout'),
      register: body => call('POST', '/api/register', body),
      pulse: () => call('GET', '/api/pulse'),
      google: credential => call('POST', '/api/auth/google', { credential }), // Google Identity Services ID token; signs in an EXISTING approved account matched by verified email
    },
    profile: {
      update: body => call('PATCH', '/api/me', body), // { name, phone }
      changePassword: (current, next) => call('POST', '/api/me/password', { current, next }),
    },
    requests: {
      list: params => call('GET', '/api/requests' + qs(params)), // admin filters: { status, category, source: 'whatsapp'|'telegram'|'app' }
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
