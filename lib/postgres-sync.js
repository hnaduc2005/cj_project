import { MessageChannel, Worker, receiveMessageOnPort } from 'node:worker_threads';

// The existing application uses DatabaseSync inside synchronous transactions.
// A dedicated worker owns one PostgreSQL connection and preserves that API.
export class PostgresSync {
  constructor(connectionString) {
    if (!/^postgres(?:ql)?:\/\//i.test(connectionString || '') && !(process.env.NODE_ENV === 'test' && connectionString === 'pglite://test')) {
      throw new Error('DATABASE_URL phải là PostgreSQL connection string');
    }
    const { port1, port2 } = new MessageChannel();
    this.port = port1;
    this.signal = new Int32Array(new SharedArrayBuffer(4));
    this.worker = new Worker(new URL('./postgres-worker.js', import.meta.url), {
      workerData: { connectionString, port: port2 },
      transferList: [port2],
    });
    this.workerError = null;
    this.worker.on('error', error => { this.workerError = error; });
    try { this.request('ping'); }
    catch (error) { this.worker.terminate(); this.port.close(); throw error; }
  }

  request(type, sql, args = []) {
    if (this.workerError) throw this.workerError;
    Atomics.store(this.signal, 0, 0);
    this.port.postMessage({ type, sql, args, signal: this.signal.buffer });
    if (Atomics.wait(this.signal, 0, 0, 180000) === 'timed-out') {
      throw new Error('PostgreSQL không phản hồi trong 180 giây; kiểm tra kết nối Neon');
    }
    let packet;
    for (let attempt = 0; attempt < 1000 && !packet; attempt++) {
      packet = receiveMessageOnPort(this.port)?.message;
      if (!packet) Atomics.wait(this.signal, 0, 1, 1);
    }
    if (!packet) throw new Error('Không nhận được phản hồi từ PostgreSQL worker');
    if (packet.error) {
      const error = new Error(packet.error.message);
      if (packet.error.code) error.code = packet.error.code;
      throw error;
    }
    return reviveBuffers(packet.value);
  }

  exec(sql) { this.request('exec', sql); }
  prepare(sql) {
    return {
      get: (...args) => this.request('get', sql, args),
      all: (...args) => this.request('all', sql, args),
      run: (...args) => this.request('run', sql, args),
    };
  }
  close() {
    try { this.request('close'); }
    finally { this.port.close(); this.worker.terminate(); }
  }
}

function reviveBuffers(value) {
  if (value instanceof Uint8Array) return Buffer.from(value);
  if (Array.isArray(value)) return value.map(reviveBuffers);
  if (value && typeof value === 'object') {
    for (const key of Object.keys(value)) value[key] = reviveBuffers(value[key]);
  }
  return value;
}
