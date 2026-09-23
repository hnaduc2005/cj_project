import {procurementUI} from '/procurement.js';
import { createUI } from '/v2.js';
const $ = (s, root = document) => root.querySelector(s);
const $$ = (s, root = document) => [...root.querySelectorAll(s)];
const escape = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const e = escape;
const money = n => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(n || 0);
const date = d => d ? new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '—';
const statuses = { DRAFT: ['Bản nháp', ''], SUBMITTED: ['Đã xác nhận · Chờ tiếp nhận', 'blue'], PROCESSING: ['Đang xử lý', 'blue'], WAITING_FOR_PRICE: ['Chờ bổ sung giá', 'orange'], PRICE_COMPLETED: ['Đã đủ giá', 'green'], PO_CREATED: ['Đã tạo PO', 'blue'], SENT_TO_SUPPLIER: ['Máy chủ email đã tiếp nhận PO', 'blue'], COMPLETED: ['Hoàn tất', 'green'], CANCELLED: ['Đã hủy', 'red'], PENDING_APPROVAL: ['Chờ Line Manager duyệt', 'orange'], REJECTED: ['Đã từ chối', 'red'], MATCHED: ['Đã khớp', 'green'], NEED_REVIEW: ['Cần xác minh', 'orange'], MISSING_PRODUCT: ['Thiếu sản phẩm', 'red'], MISSING_PRICE: ['Cần bổ sung dữ liệu', 'red'] };
const masterNames = { items: 'Sản phẩm & đơn giá', departments: 'Phòng ban', warehouses: 'Kho hàng', suppliers: 'Nhà cung cấp', aliases: 'Tên thay thế' };
const labels = { warehouse_code: 'Kho liên kết', manager_email: 'Email Line Manager (@cj.net)', alias: 'Tên gọi ngắn', code: 'Mã', name: 'Tên', address: 'Địa chỉ', receiver_name: 'Người nhận', receiver_phone: 'SĐT người nhận', receiver_email: 'Email người nhận', status: 'Trạng thái', contact_person: 'Người liên hệ', email: 'Email', phone: 'Điện thoại', payment_terms: 'Điều khoản thanh toán', delivery_terms: 'Điều kiện giao hàng', warranty: 'Bảo hành', uom: 'Đơn vị tính', category: 'Nhóm sản phẩm', supplier_code: 'Mã nhà cung cấp', product_code: 'Mã sản phẩm', unit_price: 'Đơn giá (VND)', vat_percent: 'VAT (%)', currency: 'Tiền tệ', effective_from: 'Hiệu lực từ', effective_to: 'Hiệu lực đến', quotation_no: 'Số báo giá' };
const paths = {
 dashboard: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/>',
 box: '<path d="m3 7 9-4 9 4-9 4zM3 7v10l9 4 9-4V7M12 11v10M7 5l10 4"/>',
 file: '<path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h5"/>',
 plus: '<path d="M12 5v14M5 12h14"/>', arrow: '<path d="m9 5 7 7-7 7"/>',
 upload: '<path d="M12 16V3m-5 5 5-5 5 5M4 15v5a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-5"/>',
 download: '<path d="M12 3v13m-5-5 5 5 5-5M4 16v4a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-4"/>',
 clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
 check: '<circle cx="12" cy="12" r="9"/><path d="m8 12 3 3 5-6"/>',
 alert: '<path d="m10.5 4-8 14a1 1 0 0 0 1 2h17a1 1 0 0 0 1-2l-8-14a1 1 0 0 0-3 0zM12 9v4M12 17h.01"/>',
 warehouse: '<path d="m3 9 9-6 9 6v12H3zM7 21V11h10v10M7 15h10M7 18h10"/>',
 bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>',
 help: '<circle cx="12" cy="12" r="9"/><path d="M9.5 9a2.5 2.5 0 1 1 4 2c-1.5 1-1.5 1-1.5 3M12 17h.01"/>',
 logout: '<path d="M9 4H4v16h5M9 12h12m-4-4 4 4-4 4"/>',
 settings: '<path d="M4 7h16M4 17h16"/><circle cx="9" cy="7" r="3"/><circle cx="15" cy="17" r="3"/>',
 chart: '<path d="M4 3v18h17M8 16v-5M13 16V7M18 16V4"/>',
 trash: '<path d="M3 6h18M9 6V3h6v3M5 6l1 15h12l1-15M10 10v7M14 10v7"/>',
 menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
 search: '<circle cx="10" cy="10" r="7"/><path d="m15 15 6 6"/>',
 shield: '<path d="m12 3 8 3v6c0 5-8 9-8 9s-8-4-8-9V6zM8 12l3 3 5-6"/>'
};
function icon(name, cls = '') { return `<svg class="icon ${cls}" viewBox="0 0 24 24" aria-hidden="true">${paths[name] || paths.file}</svg>`; }
function badge(s) { const [name, color] = statuses[s] || [s, '']; return `<span class="badge ${color}"><span class="dot"></span>${e(name)}</span>`; }
function brand() { return '<div class="brand"><div class="brand-mark">CJ<span class="petals"><i></i><i></i><i></i></span></div><div class="brand-name">LOGISTICS<span>VINA · PURCHASE PORTAL</span></div></div>'; }
function empty(text) { return `<div class="empty">${icon('box')}<p>${e(text)}</p></div>`; }
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('show'); clearTimeout(toast.timer); toast.timer = setTimeout(() => $('#toast').classList.remove('show'), 5000); }
async function api(path, data, method) {
  const res = await fetch('/api' + path, { method: method || (data === undefined ? 'GET' : 'POST'), credentials: 'same-origin', headers: data === undefined ? {} : { 'Content-Type': 'application/json' }, body: data === undefined ? undefined : JSON.stringify(data) });
  const result = await res.json();
  if (!res.ok) { const err = new Error(result.error || 'Lỗi kết nối'); err.details = result.details; err.status = res.status; throw err; }
  return result;
}
function guarded(fn) { return async event => { const button = event?.currentTarget; if (button?.tagName === 'BUTTON') button.disabled = true; try { await fn(event); } catch (err) { toast(err.message); } finally { if (button?.isConnected) button.disabled = false; } }; }
const state = { user: null, catalog: {}, orders: [], draft: null, step: 1, tab: 'manual', preview: null, masterKind: 'items', page: 1, filters: {} };
const admin = () => state.user?.role === 'ADMIN';
function route() { return location.hash.slice(1) || '/dashboard'; }
function go(path) { if (route() === path) render(); else location.hash = path; }
function heading(title, subtitle, action = '') { return `<div class="page-heading"><div><h1>${e(title)}</h1><p>${e(subtitle)}</p></div>${action}</div>`; }
function button(text, id, ico = '', primary = false) { return `<button class="btn ${primary ? 'primary' : ''}" id="${id}">${ico ? icon(ico) : ''}${e(text)}</button>`; }
function workflow() { return `<div class="workflow">${[['warehouse','Chọn kho','Một kho · Một đơn'],['file','Tạo yêu cầu','Nhập tay hoặc Excel'],['check','Xử lý đơn','Kiểm tra & xác nhận'],['box','Hoàn tất','Theo dõi giao hàng']].map((s,i) => `${i ? icon('arrow') : ''}<div class="workflow-step"><span class="step-icon">${icon(s[0])}</span><div><strong>${s[1]}</strong><small>${s[2]}</small></div></div>`).join('')}</div>`; }
function shell(content,title) { return ui.shell(content,title); }
function modal(title, content) { const d = $('#modal'); d.innerHTML = `<div class="panel-head"><h2>${e(title)}</h2><button class="btn ghost small" data-close aria-label="Đóng">✕</button></div><div class="panel-body">${content}</div>`; $$('[data-close]', d).forEach(b => b.onclick = () => d.close()); if (!d.open) d.showModal(); }
async function confirmAction(title, text) { return new Promise(resolve => { modal(title, `<p>${e(text)}</p><div class="form-actions">${button('Quay lại','confirm-no')}${button('Xác nhận','confirm-yes','check',true)}</div>`); const d = $('#modal'); let answered = false; const answer = v => { if (!answered) { answered = true; resolve(v); d.close(); } }; $('#confirm-yes').onclick = () => answer(true); $('#confirm-no').onclick = () => answer(false); d.addEventListener('close', () => answer(false), { once: true }); }); }
function login() { return ui.login(); }
async function refresh() { state.user=await api('/me'); if(!state.user)throw Error('Phiên đăng nhập đã hết hạn'); [state.catalog,state.orders,state.approvals,state.setup,state.mailConfig]=await Promise.all([api('/catalog'),api('/orders'),Promise.resolve([]),admin()?api('/admin/setup'):Promise.resolve(null),api('/auth/config')]); }
function stat(title, value, ico, color, foot) { return `<div class="stat"><div class="stat-title">${title}</div><span class="stat-icon ${color}">${icon(ico)}</span><div class="stat-number">${value.toString().padStart(2,'0')}</div><div class="stat-foot">${foot}</div></div>`; }
function orderRows(orders) { return orders.map(o => `<tr class="${admin()&&o.status==='WAITING_FOR_PRICE'?'waiting-price':admin()&&!['COMPLETED','CANCELLED','REJECTED','DRAFT'].includes(o.status)&&(o.status==='SUBMITTED'||o.items.some(i=>i.match_status!=='MATCHED'))?'needs-action':''}"><td><a href="#/orders/${e(o.id)}">${e(o.number)}</a><div class="sub">${e(o.department || 'Vận hành kho')}</div></td><td>${e(o.warehouse.name)}<div class="sub">${e(o.warehouse.code)}</div></td><td>${date(o.created_at)}</td><td>${o.items.length} mặt hàng</td><td>${badge(o.status)}</td><td><a href="#/orders/${e(o.id)}" aria-label="Xem ${e(o.number)}">${icon('arrow')}</a></td></tr>`).join(''); }
function orderTable(orders) { return orders.length ? `<div class="table-wrap"><table><thead><tr><th>Mã yêu cầu</th><th>Kho nhận hàng</th><th>Ngày tạo</th><th>Số mặt hàng</th><th>Trạng thái</th><th></th></tr></thead><tbody>${orderRows(orders)}</tbody></table></div>` : empty('Chưa có yêu cầu phù hợp'); }
function dashboard() { return admin()?procurement.dashboard():ui.dashboard(); }
function ordersPage() {
  const f = state.filters;
  shell(`${heading(admin() ? 'Tất cả đơn hàng' : 'Đơn hàng của tôi','Tìm kiếm và theo dõi tiến độ từng yêu cầu.',admin()?'':'<a class="btn primary" href="#/orders/new">'+icon('plus')+'Tạo yêu cầu mới</a>')}<section class="panel"><div class="toolbar"><input class="search" id="search" placeholder="Tìm mã đơn, nội dung hoặc người yêu cầu…" aria-label="Tìm đơn" value="${e(f.search || '')}"><select id="filter-status" aria-label="Lọc trạng thái"><option value="">Tất cả trạng thái</option>${Object.entries(statuses).filter(([key])=>!['MATCHED','NEED_REVIEW','MISSING_PRODUCT','MISSING_PRICE'].includes(key)).map(([k,v])=>`<option value="${k}" ${f.status===k?'selected':''}>${v[0]}</option>`).join('')}</select><select id="filter-wh" aria-label="Lọc kho"><option value="">Tất cả kho</option>${state.catalog.warehouses.map(w=>`<option value="${w.id}" ${f.wh===w.id?'selected':''}>${e(w.name)}</option>`).join('')}</select><input id="filter-date" type="date" aria-label="Ngày tạo từ" title="Ngày tạo từ" value="${e(f.date || '')}"></div><div id="orders-table"></div></section>`, 'Đơn hàng');
  const update = () => {
    state.filters = { search: $('#search').value, status: $('#filter-status').value, wh: $('#filter-wh').value, date: $('#filter-date').value };
    const f = state.filters, result = state.orders.filter(o => (!f.search || (o.number + ' ' + o.note + ' ' + o.requester.name).toLowerCase().includes(f.search.toLowerCase())) && (!f.status || o.status===f.status) && (!f.wh || o.warehouse.id===f.wh) && (!f.date || o.created_at.slice(0,10)>=f.date));
    const pages = Math.max(1, Math.ceil(result.length / 10)); state.page = Math.min(state.page, pages);
    $('#orders-table').innerHTML = orderTable(result.slice((state.page-1)*10,state.page*10)) + `<div class="table-foot"><span>${result.length} yêu cầu</span><div class="pagination"><button class="btn small" id="prev" ${state.page===1?'disabled':''}>←</button><span>Trang ${state.page}/${pages}</span><button class="btn small" id="next" ${state.page===pages?'disabled':''}>→</button></div></div>`;
    $('#prev').onclick = () => { state.page--; update(); }; $('#next').onclick = () => { state.page++; update(); };
  };
  ['#search','#filter-status','#filter-wh','#filter-date'].forEach(s => $(s).oninput = () => { state.page=1; update(); }); update();
}
function blankItem() { return { supplier_code: '', original_item_name: '', uom: '', quantity: 1, note: '' }; }
function newOrder() {
  if(admin()){go('/orders');return;}
  if (!state.draft) { state.draft = { warehouse_id:'', department_code:'', department:'', purpose:'', note:'', requested_date:'', items:[blankItem()] }; state.step=1; state.tab=route().includes('?excel')?'excel':'manual'; state.preview=null; }
  const draft = state.draft, wh = state.catalog.warehouses.find(w=>w.id===draft.warehouse_id);
  let content = '';
  if (state.step === 1) content = `<section class="panel"><div class="panel-head"><h2>Chọn Phòng Ban / Địa điểm nhận hàng</h2><a class="text-link" href="#/warehouse-requests">Đề nghị tạo kho →</a></div><div class="panel-body"><div class="grid-2"><div class="form-group"><label for="department-select">Chọn Phòng Ban / Địa điểm nhận hàng</label><select id="department-select" required><option value="">Chọn phòng ban / kho…</option>${(state.catalog.departments||[]).map(d=>`<option value="${e(d.code)}" ${d.code===draft.department_code?'selected':''}>${e(d.name)}</option>`).join('')}</select></div><div class="form-group"><label for="requested-date">Ngày mong muốn nhận hàng</label><input id="requested-date" type="date" required value="${e(draft.requested_date)}"></div></div>${wh?`<div class="notice"><span>Kho nhận hàng tự động: <strong>${e(wh.name)}</strong><br>${e(wh.address)} · ${e(wh.receiver_name)} · ${e(wh.receiver_phone)}</span></div>`:'<p class="notice warning">Phòng ban và kho đều là địa điểm nhận hàng. Chọn địa điểm có sẵn hoặc gửi đề nghị tạo địa điểm mới để Admin duyệt.</p>'}<div class="form-group"><label for="order-purpose">Nội dung đơn hàng</label><textarea id="order-purpose" required placeholder="Mục đích, nhu cầu mua hàng…">${e(draft.purpose)}</textarea></div><div class="form-group"><label for="order-note">Ghi chú yêu cầu</label><textarea id="order-note" placeholder="Thông tin bổ sung cho bộ phận mua hàng">${e(draft.note)}</textarea></div></div></section>`;
  if (state.step === 2) content = `<section class="panel"><div class="tabs"><button class="tab ${state.tab==='manual'?'active':''}" data-tab="manual">${icon('file')} Nhập thủ công</button><button class="tab ${state.tab==='excel'?'active':''}" data-tab="excel">${icon('upload')} Tải lên Excel</button></div><div class="panel-body"><div class="notice">${icon('warehouse')}<span>Kho nhận: <strong>${e(wh?.name)}</strong> · ${e(wh?.receiver_name)}</span></div>${state.tab==='manual' ? `<div class="table-wrap item-grid"><table><thead><tr><th>Nhà cung cấp</th><th>Mặt hàng *</th><th>ĐVT *</th><th>Số lượng *</th><th>Ghi chú</th><th></th></tr></thead><tbody id="item-rows">${draft.items.map((item,i)=>`<tr data-row="${i}"><td><select data-field="supplier_code" aria-label="Nhà cung cấp dòng ${i+1}"><option value="">Chưa xác định</option>${state.catalog.suppliers.map(s=>`<option value="${e(s.code)}" ${item.supplier_code===s.code?'selected':''}>${e(s.name)}</option>`).join('')}</select></td><td><input data-field="original_item_name" aria-label="Mặt hàng dòng ${i+1}" list="products" value="${e(item.original_item_name)}" placeholder="Nhập tên mặt hàng"></td><td><input data-field="uom" aria-label="Đơn vị dòng ${i+1}" value="${e(item.uom)}" placeholder="Cuộn"></td><td><input type="number" min="0.001" step="any" max="1000000000" data-field="quantity" aria-label="Số lượng dòng ${i+1}" value="${e(item.quantity)}"></td><td><input data-field="note" aria-label="Ghi chú dòng ${i+1}" value="${e(item.note)}"></td><td><button class="btn ghost small" data-remove="${i}" aria-label="Xóa dòng ${i+1}">${icon('trash')}</button></td></tr>`).join('')}</tbody></table></div><datalist id="products">${state.catalog.products.map(p=>`<option value="${e(p.name)}">${e(p.uom)}</option>`).join('')}</datalist><div class="checkbox-row">${button('Thêm mặt hàng','add-item','plus')}</div>` : `<div class="upload" id="dropzone">${icon('upload')}<h3>Kéo thả file yêu cầu vào đây</h3><p>Excel .xlsx hoặc CSV UTF-8 · Tối đa 20 MB / 2.000 dòng</p><input id="order-file" type="file" accept=".xlsx,.csv" aria-label="Chọn file Excel"><p class="checkbox-row" id="file-name">${e(draft.file?.name || 'Chưa chọn file')}</p></div><p class="inline-note"><a href="/api/template/ordering?warehouse=${encodeURIComponent(wh?.code || '')}">${icon('download')} Tải mẫu cho ${e(wh?.name)}</a>. Ô B4 (KHO) phải là ${e(wh?.code)}. Thông tin phòng ban/người nhận trong file được ưu tiên khi có.</p><div class="notice warning">${icon('alert')}<span>Đúng mẫu Ordering Template của công ty: thông tin đầu đơn ở dòng 1–4, tiêu đề dòng 5, mặt hàng từ dòng 6. Một file, một kho.</span></div>`}<div id="validation"></div></div></section>`;
  if (state.step === 3) content = `<section class="panel"><div class="panel-head"><h2>Kiểm tra yêu cầu trước khi gửi</h2>${badge('DRAFT')}</div><div class="panel-body"><div class="grid-3"><div class="summary-field">Kho nhận<strong>${e(wh?.name)}</strong>${e(wh?.address)}</div><div class="summary-field">Người nhận<strong>${e(state.preview?.header?.receiver_name || wh?.receiver_name)}</strong>${e(state.preview?.header?.receiver_phone || wh?.receiver_phone)}</div><div class="summary-field">Phòng ban<strong>${e(state.preview?.header?.department || draft.department)}</strong>${e(draft.note)}</div></div></div>${itemsTable(state.preview.items)}<div class="panel-body"><div class="notice warning">${icon('alert')}<span>Các dòng cần xác minh hoặc bổ sung dữ liệu vẫn được gửi đầy đủ cho quản trị. Sau khi gửi, bạn không thể thay đổi kho và mặt hàng.</span></div></div></section>`;
  shell(`${heading(draft.id?'Chỉnh sửa bản nháp':'Tạo yêu cầu mua hàng','Điền thông tin nhu cầu mua hàng cho kho của bạn.')}<div class="steps">${['Chọn Phòng Ban','Thêm mặt hàng','Kiểm tra & gửi'].map((s,i)=>`<div class="${state.step>=i+1?'active':''}"><b>${i+1}</b>${s}</div>`).join('')}</div>${content}<div class="form-actions"><button class="btn" id="back">${state.step===1?'Đóng yêu cầu':'← Quay lại'}</button><div>${state.step===3?button('Lưu bản nháp','save-draft','file'):''}${button(state.step===3?'Gửi yêu cầu':state.step===2?'Kiểm tra dữ liệu':'Tiếp tục','continue',state.step===3?'check':'arrow',true)}</div></div>`, 'Tạo yêu cầu');
  $('#back').onclick = guarded(async () => { if (state.step>1) { state.step--; newOrder(); } else if (await confirmAction('Đóng yêu cầu?', 'Thông tin chưa lưu sẽ bị mất.')) { state.draft=null; go('/orders'); } });
  if (state.step===1) {
    const sync=()=>{draft.note=$('#order-note').value;draft.purpose=$('#order-purpose').value;draft.requested_date=$('#requested-date').value;};
    $('#department-select').onchange=()=>{sync();const d=state.catalog.departments.find(d=>d.code===$('#department-select').value);draft.department_code=d?.code||'';draft.department=d?.name||'';draft.warehouse_id=state.catalog.warehouses.find(w=>w.code===d?.warehouse_code)?.id||'';draft.file=null;state.preview=null;newOrder();};
    $('#continue').onclick=guarded(async()=>{sync();if(!draft.department_code||!draft.warehouse_id)throw Error('Chọn phòng ban đã liên kết kho ACTIVE');if(!draft.requested_date||!draft.purpose.trim())throw Error('Nhập ngày mong muốn nhận hàng và nội dung đơn hàng');state.step=2;newOrder();});

  }
  if (state.step===2) {
    $$('[data-tab]').forEach(b=>b.onclick=()=>{ state.tab=b.dataset.tab; state.preview=null; newOrder(); });
    if (state.tab==='manual') {
      $$('[data-field]').forEach(input=>input.oninput=()=>{ const item=draft.items[Number(input.closest('tr').dataset.row)]; item[input.dataset.field]=input.value; if(input.dataset.field==='original_item_name') { const product=state.catalog.products.find(p=>p.name===input.value); if(product) { item.uom=product.uom; $('[data-field=uom]',input.closest('tr')).value=product.uom; } } });
      $$('[data-remove]').forEach(b=>b.onclick=()=>{ draft.items.splice(Number(b.dataset.remove),1); newOrder(); });
      $('#add-item').onclick=()=>{ draft.items.push(blankItem()); newOrder(); };
    } else {
      const load = guarded(async file => { draft.file=await readFile(file); $('#file-name').textContent=draft.file.name; });
      $('#order-file').onchange=ev=>load(ev.target.files[0]);
      const zone=$('#dropzone'); zone.ondragover=ev=>{ ev.preventDefault(); zone.classList.add('drag'); }; zone.ondragleave=()=>zone.classList.remove('drag'); zone.ondrop=ev=>{ ev.preventDefault(); zone.classList.remove('drag'); load(ev.dataTransfer.files[0]); };
    }
    $('#continue').onclick=guarded(async()=>{
      if(state.tab==='excel'&&!draft.file) throw Error('Chọn file Excel trước');
      const result=await api('/orders/preview',{ department_code:draft.department_code, warehouse_id:draft.warehouse_id, items:state.tab==='manual'?draft.items:undefined, file:state.tab==='excel'?draft.file:undefined });
      if(result.errors.length) { $('#validation').innerHTML=errorsHtml(result.errors); return; }
      state.preview=result; state.step=3; newOrder();
    });
  }
  if(state.step===3) {
    const save=async submit=>{
      const choice=submit?await ui.confirmSubmission(state.catalog.warehouses.find(w=>w.id===draft.warehouse_id)):null;
      if(submit&&!choice)return;
      const saved=await api('/orders',{ ...draft, file:state.tab==='excel'?draft.file:undefined, items:state.tab==='manual'?draft.items:undefined });
      draft.id=saved.id;
      if(submit) await api('/orders/'+saved.id+'/submit',choice);
      state.draft=null; await refresh(); toast(submit?'Đã chuyển đơn đến Admin. Xem lựa chọn và trạng thái email trong chi tiết đơn.':'Đã lưu bản nháp'); go('/orders/'+saved.id);
    };
    $('#save-draft').onclick=guarded(()=>save(false)); $('#continue').onclick=guarded(()=>save(true));
  }
}
function errorsHtml(errors) { return `<div class="error-list" role="alert"><strong>Cần sửa ${errors.length} lỗi trước khi tiếp tục</strong>${errors.map(x=>`<p>Dòng ${e(x.row)} · ${e(x.column)}: ${e(x.issue)}. ${e(x.correction)}</p>`).join('')}</div>`; }
async function readFile(file) { if(!file) throw Error('Chưa chọn file'); if(file.size>20*1024*1024) throw Error('File vượt quá 20 MB'); if(!/\.(xlsx|csv)$/i.test(file.name)) throw Error('Chỉ hỗ trợ .xlsx hoặc .csv'); return new Promise((resolve,reject)=>{ const reader=new FileReader(); reader.onload=()=>resolve({ name:file.name,content:reader.result.split(',')[1] }); reader.onerror=()=>reject(Error('Không đọc được file')); reader.readAsDataURL(file); }); }
function itemsTable(items, prices=false, resolve=false) { return `<div class="table-wrap"><table><thead><tr><th>Mặt hàng</th><th>Nhà cung cấp</th><th>ĐVT</th><th>Số lượng</th><th>Đối chiếu</th>${prices?'<th>Đơn giá</th><th>VAT</th><th>Thành tiền</th>':''}${resolve?'<th></th>':''}</tr></thead><tbody>${items.map(i=>{ const p=i.snapshot||i.price; const base=p?Math.round(i.quantity*p.unit_price):0; return `<tr><td class="wrap">${e(i.original_item_name)}${i.standard_item_name&&i.standard_item_name!==i.original_item_name?`<div class="sub">→ ${e(i.standard_item_name)}</div>`:''}${i.note?`<div class="sub">${e(i.note)}</div>`:''}</td><td>${e(i.supplier_name||i.supplier_code||'Chưa xác định')}</td><td>${e(i.uom)}</td><td>${e(i.quantity)}</td><td>${badge(i.match_status)}</td>${prices?`<td>${p?money(p.unit_price):'—'}</td><td>${p?p.vat_percent+'%':'—'}</td><td>${p?money(base+Math.round(base*p.vat_percent/100)):'—'}</td>`:''}${resolve?`<td><button class="btn small" data-resolve="${e(i.id)}">Đối chiếu / Báo giá</button></td>`:''}</tr>`; }).join('')}</tbody></table></div>`; }
async function orderDetail(key) { return ui.orderDetail(key); }
function resolveDialog(order,item) { return procurement.resolveDialog(order,item).catch(err=>toast(err.message)); }
function missingPage() {
  const rows=state.orders.filter(o=>!['DRAFT','CANCELLED','COMPLETED','REJECTED'].includes(o.status)).flatMap(o=>o.items.filter(i=>i.match_status!=='MATCHED').map(i=>({order:o,item:i})));
  shell(`${heading('Mặt hàng cần xử lý','Xử lý sản phẩm, nhà cung cấp và dữ liệu còn thiếu.')}<div class="notice">${icon('help')}<span>Mở đơn để tìm sản phẩm/NCC, thêm sản phẩm và giá ngay trong cửa sổ đối chiếu, so sánh báo giá rồi chọn nhà cung cấp.</span></div><section class="panel"><div class="panel-head"><h2>${rows.length} mặt hàng chờ xử lý</h2></div>${rows.length?`<div class="table-wrap"><table><thead><tr><th>Đơn hàng</th><th>Kho</th><th>Mặt hàng</th><th>Tình trạng</th><th>Tuổi đơn</th><th></th></tr></thead><tbody>${rows.map(({order:o,item:i})=>`<tr><td><a href="#/orders/${o.id}">${e(o.number)}</a></td><td>${e(o.warehouse.name)}</td><td>${e(i.original_item_name)}</td><td>${badge(i.match_status)}</td><td>${Math.max(0,Math.floor((Date.now()-Date.parse(o.created_at))/86400000))} ngày</td><td><a class="btn small" href="#/orders/${o.id}">Xử lý →</a></td></tr>`).join('')}</tbody></table></div>`:empty('Tất cả mặt hàng đã được đối chiếu')}</section>`, 'Cần xử lý');
}
async function masterPage() {
  if(['products','prices'].includes(state.masterKind))state.masterKind='items';
  const kind=state.masterKind, data=await api('/admin/master/'+kind);
  const columns=kind==='prices'?['product_code','supplier_code','uom','unit_price','vat_percent','currency','effective_from','effective_to','status']:data.fields;
  const refs=admin()?await Promise.all(['products','suppliers','warehouses'].map(k=>api('/admin/master/'+k))):[];
  shell(`${heading('Dữ liệu danh mục','Quản lý dữ liệu dùng để đối chiếu yêu cầu mua hàng.',button('Thêm bản ghi','add-master','plus',true))}<section class="panel"><div class="tabs">${Object.entries(masterNames).map(([k,n])=>`<button class="tab ${kind===k?'active':''}" data-master-kind="${k}">${n}</button>`).join('')}</div><div class="toolbar"><input class="search" id="master-search" placeholder="Tìm theo mã hoặc tên…" aria-label="Tìm danh mục"><a class="btn" href="/api/admin/master/${kind}/export">${icon('download')}Xuất Excel</a><a class="btn" href="#/import">${icon('upload')}Nhập dữ liệu</a></div><div id="master-table"></div></section><div class="notice">${icon('shield')}<span>Mã là khóa cập nhật. Bản ghi đã có không đổi mã và không xóa cứng; dùng trạng thái INACTIVE để ngừng sử dụng. Lịch sử thay đổi được lưu trong nhật ký.</span></div>`, 'Dữ liệu danh mục');
  let page=1;
  const update=()=>{ const query=$('#master-search').value.toLowerCase(), rows=data.rows.filter(r=>Object.values(r).some(v=>String(v).toLowerCase().includes(query))); const pages=Math.max(1,Math.ceil(rows.length/15)); page=Math.min(page,pages);
    $('#master-table').innerHTML=rows.length?`<div class="table-wrap"><table class="master-table"><thead><tr>${columns.map(f=>`<th>${e(kind==='items'&&f==='code'?'Mã sản phẩm':kind==='items'&&f==='name'?'Tên sản phẩm':labels[f]||f)}</th>`).join('')}<th></th></tr></thead><tbody>${rows.slice((page-1)*15,page*15).map(r=>`<tr>${columns.map(f=>`<td title="${e(r[f])}">${e(r[f])}</td>`).join('')}<td><button class="btn small" data-edit="${e(r.code)}">Sửa</button></td></tr>`).join('')}</tbody></table></div><div class="table-foot"><span>${rows.length} bản ghi</span><div class="pagination"><button class="btn small" id="master-prev" ${page===1?'disabled':''}>←</button>${page}/${pages}<button class="btn small" id="master-next" ${page===pages?'disabled':''}>→</button></div></div>`:empty('Chưa có dữ liệu phù hợp');
    $$('[data-edit]').forEach(b=>b.onclick=()=>edit(data.rows.find(r=>r.code===b.dataset.edit)));
    if($('#master-prev')) $('#master-prev').onclick=()=>{page--;update();}; if($('#master-next')) $('#master-next').onclick=()=>{page++;update();};
  };
  const edit=(record={})=>{
    const defaults={status:'ACTIVE',currency:'VND',vat_percent:'',effective_from:new Date().toISOString().slice(0,10)};
    modal((record.code?'Sửa ':'Thêm ')+masterNames[kind],`<form id="master-form"><div class="grid-2">${data.fields.map(f=>`<div class="form-group"><label for="field-${f}">${e(labels[f]||f)} <span class="muted tiny">${e(f)}</span></label>${['supplier_code','product_code','warehouse_code'].includes(f)?`<select id="field-${f}" name="${f}" required><option value="">Chọn…</option>${(refs[{product_code:0,supplier_code:1,warehouse_code:2}[f]]?.rows||[]).map(r=>`<option value="${e(r.code)}" ${r.code===record[f]?'selected':''}>${e(r.code+' · '+r.name)}</option>`).join('')}</select>`:f==='status'?`<select id="field-${f}" name="${f}">${['ACTIVE','INACTIVE',...(['prices','items'].includes(kind)?['EXPIRED']:[])].map(s=>`<option ${(record[f]||defaults[f])===s?'selected':''}>${s}</option>`).join('')}</select>`:`<input id="field-${f}" name="${f}" ${f==='code'&&(record.code||['items','suppliers'].includes(kind))?'readonly':''} ${kind==='items'&&f==='code'?'placeholder="Tự tạo: Mã NCC-Số thứ tự"':''} type="${['unit_price','vat_percent'].includes(f)?'number':f.startsWith('effective_')?'date':'text'}" ${['unit_price','vat_percent'].includes(f)?'min="0" step="any"':''} value="${e(record[f]??defaults[f]??'')}" ${['code','name','uom','supplier_code','product_code','unit_price','effective_from'].includes(f)&&!(['items','suppliers'].includes(kind)&&f==='code')&&!(kind==='aliases'&&['supplier_code','uom'].includes(f))?'required':''}>`}</div>`).join('')}</div><div id="master-error"></div><button class="btn primary" type="submit">Lưu dữ liệu</button></form>`);
    if(kind==='prices')$('#field-product_code').onchange=()=>{const product=refs[0].rows.find(p=>p.code===$('#field-product_code').value);if(product)$('#field-uom').value=product.uom;};
    $('#master-form').onsubmit=async ev=>{ ev.preventDefault(); const btn=$('button[type=submit]',$('#master-form'));btn.disabled=true; try{await api('/admin/master/'+kind,Object.fromEntries(new FormData(ev.target)));$('#modal').close();await refresh();await masterPage();toast('Đã lưu danh mục');}catch(err){$('#master-error').innerHTML=`<p class="notice error">${e(err.message)}</p>`;}finally{btn.disabled=false;} };
  };
  $('#add-master').onclick=()=>edit(); $('#master-search').oninput=()=>{page=1;update();}; $$('[data-master-kind]').forEach(b=>b.onclick=guarded(async()=>{state.masterKind=b.dataset.masterKind;await masterPage();})); update();
}
async function importPage() {
  shell(`${heading('Trung tâm nhập dữ liệu','Tải file → Ánh xạ cột → Kiểm tra → Xác nhận nhập.')}<section class="panel"><div class="panel-head"><h2>Nhập danh mục Excel / CSV</h2></div><div class="panel-body"><div class="grid-2"><div class="form-group"><label for="import-kind">Loại danh mục</label><select id="import-kind">${Object.entries(masterNames).map(([k,n])=>`<option value="${k}">${n}</option>`).join('')}</select></div><div class="form-group"><label>Tải dữ liệu mẫu có tiêu đề chuẩn</label><a class="btn" id="import-template" href="/api/admin/import-template/items">${icon('download')}Tải file mẫu nhập Excel</a><p class="inline-note">Mẫu Item List tự cấp mã sản phẩm. Mẫu Vendor List có một dòng ví dụ; thay bằng thông tin nhà cung cấp cần nhập.</p></div></div><div class="upload">${icon('upload')}<h3>Chọn dữ liệu cần nhập</h3><p>.xlsx / .csv UTF-8 · Một sheet · Tối đa 20 MB</p><input id="import-file" type="file" accept=".xlsx,.csv" aria-label="Chọn file danh mục"></div><div class="checkbox-row">${button('Đọc file & ánh xạ cột','read-import','search',true)}</div><div id="import-preview"></div></div></section><section class="panel"><div class="panel-head"><h2>Lịch sử nhập</h2></div><div id="import-history"></div></section>`, 'Nhập dữ liệu');
  let file, mapping, current;
  $('#import-kind').onchange=()=>{file=null;$('#import-preview').innerHTML='';$('#import-template').href='/api/admin/master/'+$('#import-kind').value+'/export';};
  $('#import-file').onchange=()=>{file=null;$('#import-preview').innerHTML='';};
  $('#read-import').onclick=guarded(async()=>{file=await readFile($('#import-file').files[0]);current=await api('/admin/master/'+$('#import-kind').value+'/preview',{file});mapping=current.suggested_mapping||Object.fromEntries(current.fields.map(f=>[f,current.headers.includes(f)?f:'']));drawMapping();});
  function drawMapping(){
    $('#import-preview').innerHTML=`<h3 class="checkbox-row">Ánh xạ cột trong file</h3><div class="grid-3">${current.fields.map(f=>`<div class="form-group"><label for="map-${f}">${e(labels[f]||f)} (${f})</label><select id="map-${f}" data-map="${f}"><option value="">Không có / Tự tạo mã kho, vendor</option>${current.headers.map(h=>`<option value="${e(h)}" ${mapping[f]===h?'selected':''}>${e(h)}</option>`).join('')}</select></div>`).join('')}</div>${button('Kiểm tra bản xem trước','validate-import','check')}<div id="import-result"></div>`;
    $$('[data-map]').forEach(s=>s.onchange=()=>{mapping[s.dataset.map]=s.value;$('#import-result').innerHTML='';});
    $('#validate-import').onclick=guarded(async()=>{current=await api('/admin/master/'+$('#import-kind').value+'/preview',{file,mapping});$('#import-result').innerHTML=`<div class="stats checkbox-row">${stat('Tạo mới',current.counts.new,'plus','blue','Bản ghi mới')}${stat('Cập nhật',current.counts.update,'file','','Theo mã hiện có')}${stat('Trùng mã',current.counts.duplicate,'alert','orange','Cần kiểm tra')}${stat('Không hợp lệ',current.counts.invalid,'alert','orange','Cần sửa trước khi nhập')}</div>${current.errors.length?errorsHtml(current.errors):''}<div class="table-wrap"><table><thead><tr><th>Dòng</th><th>Thao tác</th><th>Mã</th><th>Tên / Sản phẩm</th></tr></thead><tbody>${current.rows.slice(0,50).map(r=>`<tr><td>${r.row}</td><td>${e(r.type)}</td><td>${e(r.data.code)}</td><td>${e(r.data.name||r.data.product_code)}</td></tr>`).join('')}</tbody></table></div><p class="inline-note">Hiển thị tối đa 50 dòng đầu. Máy chủ kiểm tra lại toàn bộ khi nhập; nếu bất kỳ dòng nào xung đột, toàn bộ đợt nhập được hoàn tác.</p><button id="commit-import" class="btn primary" ${current.errors.length?'disabled':''}>Xác nhận nhập ${current.rows.length} dòng</button>`;
      $('#commit-import').onclick=guarded(async()=>{if(!await confirmAction('Xác nhận nhập danh mục?','Các mã có sẵn sẽ được cập nhật. Lịch sử trước/sau được lưu trong nhật ký.'))return; await api('/admin/master/'+$('#import-kind').value+'/commit',{file,mapping});await refresh();await importPage();toast('Đã nhập toàn bộ dữ liệu thành công');});
    });
  }
  const batches=await api('/admin/imports');$('#import-history').innerHTML=batches.length?`<div class="table-wrap"><table><thead><tr><th>File</th><th>Danh mục</th><th>Thời gian</th><th>Mới / Cập nhật</th></tr></thead><tbody>${batches.map(b=>`<tr><td>${e(b.filename)}</td><td>${e(masterNames[b.kind])}</td><td>${date(b.created_at)}</td><td>${b.data.new} / ${b.data.update}</td></tr>`).join('')}</tbody></table></div>`:empty('Chưa có đợt nhập dữ liệu');
}
function reportsPage(){
  shell(`${heading('Báo cáo hoạt động','Tổng hợp theo kho, nhà cung cấp, phòng ban và người yêu cầu.')}<section class="panel"><div class="toolbar"><label for="report-from">Từ ngày</label><input id="report-from" type="date"><label for="report-to">Đến ngày</label><input id="report-to" type="date"></div><div class="panel-body" id="report-content"></div></section>`, 'Báo cáo');
  const draw=()=>{const from=$('#report-from').value,to=$('#report-to').value,orders=state.orders.filter(o=>(!from||o.created_at.slice(0,10)>=from)&&(!to||o.created_at.slice(0,10)<=to));const active=orders.filter(o=>o.status!=='CANCELLED');
    const group=(name,groups)=>`<section class="panel"><div class="panel-head"><h2>${name}</h2></div><div class="table-wrap"><table><thead><tr><th>Nhóm</th><th>Số đơn</th><th>Giá trị có giá</th></tr></thead><tbody>${[...groups].map(([k,v])=>`<tr><td>${e(k)}</td><td>${v.count}</td><td>${money(v.total)}</td></tr>`).join('')}</tbody></table></div></section>`;
    const aggregate=fn=>{const m=new Map();active.forEach(o=>{const k=fn(o),v=m.get(k)||{count:0,total:0};v.count++;v.total+=o.total;m.set(k,v);});return m;};
    const suppliers=new Map();active.forEach(o=>{for(const code of new Set(o.items.map(i=>i.supplier_code||'Chưa chọn'))){const v=suppliers.get(code)||{count:0,total:0};v.count++;v.total+=o.items.filter(i=>(i.supplier_code||'Chưa chọn')===code).reduce((s,i)=>{const p=i.snapshot||i.price;if(!p)return s;const b=Math.round(i.quantity*p.unit_price);return s+b+Math.round(b*p.vat_percent/100);},0);suppliers.set(code,v);}});
    const completed=active.filter(o=>o.status==='COMPLETED');const average=completed.length?completed.reduce((s,o)=>s+(Date.parse(o.updated_at)-Date.parse(o.created_at))/86400000,0)/completed.length:0;
    $('#report-content').innerHTML=`<div class="stats">${stat('Tổng yêu cầu',orders.length,'file','blue','Trong kỳ đã chọn')}${stat('Hoàn tất',completed.length,'check','green','Đã hoàn thành')}${stat('Mặt hàng cần xử lý',active.reduce((s,o)=>s+o.items.filter(i=>i.match_status!=='MATCHED').length,0),'alert','orange','Chưa đối chiếu đầy đủ')}<div class="stat"><div class="stat-title">Chu kỳ hoàn tất trung bình</div><div class="stat-number">${average.toFixed(1)}</div><div class="stat-foot">Ngày từ tạo đơn đến hoàn tất</div></div></div><div class="notice">${icon('chart')}<span>Tổng giá trị có giá: <strong>${money(active.reduce((s,o)=>s+o.total,0))}</strong>. Bao gồm VAT, bỏ đơn hủy. Đơn chưa tạo PO dùng giá hiện tại; đơn đã tạo PO dùng giá chốt. Đây chưa phải chi phí kế toán thực tế.</span></div><div class="grid-2">${group('Theo kho',aggregate(o=>o.warehouse.name))}${group('Theo nhà cung cấp',suppliers)}${group('Theo phòng ban',aggregate(o=>o.department||'Chưa khai báo'))}${group('Theo người yêu cầu',aggregate(o=>o.requester.name))}</div>`;
  };$('#report-from').onchange=draw;$('#report-to').onchange=draw;draw();
}
async function historyPage(){const rows=await api('/admin/audit');shell(`${heading('Nhật ký hệ thống','Theo dõi đăng nhập, thay đổi danh mục, giá, đơn hàng và nhập dữ liệu.')}<section class="panel"><div class="panel-head"><h2>300 sự kiện gần nhất</h2></div><div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Người thực hiện</th><th>Hành động</th><th>Chi tiết</th></tr></thead><tbody>${rows.map((r,i)=>`<tr><td>${new Date(r.created_at).toLocaleString('vi-VN')}</td><td>${e(r.user_name)}</td><td>${e(r.action)}</td><td><button class="btn small" data-audit="${i}">Xem dữ liệu</button></td></tr>`).join('')}</tbody></table></div></section>`,'Nhật ký');$$('[data-audit]').forEach(b=>b.onclick=()=>modal('Chi tiết nhật ký',`<pre>${e(JSON.stringify(rows[Number(b.dataset.audit)],null,2))}</pre>`));}
function helpPage() { return ui.helpPage(); }
let renderSequence=0;
async function render(){
  const seq=++renderSequence;
  if(!state.user){login();return;}
  try{
    const r=route();
    if(['/master','/import','/reports','/history','/missing','/accounts','/mail','/setup','/inbox','/submitted','/completed'].includes(r)&&!admin()){go('/dashboard');return;}
    if(r.startsWith('/login')){go('/dashboard');return;}
    if(r==='/dashboard')dashboard();
    else if(r.startsWith('/orders/new'))newOrder();
    else if(r==='/orders')ordersPage();
    else if(['/inbox','/submitted','/completed'].includes(r))procurement.orderBucket(r.slice(1));
    else if(r==='/warehouse-requests')await procurement.warehouseRequests();
    else if(r.startsWith('/orders/'))await orderDetail(r.split('/')[2]);
    else if(r==='/master')await masterPage();
    else if(r==='/import')await importPage();
    else if(r==='/missing')missingPage();
    else if(r==='/reports')reportsPage();
    else if(r==='/activity'){const rows=await api('/activity');shell(`${heading('Nhật ký của tôi','Các hoạt động được lưu theo email đang đăng nhập.')}<section class="panel"><div class="table-wrap"><table><thead><tr><th>Thời gian</th><th>Hoạt động</th></tr></thead><tbody>${rows.map(row=>`<tr><td>${e(new Date(row.created_at).toLocaleString('vi-VN'))}</td><td>${e(({EMAIL_LOGIN:'Truy cập bằng email',LOGOUT:'Đăng xuất',ORDER_CREATED:'Tạo đơn hàng',DRAFT_UPDATED:'Cập nhật bản nháp',ORDER_STATUS:'Thay đổi trạng thái đơn',MANAGER_APPROVED:'Phê duyệt yêu cầu',MANAGER_REJECTED:'Từ chối yêu cầu',MICROSOFT_LOGIN:'Đăng nhập Microsoft'})[row.action]||row.action)}</td></tr>`).join('')}</tbody></table></div></section>`,'Nhật ký của tôi');}
    else if(r==='/history')await historyPage();
    else if(r==='/help')helpPage();
    else if(r==='/accounts')await ui.accountsPage();
    else if(r==='/mail')await ui.mailPage();
    else if(r==='/setup')await ui.setupPage();
    else if(r==='/approvals'||r.startsWith('/approvals/'))go('/orders');
    else go('/dashboard');
  }catch(err){if(seq!==renderSequence)return;if(err.status===401){state.user=null;login();}else shell(`${heading('Không thể tải nội dung',err.message)}<a class="btn" href="#/dashboard">Về tổng quan</a>`,'Thông báo');}
}
window.addEventListener('hashchange',()=>{state.detailTab='items';render();});
window.addEventListener('focus',()=>{if(state.user) refresh().catch(()=>{});});
const procurement=procurementUI({$,$$,e,api,state,admin,modal,guarded,toast,refresh,render,shell,heading,orderTable,badge,money,go,confirmAction});
const ui=createUI({ $, $$, e, icon, api, guarded, state, admin, route, go, heading, button, badge, empty, stat, orderTable, itemsTable, modal, confirmAction, toast, date, money, refresh, render, resolveDialog });
try{state.user=await api('/me');if(state.user){await refresh();await render();}else login();}catch{login();}
