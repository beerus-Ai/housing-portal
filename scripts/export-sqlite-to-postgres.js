#!/usr/bin/env node
'use strict';
/*
 * Export the Node app's SQLite database to a PostgreSQL import script.
 *
 *   node scripts/export-sqlite-to-postgres.js [portal.db] [--out import.sql] [--dry-run]
 *
 * Dependency-free (node:sqlite, Node 22.5+). The SQLite file is opened READ-ONLY and never modified.
 * The output targets the schema created by backend/src/main/resources/db/migration (V1, V2): start the Java backend
 * once against an EMPTY PostgreSQL database (Flyway creates the tables), stop it, then run
 *   psql -v ON_ERROR_STOP=1 -f import.sql
 * The backend seeds an admin on first start; users use ON CONFLICT DO NOTHING so a seeded admin with the same id or
 * email is kept. Truncate the users table first if you want the exported admin to win.
 *
 * Conversions: SQLite 'YYYY-MM-DD HH:MM:SS' (UTC) and ISO strings become TIMESTAMP literals (UTC); is_read/allowed stay
 * 0/1 integers (the Java schema keeps INTEGER); lease dates stay 'YYYY-MM-DD' strings. Afterwards every identity
 * sequence is reset to MAX(id)+1.
 */
const fs = require('node:fs');
const { DatabaseSync } = require('node:sqlite');

// Tables in dependency order. cols: column list as in the PG schema. ts: timestamp columns. id: has identity sequence.
const TABLES = [
  { t: 'users', id: true, ts: ['consent_at', 'created_at'],
    cols: ['id', 'name', 'email', 'phone', 'flat', 'resident_type', 'password_hash', 'role', 'status', 'consent_at', 'created_at'] },
  { t: 'vendors', id: true, ts: [], cols: ['id', 'name', 'trade', 'phone'] },
  { t: 'requests', id: true, ts: ['created_at', 'updated_at'],
    cols: ['id', 'user_id', 'category', 'title', 'description', 'photo', 'status', 'vendor_id', 'rating', 'rating_comment', 'created_at', 'updated_at'] },
  { t: 'audit', id: true, ts: ['created_at'], cols: ['id', 'actor_id', 'entity', 'entity_id', 'action', 'detail', 'created_at'] },
  { t: 'notices', id: true, ts: ['created_at'], cols: ['id', 'title', 'body', 'author_id', 'created_at'] },
  { t: 'comments', id: true, ts: ['created_at'], cols: ['id', 'request_id', 'user_id', 'body', 'created_at'] },
  { t: 'leases', id: false, ts: [],
    cols: ['user_id', 'start_date', 'end_date', 'owner_name', 'owner_phone', 'police_verified_on', 'agreement', 'parking'] },
  { t: 'notifications', id: true, ts: ['created_at'], cols: ['id', 'user_id', 'message', 'is_read', 'created_at'] },
  { t: 'emergencies', id: true, ts: ['created_at', 'resolved_at'],
    cols: ['id', 'user_id', 'type', 'note', 'status', 'created_at', 'resolved_at', 'resolved_by'] },
  { t: 'contacts', id: true, ts: [], cols: ['id', 'name', 'role', 'phone', 'icon'] },
  { t: 'gate_passes', id: true, ts: ['valid_from', 'valid_until', 'created_at', 'used_at'],
    cols: ['id', 'flat', 'created_by', 'visitor_name', 'purpose', 'token', 'code', 'valid_from', 'valid_until', 'status', 'created_at', 'used_at', 'used_by'] },
  { t: 'resident_tokens', id: false, ts: ['created_at'], cols: ['user_id', 'token', 'created_at'] },
  { t: 'gate_log', id: true, ts: ['created_at'], cols: ['id', 'kind', 'subject', 'flat', 'result', 'reason', 'guard_id', 'created_at'] },
  { t: 'settings', id: false, ts: [], cols: ['key', 'value'] },
  { t: 'role_permissions', id: false, ts: [], cols: ['role', 'permission', 'allowed'] },
  { t: 'vehicles', id: true, ts: ['created_at'],
    cols: ['id', 'flat', 'user_id', 'plate', 'plate_key', 'type', 'make', 'color', 'sticker', 'created_at'] },
  { t: 'parking_slots', id: true, ts: ['created_at'], cols: ['id', 'code', 'level', 'kind', 'flat', 'vehicle_id', 'created_at'] },
  { t: 'workers', id: true, ts: ['created_at'], cols: ['id', 'name', 'role', 'phone', 'shift', 'status', 'notes', 'created_at'] },
];

