export function fillUpdatedPO(wb,s,order,supplier,items){
 const extra=Math.max(0,items.length-5),totalRow=24+extra;
 if(extra){
  const merges=[...s.model.merges],style=Array.from({length:8},(_,c)=>structuredClone(s.getCell(19,c+1).style));
  for(const m of merges)s.unMergeCells(m);
  s.spliceRows(24,0,...Array.from({length:extra},()=>[]));
  for(const m of merges)s.mergeCells(m.replace(/([A-Z]+)(\d+)/g,(_,col,row)=>col+(Number(row)>=24?Number(row)+extra:Number(row))));
  for(let r=24;r<totalRow;r++)for(let c=1;c<=8;c++)s.getCell(r,c).style=structuredClone(style[c-1]);
 }
 const put=(cell,value)=>{s.getCell(cell).value=value??'';s.getCell(cell).alignment={...s.getCell(cell).alignment,wrapText:true,vertical:'middle'};};
 put('B5',order.number);put('F5',order.po_date||new Date().toLocaleDateString('en-GB',{timeZone:'Asia/Ho_Chi_Minh'}).replaceAll('/','.'));
 for(const [cell,value] of Object.entries({B6:supplier.name,B7:supplier.contact_person,E7:supplier.phone,B8:supplier.payment_terms,E8:supplier.delivery_terms,B9:order.warehouse.name,E9:order.address,B12:order.department,F12:order.project_name,B13:items.length===1?(items[0].standard_item_name||items[0].original_item_name):`${items.length} mặt hàng theo danh sách`,F13:items.map(i=>`${i.quantity} ${i.uom}`).join('; '),B14:order.purpose||order.note,F14:order.cost_allocation_months,B15:order.expected_benefit,F15:order.expected_usage_months}))put(cell,value);
 for(const r of [6,7,8,9,12,13,14,15])s.getRow(r).height=Math.max(s.getRow(r).height||16,32);
 for(let r=19;r<totalRow;r++)for(let c=1;c<=8;c++)s.getCell(r,c).value=null;
 let total=0;
 items.forEach((i,n)=>{const r=19+n,p=i.snapshot,base=Math.round(i.quantity*p.unit_price),amount=base+Math.round(base*p.vat_percent/100);if(!Number.isSafeInteger(total+amount))throw Error('Giá trị PO vượt phạm vi tính toán an toàn');total+=amount;
  [n+1,i.standard_item_name||i.original_item_name,i.uom,i.quantity,p.unit_price,p.vat_percent/100,{formula:`ROUND(D${r}*E${r},0)+ROUND(ROUND(D${r}*E${r},0)*F${r},0)`,result:amount},i.note||''].forEach((v,c)=>put(s.getCell(r,c+1).address,v));
  s.getCell(r,6).numFmt='0.##%';for(const c of [5,7])s.getCell(r,c).numFmt='#,##0';s.getRow(r).height=Math.max(30,Math.ceil((i.standard_item_name||i.original_item_name||'').length/45)*14);
 });
 put(`A${totalRow}`,'TOTAL (VND, VAT included)');put(`G${totalRow}`,{formula:`SUM(G19:G${totalRow-1})`,result:total});s.getCell(`G${totalRow}`).numFmt='#,##0';
 put(`A${28+extra}`,`Receiver: ${order.receiver_name||''} · ${order.receiver_phone||''}\nSupplier email: ${supplier.email||''} | Warranty: ${supplier.warranty||''}\n${order.note||''}`);s.getRow(28+extra).height=55;
 put(`A${32+extra}`,order.requester?.name||order.requester?.email||'');put(`E${32+extra}`,order.confirmed_by||'');s.getRow(32+extra).height=32;
 s.pageSetup={...s.pageSetup,paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printArea:`A1:H${34+extra}`,printTitlesRow:'18:18'};wb.calcProperties.fullCalcOnLoad=true;
}
