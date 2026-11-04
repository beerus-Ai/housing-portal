import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { API } from '../../api';
import { Icon } from '../../components/Icon';

export function AiPanel() {
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ['admin-ai'], queryFn: API.admin.ai });
  const [phone, setPhone] = useState('');
  const [text, setText] = useState('');
  const [notice, setNotice] = useState('');
  const sim = useMutation({
    mutationFn: () => API.admin.simulateWhatsApp(phone.trim(), text.trim()),
    onSuccess: (r) => {
      setNotice(r.created ? `Request #${r.created} created from WhatsApp` : r.replies[0] ?? 'Message received');
      setText('');
      void qc.invalidateQueries({ queryKey: ['admin-ai'] });
      void qc.invalidateQueries({ queryKey: ['overview'] });
    },
  });
  const digest = useMutation({ mutationFn: API.admin.digest });
  if (q.error) return <p className="banner err" role="alert">{q.error.message}</p>;
  if (!q.data) return <p className="muted">Loading…</p>;
  const a = q.data;
  const url = `${location.origin}${a.webhook_path}?secret=${a.webhook_secret}`;
  const submit = (e: FormEvent) => { e.preventDefault(); if (phone.trim() && text.trim()) sim.mutate(); };
  const tiles: [string, string | number][] = [
    ['AI mode', a.mode === 'llm' ? 'AI model' : 'Keyword rules'],
    ['Requests via WhatsApp', a.counts.whatsapp_requests],
    ['Requests sorted by AI', a.counts.triaged],
    ['Escalate after', `${a.sla_hours} hours`],
  ];
  return (
    <div className="stack">
      <p className="muted">Residents can message the society's WhatsApp number. Each message becomes a request, sorted by AI, and status updates go back to the same chat. AI only suggests; the committee decides.</p>
      <div className="glance">
        {tiles.map(([l, v]) => <div key={l} className="card stat"><span className="muted small">{l}</span><b>{v}</b></div>)}
      </div>
      <p className="card calm">
        <Icon name="info" />
        <span>
          {a.whatsapp_live ? 'WhatsApp is connected: replies are sent to residents.' : 'WhatsApp is not connected yet, so replies are only logged below. Set WHATSAPP_TOKEN and WHATSAPP_PHONE_ID to send them.'}
          {a.mode === 'llm' ? '' : ' Set ANTHROPIC_API_KEY to let an AI model refine the sorting. Names, phone numbers and flat numbers are removed before anything is sent.'}
        </span>
      </p>
      <section className="card stack" aria-label="Connect WhatsApp">
        <h2>Connect WhatsApp</h2>
        <p>In your WhatsApp provider (Meta Cloud API, Twilio or similar), set the webhook to <code className="pre">{url}</code></p>
        <p className="muted small">Make sure each resident's phone number is on their profile. The flat is found from the number.</p>
      </section>
      <form className="card stack form-card" onSubmit={submit} aria-label="Try it">
        <h2>Try it</h2>
        <div className="field"><label htmlFor="sim-phone">Resident phone</label>
          <input id="sim-phone" inputMode="tel" maxLength={30} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Number on a resident profile" /></div>
        <div className="field"><label htmlFor="sim-text">WhatsApp message</label>
          <input id="sim-text" maxLength={300} value={text} onChange={(e) => setText(e.target.value)} placeholder="Lift is stuck on floor 3" /></div>
        {sim.error && <p className="banner err" role="alert">{sim.error.message}</p>}
        {notice && !sim.error && <p className="banner ok" role="status">{notice}</p>}
        <button type="submit" className="btn btn-primary" disabled={!phone.trim() || !text.trim() || sim.isPending}><Icon name="paper-plane-tilt" /> Send as resident</button>
      </form>
      <section className="card stack" aria-label="Weekly digest">
        <h2>Weekly digest</h2>
        <div><button type="button" className="btn btn-secondary" disabled={digest.isPending} onClick={() => digest.mutate()}><Icon name="sparkle" /> Write this week's digest</button></div>
        {digest.error && <p className="banner err" role="alert">{digest.error.message}</p>}
        {digest.data && <p className="card calm pre" data-testid="digest">{digest.data.text}</p>}
      </section>
      <section className="stack" aria-label="Messages">
        <h2>Messages</h2>
        {a.messages.length === 0 && <p className="muted">No messages yet.</p>}
        <ul className="list">
          {a.messages.map((m) => (
            <li key={m.id} className="card row-card">
              <div>
                <b>{m.direction === 'in' ? 'From' : 'To'} · {m.resident ?? m.phone}{m.flat ? ` · ${m.flat}` : ''}</b>
                <div className="muted small pre">{m.body}</div>
              </div>
              <span className="muted small">{m.status}{m.request_id ? ` · #${m.request_id}` : ''}</span>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
