import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { readFileSync } from 'node:fs';
import { createApp } from '../server.js';
import { importCompanyData, nextOrderNumber, localDate } from '../lib/company-data.js';
import { transaction, masters, putMaster } from '../lib/database.js';
import { tableWorkbook, readWorkbook, parseOrdering, orderingHeaders } from '../lib/excel.js';

test('PROCUREMENT SMILE v2 end-to-end', async t => {
  let base='http://127.0.0.1', mailMode='ok';const delivered=[];
  const profiles={requestor:{email:'requestor@cj.net',name:'Test Requestor',oid:'req-oid'},other:{email:'other@cj.net',name:'Other Requestor',oid:'other-oid'},manager:{email:'manager@cj.net',name:'Line Manager',oid:'manager-oid'},coadmin:{email:'coadmin@cj.net',name:'Co Admin',oid:'coadmin-oid'},outside:{email:'outside@example.com',name:'Outside',oid:'outside-oid'}};
  const identity={configured:true,get appUrl(){return base;},get redirectUri(){return base+'/api/auth/microsoft/callback';},async begin(email,state){return {url:'https://login.example.test/?state='+state,verifier:'pkce-test'};},async complete(code,verifier){assert.equal(verifier,'pkce-test');return profiles[code];}};
  const app=createApp({dbPath:':memory:',bootstrapPassword:'Test-only-password-123!',identity,worker:false,mailTransport:async event=>{if(mailMode==='unknown'){const err=new Error('Ambiguous timeout');err.uncertain=true;throw err;}if(mailMode==='failed')throw Error('Graph 403');delivered.push(event);return {requestId:'mock-'+delivered.length};}});
  const {server,db,mailer}=app;await new Promise(r=>server.listen(0,'127.0.0.1',r));base='http://127.0.0.1:'+server.address().port;
  t.after(()=>{server.closeAllConnections();server.close();db.close();});
  async function call(path,cookie,data,expected=200){const response=await fetch(base+'/api'+path,{method:data===undefined?'GET':'POST',headers:{...(cookie?{cookie}:{}),...(data===undefined?{}:{'Content-Type':'application/json',Origin:base})},body:data===undefined?undefined:JSON.stringify(data)});const result=await response.json();assert.equal(response.status,expected,path+': '+JSON.stringify(result));return result;}
  async function sso(code,expected=302){const start=await fetch(base+'/api/auth/microsoft?email='+encodeURIComponent(profiles[code].email),{redirect:'manual'});const state=new URL(start.headers.get('location')).searchParams.get('state'),cookie=start.headers.get('set-cookie').split(';')[0];const end=await fetch(base+'/api/auth/microsoft/callback?state='+state+'&code='+code,{headers:{cookie},redirect:'manual'});assert.equal(end.status,expected,await end.clone().text());return end.headers.get('set-cookie')?.split(';')[0];}
  const adminResponse=await fetch(base+'/api/login',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({email:'admin@cj.net',password:'Test-only-password-123!'})});assert.equal(adminResponse.status,200);const admin=adminResponse.headers.get('set-cookie').split(';')[0];
  const req=await sso('requestor'),other=await sso('other'),manager=await sso('manager');
  let wh,order;
  const item={original_item_name:'Sản phẩm kiểm thử',uom:'Cái',supplier_code:'TEST-V1',quantity:2,note:'Nhu cầu kho'};
  const noPrices=value=>{function scan(v){if(v&&typeof v==='object')for(const [key,nested] of Object.entries(v)){assert.ok(!['price','unit_price','vat_percent','vat_amount','total','snapshot','documents','history','emails','quotation_no'].includes(key),'Leaked '+key);scan(nested);}}scan(value);};

  await t.test('Verified Microsoft access, strict domain and no email impersonation',async()=>{
    assert.equal((await call('/me',req)).email,'requestor@cj.net');
    await call('/login',null,{email:'random@cj.net'},401);
    await call('/admin/accounts',req,undefined,403);
    await call('/orders',null,undefined,401);
    await call('/auth/microsoft?email=x@cj.net.attacker.com',null,undefined,400);
    await call('/auth/microsoft/callback?state=invalid&code=requestor',null,undefined,403);
    const start=await fetch(base+'/api/auth/microsoft?email=requestor@cj.net',{redirect:'manual'});const st=new URL(start.headers.get('location')).searchParams.get('state');
    await call('/auth/microsoft/callback?state='+st+'&code=requestor',null,undefined,403);
    const outside=await fetch(base+'/api/auth/microsoft/callback?state='+st+'&code=outside',{headers:{cookie:start.headers.get('set-cookie').split(';')[0]},redirect:'manual'});assert.equal(outside.status,403);
    const csrf=await fetch(base+'/api/logout',{method:'POST',headers:{cookie:req,Origin:'https://evil.test'}});assert.equal(csrf.status,403);
  });
  await t.test('Import supplied company files once without inventing email/VAT',async()=>{
    const report=await importCompanyData(db);assert.equal(report.warehouses,16);assert.equal(report.suppliers,11);assert.equal(report.prices_pending,375);assert.equal(report.missing_manager,16);assert.equal(report.missing_vendor_email,11);
    assert.equal(masters(db,'prices').filter(p=>p.status==='ACTIVE').length,0);
    const n=masters(db,'products').length;await importCompanyData(db);assert.equal(masters(db,'products').length,n);
    const setup=await call('/admin/setup',admin);assert.equal(setup.pending_prices,375);assert.equal(setup.missing_managers.length,16);
    noPrices(await call('/catalog',req));
    await call('/admin/master/warehouses',admin,{code:'WH-TEST',name:'Kho kiểm thử',address:'123 Địa chỉ kho',receiver_name:'Người nhận',receiver_phone:'0900000000',manager_email:'manager@cj.net',status:'ACTIVE'});
    for(const code of ['TEST-V1','TEST-V2'])await call('/admin/master/suppliers',admin,{code,name:'Vendor '+code,alias:code,email:code.toLowerCase()+'@example.com',contact_person:'Sales',phone:'0900000001',payment_terms:'30 ngày',delivery_terms:'5 ngày',warranty:'12 tháng',status:'ACTIVE'});
    await call('/admin/master/products',admin,{code:'TEST-P1',name:item.original_item_name,uom:'Cái',status:'ACTIVE'});
    for(const code of ['TEST-V1','TEST-V2'])await call('/admin/master/prices',admin,{code:'PRICE-'+code,product_code:'TEST-P1',supplier_code:code,uom:'Cái',unit_price:100000,vat_percent:8,effective_from:'2020-01-01',effective_to:'',currency:'VND',status:'ACTIVE'});
    wh=(await call('/catalog',req)).warehouses.find(w=>w.code==='WH-TEST');
  });
  await t.test('Numbering is unique per warehouse/day and uses Vietnam time',async()=>{
    assert.deepEqual(localDate(new Date('2026-09-17T18:30:00Z')),{key:'2026-09-18',display:'18.09.2026'});
    const numbers=transaction(db,()=>Array.from({length:10},()=>nextOrderNumber(db,wh,new Date('2026-01-01T17:01:00Z'))));assert.equal(new Set(numbers).size,10);assert.equal(numbers[0],'PO-KHO KIỂM THỬ-02.01.2026-001');assert.ok(numbers[9].endsWith('010'));
    const nextDay=transaction(db,()=>nextOrderNumber(db,wh,new Date('2026-01-02T17:01:00Z')));assert.ok(nextDay.endsWith('03.01.2026-001'));
    const results=await Promise.all(Array.from({length:8},()=>call('/orders',req,{warehouse_id:wh.id,items:[item]},201)));assert.equal(new Set(results.map(o=>o.number)).size,8);
    assert.ok(results.every(o=>/^PO-KHO KIỂM THỬ-\d{2}\.\d{2}\.\d{4}-\d{3}$/.test(o.number)));
    await call('/orders',admin,{warehouse_id:wh.id,items:[item]},403);await call('/orders/preview',admin,{warehouse_id:wh.id,items:[item]},403);
  });
  await t.test('Official Ordering template, formula STT, invalid rows and mixed warehouses',async()=>{
    const buffer=readFileSync(new URL('../templates/ordering-template.xlsx',import.meta.url));
    const parsed=await readWorkbook({name:'Ordering template.xlsx',content:buffer.toString('base64')});assert.equal(parsed.official,true);
    const preview=parseOrdering(parsed,wh,masters(db,'suppliers'));assert.equal(preview.items.length,1);assert.equal(preview.errors.length,0);assert.equal(preview.items[0].supplier_code,'NCC-ANH-PHUOC');assert.equal(preview.items[0].original_item_name,'Giấy A4');
    const empty=await fetch(base+'/api/template/ordering?warehouse='+wh.code,{headers:{cookie:req}});const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(await empty.arrayBuffer()));assert.equal(wb.getWorksheet('FORM ORDER').getCell('B4').text,wh.code);assert.equal(wb.getWorksheet('FORM ORDER').getCell('C6').text,'');
    const rows=[{Warehouse:wh.code,Supplier:'TEST-V1',Item:item.original_item_name,UOM:'Cái',Quantity:2},{Warehouse:'WRONG',Supplier:'TEST-V1',Item:'',UOM:'Cái',Quantity:0}];const bad={name:'mixed.xlsx',content:(await tableWorkbook(orderingHeaders,rows)).toString('base64')};
    const badPreview=await call('/orders/preview',req,{warehouse_id:wh.id,file:bad});assert.ok(badPreview.errors.some(e=>e.row===3&&e.column==='Warehouse'));assert.ok(badPreview.errors.some(e=>e.row===3&&e.column==='Quantity'));await call('/orders',req,{warehouse_id:wh.id,file:bad},400);
  });
  await t.test('Optional notification, explicit consent, extra recipients, no manager access or approval',async()=>{
    order=await call('/orders',req,{warehouse_id:wh.id,note:'Đặt vật tư',department:'Operations',items:[...Array.from({length:6},()=>({...item})),...Array.from({length:2},()=>({...item,supplier_code:'TEST-V2'}))]},201);
    await call('/orders/'+order.id+'/submit',req,{},400);
    for(const bad of ['a@cj.net,b@cj.net','a@cj.net;;b@cj.net','bad','a@cj.net;'])await call('/orders/'+order.id+'/submit',req,{notify_manager:true,extra_recipients:bad},400);
    assert.equal((await call('/orders/'+order.id,req)).status,'DRAFT');assert.equal(delivered.length,0);
    order=await call('/orders/'+order.id+'/submit',req,{notify_manager:true,extra_recipients:'Extra@EXAMPLE.com;manager@cj.net;extra@example.com'});
    assert.equal(order.status,'SUBMITTED');assert.equal(delivered.length,2);noPrices(order);
    const auto=delivered.find(m=>m.event.kind==='ADMIN_ORDER_NOTIFICATION');assert.deepEqual(auto.payload.message.toRecipients.map(r=>r.emailAddress.address),['admin@cj.net']);const mail=delivered.find(m=>m.event.kind==='ORDER_NOTIFICATION');assert.equal(mail.sender,'requestor@cj.net');assert.deepEqual(mail.payload.message.toRecipients.map(r=>r.emailAddress.address).sort(),['extra@example.com','manager@cj.net']);assert.ok(!mail.payload.message.body.content.includes('/approvals/'));assert.ok(!mail.payload.message.body.content.includes('100000'));assert.equal(mail.event.kind,'ORDER_NOTIFICATION');
    await call('/orders/'+order.id,manager,undefined,404);await call('/approvals',manager,undefined,410);await call('/approvals/'+order.id+'/decision',manager,{decision:'APPROVED'},410);
    await call('/orders/'+order.id+'/submit',req,{notify_manager:true},400);assert.equal(delivered.length,2);
    await call('/orders',req,{id:order.id,warehouse_id:wh.id,items:[item]},400);
    const silent=await call('/orders',req,{warehouse_id:wh.id,items:[item]},201);
    await call('/orders/'+silent.id+'/submit',req,{notify_manager:false,extra_recipients:'x@example.com'},400);
    assert.equal((await call('/orders/'+silent.id+'/submit',req,{notify_manager:false})).status,'SUBMITTED');assert.equal(delivered.length,3);assert.equal(db.prepare('SELECT COUNT(*) AS n FROM outbox WHERE order_id=?').get(silent.id).n,1);
  });
  await t.test('Confirmed official PO: dynamic rows, VAT formulas, split vendors and actual outbox',async()=>{
    await call('/admin/orders/'+order.id+'/status',admin,{status:'PROCESSING'});await call('/admin/orders/'+order.id+'/status',admin,{status:'PRICE_COMPLETED'});
    const result=await call('/admin/orders/'+order.id+'/generate-po',admin,{});assert.equal(result.status,'SENT_TO_SUPPLIER');assert.equal(result.documents.length,2);assert.equal(delivered.length,5);
    const expectedTotals={'TEST-V1':1296000,'TEST-V2':432000};
    for(const doc of result.documents){assert.ok(doc.filename.startsWith(order.number));assert.ok(doc.filename.endsWith(' - '+doc.supplier_id+'.xlsx'));const response=await fetch(base+'/api/admin/documents/'+doc.id,{headers:{cookie:admin}});const wb=new ExcelJS.Workbook();await wb.xlsx.load(Buffer.from(await response.arrayBuffer()));const s=wb.getWorksheet('FORM PO'),totalRow=doc.supplier_id==='TEST-V1'?25:24;assert.equal(s.getCell('B5').text,order.number);assert.equal(s.getCell('B9').text,wh.name);assert.equal(s.getCell('B6').text,'Vendor '+doc.supplier_id);assert.equal(s.getCell('G'+totalRow).result,expectedTotals[doc.supplier_id]);assert.ok(s.model.merges.includes('A'+totalRow+':F'+totalRow));assert.equal(s.getCell('A'+(28+totalRow-24)).isMerged,true);assert.equal(s.getCell('G19').result,216000);assert.ok(s.getCell('G19').formula.includes('ROUND'));assert.ok(s.getCell('B19').border.bottom.style);await call('/admin/documents/'+doc.id,req,undefined,403);}
    const poMails=delivered.filter(m=>m.event.kind==='SUPPLIER_PO');for(const m of poMails){assert.equal(m.sender,'admin@cj.net');assert.equal(m.payload.message.toRecipients.length,1);assert.equal(m.payload.message.attachments.length,1);}
    const prices=await call('/admin/master/prices',admin);await call('/admin/master/prices',admin,{...prices.rows.find(p=>p.code==='PRICE-TEST-V1'),unit_price:999999});
    const fixed=await call('/orders/'+order.id,admin);assert.equal(fixed.total,1728000);assert.equal(fixed.items[0].snapshot.unit_price,100000);noPrices(await call('/orders/'+order.id,req));
    await call('/admin/orders/'+order.id+'/generate-po',admin,{},400);await mailer.flush();assert.equal(delivered.length,5);
    await call('/admin/orders/'+order.id+'/delivery',admin,{address:'other',receiver_name:'X',receiver_phone:'0'},400);
  });
  await t.test('Missing manager blocks email only; admin processes immediately and repairs recipients on retry',async()=>{
    const warehouse=masters(db,'warehouses').find(w=>w.code===wh.code);putMaster(db,'warehouses',{...warehouse,manager_email:''});
    const created=await call('/orders',req,{warehouse_id:wh.id,items:[item]},201);
    const submitted=await call('/orders/'+created.id+'/submit',req,{notify_manager:true,extra_recipients:'extra@example.com'});assert.equal(submitted.status,'SUBMITTED');assert.equal(submitted.email_status.find(m=>m.kind==='ORDER_NOTIFICATION').status,'BLOCKED_DATA');
    await call('/admin/orders/'+created.id+'/status',admin,{status:'PROCESSING'});
    putMaster(db,'warehouses',{...warehouse,manager_email:'manager@cj.net'});
    assert.equal(db.prepare("SELECT status FROM outbox WHERE order_id=? AND kind='ADMIN_ORDER_NOTIFICATION'").get(created.id).status,'ACCEPTED');
    const event=db.prepare("SELECT id FROM outbox WHERE order_id=? AND kind='ORDER_NOTIFICATION'").get(created.id);await call('/admin/mail/'+event.id+'/retry',admin,{});assert.equal(db.prepare('SELECT status FROM outbox WHERE id=?').get(event.id).status,'ACCEPTED');
    assert.ok(delivered.at(-1).payload.message.toRecipients.some(r=>r.emailAddress.address==='extra@example.com'));
  });
  await t.test('Co-admin equal rights, immediate revocation, protected primary, no creation',async()=>{
    await call('/admin/accounts',admin,{action:'grant',email:'coadmin@cj.net',name:'Co Admin'});const co=await sso('coadmin');assert.equal((await call('/me',co)).role,'ADMIN');
    await call('/admin/accounts',co,{action:'grant',email:'third@cj.net'});await call('/admin/master/prices',co);await call('/orders',co,{warehouse_id:wh.id,items:[item]},403);
    await call('/admin/accounts',co,{action:'revoke',email:'admin@cj.net'},400);
    await call('/admin/accounts',admin,{action:'revoke',email:'coadmin@cj.net'});await call('/admin/master/prices',co,undefined,403);assert.equal((await call('/me',co)).role,'REQUESTER');
    await call('/admin/accounts',admin,{action:'grant',email:'evil@cj.net.attacker.com'},400);
    const created=await call('/orders',req,{warehouse_id:wh.id,items:[item]},201);
    await call('/orders/'+created.id+'/submit',req,{notify_manager:false});
    const notice=delivered.find(m=>m.event.order_id===created.id&&m.event.kind==='ADMIN_ORDER_NOTIFICATION');
    assert.deepEqual(notice.payload.message.toRecipients.map(r=>r.emailAddress.address).sort(),['admin@cj.net','third@cj.net']);
    await call('/orders/'+created.id+'/submit',req,{notify_manager:false},400);
    assert.equal(delivered.filter(m=>m.event.order_id===created.id).length,1);
  });
  await t.test('Failed/ambiguous email is never silently marked sent or automatically duplicated',async()=>{
    mailMode='unknown';const created=await call('/orders',req,{warehouse_id:wh.id,items:[item]},201);const submitted=await call('/orders/'+created.id+'/submit',req,{notify_manager:true});assert.equal(submitted.email_status[0].status,'UNKNOWN');
    const event=db.prepare('SELECT * FROM outbox WHERE order_id=?').get(created.id);await mailer.flush();assert.equal(db.prepare('SELECT attempts FROM outbox WHERE id=?').get(event.id).attempts,1);
    await call('/admin/mail/'+event.id+'/retry',admin,{},400);
    mailMode='ok';await call('/admin/mail/'+event.id+'/retry',admin,{confirm_unknown:true});assert.equal(db.prepare('SELECT status FROM outbox WHERE id=?').get(event.id).status,'ACCEPTED');
    await call('/admin/mail/'+event.id+'/retry',admin,{},400);
    const accounts=await call('/admin/accounts',admin);assert.ok(accounts.every(a=>!a.password));
    const audit=await call('/admin/audit',admin);assert.ok(audit.some(a=>a.action==='ADMIN_GRANTED'));assert.ok(audit.some(a=>a.action==='EMAIL_ACCEPTED'));assert.ok(audit.some(a=>a.action==='ORDER_NOTIFICATION_CHOICE'));
  });
  await t.test('Master imports are transactional and preserve exact row errors',async()=>{
    const whFile={name:'WH List.xlsx',content:readFileSync(new URL('../templates/WH List.xlsx',import.meta.url)).toString('base64')};
    const officialWh=await call('/admin/master/warehouses/preview',admin,{file:whFile});assert.equal(officialWh.counts.update,16);assert.equal(officialWh.errors.length,0);assert.equal(officialWh.suggested_mapping.manager_email,'Mail Line Manager');
    const vendorFile={name:'Vendor List.xlsx',content:readFileSync(new URL('../templates/Vendor List.xlsx',import.meta.url)).toString('base64')};
    const officialVendor=await call('/admin/master/suppliers/preview',admin,{file:vendorFile});assert.equal(officialVendor.counts.update,11);assert.equal(officialVendor.errors.length,0);
    const file={name:'duplicate.xlsx',content:(await tableWorkbook(['code','name','uom'],[{code:'ROLL-1',name:'Trùng tên trong batch',uom:'Cái'},{code:'ROLL-2',name:'Trùng tên trong batch',uom:'Cái'}])).toString('base64')};
    const preview=await call('/admin/master/products/preview',admin,{file});assert.ok(preview.errors.some(e=>e.row===3));await call('/admin/master/products/commit',admin,{file},400);assert.ok(!masters(db,'products').some(p=>p.code.startsWith('ROLL-')));
  });
});
