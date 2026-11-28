// Daycare services (docs/daycare-api.md): the committee registers providers; a parent asks for a place with the
// child's first name and age only; the committee approves or declines; capacity is never exceeded; the parent can
// cancel; the committee marks drop-off and pick-up and the parent sees today's status; notifications, audit, other
// roles refused. The clock is fixed (Wednesday 2026-11-25, 12:00 IST). Synthetic data only.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

const ADMIN = { email: 'admin@society.test', password: 'Admin@1234' };
const PW = 'Passw0rd!';
const NOW = new Date('2026-11-25T06:30:00Z'); // Wednesday, 12:00 IST

async function boot() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-day-'));
  const app = createApp({ dbFile: path.join(dir, 'd.db'), uploadDir: path.join(dir, 'up'), noTimers: true, clock: () => NOW });
  const server = await new Promise(r => { const s = app.listen(0, () => r(s)); });
  const base = `http://localhost:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (method, url, body) => {
      const headers = { cookie };
      if (body) headers['content-type'] = 'application/json';
      const res = await fetch(base + url, { method, headers, body: body ? JSON.stringify(body) : undefined });
      const sc = res.headers.get('set-cookie');
      if (sc) cookie = sc.split(';')[0];
      return { status: res.status, body: await res.json() };
    };
  };
  const admin = client();
  assert.equal((await admin('POST', '/api/login', ADMIN)).status, 200);
  const resident = async (email, flat) => {
    const c = client();
    assert.equal((await client()('POST', '/api/register', { name: email.split('@')[0], email, flat, resident_type: 'owner', password: PW, consent: true })).status, 201);
    const p = (await admin('GET', '/api/admin/users?status=pending')).body.find(u => u.email === email);
    assert.equal((await admin('POST', `/api/admin/users/${p.id}/approve`)).status, 200);
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    return c;
  };
  const account = async (kind, email) => {
    assert.equal((await admin('POST', '/api/admin/accounts', { name: kind + ' one', email, password: PW, kind })).status, 201);
    const c = client();
    assert.equal((await c('POST', '/api/login', { email, password: PW })).status, 200);
    return c;
  };
  return { admin, resident, account, close: () => server.close() };
}
const notes = async c => (await c('GET', '/api/notifications')).body.map(n => n.message);
const PROV = { name: 'Little Steps', age_min: 1, age_max: 5, capacity: 2, hours: '08:30-17:30', fee_month: 6500, location: 'Clubhouse ground floor', phone: '98000 33333', notes: 'Bring a water bottle' };
const ask = (c, provider_id, child_name, child_age, extra = {}) => c('POST', '/api/daycare/enrolments', { provider_id, child_name, child_age, start_date: '2026-11-25', days: ['mon', 'wed', 'fri'], ...extra });

test('daycare: providers, enrolment with minimum data, approval within capacity, cancel', async () => {
  const t = await boot();
  try {
    const p1 = await t.resident('parent1@x.test', 'A-1');
    const p2 = await t.resident('parent2@x.test', 'B-2');
    const p3 = await t.resident('parent3@x.test', 'C-3');

    // only the committee registers providers; validation
    assert.equal((await p1('POST', '/api/daycare/providers', PROV)).status, 403);
    assert.equal((await t.admin('POST', '/api/daycare/providers', { ...PROV, age_min: 6, age_max: 3 })).status, 400, 'ages');
    assert.equal((await t.admin('POST', '/api/daycare/providers', { ...PROV, capacity: 0 })).status, 400, 'capacity');
    assert.equal((await t.admin('POST', '/api/daycare/providers', { ...PROV, phone: '' })).status, 400, 'phone');
    const pr = await t.admin('POST', '/api/daycare/providers', PROV);
    assert.equal(pr.status, 201);
    const id = pr.body.id;
    const seen = (await p1('GET', '/api/daycare/providers')).body.find(p => p.id === id);
    assert.equal(seen.places_left, 2); assert.equal(seen.fee_month, 6500); assert.equal(seen.phone, '98000 33333');

    // enrolment: first name and age only, within the provider's ages, start from today, weekdays only
    assert.equal((await ask(p1, id, 'Aarav Sharma', 3)).status, 400, 'no surname');
    assert.equal((await ask(p1, id, 'Aarav', 7)).status, 400, 'too old for this daycare');
    assert.equal((await ask(p1, id, 'Aarav', 3, { start_date: '2026-11-24' })).status, 400, 'start in the past');
    assert.equal((await ask(p1, id, 'Aarav', 3, { days: ['sat'] })).status, 400, 'weekdays only');
    assert.equal((await ask(p1, id, 'Aarav', 3, { days: [] })).status, 400, 'at least one day');
    assert.equal((await ask(p1, 999, 'Aarav', 3)).status, 404);
    const e1 = await ask(p1, id, 'Aarav', 3);
    assert.equal(e1.status, 201); assert.equal(e1.body.status, 'pending');
    assert.equal((await ask(p1, id, 'aarav', 3)).status, 409, 'same child twice');
    assert.ok((await notes(t.admin)).some(m => /Daycare request: a place at Little Steps from 2026-11-25 for a child aged 3, Flat A-1/.test(m)));
    const e2 = (await ask(p2, id, 'Diya', 2, { days: ['tue', 'thu'] })).body.id;
    const e3 = (await ask(p3, id, 'Kabir', 4)).body.id;

    // a parent sees only their flat's enrolments; the committee sees all
    const mine = (await p1('GET', '/api/daycare/enrolments')).body;
    assert.deepEqual(mine.map(e => e.child_name), ['Aarav']);
    assert.deepEqual(mine[0].days, ['mon', 'wed', 'fri']);
    assert.equal((await t.admin('GET', '/api/daycare/enrolments?status=pending')).body.length, 3);

    // approve within capacity; the third is refused while full; decline with a reason
    assert.equal((await p1('POST', `/api/daycare/enrolments/${e1.body.id}/decide`, { decision: 'approve' })).status, 403);
    assert.equal((await t.admin('POST', `/api/daycare/enrolments/${e1.body.id}/decide`, { decision: 'maybe' })).status, 400);
    assert.equal((await t.admin('POST', `/api/daycare/enrolments/${e1.body.id}/decide`, { decision: 'approve' })).status, 200);
    assert.ok((await notes(p1)).some(m => /Aarav has a place at Little Steps from 2026-11-25/.test(m)));
    assert.equal((await t.admin('POST', `/api/daycare/enrolments/${e2}/decide`, { decision: 'approve' })).status, 200);
    const full = await t.admin('POST', `/api/daycare/enrolments/${e3}/decide`, { decision: 'approve' });
    assert.equal(full.status, 409); assert.match(full.body.error, /full/);
    assert.equal((await p3('GET', '/api/daycare/providers')).body.find(p => p.id === id).places_left, 0);
    assert.equal((await t.admin('PUT', `/api/daycare/providers/${id}`, { ...PROV, capacity: 1 })).status, 409, 'capacity below enrolled');

    // the parent cancels: the place frees up and the waiting child can be approved
    assert.equal((await p1('POST', `/api/daycare/enrolments/${e2}/cancel`)).status, 404, 'another flat');
    assert.equal((await p2('POST', `/api/daycare/enrolments/${e2}/cancel`)).status, 200);
    assert.ok((await notes(t.admin)).some(m => /Flat B-2 cancelled a daycare place at Little Steps/.test(m)));
    assert.equal((await p2('POST', `/api/daycare/enrolments/${e2}/cancel`)).status, 409);
    assert.equal((await t.admin('POST', `/api/daycare/enrolments/${e3}/decide`, { decision: 'decline', reason: 'Starting in January instead' })).status, 200);
    assert.ok((await notes(p3)).some(m => /Little Steps could not take Kabir: Starting in January instead/.test(m)));
    assert.equal((await t.admin('POST', `/api/daycare/enrolments/${e3}/decide`, { decision: 'approve' })).status, 409, 'already decided');
    const again = (await ask(p3, id, 'Kabir', 4)).body.id;
    assert.equal((await t.admin('POST', `/api/daycare/enrolments/${again}/decide`, { decision: 'approve' })).status, 200, 'a freed place');

    // capacity edit and closing a provider (open places are cancelled, parents told)
    assert.equal((await t.admin('PUT', `/api/daycare/providers/${id}`, { ...PROV, capacity: 3 })).status, 200);
    assert.equal((await t.admin('DELETE', `/api/daycare/providers/${id}`)).body.cancelled, 2);
    assert.ok((await notes(p3)).some(m => /Little Steps is no longer listed, so Kabir's place was cancelled/.test(m)));
    assert.equal((await p1('GET', '/api/daycare/providers')).body.some(p => p.id === id), false);

    const audit = (await t.admin('GET', '/api/admin/audit')).body.filter(x => /^daycare/.test(x.entity));
    for (const act of ['registered', 'edited', 'requested', 'approved', 'declined', 'cancelled', 'closed']) assert.ok(audit.some(x => x.action === act), 'audited: ' + act);
  } finally { t.close(); }
});

test('daycare: committee marks drop-off and pick-up, the parent sees today and is told; other roles refused', async () => {
  const t = await boot();
  try {
    const p1 = await t.resident('mum@x.test', 'D-4');
    const id = (await t.admin('POST', '/api/daycare/providers', { ...PROV, capacity: 5 })).body.id;
    const wed = (await ask(p1, id, 'Meera', 2)).body.id;                       // Mon/Wed/Fri: scheduled today
    const tue = (await ask(p1, id, 'Ishaan', 4, { days: ['tue'] })).body.id;   // not today
    const later = (await ask(p1, id, 'Zoya', 3, { start_date: '2026-12-01' })).body.id;
    for (const e of [wed, tue, later]) assert.equal((await t.admin('POST', `/api/daycare/enrolments/${e}/decide`, { decision: 'approve' })).status, 200);

    const reg = (await t.admin('GET', '/api/daycare/today')).body;
    assert.equal(reg.date, '2026-11-25'); assert.equal(reg.weekday, 'wed');
    assert.deepEqual(reg.children.map(c => c.child_name), ['Meera'], 'only children scheduled today');
    assert.equal((await p1('GET', '/api/daycare/today')).status, 403, 'register is for the committee');

    assert.equal((await t.admin('POST', `/api/daycare/enrolments/${wed}/checkout`)).status, 409, 'not dropped off yet');
    assert.equal((await t.admin('POST', `/api/daycare/enrolments/${later}/checkin`)).status, 409, 'not started yet');
    assert.equal((await p1('POST', `/api/daycare/enrolments/${wed}/checkin`)).status, 403, 'parents do not mark');
    const inn = await t.admin('POST', `/api/daycare/enrolments/${wed}/checkin`);
    assert.equal(inn.status, 200); assert.equal(inn.body.time, '12:00');
    assert.equal((await t.admin('POST', `/api/daycare/enrolments/${wed}/checkin`)).status, 409, 'twice');
    let today = (await p1('GET', '/api/daycare/enrolments')).body.find(e => e.id === wed).today;
    assert.deepEqual(today, { date: '2026-11-25', scheduled: true, in_at: '12:00', out_at: null });
    // an extra day: Ishaan is not scheduled on Wednesday but can still be marked in, and then shows on the register
    assert.equal((await t.admin('POST', `/api/daycare/enrolments/${tue}/checkin`)).status, 200);
    assert.equal((await t.admin('GET', '/api/daycare/today')).body.children.length, 2);

    assert.equal((await t.admin('POST', `/api/daycare/enrolments/${wed}/checkout`)).status, 200);
    assert.ok((await notes(p1)).some(m => /Meera was picked up from Little Steps at 12:00/.test(m)));
    assert.equal((await t.admin('POST', `/api/daycare/enrolments/${wed}/checkout`)).status, 409, 'twice');
    today = (await p1('GET', '/api/daycare/enrolments')).body.find(e => e.id === wed).today;
    assert.equal(today.out_at, '12:00');
    const audit = (await t.admin('GET', '/api/admin/audit')).body.filter(x => x.entity === 'daycare_enrolment');
    for (const act of ['dropped_off', 'picked_up']) assert.ok(audit.some(x => x.action === act), 'audited: ' + act);

    assert.equal((await t.admin('POST', '/api/daycare/enrolments', { provider_id: id, child_name: 'X', child_age: 2, start_date: '2026-11-25', days: ['mon'] })).status, 403, 'committee does not enrol');
    for (const kind of ['guard', 'cleaner', 'laundry']) {
      const c = await t.account(kind, `${kind}@x.test`);
      assert.equal((await c('GET', '/api/daycare/providers')).status, 403, kind);
    }
  } finally { t.close(); }
});
