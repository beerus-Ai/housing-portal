import { useState, type FormEvent } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API, type RequestDetail, type RequestStatus } from '../api';
import { useAuth } from '../auth/AuthContext';
import { Icon } from '../components/Icon';
import { ago, CATEGORY_ICON } from '../components/format';
import { CATEGORIES, ErrorBanner, StatusPill, Tracker } from '../components/ui';

const STATUS_FILTERS: [string, string][] = [['', 'All'], ['open', 'Open'], ['assigned', 'Assigned'], ['in_progress', 'In progress'], ['closed', 'Closed']];
const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function RequestList() {
  const { me } = useAuth();
  const [params, setParams] = useSearchParams();
  const status = params.get('status') ?? '';
  const category = params.get('category') ?? '';
  const set = (k: string, v: string) => {
    const next = new URLSearchParams(params);
    if (v) next.set(k, v); else next.delete(k);
    setParams(next, { replace: true });
  };
  const list = useQuery({ queryKey: ['requests', { status, category }], queryFn: () => API.requests.list({ status, category }) });
  const rows = list.data ?? [];
  return (
    <div className="page">
      <div className="rail-head">
        <h1 className="hero-title">{me?.resident_type === 'family' ? 'Flat requests' : 'Requests'}</h1>
        {me?.role !== 'admin' && <Link to="/raise" className="btn btn-primary"><Icon name="plus-circle" /> Raise</Link>}
      </div>
      <div className="stack">
        <div className="tabs" role="group" aria-label="Filter by status">
          {STATUS_FILTERS.map(([v, l]) => (
            <button key={v} type="button" className={`tab ${status === v ? 'on' : ''}`} aria-pressed={status === v} onClick={() => set('status', v)}>{l}</button>
          ))}
        </div>
        <div className="toolbar">
          <label className="sr" htmlFor="cat-filter">Category</label>
          <select id="cat-filter" value={category} onChange={(e) => set('category', e.target.value)}>
            <option value="">All categories</option>
            {CATEGORIES.map((c) => <option key={c} value={c}>{cap(c)}</option>)}
          </select>
        </div>
      </div>
      <ErrorBanner error={list.error} />
      {list.isPending && <p className="muted">Loading…</p>}
      {list.data && rows.length === 0 && (
        <div className="card empty"><Icon name="list-checks" /><h2>No requests here</h2><p className="muted">Nothing matches these filters.</p></div>
      )}
      <ul className="list">
        {rows.map((r) => (
          <li key={r.id}>
            <Link to={`/requests/${r.id}`} className="card row-card rq-row">
              <span className="rq-ic"><Icon name={CATEGORY_ICON[r.category] ?? 'wrench'} /></span>
              <span className="rq-main">
                <b>{r.title}</b>
                <span className="muted small">{cap(r.category)} · Flat {r.flat ?? '–'} · {r.resident_name} · {ago(r.created_at)}</span>
              </span>
              <StatusPill request={r} />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}

function Stars({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div className="stars" role="radiogroup" aria-label="Rating">
      {[1, 2, 3, 4, 5].map((n) => (
        <button key={n} type="button" role="radio" aria-checked={value === n} aria-label={`${n} star${n > 1 ? 's' : ''}`}
          className={n <= value ? 'on' : ''} onClick={() => onChange(n)}>
          <Icon name="star" />
        </button>
      ))}
    </div>
  );
}

function Comments({ id }: { id: number }) {
  const qc = useQueryClient();
  const [text, setText] = useState('');
  const list = useQuery({ queryKey: ['comments', id], queryFn: () => API.requests.comments(id) });
  const add = useMutation({
    mutationFn: () => API.requests.addComment(id, text.trim()),
    onSuccess: () => { setText(''); void qc.invalidateQueries({ queryKey: ['comments', id] }); void qc.invalidateQueries({ queryKey: ['request', id] }); },
  });
  const submit = (e: FormEvent) => { e.preventDefault(); if (text.trim()) add.mutate(); };
  return (
    <section className="card stack" aria-label="Comments">
      <h2>Messages</h2>
      <ErrorBanner error={list.error} />
      {list.data?.length === 0 && <p className="muted">No messages yet.</p>}
      <ul className="list">
        {(list.data ?? []).map((c) => (
          <li key={c.id} className={`bubble ${c.role === 'admin' ? 'staff' : ''}`}>
            <span className="small muted"><b>{c.author}</b>{c.role === 'admin' ? ' · Committee' : ''} · {ago(c.created_at)}</span>
            <span>{c.body}</span>
          </li>
        ))}
      </ul>
      <form onSubmit={submit} className="stack">
        <div className="field">
          <label htmlFor="msg">Write a message</label>
          <input id="msg" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} placeholder="Type here" />
        </div>
        <ErrorBanner error={add.error} />
        <button type="submit" className="btn btn-primary" disabled={!text.trim() || add.isPending}>Send</button>
      </form>
    </section>
  );
}

function CommitteeActions({ r }: { r: RequestDetail }) {
  const qc = useQueryClient();
  const vendors = useQuery({ queryKey: ['vendors'], queryFn: API.vendors.list });
  const [vendor, setVendor] = useState('');
  const [note, setNote] = useState('');
  const done = () => {
    void qc.invalidateQueries({ queryKey: ['request', r.id] });
    void qc.invalidateQueries({ queryKey: ['requests'] });
    void qc.invalidateQueries({ queryKey: ['stats'] });
  };
  const assign = useMutation({ mutationFn: () => API.requests.assign(r.id, Number(vendor)), onSuccess: () => { setVendor(''); done(); } });
  const move = useMutation({
    mutationFn: (s: RequestStatus) => API.requests.setStatus(r.id, s, note.trim() || undefined),
    onSuccess: () => { setNote(''); done(); },
  });
  if (r.status === 'closed') return null;
  const busy = assign.isPending || move.isPending;
  return (
    <section className="card stack" aria-label="Committee actions">
      <h2>Committee</h2>
      <div className="toolbar">
        <div className="field grow">
          <label htmlFor="vendor">{r.vendor_id ? 'Change vendor' : 'Assign a vendor'}</label>
          <select id="vendor" value={vendor} onChange={(e) => setVendor(e.target.value)}>
            <option value="">Choose a vendor</option>
            {(vendors.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.name} ({v.trade})</option>)}
          </select>
        </div>
        <button type="button" className="btn btn-primary" disabled={!vendor || busy} onClick={() => assign.mutate()}>Assign</button>
      </div>
      {r.vendor_id && (
        <>
          <div className="field">
            <label htmlFor="note">Note (optional)</label>
            <input id="note" value={note} maxLength={300} onChange={(e) => setNote(e.target.value)} />
          </div>
          <div className="row-actions">
            {r.status === 'assigned' && <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => move.mutate('in_progress')}>Start work</button>}
            <button type="button" className="btn btn-primary" disabled={busy} onClick={() => move.mutate('closed')}>Mark resolved</button>
          </div>
        </>
      )}
      {!r.vendor_id && <p className="muted small">A vendor is needed before the request can move on.</p>}
      <ErrorBanner error={assign.error ?? move.error} />
    </section>
  );
}

function AiSuggestion({ r }: { r: RequestDetail }) {
  const qc = useQueryClient();
  const vendors = useQuery({ queryKey: ['vendors'], queryFn: API.vendors.list });
  const ai = r.ai!;
  const sv = ai.vendor_id ? (vendors.data ?? []).find((v) => v.id === ai.vendor_id) : undefined;
  const use = useMutation({
    mutationFn: (id: number) => API.requests.assign(r.id, id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['request', r.id] });
      void qc.invalidateQueries({ queryKey: ['requests'] });
      void qc.invalidateQueries({ queryKey: ['stats'] });
    },
  });
  return (
    <section className="card stack" aria-label="AI suggestion">
      <h2><Icon name="sparkle" /> AI suggestion{r.source === 'whatsapp' ? ' · came in on WhatsApp' : ''}</h2>
      <p>{cap(ai.category)} · <b>{ai.priority}</b> priority{r.escalated_at ? ' · escalated' : ''}</p>
      {ai.summary && <p className="muted">{ai.summary}</p>}
      {sv && r.status !== 'closed' && r.vendor_id !== sv.id && (
        <div className="row-actions">
          <span>Suggested vendor: <b>{sv.name}</b></span>
          <button type="button" className="btn btn-secondary" disabled={use.isPending} onClick={() => use.mutate(sv.id)}>Assign {sv.name}</button>
        </div>
      )}
      <ErrorBanner error={use.error} />
      <p className="muted small">Suggestion only. {ai.source === 'llm' ? 'Written by an AI model with personal details removed.' : 'Based on keyword rules.'} The committee decides.</p>
    </section>
  );
}

