import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { ago, CATEGORY_ICON, firstName, greeting } from '../components/format';

function Attention({ n, label, icon, to, tone }: { n: number; label: string; icon: string; to: string; tone: string }) {
  return (
    <Link to={to} className={`cardx attn ${tone}`}>
      <span className="cardx-ic"><Icon name={icon} /></span>
      <b className="big">{n}</b>
      <span className="cardx-sub">{label}</span>
    </Link>
  );
}

export function PendingApprovals() {
  const qc = useQueryClient();
  const pending = useQuery({ queryKey: ['users', 'pending'], queryFn: () => API.admin.users('pending') });
  const decide = useMutation({
    mutationFn: (v: { id: number; d: 'approve' | 'reject' }) => API.admin.decide(v.id, v.d),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['users'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
  const rows = pending.data ?? [];
  return (
    <section className="rail" aria-label="Pending approvals">
      <div className="rail-head"><h2>Pending approvals</h2></div>
      {decide.error && <p className="banner err" role="alert">{decide.error.message}</p>}
      {rows.length === 0 ? (
        <p className="muted rail-empty">{pending.isPending ? 'Loading…' : 'Nobody is waiting for approval.'}</p>
      ) : (
        <ul className="list">
          {rows.map((u) => (
            <li key={u.id} className="card row-card">
              <div>
                <b>{u.name}</b>
                <div className="muted small">{u.resident_type} · flat {u.flat} · {u.email}</div>
              </div>
              <div className="row-actions">
                <button type="button" className="btn btn-primary" disabled={decide.isPending} onClick={() => decide.mutate({ id: u.id, d: 'approve' })}>Approve</button>
                <button type="button" className="btn btn-ghost" disabled={decide.isPending} onClick={() => decide.mutate({ id: u.id, d: 'reject' })}>Reject</button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function Dashboard() {
  const { me } = useAuth();
  const stats = useQuery({ queryKey: ['stats'], queryFn: API.admin.stats, refetchInterval: 30_000 });
  const em = useQuery({ queryKey: ['emergencies'], queryFn: API.emergencies.list, enabled: me?.features.emergency !== false });
  const s = stats.data;
  const open = s ? s.by_status.filter((x) => x.status !== 'closed').reduce((a, x) => a + x.n, 0) : 0;
  const active = (em.data ?? []).filter((e) => e.status === 'active').length;
  const attention = s ? [
    { n: active, label: 'Active emergencies', icon: 'siren', to: '/emergencies', tone: 't-rose', show: em.data !== undefined },
    { n: s.pending_users, label: 'Waiting for approval', icon: 'user-check', to: '/approvals', tone: 't-sky', show: true },
    { n: s.unassigned, label: 'Requests without a vendor', icon: 'toolbox', to: '/requests', tone: 't-sand', show: true },
    { n: s.sla.overdue, label: 'Overdue past 48 hours', icon: 'clock-countdown', to: '/requests', tone: 't-ink', show: true },
    { n: s.awaiting_rating, label: 'Resolved, awaiting rating', icon: 'star', to: '/requests', tone: 't-sand', show: true },
  ].filter((a) => a.show && a.n > 0) : [];

  return (
    <div className="page">
      <h1 className="hero-title">{greeting()}, {me ? firstName(me.name) : ''}</h1>

      <section className="rail" aria-label="Needs your attention">
        <div className="rail-head"><h2>Needs your attention</h2></div>
        {stats.error && <p className="banner err" role="alert">{stats.error.message}</p>}
        {s && attention.length === 0 && <p className="card calm"><Icon name="check-circle" /> All clear. Nothing needs you right now.</p>}
        <div className="rail-track">
          {attention.map((a) => <Attention key={a.label} {...a} />)}
        </div>
      </section>

      {s && (
        <section className="rail" aria-label="At a glance">
          <div className="rail-head"><h2>At a glance</h2></div>
          <div className="glance">
            <div className="card stat"><span>Open requests</span><b>{open}</b></div>
            <div className="card stat"><span>Households</span><b>{s.households}</b></div>
            <div className="card stat"><span>Average rating</span><b>{s.avg_rating ?? '–'}</b></div>
            <div className="card stat"><span>Notices, 30 days</span><b>{s.notices_30d}</b></div>
          </div>
        </section>
      )}

      {s && s.oldest_open.length > 0 && (
        <section className="rail" aria-label="Oldest open requests">
          <div className="rail-head"><h2>Oldest open requests</h2><Link to="/requests" className="link">See all</Link></div>
          <div className="rail-track">
            {s.oldest_open.map((r) => (
              <Link key={r.id} to="/requests" className="cardx t-sky">
                <span className="cardx-ic"><Icon name={CATEGORY_ICON[r.category] ?? 'wrench'} /></span>
                <b className="cardx-title">{r.title}</b>
                <span className="cardx-foot">{ago(r.created_at)}</span>
              </Link>
            ))}
          </div>
        </section>
      )}

      <PendingApprovals />
    </div>
  );
}
