import type { Me } from './api';

export type NavGroup = 'Requests and safety' | 'Community' | 'Property' | 'Administration';
export const GROUPS: NavGroup[] = ['Requests and safety', 'Community', 'Property', 'Administration'];

export interface NavItem {
  key: string;
  path: string;
  label: string;
  icon: string;
  /** Section of the grouped menu. Undefined = primary item (home, dashboard, guard pages). */
  group?: NavGroup;
  /** One line shown on the phone Menu screen. */
  sub?: string;
}

const RS: NavGroup = 'Requests and safety';
const CO: NavGroup = 'Community';
const PR: NavGroup = 'Property';
const AD: NavGroup = 'Administration';
const I = (key: string, label: string, icon: string, group?: NavGroup, sub?: string, path = '/' + key): NavItem => ({ key, path, label, icon, group, sub });

const residentNav = (lease: NavItem[], household: NavItem[]): NavItem[] => [
  I('home', 'Home', 'house', undefined, undefined, '/'),
  I('requests', 'Requests', 'list-checks', RS, 'Track your requests'),
  I('raise', 'Raise a request', 'plus-circle', RS, 'Report a problem'),
  I('emergency', 'Emergency', 'siren', RS, 'Send an alert'),
  I('notices', 'Notices', 'megaphone', CO, 'News from the committee'),
  I('contacts', 'Contacts', 'phone-call', CO, 'Who to call'),
  ...household,
  I('vehicles', 'Vehicles', 'car', PR, 'Vehicles of your flat'),
  I('parking', 'Parking', 'garage', PR, 'Your slots'),
  ...lease,
  I('gatepass', 'Gate pass', 'qr-code', PR, 'Invite a visitor'),
];

const NAV: Record<string, NavItem[]> = {
  owner: residentNav([], [I('household', 'Household', 'users-three', CO, 'Family and tenants')]),
  tenant: residentNav([I('lease', 'My lease', 'file-text', PR, 'Your lease')], []),
  family: residentNav([], []).map((i) => (i.key === 'requests' ? { ...i, label: 'Flat requests' } : i)),
  admin: [
    I('dashboard', 'Dashboard', 'chart-bar', undefined, undefined, '/'),
    I('requests', 'Requests', 'list-checks', RS, 'Assign and resolve'),
    I('emergencies', 'Emergencies', 'siren', RS, 'Active alerts'),
    I('gate', 'Gate', 'shield-check', RS, 'Live entries and denials'),
    I('notices', 'Notices', 'megaphone', CO, 'News from the committee'),
    I('contacts', 'Contacts', 'phone-call', CO, 'Who to call'),
    I('vehicles', 'Vehicles', 'car', PR, 'Every registered vehicle'),
    I('parking', 'Parking', 'garage', PR, 'Slots and assignments'),
    I('leases', 'Leases', 'file-text', PR, 'Tenant leases'),
    I('approvals', 'Approvals', 'user-check', AD, 'New residents'),
    I('workers', 'Workers', 'hard-hat', AD, 'Staff and shifts'),
    I('vendors', 'Vendors', 'toolbox', AD, 'Contractors'),
    I('audit', 'Audit trail', 'clock-counter-clockwise', AD, 'Who changed what'),
    I('settings', 'Settings', 'gear-six', AD, 'Society, access, guards, features'),
  ],
  guard: [I('gate', 'Gate', 'shield-check'), I('gatelog', 'Log', 'clock-counter-clockwise'), I('profile', 'Profile', 'user-circle')],
};

export const PROFILE_ITEM: NavItem = I('profile', 'Profile', 'user-circle', undefined, 'Your details and password');

/** Permission and feature gate per page, as in the existing web app (PAGE_RULE). Missing data means allowed. */
export function pageAllowed(me: Me, key: string): boolean {
  const feat = (f: string) => !me.features || (me.features as Record<string, boolean | undefined>)[f] !== false;
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
    case 'vehicles': return feat('parking') && can('vehicle.manage');
    case 'parking': return feat('parking') && can('parking.view');
    default: return true;
  }
}

export function navFor(me: Me): NavItem[] {
  const list = NAV[me.role === 'admin' ? 'admin' : me.role === 'guard' ? 'guard' : me.resident_type ?? 'owner'] ?? NAV.owner;
  return list.filter((i) => me.role === 'guard' || pageAllowed(me, i.key));
}

export interface NavSection { title: NavGroup; items: NavItem[] }

/** Items split into the primary entry (home/dashboard) and the four named sections; empty sections are dropped. */
export function navSections(me: Me): { primary: NavItem[]; sections: NavSection[] } {
  const items = navFor(me);
  return {
    primary: items.filter((i) => !i.group),
    sections: GROUPS.map((title) => ({ title, items: items.filter((i) => i.group === title) })).filter((s) => s.items.length > 0),
  };
}

export interface Tab { key: string; label: string; icon: string; path: string }

/** Bottom tab bar for phones. The Emergency tab is dropped when the feature or permission is off. */
export function tabsFor(me: Me): Tab[] {
  const T = (key: string, label: string, icon: string, path: string): Tab => ({ key, label, icon, path });
  if (me.role === 'guard') {
    return [T('gate', 'Gate', 'shield-check', '/gate'), T('gatelog', 'Log', 'clock-counter-clockwise', '/gatelog'), T('profile', 'Profile', 'user-circle', '/profile')];
  }
  const menu = T('menu', 'Menu', 'squares-four', '/menu');
  if (me.role === 'admin') {
    return [T('home', 'Dashboard', 'chart-bar', '/'), T('requests', 'Requests', 'list-checks', '/requests'),
      ...(pageAllowed(me, 'emergencies') ? [T('emergency', 'Emergency', 'siren', '/emergencies')] : []),
      T('approvals', 'Approvals', 'user-check', '/approvals'), menu];
  }
  return [T('home', 'Home', 'house', '/'), T('requests', 'Requests', 'list-checks', '/requests'),
    ...(pageAllowed(me, 'emergency') ? [T('emergency', 'Emergency', 'siren', '/emergency')] : []),
    T('alerts', 'Alerts', 'bell', '/alerts'), menu];
}

/** Which bottom tab is highlighted for a path. Every sub-page belongs to a parent tab, anything else to Menu. */
export function activeTab(me: Me, pathname: string): string {
  const p = pathname.replace(/\/+$/, '') || '/';
  const first = '/' + (p.split('/')[1] ?? '');
  if (me.role === 'guard') return first === '/gatelog' ? 'gatelog' : first === '/profile' ? 'profile' : 'gate';
  if (p === '/') return 'home';
  if (first === '/requests' || first === '/raise') return 'requests';
  if (first === '/emergency' || first === '/emergencies') return 'emergency';
  if (first === '/alerts') return me.role === 'admin' ? 'menu' : 'alerts';
  if (first === '/approvals') return me.role === 'admin' ? 'approvals' : 'menu';
  return 'menu';
}

/** Title and parent path for the phone sub-page header. null on tab roots (those pages show their own heading). */
export function subPageInfo(me: Me, pathname: string): { title: string; back: string } | null {
  const p = pathname.replace(/\/+$/, '') || '/';
  if (p === '/' || p === '/menu') return null;
  if (tabsFor(me).some((t) => t.path === p)) return null;
  const first = '/' + (p.split('/')[1] ?? '');
  const all = [...navFor(me), PROFILE_ITEM, { key: 'alerts', path: '/alerts', label: 'Alerts', icon: 'bell' }];
  const item = all.find((i) => i.path === first);
  const back = first === '/raise' ? '/requests' : '/menu';
  return { title: item?.label ?? 'Back', back };
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
