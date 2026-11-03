// Typed API layer. The single place that knows the server's URLs (mirrors public/api.js).
import { call, enc, qs } from './client';
import { safetyApi } from './safety';
import type {
  AccessMatrix, AccessResponse, AdminUser, AdminUserPatch, AdminUserQuery, AppNotification,
  AuditRow, Comment, Guard, GuardBody, HouseholdBody, HouseholdMember, Lease, LeaseBody, LeaseRow, Me, Notice, NoticeBody,
  RegisterBody, RequestDetail, RequestStatus, ServiceRequest, Settings, SettingsPatch, Stats, User, Vendor, VendorBody,
} from './types';

export * from './types';
export * from './safety';
export { ApiError } from './client';

export const API = {
  auth: {
    me: () => call<Me>('GET', '/api/me'),
    login: (email: string, password: string) => call<User>('POST', '/api/login', { email, password }),
    logout: () => call<{ ok: true }>('POST', '/api/logout'),
    register: (body: RegisterBody) => call<{ message: string }>('POST', '/api/register', body),
    pulse: () => call<{ v: string }>('GET', '/api/pulse'),
    google: (credential: string) => call<User>('POST', '/api/auth/google', { credential }),
  },
  profile: {
    update: (body: { name?: string; phone?: string }) => call<User>('PATCH', '/api/me', body),
    changePassword: (current: string, next: string) => call<{ ok: true }>('POST', '/api/me/password', { current, next }),
  },
  requests: {
    list: (params?: { status?: string; category?: string }) => call<ServiceRequest[]>('GET', '/api/requests' + qs(params)),
    get: (id: number) => call<RequestDetail>('GET', `/api/requests/${enc(id)}`),
    create: (form: FormData) => call<{ id: number }>('POST', '/api/requests', form), // multipart: category, title, description, photo
    photoUrl: (id: number) => `/api/requests/${enc(id)}/photo`,
    assign: (id: number, vendorId: number) => call<{ ok: true }>('POST', `/api/requests/${enc(id)}/assign`, { vendor_id: vendorId }),
    setStatus: (id: number, status: RequestStatus, note?: string) =>
      call<{ ok: true }>('POST', `/api/requests/${enc(id)}/status`, { status, note }),
    rate: (id: number, rating: number, comment?: string) => call<{ ok: true }>('POST', `/api/requests/${enc(id)}/rate`, { rating, comment }),
    comments: (id: number) => call<Comment[]>('GET', `/api/requests/${enc(id)}/comments`),
    addComment: (id: number, body: string) => call<{ id: number }>('POST', `/api/requests/${enc(id)}/comments`, { body }),
  },
  notices: {
    list: () => call<Notice[]>('GET', '/api/notices'),
    create: (body: NoticeBody) => call<{ id: number }>('POST', '/api/notices', body),
    remove: (id: number) => call<{ ok: true }>('DELETE', `/api/notices/${enc(id)}`),
  },
  vendors: {
    list: () => call<Vendor[]>('GET', '/api/vendors'),
    create: (body: VendorBody) => call<{ id: number }>('POST', '/api/vendors', body),
    update: (id: number, body: Partial<VendorBody>) => call<{ ok: true }>('PUT', `/api/vendors/${enc(id)}`, body),
    remove: (id: number) => call<{ ok: true }>('DELETE', `/api/vendors/${enc(id)}`),
  },
  lease: { get: () => call<Lease | null>('GET', '/api/lease') },
  notifications: {
    list: () => call<AppNotification[]>('GET', '/api/notifications'),
    unreadCount: () => call<{ n: number }>('GET', '/api/notifications/unread-count'),
    markRead: () => call<{ ok: true }>('POST', '/api/notifications/read'),
  },
  household: {
    list: () => call<HouseholdMember[]>('GET', '/api/household'),
    add: (body: HouseholdBody) => call<{ id: number }>('POST', '/api/household', body),
  },
  emergencies: safetyApi.emergencies,
  contacts: safetyApi.contacts,
  vehicles: safetyApi.vehicles,
  parking: safetyApi.parking,
  workers: safetyApi.workers,
  gate: {
    ...safetyApi.gate,
    guards: () => call<Guard[]>('GET', '/api/admin/guards'),
    addGuard: (body: GuardBody) => call<{ id: number }>('POST', '/api/admin/guards', body),
    removeGuard: (id: number) => call<{ ok: true }>('DELETE', `/api/admin/guards/${enc(id)}`),
  },
  settings: {
    public: () => call<Settings>('GET', '/api/settings'),
  },
  admin: {
    users: (status?: string) => call<AdminUser[]>('GET', '/api/admin/users' + qs({ status })),
    decide: (id: number, decision: 'approve' | 'reject') =>
      call<unknown>('POST', `/api/admin/users/${enc(id)}/${decision === 'approve' ? 'approve' : 'reject'}`),
    stats: () => call<Stats>('GET', '/api/admin/stats'),
    leases: () => call<LeaseRow[]>('GET', '/api/admin/leases'),
    setLease: (userId: number, body: LeaseBody) => call<{ ok: true }>('PUT', `/api/admin/users/${enc(userId)}/lease`, body),
    audit: () => call<AuditRow[]>('GET', '/api/admin/audit'),
    exportUrl: '/api/admin/export.csv',
    overview: safetyApi.overview,
    settings: () => call<Settings>('GET', '/api/admin/settings'),
    setSettings: (body: SettingsPatch) => call<Settings>('PUT', '/api/admin/settings', body),
    access: () => call<AccessResponse>('GET', '/api/admin/access'),
    setAccess: (matrix: AccessMatrix) => call<AccessResponse>('PUT', '/api/admin/access', { matrix }),
    allUsers: (params?: AdminUserQuery) => call<AdminUser[]>('GET', '/api/admin/users' + qs({ ...params })),
    patchUser: (id: number, body: AdminUserPatch) => call<AdminUser>('PATCH', `/api/admin/users/${enc(id)}`, body),
    resetPassword: (id: number, password: string) =>
      call<{ ok: true }>('POST', `/api/admin/users/${enc(id)}/reset-password`, { password }),
    removeUser: (id: number) => call<{ ok: true }>('DELETE', `/api/admin/users/${enc(id)}`),
  },
};
