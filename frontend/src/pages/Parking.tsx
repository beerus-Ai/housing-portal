import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, type ParkingSlot, type SlotKind } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { InlineConfirm, Sheet } from '../components/Sheet';

function SlotSheet({ slot, onClose }: { slot: ParkingSlot; onClose: () => void }) {
  const qc = useQueryClient();
  const [flat, setFlat] = useState('');
  const [veh, setVeh] = useState('');
  const [ask, setAsk] = useState(false);
  const vehicles = useQuery({ queryKey: ['vehicles'], queryFn: () => API.vehicles.list() });
  const done = () => { void qc.invalidateQueries({ queryKey: ['parking'] }); onClose(); };
  const assign = useMutation({
    mutationFn: () => API.parking.assign(slot.id, { flat: flat.trim(), ...(veh ? { vehicle_id: Number(veh) } : {}) }),
    onSuccess: done,
  });
  const free = useMutation({ mutationFn: () => API.parking.free(slot.id), onSuccess: done });
  const del = useMutation({ mutationFn: () => API.parking.removeSlot(slot.id), onSuccess: done });
  const f = flat.trim().toLowerCase();
  const options = f ? (vehicles.data ?? []).filter((v) => v.flat.toLowerCase() === f) : [];
  const err = assign.error ?? free.error ?? del.error;
  return (
    <Sheet label={`Slot ${slot.code}`} onClose={onClose}>
      <h2>Slot {slot.code}</h2>
      <span className="muted">{[slot.level, slot.kind].filter(Boolean).join(' · ')}</span>
      {slot.flat ? (
        <>
          <p className="card calm">Assigned to flat <b>{slot.flat}</b>{slot.plate ? ` · ${slot.plate}` : ''}</p>
          <button type="button" className="btn btn-primary btn-lg btn-block" disabled={free.isPending} onClick={() => free.mutate()}><Icon name="arrow-u-up-left" /> Free this slot</button>
        </>
      ) : (
        <>
          <form className="stack" onSubmit={(e) => { e.preventDefault(); assign.mutate(); }}>
            <div className="field"><label htmlFor="pkflat">Flat</label><input id="pkflat" required maxLength={20} autoComplete="off" placeholder="B-304" value={flat} onChange={(e) => setFlat(e.target.value)} /></div>
            <div className="field"><label htmlFor="pkveh">Vehicle</label>
              <select id="pkveh" value={veh} onChange={(e) => setVeh(e.target.value)}>
                <option value="">{f ? 'No vehicle' : 'Type the flat first'}</option>
                {options.map((v) => <option key={v.id} value={v.id}>{v.plate} ({v.type})</option>)}
              </select>
            </div>
            <button type="submit" className="btn btn-primary btn-lg btn-block" disabled={assign.isPending}><Icon name="check-circle" /> Assign</button>
          </form>
          {ask
            ? <InlineConfirm text={`Delete slot ${slot.code}?`} yes="Yes, delete" onYes={() => del.mutate()} onNo={() => setAsk(false)} busy={del.isPending} />
            : <button type="button" className="btn btn-ghost btn-block" onClick={() => setAsk(true)}><Icon name="trash" /> Delete slot</button>}
        </>
      )}
      {err && <p className="banner err" role="alert">{err.message}</p>}
      <button type="button" className="btn btn-ghost btn-lg btn-block" onClick={onClose}>Close</button>
    </Sheet>
  );
}

