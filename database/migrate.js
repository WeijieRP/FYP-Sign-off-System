#!/usr/bin/env node
// Database migrations.
//
//   node database/migrate.js status            what is applied, what is pending
//   node database/migrate.js up                apply pending migrations in order (the default)
//   node database/migrate.js new <name>        create database/migrations/NNN_<name>.sql
//   node database/migrate.js baseline          mark every migration as applied without running it
//                                              (only for a database that already has every change by hand)
//   node database/migrate.js check [--update]  build a scratch database from schema.sql + all migrations and
//                                              compare it with database/schema.snapshot.sql (--update rewrites it).
//                                              Needs an admin login: MYSQL_ROOT_USER (default root) and MYSQL_ROOT_PASSWORD.
//
// Rules: database/schema.sql is the frozen baseline for fresh installs. Every change to an existing
// database is a new numbered file in database/migrations/. Never edit a migration after it is applied.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
require('dotenv').config({ path: path.join(__dirname, '..', 'backend', '.env'), quiet: true });
const mysql = require('mysql2/promise');

const MIGRATIONS_DIR = path.join(__dirname, 'migrations');
const SCHEMA_FILE = path.join(__dirname, 'schema.sql');
const SNAPSHOT_FILE = path.join(__dirname, 'schema.snapshot.sql');
const cfg = {
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT) || 3306, // <Jun Kai/> the kiosk's own MySQL (install.cmd) runs on another port
  user: process.env.DB_USER || 'kiosk_user',
  password: process.env.DB_PASSWORD || 'kiosk123',
  database: process.env.DB_NAME || 'dp_kiosk_db',
};
const readLf = (f) => fs.readFileSync(f, 'utf8').replace(/\r\n/g, '\n');
const sha256 = (s) => crypto.createHash('sha256').update(s).digest('hex');

function listMigrations() {
  if (!fs.existsSync(MIGRATIONS_DIR)) return [];
  const files = fs.readdirSync(MIGRATIONS_DIR).filter((f) => /^\d{3}_[A-Za-z0-9_-]+\.sql$/.test(f)).sort();
  const seen = new Set();
  for (const f of files) {
    const n = f.slice(0, 3);
    if (seen.has(n)) throw new Error(`two migrations share the number ${n}: rename one of them`);
    seen.add(n);
  }
  return files;
}

async function ensureTable(conn) {
  await conn.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
    name VARCHAR(255) NOT NULL PRIMARY KEY,
    checksum CHAR(64) NOT NULL,
    applied_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`);
}
async function appliedMap(conn) {
  await ensureTable(conn);
  const [rows] = await conn.query('SELECT name, checksum FROM schema_migrations');
  return new Map(rows.map((r) => [r.name, r.checksum]));
}

async function status(conn) {
  const applied = await appliedMap(conn);
  const files = listMigrations();
  for (const f of files) console.log(`${applied.has(f) ? 'applied' : 'pending'}  ${f}`);
  const pending = files.filter((f) => !applied.has(f));
  console.log(`${files.length} migration file(s), ${pending.length} pending`);
  return pending.length;
}

async function up(conn) {
  const applied = await appliedMap(conn);
  const files = listMigrations();
  let count = 0;
  for (const f of files) {
    const sql = readLf(path.join(MIGRATIONS_DIR, f));
    const checksum = sha256(sql);
    if (applied.has(f)) {
      if (applied.get(f) !== checksum) throw new Error(`${f} was edited after it was applied. Write a new migration instead.`);
      continue;
    }
    console.log(`applying ${f} ...`);
    await conn.query(sql);
    await conn.query('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [f, checksum]);
    count++;
  }
  console.log(count ? `${count} migration(s) applied` : 'nothing to apply');
}

async function baseline(conn) {
  const applied = await appliedMap(conn);
  let count = 0;
  for (const f of listMigrations()) {
    if (applied.has(f)) continue;
    await conn.query('INSERT INTO schema_migrations (name, checksum) VALUES (?, ?)', [f, sha256(readLf(path.join(MIGRATIONS_DIR, f)))]);
    count++;
  }
  console.log(`baseline recorded: ${count} migration(s) marked as applied`);
}

function newMigration(name) {
  if (!name) throw new Error('usage: node database/migrate.js new <short_description>');
  const files = listMigrations();
  const next = String((files.length ? parseInt(files[files.length - 1].slice(0, 3), 10) : 0) + 1).padStart(3, '0');
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');
  const file = path.join(MIGRATIONS_DIR, `${next}_${slug}.sql`);
  fs.mkdirSync(MIGRATIONS_DIR, { recursive: true });
  fs.writeFileSync(file, `-- Migration ${next}: ${name}\n-- Applied once, in order, by: npm run db:migrate\n-- Plain MySQL. Add tables/columns here; never edit this file after it has been applied.\n\n`);
  console.log(`created ${path.relative(process.cwd(), file)}`);
  console.log('next: write the SQL, run `npm run db:migrate`, then `npm run db:snapshot` and commit both files');
}

async function adminConnection() {
  const candidates = [process.env.MYSQL_ROOT_USER, 'root', 'runner', 'ODBC'].filter(Boolean);
  let lastError;
  for (const user of candidates) {
    try { return await mysql.createConnection({ host: cfg.host, port: cfg.port, user, password: process.env.MYSQL_ROOT_PASSWORD || '', multipleStatements: true }); }
    catch (e) { lastError = e; }
  }
  throw new Error(`check needs an admin login (set MYSQL_ROOT_USER / MYSQL_ROOT_PASSWORD): ${lastError && lastError.message}`);
}

async function dumpStructure(conn, database) {
  const [tables] = await conn.query('SHOW TABLES');
  const names = tables.map((t) => Object.values(t)[0]).sort();
  const parts = [];
  for (const name of names) {
    const [rows] = await conn.query(`SHOW CREATE TABLE \`${name}\``);
    const ddl = rows[0]['Create Table'].replace(/ AUTO_INCREMENT=\d+/g, '').replace(/\r\n/g, '\n');
    parts.push(`${ddl};`);
  }
  return `-- Generated by \`node database/migrate.js check --update\` from database/schema.sql + database/migrations/.\n-- Do not edit by hand. ${names.length} tables.\n\n${parts.join('\n\n')}\n`;
}

