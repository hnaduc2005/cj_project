import {unifiedRoute} from './lib/unified-catalog.js';
import {initProcurement,departmentWarehouse,procurementRoute} from './lib/procurement.js';
import http from 'node:http';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join, dirname, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';
import { openDatabase, id, now, transaction, masters, putMaster, audit, checkPassword, hashPassword } from './lib/database.js';
import { fail, safeItem, matchItem, validateItem, validateMaster, fields, transitions, normalize } from './lib/business.js';
import { readWorkbook, parseOrdering, tableWorkbook, createPO, orderingWorkbook } from './lib/excel.js';
import { microsoftIdentity, PRIMARY_ADMIN, corporateEmail, canonicalEmail, emailAddress, getAccount, provisionMicrosoftUser, provisionEmailUser } from './lib/identity.js';
import { importCompanyData, nextOrderNumber, localDate } from './lib/company-data.js';
import { queueMail, notificationRecipients, activeAdminRecipients, parseExtraRecipients, createMailService, mailFrame, escapeHtml as html } from './lib/mail.js';
import { suggestedMapping, resolveMasterCode } from './lib/master-import.js';

const root = dirname(fileURLToPath(import.meta.url));
export function createApp({ dbPath = resolve(root, process.env.DB_PATH || 'data/purchase.sqlite'), bootstrapPassword, identity = microsoftIdentity(), mailTransport, mailEnabled = process.env.MAIL_ENABLED === 'true', mailProvider=process.env.MAIL_PROVIDER||'MICROSOFT', gmailEnv=process.env, smtpTransport, worker = true } = {}) {
  const db = openDatabase(dbPath, { bootstrapPassword: bootstrapPassword || process.env.BOOTSTRAP_ADMIN_PASSWORD }), sessions = new Map(), attempts = new Map(), authStates = new Map();
  initProcurement(db);
  transaction(db,()=>{
    for(const row of db.prepare("SELECT id FROM orders WHERE status='PENDING_APPROVAL'").all()){
      db.prepare("UPDATE orders SET status='SUBMITTED',updated_at=? WHERE id=?").run(now(),row.id);
      audit(db,{id:'SYSTEM'},'APPROVAL_REQUIREMENT_REMOVED',row.id);
    }
    db.prepare("UPDATE approvals SET status='CANCELLED' WHERE status='PENDING'").run();
    db.prepare("UPDATE outbox SET status='CANCELLED',error='Quy trình duyệt đã được thay bằng thông báo; không gửi thư duyệt cũ.',updated_at=? WHERE kind='APPROVAL' AND status IN ('QUEUED','BLOCKED_CONFIG','BLOCKED_DATA','FAILED')").run(now());
  });
  const mailer = createMailService({ db, identity, enabled: mailEnabled, transport: mailTransport, provider:mailProvider, env:gmailEnv, smtpTransport });
  const secure = identity.appUrl.startsWith('https:');
  function loginSession(res, user, authMethod = 'verified') {
    const token = randomBytes(32).toString('hex');
    sessions.set(token,{ userId:user.id, authMethod, expires:Date.now()+8*3600000 });
    res.setHeader('Set-Cookie','cj_session='+token+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=28800'+(secure?'; Secure':''));
    return user;
  }
  function getOrder(key, user) {
    const row = db.prepare('SELECT * FROM orders WHERE id=?').get(key);
    const approval = db.prepare('SELECT * FROM approvals WHERE order_id=?').get(key);
    if (!row || (user.role !== 'ADMIN' && row.user_id !== user.id)) fail('Không tìm thấy đơn hàng', 404);
    const data = JSON.parse(row.data), warehouse = masters(db, 'warehouses').find(w => w.id === row.warehouse_id);
    const requester = db.prepare('SELECT name,email FROM users WHERE id=?').get(row.user_id);
    const items = db.prepare('SELECT * FROM items WHERE order_id=?').all(key).map(r => {
      const raw = JSON.parse(r.data);
      const snapRow = db.prepare('SELECT data FROM snapshots WHERE item_id=?').get(r.id);
      const snapshot = snapRow ? JSON.parse(snapRow.data) : null;
      const item = snapshot ? { ...raw, match_status: 'MATCHED', price_status: 'AVAILABLE', price: snapshot } : matchItem(db, raw);
      return user.role === 'ADMIN' ? { ...item, id: r.id, snapshot } : safeItem({ ...item, id: r.id });
    });
    const order = { ...data, id: row.id, number: row.number, status: row.status, warehouse, requester, created_at: row.created_at, updated_at: row.updated_at, items, approval: approval || null };
    if (user.role !== 'ADMIN') { delete order.confirmed_by; delete order.supplier_snapshots; }
    order.email_status = db.prepare("SELECT kind,status,error,updated_at FROM outbox WHERE order_id=? AND kind IN ('APPROVAL','ORDER_NOTIFICATION','ADMIN_ORDER_NOTIFICATION')").all(key);
    if (user.role === 'ADMIN') {
      order.total = items.reduce((sum, i) => { const p = i.snapshot || i.price; const base = p ? Math.round(i.quantity * p.unit_price) : 0; return sum + base + (p ? Math.round(base * p.vat_percent / 100) : 0); }, 0);
      order.documents = db.prepare('SELECT id,filename,supplier_id,created_at FROM documents WHERE order_id=?').all(key);
      order.history = db.prepare('SELECT action,data,created_at FROM audit WHERE entity_id=? ORDER BY created_at DESC').all(key).map(r => ({ ...r, data: JSON.parse(r.data) }));
      order.emails = db.prepare('SELECT id,kind,sender,provider,actual_sender,reply_to,accepted_recipients,recipients,subject,status,error,attempts,updated_at FROM outbox WHERE order_id=? ORDER BY created_at').all(key).map(r=>({...mailer.present(r),recipients:JSON.parse(r.recipients)}));
    }
    return order;
  }
  function listOrders(user) {
    const rows = user.role === 'ADMIN' ? db.prepare('SELECT id FROM orders ORDER BY created_at DESC').all() : db.prepare('SELECT id FROM orders WHERE user_id=? ORDER BY created_at DESC').all(user.id);
    return rows.map(r => getOrder(r.id, user));
  }
  function notify(order, message, toAdmin = false) {
    const recipients = toAdmin ? db.prepare("SELECT u.id FROM users u JOIN account_flags f ON f.user_id=u.id WHERE role='ADMIN' AND f.active=1").all() : [db.prepare('SELECT user_id AS id FROM orders WHERE id=?').get(order.id)];
    for (const user of recipients) db.prepare('INSERT INTO notifications VALUES (?,?,?,?,?)').run(id(), user.id, message, order.id, now());
  }
  function setStatus(order, status, user) {
    db.prepare('UPDATE orders SET status=?,updated_at=? WHERE id=?').run(status, now(), order.id);
    audit(db, user, 'ORDER_STATUS', order.id, { from: order.status, to: status });
    notify(order, order.number + ': ' + status);
  }
  function enqueueNotification(order, adminOnly=false) {
    const target = adminOnly?{recipients:activeAdminRecipients(db),error:''}:notificationRecipients(db,order.id);
    if(!target.recipients.length&&!target.error)return;
    const content = `<p>${html(order.requester.name)} (${html(order.requester.email)}) đề xuất mua hàng cho <strong>${html(order.warehouse.name)}</strong>.</p><p>${html(order.note)}</p><table border="1" cellpadding="8"><tr><th>Mặt hàng</th><th>ĐVT</th><th>Số lượng</th><th>Ghi chú</th></tr>${order.items.map(i=>`<tr><td>${html(i.original_item_name)}</td><td>${html(i.uom)}</td><td>${i.quantity}</td><td>${html(i.note)}</td></tr>`).join('')}</table><p>Đây là thông báo đơn hàng của kho. Line Manager không cần phê duyệt trên website. Bộ phận mua hàng sẽ tiếp nhận và xử lý. Email không chứa giá.</p>`;
    queueMail(db,{key:(adminOnly?'admin-notification:':'notification:')+order.id,order_id:order.id,kind:adminOnly?'ADMIN_ORDER_NOTIFICATION':'ORDER_NOTIFICATION',sender:order.requester.email,recipients:target.recipients,subject:'[Thông báo đơn hàng] '+order.number,body:mailFrame(order.number,content),status:target.error?'BLOCKED_DATA':'QUEUED',error:target.error});
  }
  async function body(req) {
    let size = 0; const chunks = [];
    for await (const chunk of req) { size += chunk.length; if (size > 30 * 1024 * 1024) fail('Dữ liệu gửi lên quá lớn', 413); chunks.push(chunk); }
    try { const result = JSON.parse(Buffer.concat(chunks).toString() || '{}'); if (!result || typeof result !== 'object' || Array.isArray(result)) fail('JSON phải là object'); return result; } catch (e) { if (e.status) throw e; fail('JSON không hợp lệ'); }
  }
  function send(res, value, status = 200) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' }); res.end(JSON.stringify(value)); }
  function excel(res, buffer, filename) { res.writeHead(200, { 'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'Content-Disposition': "attachment; filename*=UTF-8''" + encodeURIComponent(filename) }); res.end(buffer); }
  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY'); res.setHeader('Referrer-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
    res.setHeader('Cache-Control', 'no-store');
    try {
      const url = new URL(req.url, 'http://localhost'), path = url.pathname, method = req.method;
      if (!path.startsWith('/api/')) {
        if (method !== 'GET') fail('Không hỗ trợ', 405);
        const assets = { '/app.js': ['app.js', 'text/javascript'], '/styles.css': ['styles.css', 'text/css'], '/v2.js':['v2.js','text/javascript'], '/procurement.js':['procurement.js','text/javascript'], '/brand.css':['brand.css','text/css'], '/refinement.css':['refinement.css','text/css'], '/assets/cj-logistics-logo.webp':['assets/cj-logistics-logo.webp','image/webp'], '/assets/cj-icon.png':['assets/cj-icon.png','image/png'], '/assets/cj-login-wall.jpg':['assets/cj-login-wall.jpg','image/jpeg'], '/assets/cj-workspace-wall.png':['assets/cj-workspace-wall.png','image/png'], '/favicon.svg': ['favicon.svg', 'image/svg+xml'], '/': ['index.html', 'text/html'] };
        const asset = assets[path] || (!path.includes('.') ? assets['/'] : null);
        if (!asset) fail('Không tìm thấy', 404);
        res.writeHead(200, { 'Content-Type': asset[1] + '; charset=utf-8' }); return res.end(readFileSync(join(root, 'public', asset[0])));
      }
      if (!['GET', 'HEAD'].includes(method) && req.headers.origin && req.headers.origin !== new URL(identity.appUrl).origin) fail('Origin không hợp lệ', 403);
      if (path === '/api/auth/config' && method === 'GET') return send(res,{requestor_login:'email_only',sso_configured:identity.configured,mail_configured:mailer.configured,mail_provider:mailer.provider,relay_email:mailer.relayEmail,primary_email:PRIMARY_ADMIN});
      if (path === '/api/auth/email' && method === 'POST') {
        const data = await body(req);
        const user = transaction(db,()=>provisionEmailUser(db,data.email));
        loginSession(res,user,'email_only');
        audit(db,user,'EMAIL_LOGIN',user.id,{email:user.email});
        return send(res,user);
      }
      if (path === '/api/auth/microsoft' && method === 'GET') {
        const email=canonicalEmail(url.searchParams.get('email'));
        if(email&&!corporateEmail(email))fail('Chỉ chấp nhận email @cj.net');
        for(const [key,value] of authStates)if(value.expires<Date.now())authStates.delete(key);
        if(authStates.size>1000)fail('Hệ thống đang bận; thử lại sau',429);
        const state=randomBytes(32).toString('hex'), auth=await identity.begin(email,state);
        authStates.set(state,{verifier:auth.verifier,expires:Date.now()+600000});
        res.setHeader('Set-Cookie','cj_oauth_state='+state+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=600'+(secure?'; Secure':''));
        res.writeHead(302,{Location:auth.url});return res.end();
      }
      if (path === '/api/auth/microsoft/callback' && method === 'GET') {
        const state=url.searchParams.get('state'), pending=authStates.get(state), cookieState=/(?:^|;\s*)cj_oauth_state=([a-f0-9]+)/.exec(req.headers.cookie||'')?.[1];
        if(!state||state!==cookieState||!pending||pending.expires<Date.now())fail('Phiên đăng nhập Microsoft không hợp lệ hoặc đã hết hạn',403);
        authStates.delete(state);
        if(url.searchParams.get('error')){res.writeHead(302,{Location:'/#/login?error=Microsoft%20sign-in%20cancelled'});return res.end();}
        if(!url.searchParams.get('code'))fail('Thiếu mã xác thực Microsoft',400);
        const profile=await identity.complete(url.searchParams.get('code'),pending.verifier);
        const user=transaction(db,()=>provisionMicrosoftUser(db,profile));
        loginSession(res,user);audit(db,user,'MICROSOFT_LOGIN',user.id);
        res.writeHead(302,{Location:'/#/dashboard'});return res.end();
      }
      if (method === 'POST' && path === '/api/login') {
        const data = await body(req), email = String(data.email || '').trim().toLowerCase();
        const key = req.socket.remoteAddress + ':' + email, entry = attempts.get(key);
        if (entry && entry.until > Date.now() && entry.count >= 10) fail('Thử lại sau 15 phút', 429);
        const user = db.prepare('SELECT * FROM users WHERE email=?').get(email);
        if (!user || email!==PRIMARY_ADMIN || !getAccount(db,user.id)?.active || !checkPassword(String(data.password || ''), user.password)) {
          attempts.set(key, { count: entry?.until > Date.now() ? entry.count + 1 : 1, until: Date.now() + 900000 }); fail('Email hoặc mật khẩu không đúng', 401);
        }
        attempts.delete(key);
        const safe=getAccount(db,user.id);loginSession(res,safe);
        audit(db, safe, 'ADMIN_PASSWORD_LOGIN', user.id); return send(res, safe);
      }
      const token = /(?:^|;\s*)cj_session=([a-f0-9]+)/.exec(req.headers.cookie || '')?.[1];
      const session = sessions.get(token);
      if (path === '/api/me' && method === 'GET' && (!session || session.expires <= Date.now())) return send(res, null);
      if (!session || session.expires <= Date.now()) { sessions.delete(token); fail('Vui lòng đăng nhập', 401); }
      const user = getAccount(db,session.userId);
      if(!user?.active){sessions.delete(token);fail('Tài khoản không còn hoạt động',401);}
      if(session.authMethod==='email_only' && user.role==='ADMIN'){sessions.delete(token);fail('Bạn đã được cấp quyền Admin. Vui lòng đăng nhập qua tab quản trị',401);}
      if (path.startsWith('/api/admin/') && user.role !== 'ADMIN') fail('Bạn không có quyền quản trị', 403);
      if (path === '/api/me' && method === 'GET') return send(res, user);
      if (path === '/api/logout' && method === 'POST') { audit(db,user,'LOGOUT',user.id);sessions.delete(token); res.setHeader('Set-Cookie', 'cj_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'+(secure?'; Secure':'')); return send(res, { ok: true }); }
      if (path === '/api/activity' && method === 'GET') return send(res,db.prepare('SELECT action,entity_id,created_at FROM audit WHERE user_id=? ORDER BY created_at DESC LIMIT 300').all(user.id));
      if(path==='/api/admin/accounts'&&method==='GET')return send(res,db.prepare('SELECT u.id,u.email,u.name,u.role,f.active,f.is_primary,f.created_at FROM users u JOIN account_flags f ON f.user_id=u.id WHERE u.email LIKE ? ORDER BY f.is_primary DESC,u.email').all('%@cj.net'));
      if(path==='/api/admin/accounts'&&method==='POST'){
        const data=await body(req), email=canonicalEmail(data.email);
        if(!corporateEmail(email))fail('Email được cấp quyền phải có đuôi @cj.net');
        if(!['grant','revoke'].includes(data.action))fail('Thao tác tài khoản không hợp lệ');
        if(email===PRIMARY_ADMIN)fail('Tài khoản Admin chính luôn được giữ quyền quản trị');
        if(email===user.email&&data.action==='revoke')fail('Không tự thu hồi quyền của phiên đang thao tác');
        transaction(db,()=>{
          let target=db.prepare('SELECT * FROM users WHERE email=?').get(email);
          if(!target&&data.action==='grant'){
            const key=id();db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(key,email,String(data.name||email.split('@')[0]),'ADMIN',hashPassword(randomBytes(40).toString('hex')));
            db.prepare('INSERT INTO account_flags VALUES (?,1,0,NULL,?)').run(key,now());target={id:key};
          }else if(!target)fail('Tài khoản chưa tồn tại',404);
          db.prepare('UPDATE users SET role=? WHERE id=?').run(data.action==='grant'?'ADMIN':'REQUESTER',target.id);
          db.prepare('UPDATE account_flags SET active=1 WHERE user_id=?').run(target.id);
          audit(db,user,data.action==='grant'?'ADMIN_GRANTED':'ADMIN_REVOKED',target.id,{email});
        });
        return send(res,{ok:true});
      }
      if(path==='/api/admin/setup'&&method==='GET'){
        const wh=masters(db,'warehouses').filter(w=>w.status==='ACTIVE'),vendors=masters(db,'suppliers').filter(s=>s.status==='ACTIVE');
        return send(res,{sso_configured:identity.configured,mail_configured:mailer.configured,mail_provider:mailer.provider,relay_email:mailer.relayEmail,redirect_uri:identity.redirectUri,app_url:identity.appUrl,primary_email:PRIMARY_ADMIN,missing_managers:wh.filter(w=>!w.manager_email).map(w=>({code:w.code,name:w.name})),missing_vendor_emails:vendors.filter(s=>!s.email).map(s=>({code:s.code,name:s.name})),pending_prices:masters(db,'prices').filter(p=>p.needs_review||p.vat_percent===''||!p.effective_from).length,company_import:JSON.parse(db.prepare("SELECT value FROM settings WHERE key='company_data_v2'").get()?.value||'null')});
      }
      if(path==='/api/admin/mail'&&method==='GET')return send(res,db.prepare('SELECT m.id,m.order_id,o.number,m.kind,m.sender,m.provider,m.actual_sender,m.reply_to,m.accepted_recipients,m.recipients,m.subject,m.status,m.error,m.attempts,m.updated_at FROM outbox m JOIN orders o ON o.id=m.order_id ORDER BY m.created_at DESC LIMIT 300').all().map(r=>({...mailer.present(r),recipients:JSON.parse(r.recipients)})));
      const mailRoute=/^\/api\/admin\/mail\/([^/]+)(?:\/(retry))?$/.exec(path);
      if(mailRoute){
        const mail=db.prepare('SELECT * FROM outbox WHERE id=?').get(mailRoute[1]);if(!mail)fail('Không tìm thấy email',404);
        if(method==='GET')return send(res,{...mailer.present(mail),recipients:JSON.parse(mail.recipients)});
        if(method==='POST'&&mailRoute[2]==='retry'){const data=await body(req);mailer.retry(mail.id,user,data.confirm_unknown===true);await mailer.flush();return send(res,{ok:true});}
      }
      if(method==='GET'&&['/api/admin/import-template/suppliers','/api/admin/import-template/items'].includes(path)){
        const vendor=path.endsWith('/suppliers');
        return excel(res,readFileSync(join(root,'templates',vendor?'import-vendor-list.xlsx':'import-item-list.xlsx')),vendor?'Import Vendor List.xlsx':'ImportItemList.xlsx');
      }
      if(await unifiedRoute({db,user,path,method,req,res,body,send,excel}))return;
      if(await procurementRoute({db,user,path,method,url,req,res,body,send,getOrder}))return;
      if(path==='/api/approvals'||path.startsWith('/api/approvals/'))fail('Line Manager chỉ nhận thông báo email, không có chức năng phê duyệt',410);
      if (path === '/api/catalog' && method === 'GET') {
        const active = kind => masters(db, kind).filter(x => x.status === 'ACTIVE');
        return send(res, { departments: active('departments').filter(d=>active('warehouses').some(w=>w.code===d.warehouse_code)), warehouses: active('warehouses'), suppliers: active('suppliers').map(s => ({ code: s.code, name: s.name })), products: active('products').map(p => ({ code: p.code, name: p.name, uom: p.uom })) });
      }
      if (path === '/api/notifications' && method === 'GET') return send(res, db.prepare('SELECT * FROM notifications WHERE user_id=? ORDER BY created_at DESC LIMIT 30').all(user.id));
      if (path === '/api/orders' && method === 'GET') return send(res, listOrders(user));
      if (path === '/api/template/ordering' && method === 'GET') {
        const warehouse = masters(db,'warehouses').find(w=>w.code===url.searchParams.get('warehouse'))||masters(db,'warehouses').find(w=>w.status==='ACTIVE');
        if(!warehouse)fail('Chưa có kho hoạt động');
        return excel(res,await orderingWorkbook(warehouse),'Ordering template - '+warehouse.code+'.xlsx');
      }
      if (path === '/api/orders/preview' && method === 'POST') {
        if(user.role==='ADMIN')fail('Admin chỉ xử lý và quản trị, không tạo yêu cầu',403);
        const data = await body(req), mapped=departmentWarehouse(db,data), wh = mapped?.warehouse || masters(db, 'warehouses').find(w => w.id === data.warehouse_id && w.status === 'ACTIVE');
        if (!wh) fail('Chọn một kho đang hoạt động');
        let items = data.items, errors = [], header = {};
        if (data.file) { const parsed = parseOrdering(await readWorkbook(data.file), wh,masters(db,'suppliers')); items = parsed.items; errors = parsed.errors; header = parsed.header; }
        if (!Array.isArray(items) || !items.length || items.length > 2000) fail('Cần 1–2.000 mặt hàng');
        if (!data.file) errors = items.flatMap((item, i) => validateItem(item, i + 1));
        return send(res, { items: items.map(i => safeItem(matchItem(db, i))), errors, header });
      }
      if (path === '/api/orders' && method === 'POST') {
        if(user.role==='ADMIN')fail('Admin chỉ xử lý và quản trị, không tạo yêu cầu',403);
        const data = await body(req), mapped=departmentWarehouse(db,data), wh = mapped?.warehouse || masters(db, 'warehouses').find(w => w.id === data.warehouse_id && w.status === 'ACTIVE');
        if (!wh) fail('Chọn một kho đang hoạt động');
        let rawItems = data.items, attachment, parsedHeader = {};
        if (data.file) { attachment = await readWorkbook(data.file); const parsed = parseOrdering(attachment, wh,masters(db,'suppliers')); if (parsed.errors.length) fail('Hãy sửa các dòng Excel không hợp lệ', 400, parsed.errors); rawItems = parsed.items; parsedHeader = parsed.header; }
        if (!Array.isArray(rawItems) || !rawItems.length || rawItems.length > 2000) fail('Cần 1–2.000 mặt hàng');
        const errors = rawItems.flatMap((i, index) => validateItem(i, index + 1)); if (errors.length) fail('Dữ liệu chưa hợp lệ', 400, errors);
        const items = rawItems.map(i => ({ original_item_name: String(i.original_item_name), supplier_code: String(i.supplier_code || '').trim(), uom: String(i.uom).trim(), quantity: Number(i.quantity), note: String(i.note || '') }));
        const key = data.id || id(), previous = data.id ? getOrder(data.id, user) : null;
        if(mapped&&(!String(data.purpose||'').trim()||!String(data.requested_date||'').trim()))fail('Nhập nội dung đơn hàng và ngày mong muốn nhận hàng');
        if (previous && previous.status !== 'DRAFT') fail('Chỉ sửa được đơn nháp');
        if (previous && db.prepare('SELECT user_id FROM orders WHERE id=?').get(key).user_id !== user.id) fail('Chỉ chủ đơn được sửa bản nháp', 403);
        transaction(db, () => {
          const stamp = now(), number = previous&&previous.warehouse.id===wh.id&&(!mapped||previous.department_code===mapped.department.code) ? previous.number : nextOrderNumber(db,wh,new Date(),mapped?.department.name||wh.name);
          const info = { department_code: mapped?.department.code || '', note: mapped?String(data.note||''):parsedHeader.note || String(data.note || ''), purpose: mapped?String(data.purpose||''):parsedHeader.purpose || String(data.purpose || ''), department: mapped?.department.name || parsedHeader.department || String(data.department || ''), requested_date: mapped?String(data.requested_date||''):parsedHeader.requested_date || String(data.requested_date || ''), receiver_name: parsedHeader.receiver_name || wh.receiver_name, receiver_phone: parsedHeader.receiver_phone || wh.receiver_phone, address: wh.address, source: data.file ? 'EXCEL' : 'MANUAL', original_file_name: data.file?.name || '' };
          if(info.requested_date && (!/^\d{4}-\d{2}-\d{2}$/.test(info.requested_date)||!Number.isFinite(Date.parse(info.requested_date))||new Date(info.requested_date).toISOString().slice(0,10)!==info.requested_date))fail('Ngày mong muốn nhận hàng không hợp lệ');
          if (previous) {
            db.prepare('UPDATE orders SET number=?,warehouse_id=?,data=?,updated_at=? WHERE id=?').run(number,wh.id, JSON.stringify(info), stamp, key);
            db.prepare('DELETE FROM items WHERE order_id=?').run(key);
            db.prepare('DELETE FROM attachments WHERE order_id=?').run(key);
          } else db.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?)').run(key, number, wh.id, user.id, 'DRAFT', JSON.stringify(info), stamp, stamp);
          for (const item of items) db.prepare('INSERT INTO items VALUES (?,?,?)').run(id(), key, JSON.stringify(item));
          if (attachment) db.prepare('INSERT INTO attachments VALUES (?,?,?,?)').run(id(), key, data.file.name, attachment.buffer);
          audit(db, user, previous ? 'DRAFT_UPDATED' : 'ORDER_CREATED', key);
        });
        return send(res, getOrder(key, user), 201);
      }
      const orderRoute = /^\/api\/orders\/([^/]+)(?:\/(submit|export))?$/.exec(path);
      if (orderRoute) {
        const order = getOrder(orderRoute[1], user);
        if (method === 'GET' && !orderRoute[2]) return send(res, order);
        if (method === 'GET' && orderRoute[2] === 'export') {
          return excel(res, await orderingWorkbook(order.warehouse,order), order.number + '.xlsx');
        }
        if (method === 'POST' && orderRoute[2] === 'submit') {
          if(user.role==='ADMIN')fail('Admin không gửi yêu cầu mua hàng',403);
          if (order.status !== 'DRAFT') fail('Chỉ gửi được đơn nháp');
          if(order.department_code){const mapped=departmentWarehouse(db,{department_code:order.department_code,warehouse_id:order.warehouse.id});if(!mapped)fail('Phòng ban không hợp lệ');}
          if (order.warehouse.status !== 'ACTIVE') fail('Kho đã ngừng hoạt động. Sửa đơn và chọn kho khác.');
          if (db.prepare('SELECT user_id FROM orders WHERE id=?').get(order.id).user_id !== user.id) fail('Chỉ chủ đơn được gửi', 403);
          const data=await body(req);
          if(typeof data.notify_manager!=='boolean')fail('Vui lòng chọn có gửi email thông báo hay không');
          const extras=parseExtraRecipients(data.extra_recipients||'');
          if(!data.notify_manager&&extras.length)fail('Chọn gửi thông báo để thêm người nhận');
          transaction(db, () => {
            const stored=JSON.parse(db.prepare('SELECT data FROM orders WHERE id=?').get(order.id).data);
            const notification={requested:data.notify_manager,auto_admin:true,extra_recipients:extras,manager_email:canonicalEmail(order.warehouse.manager_email),confirmed_at:now()};
            db.prepare('UPDATE orders SET data=? WHERE id=?').run(JSON.stringify({...stored,notification}),order.id);
            setStatus(order, 'SUBMITTED', user);
            audit(db,user,'ORDER_NOTIFICATION_CHOICE',order.id,notification);
            enqueueNotification(order,true);
            if(data.notify_manager)enqueueNotification(order);
            notify(order, order.number + ': yêu cầu mới chờ Admin tiếp nhận', true);
          });
          await mailer.flush();
          return send(res, getOrder(order.id, user));
        }
      }
      const masterRoute = /^\/api\/admin\/master\/([^/]+)(?:\/(export|preview|commit))?$/.exec(path);
      if (masterRoute) {
        const kind = masterRoute[1], action = masterRoute[2]; if (!fields[kind]) fail('Danh mục không hợp lệ');
        if (method === 'GET' && !action) return send(res, { fields: fields[kind], rows: masters(db, kind) });
        if (method === 'GET' && action === 'export') return excel(res, await tableWorkbook(fields[kind], masters(db, kind)), kind + '.xlsx');
        const data = await body(req);
        if (method === 'POST' && !action) {
          const valid = validateMaster(db, kind, resolveMasterCode(db,kind,data));
          transaction(db, () => { const before = masters(db, kind).find(m => m.code === valid.code); const key = putMaster(db, kind, valid); audit(db, user, 'MASTER_UPDATED', key, { kind, before: before || null, after: valid }); });
          return send(res, { ok: true });
        }
        if (method === 'POST' && ['preview', 'commit'].includes(action)) {
          const parsed = await readWorkbook(data.file), recommendedMapping=suggestedMapping(kind,parsed.headers,fields[kind]), mapping = data.mapping || recommendedMapping;
          const counts = { new: 0, update: 0, duplicate: 0, invalid: 0 }, errors = [], seen = new Set();
          db.exec('SAVEPOINT import_preview');
          let rows;
          try { rows = parsed.rows.map(r => {
            const raw = resolveMasterCode(db,kind,Object.fromEntries(fields[kind].map(f => [f, r.data[mapping[f]] ?? ''])));
            try {
              if (seen.has(raw.code)) { counts.duplicate++; fail('Mã bị lặp trong file'); } seen.add(raw.code);
              const valid = validateMaster(db, kind, raw), existing = masters(db, kind).find(m => m.code === valid.code);
              const type = existing ? 'update' : 'new';
              putMaster(db, kind, valid);
              counts[type]++; return { row: r.row, type, data: valid };
            } catch (e) { counts.invalid++; errors.push({ row: r.row, column: 'Master', issue: e.message, correction: 'Sửa dữ liệu theo tên cột và kiểm tra mã tham chiếu' }); return { row: r.row, type: 'invalid', data: raw }; }
          }); } finally { db.exec('ROLLBACK TO import_preview; RELEASE import_preview'); }
          if (!rows.length) fail('File không có dữ liệu');
          if (action === 'preview') return send(res, { headers: parsed.headers, fields: fields[kind], suggested_mapping:recommendedMapping, rows, counts, errors });
          if (errors.length) {
            transaction(db, () => {
              const key = id(), rejected = { new: 0, update: 0, duplicate: counts.duplicate, invalid: errors.length, rejected: rows.length };
              db.prepare('INSERT INTO imports VALUES (?,?,?,?,?,?)').run(key, user.id, data.file.name, kind, JSON.stringify(rejected), now());
              audit(db, user, 'IMPORT_REJECTED', key, { kind, filename: data.file.name, errors });
            });
            fail('Không nhập: cần sửa toàn bộ lỗi trước', 400, errors);
          }
          transaction(db, () => {
            // Revalidate sequentially inside transaction to catch conflicts between rows in the same batch.
            for (const row of rows) { const valid = validateMaster(db, kind, row.data), before = masters(db, kind).find(m => m.code === valid.code); const key = putMaster(db, kind, valid); audit(db, user, 'MASTER_IMPORTED', key, { kind, before: before || null, after: valid }); }
            const key = id(); db.prepare('INSERT INTO imports VALUES (?,?,?,?,?,?)').run(key, user.id, data.file.name, kind, JSON.stringify(counts), now()); audit(db, user, 'IMPORT_COMMITTED', key, { kind, filename: data.file.name, counts });
          });
          return send(res, { counts });
        }
      }
      const adminOrder = /^\/api\/admin\/orders\/([^/]+)\/(status|resolve|generate-po|refresh-routing|delivery)$/.exec(path);
      if (adminOrder && method === 'POST') {
        const order = getOrder(adminOrder[1], user), action = adminOrder[2], data = await body(req);
        if(action==='delivery'){
          if(['PO_CREATED','SENT_TO_SUPPLIER','COMPLETED','CANCELLED','REJECTED'].includes(order.status))fail('Thông tin giao nhận đã khóa');
          const changes=Object.fromEntries(['address','receiver_name','receiver_phone'].map(k=>[k,String(data[k]||'').trim()]));
          if(Object.values(changes).some(v=>!v||v.length>1000))fail('Nhập đầy đủ địa chỉ, người nhận và số điện thoại (tối đa 1.000 ký tự mỗi trường)');
          transaction(db,()=>{const info=JSON.parse(db.prepare('SELECT data FROM orders WHERE id=?').get(order.id).data);db.prepare('UPDATE orders SET data=?,updated_at=? WHERE id=?').run(JSON.stringify({...info,...changes}),now(),order.id);audit(db,user,'DELIVERY_UPDATED',order.id,{before:Object.fromEntries(Object.keys(changes).map(k=>[k,info[k]])),after:changes});});
        }
        if(action==='refresh-routing')fail('Không còn tuyến phê duyệt',410);
        if (action === 'status') {
          if(data.status==='SENT_TO_SUPPLIER')fail('Trạng thái gửi NCC được cập nhật tự động khi máy chủ email tiếp nhận thư, không đánh dấu thủ công');
          if(order.status==='PENDING_APPROVAL'&&data.status==='CANCELLED'){
            transaction(db,()=>{setStatus(order,'CANCELLED',user);db.prepare("UPDATE approvals SET status='CANCELLED' WHERE order_id=?").run(order.id);db.prepare("UPDATE outbox SET status='CANCELLED',updated_at=? WHERE order_id=? AND status IN ('QUEUED','BLOCKED_DATA','BLOCKED_CONFIG','FAILED')").run(now(),order.id);});
            return send(res,getOrder(order.id,user));
          }
          if (!(transitions[order.status] || []).includes(data.status)) fail('Chuyển trạng thái không hợp lệ');

          if (data.status === 'PRICE_COMPLETED' && order.items.some(i => i.match_status !== 'MATCHED')) fail('Phải xử lý mọi mặt hàng và giá trước');
          transaction(db, () => setStatus(order, data.status, user));
        }
        if (action === 'resolve') {
          if (!['SUBMITTED', 'PROCESSING', 'WAITING_FOR_PRICE'].includes(order.status)) fail('Không thể sửa mặt hàng ở trạng thái hiện tại');
          const item = order.items.find(i => i.id === data.item_id); if (!item) fail('Không tìm thấy dòng hàng');
          const product = masters(db, 'products').find(p => p.code === data.product_code && p.status === 'ACTIVE');
          if (!product || !masters(db, 'suppliers').some(s => s.code === data.supplier_code && s.status === 'ACTIVE')) fail('Chọn sản phẩm và nhà cung cấp đang hoạt động');
          if (normalize(product.uom) !== normalize(item.uom)) fail(`Đơn vị tính khác nhau: yêu cầu “${item.uom}”, sản phẩm “${product.uom}”. Chọn sản phẩm cùng đơn vị tính.`);
          const raw = JSON.parse(db.prepare('SELECT data FROM items WHERE id=?').get(item.id).data);
          const resolved = { ...raw, product_code: product.code, standard_item_name: product.name, supplier_code: data.supplier_code, selection_reason:String(data.selection_reason||'').slice(0,2000) };
          transaction(db, () => {
            db.prepare('UPDATE items SET data=? WHERE id=?').run(JSON.stringify(resolved), item.id);
            if (data.approve_alias) {
              const alias = validateMaster(db, 'aliases', { code: 'ALIAS-' + id().slice(0,8), name: raw.original_item_name, product_code: product.code, supplier_code: data.supplier_code, uom: raw.uom, status: 'ACTIVE' });
              putMaster(db, 'aliases', alias); audit(db, user, 'ALIAS_APPROVED', order.id, alias);
            }
            audit(db, user, 'ITEM_RESOLVED', order.id, { item_id: item.id, before: raw, after: resolved });
          });
        }
        if (action === 'generate-po') {
          if (order.status !== 'PRICE_COMPLETED') fail('Đơn phải ở trạng thái Đã đủ giá');

          if (order.items.some(i => i.match_status !== 'MATCHED' || !i.price)) fail('Còn dòng hàng chưa có giá hợp lệ');
          if(!order.address||!order.receiver_name||!order.receiver_phone)fail('Thiếu địa chỉ/người nhận/số điện thoại của đơn. Hoàn thiện thông tin giao hàng trước khi phát hành.');
          const suppliers = masters(db, 'suppliers'), documents = [], captured = now(), originalHeader=db.prepare('SELECT data FROM orders WHERE id=?').get(order.id).data;
          const items = order.items.map(i => ({ ...i, snapshot: { unit_price: i.price.unit_price, vat_percent: i.price.vat_percent, currency: i.price.currency, quotation_no: i.price.quotation_no, supplier_code: i.supplier_code, captured_at: captured } }));
          for (const code of new Set(items.map(i => i.supplier_code))) {
            const supplier = suppliers.find(s => s.code === code);
            if(!supplier||supplier.status!=='ACTIVE'||!emailAddress(supplier.email))fail('Bổ sung email hợp lệ và trạng thái ACTIVE cho nhà cung cấp '+code);
            const multiple=new Set(items.map(i=>i.supplier_code)).size>1;
            const filename = order.number + (multiple?' - '+code:'') + '.xlsx';
            documents.push({ supplier, filename, buffer: await createPO({...order,confirmed_by:user.name+' · '+user.email,po_date:localDate(new Date(captured)).display}, supplier, items.filter(i => i.supplier_code === code)) });
          }
          transaction(db, () => {
            if (db.prepare('SELECT status FROM orders WHERE id=?').get(order.id).status !== 'PRICE_COMPLETED') fail('Đơn vừa thay đổi; tải lại trang');
            if(db.prepare('SELECT data FROM orders WHERE id=?').get(order.id).data!==originalHeader)fail('Thông tin nhận hàng vừa thay đổi; kiểm tra lại trước khi phát hành');
            for(const doc of documents){const latest=masters(db,'suppliers').find(s=>s.code===doc.supplier.code);if(!latest||JSON.stringify(latest)!==JSON.stringify(doc.supplier))fail('Thông tin vendor vừa thay đổi; kiểm tra lại trước khi phát hành');}
            for (const item of items) {
              const latest = matchItem(db, JSON.parse(db.prepare('SELECT data FROM items WHERE id=?').get(item.id).data));
              if (latest.product_code!==item.product_code || latest.supplier_code!==item.supplier_code || latest.quantity!==item.quantity || latest.match_status !== 'MATCHED' || latest.price.unit_price !== item.snapshot.unit_price || latest.price.vat_percent !== item.snapshot.vat_percent || latest.price.quotation_no !== item.snapshot.quotation_no) fail('Giá vừa thay đổi; kiểm tra lại trước khi tạo PO');
              db.prepare('INSERT INTO snapshots VALUES (?,?,?)').run(id(), item.id, JSON.stringify(item.snapshot));
              const frozen = safeItem(item); delete frozen.id;
              db.prepare('UPDATE items SET data=? WHERE id=?').run(JSON.stringify(frozen), item.id);
            }
            for (const doc of documents) {
              const key=id();db.prepare('INSERT INTO documents VALUES (?,?,?,?,?,?)').run(key, order.id, doc.supplier.code, doc.filename, doc.buffer, captured);
              queueMail(db,{key:'po:'+key,order_id:order.id,kind:'SUPPLIER_PO',sender:user.email,recipients:[doc.supplier.email],subject:'[Purchase Order] '+order.number,body:mailFrame(order.number,`<p>Kính gửi ${html(doc.supplier.name)},</p><p>CJ Logistics gửi đơn đặt hàng đính kèm cho kho <strong>${html(order.warehouse.name)}</strong>.</p><p>Địa chỉ: ${html(order.address)}<br>Người nhận: ${html(order.receiver_name)} · ${html(order.receiver_phone)}</p><p>Vui lòng xác nhận nhận đơn và lịch giao hàng bằng cách phản hồi email này.</p><p>Trân trọng,<br>${html(user.name)}</p>`),document_id:key});
            }
            setStatus(order, 'PO_CREATED', user); audit(db, user, 'PO_GENERATED', order.id, { files: documents.map(d => d.filename), template: 'FORM PO.xlsx',confirmed_by:user.email });
          });
          await mailer.flush();
        }
        return send(res, getOrder(order.id, user));
      }
      const docRoute = /^\/api\/admin\/documents\/([^/]+)$/.exec(path);
      if (docRoute && method === 'GET') { const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(docRoute[1]); if (!doc) fail('Không có tài liệu', 404); return excel(res, Buffer.from(doc.content), doc.filename); }
      if (path === '/api/admin/audit' && method === 'GET') return send(res, db.prepare('SELECT a.*,u.name AS user_name FROM audit a LEFT JOIN users u ON u.id=a.user_id ORDER BY a.created_at DESC LIMIT 300').all().map(r => ({ ...r, data: JSON.parse(r.data) })));
      if (path === '/api/admin/imports' && method === 'GET') return send(res, db.prepare('SELECT * FROM imports ORDER BY created_at DESC LIMIT 100').all().map(r => ({ ...r, data: JSON.parse(r.data) })));
      fail('Không tìm thấy chức năng', 404);
    } catch (error) {
      if (!error.status) console.error(error);
      if (!res.headersSent) send(res, { error: error.status ? error.message : 'Lỗi máy chủ. Kiểm tra cửa sổ Terminal.', details: error.details }, error.status || 500);
      else res.end();
    }
  });
  const interval=worker?setInterval(()=>mailer.flush().catch(error=>console.error('Mail worker:',error.message)),15000):null;
  interval?.unref();server.on('close',()=>{if(interval)clearInterval(interval);});
  return { server, db, sessions, mailer };
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const host = process.env.HOST || '127.0.0.1';
  if (!['127.0.0.1', 'localhost', '::1'].includes(host) && !process.env.APP_URL?.startsWith('https://')) throw new Error('Triển khai mạng cần APP_URL HTTPS và reverse proxy TLS.');
  const { server,db } = createApp();
  await importCompanyData(db);
  server.listen(Number(process.env.PORT || 3000), host, () => console.log('PROCUREMENT SMILE: '+(process.env.APP_URL||'http://'+host+':'+(process.env.PORT||3000))+'\nCtrl+C để dừng. Hướng dẫn: README.md'));
}
