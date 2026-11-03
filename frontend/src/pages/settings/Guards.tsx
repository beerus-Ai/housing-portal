import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API } from '../../api';
import { Icon } from '../../components/Icon';

export function GuardsPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['guards'], queryFn: API.gate.guards });
  const [f, setF] = useState({ name: '', email: '', password: '' });
  const [confirm, setConfirm] = useState<number | null>(null);
  const refresh = () => qc.invalidateQueries({ queryKey: ['guards'] });
  const add = useMutation({
    mutationFn: API.gate.addGuard,
    onSuccess: () => { setF({ name: '', email: '', password: '' }); void refresh(); },
  });
  const remove = useMutation({
    mutationFn: API.gate.removeGuard,
    onSuccess: () => { setConfirm(null); void refresh(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); add.mutate({ name: f.name.trim(), email: f.email.trim(), password: f.password }); };

  return (
    <div className="stack">
      <p className="muted">Guards sign in to the gate screen only. They cannot see residents’ requests or settings.</p>
      <form className="card stack form-card" onSubmit={submit}>
        <h3>Add a guard</h3>
        <div className="row3">
          <div className="field"><label htmlFor="g-name">Name</label><input id="g-name" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required /></div>
          <div className="field"><label htmlFor="g-email">Email</label><input id="g-email" type="email" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required /></div>
          <div className="field"><label htmlFor="g-pw">Password (8+)</label><input id="g-pw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} required /></div>
        </div>
        {add.error && <p className="banner err" role="alert">{add.error.message}</p>}
        <div><button type="submit" className="btn btn-primary" disabled={add.isPending}>{add.isPending ? 'Adding…' : 'Add guard'}</button></div>
      </form>
      {q.error && <p className="banner err" role="alert">{q.error.message}</p>}
      {remove.error && <p className="banner err" role="alert">{remove.error.message}</p>}
      {q.data && q.data.length === 0 && <p className="muted">No guards yet.</p>}
      <ul className="list">
        {(q.data ?? []).map((g) => (
          <li key={g.id} className="card row-card">
            <div><b>{g.name}</b><div className="muted small">{g.email}</div></div>
            {confirm === g.id ? (
              <div className="row-actions">
                <span className="small">Remove {g.name}?</span>
                <button type="button" className="btn btn-danger" disabled={remove.isPending} onClick={() => remove.mutate(g.id)}>Yes, remove</button>
                <button type="button" className="btn btn-ghost" onClick={() => setConfirm(null)}>Keep</button>
              </div>
            ) : (
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(g.id)} aria-label={`Remove ${g.name}`}><Icon name="trash" /> Remove</button>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
