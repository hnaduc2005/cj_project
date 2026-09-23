import { DatabaseSync } from 'node:sqlite';
import { existsSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pg from 'pg';

const tables = [
  'users', 'masters', 'orders', 'items', 'snapshots', 'audit', 'imports',
  'attachments', 'documents', 'notifications', 'settings', 'account_flags',
  'order_sequences', 'approvals', 'outbox', 'warehouse_requests',
];
const sourcePath = resolve(process.env.SQLITE_SOURCE_PATH || 'data/purchase.sqlite');
const apply = process.argv.includes('--apply');
const quote = name => {
  if (!/^[a-z_][a-z0-9_]*$/i.test(name)) throw new Error('Unexpected SQL identifier: ' + name);
  return '"' + name + '"';
};

export function sourceInfo(db) {
  const integrity = db.prepare('PRAGMA integrity_check').all();
  if (integrity.length !== 1 || integrity[0].integrity_check !== 'ok') throw new Error('SQLite integrity_check failed');
  const schema = db.prepare("SELECT name,sql FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
  const actual = schema.map(row => row.name).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...tables].sort())) {
    throw new Error('Unexpected SQLite tables; review schema before migration: ' + actual.join(', '));
  }
  const indexes = db.prepare("SELECT sql FROM sqlite_master WHERE type='index' AND sql IS NOT NULL").all();
  const counts = Object.fromEntries(tables.map(table => [table, db.prepare(`SELECT count(*) AS n FROM ${quote(table)}`).get().n]));
  return { schema: new Map(schema.map(row => [row.name, row.sql])), indexes, counts };
}

function columns(db, table) {
  return db.prepare(`PRAGMA table_info(${quote(table)})`).all();
}

function digest(rows) {
  const hash = createHash('sha256');
  for (const row of rows) {
    hash.update(JSON.stringify(row.map(value => value instanceof Uint8Array ? ['bytea', Buffer.from(value).toString('base64')] : value)));
    hash.update('\n');
  }
  return hash.digest('hex');
}

export async function transfer(db, client, table) {
  const metadata = columns(db, table);
  const names = metadata.map(column => column.name);
  const order = metadata.filter(column => column.pk).sort((a, b) => a.pk - b.pk).map(column => column.name);
  if (!order.length) throw new Error(`Missing primary key: ${table}`);
  const ordered = order.map(quote).join(',');
  const sqliteRows = db.prepare(`SELECT * FROM ${quote(table)} ORDER BY ${ordered}`).all();
  const pgColumns = names.map(quote).join(',');
  for (let offset = 0; offset < sqliteRows.length; offset += 50) {
    const batch = sqliteRows.slice(offset, offset + 50);
    const values = [];
    const tuples = batch.map(row => {
      const placeholders = names.map(name => { values.push(row[name] instanceof Uint8Array ? Buffer.from(row[name]) : row[name]); return '$' + values.length; });
      return '(' + placeholders.join(',') + ')';
    });
    await client.query(`INSERT INTO ${quote(table)} (${pgColumns}) VALUES ${tuples.join(',')}`, values);
  }
  const pgCount = Number((await client.query(`SELECT count(*) AS n FROM ${quote(table)}`)).rows[0].n);
  if (pgCount !== sqliteRows.length) throw new Error(`Count mismatch in ${table}: ${sqliteRows.length} vs ${pgCount}`);
  const postgresRows = (await client.query({
    text: `SELECT ${pgColumns} FROM ${quote(table)} ORDER BY ${ordered}`,
    rowMode: 'array',
  })).rows;
  const sourceDigest = digest(sqliteRows.map(row => names.map(name => row[name])));
  const targetDigest = digest(postgresRows);
  if (sourceDigest !== targetDigest) throw new Error(`Content mismatch in ${table}`);
  return { rows: pgCount, sha256: sourceDigest };
}

async function main() {
  if (!existsSync(sourcePath)) throw new Error(`Không tìm thấy SQLite tại ${sourcePath}`);
  let source = new DatabaseSync(sourcePath, { readOnly: true });
  const initial = sourceInfo(source);
  console.log('SQLite integrity: ok');
  console.log('Rows:', JSON.stringify(initial.counts));
  source.close();
  if (!apply) {
    console.log('Read-only check complete. Run npm run migrate:neon -- --apply to create a snapshot and import into an EMPTY Neon database.');
    return;
  }
  if (!process.env.DATABASE_URL) throw new Error('Thiếu DATABASE_URL trong môi trường hoặc .env.neon');
  const snapshotPath = resolve('data', `neon-migration-${Date.now()}-${randomUUID().slice(0, 8)}.sqlite`);
  mkdirSync(dirname(snapshotPath), { recursive: true });
  const live = new DatabaseSync(sourcePath);
  try { live.exec(`VACUUM INTO '${snapshotPath.replaceAll("'", "''")}'`); }
  finally { live.close(); }
  console.log('Consistent SQLite backup:', snapshotPath);
  source = new DatabaseSync(snapshotPath, { readOnly: true });
  const info = sourceInfo(source);
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL, connectionTimeoutMillis: 30000, keepAlive: true });
  try {
    await client.connect();
    const existing = (await client.query("SELECT table_name FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'")).rows;
    if (existing.length) throw new Error('Neon public schema must be empty; found: ' + existing.map(row => row.table_name).join(', '));
    await client.query('BEGIN');
    try {
      for (const table of tables) {
        const sql = info.schema.get(table).replace(/\bBLOB\b/gi, 'BYTEA');
        await client.query(sql);
      }
      for (const index of info.indexes) await client.query(index.sql);
      const verified = {};
      for (const table of tables) {
        verified[table] = await transfer(source, client, table);
        console.log(`${table}: ${verified[table].rows} rows verified`);
      }
      await client.query('COMMIT');
      console.log('Neon migration completed and verified:', JSON.stringify(verified));
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    }
  } finally {
    await client.end().catch(() => {});
    source.close();
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
