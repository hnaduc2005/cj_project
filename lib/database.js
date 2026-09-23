import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomBytes, scryptSync, timingSafeEqual, randomUUID } from 'node:crypto';

export const id = () => randomUUID();
export const now = () => new Date().toISOString();
export function hashPassword(password, salt = randomBytes(16).toString('hex')) {
  return salt + ':' + scryptSync(password, salt, 64).toString('hex');
}
export function checkPassword(password, stored) {
  const [salt, hash] = stored.split(':');
  return timingSafeEqual(Buffer.from(hash, 'hex'), scryptSync(password, salt, 64));
}
export function openDatabase(path, { seedDemo = false, bootstrapPassword = process.env.BOOTSTRAP_ADMIN_PASSWORD } = {}) {
  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });
  const db = new DatabaseSync(path);
  db.exec(`PRAGMA foreign_keys=ON; PRAGMA journal_mode=WAL;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,email TEXT UNIQUE NOT NULL,name TEXT NOT NULL,role TEXT NOT NULL,password TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS masters(id TEXT PRIMARY KEY,kind TEXT NOT NULL,code TEXT NOT NULL,data TEXT NOT NULL,UNIQUE(kind,code));
    CREATE TABLE IF NOT EXISTS orders(id TEXT PRIMARY KEY,number TEXT UNIQUE NOT NULL,warehouse_id TEXT NOT NULL REFERENCES masters(id),user_id TEXT NOT NULL REFERENCES users(id),status TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL,updated_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS items(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS snapshots(id TEXT PRIMARY KEY,item_id TEXT UNIQUE NOT NULL REFERENCES items(id),data TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,action TEXT NOT NULL,entity_id TEXT,data TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS imports(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,filename TEXT NOT NULL,kind TEXT NOT NULL,data TEXT NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS attachments(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),filename TEXT NOT NULL,content BLOB NOT NULL);
    CREATE TABLE IF NOT EXISTS documents(id TEXT PRIMARY KEY,order_id TEXT NOT NULL REFERENCES orders(id),supplier_id TEXT NOT NULL,filename TEXT NOT NULL,content BLOB NOT NULL,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT NOT NULL,message TEXT NOT NULL,order_id TEXT,created_at TEXT NOT NULL);
  `);
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings(key TEXT PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS account_flags(user_id TEXT PRIMARY KEY REFERENCES users(id),active INTEGER NOT NULL DEFAULT 1,is_primary INTEGER NOT NULL DEFAULT 0,entra_oid TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS order_sequences(warehouse_id TEXT NOT NULL,local_date TEXT NOT NULL,last_number INTEGER NOT NULL,PRIMARY KEY(warehouse_id,local_date));
    CREATE TABLE IF NOT EXISTS approvals(order_id TEXT PRIMARY KEY REFERENCES orders(id),manager_email TEXT NOT NULL,status TEXT NOT NULL,decided_by TEXT,decided_at TEXT,comment TEXT,created_at TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS outbox(id TEXT PRIMARY KEY,event_key TEXT UNIQUE NOT NULL,order_id TEXT NOT NULL REFERENCES orders(id),kind TEXT NOT NULL,sender TEXT NOT NULL,recipients TEXT NOT NULL,subject TEXT NOT NULL,body TEXT NOT NULL,document_id TEXT,status TEXT NOT NULL,error TEXT NOT NULL DEFAULT '',attempts INTEGER NOT NULL DEFAULT 0,created_at TEXT NOT NULL,updated_at TEXT NOT NULL,provider_request_id TEXT);
  `);
  if (seedDemo && !db.prepare('SELECT id FROM users LIMIT 1').get()) seed(db);
  const mailColumns=new Set(db.prepare('PRAGMA table_info(outbox)').all().map(c=>c.name));
  for(const [name,definition] of [['provider',"TEXT NOT NULL DEFAULT ''"],['actual_sender',"TEXT NOT NULL DEFAULT ''"],['reply_to',"TEXT NOT NULL DEFAULT ''"],['accepted_recipients',"TEXT NOT NULL DEFAULT '[]'"]]){
    if(!mailColumns.has(name))db.exec(`ALTER TABLE outbox ADD COLUMN ${name} ${definition}`);
  }
  const primaryEmail = 'uyenthu.cu@cj.net';
  if (!db.prepare('SELECT id FROM users WHERE email=?').get(primaryEmail) && bootstrapPassword) {
    transaction(db, () => {
      const key = id();
      db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(key, primaryEmail, 'Uyên Thư', 'ADMIN', hashPassword(bootstrapPassword));
      db.prepare('INSERT INTO account_flags VALUES (?,1,1,NULL,?)').run(key, now());
    });
  }
  db.prepare('INSERT OR IGNORE INTO account_flags(user_id,active,is_primary,created_at) SELECT id,1,0,? FROM users').run(now());
  // Retire prototype accounts without deleting their orders or history.
  db.prepare("UPDATE account_flags SET active=0 WHERE user_id IN (SELECT id FROM users WHERE email LIKE '%@cj.local')").run();
  db.prepare("UPDATE outbox SET status='UNKNOWN',error='Máy chủ dừng khi đang gửi. Kiểm tra Sent Items trước khi thử lại.',updated_at=? WHERE status='SENDING'").run(now());
  return db;
}
export function transaction(db, fn) {
  db.exec('BEGIN IMMEDIATE');
  try { const result = fn(); db.exec('COMMIT'); return result; }
  catch (error) { db.exec('ROLLBACK'); throw error; }
}
export function audit(db, user, action, entity, data = {}) {
  db.prepare('INSERT INTO audit VALUES (?,?,?,?,?,?)').run(id(), user.id, action, entity, JSON.stringify(data), now());
}
export function masters(db, kind) {
  return db.prepare('SELECT * FROM masters WHERE kind=? ORDER BY code').all(kind).map(r => ({ ...JSON.parse(r.data), id: r.id, code: r.code }));
}
export function putMaster(db, kind, data) {
  const existing = db.prepare('SELECT id,data FROM masters WHERE kind=? AND code=?').get(kind, data.code);
  if(existing){const old=JSON.parse(existing.data);if(old.unified)data={unified:old.unified,sequence:old.sequence,price_code:old.price_code,...data};}
  const key = existing?.id || id();
  db.prepare('INSERT INTO masters VALUES (?,?,?,?) ON CONFLICT(kind,code) DO UPDATE SET data=excluded.data').run(key, kind, data.code, JSON.stringify({ ...data, id: key }));
  return key;
}
function seed(db) {
  transaction(db, () => {
    const insert = db.prepare('INSERT INTO users VALUES (?,?,?,?,?)');
    insert.run('requester-demo', 'requester@cj.local', 'Nguyễn Minh Anh', 'REQUESTER', hashPassword(process.env.DEMO_REQUESTER_PASSWORD || 'Requester@123'));
    insert.run('requester-other', 'requester2@cj.local', 'Trần Hoàng Nam', 'REQUESTER', hashPassword(process.env.DEMO_REQUESTER_PASSWORD || 'Requester@123'));
    insert.run('admin-demo', 'admin@cj.local', 'Trần Quỳnh Anh', 'ADMIN', hashPassword(process.env.DEMO_ADMIN_PASSWORD || 'Admin@123'));
    const warehouses = [
      ['WH-BD', 'Kho Bình Dương', 'KCN Sóng Thần, Dĩ An, Bình Dương', 'Nguyễn Văn Hùng'],
      ['WH-LA', 'Kho Long An', 'KCN Long Hậu, Cần Giuộc, Long An', 'Lê Thị Mai'],
      ['WH-BN', 'Kho Bắc Ninh', 'KCN Tiên Sơn, Bắc Ninh', 'Trần Văn Nam']
    ];
    for (const [code, name, address, receiver_name] of warehouses) putMaster(db, 'warehouses', { code, name, address, receiver_name, receiver_phone: '0901234567', receiver_email: 'warehouse@cj.local', status: 'ACTIVE' });
    for (const [code, name] of [['SUP-AP', 'An Phát Supply'], ['SUP-MH', 'Minh Hưng Packaging'], ['SUP-TT', 'Tân Tiến Safety']]) putMaster(db, 'suppliers', { code, name, contact_person: 'Bộ phận kinh doanh', email: 'sales@example.com', phone: '028 3822 1234', payment_terms: 'Thanh toán trong 30 ngày', delivery_terms: 'Giao tại kho trong 5 ngày', warranty: 'Theo thỏa thuận', status: 'ACTIVE' });
    const products = [['SP-001', 'Băng keo trong 48mm', 'Cuộn', 'Vật tư đóng gói', 18000], ['SP-002', 'Màng PE quấn pallet', 'Cuộn', 'Vật tư đóng gói', 185000], ['SP-003', 'Găng tay bảo hộ', 'Đôi', 'Bảo hộ lao động', 12000], ['SP-004', 'Thùng carton 5 lớp', 'Cái', 'Vật tư đóng gói', 24000], ['SP-005', 'Giấy A4 Double A', 'Ram', 'Văn phòng phẩm', 78000]];
    for (const [code, name, uom, category, unit_price] of products) {
      putMaster(db, 'products', { code, name, uom, category, status: 'ACTIVE' });
      putMaster(db, 'prices', { code: 'PRICE-' + code, product_code: code, supplier_code: 'SUP-AP', uom, unit_price, vat_percent: 10, currency: 'VND', effective_from: '2026-01-01', effective_to: '', quotation_no: 'DEMO-2026', status: 'ACTIVE' });
    }
    const warehouse = masters(db, 'warehouses')[0];
    const seedRows = [
      ['SUBMITTED', 'Vật tư vận hành tuần 38', 'requester-demo', 'Băng keo trong 48mm', 48, 'Cuộn'],
      ['PROCESSING', 'Bổ sung vật tư đóng gói', 'requester-demo', 'Màng PE quấn pallet', 12, 'Cuộn'],
      ['WAITING_FOR_PRICE', 'Trang bị khu vực xuất hàng', 'requester-demo', 'Xe đẩy hàng 4 bánh', 2, 'Cái'],
      ['DRAFT', 'Văn phòng phẩm tháng 9', 'requester-demo', 'Giấy A4 Double A', 20, 'Ram'],
      ['SUBMITTED', 'Yêu cầu kho khác', 'requester-other', 'Găng tay bảo hộ', 30, 'Đôi']
    ];
    seedRows.forEach(([status, note, user, name, quantity, uom], index) => {
      const key = id(), date = new Date(Date.now() - index * 86400000).toISOString();
      const wh = masters(db, 'warehouses')[index % 3];
      db.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?)').run(key, 'PR-DEMO-' + String(index + 1).padStart(4, '0'), wh.id, user, status, JSON.stringify({ note, department: 'Vận hành kho', source: 'MANUAL', receiver_name: wh.receiver_name, receiver_phone: wh.receiver_phone, address: wh.address }), date, date);
      db.prepare('INSERT INTO items VALUES (?,?,?)').run(id(), key, JSON.stringify({ original_item_name: name, supplier_code: 'SUP-AP', uom, quantity, note: '' }));
    });
  });
}