function AddSlots() {
  const qc = useQueryClient();
  const [f, setF] = useState({ prefix: '', level: '', from: '1', count: '10', kind: 'car' as SlotKind });
  const add = useMutation({
    mutationFn: () => API.parking.addSlots({ prefix: f.prefix.trim(), level: f.level.trim() || undefined, from: Number(f.from), count: Number(f.count), kind: f.kind }),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['parking'] }); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); add.mutate(); };
  return (
    <form className="card form-card stack" onSubmit={submit}>
      <h2>Add slots</h2>
      <div className="row2">
        <div className="field"><label htmlFor="pkp">Prefix</label><input id="pkp" required maxLength={10} placeholder="B1-" value={f.prefix} onChange={(e) => setF({ ...f, prefix: e.target.value })} /></div>
        <div className="field"><label htmlFor="pkl">Level</label><input id="pkl" maxLength={30} placeholder="Basement 1" value={f.level} onChange={(e) => setF({ ...f, level: e.target.value })} /></div>
      </div>
      <div className="row3">
        <div className="field"><label htmlFor="pkf">From number</label><input id="pkf" type="number" min={1} max={9999} required value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
        <div className="field"><label htmlFor="pkc">How many</label><input id="pkc" type="number" min={1} max={200} required value={f.count} onChange={(e) => setF({ ...f, count: e.target.value })} /></div>
        <div className="field"><label htmlFor="pkk">Kind</label>
          <select id="pkk" value={f.kind} onChange={(e) => setF({ ...f, kind: e.target.value as SlotKind })}><option value="car">Car</option><option value="bike">Bike</option><option value="visitor">Visitor</option></select>
        </div>
      </div>
      {add.error && <p className="banner err" role="alert">{add.error.message}</p>}
      <button type="submit" className="btn btn-primary btn-lg" disabled={add.isPending}><Icon name="plus-circle" /> Add slots</button>
    </form>
  );
}

export default function Parking() {
  const { me } = useAuth();
  const admin = me?.role === 'admin';
  const [sel, setSel] = useState<number | null>(null);
  const q = useQuery({ queryKey: ['parking'], queryFn: API.parking.list });
  const slots = q.data?.slots ?? [];
  const sm = q.data?.summary ?? { total: 0, assigned: 0, free: 0 };
  const levels: Record<string, ParkingSlot[]> = {};
  slots.forEach((s) => { (levels[s.level || 'No level'] ??= []).push(s); });
  const cur = slots.find((s) => s.id === sel);
  return (
    <div className="page">
      <h1 className="hero-title">Parking</h1>
      {q.error && <p className="banner err" role="alert">{q.error.message}</p>}
      <div className="glance">
        <div className="card stat t-ink"><span>Total slots</span><b>{sm.total}</b></div>
        <div className="card stat"><span>Assigned</span><b>{sm.assigned}</b></div>
        <div className="card stat t-sky"><span>Free</span><b>{sm.free}</b></div>
      </div>
      {!admin && (
        <section className="rail" aria-label="Your slots">
          <h2>Your slots</h2>
          {q.data && slots.length === 0 && <p className="card calm">No slot is assigned to your flat yet. Ask the committee.</p>}
          <ul className="list">
            {slots.map((s) => (
              <li key={s.id} className="card veh">
                <span className="menu-ic"><Icon name="garage" /></span>
                <div className="veh-t"><b>{s.code}</b><span className="muted small">{[s.level, s.kind].filter(Boolean).join(' · ')}</span>{s.plate && <span className="small">{s.plate}</span>}</div>
              </li>
            ))}
          </ul>
        </section>
      )}
      {admin && (
        <>
          {Object.keys(levels).sort().map((k) => (
            <section key={k} className="rail" aria-label={k}>
              <h2>{k} <span className="muted small">{levels[k].filter((s) => s.flat).length} of {levels[k].length} assigned</span></h2>
              <div className="pk-grid">
                {levels[k].map((s) => (
                  <button key={s.id} type="button" className={`pk-slot ${s.flat ? 'taken' : 'free'}`} onClick={() => setSel(s.id)} aria-label={`Slot ${s.code}${s.flat ? `, flat ${s.flat}` : ', free'}`}>
                    <b>{s.code}</b><span className="small">{s.flat ?? 'Free'}</span>
                  </button>
                ))}
              </div>
            </section>
          ))}
          {q.data && slots.length === 0 && <p className="muted">No slots yet. Add some below.</p>}
          <AddSlots />
          {cur && <SlotSheet key={cur.id} slot={cur} onClose={() => setSel(null)} />}
        </>
      )}
    </div>
  );
}
