import { workerData } from 'node:worker_threads';
import pg from 'pg';

pg.types.setTypeParser(20, value => Number(value)); // COUNT(*) and other int8 values.

const { port, connectionString } = workerData;
let client = null;
let disconnected = false;
let inTransaction = false;
let implicitTransaction = false;
const savepoints = [];
let internalSavepoint = 0;

async function connect() {
  if (client && !disconnected) return;
  if (inTransaction) throw new Error('Mất kết nối PostgreSQL trong transaction; thao tác đã bị hủy');
  if (process.env.NODE_ENV === 'test' && connectionString === 'pglite://test') {
    const { PGlite } = await import('@electric-sql/pglite');
    client = new PGlite();
    return;
  }
  client = new pg.Client({ connectionString, connectionTimeoutMillis: 30000, query_timeout: 120000, keepAlive: true });
  disconnected = false;
  client.on('error', () => { disconnected = true; });
  try { await client.connect(); }
  catch (error) { disconnected = true; throw error; }
}

async function query(sql, values = []) {
  await connect();
  try {
    return await client.query(sql, values.map(value => value instanceof Uint8Array ? Buffer.from(value) : value));
  } catch (error) {
    if (client?._queryable === false) disconnected = true;
    throw error;
  }
}

function parameters(sql) {
  let result = '', quote = '', index = 0;
  for (let i = 0; i < sql.length; i++) {
    const char = sql[i];
    if (quote) {
      result += char;
      if (char === quote) {
        if (sql[i + 1] === quote) result += sql[++i];
        else quote = '';
      }
    } else if (char === "'" || char === '"') {
      quote = char; result += char;
    } else if (char === '?') result += '$' + ++index;
    else result += char;
  }
  return result;
}

async function prepared(type, sql, args) {
  const translated = parameters(sql);
  // SQLite lets a failed statement be caught while a savepoint remains usable.
  // PostgreSQL needs a nested savepoint to recover from that statement error.
  const guard = savepoints.length ? 'app_statement_' + ++internalSavepoint : null;
  if (guard) await query('SAVEPOINT ' + guard);
  try {
    const result = await query(translated, args);
    if (guard) await query('RELEASE SAVEPOINT ' + guard);
    if (type === 'run') return { changes: result.rowCount || 0 };
    if (type === 'get') return result.rows[0];
    return result.rows;
  } catch (error) {
    if (guard && !disconnected) {
      await query('ROLLBACK TO SAVEPOINT ' + guard);
      await query('RELEASE SAVEPOINT ' + guard);
    }
    throw error;
  }
}

async function statement(sql) {
  const normalized = sql.trim();
  if (!normalized) return;
  if (/^BEGIN(?:\s+IMMEDIATE)?$/i.test(normalized)) {
    await query('BEGIN'); inTransaction = true; implicitTransaction = false;
  } else if (/^SAVEPOINT\s+([a-z_][a-z0-9_]*)$/i.test(normalized)) {
    const name = /^SAVEPOINT\s+([a-z_][a-z0-9_]*)$/i.exec(normalized)[1];
    if (!inTransaction) {
      await query('BEGIN'); inTransaction = true; implicitTransaction = true;
    }
    await query('SAVEPOINT ' + name); savepoints.push(name);
  } else if (/^ROLLBACK\s+TO\s+([a-z_][a-z0-9_]*)$/i.test(normalized)) {
    if (disconnected) throw new Error('Mất kết nối PostgreSQL trong savepoint');
    const name = /^ROLLBACK\s+TO\s+([a-z_][a-z0-9_]*)$/i.exec(normalized)[1];
    await query('ROLLBACK TO SAVEPOINT ' + name);
    savepoints.splice(savepoints.lastIndexOf(name) + 1);
  } else if (/^RELEASE\s+([a-z_][a-z0-9_]*)$/i.test(normalized)) {
    const name = /^RELEASE\s+([a-z_][a-z0-9_]*)$/i.exec(normalized)[1];
    await query('RELEASE SAVEPOINT ' + name);
    savepoints.splice(savepoints.lastIndexOf(name));
    if (implicitTransaction && !savepoints.length) {
      await query('COMMIT'); inTransaction = false; implicitTransaction = false;
    }
  } else if (/^ROLLBACK$/i.test(normalized)) {
    if (!disconnected) await query('ROLLBACK');
    inTransaction = false; implicitTransaction = false; savepoints.length = 0;
  } else if (/^COMMIT$/i.test(normalized)) {
    await query('COMMIT'); inTransaction = false; implicitTransaction = false; savepoints.length = 0;
  } else {
    await query(normalized);
  }
}

port.on('message', async message => {
  const signal = new Int32Array(message.signal);
  let response;
  try {
    if (message.type === 'ping') { await connect(); response = { value: true }; }
    else if (message.type === 'close') {
      if (client && !disconnected) await (client.end ? client.end() : client.close());
      response = { value: true };
    } else if (message.type === 'exec') {
      for (const sql of message.sql.split(';')) await statement(sql);
      response = { value: true };
    } else response = { value: await prepared(message.type, message.sql, message.args) };
  } catch (error) {
    response = { error: { message: error.message, code: error.code } };
  }
  port.postMessage(response);
  Atomics.store(signal, 0, 1);
  Atomics.notify(signal, 0);
  if (message.type === 'close') port.close();
});
