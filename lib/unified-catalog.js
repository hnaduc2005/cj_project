import ExcelJS from 'exceljs';
import {masters,putMaster,transaction,audit,id,now} from './database.js';
import {fail,normalize,validateMaster} from './business.js';
export const itemFields=['code','supplier_code','name','uom','unit_price','vat_percent','effective_from','effective_to','status'];
const headings=['Mã sản phẩm','Mã nhà cung cấp','Tên sản phẩm','Đơn vị tính','Đơn giá','VAT','Hiệu lực từ','Hiệu lực đến','Trạng thái'];
export function catalogRows(db){const products=masters(db,'products');return masters(db,'prices').filter(p=>p.unified).map(p=>({...p,code:p.product_code,name:products.find(x=>x.code===p.product_code)?.name||'',sequence:p.sequence})).sort((a,b)=>a.sequence-b.sequence);}
export function saveCatalogItem(db,input,{forceNew=false}={}){
 let supplier=masters(db,'suppliers').find(s=>s.code===input.supplier_code||normalize(s.name)===normalize(input.supplier_code));
 if(!supplier&&input.supplier_code&&!String(input.supplier_code).startsWith('NCC-')){const code='NCC-'+id().slice(0,8).toUpperCase();supplier=validateMaster(db,'suppliers',{code,name:String(input.supplier_code).trim(),status:'ACTIVE'});putMaster(db,'suppliers',supplier);}
 if(!supplier&&/^NCC-[A-Za-z0-9_-]+$/.test(String(input.supplier_code))){supplier={code:input.supplier_code,name:input.supplier_code,status:'ACTIVE',needs_review:true,email:''};putMaster(db,'suppliers',supplier);}
 if(!supplier)fail('Chọn nhà cung cấp hoặc nhập tên nhà cung cấp trong Excel');
 const existing=forceNew?undefined:input.code?catalogRows(db).find(p=>p.code===input.code):catalogRows(db).find(p=>p.supplier_code===supplier.code&&normalize(p.name)===normalize(input.name)&&normalize(p.uom)===normalize(input.uom));
 if(input.code&&!existing)fail('Mã sản phẩm không tồn tại; để trống mã để hệ thống tạo');
 if(existing&&existing.supplier_code!==supplier.code)fail('Đổi nhà cung cấp: tạo sản phẩm mới để giữ đúng mã');
 let seq=existing?.sequence;if(!seq){seq=Number(db.prepare("SELECT value FROM settings WHERE key='catalog_sequence'").get()?.value||0)+1;db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('catalog_sequence',String(seq));}
 const code=existing?.code||supplier.code+'-'+seq,name=String(input.name||'').trim(),uom=String(input.uom||'').trim();if(!name||!uom)fail('Tên sản phẩm và đơn vị tính bắt buộc');
 const product=masters(db,'products').find(p=>p.code===code);putMaster(db,'products',{...product,code,name,uom,status:input.status==='INACTIVE'?'INACTIVE':'ACTIVE',unified:true,sequence:seq,supplier_code:supplier.code});
 const price=validateMaster(db,'prices',{...input,code:existing?.price_code||'CAT-'+seq,product_code:code,supplier_code:supplier.code,uom,currency:'VND'});
 putMaster(db,'prices',{...price,unified:true,sequence:seq,price_code:price.code});return {...price,code,name,sequence:seq};
}
export async function parseCatalogFile(file,mapping){
 if(!file||!/\.(xlsx|csv)$/i.test(file.name||''))fail('Chọn file Excel hoặc CSV');const buffer=Buffer.from(file.content||'','base64');if(!buffer.length||buffer.length>20*1024*1024)fail('File tối đa 20 MB');
 const wb=new ExcelJS.Workbook();if(/\.csv$/i.test(file.name)){const {Readable}=await import('node:stream');await wb.csv.read(Readable.from([buffer]));}else await wb.xlsx.load(buffer);
 const s=wb.worksheets[0];if(!s)fail('File không có sheet');const headers=s.getRow(1).values.slice(1).map(v=>String(v||'').trim());
 const aliases={code:['Mã sản phẩm'],supplier_code:['Mã nhà cung cấp','Tên nhà cung cấp'],name:['Tên sản phẩm','Tên hàng hóa'],uom:['Đơn vị tính','ĐVT'],unit_price:['Đơn giá'],vat_percent:['VAT','VAT (%)'],effective_from:['Hiệu lực từ','Ngày bắt đầu'],effective_to:['Hiệu lực đến','Ngày kết thúc'],status:['Trạng thái']};
 const suggested_mapping=Object.fromEntries(itemFields.map(f=>[f,headers.find(h=>[f,...aliases[f]].some(a=>normalize(a)===normalize(h)))||'']));const map=mapping||suggested_mapping,rows=[];
 s.eachRow((r,n)=>{if(n===1)return;const value=f=>{const cell=r.getCell(headers.indexOf(map[f])+1||s.columnCount+1);return cell.value instanceof Date?cell.value.toISOString().slice(0,10):cell.value&&typeof cell.value==='object'?(cell.value.result??cell.text):cell.value;};
  if(!String(value('name')||'').trim())return;if(rows.length>=10000)fail('Tối đa 10.000 mặt hàng');const data=Object.fromEntries(itemFields.map(f=>[f,value(f)??'']));
  const vat=data.vat_percent;if(typeof vat==='number'&&vat>0&&vat<1)data.vat_percent=vat*100;else data.vat_percent=String(vat).replace(/[%\s]/g,'');
  if(normalize(data.effective_to)===normalize('đang cung cấp'))data.effective_to='';
  for(const f of ['effective_from','effective_to']){const m=/^(\d{1,2})[/.](\d{1,2})[/.](\d{4})$/.exec(String(data[f]).trim());if(m)data[f]=`${m[3]}-${m[2].padStart(2,'0')}-${m[1].padStart(2,'0')}`;}
  data.status||=(data.effective_to&&data.effective_to<new Date().toISOString().slice(0,10)?'EXPIRED':Number(data.unit_price)===0?'INACTIVE':'ACTIVE');rows.push({row:n,data});
 });if(!rows.length)fail('Không tìm thấy hàng hóa. Kiểm tra ánh xạ Tên sản phẩm');return {headers,suggested_mapping,rows};
}
export async function unifiedRoute({db,user,path,method,req,res,body,send,excel}){
 const match=/^\/api\/admin\/master\/items(?:\/(export|preview|commit))?$/.exec(path);if(!match)return false;if(user.role!=='ADMIN')fail('Chỉ Admin được quản lý danh mục',403);
 if(method==='GET'){if(match[1]==='export'){const wb=new ExcelJS.Workbook(),s=wb.addWorksheet('Danh mục sản phẩm');s.addRow(headings);for(const r of catalogRows(db))s.addRow(itemFields.map(f=>r[f]??''));s.columns.forEach(c=>c.width=24);excel(res,Buffer.from(await wb.xlsx.writeBuffer()),'Danh-muc-san-pham.xlsx');}else send(res,{fields:itemFields,rows:catalogRows(db)});return true;}
 const data=await body(req);
 if(!match[1]){let result;transaction(db,()=>{result=saveCatalogItem(db,data);audit(db,user,'CATALOG_ITEM_SAVED',result.code,result);});send(res,result);return true;}
 const parsed=await parseCatalogFile(data.file,data.mapping),counts={new:0,update:0,duplicate:0,invalid:0},errors=[],rows=[],seen=new Set();
 db.exec('SAVEPOINT unified_import');try{for(const r of parsed.rows){try{const before=catalogRows(db),value=saveCatalogItem(db,r.data);if(seen.has(value.code))fail('Trùng sản phẩm trong file');seen.add(value.code);const type=before.some(x=>x.code===value.code)?'update':'new';counts[type]++;rows.push({...r,data:value,type});}catch(e){counts.invalid++;errors.push({row:r.row,column:'Sản phẩm',issue:e.message,correction:'Sửa dòng dữ liệu rồi nhập lại'});}}}finally{db.exec('ROLLBACK TO unified_import; RELEASE unified_import');}
 if(match[1]==='commit'){if(errors.length)fail('Chưa nhập: file có lỗi',400,errors);transaction(db,()=>{for(const r of parsed.rows)saveCatalogItem(db,r.data);db.prepare('INSERT INTO imports VALUES (?,?,?,?,?,?)').run(id(),user.id,data.file.name,'items',JSON.stringify(counts),now());audit(db,user,'CATALOG_IMPORTED','items',{counts});});}
 send(res,{...parsed,fields:itemFields,rows,counts,errors});return true;
}
