// Typed API layer. The single place that knows the server's URLs (mirrors public/api.js).
import { call, enc, qs } from './client';
import type {
  AccessMatrix, AccessResponse, AdminUser, AdminUserPatch, AdminUserQuery, AppNotification, Emergency, GatePass,
  Guard, GuardBody, HouseholdMember, Me, Notice, RegisterBody, ServiceRequest, Settings, SettingsPatch, Stats, User,
} from './types';

export * from './types';
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
    get: (id: number) => call<ServiceRequest>('GET', `/api/requests/${enc(id)}`),
  },
  notices: {
    list: () => call<Notice[]>('GET', '/api/notices'),
  },
  notifications: {
    list: () => call<AppNotification[]>('GET', '/api/notifications'),
    unreadCount: () => call<{ n: number }>('GET', '/api/notifications/unread-count'),
    markRead: () => call<{ ok: true }>('POST', '/api/notifications/read'),
  },
  household: {
    list: () => call<HouseholdMember[]>('GET', '/api/household'),
  },
  emergencies: {
    list: () => call<Emergency[]>('GET', '/api/emergencies'),
  },
  gate: {
    passes: () => call<GatePass[]>('GET', '/api/gate/passes'),
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
