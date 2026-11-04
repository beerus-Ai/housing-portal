import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, type Overview } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { ago, CATEGORIES, CATEGORY_ICON, firstName, greeting } from '../components/format';

/** Dark teal attention card. A red dot marks live emergencies, nothing else on the page is red. */
function Attention({ n, label, icon, to, live, sub, tint }: { n: number; label: string; icon: string; to: string; live?: boolean; sub?: string; tint?: boolean }) {
  return (
    <Link to={to} className={`cardx attn ${tint ? 't-sky' : 't-ink'}`} aria-label={`${label}: ${n}${sub ? `, ${sub}` : ''}`}>
      <span className="cardx-ic"><Icon name={icon} />{live && n > 0 && <span className="dot-red" data-testid="live-dot" aria-hidden="true" />}</span>
      <b className="big">{n}</b>
      <span className="cardx-sub">{label}</span>
      {sub && <span className="cardx-foot">{sub}</span>}
    </Link>
  );
}

function Glance({ icon, n, label, sub, to, bar }: { icon: string; n: string | number; label: string; sub: string; to: string; bar?: number }) {
  return (
    <Link to={to} className="gl-card">
      <span className="gl-ic"><Icon name={icon} /></span>
      <span className="gl-num">{n}</span>
      <span className="gl-l">{label}</span>
      {bar != null && <span className="gl-bar"><span style={{ width: `${Math.max(0, Math.min(100, bar))}%` }} /></span>}
      <span className="gl-s">{sub}</span>
    </Link>
  );
}

const num = (v: number | undefined): number => Number(v) || 0;

function EstateGlance({ ov, gate, park }: { ov: Overview; gate: boolean; park: boolean }) {
  const r = ov.residents ?? {}, q = ov.requests ?? {}, g = ov.gate ?? {}, e = ov.estate ?? {}, l = ov.leases ?? {}, nt = ov.notices ?? {};
  const pt = num(e.parking_total), pa = num(e.parking_assigned);
  return (
    <section className="rail" aria-label="Estate at a glance">
      <div className="rail-head"><h2>Estate at a glance</h2></div>
      <div className="gl-grid">
        <Glance icon="users-three" n={num(r.approved)} label="Residents" sub={`${num(r.owners)} owners · ${num(r.tenants)} tenants · ${num(r.family)} family`} to="/settings" />
        <Glance icon="buildings" n={num(r.flats)} label="Flats occupied" sub="With an approved resident" to="/settings" />
        <Glance icon="clipboard-text" n={num(q.open)} label="Open requests" sub={`${num(q.unassigned)} unassigned · ${num(q.in_progress)} in progress`} to="/requests" />
        {gate && <Glance icon="shield-check" n={num(g.admitted_today)} label="Gate today" sub={`${num(g.denied_today)} denied`} to="/gate" />}
        {gate && <Glance icon="qr-code" n={num(g.active_passes)} label="Active passes" sub="Visitor passes" to="/gate" />}
        {gate && <Glance icon="shield-star" n={num(g.guards)} label="Guards" sub="Security accounts" to="/settings" />}
        {park && <Glance icon="car" n={num(e.vehicles)} label="Vehicles" sub="Registered" to="/vehicles" />}
        {park && <Glance icon="garage" n={`${pa}/${pt}`} label="Parking" sub={`${Math.max(0, pt - pa)} free`} to="/parking" bar={pt ? (pa * 100) / pt : 0} />}
        <Glance icon="hard-hat" n={num(e.workers_active)} label="Workers" sub={`${num(e.workers_inactive)} inactive`} to="/workers" />
        <Glance icon="storefront" n={num(e.vendors)} label="Vendors" sub="Contractors" to="/vendors" />
        <Glance icon="file-text" n={num(l.ending_60d)} label="Leases ending in 60 days" sub={`${num(l.tenants_without_lease)} tenants without a lease`} to="/leases" />
        <Glance icon="megaphone" n={num(nt.last_30d)} label="Notices, 30 days" sub="Posted" to="/notices" />
      </div>
    </section>
  );
}

function WhatsAppCard({ ai }: { ai: NonNullable<Overview['ai']> }) {
  const urgent = num(ai.urgent_open), esc = num(ai.escalated_open), n = num(ai.whatsapp_requests_30d);
  const hot = urgent + esc > 0;
  const sub = hot ? `${urgent} urgent · ${esc} escalated` : n ? 'AI sorted, nothing urgent' : 'AI triage is on';
  return <Attention n={n} label="Via WhatsApp" icon="chat-circle-text" to="/settings?tab=ai" sub={sub} tint={!hot} />;
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
  const overview = useQuery({ queryKey: ['overview'], queryFn: API.admin.overview, refetchInterval: 15_000 });
  const emgOn = me?.features.emergency !== false;
  const em = useQuery({ queryKey: ['emergencies'], queryFn: API.emergencies.list, enabled: emgOn, refetchInterval: 10_000 });
  const s = stats.data;
  const ov = overview.data;
  const gate = me?.features.gate !== false;
  const park = me?.features.parking !== false;
  const active = em.data ? em.data.filter((e) => e.status === 'active').length : num(ov?.emergencies?.active);
  const pending = ov?.residents ? num(ov.residents.pending) : s?.pending_users ?? 0;
  const unassigned = ov?.requests ? num(ov.requests.unassigned) : s?.unassigned ?? 0;
  const ready = !!(s || ov);

  return (
    <div className="page">
      <h1 className="hero-title">{greeting()}, {me ? firstName(me.name) : ''}</h1>

      <section className="rail" aria-label="Needs your attention">
        <div className="rail-head"><h2>Needs your attention</h2></div>
        {(stats.error || overview.error) && <p className="banner err" role="alert">{(stats.error ?? overview.error)?.message}</p>}
        {ready && (
          <div className="rail-track">
            {ov?.ai && <WhatsAppCard ai={ov.ai} />}
            <Attention n={pending} label="Pending approvals" icon="user-check" to="/approvals" />
            {emgOn && <Attention n={active} label="Active emergencies" icon="siren" to="/emergencies" live />}
            <Attention n={unassigned} label="Unassigned requests" icon="user-gear" to="/requests" />
            {s && <Attention n={s.sla.overdue} label="Past 48 hours" icon="timer" to="/requests" />}
          </div>
        )}
      </section>

      {ov && <EstateGlance ov={ov} gate={gate} park={park} />}

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

      <section className="rail" aria-label="By category">
        <div className="rail-head"><h2>By category</h2></div>
        <div className="rail-track">
          {CATEGORIES.map(([k, label, icon]) => (
            <Link key={k} to={`/requests?category=${k}`} className="cardx cat-card">
              <span className="cardx-ic"><Icon name={icon} /></span>
              <b className="cardx-title">{label}</b>
              <span className="cardx-sub">See requests</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

