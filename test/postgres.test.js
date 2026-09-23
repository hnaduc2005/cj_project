import test from 'node:test';
import assert from 'node:assert/strict';
import { openDatabase, putMaster, transaction } from '../lib/database.js';
import { createApp } from '../server.js';
import { initProcurement } from '../lib/procurement.js';
import { sourceInfo, transfer } from '../scripts/migrate-sqlite-to-neon.mjs';
import { PGlite } from '@electric-sql/pglite';
import { DatabaseSync } from 'node:sqlite';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';

test('PostgreSQL schema, parameters, bytea and transactions work with embedded PostgreSQL', () => {
  const previousUrl = process.env.DATABASE_URL;
  const previousMode = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'pglite://test';
  let db;
  try {
    db = openDatabase(':memory:', { bootstrapPassword: '' });
    assert.equal(db.prepare("SELECT count(*) AS n FROM information_schema.tables WHERE table_schema='public'").get().n, 15);
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('user-1', 'u@example.com', 'User', 'ADMIN', 'hash');
    assert.equal(db.prepare('SELECT email FROM users WHERE id=?').get('user-1').email, 'u@example.com');
    assert.equal(db.prepare('SELECT id FROM users WHERE id=?').get('missing'), undefined);
    assert.equal(db.prepare('UPDATE users SET name=? WHERE id=?').run('Updated', 'user-1').changes, 1);
    db.prepare('INSERT INTO masters VALUES (?,?,?,?)').run('warehouse-1', 'warehouses', 'W1', '{}');
    db.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?)').run('order-1', 'PO-1', 'warehouse-1', 'user-1', 'DRAFT', '{}', 'now', 'now');
    const content = Buffer.from([0, 1, 2, 127, 255]);
    db.prepare('INSERT INTO attachments VALUES (?,?,?,?)').run('attachment-1', 'order-1', 'binary.bin', content);
    assert.deepEqual(db.prepare('SELECT content FROM attachments WHERE id=?').get('attachment-1').content, content);
    assert.throws(() => transaction(db, () => {
      db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('user-2', 'v@example.com', 'User', 'ADMIN', 'hash');
      throw new Error('rollback');
    }), /rollback/);
    assert.equal(db.prepare('SELECT id FROM users WHERE id=?').get('user-2'), undefined);
    db.exec('SAVEPOINT preview');
    db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('user-3', 'w@example.com', 'User', 'ADMIN', 'hash');
    assert.throws(() => db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('user-3', 'duplicate@example.com', 'User', 'ADMIN', 'hash'));
    assert.equal(db.prepare('SELECT email FROM users WHERE id=?').get('user-3').email, 'w@example.com');
    db.exec('ROLLBACK TO preview; RELEASE preview');
    assert.equal(db.prepare('SELECT id FROM users WHERE id=?').get('user-3'), undefined);
  } finally {
    db?.close();
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
  }
});

test('SQLite schema and rows including binary documents migrate with matching hashes', async () => {
  const source = openDatabase(':memory:', { bootstrapPassword: '' });
  const target = new PGlite();
  const client = {
    query(sql, values = []) {
      if (typeof sql === 'object') return target.query(sql.text, [], { rowMode: sql.rowMode });
      return target.query(sql, values);
    },
  };
  try {
    initProcurement(source);
    source.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run('user-1', 'u@example.com', 'User', 'ADMIN', 'hash');
    source.prepare('INSERT INTO masters VALUES (?,?,?,?)').run('warehouse-1', 'warehouses', 'W1', '{}');
    source.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?)').run('order-1', 'PO-1', 'warehouse-1', 'user-1', 'DRAFT', '{}', 'now', 'now');
    source.prepare('INSERT INTO attachments VALUES (?,?,?,?)').run('attachment-1', 'order-1', 'binary.bin', Buffer.from([0, 1, 255]));
    const info = sourceInfo(source);
    await client.query('BEGIN');
    for (const table of Object.keys(info.counts)) await client.query(info.schema.get(table).replace(/\bBLOB\b/gi, 'BYTEA'));
    for (const index of info.indexes) await client.query(index.sql);
    for (const table of Object.keys(info.counts)) assert.equal((await transfer(source, client, table)).rows, info.counts[table]);
    await client.query('COMMIT');
  } finally {
    source.close();
    await target.close();
  }
});

const localSqlite = resolve('data/purchase.sqlite');
test('Current local SQLite database can migrate and verify on embedded PostgreSQL', { skip: !existsSync(localSqlite) }, async () => {
  const source = new DatabaseSync(localSqlite, { readOnly: true });
  const target = new PGlite();
  const client = {
    query(sql, values = []) {
      if (typeof sql === 'object') return target.query(sql.text, [], { rowMode: sql.rowMode });
      return target.query(sql, values);
    },
  };
  try {
    const info = sourceInfo(source);
    await client.query('BEGIN');
    for (const table of Object.keys(info.counts)) await client.query(info.schema.get(table).replace(/\bBLOB\b/gi, 'BYTEA'));
    for (const index of info.indexes) await client.query(index.sql);
    for (const table of Object.keys(info.counts)) assert.equal((await transfer(source, client, table)).rows, info.counts[table]);
    await client.query('COMMIT');
  } finally {
    source.close();
    await target.close();
  }
});

test('HTTP login and order creation work on PostgreSQL', async () => {
  const previousUrl = process.env.DATABASE_URL;
  const previousMode = process.env.NODE_ENV;
  process.env.NODE_ENV = 'test';
  process.env.DATABASE_URL = 'pglite://test';
  let app;
  try {
    const identity = { configured: false, appUrl: 'http://localhost', begin() { throw Error('Microsoft disabled'); } };
    app = createApp({ dbPath: ':memory:', bootstrapPassword: 'Test-password-only!', identity, worker: false });
    putMaster(app.db, 'warehouses', { code: 'WH-TEST', name: 'Test warehouse', status: 'ACTIVE' });
    await new Promise(resolve => app.server.listen(0, '127.0.0.1', resolve));
    const base = 'http://127.0.0.1:' + app.server.address().port;
    async function request(path, body, cookie, expectedStatus = 200) {
      const response = await fetch(base + '/api' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { 'Content-Type': 'application/json', ...(cookie ? { cookie } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const value = await response.json();
      assert.equal(response.status, expectedStatus, JSON.stringify(value));
      return { value, cookie: response.headers.get('set-cookie')?.split(';')[0] };
    }
    const login = await request('/auth/email', { email: 'buyer@cj.net' });
    const warehouse = app.db.prepare("SELECT id FROM masters WHERE kind='warehouses' AND code='WH-TEST'").get().id;
    const order = await request('/orders', { warehouse_id: warehouse, items: [{ original_item_name: 'Test', uom: 'Cái', quantity: 1, supplier_code: 'UNKNOWN' }] }, login.cookie, 201);
    assert.equal((await request('/orders', undefined, login.cookie)).value[0].id, order.value.id);
  } finally {
    if (app) {
      app.server.closeAllConnections();
      app.server.close();
      app.db.close();
    }
    if (previousUrl === undefined) delete process.env.DATABASE_URL;
    else process.env.DATABASE_URL = previousUrl;
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
  }
});
