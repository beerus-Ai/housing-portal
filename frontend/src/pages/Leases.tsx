import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, type LeaseBody, type LeaseRow } from '../api';
import { Icon } from '../components/Icon';
import { daysUntil, ErrorBanner } from '../components/ui';

export function daysLeftText(end: string, now = new Date()): string {
  const d = daysUntil(end, now);
  if (d < 0) return `Ended ${-d} day${d === -1 ? '' : 's'} ago`;
  if (d === 0) return 'Ends today';
  return `${d} day${d === 1 ? '' : 's'} left`;
}

const FIELDS: [keyof LeaseBody, string, string][] = [
  ['start_date', 'Start date', 'date'], ['end_date', 'End date', 'date'], ['owner_name', 'Owner name', 'text'], ['owner_phone', 'Owner phone', 'tel'],
  ['police_verified_on', 'Police verified on', 'date'], ['agreement', 'Agreement reference', 'text'], ['parking', 'Parking', 'text'],
];

function LeaseEditor({ row, onDone }: { row: LeaseRow; onDone: () => void }) {
  const qc = useQueryClient();
  const [f, setF] = useState<LeaseBody>({
    start_date: row.start_date ?? '', end_date: row.end_date ?? '', owner_name: row.owner_name ?? '', owner_phone: row.owner_phone ?? '',
    police_verified_on: row.police_verified_on ?? '', agreement: row.agreement ?? '', parking: row.parking ?? '',
  });
  const [err, setErr] = useState('');
  const save = useMutation({
    mutationFn: () => API.admin.setLease(row.user_id, f),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['leases'] }); onDone(); },
  });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!f.start_date || !f.end_date) return setErr('Start and end dates are required');
    if (f.end_date <= f.start_date) return setErr('The end date must be after the start date');
    setErr('');
    save.mutate();
  };
  return (
    <form className="stack" onSubmit={submit} aria-label={`Lease for ${row.name}`}>
      <div className="row2">
        {FIELDS.map(([k, label, type]) => (
          <div className="field" key={k}>
            <label htmlFor={`l-${row.user_id}-${k}`}>{label}</label>
            <input id={`l-${row.user_id}-${k}`} type={type} value={f[k]} onChange={(e) => setF({ ...f, [k]: e.target.value })} />
          </div>
        ))}
      </div>
      {err && <p className="banner err" role="alert">{err}</p>}
      <ErrorBanner error={save.error} />
      <div className="row-actions">
        <button type="submit" className="btn btn-primary" disabled={save.isPending}>Save lease</button>
        <button type="button" className="btn btn-ghost" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

export function Leases() {
  const list = useQuery({ queryKey: ['leases'], queryFn: API.admin.leases });
  const [editing, setEditing] = useState<number | null>(null);
  return (
    <div className="page">
      <h1 className="hero-title">Leases</h1>
      <ErrorBanner error={list.error} />
      {list.data && list.data.length === 0 && <div className="card empty"><Icon name="file-text" /><h2>No approved tenants yet</h2></div>}
      <ul className="list">
        {(list.data ?? []).map((r) => (
          <li key={r.user_id} className="card stack">
            <div className="row-card nopad">
              <div><b>{r.name}</b><div className="muted small">Flat {r.flat ?? '–'} · {r.email}</div></div>
              {r.end_date
                ? <span className={`pill ${daysUntil(r.end_date) <= 60 ? 'st-suspended' : 'st-approved'}`}>{daysLeftText(r.end_date)}</span>
                : <span className="pill st-pending">No lease yet</span>}
            </div>
            {editing === r.user_id
              ? <LeaseEditor row={r} onDone={() => setEditing(null)} />
              : (
                <div className="row-card nopad">
                  <span className="muted small">{r.start_date ? `${r.start_date} to ${r.end_date}${r.owner_name ? ` · Owner ${r.owner_name}` : ''}` : 'Set the lease dates for this tenant.'}</span>
                  <button type="button" className="btn btn-ghost" aria-label={`Edit lease for ${r.name}`} onClick={() => setEditing(r.user_id)}>
                    <Icon name="pencil" /> {r.start_date ? 'Edit' : 'Set lease'}
                  </button>
                </div>
              )}
          </li>
        ))}
      </ul>
    </div>
  );
}

export function MyLease() {
  const q = useQuery({ queryKey: ['lease'], queryFn: API.lease.get });
  const l = q.data;
  const rows: [string, string | undefined][] = l ? [
    ['Starts', l.start_date], ['Ends', l.end_date], ['Owner', l.owner_name], ['Owner phone', l.owner_phone],
    ['Police verified', l.police_verified_on], ['Agreement', l.agreement], ['Parking', l.parking],
  ] : [];
  return (
    <div className="page">
      <h1 className="hero-title">My lease</h1>
      <ErrorBanner error={q.error} />
      {q.data === null && <div className="card empty"><Icon name="file-text" /><h2>Not set yet</h2><p className="muted">The committee will add your lease details.</p></div>}
      {l && (
        <>
          <div className="card t-ink lease-hero">
            <span className="muted-on-ink">Time left on your lease</span>
            <b className="big" data-testid="days-left">{daysLeftText(l.end_date)}</b>
          </div>
          <dl className="card lease-dl">
            {rows.filter(([, v]) => v).map(([k, v]) => <div key={k}><dt className="muted small">{k}</dt><dd>{v}</dd></div>)}
          </dl>
        </>
      )}
    </div>
  );
}
