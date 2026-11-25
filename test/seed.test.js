// Demo seeding (SEED_PASSWORD) must not duplicate vendors or contacts on restart.
const test = require('node:test');
const assert = require('node:assert');
const os = require('os');
const path = require('path');
const fs = require('fs');
const { createApp } = require('../app');

test('restarting with SEED_PASSWORD does not duplicate vendors or contacts', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'portal-seed-'));
  const prev = process.env.SEED_PASSWORD;
  process.env.SEED_PASSWORD = 'Seed-Test-2026';
  try {
    const counts = () => {
      const app = createApp({ dbFile: path.join(dir, 's.db'), uploadDir: path.join(dir, 'up'), noTimers: true });
      const db = app.locals.db;
      const c = [db.prepare('SELECT COUNT(*) AS n FROM vendors').get().n, db.prepare('SELECT COUNT(*) AS n FROM contacts').get().n];
      db.close();
      return c;
    };
    const first = counts();
    assert.ok(first[0] > 0 && first[1] > 0);
    assert.deepEqual(counts(), first);
  } finally {
    if (prev === undefined) delete process.env.SEED_PASSWORD; else process.env.SEED_PASSWORD = prev;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
