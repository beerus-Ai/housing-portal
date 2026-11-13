const test = require('node:test');
const assert = require('node:assert');
const http = require('http');
const AI = require('../ai');

// Starts a stub that plays the role of the n8n classifier webhook; `resp` is what it returns.
async function stub() {
  const state = { resp: { text: '{"kind":"request","confidence":0.92}' }, lastBody: null };
  const server = http.createServer((req, res) => {
    let b = ''; req.on('data', c => (b += c)); req.on('end', () => {
      try { state.lastBody = JSON.parse(b); } catch { state.lastBody = b; }
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(state.resp));
    });
  });
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  state.url = `http://127.0.0.1:${server.address().port}/`;
  state.close = () => server.close();
  return state;
}

test('classifyN8n maps the free-LLM result to create/ignore/review and redacts the text', async () => {
  const s = await stub();
  process.env.CLASSIFY_WEBHOOK_URL = s.url;
  try {
    s.resp = { text: '{"kind":"request","confidence":0.92}' };
    let v = await AI.classifyN8n('The lift is stuck, phone 9876543210');
    assert.deepEqual([v.kind, v.decision, v.source], ['request', 'create', 'n8n']);
    assert.ok(!String(s.lastBody.text).includes('9876543210'), 'personal data is redacted before the model');

    s.resp = { text: '{"kind":"chatter","confidence":0.95}' };
    v = await AI.classifyN8n('Good morning all');
    assert.equal(v.decision, 'ignore');

    s.resp = { kind: 'question', confidence: 0.4 }; // low confidence, and already-parsed shape
    v = await AI.classifyN8n('Is the water tank clean?');
    assert.equal(v.decision, 'review');
  } finally { delete process.env.CLASSIFY_WEBHOOK_URL; s.close(); }
});

test('classifyN8n returns null when unset or unreachable so the rule gate still runs', async () => {
  delete process.env.CLASSIFY_WEBHOOK_URL;
  assert.equal(await AI.classifyN8n('anything'), null);
  process.env.CLASSIFY_WEBHOOK_URL = 'http://127.0.0.1:1/';
  try { assert.equal(await AI.classifyN8n('anything'), null); } finally { delete process.env.CLASSIFY_WEBHOOK_URL; }
});

test('aiMode reports llm when the n8n classifier URL is configured', () => {
  delete process.env.ANTHROPIC_API_KEY;
  delete process.env.CLASSIFY_WEBHOOK_URL;
  assert.equal(AI.aiMode(), 'rules');
  process.env.CLASSIFY_WEBHOOK_URL = 'http://example.test/';
  try { assert.equal(AI.aiMode(), 'llm'); } finally { delete process.env.CLASSIFY_WEBHOOK_URL; }
});
