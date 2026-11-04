import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, type VehicleType } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { InlineConfirm } from '../components/Sheet';

export const VEHICLE_TYPES: [VehicleType, string, string][] = [
  ['car', 'car', 'Car'], ['bike', 'motorcycle', 'Bike'], ['scooter', 'scooter', 'Scooter'], ['other', 'dots-three-circle', 'Other'],
];
const info = (t: string) => VEHICLE_TYPES.find((x) => x[0] === t) ?? VEHICLE_TYPES[3];

export default function Vehicles() {
  const { me } = useAuth();
  const admin = me?.role === 'admin';
  const qc = useQueryClient();
  const [q, setQ] = useState('');
  const [confirm, setConfirm] = useState<number | null>(null);
  const [f, setF] = useState({ plate: '', type: 'car' as VehicleType, make: '', color: '', sticker: '' });
  const list = useQuery({ queryKey: ['vehicles'], queryFn: () => API.vehicles.list() });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['vehicles'] }); void qc.invalidateQueries({ queryKey: ['parking'] }); };
  const add = useMutation({
    mutationFn: () => API.vehicles.add({ plate: f.plate.trim(), type: f.type, make: f.make.trim(), color: f.color.trim(), sticker: f.sticker.trim() }),
    onSuccess: () => { setF({ plate: '', type: 'car', make: '', color: '', sticker: '' }); refresh(); },
  });
  const del = useMutation({
    mutationFn: (id: number) => API.vehicles.remove(id),
    onSuccess: () => { setConfirm(null); refresh(); },
  });
  const t = q.trim().toLowerCase();
  const rows = (list.data ?? []).filter((v) => !t || [v.plate, v.flat, v.owner_name, v.make].some((x) => (x ?? '').toLowerCase().includes(t)));
  const submit = (e: FormEvent) => { e.preventDefault(); add.mutate(); };
  return (
    <div className="page">
      <h1 className="hero-title">Vehicles</h1>
      {!admin && <p className="muted">Flat {me?.flat}</p>}
      {admin && (
        <div className="searchbar">
          <Icon name="magnifying-glass" />
          <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search plate, flat or owner" aria-label="Search vehicles" />
        </div>
      )}
      {!admin && (
        <form className="card form-card stack" onSubmit={submit}>
          <h2>Add a vehicle</h2>
          <div className="field"><label htmlFor="vpl">Number plate</label>
            <input id="vpl" required maxLength={20} autoCapitalize="characters" autoComplete="off" placeholder="MH 12 AB 1234" value={f.plate} onChange={(e) => setF({ ...f, plate: e.target.value })} /></div>
          <div className="tiles four" role="group" aria-label="Type">
            {VEHICLE_TYPES.map(([k, icon, label]) => (
              <button key={k} type="button" className={`tile ${f.type === k ? 'on' : ''}`} aria-pressed={f.type === k} onClick={() => setF({ ...f, type: k })}>
                <Icon name={icon} /><span>{label}</span>
              </button>
            ))}
          </div>
          <div className="row2">
            <div className="field"><label htmlFor="vmk">Make</label><input id="vmk" maxLength={40} value={f.make} onChange={(e) => setF({ ...f, make: e.target.value })} /></div>
            <div className="field"><label htmlFor="vcl">Colour</label><input id="vcl" maxLength={30} value={f.color} onChange={(e) => setF({ ...f, color: e.target.value })} /></div>
          </div>
          <div className="field"><label htmlFor="vst">Parking sticker</label><input id="vst" maxLength={30} value={f.sticker} onChange={(e) => setF({ ...f, sticker: e.target.value })} /></div>
          {add.error && <p className="banner err" role="alert">{add.error.message}</p>}
          <button type="submit" className="btn btn-primary btn-lg" disabled={add.isPending}><Icon name="plus-circle" /> Add vehicle</button>
        </form>
      )}
      {list.error && <p className="banner err" role="alert">{list.error.message}</p>}
      {del.error && <p className="banner err" role="alert">{del.error.message}</p>}
      {list.data && rows.length === 0 && <p className="muted">No vehicles found.</p>}
      <ul className="list">
        {rows.map((v) => (
          <li key={v.id} className="card veh">
            <span className="menu-ic"><Icon name={info(v.type)[1]} /></span>
            <div className="veh-t">
              <b className="plate">{v.plate}</b>
              <span className="muted small">{[info(v.type)[2], v.make, v.color].filter(Boolean).join(' · ')}</span>
              {admin && <span className="small">Flat {v.flat}{v.owner_name ? ` · ${v.owner_name}` : ''}</span>}
              {v.sticker && <span className="small">Sticker {v.sticker}</span>}
            </div>
            {confirm === v.id
              ? <InlineConfirm text={`Remove ${v.plate}?`} yes="Yes, remove" onYes={() => del.mutate(v.id)} onNo={() => setConfirm(null)} busy={del.isPending} />
              : <button type="button" className="btn btn-ghost" aria-label={`Remove ${v.plate}`} onClick={() => setConfirm(v.id)}><Icon name="trash" /></button>}
          </li>
        ))}
      </ul>
    </div>
  );
}
