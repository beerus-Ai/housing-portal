import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { InlineConfirm } from '../components/Sheet';

const ICONS = ['phone', 'briefcase', 'shield-check', 'wrench', 'elevator', 'first-aid', 'fire', 'drop'];

export default function Contacts() {
  const { me } = useAuth();
  const admin = me?.role === 'admin';
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['contacts'], queryFn: API.contacts.list });
  const [form, setForm] = useState({ name: '', role: '', phone: '', icon: 'phone' });
  const [confirm, setConfirm] = useState<number | null>(null);
  const refresh = () => void qc.invalidateQueries({ queryKey: ['contacts'] });
  const add = useMutation({
    mutationFn: () => API.contacts.create({ ...form, name: form.name.trim(), role: form.role.trim(), phone: form.phone.trim() }),
    onSuccess: () => { setForm({ name: '', role: '', phone: '', icon: 'phone' }); refresh(); },
  });
  const del = useMutation({
    mutationFn: (id: number) => API.contacts.remove(id),
    onSuccess: () => { setConfirm(null); refresh(); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); add.mutate(); };
  const rows = list.data ?? [];
  return (
    <div className="page">
      <h1 className="hero-title">Who to call</h1>
      {list.error && <p className="banner err" role="alert">{list.error.message}</p>}
      {list.data && rows.length === 0 && <p className="card calm">{admin ? 'No contacts yet. Add the first one below.' : 'The committee has not added any contacts yet.'}</p>}
      <ul className="list">
        {rows.map((c) => (
          <li key={c.id} className="card contact">
            <span className="menu-ic"><Icon name={c.icon || 'phone'} /></span>
            <div className="contact-t">
              <b>{c.name}</b>
              <span className="muted small">{c.role}</span>
              <a className="contact-ph" href={`tel:${c.phone.replace(/[^+\d]/g, '')}`}>{c.phone}</a>
            </div>
            {admin && (confirm === c.id
              ? <InlineConfirm text={`Delete ${c.name}?`} yes="Yes, delete" onYes={() => del.mutate(c.id)} onNo={() => setConfirm(null)} busy={del.isPending} />
              : <button type="button" className="btn btn-ghost" aria-label={`Delete ${c.name}`} onClick={() => setConfirm(c.id)}><Icon name="trash" /></button>)}
          </li>
        ))}
      </ul>
      {del.error && <p className="banner err" role="alert">{del.error.message}</p>}
      {admin && (
        <form className="card form-card stack" onSubmit={submit}>
          <h2>Add a contact</h2>
          <div className="row2">
            <div className="field"><label htmlFor="cn">Name</label><input id="cn" required maxLength={100} value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
            <div className="field"><label htmlFor="cr">Role</label><input id="cr" required maxLength={100} value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value })} /></div>
          </div>
          <div className="row2">
            <div className="field"><label htmlFor="cp">Phone</label><input id="cp" type="tel" required maxLength={40} value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} /></div>
            <div className="field"><label htmlFor="ci">Icon</label>
              <select id="ci" value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })}>{ICONS.map((i) => <option key={i}>{i}</option>)}</select>
            </div>
          </div>
          {add.error && <p className="banner err" role="alert">{add.error.message}</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={add.isPending}><Icon name="plus-circle" /> Add contact</button>
        </form>
      )}
    </div>
  );
}