async function check(update) {
  const admin = await adminConnection();
  const scratch = `${cfg.database}_check`;
  try {
    await admin.query(`DROP DATABASE IF EXISTS \`${scratch}\``);
    await admin.query(`CREATE DATABASE \`${scratch}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await admin.query(`GRANT ALL PRIVILEGES ON \`${scratch}\`.* TO '${cfg.user}'@'%'`).catch(() => {});
    await admin.query(`GRANT ALL PRIVILEGES ON \`${scratch}\`.* TO '${cfg.user}'@'localhost'`).catch(() => {});
    await admin.query('FLUSH PRIVILEGES');
    const conn = await mysql.createConnection({ ...cfg, database: scratch, multipleStatements: true });
    try {
      await conn.query(readLf(SCHEMA_FILE));
      await up(conn);
      const dump = await dumpStructure(conn, scratch);
      if (update) { fs.writeFileSync(SNAPSHOT_FILE, dump); console.log(`wrote ${path.relative(process.cwd(), SNAPSHOT_FILE)}`); return 0; }
      if (!fs.existsSync(SNAPSHOT_FILE)) { console.error('database/schema.snapshot.sql is missing: run `npm run db:snapshot` and commit it'); return 1; }
      const current = readLf(SNAPSHOT_FILE);
      if (current === dump) { console.log('schema snapshot is current'); return 0; }
      const a = current.split('\n'), b = dump.split('\n');
      const diff = [...b.filter((l) => !a.includes(l)).map((l) => `+ ${l}`), ...a.filter((l) => !b.includes(l)).map((l) => `- ${l}`)];
      console.error('database/schema.snapshot.sql is out of date. Run `npm run db:snapshot` and commit it with your migration.');
      console.error(diff.slice(0, 40).join('\n'));
      return 1;
    } finally { await conn.end(); }
  } finally {
    await admin.query(`DROP DATABASE IF EXISTS \`${scratch}\``).catch(() => {});
    await admin.end();
  }
}

(async () => {
  const [cmd = 'up', arg] = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  const update = process.argv.includes('--update');
  if (cmd === 'new') { newMigration(arg); return; }
  if (cmd === 'check') { process.exit(await check(update)); }
  const conn = await mysql.createConnection({ ...cfg, multipleStatements: true });
  try {
    if (cmd === 'status') await status(conn);
    else if (cmd === 'up') await up(conn);
    else if (cmd === 'baseline') await baseline(conn);
    else throw new Error(`unknown command "${cmd}" (status | up | new | baseline | check)`);
  } finally { await conn.end(); }
})().catch((e) => { console.error(`migrate: ${e.message}`); process.exit(1); });
