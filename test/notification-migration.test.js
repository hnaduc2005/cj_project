import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,rmdirSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {openDatabase,putMaster,now} from '../lib/database.js';
import {queueMail} from '../lib/mail.js';
import {createApp} from '../server.js';

test('Legacy pending orders move to Admin without sending obsolete approval messages',()=>{
  const folder=mkdtempSync(join(tmpdir(),'cj-notification-test-')),path=join(folder,'test.sqlite');
  let db=openDatabase(path,{bootstrapPassword:'Test-password-only!'});
  try {
    const user=db.prepare('SELECT id FROM users LIMIT 1').get();
    const wh=putMaster(db,'warehouses',{code:'MIGRATION',name:'Migration',status:'ACTIVE'});
    db.prepare('INSERT INTO orders VALUES (?,?,?,?,?,?,?,?)').run('legacy','PO-LEGACY',wh,user.id,'PENDING_APPROVAL','{}',now(),now());
    db.prepare('INSERT INTO approvals(order_id,manager_email,status,created_at) VALUES (?,?,?,?)').run('legacy','manager@cj.net','PENDING',now());
    queueMail(db,{key:'legacy-approval',order_id:'legacy',kind:'APPROVAL',sender:'requestor@cj.net',recipients:['manager@cj.net'],subject:'Old approval',body:'Old approval'});
    db.close();db=null;
    const app=createApp({dbPath:path,worker:false});
    try {
      assert.equal(app.db.prepare('SELECT status FROM orders').get().status,'SUBMITTED');
      assert.equal(app.db.prepare('SELECT status FROM approvals').get().status,'CANCELLED');
      assert.equal(app.db.prepare('SELECT status FROM outbox').get().status,'CANCELLED');
      assert.equal(app.db.prepare("SELECT COUNT(*) AS n FROM audit WHERE action='APPROVAL_REQUIREMENT_REMOVED'").get().n,1);
    } finally {app.db.close();}
  } finally {if(db)db.close();rmSync(join(folder,'test.sqlite'),{force:true});for(const suffix of ['-wal','-shm'])rmSync(path+suffix,{force:true});rmdirSync(folder);}
});
