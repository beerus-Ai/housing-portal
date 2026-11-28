// Web client wiring (static analysis, no browser): every button action has a handler, every menu page has a
// renderer, every API URL the web client calls has an Express route, every script in index.html exists.
const test = require('node:test');
const assert = require('node:assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PUB = path.join(ROOT, 'public');
const WEB_FILES = ['web.js', 'dash.js', 'estate.js', 'admin-settings.js', 'web-roles.js', 'web-modules.js', 'web-services.js', 'web-nfc.js', 'common.js'];
const SERVER_FILES = ['app.js', 'roles.js', 'modules.js', 'services.js', 'nfc.js', 'wallet.js', 'carpool.js', 'email-desk.js'];
const read = f => fs.readFileSync(f, 'utf8');
const SRC = Object.fromEntries(WEB_FILES.map(f => [f, read(path.join(PUB, f))]));
const lineOf = (text, idx) => text.slice(0, idx).split('\n').length;

// ---------- a small JS scanner: blanks comments, string/template/regex contents so braces can be counted.
// Template ${...} expressions are kept as code (they can hold braces of their own).
function mask(src) {
  const out = src.split('');
  const blank = (a, b) => { for (let k = a; k < b; k++) if (out[k] !== '\n') out[k] = ' '; };
  let i = 0; const n = src.length; const tplStack = []; // brace depth at which each open ${ started
  let depth = 0; let prev = ''; // last significant char (regex detection)
  const readTemplate = () => { // i at char after the opening backtick (or after the closing } of ${...})
    const s = i;
    while (i < n) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') { blank(s, i); i++; prev = '`'; return; }
      if (c === '$' && src[i + 1] === '{') { blank(s, i); i += 2; tplStack.push(depth); depth++; prev = '{'; return; }
      i++;
    }
    blank(s, i);
  };
  while (i < n) {
    const c = src[i];
    if (c === '/' && src[i + 1] === '/') { const e = src.indexOf('\n', i); const end = e < 0 ? n : e; blank(i, end); i = end; continue; }
    if (c === '/' && src[i + 1] === '*') { const e = src.indexOf('*/', i + 2); const end = e < 0 ? n : e + 2; blank(i, end); i = end; continue; }
    if (c === '"' || c === "'") {
      const s = i + 1; i++;
      while (i < n && src[i] !== c && src[i] !== '\n') { if (src[i] === '\\') i++; i++; }
      blank(s, i); i++; prev = c; continue;
    }
    if (c === '`') { i++; readTemplate(); continue; }
    if (c === '/' && (prev === '' || '(,=:[!&|?{};+-*%<>~^'.includes(prev) || /\b(return|typeof|case|in|of)$/.test(src.slice(Math.max(0, i - 8), i).trimEnd()))) {
      const s = i + 1; i++; let cls = false;
      while (i < n && src[i] !== '\n') { const d = src[i]; if (d === '\\') { i += 2; continue; } if (d === '[') cls = true; else if (d === ']') cls = false; else if (d === '/' && !cls) break; i++; }
      blank(s, i); i++; while (/[a-z]/.test(src[i] || '')) i++; prev = '/'; continue;
    }
    if (c === '{') depth++;
    if (c === '}') {
      if (tplStack.length && tplStack[tplStack.length - 1] === depth - 1) { tplStack.pop(); depth--; i++; readTemplate(); continue; }
      depth--;
    }
    if (!/\s/.test(c)) prev = c;
    i++;
  }
  return out.join('');
}

// Top-level keys of the object literal whose "{" is at index `open` of masked text `m`.
function objectKeys(m, open) {
  let b = 0, p = 0, i = open; let entryStart = open + 1; const keys = [];
  const take = (s, e) => { const k = /^\s*(?:async\s+)?(?:get\s+|set\s+)?([A-Za-z_$][\w$]*)\s*[:(]/.exec(m.slice(s, e)); if (k) keys.push(k[1]); };
  for (; i < m.length; i++) {
    const c = m[i];
    if (c === '{') { b++; if (b === 1) entryStart = i + 1; continue; }
    if (c === '}') { b--; if (b === 0) { take(entryStart, i); break; } continue; }
    if (c === '(' || c === '[') p++;
    else if (c === ')' || c === ']') p--;
    else if (c === ',' && b === 1 && p === 0) { take(entryStart, i); entryStart = i + 1; }
  }
  return keys;
}
const literalObjectKeys = (file, name) => {
  const src = SRC[file]; const m = mask(src);
  const r = new RegExp(`\\b(?:const|let|var)\\s+${name}\\s*=\\s*\\{`).exec(m);
  return r ? objectKeys(m, r.index + r[0].length - 1) : [];
};
const assignedKeys = name => { // NAME.key = ... in any web file
  const ks = new Set();
  for (const f of WEB_FILES) { const m = mask(SRC[f]); for (const x of m.matchAll(new RegExp(`\\b${name}\\.([A-Za-z_$][\\w$]*)\\s*=(?!=)`, 'g'))) ks.add(x[1]); }
  return ks;
};

const ACT_KEYS = new Set([...literalObjectKeys('web.js', 'ACT'), ...assignedKeys('ACT')]);
const PAGE_KEYS = new Set([...literalObjectKeys('web.js', 'PAGES'), ...assignedKeys('PAGES')]);

test('scanner sanity: the known ACT and PAGES keys are found', () => {
  for (const k of ['catfilter', 'nav', 'open', 'logout', 'decide', 'gpcancel', 'stsec', 'mdbook', 'nfcoff', 'rlaccept']) assert.ok(ACT_KEYS.has(k), 'ACT.' + k);
  for (const k of ['requests', 'raise', 'audit', 'alerts', 'home', 'dashboard', 'settings', 'amenities', 'shop', 'cards', 'myjobs']) assert.ok(PAGE_KEYS.has(k), 'PAGES.' + k);
  assert.ok(!ACT_KEYS.has('Number') && !ACT_KEYS.has('go'), 'no false keys from handler bodies');
});

// ---------- (1) actions
function usedActions() {
  const uses = [];
  for (const f of WEB_FILES) {
    const src = SRC[f];
    for (const x of src.matchAll(/data-act=(["'])([^"'$]+)\1/g)) uses.push({ act: x[2], file: f, line: lineOf(src, x.index), how: 'data-act' });
    for (const x of src.matchAll(/data-act=([a-z][\w-]*)\]/g)) uses.push({ act: x[1], file: f, line: lineOf(src, x.index), how: 'selector' });
    for (const x of src.matchAll(/\bact:\s*'([^']+)'/g)) uses.push({ act: x[1], file: f, line: lineOf(src, x.index), how: 'act: (kebab/notifier item)' });
    for (const x of src.matchAll(/\bn\.act\s*\|\|\s*'([^']+)'/g)) uses.push({ act: x[1], file: f, line: lineOf(src, x.index), how: 'notifier default' });
    for (const x of src.matchAll(/\bstars\(\s*'([^']+)'\s*\)/g)) uses.push({ act: x[1], file: f, line: lineOf(src, x.index), how: 'stars()' });
  }
  return uses;
}

test('(1) every data-act used by the web app has an ACT handler', () => {
  const uses = usedActions();
  assert.ok(uses.length > 150, 'found the actions (' + uses.length + ')');
  const missing = uses.filter(u => !ACT_KEYS.has(u.act));
  assert.deepStrictEqual(missing.map(u => `${u.file}:${u.line} ${u.how} "${u.act}"`), []);
});

test('(1b) common.js kebab menus use data-kb, not data-act, for the toggle button', () => {
  assert.match(SRC['common.js'], /data-kb aria-haspopup="menu"/);
  assert.match(SRC['common.js'], /closest\('\[data-kb\]'\)/);
});

// ---------- (2) pages
function navPageKeys() {
  const src = SRC['web.js']; const m = mask(src);
  const found = [];
  const region = (name) => { const r = new RegExp(`\\bconst\\s+${name}\\s*=\\s*[\\[{]`).exec(m); if (!r) return null; let d = 0, i = r.index + r[0].length - 1;
    for (; i < m.length; i++) { if ('[{('.includes(m[i])) d++; else if (']})'.includes(m[i])) { d--; if (d === 0) break; } } return [r.index, i + 1]; };
  for (const name of ['HELP', 'NAV']) { const [a, b] = region(name); for (const x of src.slice(a, b).matchAll(/\[\s*'([a-z]+)'\s*,\s*'/g)) found.push({ k: x[1], src: name, line: lineOf(src, a + x.index) }); }
  for (const name of ['CORE', 'CORE_POS']) { const [a, b] = region(name); for (const x of src.slice(a, b).matchAll(/'([a-z]+)'/g)) found.push({ k: x[1], src: name, line: lineOf(src, a + x.index) }); }
  { const [a, b] = region('GROUP_OF'); for (const x of src.slice(a, b).matchAll(/([a-z]+):\s*'/g)) found.push({ k: x[1], src: 'GROUP_OF', line: lineOf(src, a + x.index) }); }
  return found;
}

test('(2) every page key in NAV, HELP, CORE, CORE_POS and GROUP_OF has a PAGES renderer', () => {
  const keys = navPageKeys();
  assert.ok(keys.length > 100);
  const missing = keys.filter(x => !PAGE_KEYS.has(x.k));
  assert.deepStrictEqual(missing.map(x => `web.js:${x.line} ${x.src} "${x.k}"`), []);
});

test('(2b) every literal data-page="X" and notifier page: \'X\' points at a PAGES renderer', () => {
  const miss = [];
  for (const f of WEB_FILES) {
    const src = SRC[f];
    for (const x of src.matchAll(/data-page=(["'])([a-z]+)\1/g)) if (!PAGE_KEYS.has(x[2])) miss.push(`${f}:${lineOf(src, x.index)} data-page "${x[2]}"`);
    for (const x of src.matchAll(/\bpage:\s*'([a-z]+)'/g)) if (!PAGE_KEYS.has(x[1])) miss.push(`${f}:${lineOf(src, x.index)} page: "${x[1]}"`);
    for (const x of src.matchAll(/\bgo\(\s*'([a-z]+)'/g)) if (!PAGE_KEYS.has(x[1])) miss.push(`${f}:${lineOf(src, x.index)} go("${x[1]}")`);
  }
  assert.deepStrictEqual(miss, []);
});

// ---------- (3) API paths
function serverRoutes() {
  const routes = [];
  for (const f of SERVER_FILES) {
    const src = read(path.join(ROOT, f));
    for (const x of src.matchAll(/\b(?:app|router|r)\.(get|post|put|patch|delete|all)\(\s*(\[[^\]]*\]|'[^']*'|`[^`]*`)/g)) {
      const paths = x[2].startsWith('[') ? [...x[2].matchAll(/'([^']*)'/g)].map(y => y[1]) : [x[2].slice(1, -1)];
      for (const p of paths) routes.push({ method: x[1].toUpperCase(), path: p, file: f });
    }
  }
  return routes;
}
const ROUTES = serverRoutes();
const segs = p => p.split('?')[0].split('/').filter(Boolean);
const routeMatches = (route, method, url) => {
  if (method && route.method !== 'ALL' && route.method !== method) return false;
  const a = segs(route.path), b = segs(url);
  if (a.length !== b.length) return false;
  return a.every((s, i) => s.startsWith(':') || b[i] === '*' || s === b[i] || (/^\*$/.test(b[i])));
};
// '/api/x/' + id  ->  '/api/x/*' ;  `/api/x/${id}/y` -> '/api/x/*/y'
const normalise = raw => raw.replace(/\$\{[^}]*\}/g, '*').replace(/\/$/, '/*').replace(/\*+/g, '*').split('?')[0];

function clientCalls() {
  const calls = [];
  const files = [...WEB_FILES.map(f => [f, SRC[f]]), ['api.js', read(path.join(PUB, 'api.js'))]];
  for (const [f, src] of files) {
    const seen = new Set();
    for (const x of src.matchAll(/(?:\bcall|\bapi|HP\.api)\(\s*'(GET|POST|PUT|PATCH|DELETE)'\s*,\s*(['`])(\/[^'`]*)\2/g)) {
      seen.add(x.index + x[0].indexOf(x[2] + x[3]));
      calls.push({ method: x[1], url: normalise(x[3]), raw: x[3], file: f, line: lineOf(src, x.index) });
    }
    // Other URL literals (image src, photo/download links): any method.
    for (const x of src.matchAll(/(['`])(\/api\/[^'`\s]*)\1/g)) if (!seen.has(x.index)) calls.push({ method: null, url: normalise(x[2]), raw: x[2], file: f, line: lineOf(src, x.index) });
  }
  return calls;
}

test('scanner sanity: server routes and client calls are parsed', () => {
  assert.ok(ROUTES.length > 150, 'routes: ' + ROUTES.length);
  assert.ok(ROUTES.some(r => r.method === 'POST' && r.path === '/api/gate/tap'));
  const calls = clientCalls();
  assert.ok(calls.length > 150, 'calls: ' + calls.length);
  assert.ok(calls.some(c => c.method === 'POST' && c.url === '/api/staff/jobs/*/accept'));
  // the matcher can say no: unknown path, wrong method, wrong segment count
  assert.ok(!ROUTES.some(r => routeMatches(r, 'GET', '/api/does-not-exist')));
  assert.ok(!ROUTES.some(r => routeMatches(r, 'DELETE', '/api/gate/tap')));
  assert.ok(!ROUTES.some(r => routeMatches(r, 'POST', '/api/staff/jobs/*/accept/*')));
});

test('(3) every API path the web client calls has a matching Express route (method and shape)', () => {
  const bad = clientCalls().filter(c => !ROUTES.some(r => routeMatches(r, c.method, c.url)));
  assert.deepStrictEqual(bad.map(c => `${c.file}:${c.line} ${c.method || 'ANY'} ${c.raw}`), []);
});

// ---------- (4) scripts
test('(4) every script and stylesheet referenced in public/index.html exists', () => {
  const html = read(path.join(PUB, 'index.html'));
  const refs = [...html.matchAll(/<script[^>]*\bsrc="([^"]+)"/g), ...html.matchAll(/<link[^>]*\bhref="([^"]+)"/g)].map(x => x[1]).filter(u => u.startsWith('/') && !u.startsWith('//'));
  assert.ok(refs.filter(r => r.endsWith('.js')).length >= 14);
  const missing = refs.filter(u => !fs.existsSync(path.join(PUB, u.split('?')[0])));
  assert.deepStrictEqual(missing, []);
  for (const f of WEB_FILES) assert.ok(html.includes(`src="/${f}"`), f + ' is loaded by index.html');
});

// ---------- (5) forms and inputs: every submit/change branch has an element that renders with that id/class
test('(5) every form id/class and input id that a submit or change listener checks is rendered by some web file', () => {
  const all = WEB_FILES.map(f => SRC[f]).join('\n');
  const miss = [];
  for (const f of WEB_FILES) {
    const src = SRC[f];
    for (const x of src.matchAll(/\b[ft]\.id === '([\w-]+)'/g)) if (!new RegExp(`id="${x[1]}"`).test(all)) miss.push(`${f}:${lineOf(src, x.index)} #${x[1]}`);
    for (const x of src.matchAll(/\bf\.classList\.contains\('([\w-]+)'\)/g)) if (!new RegExp(String.raw`class="([^"]*\s)?` + x[1] + String.raw`[\s"]`).test(all)) miss.push(`${f}:${lineOf(src, x.index)} .${x[1]}`);
  }
  assert.deepStrictEqual(miss, []);
});

// ---------- (6) the reverse of (1): handlers no button reaches. Suspected bug (reported): the committee
// dashboard no longer renders the category cards (catfilter) or the "Via WhatsApp/Telegram" cards (srcfilter),
// and nothing renders a useai button, so these three handlers are unreachable. Any NEW orphan fails this test.
test('(6) no new ACT handler is unreachable from the UI (known orphans: catfilter, srcfilter, useai)', () => {
  const used = new Set(usedActions().map(u => u.act));
  const orphans = [...ACT_KEYS].filter(k => !used.has(k)).sort();
  const KNOWN = [];
  assert.deepStrictEqual(orphans.filter(k => !KNOWN.includes(k)), []);
});
