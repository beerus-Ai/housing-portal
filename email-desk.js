// Email desk: when no committee member has the dashboard open, every new complaint, review-queue message,
// registration and emergency is emailed to the committee (through an n8n workflow) with signed action buttons.
// A button opens /desk/<token>: a small confirm page. Confirming replays the SAME API route the dashboard uses
// (as the committee admin, over loopback), so validation, audit and resident notifications are identical.
//
// Env: ADMIN_EMAIL_WEBHOOK_URL (n8n webhook that sends the email; unset = feature off),
//      PUBLIC_URL (links; falls back to Render's RENDER_EXTERNAL_URL), EMAIL_ACTION_SECRET (link signing key).
const crypto = require('crypto');

const PRESENCE_MS = 30e3;            // dashboard counts as "open" if an admin polled /api/pulse in the last 30 s
const TOKEN_DAYS = 7;                // action links expire after a week
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

module.exports = function emailDesk({ q, one, run, log }) {
  // Signing key: stable across restarts when any of these env vars is set (the free host's SESSION_SECRET was not).
  const seed = process.env.EMAIL_ACTION_SECRET || process.env.ADMIN_PASSWORD || process.env.TELEGRAM_BOT_TOKEN || process.env.SESSION_SECRET;
  const key = seed ? crypto.createHash('sha256').update('email-desk:' + seed).digest() : crypto.randomBytes(32);
  const loopKey = crypto.randomBytes(24).toString('hex'); // proves an internal replay came from this process
  let adminSeen = 0;

  const b64 = s => Buffer.from(s).toString('base64url');
  const sign = s => crypto.createHmac('sha256', key).update(s).digest('base64url');
  const token = (k, id) => { const p = b64(JSON.stringify({ k, i: Number(id), e: Date.now() + TOKEN_DAYS * 864e5 })); return p + '.' + sign(p); };
  const readToken = t => {
    const [p, s] = String(t || '').split('.');
    if (!p || !s) return null;
    const a = Buffer.from(s), b = Buffer.from(sign(p));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
    try { const o = JSON.parse(Buffer.from(p, 'base64url').toString()); return o.e > Date.now() && ['request', 'review', 'emergency', 'user'].includes(o.k) ? o : null; } catch { return null; }
  };
  const base = () => (process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || 'http://localhost:' + (process.env.PORT || 3000)).replace(/\/$/, '');
  const deskAdmin = () => one("SELECT * FROM users WHERE role='admin' AND status='approved' ORDER BY id LIMIT 1");
  const label = s => String(s || '').replace('_', ' ');

  // ---- what each kind of item shows and which actions it offers (each action = one existing API route)
  const items = {
    request(id) {
      const r = one(`SELECT r.*, u.name AS requester, u.flat, v.name AS vendor, av.name AS ai_vendor FROM requests r JOIN users u ON u.id=r.user_id
        LEFT JOIN vendors v ON v.id=r.vendor_id LEFT JOIN vendors av ON av.id=r.ai_vendor_id WHERE r.id=?`, id);
      if (!r) return null;
      // Stage-driven: the NEXT step is always first and highlighted (open -> assign someone, assigned -> approve start,
      // in progress -> approve completion). Everything else (reassign, reply, skip ahead) stays available below it.
      const P = `/api/requests/${r.id}`;
      const vendors = r.status === 'closed' ? [] : q('SELECT id,name,trade FROM vendors ORDER BY (id=?) DESC, (trade=?) DESC, name', r.ai_vendor_id || 0, r.category).filter(v => v.id !== r.vendor_id);
      const assign = (v, next) => ({ do: 'assign-' + v.id, text: (r.vendor_id ? 'Reassign to ' : 'Assign ') + v.name + ' (' + v.trade + ')' + (v.id === r.ai_vendor_id ? ' - AI suggestion' : ''), method: 'POST', path: P + '/assign', body: { vendor_id: v.id }, primary: next, stage: true });
      const start = { do: 'start', text: 'Approve: start the work (in progress)', method: 'POST', path: P + '/status', body: { status: 'in_progress' }, stage: true };
      const close = { do: 'close', text: 'Approve: work is done (resolve)', method: 'POST', path: P + '/status', body: { status: 'closed' }, stage: true };
      const acts = [];
      let next = '';
      if (r.status === 'open') {
        next = 'Assign someone to this request';
        if (r.ai_action === 'assign_vendor' && r.ai_vendor) acts.push({ do: 'ai', text: 'Assign ' + r.ai_vendor + ' (AI suggestion)', method: 'POST', path: P + '/ai-action', primary: true, stage: true });
        vendors.forEach((v, i) => { if (!(r.ai_action === 'assign_vendor' && v.id === r.ai_vendor_id)) acts.push(assign(v, !acts.length && i === 0)); });
        if (!vendors.length && !acts.length) next = 'Add a vendor in the dashboard (Vendors), then assign';
      } else if (r.status === 'assigned') {
        next = 'Approve the next stage: start the work';
        acts.push({ ...start, primary: true }, { ...close, text: 'Skip ahead: mark resolved now' });
        vendors.forEach(v => acts.push(assign(v, false)));
      } else if (r.status === 'in_progress') {
        next = 'Approve the next stage: confirm the work is done';
        acts.push({ ...close, primary: true });
        vendors.forEach(v => acts.push(assign(v, false)));
      } else next = r.rating ? 'Finished and rated' : 'Resolved - waiting for the resident to rate it';
      if (r.ai_action === 'register_vehicle') acts.unshift({ do: 'ai', text: 'Approve AI suggestion: register the vehicle', method: 'POST', path: P + '/ai-action', primary: true, stage: true });
      if (r.ai_action) acts.push({ do: 'ai-dismiss', text: 'Dismiss AI suggestion', method: 'POST', path: P + '/ai-action/dismiss', quiet: true });
      acts.push({ do: 'reply', text: 'Reply to the resident', method: 'POST', path: P + '/comments', field: 'body' });
      const at = { open: 0, assigned: 1, in_progress: 2, closed: 3 }[r.status] || 0;
      return {
        title: `Request #${r.id}: ${r.title}`,
        stage: { steps: ['Open', 'Assigned', 'In progress', 'Resolved'], at, next },
        rows: [['Flat', r.flat], ['From', r.requester], ['Category', r.category], ['AI priority', r.ai_priority], ['Assigned to', r.vendor || 'Nobody yet'], ['Came in via', r.source || 'app'], ['Details', r.description]],
        acts, open: '/',
      };
    },
    review(id) {
      const m = one("SELECT m.*, u.name AS resident, u.flat FROM whatsapp_messages m LEFT JOIN users u ON u.id=m.user_id WHERE m.id=? AND m.direction='in'", id);
      if (!m) return null;
      const waiting = m.status === 'review';
      return {
        title: 'Message to check (' + (m.channel || 'whatsapp') + ')',
        rows: [['Flat', m.flat], ['From', m.resident], ['Message', m.body], ['State', waiting ? 'Waiting for you' : label(m.status)]],
        acts: waiting ? [{ do: 'create', text: 'Turn into a request', method: 'POST', path: `/api/admin/whatsapp/messages/${m.id}/create-request`, primary: true },
          { do: 'dismiss', text: 'Dismiss (not a request)', method: 'POST', path: `/api/admin/whatsapp/messages/${m.id}/dismiss` }] : [],
        open: '/',
      };
    },
    emergency(id) {
      const e = one('SELECT e.*, u.name AS resident, u.flat FROM emergencies e JOIN users u ON u.id=e.user_id WHERE e.id=?', id);
      if (!e) return null;
      return {
        title: 'EMERGENCY: ' + e.type + ' at flat ' + (e.flat || 'n/a'), urgent: true,
        rows: [['Flat', e.flat], ['From', e.resident], ['Type', e.type], ['Note', e.note], ['Status', e.status]],
        acts: e.status === 'active' ? [{ do: 'resolve', text: 'Mark emergency resolved', method: 'POST', path: `/api/emergencies/${e.id}/resolve`, primary: true }] : [],
        open: '/',
      };
    },
    user(id) {
      const u = one('SELECT * FROM users WHERE id=?', id);
      if (!u) return null;
      return {
        title: 'New registration: ' + u.name,
        rows: [['Name', u.name], ['Flat', u.flat], ['Type', u.resident_type], ['Email', u.email], ['Phone', u.phone], ['Status', u.status]],
        acts: u.status === 'pending' ? [{ do: 'approve', text: 'Approve', method: 'POST', path: `/api/admin/users/${u.id}/approve`, primary: true },
          { do: 'reject', text: 'Reject', method: 'POST', path: `/api/admin/users/${u.id}/reject` }] : [],
        open: '/',
      };
    },
  };

  // ---- outgoing email (built here, delivered by the n8n workflow)
  // Stage tracker (Open > Assigned > In progress > Resolved) with the current stage filled, plus the next step.
  const stageHtml = s => !s ? '' : `<table style="border-collapse:separate;border-spacing:4px 0;width:100%;margin:0 0 6px"><tr>${s.steps.map((n, i) =>
    `<td style="text-align:center;font-size:12px;font-weight:600;padding:8px 4px;border-radius:6px;${i < s.at ? 'background:#cbeeff;color:#006786' : i === s.at ? 'background:#0088b0;color:#fff' : 'background:#f3f2f2;color:#5d5a59'}">${esc(n)}</td>`).join('')}</tr></table>
<div style="font-size:15px;font-weight:700;margin:10px 0 14px">Next step: ${esc(s.next)}</div>`;
  const emailHtml = (it, t, done) => {
    const link = a => `${base()}/desk/${t}?do=${encodeURIComponent(a.do)}`;
    const btn = a => `<a href="${esc(link(a))}" style="display:inline-block;margin:0 8px 8px 0;padding:10px 14px;border-radius:8px;text-decoration:none;font-weight:600;${a.primary ? 'background:#0088b0;color:#fff' : 'background:#e9f8ff;color:#006786'}">${esc(a.text)}</a>`;
    const rows = it.rows.filter(r => r[1]).map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#5d5a59;vertical-align:top">${esc(k)}</td><td style="padding:4px 0">${esc(String(v).slice(0, 600))}</td></tr>`).join('');
    const shown = it.acts.filter(a => !a.quiet), main = shown.filter(a => a.primary), other = shown.filter(a => !a.primary);
    return `<div style="font-family:Arial,sans-serif;color:#201e1d;max-width:620px">
<div style="background:${it.urgent ? '#b3261e' : '#0a303e'};color:#fff;padding:16px 20px;border-radius:12px 12px 0 0;font-size:18px;font-weight:700">${esc(it.title)}</div>
<div style="background:#fff;border:1px solid #d7d3d3;border-top:0;padding:16px 20px;border-radius:0 0 12px 12px">
${done ? `<div style="background:#e9f8ff;border:1px solid #99e0ff;border-radius:8px;padding:10px 12px;margin-bottom:14px;font-size:14px">Done: ${esc(done)}</div>` : ''}
${stageHtml(it.stage)}
${main.map(btn).join('')}
${other.length ? `<div style="font-size:13px;color:#5d5a59;margin:8px 0">${main.length ? 'Or:' : 'Choose an action:'}</div>` + other.map(btn).join('') : ''}
<table style="font-size:14px;border-collapse:collapse;margin-top:14px">${rows}</table>
<div style="margin-top:12px;font-size:13px;color:#5d5a59">Each button asks you to confirm. <a href="${esc(base() + it.open)}" style="color:#006786">Open in the dashboard</a> · links expire in ${TOKEN_DAYS} days</div>
</div></div>`;
  };
  // opts.done: the stage change that triggered this follow-up email (shown at the top and in the subject).
  const alert = (kind, id, opts = {}) => {
    const url = process.env.ADMIN_EMAIL_WEBHOOK_URL;
    if (!url) return false;
    // Emergencies always go out; everything else only when no committee member has the dashboard open.
    if (kind !== 'emergency' && !opts.force && Date.now() - adminSeen < PRESENCE_MS) return false;
    const it = items[kind] && items[kind](id);
    if (!it) return false;
    const t = token(kind, id);
    const subject = (it.urgent ? '[URGENT] ' : '') + 'Sahyadri Heights: ' + it.title + (it.stage ? ' - next: ' + it.stage.next : '');
    const text = (opts.done ? 'Done: ' + opts.done + '\n' : '') + it.title + (it.stage ? '\nNext step: ' + it.stage.next : '') + '\n\n' + it.rows.filter(r => r[1]).map(([k, v]) => k + ': ' + v).join('\n') + '\n\nAct on it: ' + base() + '/desk/' + t;
    fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ kind, id, subject, html: emailHtml(it, t, opts.done), text }), signal: AbortSignal.timeout(15e3) })
      .then(r => log(null, kind === 'review' ? 'whatsapp' : kind, id, r.ok ? 'emailed_committee' : 'email_failed', 'HTTP ' + r.status))
      .catch(e => log(null, kind === 'review' ? 'whatsapp' : kind, id, 'email_failed', String(e.message || e).slice(0, 120)));
    return true;
  };

  // ---- the confirm page and the action replay
  const page = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title>
