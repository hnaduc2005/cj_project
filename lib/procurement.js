import {id,now,masters,putMaster,transaction,audit} from './database.js';
import {saveCatalogItem} from './unified-catalog.js';
import {fail,validateMaster,normalize,matchItem} from './business.js';
import {localDate} from './company-data.js';

export function initProcurement(db){
  db.exec(`CREATE TABLE IF NOT EXISTS warehouse_requests(id TEXT PRIMARY KEY,user_id TEXT NOT NULL REFERENCES users(id),data TEXT NOT NULL,status TEXT NOT NULL,comment TEXT NOT NULL DEFAULT '',warehouse_id TEXT,created_at TEXT NOT NULL,decided_at TEXT,decided_by TEXT);`);
}
export function syncLocationDepartments(db){
  const departments=masters(db,'departments');
  for(const warehouse of masters(db,'warehouses')){
    const existing=departments.filter(d=>d.warehouse_code===warehouse.code);
    if(!existing.length){
      putMaster(db,'departments',{code:'LOC-'+warehouse.id,name:warehouse.name,warehouse_code:warehouse.code,status:warehouse.status,auto_location:true});
    }else for(const department of existing){
      if(department.auto_location&&(department.name!==warehouse.name||department.status!==warehouse.status))putMaster(db,'departments',{...department,name:warehouse.name,status:warehouse.status});
    }
  }
}
export function departmentWarehouse(db,data){
  syncLocationDepartments(db);
  if(!data.department_code)return null; // Legacy drafts/API remain readable during upgrade.
  const department=masters(db,'departments').find(d=>d.code===data.department_code&&d.status==='ACTIVE');
  if(!department)fail('Phòng ban không tồn tại hoặc chưa được kích hoạt');
  const warehouse=masters(db,'warehouses').find(w=>w.code===department.warehouse_code&&w.status==='ACTIVE');
  if(!warehouse)fail('Kho liên kết với phòng ban chưa được kích hoạt');
  if(data.warehouse_id&&data.warehouse_id!==warehouse.id)fail('Kho không khớp phòng ban đã chọn');
  return {department,warehouse};
}
export async function procurementRoute({db,user,path,method,url,req,res,body,send,getOrder}){
  if(path==='/api/catalog'||path.startsWith('/api/admin/master/departments'))syncLocationDepartments(db);
  if(path==='/api/warehouse-requests'&&method==='GET'){
    const rows=user.role==='ADMIN'?db.prepare('SELECT r.*,u.email AS requester_email FROM warehouse_requests r JOIN users u ON u.id=r.user_id ORDER BY r.created_at DESC').all():db.prepare('SELECT * FROM warehouse_requests WHERE user_id=? ORDER BY created_at DESC').all(user.id);
    send(res,rows.map(r=>({...r,data:JSON.parse(r.data)})));return true;
  }
  if(path==='/api/warehouse-requests'&&method==='POST'){
    if(user.role==='ADMIN')fail('Admin tạo kho tại danh mục',403);
    const input=await body(req);
    const value=validateMaster(db,'warehouses',{...input,code:'WH-'+id().slice(0,8),status:'INACTIVE'});
    for(const key of ['name','address','receiver_name','receiver_phone','manager_email'])if(!String(value[key]||'').trim())fail('Vui lòng điền đầy đủ thông tin kho, người nhận và Line Manager');
    if(Object.values(value).some(v=>String(v).length>1000))fail('Thông tin quá dài (tối đa 1.000 ký tự mỗi trường)');
    if(db.prepare("SELECT data FROM warehouse_requests WHERE status='PENDING'").all().some(r=>normalize(JSON.parse(r.data).name)===normalize(value.name)))fail('Kho này đã có yêu cầu chờ duyệt');
    const key=id();transaction(db,()=>{db.prepare('INSERT INTO warehouse_requests(id,user_id,data,status,created_at) VALUES (?,?,?,?,?)').run(key,user.id,JSON.stringify(value),'PENDING',now());audit(db,user,'WAREHOUSE_REQUESTED',key,value);});
    send(res,{id:key,status:'PENDING'},201);return true;
  }
  const warehouseRoute=/^\/api\/admin\/warehouse-requests\/([^/]+)\/decision$/.exec(path);
  if(warehouseRoute&&method==='POST'){
    const data=await body(req),request=db.prepare('SELECT * FROM warehouse_requests WHERE id=?').get(warehouseRoute[1]);
    if(!request)fail('Không tìm thấy yêu cầu kho',404);
    if(!['APPROVED','REJECTED'].includes(data.decision))fail('Quyết định không hợp lệ');
    if(data.decision==='REJECTED'&&!String(data.comment||'').trim())fail('Nhập lý do từ chối');
    transaction(db,()=>{
      if(db.prepare('SELECT status FROM warehouse_requests WHERE id=?').get(request.id).status!=='PENDING')fail('Yêu cầu đã được xử lý');
      let warehouseId=null;
      if(data.decision==='APPROVED'){
        const original=JSON.parse(request.data),value=validateMaster(db,'warehouses',{...original,...(data.warehouse||{}),code:original.code,status:'ACTIVE'});
        for(const key of ['name','address','receiver_name','receiver_phone','manager_email'])if(!String(value[key]||'').trim())fail('Điền đủ thông tin kho trước khi kích hoạt');
        warehouseId=putMaster(db,'warehouses',value);audit(db,user,'WAREHOUSE_ACTIVATED',warehouseId,value);
        syncLocationDepartments(db);
      }
      db.prepare('UPDATE warehouse_requests SET status=?,comment=?,warehouse_id=?,decided_at=?,decided_by=? WHERE id=?').run(data.decision,String(data.comment||'').slice(0,2000),warehouseId,now(),user.id,request.id);
      audit(db,user,'WAREHOUSE_'+data.decision,request.id,{warehouse_id:warehouseId,comment:data.comment||''});
    });send(res,{ok:true});return true;
  }
  const route=/^\/api\/admin\/orders\/([^/]+)\/items\/([^/]+)\/(comparison|quick-add)$/.exec(path);
  if(!route)return false;
  const order=getOrder(route[1],user),item=order.items.find(i=>i.id===route[2]);if(!item)fail('Không tìm thấy mặt hàng',404);
  if(route[3]==='comparison'&&method==='GET'){
    const productCode=url.searchParams.get('product_code')||item.product_code||'';
    const product=masters(db,'products').find(p=>p.code===productCode&&p.status==='ACTIVE'&&normalize(p.uom)===normalize(item.uom));
    const today=localDate(new Date()).key,suppliers=masters(db,'suppliers');
    const quotes=product?masters(db,'prices').filter(p=>p.product_code===product.code&&normalize(p.uom)===normalize(item.uom)).map(p=>{
      const vendor=suppliers.find(v=>v.code===p.supplier_code),reasons=[];
      if(p.status!=='ACTIVE')reasons.push('Báo giá chưa ACTIVE');
      if(!vendor)reasons.push('Chưa liên kết nhà cung cấp hợp lệ');
      else if(vendor.status!=='ACTIVE')reasons.push('NCC chưa hoạt động');
      const hasPrice=p.unit_price!==''&&p.unit_price!=null&&Number.isFinite(Number(p.unit_price));
      const hasVat=p.vat_percent!==''&&p.vat_percent!=null&&Number.isFinite(Number(p.vat_percent));
      if(!hasPrice)reasons.push('Thiếu đơn giá');
      if(!hasVat)reasons.push('Thiếu VAT (%)');
      if(!p.effective_from)reasons.push('Thiếu ngày hiệu lực từ');
      else if(p.effective_from>today)reasons.push('Chưa đến ngày hiệu lực');
      if(p.effective_to&&p.effective_to<today)reasons.push('Đã hết hiệu lực');
      const eligible=reasons.length===0;
      const base=Math.round(item.quantity*Number(p.unit_price)),vat=Math.round(base*Number(p.vat_percent)/100);
      return {...p,supplier_name:vendor?.name||p.supplier_code||'Chưa liên kết NCC',payment_terms:vendor?.payment_terms||'',delivery_terms:vendor?.delivery_terms||'',eligible,reasons,total:hasPrice&&hasVat?base+vat:null,vat_amount:hasPrice&&hasVat?vat:null,selected:item.supplier_code===p.supplier_code&&item.product_code===product.code&&eligible};
    }).sort((a,b)=>Number(b.eligible)-Number(a.eligible)||a.total-b.total):[];
    send(res,{product,quotes});return true;
  }
  if(route[3]==='quick-add'&&method==='POST'){
    const data=await body(req);
    if(!['SUBMITTED','PROCESSING','WAITING_FOR_PRICE'].includes(order.status))fail('Đơn đã khóa đối chiếu; không thể thêm báo giá');
    let product,price,supplier;
    if(db.prepare("SELECT value FROM settings WHERE key='unified_catalog_reset'").get()){
      transaction(db,()=>{
        if(data.new_supplier){supplier=validateMaster(db,'suppliers',{...data.new_supplier,code:data.new_supplier.code||'NCC-'+id().slice(0,8),status:'ACTIVE'});putMaster(db,'suppliers',supplier);}else supplier=masters(db,'suppliers').find(s=>s.code===data.supplier_code&&s.status==='ACTIVE');
        const selected=data.new_product||masters(db,'products').find(p=>p.code===data.product_code&&p.status==='ACTIVE');
        if(!selected||!supplier||!data.price)fail('Điền sản phẩm, nhà cung cấp và báo giá để tạo danh mục hợp nhất');
        if(selected.uom&&normalize(selected.uom)!==normalize(item.uom))fail('Chọn sản phẩm cùng đơn vị tính');
        const saved=saveCatalogItem(db,{...data.price,name:selected.name,uom:item.uom,supplier_code:supplier.code,status:'ACTIVE'});
        product=masters(db,'products').find(p=>p.code===saved.code);price=masters(db,'prices').find(p=>p.product_code===saved.code&&p.unified);audit(db,user,'CATALOG_CREATED_FROM_ORDER',order.id,saved);
      });send(res,{product,price,supplier},201);return true;
    }
    transaction(db,()=>{
      if(data.new_product){product=validateMaster(db,'products',{...data.new_product,code:data.new_product.code||'ITEM-'+id().slice(0,8),uom:item.uom,status:'ACTIVE'});if(masters(db,'products').some(p=>p.code===product.code))fail('Mã sản phẩm đã tồn tại');putMaster(db,'products',product);audit(db,user,'PRODUCT_CREATED_FROM_ORDER',order.id,product);}
      else product=masters(db,'products').find(p=>p.code===data.product_code&&p.status==='ACTIVE');
      if(!product||normalize(product.uom)!==normalize(item.uom))fail('Chọn sản phẩm có cùng đơn vị tính');
      if(data.new_supplier){supplier=validateMaster(db,'suppliers',{...data.new_supplier,code:data.new_supplier.code||'NCC-'+id().slice(0,8),status:'ACTIVE'});if(masters(db,'suppliers').some(s=>s.code===supplier.code))fail('Mã nhà cung cấp đã tồn tại');putMaster(db,'suppliers',supplier);audit(db,user,'SUPPLIER_CREATED_FROM_ORDER',order.id,supplier);}
      else supplier=masters(db,'suppliers').find(s=>s.code===data.supplier_code&&s.status==='ACTIVE');
      if(data.price){
        if(!supplier)fail('Chọn nhà cung cấp để nhập báo giá');
        price=validateMaster(db,'prices',{...data.price,code:'PRICE-'+id().slice(0,8),product_code:product.code,supplier_code:supplier.code,uom:product.uom,currency:'VND',status:'ACTIVE'});
        putMaster(db,'prices',price);audit(db,user,'QUOTE_ADDED_FROM_ORDER',order.id,{item_id:item.id,...price});
      }
      if(!data.new_product&&!data.price)fail('Chọn tạo sản phẩm hoặc nhập giá');
    });send(res,{product,price,supplier},201);return true;
  }
  fail('Không hỗ trợ',405);
}
