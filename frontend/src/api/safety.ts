// Phase 3 DTOs and API methods: emergencies, contacts, gate, vehicles, parking, workers, estate overview.
import { call, enc, qs } from './client';
import type { Emergency, GatePass } from './types';

export interface Contact { id: number; name: string; role: string; phone: string; icon: string }
export interface ContactBody { name: string; role: string; phone: string; icon: string }

export interface GatePassBody { visitor_name: string; purpose?: string; valid_from?: string; valid_until?: string }
export interface GatePassCreated { id: number; token: string; code: string; qr: string }
export interface GateMe { token: string; qr: string; nfc: string }
export interface GateVerifyResult {
  result: 'allowed' | 'denied';
  kind?: 'visitor' | 'resident';
  name?: string;
  flat?: string | null;
  purpose?: string | null;
  reason?: string;
}
export interface GateLogRow {
  id: number; kind: string; subject: string | null; flat: string | null; result: 'allowed' | 'denied'; reason: string | null;
  guard_name: string | null; created_at: string;
}
export interface GateOverview {
  today: { allowed: number; denied: number; visitors: number; residents: number };
  active_passes: number;
  inside?: number;
  recent: GateLogRow[];
  by_hour: { hour: number | string; n: number | string }[];
}

export type VehicleType = 'car' | 'bike' | 'scooter' | 'other';
export interface Vehicle {
  id: number; flat: string; owner_name: string | null; plate: string; type: VehicleType; make: string | null;
  color: string | null; sticker: string | null; created_at: string;
}
export interface VehicleBody { plate: string; type: VehicleType; make?: string; color?: string; sticker?: string; flat?: string }

export type SlotKind = 'car' | 'bike' | 'visitor';
export interface ParkingSlot {
  id: number; code: string; level: string | null; kind: SlotKind; flat: string | null; vehicle_id: number | null; plate: string | null;
}
export interface ParkingData { summary: { total: number; assigned: number; free: number }; slots: ParkingSlot[] }
export interface ParkingSlotsBody { prefix: string; from: number; count: number; kind: SlotKind; level?: string }

export type WorkerRole = 'security' | 'housekeeping' | 'maintenance' | 'gardener' | 'other';
export interface Worker {
  id: number; name: string; role: WorkerRole; phone: string | null; shift: string | null; status: 'active' | 'inactive'; notes: string | null;
}
export type WorkerBody = Partial<Omit<Worker, 'id'>> & { name: string };

/** GET /api/admin/overview. The UI coerces missing numbers to 0. */
export interface Overview {
  residents?: { approved?: number; pending?: number; suspended?: number; owners?: number; tenants?: number; family?: number; flats?: number };
  requests?: { open?: number; unassigned?: number; in_progress?: number; closed_30d?: number };
  emergencies?: { active?: number; resolved_30d?: number };
  gate?: { admitted_today?: number; denied_today?: number; active_passes?: number; guards?: number };
  estate?: { vehicles?: number; parking_total?: number; parking_assigned?: number; workers_active?: number; workers_inactive?: number; vendors?: number };
  leases?: { ending_60d?: number; tenants_without_lease?: number };
  notices?: { last_30d?: number };
  /** Absent on older backends. */
  ai?: { mode?: 'rules' | 'llm'; sla_hours?: number; triaged?: number; urgent_open?: number; escalated_open?: number; whatsapp_requests_30d?: number; whatsapp_messages_7d?: number };
}

export const safetyApi = {
  emergencies: {
    list: () => call<Emergency[]>('GET', '/api/emergencies'),
    raise: (type: string, note?: string) => call<{ id: number }>('POST', '/api/emergencies', { type, note }),
    resolve: (id: number) => call<{ ok: true }>('POST', `/api/emergencies/${enc(id)}/resolve`),
  },
  contacts: {
    list: () => call<Contact[]>('GET', '/api/contacts'),
    create: (body: ContactBody) => call<{ id: number }>('POST', '/api/contacts', body),
    remove: (id: number) => call<{ ok: true }>('DELETE', `/api/contacts/${enc(id)}`),
  },
  gate: {
    pass: (body: GatePassBody) => call<GatePassCreated>('POST', '/api/gate/passes', body),
    passes: () => call<GatePass[]>('GET', '/api/gate/passes'),
    cancel: (id: number) => call<{ ok: true }>('POST', `/api/gate/passes/${enc(id)}/cancel`),
    me: () => call<GateMe>('GET', '/api/gate/me'),
    rotate: () => call<GateMe>('POST', '/api/gate/me/rotate'),
    verify: (body: { code: string } | { token: string }) => call<GateVerifyResult>('POST', '/api/gate/verify', body),
    overview: () => call<GateOverview>('GET', '/api/gate/overview'),
    log: () => call<GateLogRow[]>('GET', '/api/gate/log'),
  },
  vehicles: {
    list: (params?: { q?: string }) => call<Vehicle[]>('GET', '/api/vehicles' + qs(params)),
    add: (body: VehicleBody) => call<{ id: number }>('POST', '/api/vehicles', body),
    remove: (id: number) => call<{ ok: true }>('DELETE', `/api/vehicles/${enc(id)}`),
  },
  parking: {
    list: () => call<ParkingData>('GET', '/api/parking'),
    addSlots: (body: ParkingSlotsBody) => call<unknown>('POST', '/api/parking', body),
    assign: (id: number, body: { flat: string; vehicle_id?: number }) => call<unknown>('POST', `/api/parking/${enc(id)}/assign`, body),
    free: (id: number) => call<unknown>('POST', `/api/parking/${enc(id)}/free`),
    removeSlot: (id: number) => call<unknown>('DELETE', `/api/parking/${enc(id)}`),
  },
  workers: {
    list: () => call<Worker[]>('GET', '/api/admin/workers'),
    add: (body: WorkerBody) => call<{ id: number }>('POST', '/api/admin/workers', body),
    update: (id: number, body: WorkerBody) => call<unknown>('PUT', `/api/admin/workers/${enc(id)}`, body),
    remove: (id: number) => call<{ ok: true }>('DELETE', `/api/admin/workers/${enc(id)}`),
  },
  overview: () => call<Overview>('GET', '/api/admin/overview'),
};
