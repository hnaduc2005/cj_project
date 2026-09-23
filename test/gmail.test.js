import test from 'node:test';
import assert from 'node:assert/strict';
import {openDatabase,id,now,putMaster} from '../lib/database.js';
import {createMailService,queueMail} from '../lib/mail.js';
import {createGmailRelay,DEFAULT_GMAIL} from '../lib/gmail.js';

function fixture(){
  const db=openDatabase(':memory:',{bootstrapPassword:'Test-only!123'}),admin=db.prepare('SELECT id FROM users WHERE email=?').get('uyenthu.cu@cj.net');
  const warehouse=putMaster(db,'warehouses',{code:'MAIL-WH',name:'Mail warehouse',manager_email:'manager@cj.net',status:'ACTIVE'});
  const order=id();db.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?)').run(order,'PO-MAIL-18.09.2026-001',warehouse,admin.id,'SUBMITTED',JSON.stringify({notification:{requested:true,manager_email:'manager@cj.net',extra_recipients:['extra@example.com']}}),now(),now());
  return {db,order,admin};
}
test('Gmail relay uses intermediary From, original Reply-To, immutable attachment and private errors',async()=>{
  const {db,order}=fixture();let captured;
  try{
    const doc=id(),bytes=Buffer.from('Existing PO bytes');
    db.prepare('INSERT INTO documents VALUES (?,?,?,?,?,?)').run(doc,order,'VENDOR','PO-PHÒNG BAN-18.09.2026-001.xlsx',bytes,now());
    queueMail(db,{key:'po:'+doc,order_id:order,kind:'SUPPLIER_PO',sender:'uyenthu.cu@cj.net',recipients:['vendor@example.com'],subject:'PO test',body:'<p>PO</p>',document_id:doc,status:'BLOCKED_CONFIG'});
    const service=createMailService({db,identity:{configured:false},provider:'GMAIL',enabled:true,env:{GMAIL_USER:DEFAULT_GMAIL},smtpTransport:{sendMail:async message=>{captured=message;return {accepted:['vendor@example.com'],rejected:[],messageId:'gmail-message'};}}});
    await service.flush();
    assert.equal(captured.from.address,DEFAULT_GMAIL);assert.equal(captured.replyTo.address,'uyenthu.cu@cj.net');assert.deepEqual(captured.to,[{address:'vendor@example.com'}]);assert.deepEqual(captured.attachments[0].content,bytes);assert.equal(captured.attachments[0].filename,'PO-PHÒNG BAN-18.09.2026-001.xlsx');assert.equal(captured.disableFileAccess,true);assert.equal(captured.disableUrlAccess,true);
    const event=db.prepare('SELECT * FROM outbox').get();assert.equal(event.status,'ACCEPTED');assert.equal(event.actual_sender,DEFAULT_GMAIL);assert.equal(event.reply_to,'uyenthu.cu@cj.net');assert.equal(event.provider,'GMAIL');assert.equal(db.prepare('SELECT status FROM orders').get().status,'SUBMITTED');
    assert.throws(()=>service.retry(event.id,{id:'SYSTEM'}));
    const auth=createGmailRelay({transport:{sendMail:async()=>{const error=Error('secret-credential-do-not-leak');error.code='EAUTH';throw error;}}});
    await assert.rejects(()=>auth.send({event,recipients:['vendor@example.com'],attachments:[]}),error=>!error.message.includes('secret-credential')&&!error.uncertain&&error.message.includes('mật khẩu ứng dụng'));
  }finally{db.close();}
});
test('Gmail partial acceptance retries only recipients not accepted; never silently resends all',async()=>{
  const {db,order,admin}=fixture();const calls=[];
  try{
    const recipients=['manager@cj.net','uyenthu.cu@cj.net','extra@example.com'];
    queueMail(db,{key:'notice',order_id:order,kind:'ORDER_NOTIFICATION',sender:'requestor@cj.net',recipients,subject:'Notice',body:'<p>Notice</p>'});
    const service=createMailService({db,identity:{configured:false},provider:'GMAIL',enabled:true,smtpTransport:{sendMail:async message=>{calls.push(message);return calls.length===1?{accepted:recipients.slice(0,2),rejected:['extra@example.com'],messageId:'partial'}:{accepted:['extra@example.com'],rejected:[],messageId:'remaining'};}}});
    await service.flush();let event=db.prepare('SELECT * FROM outbox').get();assert.equal(event.status,'PARTIAL');assert.equal(calls[0].replyTo.address,'requestor@cj.net');await service.flush();assert.equal(calls.length,1);
    service.retry(event.id,admin);await service.flush();event=db.prepare('SELECT * FROM outbox').get();assert.equal(event.status,'ACCEPTED');assert.deepEqual(calls[1].to,[{address:'extra@example.com'}]);assert.deepEqual(JSON.parse(event.accepted_recipients),recipients);
  }finally{db.close();}
});
test('Gmail missing credentials blocks safely; ambiguous timeout requires explicit retry',async()=>{
  const {db,order}=fixture();
  try{
    queueMail(db,{key:'notice',order_id:order,kind:'ORDER_NOTIFICATION',sender:'requestor@cj.net',recipients:['manager@cj.net'],subject:'Notice',body:'<p>Notice</p>'});
    const blocked=createMailService({db,identity:{configured:false},provider:'GMAIL',enabled:true,env:{GMAIL_USER:DEFAULT_GMAIL}});assert.equal(blocked.configured,false);await blocked.flush();let event=db.prepare('SELECT * FROM outbox').get();assert.equal(event.status,'BLOCKED_CONFIG');assert.ok(event.error.includes('Gmail'));assert.equal(event.attempts,0);
    const timeout=createMailService({db,identity:{configured:false},provider:'GMAIL',enabled:true,smtpTransport:{sendMail:async()=>{const error=Error('timeout');error.code='ETIMEDOUT';throw error;}}});await timeout.flush();event=db.prepare('SELECT * FROM outbox').get();assert.equal(event.status,'UNKNOWN');await timeout.flush();assert.equal(db.prepare('SELECT attempts FROM outbox').get().attempts,1);assert.throws(()=>timeout.retry(event.id,{id:'SYSTEM'}));
  }finally{db.close();}
});
