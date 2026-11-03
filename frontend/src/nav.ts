import type { Me } from './api';

export interface NavItem {
  key: string;
  path: string;
  label: string;
  icon: string;
}

const I = (key: string, label: string, icon: string, path = '/' + key): NavItem => ({ key, path, label, icon });

const NAV: Record<string, NavItem[]> = {
  owner: [I('home', 'Home', 'house', '/'), I('requests', 'Requests', 'list-checks'), I('raise', 'Raise a request', 'plus-circle'),
    I('household', 'Household', 'users-three'), I('contacts', 'Contacts', 'phone-call'), I('gatepass', 'Gate pass', 'qr-code'), I('emergency', 'Emergency', 'siren')],
  tenant: [I('home', 'Home', 'house', '/'), I('requests', 'Requests', 'list-checks'), I('raise', 'Raise a request', 'plus-circle'),
    I('lease', 'My lease', 'file-text'), I('gatepass', 'Gate pass', 'qr-code'), I('emergency', 'Emergency', 'siren')],
  family: [I('home', 'Home', 'house', '/'), I('requests', 'Flat requests', 'list-checks'), I('raise', 'Raise a request', 'plus-circle'),
    I('notices', 'Notices', 'megaphone'), I('contacts', 'Contacts', 'phone-call'), I('gatepass', 'Gate pass', 'qr-code'), I('emergency', 'Emergency', 'siren')],
  admin: [I('dashboard', 'Dashboard', 'chart-bar', '/'), I('requests', 'Requests', 'list-checks'), I('emergencies', 'Emergencies', 'siren'),
    I('approvals', 'Approvals', 'user-check'), I('contacts', 'Contacts', 'phone-call'), I('notices', 'Notices', 'megaphone'),
    I('leases', 'Leases', 'file-text'), I('vendors', 'Vendors', 'toolbox'), I('gate', 'Gate', 'shield-check'),
    I('audit', 'Audit trail', 'clock-counter-clockwise'), I('settings', 'Settings', 'gear-six')],
  guard: [I('gate', 'Gate', 'shield-check'), I('gatelog', 'Log', 'clock-counter-clockwise')],
};

/** Permission and feature gate per page, as in the existing web app (PAGE_RULE). Missing data means allowed. */
export function pageAllowed(me: Me, key: string): boolean {
  const feat = (f: keyof NonNullable<Me['features']>) => !me.features || me.features[f] !== false;
  const can = (p: string) => me.role === 'admin' || !Array.isArray(me.permissions) || me.permissions.includes(p);
  const isAdmin = me.role === 'admin';
  switch (key) {
    case 'raise': return can('request.create');
    case 'emergency': return feat('emergency') && can('emergency.raise');
    case 'emergencies': return feat('emergency');
    case 'gatepass': return feat('gate') && can('gate.pass');
    case 'gate': return me.role === 'guard' || feat('gate');
    case 'household': return can('household.manage');
    case 'contacts': return feat('contacts') && (isAdmin || can('contacts.read'));
    case 'notices': return feat('notices') && (isAdmin || can('notice.read'));
    case 'lease': return can('lease.view');
    default: return true;
  }
}

export function navFor(me: Me): NavItem[] {
  const list = NAV[me.role === 'admin' ? 'admin' : me.role === 'guard' ? 'guard' : me.resident_type ?? 'owner'] ?? NAV.owner;
  return list.filter((i) => me.role === 'guard' || pageAllowed(me, i.key));
}

export const NAV_KEY = 'hp.nav';
export interface NavPrefs {
  pos: 'side' | 'top';
  hidden: boolean;
}

export function loadNavPrefs(): NavPrefs {
  try {
    const v = JSON.parse(localStorage.getItem(NAV_KEY) ?? 'null') as Partial<NavPrefs> | null;
    return { pos: v && v.pos === 'top' ? 'top' : 'side', hidden: !!(v && v.hidden) };
  } catch {
    return { pos: 'side', hidden: false };
  }
}

export function saveNavPrefs(p: NavPrefs): void {
  try {
    localStorage.setItem(NAV_KEY, JSON.stringify(p));
  } catch {
    /* storage blocked: the choice lasts for this visit only */
  }
}
