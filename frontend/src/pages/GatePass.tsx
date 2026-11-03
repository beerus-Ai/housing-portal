import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, type GatePass as Pass } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { Qr } from '../components/Qr';
import { InlineConfirm } from '../components/Sheet';
import { stamp } from '../components/format';

const STATUS: Record<string, string> = { active: 'Active', used: 'Used', cancelled: 'Cancelled', expired: 'Expired' };
const Tag = ({ s }: { s: string }) => <span className={`pill ${s === 'active' ? 'st-approved' : ''}`}>{STATUS[s] ?? s}</span>;

/** datetime-local value for a Date, in local time. */
const local = (d: Date) => new Date(d.getTime() - d.getTimezoneOffset() * 6e4).toISOString().slice(0, 16);

function PassCard({ p, onClose }: { p: Pass; onClose: () => void }) {
  const { me, settings } = useAuth();
  const qc = useQueryClient();
  const [ask, setAsk] = useState(false);
  const [msg, setMsg] = useState('');
  const cancel = useMutation({
    mutationFn: () => API.gate.cancel(p.id),
    onSuccess: () => { setAsk(false); void qc.invalidateQueries({ queryKey: ['passes'] }); },
  });
  const text = `Gate pass for ${p.visitor_name} at ${settings?.society_name ?? 'the society'}, Flat ${me?.flat}. Code ${p.code}. Valid until ${stamp(p.valid_until)}.`;
  const share = async () => {
    if (typeof navigator.share === 'function') {
      try { await navigator.share({ title: 'Gate pass', text }); } catch { /* cancelled */ }
      return;
    }
    try { await navigator.clipboard.writeText(text); setMsg('Pass details copied.'); } catch { setMsg('Could not copy. Read the code out instead.'); }
  };
  const copy = async () => {
    try { await navigator.clipboard.writeText(p.code); setMsg('Code copied.'); } catch { setMsg('Could not copy. Read the code out instead.'); }
  };
  return (
    <div className="card gp-card" aria-label="Pass details">
      <div className="gp-qr"><Qr value={p.qr || `HSP:${p.code}`} size={240} /></div>
      <span className="muted small">{p.visitor_name}{p.purpose ? ` · ${p.purpose}` : ''}</span>
      <div className="gp-code" aria-label="Pass code">{p.code}</div>
      <span className="muted small">Valid {stamp(p.valid_from)} to {stamp(p.valid_until)}</span>
      <Tag s={p.status} />
      {msg && <p className="banner ok" role="status">{msg}</p>}
      <div className="row-actions">
        <button type="button" className="btn btn-primary" onClick={share}><Icon name="share-network" /> Share</button>
        <button type="button" className="btn btn-ghost" onClick={copy}><Icon name="copy" /> Copy code</button>
      </div>
      {p.status === 'active' && (ask
        ? <InlineConfirm text="Cancel this pass? The visitor will be turned away." yes="Yes, cancel" no="Keep it" onYes={() => cancel.mutate()} onNo={() => setAsk(false)} busy={cancel.isPending} />
        : <button type="button" className="btn btn-ghost" onClick={() => setAsk(true)}><Icon name="x-circle" /> Cancel pass</button>)}
      {cancel.error && <p className="banner err" role="alert">{cancel.error.message}</p>}
      <button type="button" className="link" onClick={onClose}>Close</button>
    </div>
  );
}

function MyQr() {
  const qc = useQueryClient();
  const [ask, setAsk] = useState(false);
  const me = useQuery({ queryKey: ['gate-me'], queryFn: API.gate.me });
  const rotate = useMutation({
    mutationFn: API.gate.rotate,
    onSuccess: () => { setAsk(false); void qc.invalidateQueries({ queryKey: ['gate-me'] }); },
  });
  if (!me.data) return null;
  return (
    <section className="card gp-card" aria-label="My gate QR">
      <h2>My gate QR</h2>
      <div className="gp-qr"><Qr value={me.data.qr || `HSP:${me.data.token}`} size={200} /></div>
      <p className="muted small">Show this at the gate to walk in. The same code is on an NFC tag, so a tag can be tapped instead.</p>
      {ask
        ? <InlineConfirm text="Reset your QR? The old QR and any NFC tag stop working." yes="Yes, reset" no="Keep it" onYes={() => rotate.mutate()} onNo={() => setAsk(false)} busy={rotate.isPending} />
        : <button type="button" className="btn btn-ghost" onClick={() => setAsk(true)}><Icon name="arrows-clockwise" /> Reset my QR</button>}
      {rotate.error && <p className="banner err" role="alert">{rotate.error.message}</p>}
    </section>
  );
}

