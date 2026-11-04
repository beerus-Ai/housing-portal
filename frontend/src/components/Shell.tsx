import { useEffect, useState } from 'react';
import { NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { API } from '../api';
import { useAuth } from '../auth/AuthContext';
import { loadNavPrefs, navFor, saveNavPrefs, type NavPrefs } from '../nav';
import { Icon } from './Icon';
import { Logo } from './Logo';

export function Shell() {
  const { me, settings, logout } = useAuth();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState<NavPrefs>(loadNavPrefs);
  useEffect(() => saveNavPrefs(prefs), [prefs]);

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

  if (!me) return null;
  const items = navFor(me);
  const n = unread.data?.n ?? 0;
  const pendingN = pending.data?.length ?? 0;
  const top = prefs.pos === 'top';
  const label = (path: string, text: string) => (path === '/approvals' && pendingN ? `${text}, ${pendingN} waiting` : text);

  const doLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

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
            {items.map((i) => (
              <NavLink key={i.key} to={i.path} end={i.path === '/'} className={({ isActive }) => `nav-link ${isActive ? 'on' : ''}`}
                aria-label={label(i.path, i.label)}>
                <Icon name={i.icon} />
                <span>{i.label}</span>
                {i.path === '/approvals' && pendingN > 0 && <span className="badge">{pendingN}</span>}
              </NavLink>
            ))}
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
            <div className="who">
              <span className="avatar" aria-hidden="true">{me.name.slice(0, 1).toUpperCase()}</span>
              <span className="who-t"><b>{me.name}</b>{me.flat && <i>Flat {me.flat}</i>}</span>
            </div>
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
