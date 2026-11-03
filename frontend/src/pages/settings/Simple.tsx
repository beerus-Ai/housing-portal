import { useEffect, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, type FeatureKey, type Settings, type SettingsPatch } from '../../api';
import { Toggle } from '../../components/Toggle';

function useSettings() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-settings'], queryFn: API.admin.settings });
  const save = useMutation({
    mutationFn: (b: SettingsPatch) => API.admin.setSettings(b),
    onSuccess: (r: Settings) => {
      qc.setQueryData(['admin-settings'], r);
      void qc.invalidateQueries({ queryKey: ['settings'] });
      void qc.invalidateQueries({ queryKey: ['me'] });
    },
  });
  return { q, save };
}

function Status({ error, ok }: { error?: Error | null; ok: boolean }) {
  if (error) return <p className="banner err" role="alert">{error.message}</p>;
  return ok ? <p className="banner ok" role="status">Saved.</p> : null;
}

export function GeneralPanel() {
  const { q, save } = useSettings();
  const [name, setName] = useState('');
  const [kind, setKind] = useState('');
  useEffect(() => {
    if (q.data) { setName(q.data.society_name); setKind(q.data.society_kind); }
  }, [q.data]);
  if (q.error) return <p className="banner err" role="alert">{q.error.message}</p>;
  if (!q.data) return <p className="muted">Loading…</p>;
  const dirty = name !== q.data.society_name || kind !== q.data.society_kind;
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate({ society_name: name, society_kind: kind }); };
  return (
    <form className="card stack form-card" onSubmit={submit}>
      <div className="field"><label htmlFor="s-name">Society name</label>
        <input id="s-name" value={name} maxLength={100} onChange={(e) => setName(e.target.value)} required /></div>
      <div className="field"><label htmlFor="s-kind">Society type</label>
        <input id="s-kind" value={kind} maxLength={100} onChange={(e) => setKind(e.target.value)} required /></div>
      <Status error={save.error} ok={save.isSuccess && !dirty} />
      <div className="savebar" data-dirty={dirty}>
        <button type="button" className="btn btn-ghost" disabled={!dirty} onClick={() => { setName(q.data.society_name); setKind(q.data.society_kind); }}>Discard</button>
        <button type="submit" className="btn btn-primary" disabled={!dirty || save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}

const FEATURES: { key: FeatureKey; label: string; hint: string }[] = [
  { key: 'notices', label: 'Notices', hint: 'Notice board for residents' },
  { key: 'contacts', label: 'Contacts', hint: 'Society phone directory' },
  { key: 'gate', label: 'Gate passes', hint: 'Visitor passes and the guard gate' },
  { key: 'emergency', label: 'Emergency alerts', hint: 'Raise and resolve emergencies' },
];

export function FeaturesPanel() {
  const { q, save } = useSettings();
  if (q.error) return <p className="banner err" role="alert">{q.error.message}</p>;
  if (!q.data) return <p className="muted">Loading…</p>;
  return (
    <div className="stack">
      <p className="muted">Switch whole areas of the portal on or off for everyone. Changes apply immediately.</p>
      <ul className="list">
        {FEATURES.map((f) => (
          <li key={f.key} className="card row-card">
            <div><b>{f.label}</b><div className="muted small">{f.hint}</div></div>
            <Toggle label={f.label} checked={q.data.features[f.key]} disabled={save.isPending}
              onChange={(v) => save.mutate({ features: { [f.key]: v } })} />
          </li>
        ))}
      </ul>
      <Status error={save.error} ok={false} />
    </div>
  );
}

export function SignInPanel() {
  const { q, save } = useSettings();
  const [id, setId] = useState('');
  useEffect(() => { if (q.data) setId(q.data.google_client_id); }, [q.data]);
  if (q.error) return <p className="banner err" role="alert">{q.error.message}</p>;
  if (!q.data) return <p className="muted">Loading…</p>;
  const dirty = id.trim() !== q.data.google_client_id;
  const submit = (e: FormEvent) => { e.preventDefault(); save.mutate({ google_client_id: id.trim() }); };
  return (
    <form className="card stack form-card" onSubmit={submit}>
      <p className="muted">Add a Google client ID to show “Continue with Google” on the sign-in page. It only signs in people who already have an approved account. Leave empty to turn it off.</p>
      <div className="field"><label htmlFor="s-gid">Google client ID</label>
        <input id="s-gid" value={id} maxLength={200} onChange={(e) => setId(e.target.value)} placeholder="1234-abc.apps.googleusercontent.com" autoComplete="off" spellCheck={false} /></div>
      <Status error={save.error} ok={save.isSuccess && !dirty} />
      <div className="savebar" data-dirty={dirty}>
        <button type="button" className="btn btn-ghost" disabled={!dirty} onClick={() => setId(q.data.google_client_id)}>Discard</button>
        <button type="submit" className="btn btn-primary" disabled={!dirty || save.isPending}>{save.isPending ? 'Saving…' : 'Save'}</button>
      </div>
    </form>
  );
}
