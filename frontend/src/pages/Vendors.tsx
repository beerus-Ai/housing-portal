import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, type Vendor, type VendorBody } from '../api';
import { Icon } from '../components/Icon';
import { ConfirmButton, ErrorBanner } from '../components/ui';

const BLANK: VendorBody = { name: '', trade: '', phone: '' };

function VendorForm({ initial, submitLabel, busy, error, onSubmit, onCancel }: {
  initial: VendorBody; submitLabel: string; busy: boolean; error: Error | null; onSubmit: (b: VendorBody) => void; onCancel?: () => void;
}) {
  const [v, setV] = useState(initial);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (v.name.trim() && v.trade.trim()) onSubmit({ name: v.name.trim(), trade: v.trade.trim(), phone: v.phone.trim() });
  };
  return (
    <form className="stack" onSubmit={submit}>
      <div className="row3">
        <div className="field"><label htmlFor={`vn${submitLabel}`}>Name</label>
          <input id={`vn${submitLabel}`} value={v.name} maxLength={100} onChange={(e) => setV({ ...v, name: e.target.value })} /></div>
        <div className="field"><label htmlFor={`vt${submitLabel}`}>Trade</label>
          <input id={`vt${submitLabel}`} value={v.trade} maxLength={50} placeholder="Plumbing" onChange={(e) => setV({ ...v, trade: e.target.value })} /></div>
        <div className="field"><label htmlFor={`vp${submitLabel}`}>Phone</label>
          <input id={`vp${submitLabel}`} type="tel" value={v.phone} maxLength={20} onChange={(e) => setV({ ...v, phone: e.target.value })} /></div>
      </div>
      <ErrorBanner error={error} />
      <div className="row-actions">
        <button type="submit" className="btn btn-primary" disabled={busy || !v.name.trim() || !v.trade.trim()}>{submitLabel}</button>
        {onCancel && <button type="button" className="btn btn-ghost" onClick={onCancel}>Cancel</button>}
      </div>
    </form>
  );
}

function VendorRow({ v }: { v: Vendor }) {
  const qc = useQueryClient();
  const [edit, setEdit] = useState(false);
  const done = () => void qc.invalidateQueries({ queryKey: ['vendors'] });
  const save = useMutation({ mutationFn: (b: VendorBody) => API.vendors.update(v.id, b), onSuccess: () => { setEdit(false); done(); } });
  const del = useMutation({ mutationFn: () => API.vendors.remove(v.id), onSuccess: done });
  if (edit) {
    return (
      <li className="card">
        <VendorForm initial={{ name: v.name, trade: v.trade, phone: v.phone ?? '' }} submitLabel="Save" busy={save.isPending} error={save.error}
          onSubmit={(b) => save.mutate(b)} onCancel={() => setEdit(false)} />
      </li>
    );
  }
  return (
    <li className="card stack">
      <div className="row-card nopad">
        <div><b>{v.name}</b><div className="muted small">{v.trade}{v.phone ? ` · ${v.phone}` : ''}</div></div>
        <div className="row-actions">
          <button type="button" className="btn btn-ghost" aria-label={`Edit ${v.name}`} onClick={() => setEdit(true)}><Icon name="pencil" /> Edit</button>
          <ConfirmButton label={<><Icon name="trash" /> Delete</>} ariaLabel={`Delete ${v.name}`} busy={del.isPending} onConfirm={() => del.mutate()} />
        </div>
      </div>
      <ErrorBanner error={del.error} />
    </li>
  );
}

export default function Vendors() {
  const qc = useQueryClient();
  const list = useQuery({ queryKey: ['vendors'], queryFn: API.vendors.list });
  const [key, setKey] = useState(0);
  const create = useMutation({
    mutationFn: (b: VendorBody) => API.vendors.create(b),
    onSuccess: () => { setKey((k) => k + 1); void qc.invalidateQueries({ queryKey: ['vendors'] }); },
  });
  return (
    <div className="page">
      <h1 className="hero-title">Vendors</h1>
      <section className="card stack form-card" aria-label="Add a vendor">
        <h2>Add a vendor</h2>
        <VendorForm key={key} initial={BLANK} submitLabel="Add vendor" busy={create.isPending} error={create.error} onSubmit={(b) => create.mutate(b)} />
      </section>
      <ErrorBanner error={list.error} />
      {list.data && list.data.length === 0 && <div className="card empty"><Icon name="toolbox" /><h2>No vendors yet</h2></div>}
      <ul className="list">{(list.data ?? []).map((v) => <VendorRow key={v.id} v={v} />)}</ul>
    </div>
  );
}
