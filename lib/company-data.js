import ExcelJS from 'exceljs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { transaction, putMaster, masters, audit, now, id } from './database.js';
import { normalize } from './business.js';

const templates = fileURLToPath(new URL('../templates/', import.meta.url));
const slug = text => text.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd').toUpperCase().replace(/[^A-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 55);
export async function importCompanyData(db) {
  if (db.prepare("SELECT value FROM settings WHERE key='company_data_v2'").get()) return;
  const sheets = {};
  for (const name of ['WH List.xlsx', 'Vendor List.xlsx', 'Items list.xlsx']) { const wb = new ExcelJS.Workbook(); await wb.xlsx.readFile(join(templates, name)); sheets[name] = wb.worksheets[0]; }
  const summary = { warehouses: 0, suppliers: 0, products: 0, prices_pending: 0, missing_manager: 0, missing_vendor_email: 0, missing_item_supplier: 0 };
  transaction(db, () => {
    // Keep historical records; only retire known v1 seed masters.
    for (const kind of ['warehouses', 'suppliers', 'products', 'prices']) for (const record of masters(db, kind)) {
      if (['WH-BD','WH-LA','WH-BN','SUP-AP','SUP-MH','SUP-TT','SP-001','SP-002','SP-003','SP-004','SP-005','PRICE-SP-001','PRICE-SP-002','PRICE-SP-003','PRICE-SP-004','PRICE-SP-005'].includes(record.code)) putMaster(db, kind, { ...record, status: 'INACTIVE' });
    }
    sheets['WH List.xlsx'].eachRow((row, index) => {
      if (index === 1 || !row.getCell(1).text.trim()) return;
      const name = row.getCell(1).text.trim(), code = 'WH-' + slug(name), manager_email = row.getCell(6).text.trim().toLowerCase();
      putMaster(db, 'warehouses', { code, name, address: row.getCell(2).text, receiver_name: row.getCell(3).text, receiver_phone: row.getCell(4).text, receiver_email: row.getCell(7).text.trim().toLowerCase(), manager_email, status: 'ACTIVE' });
      summary.warehouses++; if (!manager_email) summary.missing_manager++;
    });
    sheets['Vendor List.xlsx'].eachRow((row, index) => {
      if (index === 1 || !row.getCell(1).text.trim()) return;
      const name = row.getCell(1).text.trim(), alias = row.getCell(2).text.trim(), code = 'NCC-' + slug(alias || name), email = row.getCell(5).text.trim().toLowerCase();
      putMaster(db, 'suppliers', { code, name, alias, contact_person: row.getCell(3).text, phone: row.getCell(4).text, email, payment_terms: row.getCell(6).text, delivery_terms: row.getCell(7).text, warranty: row.getCell(8).text, status: 'ACTIVE' });
      summary.suppliers++; if (!email) summary.missing_vendor_email++;
    });
    const suppliers = masters(db, 'suppliers').filter(s => s.status === 'ACTIVE'), seen = new Set();
    sheets['Items list.xlsx'].eachRow((row, index) => {
      if (index === 1 || !row.getCell(2).text.trim()) return;
      const name = row.getCell(2).text, uom = row.getCell(3).text.trim(), supplierName = row.getCell(5).text.trim();
      const productKey = normalize(name) + '|' + normalize(uom), code = 'ITEM-' + createHash('sha256').update(productKey).digest('hex').slice(0,10).toUpperCase();
      // Only a known business prefix is removed. No fuzzy supplier guessing.
      const normalizedSupplier = normalize(supplierName.replace(/^VPP\s+/i, ''));
      const supplier = suppliers.find(s => normalize(s.alias) === normalizedSupplier || normalize(s.name) === normalizedSupplier);
      if (!seen.has(code)) { putMaster(db, 'products', { code, name, uom, category: '', status: 'ACTIVE' }); seen.add(code); summary.products++; }
      const unitPrice = Number(row.getCell(4).value);
      putMaster(db, 'prices', { code: 'IMPORT-ITEM-' + String(index).padStart(4,'0'), supplier_code: supplier?.code || '', product_code: code, uom, unit_price: Number.isFinite(unitPrice) ? unitPrice : '', vat_percent: '', currency: 'VND', effective_from: '', effective_to: '', quotation_no: 'Items list.xlsx / dòng ' + index, status: 'INACTIVE', source_supplier: supplierName, needs_review: true });
      summary.prices_pending++; if (!supplier) summary.missing_item_supplier++;
    });
    db.prepare('INSERT INTO settings VALUES (?,?)').run('company_data_v2', JSON.stringify({ imported_at: now(), ...summary }));
    audit(db, { id: 'SYSTEM' }, 'COMPANY_DATA_IMPORTED', 'company_data_v2', summary);
  });
  return summary;
}

export function localDate(timestamp = new Date()) {
  const parts = Object.fromEntries(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(timestamp).map(p => [p.type,p.value]));
  return { key: `${parts.year}-${parts.month}-${parts.day}`, display: `${parts.day}.${parts.month}.${parts.year}` };
}
// Must run inside the same SQLite transaction as the order insert/update.
export function nextOrderNumber(db, warehouse, timestamp = new Date(), departmentName = warehouse.name) {
  const day = localDate(timestamp);
  const name=String(departmentName||warehouse.name||warehouse.code).normalize('NFKC').toLocaleUpperCase('vi').replace(/[<>:"/\\|?*\x00-\x1f]/g,' ').replace(/\s+/g,' ').trim().replace(/[. ]+$/,'').slice(0,100)||warehouse.code;
  let number;
  do {
    const row = db.prepare('INSERT INTO order_sequences VALUES (?,?,1) ON CONFLICT(warehouse_id,local_date) DO UPDATE SET last_number=last_number+1 RETURNING last_number').get(warehouse.id, day.key);
    number=`PO-${name}-${day.display}-${String(row.last_number).padStart(3,'0')}`;
  } while(db.prepare('SELECT id FROM orders WHERE number=?').get(number));
  return number;
}
