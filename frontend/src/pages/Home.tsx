import { useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { API } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { ago, CATEGORY_ICON, firstName, greeting, parseTs, STATUS_LABEL } from '../components/format';
import { navFor, pageAllowed } from '../nav';

const TONES = ['t-ink', 't-sky', 't-rose', 't-sand'] as const;

function Carousel({ title, to, empty, children, count }: { title: string; to?: string; empty: string; children: ReactNode; count: number }) {
  return (
    <section className="rail" aria-label={title}>
      <div className="rail-head">
        <h2>{title}</h2>
        {to && <Link to={to} className="link">See all</Link>}
      </div>
      {count === 0 ? <p className="muted rail-empty">{empty}</p> : <div className="rail-track">{children}</div>}
    </section>
  );
}

const CHIPS: Record<string, { label: string; icon: string; to: string }> = {
  raise: { label: 'Raise', icon: 'plus-circle', to: '/raise' },
  gatepass: { label: 'Visitor', icon: 'qr-code', to: '/gatepass' },
  contacts: { label: 'Contacts', icon: 'phone-call', to: '/contacts' },
  notices: { label: 'Notices', icon: 'megaphone', to: '/notices' },
  emergency: { label: 'Emergency', icon: 'siren', to: '/emergency' },
  household: { label: 'Household', icon: 'users-three', to: '/household' },
  lease: { label: 'Lease', icon: 'file-text', to: '/lease' },
};

export default function Home() {
  const { me } = useAuth();
  const [term, setTerm] = useState('');
  const showNotices = !!me && pageAllowed(me, 'notices');
  const showGate = !!me && pageAllowed(me, 'gatepass');
  const showHousehold = !!me && me.resident_type === 'owner' && pageAllowed(me, 'household');

  const requests = useQuery({ queryKey: ['requests'], queryFn: () => API.requests.list() });
  const notices = useQuery({ queryKey: ['notices'], queryFn: API.notices.list, enabled: showNotices });
  const passes = useQuery({ queryKey: ['passes'], queryFn: API.gate.passes, enabled: showGate });
  const household = useQuery({ queryKey: ['household'], queryFn: API.household.list, enabled: !!me?.flat });

  if (!me) return null;
  const t = term.trim().toLowerCase();
  const hit = (...s: (string | null | undefined)[]) => !t || s.some((x) => (x ?? '').toLowerCase().includes(t));

  const reqs = (requests.data ?? []).filter((r) => hit(r.title, r.category, r.status, r.vendor_name));
  const nts = (notices.data ?? []).filter((n) => hit(n.title, n.body));
  const gp = (passes.data ?? []).filter((p) => p.status === 'active').filter((p) => hit(p.visitor_name, p.purpose, p.code));
  const hh = (household.data ?? []).filter((m) => hit(m.name, m.resident_type));

  const chips = navFor(me).map((i) => CHIPS[i.key]).filter(Boolean);

  return (
    <div className="page">
      <h1 className="hero-title">{greeting()}, {firstName(me.name)}</h1>
      <form className="searchbar" role="search" onSubmit={(e) => e.preventDefault()}>
        <Icon name="magnifying-glass" />
        <input type="search" value={term} onChange={(e) => setTerm(e.target.value)} placeholder="Search your requests, notices, visitors" aria-label="Search" />
      </form>

      <nav className="chips" aria-label="Shortcuts">
        {chips.map((c) => (
          <Link key={c.to} to={c.to} className="chip">
            <span className="chip-dot"><Icon name={c.icon} /></span>
            <span>{c.label}</span>
          </Link>
        ))}
      </nav>

      <Carousel title="Your requests" to="/requests" count={reqs.length}
        empty={requests.isPending ? 'Loading…' : t ? 'Nothing matches.' : 'No requests yet. Raise one when something needs fixing.'}>
        {reqs.slice(0, 12).map((r, i) => (
          <Link key={r.id} to={`/requests`} className={`cardx ${TONES[i % TONES.length]}`}>
            <span className="cardx-ic"><Icon name={CATEGORY_ICON[r.category] ?? 'wrench'} /></span>
            <b className="cardx-title">{r.title}</b>
            <span className="cardx-sub">{STATUS_LABEL[r.status] ?? r.status}</span>
            <span className="cardx-foot">{ago(r.created_at)}</span>
          </Link>
        ))}
      </Carousel>

      {showNotices && (
        <Carousel title="Notices" to="/notices" count={nts.length} empty={notices.isPending ? 'Loading…' : 'No notices.'}>
          {nts.slice(0, 12).map((n, i) => (
            <article key={n.id} className={`cardx ${TONES[(i + 1) % TONES.length]}`}>
              <span className="cardx-ic"><Icon name="megaphone" /></span>
              <b className="cardx-title">{n.title}</b>
              <span className="cardx-sub clamp">{n.body}</span>
              <span className="cardx-foot">{n.author} · {ago(n.created_at)}</span>
            </article>
          ))}
        </Carousel>
      )}

      {showGate && (
        <Carousel title="Visitors and passes" to="/gatepass" count={gp.length} empty={passes.isPending ? 'Loading…' : 'No active visitor passes.'}>
          {gp.slice(0, 12).map((p, i) => (
            <article key={p.id} className={`cardx ${TONES[(i + 2) % TONES.length]}`}>
              <span className="cardx-ic"><Icon name="qr-code" /></span>
              <b className="cardx-title">{p.visitor_name}</b>
              <span className="cardx-sub">Code {p.code}</span>
              <span className="cardx-foot">until {parseTs(p.valid_until).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' })}</span>
            </article>
          ))}
        </Carousel>
      )}

      {(showHousehold || me.resident_type !== 'owner') && me.flat && (
        <Carousel title="Household" to={showHousehold ? '/household' : undefined} count={hh.length} empty={household.isPending ? 'Loading…' : 'No one else on this flat yet.'}>
          {hh.map((m, i) => (
            <article key={m.id} className={`cardx ${TONES[(i + 3) % TONES.length]}`}>
              <span className="cardx-ic"><Icon name="user-circle" /></span>
              <b className="cardx-title">{m.name}</b>
              <span className="cardx-sub">{m.resident_type ?? ''}</span>
              <span className="cardx-foot">{m.status === 'approved' ? 'Active' : m.status}</span>
            </article>
          ))}
        </Carousel>
      )}
    </div>
  );
}
