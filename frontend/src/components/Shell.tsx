import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { API } from '../api';
import { useAuth } from '../auth/AuthContext';
import {
  activeTab, loadNavPrefs, navSections, pageAllowed, saveNavPrefs, subPageInfo, tabsFor, type NavItem, type NavPrefs, type NavSection,
} from '../nav';
import { Icon } from './Icon';
import { Logo } from './Logo';

const PHONE_QUERY = '(max-width: 699px)';
const COLLAPSE_KEY = 'hp.navgroups';

/** True below 700px. Falls back to desktop where matchMedia is missing. */
export function useIsPhone(): boolean {
  const get = () => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia(PHONE_QUERY).matches;
  const [phone, setPhone] = useState(get);
  useEffect(() => {
    if (typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(PHONE_QUERY);
    const on = () => setPhone(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return phone;
}

function loadCollapsed(): string[] {
  try {
    const v: unknown = JSON.parse(localStorage.getItem(COLLAPSE_KEY) ?? '[]');
    return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

interface Counts { pending: number; emergencies: number }

function itemBadge(path: string, c: Counts) {
  if (path === '/approvals' && c.pending > 0) return <span className="badge">{c.pending}</span>;
  if (path === '/emergencies' && c.emergencies > 0) return <span className="badge badge-red" data-testid="emg-count">{c.emergencies}</span>;
  return null;
}
function itemLabel(i: NavItem, c: Counts) {
  if (i.path === '/approvals' && c.pending) return `${i.label}, ${c.pending} waiting`;
  if (i.path === '/emergencies' && c.emergencies) return `${i.label}, ${c.emergencies} active`;
  return i.label;
}

function Link1({ i, c }: { i: NavItem; c: Counts }) {
  return (
    <NavLink to={i.path} end={i.path === '/'} className={({ isActive }) => `nav-link ${isActive ? 'on' : ''}`} aria-label={itemLabel(i, c)}>
      <Icon name={i.icon} />
      <span>{i.label}</span>
      {itemBadge(i.path, c)}
    </NavLink>
  );
}

/** Side layout: each section collapses on its own, the choice is remembered. */
function SideSection({ s, c, collapsed, toggle }: { s: NavSection; c: Counts; collapsed: boolean; toggle: () => void }) {
  const id = `sec-${s.title.replace(/\s+/g, '-').toLowerCase()}`;
  return (
    <div className="nav-group">
      <button type="button" className="nav-group-h" aria-expanded={!collapsed} aria-controls={id} onClick={toggle}>
        <span>{s.title}</span>
        <Icon name={collapsed ? 'caret-right' : 'caret-down'} />
      </button>
      {!collapsed && <div id={id} className="nav-group-items">{s.items.map((i) => <Link1 key={i.key} i={i} c={c} />)}</div>}
    </div>
  );
}

/** Top layout: a dropdown per section. */
function TopSection({ s, c }: { s: NavSection; c: Counts }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const loc = useLocation();
  useEffect(() => setOpen(false), [loc.pathname]);
  useEffect(() => {
    if (!open) return;
    const down = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    const key = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    document.addEventListener('mousedown', down);
    document.addEventListener('keydown', key);
    return () => { document.removeEventListener('mousedown', down); document.removeEventListener('keydown', key); };
  }, [open]);
  const here = s.items.some((i) => loc.pathname === i.path || loc.pathname.startsWith(i.path + '/'));
  const alert = s.items.reduce((n, i) => n + (i.path === '/emergencies' ? c.emergencies : 0), 0);
  return (
    <div className="dd" ref={ref}>
      <button type="button" className={`nav-link ${here ? 'on' : ''}`} aria-haspopup="true" aria-expanded={open} onClick={() => setOpen(!open)}>
        <span>{s.title}</span>
        {alert > 0 && <span className="dot-red" aria-hidden="true" />}
        <Icon name="caret-down" />
      </button>
      {open && <div className="dd-panel" role="group" aria-label={s.title}>{s.items.map((i) => <Link1 key={i.key} i={i} c={c} />)}</div>}
    </div>
  );
}

function BottomBar({ c }: { c: Counts }) {
  const { me } = useAuth();
  const loc = useLocation();
  if (!me) return null;
  const tabs = tabsFor(me);
  const cur = activeTab(me, loc.pathname);
  return (
    <nav className={`tabbar n${tabs.length}`} aria-label="Tabs">
      {tabs.map((t) => (
        <Link key={t.key} to={t.path} className={`tab-i ${cur === t.key ? 'on' : ''}`} aria-current={cur === t.key ? 'page' : undefined}
          aria-label={t.key === 'approvals' && c.pending ? `${t.label}, ${c.pending} waiting` : t.key === 'emergency' && c.emergencies ? `${t.label}, ${c.emergencies} active` : t.label}>
          <Icon name={t.icon} />
          <span>{t.label}</span>
          {t.key === 'approvals' && c.pending > 0 && <span className="badge">{c.pending}</span>}
          {t.key === 'emergency' && c.emergencies > 0 && <span className="badge badge-red" data-testid="emg-count">{c.emergencies}</span>}
        </Link>
      ))}
    </nav>
  );
}

function PhoneShell({ unread, counts }: { unread: number; counts: Counts }) {
  const { me, settings } = useAuth();
  const loc = useLocation();
  if (!me) return null;
  const sub = subPageInfo(me, loc.pathname);
  const fab = me.role === 'resident' && pageAllowed(me, 'raise') && !sub && loc.pathname !== '/raise';
  return (
    <div className={`shell phone ${sub ? 'has-sub' : ''}`}>
      {sub ? (
        <header className="phone-head sub">
          <Link to={sub.back} className="back-ic" aria-label="Back"><Icon name="arrow-left" /></Link>
          <h1 className="phone-title">{sub.title}</h1>
        </header>
      ) : (
        <header className="phone-head">
          <Logo size={40} />
          <div className="brand-t">
            <span className="eyebrow">{settings?.society_kind ?? ''}</span>
            <span className="brand-name">{settings?.society_name ?? 'Society'}</span>
          </div>
          {me.role !== 'guard' && (
            <Link to="/alerts" className="back-ic bell" aria-label={unread ? `Alerts, ${unread} unread` : 'Alerts'}>
              <Icon name="bell" />
              {unread > 0 && <span className="badge" data-testid="unread">{unread}</span>}
            </Link>
          )}
        </header>
      )}
      <main className="content" id="main"><Outlet /></main>
      {fab && <Link to="/raise" className="fab" aria-label="Raise a request"><Icon name="plus" /></Link>}
      <BottomBar c={counts} />
    </div>
  );
}

export function Shell() {
  const { me, settings, logout } = useAuth();
  const navigate = useNavigate();
  const phone = useIsPhone();
  const [prefs, setPrefs] = useState<NavPrefs>(loadNavPrefs);
  const [collapsed, setCollapsed] = useState<string[]>(loadCollapsed);
  useEffect(() => saveNavPrefs(prefs), [prefs]);
  useEffect(() => {
    try { localStorage.setItem(COLLAPSE_KEY, JSON.stringify(collapsed)); } catch { /* storage blocked */ }
  }, [collapsed]);

  const unread = useQuery({
    queryKey: ['unread'],
    queryFn: API.notifications.unreadCount,
    refetchInterval: 20_000,
    enabled: !!me,
  });
  const pending = useQuery({
    queryKey: ['users', 'pending'],
    queryFn: () => API.admin.users('pending'),
    enabled: me?.role === 'admin',
    refetchInterval: 30_000,
  });
  const emg = useQuery({
    queryKey: ['emergencies'],
    queryFn: API.emergencies.list,
    enabled: me?.role === 'admin' && me.features.emergency !== false,
    refetchInterval: 15_000,
  });

  if (!me) return null;
  const n = unread.data?.n ?? 0;
  const counts: Counts = { pending: pending.data?.length ?? 0, emergencies: me.role !== 'admin' ? 0 : (emg.data ?? []).filter((e) => e.status === 'active').length };
  if (phone) return <PhoneShell unread={n} counts={counts} />;

  const { primary, sections } = navSections(me);
  const top = prefs.pos === 'top';

  const doLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };
  const toggle = (t: string) => setCollapsed((c) => (c.includes(t) ? c.filter((x) => x !== t) : [...c, t]));

  return (
    <div className={`shell ${top ? 'top' : 'side'} ${prefs.hidden ? 'nav-hidden' : ''}`}>
      {prefs.hidden && (
        <button type="button" className="btn btn-primary nav-reveal" onClick={() => setPrefs({ ...prefs, hidden: false })} aria-label="Show menu">
          <Icon name="list" /> Menu
        </button>
      )}
      {!prefs.hidden && (
        <header className="nav">
          <div className="brand">
            <Logo size={44} />
            <div className="brand-t">
              <span className="eyebrow">{settings?.society_kind ?? ''}</span>
              <span className="brand-name">{settings?.society_name ?? 'Society'}</span>
            </div>
          </div>
          <nav aria-label="Main" className="nav-links">
            {primary.map((i) => <Link1 key={i.key} i={i} c={counts} />)}
            {sections.map((s) => top
              ? <TopSection key={s.title} s={s} c={counts} />
              : <SideSection key={s.title} s={s} c={counts} collapsed={collapsed.includes(s.title)} toggle={() => toggle(s.title)} />)}
          </nav>
          <div className="nav-tools">
            <NavLink to="/alerts" className={({ isActive }) => `nav-link ${isActive ? 'on' : ''}`} aria-label={n ? `Alerts, ${n} unread` : 'Alerts'}>
              <Icon name="bell" />
              <span>Alerts</span>
              {n > 0 && <span className="badge" data-testid="unread">{n}</span>}
            </NavLink>
            <button type="button" className="nav-link" onClick={() => setPrefs({ ...prefs, pos: top ? 'side' : 'top' })}
              title={top ? 'Move menu to the side' : 'Move menu to the top'} aria-label={top ? 'Move menu to the side' : 'Move menu to the top'}>
              <Icon name={top ? 'sidebar-simple' : 'align-top-simple'} />
              <span>{top ? 'Menu to side' : 'Menu to top'}</span>
            </button>
            <button type="button" className="nav-link" onClick={() => setPrefs({ ...prefs, hidden: true })} aria-label="Hide menu">
              <Icon name="eye-slash" />
              <span>Hide menu</span>
            </button>
            <Link to="/profile" className="who" aria-label="Your profile">
              <span className="avatar" aria-hidden="true">{me.name.slice(0, 1).toUpperCase()}</span>
              <span className="who-t"><b>{me.name}</b>{me.flat && <i>Flat {me.flat}</i>}</span>
            </Link>
            <button type="button" className="nav-link" onClick={doLogout} aria-label="Sign out">
              <Icon name="sign-out" />
              <span>Sign out</span>
            </button>
          </div>
        </header>
      )}
      <main className="content" id="main">
        <Outlet />
      </main>
    </div>
  );
}