<style>body{margin:0;background:#f3f2f2;color:#201e1d;font:16px/1.5 Arial,sans-serif}main{max-width:640px;margin:0 auto;padding:24px 16px}
.card{background:#fff;border:1px solid #d7d3d3;border-radius:12px;padding:20px;margin-bottom:16px}h1{font-size:22px;margin:0 0 12px}
table{border-collapse:collapse;width:100%}td{padding:6px 12px 6px 0;vertical-align:top}td:first-child{color:#5d5a59;white-space:nowrap}
button{font:inherit;font-weight:600;border:0;border-radius:8px;padding:12px 16px;margin:0 8px 8px 0;cursor:pointer;background:#e9f8ff;color:#006786}
button.primary{background:#0088b0;color:#fff}textarea{width:100%;box-sizing:border-box;font:inherit;padding:10px;border:1px solid #d7d3d3;border-radius:8px;margin-bottom:8px}
.ok{background:#e9f8ff;border-color:#99e0ff}.err{background:#fff;border-color:#b3261e;color:#b3261e}.urgent h1{color:#b3261e}a{color:#006786}</style></head>
<body><main>${body}</main></body></html>`;
  const itemCard = it => `<div class="card${it.urgent ? ' urgent' : ''}"><h1>${esc(it.title)}</h1>${stageHtml(it.stage)}<table>${it.rows.filter(r => r[1]).map(([k, v]) => `<tr><td>${esc(k)}</td><td>${esc(v)}</td></tr>`).join('')}</table></div>`;
  const actForm = (t, a, chosen) => `<form method="post" action="/desk/${esc(t)}"><input type="hidden" name="do" value="${esc(a.do)}">${a.field ? `<textarea name="text" rows="3" maxlength="1000" required placeholder="Write your reply"></textarea>` : ''}<button class="${chosen || a.primary ? 'primary' : ''}">${esc(chosen ? 'Confirm: ' + a.text : a.text)}</button></form>`;

  const mount = (app, express) => {
    const form = express.urlencoded({ extended: false, limit: '20kb' });
    const noStore = (res) => res.set({ 'Cache-Control': 'no-store', 'Referrer-Policy': 'no-referrer', 'X-Robots-Tag': 'noindex' });
    app.get('/desk/:t', (req, res) => {
      noStore(res);
      const tk = readToken(req.params.t), it = tk && items[tk.k](tk.i);
      if (!it) return res.status(404).type('html').send(page('Link expired', '<div class="card err"><h1>This link has expired or is not valid</h1><p>Open the dashboard instead.</p></div>'));
      const chosen = it.acts.find(a => a.do === req.query.do);
      const rest = it.acts.filter(a => a !== chosen);
      res.type('html').send(page(it.title, itemCard(it) +
        (chosen ? `<div class="card"><p>Please confirm this action:</p>${actForm(req.params.t, chosen, true)}</div>` : '') +
        (rest.length ? `<div class="card"><p>${chosen ? 'Or choose something else:' : 'What would you like to do?'}</p>${rest.map(a => actForm(req.params.t, a)).join('')}</div>` : '<div class="card"><p>Nothing left to do on this item.</p></div>') +
        `<p><a href="${esc(it.open)}">Open in the dashboard</a></p>`));
    });
    app.post('/desk/:t', form, async (req, res) => {
      noStore(res);
      const tk = readToken(req.params.t), it = tk && items[tk.k](tk.i);
      const back = `<p><a href="/desk/${esc(req.params.t)}">Back to this item</a> · <a href="${esc(it ? it.open : '/')}">Open in the dashboard</a></p>`;
      if (!it) return res.status(404).type('html').send(page('Link expired', '<div class="card err"><h1>This link has expired or is not valid</h1></div>'));
      const a = it.acts.find(x => x.do === (req.body && req.body.do));
      if (!a) return res.status(409).type('html').send(page('Already handled', '<div class="card err"><h1>That action is no longer available</h1><p>Someone may have already handled it.</p></div>' + back));
      const adm = deskAdmin();
      if (!adm) return res.status(503).type('html').send(page('No admin', '<div class="card err"><h1>No committee admin account is active</h1></div>'));
      let body = a.body || null;
      if (a.field) { const v = String((req.body && req.body.text) || '').trim().slice(0, 1000); if (!v) return res.status(400).type('html').send(page('Missing text', '<div class="card err"><h1>Write a message first</h1></div>' + back)); body = { [a.field]: v }; }
      let status = 0, out = {};
      try {
        const r = await fetch(`http://127.0.0.1:${req.socket.localPort}${a.path}`, { method: a.method, headers: { 'content-type': 'application/json', 'x-desk-key': loopKey, 'x-desk-user': String(adm.id) }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(20e3) });
        status = r.status; out = await r.json().catch(() => ({}));
      } catch (e) { out = { error: 'Could not run the action: ' + (e.message || e) }; }
      if (status >= 200 && status < 300) {
        log(adm.id, tk.k === 'review' ? 'whatsapp' : tk.k, tk.i, 'email_action', a.text);
        const after = items[tk.k](tk.i);
        const nextActs = after ? after.acts.filter(x => !x.quiet) : [];
        // A stage change on a request sends a fresh email with the next step, so the job can be driven from the inbox.
        if (a.stage && tk.k === 'request' && after && after.acts.some(x => x.stage)) alert('request', tk.i, { done: a.text, force: true });
        return res.type('html').send(page('Done', `<div class="card ok"><h1>Done: ${esc(a.text)}</h1>${a.stage && tk.k === 'request' && after && after.acts.some(x => x.stage) ? '<p>We also emailed you the next step.</p>' : ''}</div>` +
          (after ? itemCard(after) : '') +
          (nextActs.length ? `<div class="card"><p>${after.stage ? 'Next step: <b>' + esc(after.stage.next) + '</b>' : 'What next?'}</p>${nextActs.map(x => actForm(req.params.t, x)).join('')}</div>` : '') +
          `<p><a href="${esc(it.open)}">Open in the dashboard</a></p>`));
      }
      res.status(status || 502).type('html').send(page('Not done', `<div class="card err"><h1>Not done</h1><p>${esc(out.error || 'The action failed')}</p></div>` + back));
    });
  };

  // auth() asks this first: a replay from mount() above acts as that admin. Only honoured over loopback with this process's key.
  const replayUser = req => {
    const k = req.get('x-desk-key');
    if (!k || k.length !== loopKey.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(loopKey))) return null;
    if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(req.socket.remoteAddress)) return null;
    return one("SELECT * FROM users WHERE id=? AND role='admin' AND status='approved'", Number(req.get('x-desk-user'))) || null;
  };

  return { alert, mount, replayUser, seen: () => { adminSeen = Date.now(); }, token, readToken };
};