export default function GatePass() {
  const qc = useQueryClient();
  const { me } = useAuth();
  const [sel, setSel] = useState<number | null>(null);
  const now = new Date();
  const [f, setF] = useState({ visitor_name: '', purpose: '', valid_from: local(now), valid_until: local(new Date(now.getTime() + 864e5)) });
  const [err, setErr] = useState('');
  const passes = useQuery({ queryKey: ['passes'], queryFn: API.gate.passes });
  const create = useMutation({
    mutationFn: () => {
      const vf = new Date(f.valid_from), vu = new Date(f.valid_until);
      if (isNaN(vf.getTime()) || isNaN(vu.getTime()) || vu <= vf) throw new Error('Valid until must be after valid from.');
      return API.gate.pass({ visitor_name: f.visitor_name.trim(), purpose: f.purpose.trim(), valid_from: vf.toISOString(), valid_until: vu.toISOString() });
    },
    onSuccess: async (r) => {
      setErr('');
      setF({ ...f, visitor_name: '', purpose: '' });
      await qc.invalidateQueries({ queryKey: ['passes'] });
      setSel(r.id);
    },
    onError: (e: Error) => setErr(e.message),
  });
  const submit = (e: FormEvent) => { e.preventDefault(); setErr(''); create.mutate(); };
  const list = passes.data ?? [];
  const cur = list.find((p) => p.id === sel);
  return (
    <div className="page">
      <h1 className="hero-title">Gate pass</h1>
      {cur && <PassCard key={cur.id} p={cur} onClose={() => setSel(null)} />}
      <form className="card form-card stack" onSubmit={submit}>
        <h2>Invite a visitor</h2>
        <div className="field"><label htmlFor="gvn">Visitor name</label><input id="gvn" required maxLength={100} value={f.visitor_name} onChange={(e) => setF({ ...f, visitor_name: e.target.value })} /></div>
        <div className="field"><label htmlFor="gpu">Purpose (optional)</label><input id="gpu" maxLength={100} placeholder="e.g. Delivery, guest" value={f.purpose} onChange={(e) => setF({ ...f, purpose: e.target.value })} /></div>
        <div className="row2">
          <div className="field"><label htmlFor="gvf">Valid from</label><input id="gvf" type="datetime-local" required value={f.valid_from} onChange={(e) => setF({ ...f, valid_from: e.target.value })} /></div>
          <div className="field"><label htmlFor="gvu">Valid until</label><input id="gvu" type="datetime-local" required value={f.valid_until} onChange={(e) => setF({ ...f, valid_until: e.target.value })} /></div>
        </div>
        {err && <p className="banner err" role="alert">{err}</p>}
        <button type="submit" className="btn btn-primary btn-lg" disabled={create.isPending}><Icon name="qr-code" /> Create pass</button>
      </form>
      <section className="rail" aria-label="Passes">
        <div className="rail-head"><h2>Passes for Flat {me?.flat}</h2></div>
        {passes.error && <p className="banner err" role="alert">{passes.error.message}</p>}
        {passes.data && list.length === 0 && <p className="muted">No passes yet.</p>}
        <ul className="list">
          {list.map((p) => (
            <li key={p.id}>
              <button type="button" className="card row-card pass-row" onClick={() => setSel(p.id)} aria-label={`Open pass for ${p.visitor_name}`}>
                <span className="menu-ic"><Icon name="qr-code" /></span>
                <span className="pass-t"><b>{p.visitor_name}</b><span className="muted small">{stamp(p.valid_from)} to {stamp(p.valid_until)}</span></span>
                <Tag s={p.status} />
              </button>
            </li>
          ))}
        </ul>
      </section>
      <MyQr />
    </div>
  );
}
