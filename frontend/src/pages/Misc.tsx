import { useEffect } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API } from '../api';
import { Icon } from '../components/Icon';
import { ago } from '../components/format';
import { navFor } from '../nav';
import { useAuth } from '../auth/AuthContext';
import { PendingApprovals } from './Dashboard';

/** Pages that arrive in later phases of the migration. */
export function ComingSoon() {
  const { me } = useAuth();
  const loc = useLocation();
  const item = me ? navFor(me).find((i) => i.path === loc.pathname) : undefined;
  return (
    <div className="page">
      <div className="card empty">
        <Icon name={item?.icon ?? 'hammer'} />
        <h1>{item?.label ?? 'Coming soon'}</h1>
        <p className="muted">This page is moving to the new app in a later phase. It keeps working in the current portal meanwhile.</p>
        <Link to="/" className="btn btn-ghost">Back to home</Link>
      </div>
    </div>
  );
}

export function Approvals() {
  return <div className="page"><h1 className="hero-title">Approvals</h1><PendingApprovals /></div>;
}

export function Alerts() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['notifications'], queryFn: API.notifications.list });
  const mark = useMutation({
    mutationFn: API.notifications.markRead,
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['unread'] }),
  });
  const unread = (list.data ?? []).some((n) => !n.is_read);
  return (
    <div className="page">
      <div className="rail-head">
        <h1 className="hero-title">Alerts</h1>
        <button type="button" className="btn btn-ghost" disabled={!unread || mark.isPending}
          onClick={() => mark.mutate(undefined, { onSuccess: () => void list.refetch() })}>Mark all read</button>
      </div>
      {list.error && <p className="banner err" role="alert">{list.error.message}</p>}
      {list.data && list.data.length === 0 && <p className="card calm">No alerts yet.</p>}
      <ul className="list">
        {(list.data ?? []).map((n) => (
          <li key={n.id} className={`card row-card ${n.is_read ? '' : 'unread'}`}>
            <span>{n.message}</span>
            <span className="muted small">{ago(n.created_at)}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

export function NotFound() {
  useEffect(() => { document.title = 'Not found'; }, []);
  return <div className="page"><div className="card empty"><h1>Page not found</h1><Link to="/" className="btn btn-primary">Go home</Link></div></div>;
}
