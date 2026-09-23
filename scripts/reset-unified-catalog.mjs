import {DatabaseSync} from 'node:sqlite';import {readFileSync,mkdirSync,writeFileSync} from 'node:fs';import {parseCatalogFile,saveCatalogItem,catalogRows} from '../lib/unified-catalog.js';import {masters,putMaster,transaction,audit} from '../lib/database.js';import {normalize} from '../lib/business.js';
const parsed=await parseCatalogFile({name:'Item List.xlsx',content:readFileSync('../Items list.xlsx').toString('base64')});const db=new DatabaseSync('data/purchase.sqlite');db.exec('PRAGMA busy_timeout=5000');
if(db.prepare("SELECT value FROM settings WHERE key='unified_catalog_reset'").get()&&!process.argv.includes('--redo'))throw Error('Đã reset; dùng chức năng nhập Excel để cập nhật tiếp');
const backup='data/backups/unified-'+Date.now();mkdirSync(backup,{recursive:true});db.exec("VACUUM INTO '"+backup+"/purchase.sqlite'");const oldProducts=masters(db,'products'),oldPrices=masters(db,'prices');const result={sourceRows:parsed.rows.length,backup,at:new Date().toISOString(),rows:[]};
transaction(db,()=>{
 for(const kind of ['products','prices'])for(const row of masters(db,kind))putMaster(db,kind,{...row,status:'INACTIVE',unified:false});
 db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('catalog_sequence','0');
 for(const r of parsed.rows){try{result.rows.push(saveCatalogItem(db,{...r.data,code:''},{forceNew:true}));}catch(e){console.log('Dòng lỗi',r.row,r.data);throw e;}}
 const current=catalogRows(db);for(const row of db.prepare('SELECT i.id,i.data FROM items i JOIN orders o ON o.id=i.order_id LEFT JOIN snapshots s ON s.item_id=i.id WHERE s.id IS NULL AND o.status NOT IN (\'COMPLETED\',\'CANCELLED\',\'PO_CREATED\',\'SENT_TO_SUPPLIER\')').all()){
  const data=JSON.parse(row.data),old=oldProducts.find(p=>p.code===data.product_code);if(!old)continue;const matches=current.filter(p=>normalize(p.name)===normalize(old.name)&&normalize(p.uom)===normalize(old.uom)&&(!data.supplier_code||p.supplier_code===data.supplier_code));if(matches.length===1)db.prepare('UPDATE items SET data=? WHERE id=?').run(JSON.stringify({...data,product_code:matches[0].code}),row.id);
 }
 for(const alias of masters(db,'aliases')){const old=oldProducts.find(p=>p.code===alias.product_code);const matches=old?current.filter(p=>normalize(p.name)===normalize(old.name)&&normalize(p.uom)===normalize(old.uom)&&(!alias.supplier_code||alias.supplier_code===p.supplier_code)):[];putMaster(db,'aliases',matches.length===1?{...alias,product_code:matches[0].code}:{...alias,status:'INACTIVE'});}
 db.prepare('INSERT OR REPLACE INTO settings VALUES (?,?)').run('unified_catalog_reset',JSON.stringify({at:result.at,count:current.length,backup}));audit(db,{id:'SYSTEM'},'UNIFIED_CATALOG_RESET','items',{count:current.length,backup});
});
writeFileSync('docs/UNIFIED-CATALOG-RESET.json',JSON.stringify(result,null,2));console.log(JSON.stringify({count:result.rows.length,first:result.rows[0].code,last:result.rows.at(-1).code,backup}));db.close();
