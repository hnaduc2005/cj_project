import ExcelJS from 'exceljs';
for(const name of ['Items list.xlsx','FORM PO.xlsx','WH List.xlsx']){
 const wb=new ExcelJS.Workbook();await wb.xlsx.readFile('D:/ThuCNU/CODE/'+name);
 console.log(name,wb.worksheets.map(s=>({name:s.name,rows:s.rowCount,columns:s.columnCount})));
 const s=wb.worksheets[0];s.eachRow((r,i)=>{if(i<=(name==='FORM PO.xlsx'?35:7))console.log(i,JSON.stringify(r.values));});
 if(name==='FORM PO.xlsx')console.log('merges',s.model.merges);
}
