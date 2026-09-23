import test from 'node:test';import assert from 'node:assert/strict';import ExcelJS from 'exceljs';import {fillUpdatedPO} from '../lib/po-updated.js';
test('Updated PO keeps headings and merged notes, maps fields and calculates VAT for 1/5/8 items',async()=>{
 for(const count of [1,5,8]){
  const wb=new ExcelJS.Workbook();await wb.xlsx.readFile(new URL('../../FORM PO.xlsx',import.meta.url));const s=wb.getWorksheet('FORM PO');
  const order={number:'PO-TEST-21.09.2026-001',po_date:'21.09.2026',warehouse:{name:'Receiving'},address:'Address',department:'Department',requester:{name:'Requester'},confirmed_by:'Admin'};
  const items=Array.from({length:count},()=>({original_item_name:'Item',uom:'Cuộn',quantity:2,snapshot:{unit_price:100000,vat_percent:8}}));
  fillUpdatedPO(wb,s,order,{name:'Vendor',phone:'123',email:'test@example.com'},items);
  const result=new ExcelJS.Workbook();await result.xlsx.load(await wb.xlsx.writeBuffer());const out=result.getWorksheet('FORM PO'),extra=Math.max(0,count-5);
  assert.equal(out.getCell('A4').text.trim(),'1.  GENERAL INFORMATION');assert.equal(out.getCell('B5').text,order.number);assert.equal(out.getCell('F5').text,order.po_date);assert.equal(out.getCell('B6').text,'Vendor');assert.equal(out.getCell('E9').text,'Address');assert.equal(out.getCell('F19').value,.08);assert.equal(out.getCell('G19').result,216000);assert.equal(out.getCell('G'+(24+extra)).result,count*216000);assert.ok(out.model.merges.includes(`A${28+extra}:H${28+extra}`));assert.equal(out.getCell('A'+(32+extra)).text,'Requester');assert.equal(out.getCell('E'+(32+extra)).text,'Admin');
 }
});
