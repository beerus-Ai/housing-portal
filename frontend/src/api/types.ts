// DTOs mirroring the frozen API contract (public/api.js, app.js).
export type ResidentType = 'owner' | 'tenant' | 'family';
export type Role = 'resident' | 'admin' | 'guard';
export type UserStatus = 'pending' | 'approved' | 'rejected' | 'suspended' | 'removed';
export type FeatureKey = 'emergency' | 'gate' | 'contacts' | 'notices';
export type Features = Record<FeatureKey, boolean>;

export interface User {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  flat: string | null;
  resident_type: ResidentType | null;
  role: Role;
  status: UserStatus;
}

/** GET /api/me */
export interface Me extends User {
  permissions: string[];
  features: Partial<Features> & { parking?: boolean };
}

/** GET /api/settings and /api/admin/settings */
export interface Settings {
  society_name: string;
  society_kind: string;
  google_client_id: string;
  features: Features;
}
export interface SettingsPatch {
  society_name?: string;
  society_kind?: string;
  google_client_id?: string;
  features?: Partial<Features>;
}

export interface RegisterBody {
  name: string;
  email: string;
  flat: string;
  phone: string;
  resident_type: ResidentType;
  password: string;
  consent: boolean;
}

export interface Permission {
  key: string;
  label: string;
}
export type AccessMatrix = Record<string, Record<string, boolean>>;
export interface AccessResponse {
  roles: ResidentType[];
  permissions: Permission[];
  matrix: AccessMatrix;
}

export interface AdminUser {
  id: number;
  name: string;
  email: string;
  phone: string | null;
  flat: string | null;
  resident_type: ResidentType | null;
  role: Role;
  status: UserStatus;
  created_at: string;
}
export interface AdminUserPatch {
  resident_type?: ResidentType;
  flat?: string;
  name?: string;
  phone?: string;
  status?: 'approved' | 'suspended';
}
export interface AdminUserQuery {
  status?: string;
  q?: string;
}

export interface Guard {
  id: number;
  name: string;
  email: string;
  status: UserStatus;
  created_at: string;
}
export interface GuardBody {
  name: string;
  email: string;
  password: string;
}

export interface AppNotification {
  id: number;
  user_id: number;
  message: string;
  is_read: number;
  created_at: string;
}

export type RequestStatus = 'open' | 'assigned' | 'in_progress' | 'closed';
export interface ServiceRequest {
  id: number;
  user_id: number;
  category: string;
  title: string;
  description: string | null;
  status: RequestStatus;
  vendor_id: number | null;
  vendor_name: string | null;
  resident_name: string;
  flat: string | null;
  rating: number | null;
  rating_comment: string | null;
  has_photo: boolean;
  can_rate: boolean;
  created_at: string;
  updated_at: string;
  /** Where the request came in. Missing on older backends. */
  source?: 'app' | 'whatsapp';
  escalated_at?: string | null;
  /** Committee only: the AI triage suggestion. */
  ai?: AiTriage | null;
}

export interface AiTriage {
  category: string;
  priority: string;
  summary: string | null;
  vendor_id: number | null;
  source: 'rules' | 'llm';
  confidence?: number;
}

export interface Notice {
  id: number;
  title: string;
  body: string;
  author_id: number;
  author: string;
  created_at: string;
}

export interface HouseholdMember {
  id: number;
  name: string;
  resident_type: ResidentType | null;
  status: UserStatus;
  phone: string | null;
}

export type GatePassStatus = 'active' | 'used' | 'cancelled' | 'expired';
export interface GatePass {
  id: number;
  flat: string;
  visitor_name: string;
  purpose: string | null;
  code: string;
  qr: string;
  valid_from: string;
  valid_until: string;
  status: GatePassStatus;
  created_by_name: string;
  used_at: string | null;
}

export interface Stats {
  by_status: { status: RequestStatus; n: number }[];
  by_category_open: { category: string; n: number }[];
  pending_users: number;
  avg_rating: number | null;
  oldest_open: { id: number; title: string; category: string; created_at: string }[];
  sla: { total: number; overdue: number; within: number };
  unassigned: number;
  awaiting_rating: number;
  notices_30d: number;
  households: number;
}

export interface Emergency {
  id: number;
  type: string;
  note: string | null;
  status: 'active' | 'resolved';
  flat: string | null;
  user_name: string;
  created_at: string;
  resolved_at: string | null;
}

export interface HistoryItem {
  action: string;
  detail: string | null;
  created_at: string;
  actor: string | null;
}
export interface RequestDetail extends ServiceRequest {
  history: HistoryItem[];
}
export interface Comment {
  id: number;
  body: string;
  created_at: string;
  author: string;
  role: Role;
}

export interface NoticeBody {
  title: string;
  body: string;
}
export interface HouseholdBody {
  name: string;
  email: string;
  phone: string;
  resident_type: 'family' | 'tenant';
  password: string;
  consent: boolean;
}

export interface Vendor {
  id: number;
  name: string;
  trade: string;
  phone: string | null;
}
export interface VendorBody {
  name: string;
  trade: string;
  phone: string;
}

export interface LeaseBody {
  start_date: string;
  end_date: string;
  owner_name: string;
  owner_phone: string;
  police_verified_on: string;
  agreement: string;
  parking: string;
}
/** GET /api/lease (null until the committee sets it) */
export interface Lease extends LeaseBody {
  id: number;
  user_id: number;
}
/** GET /api/admin/leases: one row per approved tenant, lease fields are null when not set yet */
export interface LeaseRow {
  user_id: number;
  name: string;
  flat: string | null;
  email: string;
  phone: string | null;
  start_date: string | null;
  end_date: string | null;
  owner_name: string | null;
  owner_phone: string | null;
  police_verified_on: string | null;
  agreement: string | null;
  parking: string | null;
}

export interface AuditRow {
  id: number;
  entity: string;
  entity_id: number | null;
  action: string;
  detail: string | null;
  created_at: string;
  actor: string | null;
}

export interface AiMessage {
  id: number; direction: 'in' | 'out'; phone: string; body: string; status: string; request_id: number | null;
  created_at: string; resident: string | null; flat: string | null;
}
/** GET /api/admin/ai */
export interface AiInfo {
  mode: 'rules' | 'llm'; sla_hours: number; whatsapp_live: boolean; webhook_path: string; webhook_secret: string;
  counts: { whatsapp_requests: number; messages_in: number; messages_out: number; triaged: number };
  messages: AiMessage[];
}
export interface NoticeDraft { title: string; body: string; source: 'rules' | 'llm' }
export interface Digest { text: string; source: string; stats: Record<string, unknown> }
