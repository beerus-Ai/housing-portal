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
    },
    profile: {
      update: body => call('PATCH', '/api/me', body), // { name, phone }
      changePassword: (current, next) => call('POST', '/api/me/password', { current, next }),
    },
    requests: {
      list: params => call('GET', '/api/requests' + qs(params)), // { status, category }
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
    },
  };
})();
