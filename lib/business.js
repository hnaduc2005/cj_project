import { masters } from './database.js';

export function fail(message, status = 400, details) { const e = new Error(message); e.status = status; e.details = details; throw e; }
export const normalize = value => String(value || '').normalize('NFKC').trim().toLocaleLowerCase('vi').replace(/[\s\p{P}]+/gu, ' ').trim();
export function validateItem(item, row = 1) {
  const errors = [];
  for (const [field, label] of [['original_item_name', 'Item'], ['uom', 'UOM']]) if (!String(item[field] || '').trim()) errors.push({ row, column: label, issue: 'Thiếu dữ liệu', correction: 'Nhập ' + label });
  if (!Number.isFinite(Number(item.quantity)) || Number(item.quantity) <= 0 || Number(item.quantity) > 1e9) errors.push({ row, column: 'Quantity', issue: 'Số lượng không hợp lệ', correction: 'Nhập số lớn hơn 0 và không quá 1 tỷ' });
  return errors;
}
export function matchItem(db, raw, date = new Intl.DateTimeFormat('en-CA',{timeZone:'Asia/Ho_Chi_Minh'}).format(new Date())) {
  const products = masters(db, 'products').filter(p => p.status === 'ACTIVE');
  const supplier = masters(db, 'suppliers').find(s => s.code === raw.supplier_code && s.status === 'ACTIVE');
  const aliases = masters(db, 'aliases').filter(a => a.status === 'ACTIVE' && normalize(a.name) === normalize(raw.original_item_name) && (!a.supplier_code || a.supplier_code === raw.supplier_code) && (!a.uom || normalize(a.uom) === normalize(raw.uom)));
  let candidates = products.filter(p => normalize(p.uom) === normalize(raw.uom) && (normalize(p.name) === normalize(raw.original_item_name) || aliases.some(a => a.product_code === p.code)));
  if (raw.product_code) candidates = products.filter(p => p.code === raw.product_code && normalize(p.uom) === normalize(raw.uom));
  const result = { ...raw, supplier_name: supplier?.name || raw.supplier_code || 'Chưa chọn NCC', quantity: Number(raw.quantity), match_status: 'MISSING_PRODUCT', price_status: 'MISSING' };
  if (candidates.length !== 1) {
    const fuzzy = products.filter(p => normalize(p.name).includes(normalize(raw.original_item_name)) || normalize(raw.original_item_name).includes(normalize(p.name)));
    if (candidates.length > 1 || fuzzy.length) { result.match_status = 'NEED_REVIEW'; result.price_status = 'PENDING_REVIEW'; result.candidates = (candidates.length ? candidates : fuzzy).map(p => ({ code: p.code, name: p.name })); }
    return result;
  }
  const product = candidates[0];
  result.product_code = product.code; result.standard_item_name = product.name;
  const prices = masters(db, 'prices').filter(p => p.product_code === product.code && p.supplier_code === supplier?.code && normalize(p.uom) === normalize(raw.uom) && p.status === 'ACTIVE' && p.effective_from <= date && (!p.effective_to || p.effective_to >= date));
  if (prices.length > 1) { result.match_status = 'NEED_REVIEW'; result.price_status = 'PENDING_REVIEW'; return result; }
  if (!prices.length) { result.match_status = 'MISSING_PRICE'; return result; }
  result.match_status = 'MATCHED'; result.price_status = 'AVAILABLE';
  result.price = prices[0]; return result;
}
// Explicit allowlist. Requester responses must never serialize the match price object.
export function safeItem(item) {
  return Object.fromEntries(['id', 'original_item_name', 'standard_item_name', 'supplier_code', 'supplier_name', 'product_code', 'uom', 'quantity', 'note', 'match_status', 'price_status', 'candidates'].filter(k => item[k] !== undefined).map(k => [k, item[k]]));
}
export const fields = {
  departments: ['code', 'name', 'warehouse_code', 'status'],
  warehouses: ['code', 'name', 'address', 'receiver_name', 'receiver_phone', 'receiver_email', 'manager_email', 'status'],
  suppliers: ['code', 'name', 'alias', 'contact_person', 'email', 'phone', 'payment_terms', 'delivery_terms', 'warranty', 'status'],
  products: ['code', 'name', 'uom', 'category', 'status'],
  prices: ['code', 'supplier_code', 'product_code', 'uom', 'unit_price', 'vat_percent', 'currency', 'effective_from', 'effective_to', 'quotation_no', 'status'],
  aliases: ['code', 'name', 'product_code', 'supplier_code', 'uom', 'status']
};
export function validateMaster(db, kind, input) {
  if (!fields[kind]) fail('Loại danh mục không hợp lệ');
  const data = Object.fromEntries(fields[kind].map(k => [k, input[k] ?? '']));
  data.code = String(data.code).trim(); data.status ||= 'ACTIVE';
  if (!data.code || data.code.length > 80) fail('Mã bắt buộc, tối đa 80 ký tự');
  if (!/^[A-Za-z0-9_-]+$/.test(data.code)) fail('Mã chỉ gồm chữ không dấu, số, gạch ngang và gạch dưới');
  for (const key of ['email', 'receiver_email', 'manager_email']) if (data[key]) {
    data[key] = String(data[key]).trim().toLowerCase();
    if (!/^[^\s<>@,;]+@[^\s<>@,;]+\.[^\s<>@,;]+$/.test(data[key])) fail('Email không hợp lệ: ' + key);
  }
  if (data.manager_email && !data.manager_email.endsWith('@cj.net')) fail('Line Manager cần email @cj.net');
  if (kind === 'departments' && !masters(db,'warehouses').some(w=>w.code===data.warehouse_code)) fail('Chọn kho liên kết có trong danh mục');
  if (!['ACTIVE', 'INACTIVE', ...(kind === 'prices' ? ['EXPIRED'] : [])].includes(data.status)) fail('Trạng thái không hợp lệ');
  if (kind !== 'prices' && !String(data.name).trim()) fail('Tên bắt buộc');
  if (['products', 'prices'].includes(kind) && !String(data.uom).trim()) fail('Đơn vị tính bắt buộc');
  if (['prices', 'aliases'].includes(kind)) {
    const product = masters(db, 'products').find(p => p.code === data.product_code);
    if (!product) fail('Mã sản phẩm không tồn tại');
    if (kind === 'prices' && normalize(product.uom) !== normalize(data.uom)) fail('Đơn vị tính phải trùng sản phẩm');
    if ((kind === 'prices' || data.supplier_code) && !masters(db, 'suppliers').some(s => s.code === data.supplier_code)) fail('Mã nhà cung cấp không tồn tại');
  }
  if (kind === 'prices') {
    for (const k of ['unit_price', 'vat_percent']) {
      if (data[k] === '' || !Number.isFinite(Number(data[k])) || Number(data[k]) < 0 || Number(data[k]) > (k === 'vat_percent' ? 100 : 1e12)) fail(k + ' không hợp lệ');
      data[k] = Number(data[k]);
    }
    const validDate = d => /^\d{4}-\d{2}-\d{2}$/.test(d) && Number.isFinite(Date.parse(d)) && new Date(d).toISOString().slice(0,10) === d;
    if (!validDate(data.effective_from) || (data.effective_to && (!validDate(data.effective_to) || data.effective_to < data.effective_from))) fail('Ngày hiệu lực không hợp lệ; dùng YYYY-MM-DD');
    data.currency ||= 'VND'; if (data.currency !== 'VND') fail('Bản MVP chỉ hỗ trợ VND');
    const overlap = masters(db, 'prices').some(p => p.code !== data.code && p.status === 'ACTIVE' && data.status === 'ACTIVE' && p.supplier_code === data.supplier_code && p.product_code === data.product_code && normalize(p.uom) === normalize(data.uom) && p.effective_from <= (data.effective_to || '9999-12-31') && data.effective_from <= (p.effective_to || '9999-12-31'));
    if (overlap) fail('Khoảng hiệu lực trùng với bảng giá đang hoạt động');
  }
  if (kind !== 'prices') {
    const duplicate = masters(db, kind).some(p => p.code !== data.code && normalize(p.name) === normalize(data.name) && (kind !== 'products' || normalize(p.uom) === normalize(data.uom)) && (kind !== 'aliases' || (p.supplier_code || '') === (data.supplier_code || '')));
    if (duplicate) fail('Tên đã tồn tại trong danh mục; cập nhật theo mã hiện có');
  }
  return data;
}
export const transitions = { SUBMITTED: ['PROCESSING', 'CANCELLED'], PROCESSING: ['WAITING_FOR_PRICE', 'PRICE_COMPLETED', 'CANCELLED'], WAITING_FOR_PRICE: ['PROCESSING', 'PRICE_COMPLETED', 'CANCELLED'], PRICE_COMPLETED: ['PROCESSING', 'CANCELLED'], PO_CREATED: ['SENT_TO_SUPPLIER'], SENT_TO_SUPPLIER: ['COMPLETED'] };
