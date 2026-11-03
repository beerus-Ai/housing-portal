import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, type AdminUser, type AdminUserPatch, type ResidentType } from '../../api';
import { Icon } from '../../components/Icon';

type Panel = { id: number; kind: 'password' | 'remove' } | null;

function UserRow({ u }: { u: AdminUser }) {
  const qc = useQueryClient();
  const [panel, setPanel] = useState<Panel>(null);
  const [flat, setFlat] = useState(u.flat ?? '');
  const [pw, setPw] = useState('');
  const [note, setNote] = useState('');
  useEffect(() => setFlat(u.flat ?? ''), [u.flat]);

  const done = (msg: string) => { setNote(msg); setPanel(null); setPw(''); void qc.invalidateQueries({ queryKey: ['users'] }); };
  const patch = useMutation({ mutationFn: (b: AdminUserPatch) => API.admin.patchUser(u.id, b), onSuccess: () => done('Updated.') });
  const reset = useMutation({ mutationFn: () => API.admin.resetPassword(u.id, pw), onSuccess: () => done('Password reset.') });
  const remove = useMutation({ mutationFn: () => API.admin.removeUser(u.id), onSuccess: () => done('Removed.') });
  const err = patch.error ?? reset.error ?? remove.error;
  const busy = patch.isPending || reset.isPending || remove.isPending;
  const editable = u.role === 'resident' && u.status !== 'removed';

  return (
    <li className="card user-row">
      <div className="user-main">
        <span className="avatar" aria-hidden="true">{u.name.slice(0, 1).toUpperCase()}</span>
        <div>
          <b>{u.name}</b>
          <div className="muted small">{u.email}</div>
        </div>
        <span className={`pill st-${u.status}`}>{u.role === 'admin' ? 'committee' : u.status}</span>
      </div>
      {editable && (
        <div className="user-edit">
          <label className="inline"><span className="sr">Type for {u.name}</span>
            <select aria-label={`Type for ${u.name}`} value={u.resident_type ?? ''} disabled={busy}
              onChange={(e) => patch.mutate({ resident_type: e.target.value as ResidentType })}>
              <option value="owner">Owner</option><option value="tenant">Tenant</option><option value="family">Family</option>
            </select>
          </label>
          <form className="inline" onSubmit={(e) => { e.preventDefault(); if (flat.trim() && flat.trim() !== u.flat) patch.mutate({ flat: flat.trim() }); }}>
            <input aria-label={`Flat for ${u.name}`} value={flat} maxLength={20} onChange={(e) => setFlat(e.target.value)} className="flat-input" />
            <button type="submit" className="btn btn-ghost" disabled={busy || !flat.trim() || flat.trim() === (u.flat ?? '')}>Save flat</button>
          </form>
          {u.status === 'approved' && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => patch.mutate({ status: 'suspended' })}>
              <Icon name="pause-circle" /> Suspend
            </button>
          )}
          {u.status === 'suspended' && (
            <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => patch.mutate({ status: 'approved' })}>
              <Icon name="play-circle" /> Reactivate
            </button>
          )}
          <button type="button" className="btn btn-ghost" onClick={() => setPanel({ id: u.id, kind: 'password' })}><Icon name="key" /> Reset password</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPanel({ id: u.id, kind: 'remove' })}><Icon name="trash" /> Remove</button>
        </div>
      )}
      {panel?.kind === 'password' && (
        <form className="inline-confirm" onSubmit={(e) => { e.preventDefault(); reset.mutate(); }}>
          <input type="password" autoComplete="new-password" aria-label={`New password for ${u.name}`} placeholder="New password (8+ characters)"
            value={pw} onChange={(e) => setPw(e.target.value)} />
          <button type="submit" className="btn btn-primary" disabled={busy || pw.length < 8}>Set password</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPanel(null)}>Cancel</button>
        </form>
      )}
      {panel?.kind === 'remove' && (
        <div className="inline-confirm" role="group" aria-label={`Confirm removing ${u.name}`}>
          <span>Remove {u.name}? They will lose access.</span>
          <button type="button" className="btn btn-danger" disabled={busy} onClick={() => remove.mutate()}>Yes, remove</button>
          <button type="button" className="btn btn-ghost" onClick={() => setPanel(null)}>Keep</button>
        </div>
      )}
      {err && <p className="banner err" role="alert">{err.message}</p>}
      {note && !err && <p className="muted small" role="status">{note}</p>}
    </li>
  );
}

export function UsersPanel() {
  const [search, setSearch] = useState('');
  const [q, setQ] = useState('');
  const [status, setStatus] = useState('');
  useEffect(() => {
    const t = setTimeout(() => setQ(search.trim()), 250);
    return () => clearTimeout(t);
  }, [search]);
  const users = useQuery({ queryKey: ['users', 'all', status, q], queryFn: () => API.admin.allUsers({ status, q }) });

  return (
    <div className="stack">
      <div className="toolbar">
        <div className="searchbar small-bar">
          <Icon name="magnifying-glass" />
          <input type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, email or flat" aria-label="Search users" />
        </div>
        <select aria-label="Filter by status" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All people</option>
          <option value="approved">Active</option>
          <option value="pending">Pending</option>
          <option value="suspended">Suspended</option>
          <option value="rejected">Rejected</option>
          <option value="removed">Removed</option>
        </select>
      </div>
      {users.error && <p className="banner err" role="alert">{users.error.message}</p>}
      {users.data && users.data.length === 0 && <p className="muted">No one matches.</p>}
      <ul className="list">
        {(users.data ?? []).map((u) => <UserRow key={u.id} u={u} />)}
      </ul>
    </div>
  );
}
