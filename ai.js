// AI workflows for the portal. Every function works with no API key (rule-based) so the app, tests and demos never depend on a network call.
// When ANTHROPIC_API_KEY is set the model refines the answer. Privacy rule from the brief: never send resident data to a model.
// Only the free text of a request is sent, after names, phone numbers, emails and flat numbers are stripped (see redact()).

const CATEGORIES = ['plumbing', 'electrical', 'lift', 'security', 'housekeeping', 'other'];
const PRIORITIES = ['urgent', 'high', 'normal', 'low'];

const KEYWORDS = {
  plumbing: ['tap', 'leak', 'pipe', 'drain', 'water', 'flush', 'toilet', 'sink', 'geyser', 'tank', 'seepage', 'overflow', 'sewage', 'bathroom'],
  electrical: ['light', 'fan', 'switch', 'socket', 'wire', 'spark', 'power', 'electric', 'mcb', 'bulb', 'short circuit', 'inverter', 'meter', 'tripping'],
  lift: ['lift', 'elevator', 'stuck in lift', 'lift door'],
  security: ['gate', 'guard', 'theft', 'stranger', 'suspicious', 'intruder', 'cctv', 'camera', 'visitor', 'lock', 'break-in', 'burglar'],
  housekeeping: ['garbage', 'trash', 'dustbin', 'clean', 'sweep', 'dirty', 'smell', 'stink', 'mosquito', 'pest', 'cockroach', 'garden', 'waste', 'litter'],
};
const URGENT = ['fire', 'smoke', 'spark', 'sparking', 'short circuit', 'electric shock', 'shock', 'gas leak', 'flood', 'flooding', 'stuck in lift', 'trapped', 'burst', 'sewage overflow', 'injury', 'unconscious', 'theft', 'break-in', 'burglar', 'intruder'];
const HIGH = ['no water', 'no power', 'power cut', 'not working', 'broken', 'overflow', 'leaking badly', 'blocked', 'lift not working', 'no electricity', 'foul smell', 'sewage'];
const LOW = ['when possible', 'whenever', 'no rush', 'minor', 'small', 'paint', 'cosmetic', 'suggestion'];

// Remove anything that identifies a person or a home before any model call.
function redact(text) {
  return String(text || '')
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/(\+?\d[\d\s-]{7,}\d)/g, '[phone]')
    .replace(/\b(flat|apt|apartment|unit)\s*#?\s*[A-Za-z]?[-\s]?\d{1,4}[A-Za-z]?\b/gi, '[flat]')
    .replace(/\b[A-Za-z]-?\d{3,4}\b/g, '[flat]')
    .slice(0, 1500);
}

const hit = (text, words) => words.filter(w => text.includes(w));

function triageRules(text, vendors = []) {
  const t = String(text || '').toLowerCase();
  let best = 'other', bestN = 0;
  for (const c of Object.keys(KEYWORDS)) {
    const n = hit(t, KEYWORDS[c]).length;
    if (n > bestN) { best = c; bestN = n; }
  }
  const urgent = hit(t, URGENT), high = hit(t, HIGH), low = hit(t, LOW);
  const priority = urgent.length ? 'urgent' : high.length ? 'high' : low.length ? 'low' : 'normal';
  const vendor = vendors.find(v => String(v.trade || '').toLowerCase() === best) || null;
  const first = String(text || '').trim().split(/(?<=[.!?])\s|\n/)[0].slice(0, 110);
  const confidence = bestN === 0 ? 0.3 : Math.min(0.95, 0.55 + bestN * 0.15);
  return { category: best, priority, summary: first, vendor_id: vendor ? vendor.id : null, confidence: Number(confidence.toFixed(2)), source: 'rules' };
}

async function callClaude(system, user, maxTokens = 400) {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 7000);
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST', signal: ctl.signal,
      headers: { 'content-type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({ model: process.env.AI_MODEL || 'claude-haiku-5-5', max_tokens: maxTokens, system, messages: [{ role: 'user', content: user }] }),
    });
    if (!res.ok) return null;
    const j = await res.json();
    return (j.content || []).map(c => c.text || '').join('').trim() || null;
  } catch { return null; } finally { clearTimeout(timer); }
}

