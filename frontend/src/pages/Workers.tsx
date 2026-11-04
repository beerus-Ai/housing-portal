import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, type Worker, type WorkerRole } from '../api';
import { Icon } from '../components/Icon';
import { InlineConfirm } from '../components/Sheet';

const ROLES: [WorkerRole, string, string][] = [
  ['security', 'Security', 'shield-check'], ['housekeeping', 'Housekeeping', 'broom'], ['maintenance', 'Maintenance', 'wrench'],
  ['gardener', 'Gardener', 'plant'], ['other', 'Other', 'dots-three-circle'],
];

interface Draft { name: string; role: WorkerRole; phone: string; shift: string; notes: string }
const blank: Draft = { name: '', role: 'security', phone: '', shift: '', notes: '' };

function WorkerForm({ initial, id, onDone }: { initial: Draft; id: number | null; onDone: () => void }) {
  const qc = useQueryClient();
  const [d, setD] = useState(initial);
  const save = useMutation({
    mutationFn: () => {
      const body = { name: d.name.trim(), role: d.role, phone: d.phone.trim(), shift: d.shift.trim(), notes: d.notes.trim() };
      return id == null ? API.workers.add(body) : API.workers.update(id, body);
    },
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['workers'] }); onDone(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate(); };
  return (
    <form className="card form-card stack" onSubmit={submit}>
      <h2>{id == null ? 'Add a worker' : 'Edit worker'}</h2>
      <div className="field"><label htmlFor="wkn">Name</label><input id="wkn" required maxLength={100} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} /></div>
      <div className="field"><label htmlFor="wkr">Role</label>
        <select id="wkr" value={d.role} onChange={(e) => setD({ ...d, role: e.target.value as WorkerRole })}>{ROLES.map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
      </div>
      <div className="row2">
        <div className="field"><label htmlFor="wkp">Phone</label><input id="wkp" type="tel" maxLength={20} value={d.phone} onChange={(e) => setD({ ...d, phone: e.target.value })} /></div>
        <div className="field"><label htmlFor="wks">Shift</label><input id="wks" maxLength={40} placeholder="6am to 2pm" value={d.shift} onChange={(e) => setD({ ...d, shift: e.target.value })} /></div>
      </div>
      <div className="field"><label htmlFor="wkt">Notes</label><input id="wkt" maxLength={300} value={d.notes} onChange={(e) => setD({ ...d, notes: e.target.value })} /></div>
      {save.error && <p className="banner err" role="alert">{save.error.message}</p>}
      <div className="row-actions">
        <button type="submit" className="btn btn-primary btn-lg" disabled={save.isPending}>Save</button>
        <button type="button" className="btn btn-ghost btn-lg" onClick={onDone}>Cancel</button>
      </div>
    </form>
  );
}

export default function Workers() {
  const qc = useQueryClient();
  const [edit, setEdit] = useState<number | 'new' | null>(null);
  const [confirm, setConfirm] = useState<number | null>(null);
  const list = useQuery({ queryKey: ['workers'], queryFn: API.workers.list });
  const refresh = () => void qc.invalidateQueries({ queryKey: ['workers'] });
  const toggle = useMutation({
    mutationFn: (w: Worker) => API.workers.update(w.id, { name: w.name, role: w.role, phone: w.phone ?? '', shift: w.shift ?? '', notes: w.notes ?? '', status: w.status === 'active' ? 'inactive' : 'active' }),
    onSuccess: refresh,
  });
  const del = useMutation({ mutationFn: (id: number) => API.workers.remove(id), onSuccess: () => { setConfirm(null); refresh(); } });
  const all = list.data ?? [];
  const editing = typeof edit === 'number' ? all.find((w) => w.id === edit) : undefined;
  return (
    <div className="page">
      <h1 className="hero-title">Workers</h1>
      {edit === 'new' && <WorkerForm initial={blank} id={null} onDone={() => setEdit(null)} />}
      {editing && (
        <WorkerForm key={editing.id} id={editing.id} onDone={() => setEdit(null)}
          initial={{ name: editing.name, role: editing.role, phone: editing.phone ?? '', shift: editing.shift ?? '', notes: editing.notes ?? '' }} />
      )}
      {edit === null && <button type="button" className="btn btn-primary btn-lg" onClick={() => setEdit('new')}><Icon name="user-plus" /> Add a worker</button>}
      {list.error && <p className="banner err" role="alert">{list.error.message}</p>}
      {(toggle.error || del.error) && <p className="banner err" role="alert">{(toggle.error ?? del.error)?.message}</p>}
      {list.data && all.length === 0 && <p className="muted">No workers yet.</p>}
      {ROLES.map(([k, label, icon]) => {
        const ws = all.filter((w) => (ROLES.some((r) => r[0] === w.role) ? w.role : 'other') === k);
        if (!ws.length) return null;
        return (
          <section key={k} className="rail" aria-label={label}>
            <h2>{label} <span className="muted small">{ws.length}</span></h2>
            <ul className="list">
              {ws.map((w) => (
                <li key={w.id} className={`card veh ${w.status === 'inactive' ? 'off' : ''}`}>
                  <span className="menu-ic"><Icon name={icon} /></span>
                  <div className="veh-t">
                    <b>{w.name}</b>
                    <span className="muted small">{w.shift || 'No shift set'}</span>
                    {w.phone && <a className="small" href={`tel:${w.phone.replace(/[^+\d]/g, '')}`}>{w.phone}</a>}
                    {w.notes && <span className="small">{w.notes}</span>}
                  </div>
                  <span className={`pill ${w.status === 'inactive' ? '' : 'st-approved'}`}>{w.status === 'inactive' ? 'Inactive' : 'Active'}</span>
                  {confirm === w.id
                    ? <InlineConfirm text={`Remove ${w.name}?`} yes="Yes, remove" onYes={() => del.mutate(w.id)} onNo={() => setConfirm(null)} busy={del.isPending} />
                    : (
                      <div className="row-actions">
                        <button type="button" className="btn btn-ghost" onClick={() => setEdit(w.id)}><Icon name="pencil-simple" /> Edit</button>
                        <button type="button" className="btn btn-ghost" disabled={toggle.isPending} onClick={() => toggle.mutate(w)}>{w.status === 'inactive' ? 'Activate' : 'Set inactive'}</button>
                        <button type="button" className="btn btn-ghost" aria-label={`Remove ${w.name}`} onClick={() => setConfirm(w.id)}><Icon name="trash" /></button>
                      </div>
                    )}
                </li>
              ))}
            </ul>
          </section>
        );
      })}
    </div>
  );
}
