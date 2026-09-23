import ExcelJS from 'exceljs';
import {fillUpdatedPO} from './po-updated.js';
import { fail, validateItem, normalize } from './business.js';
import { fileURLToPath } from 'node:url';

const poTemplate = fileURLToPath(new URL('../templates/po-form.xlsx', import.meta.url));
const orderingTemplate = fileURLToPath(new URL('../templates/ordering-template.xlsx', import.meta.url));

export const orderingHeaders = ['Warehouse', 'Supplier', 'Item', 'UOM', 'Quantity', 'Note', 'Department', 'Receiver', 'Phone', 'RequestedDate'];
export async function readWorkbook(file) {
  if (!file || !/\.(xlsx|csv)$/i.test(file.name || '')) fail('Chỉ hỗ trợ .xlsx hoặc .csv UTF-8');
  const buffer = Buffer.from(file.content || '', 'base64');
  if (!buffer.length || buffer.length > 5 * 1024 * 1024) fail('File phải từ 1 byte đến 5 MB');
  const workbook = new ExcelJS.Workbook();
  try {
    if (/\.csv$/i.test(file.name)) {
      const { Readable } = await import('node:stream');
      await workbook.csv.read(Readable.from([buffer]));
    } else await workbook.xlsx.load(buffer);
  } catch { fail('Không đọc được file. Hãy lưu lại dạng .xlsx hoặc CSV UTF-8.'); }
  const sheets = workbook.worksheets.filter(s => s.actualRowCount > 0);
  if (sheets.length !== 1) fail('File nhập phải có đúng một sheet có dữ liệu. Tách riêng từng kho và từng sheet.');
  const sheet = sheets[0];
  if (sheet.rowCount > 2010 || sheet.columnCount > 50) fail('Giới hạn 2.000 dòng dữ liệu và 50 cột');
  const text = cell => {
    if (cell.type === ExcelJS.ValueType.Formula) return '__FORMULA_NOT_ALLOWED__';
    if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
    return cell.text;
  };
  const official = normalize(sheet.getCell('C5').text) === normalize('NỘI DUNG HÀNG HÓA');
  const headerRow = official ? 5 : 1;
  const headers = [];
  sheet.getRow(headerRow).eachCell({ includeEmpty: true }, c => headers.push(text(c).trim()));
  if (headers.some(h => !h) || new Set(headers).size !== headers.length) fail('Dòng tiêu đề không được trống hoặc trùng tên');
  const rows = [];
  let endRow = headerRow;
  sheet.eachRow((row, i) => { if (i > headerRow && headers.some((_,j) => (!official || j > 0) && text(row.getCell(j+1)) !== '')) endRow = i; });
  for (let i = headerRow + 1; i <= endRow; i++) {
    const values = headers.map((_, j) => text(sheet.getRow(i).getCell(j + 1)));
    rows.push({ row: i, data: Object.fromEntries(headers.map((h, j) => [h, values[j]])) });
  }
  return { headers, rows, buffer, official, general: official ? { department:text(sheet.getCell('B2')), note:text(sheet.getCell('B1')), purpose:text(sheet.getCell('B3')), warehouse:text(sheet.getCell('B4')) } : {} };
}
export function parseOrdering(parsed, warehouse, suppliers = []) {
  if (parsed.official) {
    const errors = [], items = [];
    if (parsed.general.warehouse && parsed.general.warehouse !== warehouse.code && normalize(parsed.general.warehouse) !== normalize(warehouse.name)) errors.push({ row:4, column:'Kho', issue:'Kho trong file khác kho đã chọn', correction:'Tách file theo kho hoặc sửa ô B4 đúng kho' });
    for (const { row, data } of parsed.rows) {
      const source = data['NHÀ CUNG CẤP'] || '';
      const supplier = suppliers.find(s => [s.code,s.name,s.alias].some(v => v && normalize(v) === normalize(source)));
      const item = { supplier_code:supplier?.code || source, original_item_name:data['NỘI DUNG HÀNG HÓA'], uom:data['ĐVT'], quantity:Number(data['SỐ LƯỢNG']), note:data['GHI CHÚ'] || '' };
      for (const [column,value] of Object.entries(data)) if (column !== 'STT' && value === '__FORMULA_NOT_ALLOWED__') errors.push({ row,column,issue:'Công thức trong dữ liệu mặt hàng',correction:'Dán dưới dạng giá trị' });
      errors.push(...validateItem(item,row)); items.push(item);
    }
    for (const [key,value] of Object.entries(parsed.general)) if (value === '__FORMULA_NOT_ALLOWED__') errors.push({row:1,column:key,issue:'Công thức trong thông tin đầu đơn',correction:'Dán dưới dạng giá trị'});
    if (!items.length) errors.push({row:6,column:'Mặt hàng',issue:'File chưa có dữ liệu',correction:'Nhập ít nhất một dòng'});
    return { items,errors,header:parsed.general };
  }
  const required = ['Warehouse', 'Supplier', 'Item', 'UOM', 'Quantity'];
  const missing = required.filter(h => !parsed.headers.includes(h));
  if (missing.length) fail('Thiếu cột: ' + missing.join(', ') + '. Tải mẫu từ website.');
  const errors = [], items = [];
  for (const { row, data } of parsed.rows) {
    const item = { supplier_code: data.Supplier, original_item_name: data.Item, uom: data.UOM, quantity: Number(data.Quantity), note: data.Note || '' };
    if (data.Warehouse !== warehouse.code) errors.push({ row, column: 'Warehouse', issue: 'Mã kho không trùng kho đã chọn', correction: 'Dùng ' + warehouse.code + '; tách mỗi kho thành một file' });
    for (const [column, value] of Object.entries(data)) if (value === '__FORMULA_NOT_ALLOWED__') errors.push({ row, column, issue: 'Không chấp nhận công thức', correction: 'Dán dưới dạng giá trị (Paste Values)' });
    errors.push(...validateItem(item, row)); items.push(item);
  }
  for (const header of ['Department', 'Receiver', 'Phone', 'RequestedDate']) {
    const distinct = [...new Set(parsed.rows.map(r => r.data[header]).filter(Boolean))];
    if (distinct.length > 1) errors.push({ row: 2, column: header, issue: 'Thông tin đầu đơn không thống nhất', correction: 'Dùng cùng một giá trị cho mọi dòng' });
  }
  if (!items.length) errors.push({ row: 2, column: 'Item', issue: 'File chưa có mặt hàng', correction: 'Thêm ít nhất một dòng' });
  const first = parsed.rows[0]?.data || {};
  return { items, errors, header: { department: first.Department || '', receiver_name: first.Receiver || '', receiver_phone: first.Phone || '', requested_date: first.RequestedDate || '' } };
}
function styleSheet(sheet) {
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
  sheet.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF173A63' } };
  sheet.getRow(1).height = 26;
  sheet.columns.forEach(c => { c.width = 24; });
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columnCount } };
}
export async function tableWorkbook(headers, rows, name = 'Data') {
  const wb = new ExcelJS.Workbook(); const sheet = wb.addWorksheet(name);
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(headers.map(h => row[h] ?? ''));
  styleSheet(sheet); return Buffer.from(await wb.xlsx.writeBuffer());
}
export async function createPO(order, supplier, items) {
  if (!items.length) fail('PO phải có ít nhất một mặt hàng');
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(poTemplate); wb.creator = 'PROCUREMENT SMILE';
  const s = wb.getWorksheet('FORM PO');
  if (!s) fail('FORM PO không có sheet FORM PO');
  if(s.getCell('A5').text.trim()==='PO No.') {fillUpdatedPO(wb,s,order,supplier,items);return Buffer.from(await wb.xlsx.writeBuffer());}
  const extra = Math.max(0,items.length - 5), totalRow = 25 + extra;
  if (extra) {
    s.unMergeCells('A25:F25'); s.unMergeCells('G25:H25');
    s.spliceRows(25,0,...Array.from({length:extra},()=>[]));
    s.mergeCells(`A${totalRow}:F${totalRow}`); s.mergeCells(`G${totalRow}:H${totalRow}`);
    for (let r=25;r<totalRow;r++) for (let c=1;c<=8;c++) s.getCell(r,c).style = structuredClone(s.getCell(20,c).style);
  }
  const put = (cell,value) => { s.getCell(cell).value = value || ''; s.getCell(cell).alignment = {...s.getCell(cell).alignment,wrapText:true,vertical:'middle'}; };
  put('B4',order.number); put('B5',order.po_date || new Date().toLocaleDateString('en-GB',{timeZone:'Asia/Ho_Chi_Minh'}).replaceAll('/','.'));
  put('B7',supplier.name); put('B8',supplier.contact_person); put('D8',supplier.phone);
  put('B9',supplier.payment_terms); put('D9',supplier.delivery_terms);
  put('B10',order.warehouse.name); put('B11',order.address);
  put('B14',order.department); put('D14',order.project_name || '');
  put('B15',items.length === 1 ? (items[0].standard_item_name || items[0].original_item_name) : `${items.length} mặt hàng theo danh sách`);
  put('D15',items.map(i=>`${i.quantity} ${i.uom}`).join('; '));
  put('B16',order.purpose || order.note); put('D16',order.cost_allocation_months || '');
  put('B17',order.expected_benefit || ''); put('D17',order.expected_usage_months || '');
  for (const r of [7,9,10,11,14,15,16,17]) s.getRow(r).height = Math.max(s.getRow(r).height || 16,32);
  let total = 0;
  for (let r=20;r<totalRow;r++) for (let c=1;c<=8;c++) s.getCell(r,c).value = null;
  items.forEach((item,index) => {
    const row=20+index, price=item.snapshot, base=Math.round(item.quantity*price.unit_price), vat=Math.round(base*price.vat_percent/100);
    if (!Number.isSafeInteger(base+vat) || !Number.isSafeInteger(total+base+vat)) fail('Giá trị PO vượt phạm vi tính toán an toàn');
    total += base + vat;
    [index+1,item.standard_item_name || item.original_item_name,item.uom,item.quantity,price.unit_price,price.vat_percent,{formula:`ROUND(D${row}*E${row},0)+ROUND(ROUND(D${row}*E${row},0)*F${row}/100,0)`,result:base+vat},item.note || ''].forEach((v,c)=>{s.getCell(row,c+1).value=v;});
    s.getRow(row).height=Math.max(30,Math.ceil((item.original_item_name || '').length/45)*14);
    for(const c of [5,7])s.getCell(row,c).numFmt='#,##0';
  });
  put(`A${totalRow}`,'TOTAL (VND, VAT included)');
  s.getCell(`G${totalRow}`).value={formula:`SUM(G20:G${totalRow-1})`,result:total};s.getCell(`G${totalRow}`).numFmt='#,##0';
  s.mergeCells(`A${28+extra}:H${28+extra}`);
  put(`A${28+extra}`,`Receiver: ${order.receiver_name || ''} · ${order.receiver_phone || ''}\nSupplier email: ${supplier.email || ''} | Warranty: ${supplier.warranty || ''}\n${order.note || ''}`);
  s.getRow(28+extra).height=50;
  put(`A${30+extra}`,order.requester?.name || order.requester?.email || '');
  put(`B${30+extra}`,order.confirmed_by || '');
  s.pageSetup={...s.pageSetup,paperSize:9,orientation:'landscape',fitToPage:true,fitToWidth:1,fitToHeight:0,printArea:`A1:H${30+extra}`,printTitlesRow:'19:19'};
  wb.calcProperties.fullCalcOnLoad=true;
  return Buffer.from(await wb.xlsx.writeBuffer());
}

export async function orderingWorkbook(warehouse, order) {
  const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(orderingTemplate);
  const s = wb.getWorksheet('FORM ORDER');
  s.getCell('B1').value=order?.note || '';s.getCell('B2').value=order?.department || '';s.getCell('B3').value=order?.purpose || '';
  s.getCell('A4').value='KHO';s.getCell('B4').value=warehouse.code;
  const style=Array.from({length:6},(_,i)=>structuredClone(s.getRow(6).getCell(i+1).style));
  for(let r=6;r<=s.rowCount;r++)for(let c=1;c<=6;c++)s.getCell(r,c).value=null;
  (order?.items || []).forEach((item,i)=>{const r=s.getRow(i+6);[i+1,item.supplier_code,item.original_item_name,item.uom,item.quantity,item.note].forEach((v,c)=>{r.getCell(c+1).value=v;r.getCell(c+1).style=structuredClone(style[c]);});r.height=30;});
  s.pageSetup={...s.pageSetup,paperSize:9,fitToPage:true,fitToWidth:1,fitToHeight:0,printArea:`A1:F${Math.max(26,(order?.items.length || 0)+6)}`};
  return Buffer.from(await wb.xlsx.writeBuffer());
}
