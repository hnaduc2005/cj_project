import test from 'node:test';
import assert from 'node:assert/strict';
import {createApp} from '../server.js';
import {masters,putMaster} from '../lib/database.js';

test('Procurement tools: warehouse approval, department routing, quick quotes and selected PO',async t=>{
  const app=createApp({dbPath:':memory:',bootstrapPassword:'Test-only!123',worker:false,mailTransport:async()=>({requestId:'test'})});
  await new Promise(r=>app.server.listen(0,'127.0.0.1',r));const base='http://127.0.0.1:'+app.server.address().port;
  t.after(()=>{app.server.closeAllConnections();app.server.close();app.db.close();});
  async function call(path,data,cookie,status=200){const r=await fetch(base+'/api'+path,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...(cookie?{cookie}:{})},body:data===undefined?undefined:JSON.stringify(data)});const result=await r.json();assert.equal(r.status,status,path+': '+JSON.stringify(result));return {data:result,cookie:r.headers.get('set-cookie')?.split(';')[0]};}
  const admin=(await call('/login',{email:'uyenthu.cu@cj.net',password:'Test-only!123'})).cookie;
  const req=(await call('/auth/email',{email:'tools@cj.net'})).cookie,other=(await call('/auth/email',{email:'other@cj.net'})).cookie;
  const warehouse={name:'Kho đề nghị',address:'123 Test',receiver_name:'Receiver',receiver_phone:'0900000000',receiver_email:'receiver@cj.net',manager_email:'manager@cj.net'};
  let warehouseId,order,productCode;
  const price={unit_price:100000,vat_percent:8,effective_from:'2020-01-01',effective_to:'',quotation_no:'Q-1'};
  await t.test('Warehouse is hidden until Admin approves; only own requests, duplicate and repeat decision protected',async()=>{
    const request=(await call('/warehouse-requests',warehouse,req,201)).data;
    assert.equal((await call('/warehouse-requests',undefined,other)).data.length,0);
    assert.equal((await call('/catalog',undefined,req)).data.warehouses.length,0);
    await call('/warehouse-requests',warehouse,req,400);
    await call('/admin/warehouse-requests/'+request.id+'/decision',{decision:'APPROVED'},req,403);
    await call('/admin/warehouse-requests/'+request.id+'/decision',{decision:'APPROVED'},admin);
    await call('/admin/warehouse-requests/'+request.id+'/decision',{decision:'APPROVED'},admin,400);
    const wh=(await call('/catalog',undefined,req)).data.warehouses[0];warehouseId=wh.id;
    await call('/admin/master/departments',{code:'OPS',name:'Operations',warehouse_code:wh.code,status:'ACTIVE'},admin);
    const rejected=(await call('/warehouse-requests',{...warehouse,name:'Kho từ chối'},req,201)).data;
    await call('/admin/warehouse-requests/'+rejected.id+'/decision',{decision:'REJECTED'},admin,400);
    await call('/admin/warehouse-requests/'+rejected.id+'/decision',{decision:'REJECTED',comment:'Trùng nhu cầu'},admin);
    assert.equal((await call('/catalog',undefined,req)).data.warehouses.length,1);
  });
  await t.test('Department selects warehouse automatically and rejects forged or inactive mapping',async()=>{
    const data={department_code:'OPS',requested_date:'2026-12-20',purpose:'Mua vật tư mới',note:'Giao giờ hành chính',items:[{original_item_name:'Sản phẩm mới',uom:'Cái',quantity:3}]};
    await call('/orders',{...data,warehouse_id:'fake'},req,400);
    await call('/orders',{...data,department_code:'NOT-REAL'},req,400);
    order=(await call('/orders',data,req,201)).data;assert.equal(order.warehouse.id,warehouseId);assert.equal(order.department,'Operations');assert.equal(order.requested_date,data.requested_date);assert.equal(order.purpose,data.purpose);assert.equal(order.note,data.note);
    const department=masters(app.db,'departments').find(d=>d.code==='OPS');putMaster(app.db,'departments',{...department,status:'INACTIVE'});
    assert.ok(!(await call('/catalog',undefined,req)).data.departments.some(d=>d.code==='OPS'));
    await call('/orders/'+order.id+'/submit',{notify_manager:false},req,400);
    putMaster(app.db,'departments',{...department,status:'ACTIVE'});order=(await call('/orders/'+order.id+'/submit',{notify_manager:false},req)).data;
  });
  await t.test('Quick creation rolls back product, supplier and price together on invalid VAT',async()=>{
    const path='/admin/orders/'+order.id+'/items/'+order.items[0].id+'/quick-add';
    await call(path,{new_product:{name:'Sản phẩm mới'},new_supplier:{name:'Vendor One',email:'vendor1@example.com'},price:{...price,vat_percent:''}},req,403);
    await call(path,{new_product:{name:'Sản phẩm mới'},new_supplier:{name:'Vendor One',email:'vendor1@example.com'},price:{...price,vat_percent:''}},admin,400);
    assert.equal(masters(app.db,'products').length,0);assert.equal(masters(app.db,'suppliers').length,0);assert.equal(masters(app.db,'prices').length,0);
    const created=(await call(path,{new_product:{name:'Sản phẩm mới',category:'Vật tư'},new_supplier:{name:'Vendor One',email:'vendor1@example.com'},price},admin,201)).data;productCode=created.product.code;
    assert.equal(created.product.uom,'Cái');assert.equal(created.price.unit_price,100000);
    await call(path,{product_code:productCode,supplier_code:created.supplier.code,price},admin,400);
  });
  await t.test('Compare VAT-inclusive totals, expired quote disabled, Requestor cannot read prices',async()=>{
    const path='/admin/orders/'+order.id+'/items/'+order.items[0].id;
    await call(path+'/quick-add',{product_code:productCode,new_supplier:{name:'Vendor Two',email:'vendor2@example.com'},price:{...price,unit_price:90000,vat_percent:10}},admin,201);
    await call(path+'/quick-add',{product_code:productCode,new_supplier:{name:'Expired Vendor',email:'expired@example.com'},price:{...price,unit_price:1,effective_to:'2020-12-31'}},admin,201);
    await call(path+'/comparison?product_code='+productCode,undefined,req,403);
    const quotes=(await call(path+'/comparison?product_code='+productCode,undefined,admin)).data.quotes;
    assert.equal(quotes.length,3);assert.equal(quotes[0].supplier_name,'Vendor Two');assert.equal(quotes[0].total,297000);assert.equal(quotes[1].total,324000);assert.equal(quotes[2].eligible,false);
    const seen=JSON.stringify((await call('/orders/'+order.id,undefined,req)).data);assert.ok(!seen.includes('unit_price'));assert.ok(!seen.includes('vat_percent'));
  });
  await t.test('Incomplete imported quote explains missing fields and can be repaired without duplicate price',async()=>{
    const vendor=masters(app.db,'suppliers').find(s=>s.name==='Expired Vendor');
    putMaster(app.db,'prices',{code:'INCOMPLETE',product_code:productCode,supplier_code:'',uom:'Cái',unit_price:58500,vat_percent:'',currency:'VND',effective_from:'',effective_to:'',status:'INACTIVE'});
    const path='/admin/orders/'+order.id+'/items/'+order.items[0].id+'/comparison?product_code='+productCode;
    let quote=(await call(path,undefined,admin)).data.quotes.find(q=>q.code==='INCOMPLETE');
    assert.equal(quote.total,null);assert.equal(quote.eligible,false);assert.ok(quote.reasons.includes('Thiếu VAT (%)'));assert.ok(quote.reasons.includes('Thiếu ngày hiệu lực từ'));
    assert.ok(quote.reasons.includes('Chưa liên kết nhà cung cấp hợp lệ'));
    const count=masters(app.db,'prices').length;
    await call('/admin/master/prices',{...quote,vat_percent:8,effective_from:'2021-01-01',status:'ACTIVE'},req,403);
    await call('/admin/master/prices',{...quote,vat_percent:8,effective_from:'2021-01-01',status:'ACTIVE'},admin,400);
    await call('/admin/master/prices',{...quote,supplier_code:vendor.code,vat_percent:8,effective_from:'2021-01-01',status:'ACTIVE'},admin);
    quote=(await call(path,undefined,admin)).data.quotes.find(q=>q.code==='INCOMPLETE');
    assert.equal(quote.eligible,true);assert.equal(quote.supplier_code,vendor.code);assert.equal(quote.total,189540);assert.equal(masters(app.db,'prices').length,count);
  });
  await t.test('Explicit choice may select a higher quote; exact vendor and price freeze into PO',async()=>{
    const supplier=masters(app.db,'suppliers').find(s=>s.name==='Vendor One');
    await call('/admin/orders/'+order.id+'/resolve',{item_id:order.items[0].id,product_code:productCode,supplier_code:supplier.code,selection_reason:'Giao sớm phù hợp nhu cầu'},admin);
    let resolved=(await call('/orders/'+order.id,undefined,admin)).data;assert.equal(resolved.items[0].price.unit_price,100000);assert.equal(resolved.items[0].original_item_name,'Sản phẩm mới');
    await call('/admin/orders/'+order.id+'/status',{status:'PROCESSING'},admin);await call('/admin/orders/'+order.id+'/status',{status:'PRICE_COMPLETED'},admin);
    resolved=(await call('/admin/orders/'+order.id+'/generate-po',{},admin)).data;
    assert.equal(resolved.documents.length,1);assert.equal(resolved.documents[0].supplier_id,supplier.code);assert.equal(resolved.items[0].snapshot.unit_price,100000);assert.equal(resolved.total,324000);
    await call('/admin/orders/'+order.id+'/items/'+order.items[0].id+'/quick-add',{product_code:productCode,supplier_code:supplier.code,price},admin,400);
    await call('/admin/orders/'+order.id+'/status',{status:'COMPLETED'},admin);
  });
  await t.test('Resolve accepts Cuộn/cuộn and Unicode spacing variants but rejects different units',async()=>{
    const supplier=masters(app.db,'suppliers').find(s=>s.name==='Vendor One');
    const product={code:'UNIT-ROLL',name:'Băng keo chuẩn',uom:'cuộn',status:'ACTIVE'};
    putMaster(app.db,'products',product);
    putMaster(app.db,'prices',{code:'UNIT-PRICE',product_code:product.code,supplier_code:supplier.code,uom:'cuộn',unit_price:11500,vat_percent:8,currency:'VND',effective_from:'2020-01-01',effective_to:'',status:'ACTIVE'});
    const created=(await call('/orders',{warehouse_id:warehouseId,items:[{original_item_name:'Băng keo trong 48mm',uom:'Cuộn',quantity:48}]},req,201)).data;
    await call('/orders/'+created.id+'/submit',{notify_manager:false},req);
    for(const uom of ['cuộn',' CUỘN ','cuộn'.normalize('NFD')]){
      putMaster(app.db,'products',{...product,uom});
      const result=(await call('/admin/orders/'+created.id+'/resolve',{item_id:created.items[0].id,product_code:product.code,supplier_code:supplier.code},admin)).data;
      assert.equal(result.items[0].match_status,'MATCHED');assert.equal(result.items[0].uom,'Cuộn');assert.equal(result.total,596160);
    }
    putMaster(app.db,'products',{...product,uom:'Thùng'});
    await call('/admin/orders/'+created.id+'/resolve',{item_id:created.items[0].id,product_code:product.code,supplier_code:supplier.code},admin,400);
  });
});
