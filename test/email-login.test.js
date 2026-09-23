import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';
import {putMaster} from '../lib/database.js';

test('Email-only access: stable profiles, own orders and activity, no Microsoft or admin escalation',async t=>{
  const identity={configured:false,appUrl:'http://localhost',begin(){throw Error('Microsoft must not be used');}};
  const app=createApp({dbPath:':memory:',bootstrapPassword:'Test-password-only!',identity,worker:false});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));
  t.after(()=>{app.server.closeAllConnections();app.server.close();app.db.close();});
  const base='http://127.0.0.1:'+app.server.address().port;
  async function call(path,data,cookie,status=200){const r=await fetch(base+'/api'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)});const body=await r.json();assert.equal(r.status,status,JSON.stringify(body));return {body,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  for(const email of ['','a@gmail.com','a@cj.net.evil.com','a@cj.net@evil.com','a b@cj.net'])await call('/auth/email',{email},null,400);
  const first=await call('/auth/email',{email:'  Person@CJ.NET  '});assert.equal(first.body.email,'person@cj.net');assert.equal(first.body.role,'REQUESTER');
  await call('/admin/accounts',undefined,first.cookie,403);
  const wh=putMaster(app.db,'warehouses',{code:'WH-EMAIL',name:'Email test',status:'ACTIVE'});
  const order=await call('/orders',{warehouse_id:wh,items:[{original_item_name:'Test',uom:'Cái',quantity:1,supplier_code:'UNKNOWN'}]},first.cookie,201);
  await call('/logout',{},first.cookie);
  const again=await call('/auth/email',{email:'person@cj.net'});assert.equal(first.body.id,again.body.id);
  assert.equal((await call('/orders',undefined,again.cookie)).body[0].id,order.body.id);
  const activity=(await call('/activity',undefined,again.cookie)).body;assert.ok(activity.some(x=>x.action==='EMAIL_LOGIN'));assert.ok(activity.some(x=>x.action==='ORDER_CREATED'));assert.ok(activity.some(x=>x.action==='LOGOUT'));assert.ok(activity.every(x=>!('data' in x)));
  const other=await call('/auth/email',{email:'other@cj.net'});assert.deepEqual((await call('/orders',undefined,other.cookie)).body,[]);await call('/orders/'+order.body.id,undefined,other.cookie,404);assert.ok((await call('/activity',undefined,other.cookie)).body.every(x=>x.action==='EMAIL_LOGIN'));
  await call('/auth/email',{email:'admin@cj.net'},null,403);
  app.db.prepare("UPDATE users SET role='ADMIN' WHERE id=?").run(again.body.id);
  await call('/admin/accounts',undefined,again.cookie,401);await call('/auth/email',{email:'person@cj.net'},null,403);
  app.db.prepare('UPDATE account_flags SET active=0 WHERE user_id=?').run(other.body.id);await call('/auth/email',{email:'other@cj.net'},null,403);
});
