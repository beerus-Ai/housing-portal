import { useState, type FormEvent } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { API } from '../api';
import { useAuth } from '../auth/AuthContext';
import { ErrorBanner } from '../components/ui';

export default function Profile() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const [name, setName] = useState(me?.name ?? '');
  const [phone, setPhone] = useState(me?.phone ?? '');
  const [saved, setSaved] = useState(false);
  const [cur, setCur] = useState('');
  const [next, setNext] = useState('');
  const [again, setAgain] = useState('');
  const [pwErr, setPwErr] = useState('');
  const [pwDone, setPwDone] = useState(false);

  const update = useMutation({
    mutationFn: () => API.profile.update({ name: name.trim(), phone: phone.trim() }),
    onSuccess: () => { setSaved(true); void qc.invalidateQueries({ queryKey: ['me'] }); },
  });
  const change = useMutation({
    mutationFn: () => API.profile.changePassword(cur, next),
    onSuccess: () => { setPwDone(true); setCur(''); setNext(''); setAgain(''); },
  });

  const saveProfile = (e: FormEvent) => { e.preventDefault(); setSaved(false); if (name.trim()) update.mutate(); };
  const savePw = (e: FormEvent) => {
    e.preventDefault();
    setPwDone(false);
    if (!cur) return setPwErr('Enter your current password');
    if (next.length < 8) return setPwErr('The new password needs at least 8 characters');
    if (next !== again) return setPwErr('The two new passwords do not match');
    setPwErr('');
    change.mutate();
  };

  return (
    <div className="page">
      <h1 className="hero-title">Profile</h1>
      <form className="card stack form-card" onSubmit={saveProfile} aria-label="Your details">
        <h2>Your details</h2>
        <p className="muted">{me?.email}{me?.flat ? ` · Flat ${me.flat}` : ''}</p>
        <div className="field">
          <label htmlFor="pn">Name</label>
          <input id="pn" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} />
        </div>
        <div className="field">
          <label htmlFor="pp">Phone</label>
          <input id="pp" type="tel" value={phone} maxLength={20} onChange={(e) => setPhone(e.target.value)} />
        </div>
        <ErrorBanner error={update.error} />
        {saved && <p className="banner ok" role="status">Details saved.</p>}
        <button type="submit" className="btn btn-primary" disabled={!name.trim() || update.isPending}>Save details</button>
      </form>
      <form className="card stack form-card" onSubmit={savePw} aria-label="Change password" noValidate>
        <h2>Change password</h2>
        <div className="field">
          <label htmlFor="pc">Current password</label>
          <input id="pc" type="password" autoComplete="current-password" value={cur} onChange={(e) => setCur(e.target.value)} />
        </div>
        <div className="row2">
          <div className="field">
            <label htmlFor="pnw">New password</label>
            <input id="pnw" type="password" autoComplete="new-password" value={next} onChange={(e) => setNext(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="pa">Repeat new password</label>
            <input id="pa" type="password" autoComplete="new-password" value={again} onChange={(e) => setAgain(e.target.value)} />
          </div>
        </div>
        {pwErr && <p className="banner err" role="alert">{pwErr}</p>}
        <ErrorBanner error={change.error} />
        {pwDone && <p className="banner ok" role="status">Password changed.</p>}
        <button type="submit" className="btn btn-primary" disabled={change.isPending}>Change password</button>
      </form>
    </div>
  );
}
