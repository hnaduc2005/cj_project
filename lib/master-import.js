import { masters } from './database.js';
import { normalize } from './business.js';
const aliases={warehouses:{name:'KHO',address:'ĐỊA CHỈ',receiver_name:'NGƯỜI NHẬN',receiver_phone:'SĐT',receiver_email:'Mail requestor',manager_email:'Mail Line Manager'},suppliers:{code:'Mã nhà cung cấp',name:'Vendor Name',alias:'Alias',contact_person:'Thông tin liên hệ',phone:'SĐT',email:'Mail',payment_terms:'Payment Term',delivery_terms:'Thời gian giao hàng',warranty:'Warranty'}};
export function suggestedMapping(kind,headers,fields){return Object.fromEntries(fields.map(f=>[f,headers.find(h=>normalize(h)===normalize(f))||headers.find(h=>aliases[kind]?.[f]&&normalize(h)===normalize(aliases[kind][f]))||'']));}
export function resolveMasterCode(db,kind,raw){
  if(raw.code||!['warehouses','suppliers'].includes(kind)||!raw.name)return raw;
  const match=masters(db,kind).find(m=>normalize(m.name)===normalize(raw.name));
  const basis=kind==='suppliers'?(raw.alias||raw.name):raw.name;
  const code=(kind==='warehouses'?'WH-':'NCC-')+basis.normalize('NFD').replace(/[\u0300-\u036f]/g,'').replace(/đ/gi,'d').toUpperCase().replace(/[^A-Z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,55);
  return {...raw,code:match?.code||code};
}
