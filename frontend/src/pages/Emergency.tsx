import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, type Emergency } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { stamp } from '../components/format';

export const EMERGENCY_TYPES: [key: string, icon: string, label: string][] = [
  ['lift', 'elevator', 'Stuck in lift'], ['medical', 'first-aid', 'Medical'], ['fire', 'fire', 'Fire'], ['theft', 'mask-sad', 'Theft'],
  ['threat', 'warning', 'Threat'], ['violence', 'hand-fist', 'Violence'], ['other', 'siren', 'Other'],
];
const typeInfo = (k: string) => EMERGENCY_TYPES.find((t) => t[0] === k) ?? EMERGENCY_TYPES[6];

function Row({ e, admin, onResolve, busy }: { e: Emergency; admin: boolean; onResolve?: () => void; busy?: boolean }) {
  const t = typeInfo(e.type);
  const active = e.status === 'active';
  return (
    <li className={`card em-row ${active ? 'live' : ''}`}>
      <span className="em-ic"><Icon name={t[1]} /></span>
      <div className="em-body">
        <b>{t[2]}</b>
        <span className="muted small">{admin ? `Flat ${e.flat ?? ''} · ${e.user_name} · ` : ''}{stamp(e.created_at)}</span>
        {e.note && <span className="small">{e.note}</span>}
      </div>
      <span className={`pill ${active ? 'pill-red' : 'st-approved'}`}>{active ? 'Active' : 'Resolved'}</span>
      {admin && active && (
        <button type="button" className="btn btn-primary em-resolve" disabled={busy} onClick={onResolve}>
          <Icon name="check-circle" /> Mark resolved
        </button>
      )}
    </li>
  );
}

function Resident() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [pick, setPick] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [sent, setSent] = useState(false);
  const list = useQuery({ queryKey: ['emergencies'], queryFn: API.emergencies.list, refetchInterval: 15_000 });
  const send = useMutation({
    mutationFn: () => API.emergencies.raise(pick as string, note.trim() || undefined),
    onSuccess: () => {
      setPick(null); setNote(''); setSent(true);
      void qc.invalidateQueries({ queryKey: ['emergencies'] });
    },
  });
  const sel = pick ? typeInfo(pick) : null;
  const close = () => { setPick(null); send.reset(); };
  return (
    <div className="page">
      <h1 className="hero-title">Emergency</h1>
      <p className="muted">Tap what is happening. The committee and security are alerted straight away.</p>
      {sent && <p className="banner ok" role="status">Alert sent. Help is on the way.</p>}
      <div className="emg-grid">
        {EMERGENCY_TYPES.map(([k, icon, label]) => (
          <button key={k} type="button" className="emg-tile" onClick={() => { setSent(false); setPick(k); }}>
            <span className="emg-tile-ic"><Icon name={icon} /></span>
            <b>{label}</b>
          </button>
        ))}
      </div>
      <section className="rail" aria-label="Recent alerts">
        <div className="rail-head"><h2>Recent alerts for your flat</h2></div>
        {list.error && <p className="banner err" role="alert">{list.error.message}</p>}
        {list.data && list.data.length === 0 && <p className="muted">No alerts raised.</p>}
        <ul className="list">{(list.data ?? []).map((e) => <Row key={e.id} e={e} admin={false} />)}</ul>
      </section>
      <p><Link to="/contacts" className="link">Who to call</Link></p>
      {sel && (
        <Sheet label="Confirm emergency alert" onClose={close}>
          <span className="emg-tile-ic big"><Icon name={sel[1]} /></span>
          <h2>Send {sel[2]} alert?</h2>
          <p className="muted">The committee and security will be told it is from Flat {me?.flat}.</p>
          <div className="field">
            <label htmlFor="enote">Note (optional)</label>
            <input id="enote" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </div>
          {send.error && <p className="banner err" role="alert">{send.error.message}</p>}
          <button type="button" className="btn btn-danger btn-lg btn-block" disabled={send.isPending} onClick={() => send.mutate()}>
            <Icon name="paper-plane-tilt" /> Send alert
          </button>
          <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={close}>Cancel</button>
        </Sheet>
      )}
    </div>
  );
}

function Committee() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['emergencies'], queryFn: API.emergencies.list, refetchInterval: 10_000 });
  const resolve = useMutation({
    mutationFn: (id: number) => API.emergencies.resolve(id),
    onSuccess: () => void qc.invalidateQueries({ queryKey: ['emergencies'] }),
  });
  const all = list.data ?? [];
  const active = all.filter((e) => e.status === 'active');
  const sorted = [...active, ...all.filter((e) => e.status !== 'active')];
  return (
    <div className="page">
      <h1 className="hero-title">Emergencies</h1>
      {active.length > 0
        ? <div className="emg-banner" role="status"><span className="dot-red" aria-hidden="true" /><b>{active.length} active</b></div>
        : <p className="card calm"><Icon name="check-circle" /> No active emergencies.</p>}
      {list.error && <p className="banner err" role="alert">{list.error.message}</p>}
      {resolve.error && <p className="banner err" role="alert">{resolve.error.message}</p>}
      <ul className="list">
        {sorted.map((e) => <Row key={e.id} e={e} admin busy={resolve.isPending} onResolve={() => resolve.mutate(e.id)} />)}
      </ul>
    </div>
  );
}

export default function EmergencyPage() {
  const { me } = useAuth();
  return me?.role === 'admin' ? <Committee /> : <Resident />;
}
