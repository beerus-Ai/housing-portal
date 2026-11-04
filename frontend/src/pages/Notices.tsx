import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { ago } from '../components/format';
import { ConfirmButton, ErrorBanner } from '../components/ui';

export default function Notices() {
  const { me } = useAuth();
  const qc = useQueryClient();
  const admin = me?.role === 'admin';
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const list = useQuery({ queryKey: ['notices'], queryFn: API.notices.list });
  const refresh = () => { void qc.invalidateQueries({ queryKey: ['notices'] }); void qc.invalidateQueries({ queryKey: ['stats'] }); };
  const post = useMutation({
    mutationFn: () => API.notices.create({ title: title.trim(), body: body.trim() }),
    onSuccess: () => { setTitle(''); setBody(''); refresh(); },
  });
  const draft = useMutation({
    mutationFn: () => API.admin.draftNotice(body.trim() || title.trim()),
    onSuccess: (d) => { setTitle(d.title); setBody(d.body); },
  });
  const rough = (body.trim() || title.trim()).length;
  const del = useMutation({ mutationFn: (id: number) => API.notices.remove(id), onSuccess: refresh });
  const submit = (e: FormEvent) => { e.preventDefault(); if (title.trim() && body.trim()) post.mutate(); };
  return (
    <div className="page">
      <h1 className="hero-title">Notices</h1>
      {admin && (
        <form className="card stack form-card" onSubmit={submit} aria-label="Post a notice">
          <h2>Post a notice</h2>
          <div className="field">
            <label htmlFor="nt">Title</label>
            <input id="nt" value={title} maxLength={150} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="field">
            <label htmlFor="nb">Message</label>
            <textarea id="nb" rows={4} maxLength={5000} value={body} onChange={(e) => setBody(e.target.value)} />
          </div>
          <ErrorBanner error={post.error ?? draft.error} />
          {draft.isSuccess && <p className="banner ok" role="status">Draft ready. Check it before posting.</p>}
          <div className="row-actions">
            <button type="submit" className="btn btn-primary" disabled={!title.trim() || !body.trim() || post.isPending}>Post notice</button>
            <button type="button" className="btn btn-secondary" disabled={rough < 5 || draft.isPending} onClick={() => draft.mutate()}>
              <Icon name="sparkle" /> {draft.isPending ? 'Drafting…' : 'Draft with AI'}
            </button>
          </div>
          <span className="muted small">Type a few rough words in the message, then Draft with AI. At least 5 characters. Check the text before you post.</span>
        </form>
      )}
      <ErrorBanner error={list.error ?? del.error} />
      {list.data && list.data.length === 0 && <div className="card empty"><Icon name="megaphone" /><h2>No notices yet</h2></div>}
      <ul className="list">
        {(list.data ?? []).map((n) => (
          <li key={n.id} className="card stack">
            <div className="rail-head">
              <h2>{n.title}</h2>
              <span className="muted small">{ago(n.created_at)}</span>
            </div>
            <p className="pre">{n.body}</p>
            <div className="rail-head">
              <span className="muted small">By {n.author}</span>
              {admin && <ConfirmButton label={<><Icon name="trash" /> Delete</>} ariaLabel={`Delete ${n.title}`} busy={del.isPending} onConfirm={() => del.mutate(n.id)} />}
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
