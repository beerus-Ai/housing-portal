const test = require('node:test');
const assert = require('node:assert');
const { openDb } = require('../db');

test('SEED_TELEGRAM_PHONE recreates a linked, approved Telegram test resident at boot', () => {
  const keep = { ...process.env };
  process.env.SEED_PASSWORD = 'Synthetic-Pass-1';
  process.env.SEED_TELEGRAM_PHONE = '+91 90000 00001';
  process.env.SEED_TELEGRAM_ID = '1234567';
  try {
    const db = openDb(':memory:');
    const u = db.prepare("SELECT * FROM users WHERE email='tg.tester@sahyadri.test'").get();
    assert.equal(u.status, 'approved');
    assert.equal(u.role, 'resident');
    assert.equal(u.flat, 'T-101');
    assert.equal(u.phone, '+91 90000 00001');
    assert.equal(u.telegram_id, '1234567');
  } finally { process.env = keep; }
});

test('no Telegram test resident without SEED_TELEGRAM_PHONE', () => {
  const keep = { ...process.env };
  process.env.SEED_PASSWORD = 'Synthetic-Pass-1';
  delete process.env.SEED_TELEGRAM_PHONE;
  try {
    const db = openDb(':memory:');
    assert.equal(db.prepare("SELECT COUNT(*) n FROM users WHERE email='tg.tester@sahyadri.test'").get().n, 0);
  } finally { process.env = keep; }
});
