import ExcelJS from 'exceljs';
import {DatabaseSync} from 'node:sqlite';
import {createHash} from 'node:crypto';
import {mkdirSync,copyFileSync,writeFileSync,readFileSync} from 'node:fs';
import {masters,putMaster,transaction,audit} from '../lib/database.js';
import {normalize} from '../lib/business.js';
import {syncLocationDepartments} from '../lib/procurement.js';
const apply=process.argv.includes('--apply'),root='D:/ThuCNU/CODE/',app=root+'cj-purchase-ordering/';
const db=new DatabaseSync(app+'data/purchase.sqlite');db.exec('PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000');
const hash=v=>createHash('sha256').update(v).digest('hex').slice(0,12).toUpperCase();
const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(root+'Items list.xlsx');
const suppliers=masters(db,'suppliers'),oldProducts=masters(db,'products'),oldPrices=masters(db,'prices');
const products=new Map(),prices=new Map(),errors=[],warnings=[];
const date=v=>v instanceof Date?v.toISOString().slice(0,10):'';
const today=new Date().toLocaleDateString('en-CA',{timeZone:'Asia/Ho_Chi_Minh'});
let sourceRows=0;
wb.worksheets[0].eachRow((r,index)=>{
 if(index===1||!r.getCell(4).text.trim())return;sourceRows++;
 const name=r.getCell(4).text.trim(),uom=r.getCell(5).text.trim(),supplierName=r.getCell(2).text.trim();
 const matches=suppliers.filter(s=>normalize(s.name)===normalize(supplierName));
 if(matches.length!==1){errors.push({row:index,error:'Không xác định duy nhất nhà cung cấp',supplierName});return;}
 const supplier=matches[0],key=normalize(name)+'|'+normalize(uom),existing=oldProducts.find(p=>normalize(p.name)+'|'+normalize(p.uom)===key),code=existing?.code||'ITEM-'+hash(key);
 products.set(code,{...existing,code,name,uom,category:r.getCell(3).text.trim(),status:'ACTIVE'});
 const rawVAT=r.getCell(7).value,vat=typeof rawVAT==='number'?(rawVAT<1?rawVAT*100:rawVAT):Number(String(rawVAT).replace(/[%\s]/g,''));
 const price=Number(r.getCell(6).value),from=date(r.getCell(8).value),end=r.getCell(9).value,to=date(end);
 if(!from||(!to&&normalize(r.getCell(9).text)!==normalize('đang cung cấp')&&r.getCell(9).text.trim())||!Number.isFinite(price)||price<0||!Number.isFinite(vat)||vat<0||vat>100||!uom||(to&&to<from)){errors.push({row:index,error:'Giá/VAT/đơn vị/ngày không hợp lệ'});return;}
 const quoteKey=code+'|'+supplier.code+'|'+from+'|'+to,quoteCode='XLSX-'+hash(quoteKey);
 const status=price===0?'INACTIVE':to&&to<today?'EXPIRED':'ACTIVE';
 if(price===0)warnings.push({row:index,name,issue:'Giá 0: giữ giá gốc, chờ Admin xác nhận',status});
 if(status==='EXPIRED')warnings.push({row:index,name,issue:'Báo giá hết hiệu lực',end:to});
 const record={code:quoteCode,product_code:code,supplier_code:supplier.code,uom,unit_price:price,vat_percent:vat,currency:'VND',effective_from:from,effective_to:to,status,needs_review:price===0,quotation_no:'Items list.xlsx / dòng '+index,source:'Items list.xlsx'};
 if(prices.has(quoteCode)&&prices.get(quoteCode).unit_price!==price){errors.push({row:index,error:'Trùng sản phẩm/NCC/thời hạn nhưng khác giá'});return;}prices.set(quoteCode,record);
});
const template=new ExcelJS.Workbook();await template.xlsx.readFile(root+'FORM PO.xlsx');if(template.getWorksheet('FORM PO')?.getCell('A5').text!=='PO No.')errors.push({error:'FORM PO không đúng cấu trúc đã kiểm tra'});
const report={at:new Date().toISOString(),sourceRows,products:products.size,prices:prices.size,activePrices:[...prices.values()].filter(p=>p.status==='ACTIVE').length,warnings,errors,oldProducts:oldProducts.length,oldPrices:oldPrices.length,applied:false};
const whBook=new ExcelJS.Workbook();await whBook.xlsx.readFile(root+'WH List.xlsx');const warehouses=masters(db,'warehouses'),locations=[];
whBook.worksheets[0].eachRow((r,index)=>{if(index===1||!r.getCell(1).text.trim())return;const name=r.getCell(1).text.trim();const existing=warehouses.find(w=>normalize(w.name)===normalize(name));const code=existing?.code||'WH-'+name.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55);locations.push({...existing,code,name,address:r.getCell(2).text.trim(),receiver_name:r.getCell(3).text.trim(),receiver_phone:r.getCell(4).text.trim(),manager_email:r.getCell(6).text.trim().toLowerCase()||existing?.manager_email||'',receiver_email:r.getCell(7).text.trim().toLowerCase()||existing?.receiver_email||'',status:'ACTIVE'});});report.locations=locations.length;
mkdirSync(app+'docs',{recursive:true});
if(apply&&!errors.length){
 const backup=app+'data/backups/company-update-'+Date.now();mkdirSync(backup,{recursive:true});db.exec("VACUUM INTO '"+backup.replaceAll("'","''")+"/purchase.sqlite'");
  for(const file of ['Items list.xlsx','po-form.xlsx','WH List.xlsx'])copyFileSync(app+'templates/'+file,backup+'/'+file);
 const keep=['orders','items','snapshots','documents','outbox'];const before=Object.fromEntries(keep.map(t=>[t,db.prepare('SELECT COUNT(*) n FROM '+t).get().n]));
 transaction(db,()=>{
  for(const p of oldProducts)if(!products.has(p.code))putMaster(db,'products',{...p,status:'INACTIVE'});
  for(const p of oldPrices)if(!prices.has(p.code))putMaster(db,'prices',{...p,status:'INACTIVE'});
  for(const p of products.values())putMaster(db,'products',p);
  for(const p of prices.values()){putMaster(db,'prices',p);const supplier=suppliers.find(s=>s.code===p.supplier_code);if(supplier.status!=='ACTIVE')putMaster(db,'suppliers',{...supplier,status:'ACTIVE'});}
  for(const location of locations)putMaster(db,'warehouses',location);
  syncLocationDepartments(db);
  report.applied=true;report.backup=backup;report.preserved=before;
  audit(db,{id:'SYSTEM'},'COMPANY_FILES_REPLACED','Items list.xlsx',report);
  db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('company_files_update',JSON.stringify(report));
 });
 copyFileSync(root+'Items list.xlsx',app+'templates/items-current.xlsx');copyFileSync(root+'WH List.xlsx',app+'templates/warehouses-current.xlsx');copyFileSync(root+'FORM PO.xlsx',app+'templates/po-form.xlsx');
 for(const t of keep)if(db.prepare('SELECT COUNT(*) n FROM '+t).get().n!==before[t])throw Error('Historical count changed: '+t);
}
writeFileSync(app+'docs/COMPANY-UPDATE-REPORT.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report,null,2));db.close();if(errors.length)process.exitCode=1;