const parseJson = s => { try { const m = String(s).match(/\{[\s\S]*\}/); return m ? JSON.parse(m[0]) : null; } catch { return null; } };

// Rule-based answer first (instant, stored with the request); the model can refine it in the background.
async function triageLlm(text, vendors, base) {
  const out = await callClaude(
    'You triage maintenance requests for a housing society. Reply with JSON only: {"category": one of ' + CATEGORIES.join('|') + ', "priority": one of ' + PRIORITIES.join('|') + ', "summary": max 100 chars}. The text has personal details removed.',
    redact(text), 200);
  const j = parseJson(out);
  if (!j || !CATEGORIES.includes(j.category) || !PRIORITIES.includes(j.priority)) return null;
  const vendor = vendors.find(v => String(v.trade || '').toLowerCase() === j.category) || null;
  return { category: j.category, priority: j.priority, summary: String(j.summary || base.summary).slice(0, 110), vendor_id: vendor ? vendor.id : null, confidence: 0.9, source: 'llm' };
}

const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
function draftNoticeRules(rough) {
  const text = String(rough || '').trim().replace(/\s+/g, ' ');
  const sentence = cap(text.replace(/\.*$/, '')) + '.';
  const t = text.toLowerCase();
  const kind = /water|tank|supply/.test(t) ? 'Water supply' : /lift|elevator/.test(t) ? 'Lift' : /power|electric|light/.test(t) ? 'Power' : /meeting|agm|committee/.test(t) ? 'Meeting' : /clean|garbage|pest/.test(t) ? 'Housekeeping' : 'Society';
  const title = (kind + ' notice: ' + text.split(/[.,;]/)[0].slice(0, 50)).replace(/\s+$/, '');
  return {
    title: title.slice(0, 80),
    body: `Dear residents,\n\n${sentence}\n\nWe apologise for any inconvenience and thank you for your cooperation.\n\nManaging Committee`,
    source: 'rules',
  };
}
async function draftNotice(rough) {
  const base = draftNoticeRules(rough);
  const out = await callClaude(
    'You write short, polite notices for a housing society notice board. Reply with JSON only: {"title": max 80 chars, "body": plain text, under 120 words, starts with "Dear residents,", ends with "Managing Committee"}. Do not invent dates, names or numbers that are not in the input.',
    redact(rough), 400);
  const j = parseJson(out);
  if (j && j.title && j.body) return { title: String(j.title).slice(0, 80), body: String(j.body).slice(0, 1500), source: 'llm' };
  return base;
}

function digestRules(s) {
  const lines = [`Weekly digest: ${s.open} open request${s.open === 1 ? '' : 's'}.`];
  if (s.unassigned) lines.push(`${s.unassigned} ${s.unassigned === 1 ? 'still needs' : 'still need'} a vendor.`);
  if (s.escalated) lines.push(`${s.escalated} are past the ${s.sla_hours}h target and were escalated.`);
  if (s.urgent) lines.push(`${s.urgent} marked urgent by triage.`);
  if (s.pending_users) lines.push(`${s.pending_users} resident${s.pending_users === 1 ? '' : 's'} waiting for approval.`);
  if (s.whatsapp_7d) lines.push(`${s.whatsapp_7d} request${s.whatsapp_7d === 1 ? '' : 's'} came in through WhatsApp this week.`);
  if (lines.length === 1) lines.push('Nothing needs attention.');
  return lines.join(' ');
}
async function digest(stats) {
  const base = digestRules(stats);
  const out = await callClaude('Rewrite this housing society status in 2-3 friendly sentences for the committee. Keep every number exactly as given and add nothing.', base, 200);
  return { text: out || base, source: out ? 'llm' : 'rules' };
}

module.exports = { redact, triageRules, triageLlm, draftNotice, draftNoticeRules, digest, digestRules, CATEGORIES, PRIORITIES, aiMode: () => (process.env.ANTHROPIC_API_KEY ? 'llm' : 'rules') };