function Rate({ r }: { r: RequestDetail }) {
  const qc = useQueryClient();
  const [n, setN] = useState(0);
  const [comment, setComment] = useState('');
  const rate = useMutation({
    mutationFn: () => API.requests.rate(r.id, n, comment.trim() || undefined),
    onSuccess: () => { void qc.invalidateQueries({ queryKey: ['request', r.id] }); void qc.invalidateQueries({ queryKey: ['requests'] }); },
  });
  return (
    <section className="card stack" aria-label="Rate the work">
      <h2>How was the work?</h2>
      <Stars value={n} onChange={setN} />
      <div className="field">
        <label htmlFor="rc">Comment (optional)</label>
        <input id="rc" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} />
      </div>
      <ErrorBanner error={rate.error} />
      <button type="button" className="btn btn-primary" disabled={n === 0 || rate.isPending} onClick={() => rate.mutate()}>Submit rating</button>
    </section>
  );
}

export function RequestDetailPage() {
  const id = Number(useParams().id);
  const { me } = useAuth();
  const q = useQuery({ queryKey: ['request', id], queryFn: () => API.requests.get(id), enabled: Number.isInteger(id) });
  const r = q.data;
  return (
    <div className="page">
      <Link to="/requests" className="link"><Icon name="arrow-left" /> All requests</Link>
      {q.error && <div className="card empty"><h2>{q.error.message}</h2><Link to="/requests" className="btn btn-primary">Back to requests</Link></div>}
      {q.isPending && <p className="muted">Loading…</p>}
      {r && (
        <>
          <section className="card stack">
            <div className="rail-head">
              <h1>{r.title}</h1>
              <StatusPill request={r} />
            </div>
            <p className="muted">{r.category.charAt(0).toUpperCase() + r.category.slice(1)} · Flat {r.flat ?? '–'} · {r.resident_name} · {ago(r.created_at)}</p>
            <Tracker request={r} />
            {r.description && <p>{r.description}</p>}
            {r.has_photo && <img className="rq-photo" src={API.requests.photoUrl(r.id)} alt="Photo attached to the request" />}
            {r.vendor_name && <p><Icon name="toolbox" /> Assigned to <b>{r.vendor_name}</b></p>}
            {r.rating != null && (
              <p className="rated" aria-label={`Rated ${r.rating} of 5`}>
                <Icon name="star" /> <b>{r.rating} of 5</b>{r.rating_comment ? <span className="muted"> · {r.rating_comment}</span> : null}
              </p>
            )}
          </section>
          {me?.role === 'admin' && r.ai && <AiSuggestion r={r} />}
          {me?.role === 'admin' && <CommitteeActions r={r} />}
          {r.can_rate && <Rate r={r} />}
          {r.status === 'closed' && !r.rating && !r.can_rate && me?.role !== 'admin' && (
            <p className="card calm"><Icon name="info" /> Waiting for the flat owner to rate the work.</p>
          )}
          <Comments id={r.id} />
          <section className="card stack" aria-label="History">
            <h2>History</h2>
            <ul className="list history">
              {r.history.map((h, i) => (
                <li key={i}>
                  <b>{cap(h.action.replace('_', ' '))}</b>{h.detail ? <span> · {h.detail}</span> : null}
                  <span className="muted small"> · {h.actor ?? 'System'} · {ago(h.created_at)}</span>
                </li>
              ))}
            </ul>
          </section>
        </>
      )}
    </div>
  );
}
