import { id, now, audit, masters, transaction } from './database.js';
import { emailAddress, corporateEmail } from './identity.js';
import { fail } from './business.js';
import {createGmailRelay} from './gmail.js';

export const escapeHtml = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
export function mailFrame(title, content) {
  return `<html><body><h2>PROCUREMENT SMILE</h2><p>Best Department - Best Price - Best Solution</p><hr><h3>${escapeHtml(title)}</h3>${content}<hr><p>CJ Logistics · Procurement Operations</p></body></html>`;
}
export function queueMail(db, event) {
  const stamp = now();
  db.prepare('INSERT INTO outbox(id,event_key,order_id,kind,sender,recipients,subject,body,document_id,status,error,created_at,updated_at) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?) ON CONFLICT(event_key) DO NOTHING').run(id(), event.key, event.order_id, event.kind, event.sender, JSON.stringify(event.recipients || []), event.subject, event.body, event.document_id || null, event.status || 'QUEUED', event.error || '', stamp, stamp);
}
export function approvalRecipients(db, orderId) {
  const approval = db.prepare('SELECT * FROM approvals WHERE order_id=?').get(orderId);
  const admins = db.prepare("SELECT email FROM users u JOIN account_flags f ON f.user_id=u.id WHERE role='ADMIN' AND f.active=1").all().map(r=>r.email);
  if (!approval?.manager_email || !corporateEmail(approval.manager_email)) return { recipients: [], error: 'WH List: chưa có email @cj.net của Line Manager. Bổ sung tại Kho hàng, sau đó cập nhật tuyến duyệt.' };
  return { recipients: [...new Set([approval.manager_email,...admins])], error: '' };
}
export function parseExtraRecipients(value) {
  if(typeof value!=='string'||value.length>15000)fail('Danh sách email không hợp lệ');
  if(!value.trim())return [];
  const emails=value.split(';').map(x=>x.trim().toLowerCase());
  if(emails.length>50||emails.some(x=>x.length>254||!emailAddress(x)))fail('Nhập email hợp lệ, ngăn cách bằng một dấu ; (tối đa 50 địa chỉ, không để trống giữa các dấu ;)');
  return [...new Set(emails)];
}
export function notificationRecipients(db,orderId) {
  const order=db.prepare('SELECT data,warehouse_id FROM orders WHERE id=?').get(orderId);
  const choice=JSON.parse(order.data).notification;
  if(!choice?.requested)return {recipients:[],error:'Requestor không chọn gửi email'};
  const warehouse=masters(db,'warehouses').find(w=>w.id===order.warehouse_id);
  const manager=(choice.manager_email||warehouse?.manager_email||'').trim().toLowerCase();
  const admins=db.prepare("SELECT email FROM users u JOIN account_flags f ON f.user_id=u.id WHERE role='ADMIN' AND f.active=1").all().map(r=>r.email.toLowerCase());
  const recipients=[...new Set([manager,...(choice.auto_admin?[]:admins),...choice.extra_recipients].filter(Boolean))].filter(address=>!choice.auto_admin||!admins.includes(address));
  return {recipients,error:corporateEmail(manager)?'':'WH List chưa có email Line Manager. Admin bổ sung email kho rồi gửi lại thông báo; đơn vẫn được xử lý bình thường.'};
}
export function activeAdminRecipients(db) {
  return [...new Set(db.prepare("SELECT email FROM users u JOIN account_flags f ON f.user_id=u.id WHERE role='ADMIN' AND f.active=1").all().map(r=>r.email.trim().toLowerCase()).filter(emailAddress))];
}
export function createMailService({ db, identity, enabled = false, transport, env=process.env, provider=env.MAIL_PROVIDER||'MICROSOFT', smtpTransport }) {
  let busy = false;
  provider=String(provider).toUpperCase();
  const gmail=createGmailRelay({env,transport:smtpTransport});
  const relay=provider==='GMAIL';
  const service = {
    provider,relayEmail:relay?gmail.user:'',
    configured: Boolean(transport || (enabled && (relay?gmail.configured:provider==='MICROSOFT'&&identity.configured))),
    configError:relay?'Chưa bật Gmail SMTP hoặc thiếu mật khẩu ứng dụng. Chạy SETUP-GMAIL.cmd trên máy chủ.':'Chưa bật Microsoft Graph Mail.Send. IT cần cấu hình Entra và MAIL_ENABLED=true.',
    present(event){
      const usedProvider=event.provider||(event.attempts>0?'MICROSOFT':provider);
      return {...event,provider:usedProvider,actual_sender:event.actual_sender||(usedProvider==='GMAIL'?gmail.user:event.sender),reply_to:event.reply_to||(usedProvider==='GMAIL'?event.sender:''),accepted_recipients:JSON.parse(event.accepted_recipients||'[]')};
    },
    async deliver(event) {
      const accepted=JSON.parse(event.accepted_recipients||'[]').map(x=>x.toLowerCase());
      const recipientList = JSON.parse(event.recipients).filter(x=>!accepted.includes(x.toLowerCase()));
      if(!recipientList.length&&JSON.parse(event.recipients).length)return {acceptedRecipients:accepted,requestId:event.provider_request_id};
      if (!corporateEmail(event.sender) || !recipientList.length || recipientList.some(email=>!emailAddress(email))) fail('Địa chỉ gửi/nhận email không hợp lệ');
      let attachments = [];
      if (event.document_id) {
        const doc = db.prepare('SELECT * FROM documents WHERE id=? AND order_id=?').get(event.document_id,event.order_id);
        if (!doc) fail('Không tìm thấy file PO đã chốt');
        if (doc.content.length > (relay?15:2.5) * 1024 * 1024) fail(relay?'PO vượt giới hạn đính kèm 15 MB của ứng dụng.':'PO quá lớn cho gửi đính kèm trực tiếp; cần cấu hình upload session Microsoft Graph');
        attachments = [{ '@odata.type':'#microsoft.graph.fileAttachment', name:doc.filename, contentType:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', contentBytes:Buffer.from(doc.content).toString('base64') }];
      }
      const payload = { message: { subject:event.subject, body:{contentType:'HTML',content:event.body}, toRecipients:recipientList.map(address=>({emailAddress:{address}})), attachments }, saveToSentItems:true };
      if (transport) return transport({ sender:event.sender, payload, event });
      if(relay)return gmail.send({event,recipients:recipientList,attachments});
      const token = await identity.appToken();
      const verifiedMailbox = db.prepare('SELECT f.entra_oid FROM users u JOIN account_flags f ON f.user_id=u.id WHERE u.email=?').get(event.sender)?.entra_oid || event.sender;
      let response;
      try {
        response = await fetch('https://graph.microsoft.com/v1.0/users/' + encodeURIComponent(verifiedMailbox) + '/sendMail', { method:'POST',headers:{Authorization:'Bearer '+token,'Content-Type':'application/json','client-request-id':event.id},body:JSON.stringify(payload),signal:AbortSignal.timeout(30000) });
      } catch {
        const error = new Error('Không xác định Microsoft đã nhận thư hay chưa. Kiểm tra Sent Items trước khi thử lại.'); error.uncertain = true; throw error;
      }
      if (response.status !== 202) {
        const error = new Error(`Microsoft Graph từ chối gửi (HTTP ${response.status}). Kiểm tra quyền Mail.Send, phạm vi hộp thư và người nhận.`);
        error.uncertain = response.status >= 500; throw error;
      }
      return { requestId:response.headers.get('request-id') || '' };
    },
    async flush() {
      if (busy) return; busy = true;
      try {
        const pending = db.prepare("SELECT * FROM outbox WHERE status IN ('QUEUED','BLOCKED_CONFIG') ORDER BY created_at LIMIT 20").all();
        for (const event of pending) {
          if(['ORDER_NOTIFICATION','ADMIN_ORDER_NOTIFICATION'].includes(event.kind)){
            const order=db.prepare('SELECT status FROM orders WHERE id=?').get(event.order_id);
            if(order.status==='CANCELLED'){db.prepare("UPDATE outbox SET status='CANCELLED',updated_at=? WHERE id=?").run(now(),event.id);continue;}
          }
          if(event.kind==='ADMIN_ORDER_NOTIFICATION'){
            event.recipients=JSON.stringify(activeAdminRecipients(db));
            db.prepare('UPDATE outbox SET recipients=? WHERE id=?').run(event.recipients,event.id);
            if(!JSON.parse(event.recipients).length){db.prepare("UPDATE outbox SET status='BLOCKED_DATA',error='Chưa có Admin hoạt động',updated_at=? WHERE id=?").run(now(),event.id);continue;}
          }
          if (!service.configured) {
            db.prepare("UPDATE outbox SET status='BLOCKED_CONFIG',error=?,updated_at=? WHERE id=?").run(service.configError,now(),event.id); continue;
          }
          if (event.kind === 'APPROVAL') {
            const order = db.prepare('SELECT status FROM orders WHERE id=?').get(event.order_id);
            if (order.status !== 'PENDING_APPROVAL') { db.prepare("UPDATE outbox SET status='CANCELLED',updated_at=? WHERE id=?").run(now(),event.id); continue; }
          }
          const claimed = db.prepare("UPDATE outbox SET status='SENDING',attempts=attempts+1,updated_at=? WHERE id=? AND status IN ('QUEUED','BLOCKED_CONFIG')").run(now(),event.id);
          if (!claimed.changes) continue;
          db.prepare('UPDATE outbox SET provider=?,actual_sender=?,reply_to=? WHERE id=?').run(provider,relay?gmail.user:event.sender,relay?event.sender:'',event.id);
          try {
            const result = await service.deliver(event);
            transaction(db, () => {
              const recipients=JSON.parse(event.recipients),previous=JSON.parse(event.accepted_recipients||'[]');
              const accepted=[...new Set([...previous,...(result?.acceptedRecipients||recipients)].map(x=>x.toLowerCase()))];
              const partial=recipients.some(x=>!accepted.includes(x.toLowerCase()));
              db.prepare('UPDATE outbox SET status=?,error=?,provider_request_id=?,accepted_recipients=?,updated_at=? WHERE id=?').run(partial?'PARTIAL':'ACCEPTED',partial?'Một số địa chỉ chưa được tiếp nhận. Gửi lại chỉ gửi cho người nhận còn thiếu.':'',result?.requestId||'',JSON.stringify(accepted),now(),event.id);
              audit(db,{id:'SYSTEM'},partial?'EMAIL_PARTIALLY_ACCEPTED':'EMAIL_ACCEPTED',event.order_id,{kind:event.kind,sender:event.sender,actual_sender:relay?gmail.user:event.sender,provider,reply_to:relay?event.sender:'',recipients:accepted,event_id:event.id});
              if (event.kind === 'SUPPLIER_PO'&&!partial) {
                const docs = db.prepare('SELECT COUNT(*) AS n FROM documents WHERE order_id=?').get(event.order_id).n;
                const accepted = db.prepare("SELECT COUNT(*) AS n FROM outbox WHERE order_id=? AND kind='SUPPLIER_PO' AND status='ACCEPTED'").get(event.order_id).n;
                if (docs && accepted === docs) {
                  db.prepare("UPDATE orders SET status='SENT_TO_SUPPLIER',updated_at=? WHERE id=? AND status='PO_CREATED'").run(now(),event.order_id);
                  audit(db,{id:'SYSTEM'},'ORDER_STATUS',event.order_id,{from:'PO_CREATED',to:'SENT_TO_SUPPLIER',meaning:'Mail provider accepted all supplier messages; delivery not guaranteed'});
                }
              }
            });
          } catch (error) {
            db.prepare('UPDATE outbox SET status=?,error=?,updated_at=? WHERE id=?').run(error.uncertain?'UNKNOWN':'FAILED',String(error.message).slice(0,500),now(),event.id);
            audit(db,{id:'SYSTEM'},'EMAIL_FAILED',event.order_id,{event_id:event.id,kind:event.kind,uncertain:Boolean(error.uncertain)});
          }
        }
      } finally { busy = false; }
    },
    retry(eventId, actor, confirmUnknown = false) {
      const event = db.prepare('SELECT * FROM outbox WHERE id=?').get(eventId);
      if (!event) fail('Không tìm thấy thư',404);
      if (['ACCEPTED','SENDING','CANCELLED'].includes(event.status)) fail('Không gửi lại thư đã nhận/đang gửi/đã hủy');
      if (event.status === 'UNKNOWN' && !confirmUnknown) fail('Cần xác nhận đã kiểm tra Sent Items để tránh gửi trùng');
      if(event.kind==='APPROVAL')fail('Email duyệt thuộc quy trình cũ, không gửi lại');
      if(event.kind==='ADMIN_ORDER_NOTIFICATION'){
        if(db.prepare('SELECT status FROM orders WHERE id=?').get(event.order_id).status==='CANCELLED')fail('Đơn đã hủy');
        const recipients=activeAdminRecipients(db);
        if(!recipients.length)fail('Chưa có Admin hoạt động');
        db.prepare('UPDATE outbox SET recipients=? WHERE id=?').run(JSON.stringify(recipients),event.id);
      }
      if(event.kind==='ORDER_NOTIFICATION'){
        if(db.prepare('SELECT status FROM orders WHERE id=?').get(event.order_id).status==='CANCELLED')fail('Đơn đã hủy');
        const target=notificationRecipients(db,event.order_id);
        if(target.error)fail(target.error);
        db.prepare('UPDATE outbox SET recipients=? WHERE id=?').run(JSON.stringify(target.recipients),event.id);
      }
      if (event.kind === 'APPROVAL') {
        const recipients = approvalRecipients(db,event.order_id);
        if (recipients.error) fail(recipients.error);
        db.prepare('UPDATE outbox SET recipients=? WHERE id=?').run(JSON.stringify(recipients.recipients),event.id);
      }
      if (event.kind === 'SUPPLIER_PO') {
        const doc = db.prepare('SELECT * FROM documents WHERE id=?').get(event.document_id);
        const vendor = masters(db,'suppliers').find(s=>s.code===doc.supplier_id);
        if (!emailAddress(vendor?.email)) fail('Vendor List chưa có email hợp lệ');
        db.prepare('UPDATE outbox SET recipients=? WHERE id=?').run(JSON.stringify([vendor.email]),event.id);
      }
      db.prepare("UPDATE outbox SET status='QUEUED',error='',updated_at=? WHERE id=?").run(now(),event.id);
      audit(db,actor,'EMAIL_RETRY_REQUESTED',event.order_id,{event_id:event.id,previous_status:event.status});
    }
  };
  return service;
}
