import fs from 'fs';
const enPath = 'static/offline-data/chapters-en/tt_1781224543804_1_jr077.json';
const viPath = 'static/offline-data/chapters/tt_1781224543804_1_jr077.json';
const raw = fs.readFileSync(enPath,'utf8');
const en = JSON.parse(raw);
const vi = JSON.parse(fs.readFileSync(viPath,'utf8'));
console.log('EN parses OK; count =', en.length, '; VI count =', vi.length);
let idOk = true;
en.forEach((c,i)=>{
  if (c.id !== vi[i].id || c.so_thu_tu !== vi[i].so_thu_tu || c.bai_viet_id !== vi[i].bai_viet_id) { idOk = false; console.log('MISMATCH at', i); }
});
console.log('id/order/bai_viet_id match:', idOk);
// align wrapper counts
let alignOk = true;
en.forEach((c,i)=>{
  const a = (vi[i].noi_dung.match(/\{align:/g)||[]).length, b = (c.noi_dung.match(/\{align:/g)||[]).length;
  if (a !== b) { alignOk = false; console.log('ALIGN mismatch at', i, a, b); }
});
console.log('align wrappers match:', alignOk);
// CJK scan
const cjk = raw.match(/[\u4e00-\u9fff]/g);
console.log('CJK chars in EN file:', cjk ? [...new Set(cjk)].join(' ') : 'none');
// Vietnamese diacritics scan (allowlist check: report lines)
const lines = raw.split('\n');
const viRe = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
let viCount = 0;
lines.forEach((ln,li)=>{
  if (viRe.test(ln)) { viCount++; if (viCount <= 25) console.log('VI?', (li+1), ln.slice(0,140)); }
});
console.log('lines with VI diacritics:', viCount);
// empty-field check
let empty = 0;
en.forEach((c,i)=>{ if(!c.tieu_de || !c.tom_tat || !c.noi_dung) { empty++; console.log('EMPTY at', i); } });
console.log('empty fields:', empty);
console.log('--- SAMPLE ch0 ---');
console.log('TI:', en[0].tieu_de);
console.log('TT:', en[0].tom_tat);
console.log('ND head:', en[0].noi_dung.slice(0,400));
console.log('--- SAMPLE ch50 ---');
console.log('TI:', en[50].tieu_de);
console.log('TT:', en[50].tom_tat);
console.log('ND head:', en[50].noi_dung.slice(0,400));
