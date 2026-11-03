import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { ErrorBanner } from '../components/ui';

const EMPTY = { name: '', email: '', phone: '', resident_type: 'family' as 'family' | 'tenant', password: '', consent: false };

export default function Household() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const owner = me?.resident_type === 'owner';
  const [f, setF] = useState(EMPTY);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');
  const list = useQuery({ queryKey: ['household'], queryFn: API.household.list });
  const add = useMutation({
    mutationFn: () => API.household.add({ ...f, name: f.name.trim(), email: f.email.trim() }),
    onSuccess: () => {
      setMsg(`${f.name.trim()} was added. The committee will approve the account.`);
      setF(EMPTY);
      void qc.invalidateQueries({ queryKey: ['household'] });
    },
  });
  const set = <K extends keyof typeof EMPTY>(k: K, v: (typeof EMPTY)[K]) => setF((x) => ({ ...x, [k]: v }));
  const submit = (e: FormEvent) => {
    e.preventDefault();
    setMsg('');
    if (!f.name.trim()) return setErr('Enter a name');
    if (!/^\S+@\S+\.\S+$/.test(f.email.trim())) return setErr('Enter a valid email');
    if (f.password.length < 8) return setErr('The temporary password needs at least 8 characters');
    if (!f.consent) return setErr('Consent is required');
    setErr('');
    add.mutate();
  };
  return (
    <div className="page">
      <h1 className="hero-title">Household</h1>
      <ErrorBanner error={list.error} />
      <ul className="list">
        {(list.data ?? []).map((m) => (
          <li key={m.id} className="card row-card">
            <span className="user-main"><span className="avatar" aria-hidden="true">{m.name.slice(0, 1).toUpperCase()}</span>
              <span><b>{m.name}</b><span className="muted small"> · {m.resident_type ?? 'resident'}{m.phone ? ` · ${m.phone}` : ''}</span></span></span>
            <span className={`pill st-${m.status}`}>{m.status}</span>
          </li>
        ))}
      </ul>
      {list.data && list.data.length === 0 && <div className="card empty"><Icon name="users-three" /><h2>Nobody listed yet</h2></div>}
      {owner && (
        <form className="card stack form-card" onSubmit={submit} aria-label="Add a household member" noValidate>
          <h2>Add someone to your flat</h2>
          <div className="field">
            <label htmlFor="hn">Name</label>
            <input id="hn" value={f.name} onChange={(e) => set('name', e.target.value)} maxLength={100} />
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="he">Email</label>
              <input id="he" type="email" value={f.email} onChange={(e) => set('email', e.target.value)} />
            </div>
            <div className="field">
              <label htmlFor="hp">Phone</label>
              <input id="hp" type="tel" value={f.phone} onChange={(e) => set('phone', e.target.value)} />
            </div>
          </div>
          <div className="row2">
            <div className="field">
              <label htmlFor="ht">They are</label>
              <select id="ht" value={f.resident_type} onChange={(e) => set('resident_type', e.target.value as 'family' | 'tenant')}>
                <option value="family">Family member</option>
                <option value="tenant">Tenant</option>
              </select>
            </div>
            <div className="field">
              <label htmlFor="hw">Temporary password</label>
              <input id="hw" type="password" autoComplete="new-password" value={f.password} onChange={(e) => set('password', e.target.value)} />
            </div>
          </div>
          <label className="check">
            <input type="checkbox" checked={f.consent} onChange={(e) => set('consent', e.target.checked)} />
            <span>They agree to the processing of their data by the society.</span>
          </label>
          {err && <p className="banner err" role="alert">{err}</p>}
          <ErrorBanner error={add.error} />
          {msg && <p className="banner ok" role="status">{msg}</p>}
          <button type="submit" className="btn btn-primary" disabled={add.isPending}>Add to household</button>
        </form>
      )}
    </div>
  );
}