function parseArgs(argv) {
  const o = { db: 'portal.db', out: 'import.sql', dry: false };
  const rest = [];
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--dry-run' || a === '-n') o.dry = true;
    else if (a === '--out' || a === '-o') o.out = argv[++i];
    else if (a === '--help' || a === '-h') o.help = true;
    else rest.push(a);
  }
  if (rest[0]) o.db = rest[0];
  return o;
}

const q = (s) => '"' + String(s).replace(/"/g, '""') + '"';

// SQLite stores UTC as 'YYYY-MM-DD HH:MM:SS'; the app may also write ISO ('...T...Z'). PG TIMESTAMP takes UTC.
function tsValue(s) {
  const t = s.trim();
  if (t === '') return null;
  let m = /^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:?\d{2})?$/.exec(t);
  if (m) {
    if (m[3] && m[3] !== 'Z') {
      const d = new Date(t);
      if (!isNaN(d)) return d.toISOString().replace('T', ' ').replace('Z', '');
    }
    return m[1] + ' ' + (m[2].length === 5 ? m[2] + ':00' : m[2]);
  }
  if (/^\d{4}-\d{2}-\d{2}$/.test(t)) return t + ' 00:00:00';
  const d = new Date(t);
  if (!isNaN(d)) return d.toISOString().replace('T', ' ').replace('Z', '');
  throw new Error('Unrecognised timestamp value: ' + JSON.stringify(s));
}

function lit(v, isTs) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : 'NULL';
  if (v instanceof Uint8Array) return "'\\x" + Buffer.from(v).toString('hex') + "'";
  let s = String(v);
  if (isTs) {
    s = tsValue(s);
    if (s === null) return 'NULL';
  }
  return "'" + s.replace(/'/g, "''") + "'";
}

function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) {
    console.log('Usage: node scripts/export-sqlite-to-postgres.js [portal.db] [--out import.sql] [--dry-run]');
    return;
  }
  if (!fs.existsSync(o.db)) {
    console.error('SQLite file not found: ' + o.db);
    process.exit(2);
  }
  const db = new DatabaseSync(o.db, { readOnly: true });
  const existing = new Set(db.prepare("SELECT name FROM sqlite_master WHERE type='table'").all().map((r) => r.name));

  const out = [];
  const counts = [];
  out.push('-- Generated by scripts/export-sqlite-to-postgres.js from ' + o.db);
  out.push('-- Target: schema from backend db/migration V1/V2 (empty tables). Run: psql -v ON_ERROR_STOP=1 -f import.sql');
  out.push('BEGIN;');
  out.push('');
  for (const T of TABLES) {
    if (!existing.has(T.t)) {
      counts.push([T.t, 'missing in source']);
      continue;
    }
    const srcCols = new Set(db.prepare('PRAGMA table_info(' + q(T.t) + ')').all().map((c) => c.name));
    const cols = T.cols.filter((c) => srcCols.has(c));
    const missing = T.cols.filter((c) => !srcCols.has(c));
    if (missing.length) console.error('warning: ' + T.t + ': source lacks columns ' + missing.join(', ') + ' (left to PG defaults)');
    const rows = db.prepare('SELECT ' + cols.map(q).join(', ') + ' FROM ' + q(T.t) + (T.id ? ' ORDER BY id' : '')).all();
    counts.push([T.t, rows.length]);
    out.push('-- ' + T.t + ': ' + rows.length + ' row(s)');
    const tsSet = new Set(T.ts);
    // "key" is not reserved in PostgreSQL; quote nothing except where needed. settings.key/value are valid bare names there.
    for (const r of rows) {
      const vals = cols.map((c) => lit(r[c], tsSet.has(c)));
      out.push('INSERT INTO ' + T.t + ' (' + cols.join(', ') + ') VALUES (' + vals.join(', ') + ') ON CONFLICT DO NOTHING;');
    }
    if (T.id) {
      out.push("SELECT setval(pg_get_serial_sequence('" + T.t + "', 'id'), COALESCE((SELECT MAX(id) FROM " + T.t + '), 0) + 1, false);');
    }
    out.push('');
  }
  out.push('COMMIT;');
  db.close();

  const width = Math.max(...counts.map(([t]) => t.length));
  console.log('Source: ' + o.db);
  for (const [t, n] of counts) console.log('  ' + t.padEnd(width) + '  ' + n);
  if (o.dry) {
    console.log('Dry run: nothing written.');
    return;
  }
  fs.writeFileSync(o.out, out.join('\n') + '\n', 'utf8');
  console.log('Wrote ' + o.out);
  console.log('Note: uploaded files (uploads/) are not in the database; copy that directory separately.');
}

main();
