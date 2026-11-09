import fs from 'fs';
const enPath = 'static/offline-data/chapters-en/book_a120238d492a12a35e72446e40b1a94f.json';
const viPath = 'static/offline-data/chapters/book_a120238d492a12a35e72446e40b1a94f.json';
const en = JSON.parse(fs.readFileSync(enPath,'utf8'));
const vi = JSON.parse(fs.readFileSync(viPath,'utf8'));
console.log('count', en.length);
let ok = true;
for (let k=0;k<en.length;k++){
  if (en[k].id!==vi[k].id||en[k].bai_viet_id!==vi[k].bai_viet_id||en[k].so_thu_tu!==vi[k].so_thu_tu){ ok=false; console.log('KEY MISMATCH',k); }
}
console.log('keys match:', ok);
// tag check: compare tag sequences
function tags(s){ return (s.match(/<[^>]+>/g)||[]).join('|'); }
for (let k=0;k<en.length;k++){
  if (tags(en[k].noi_dung)!==tags(vi[k].noi_dung)) console.log('TAG DIFF at', k, en[k].so_thu_tu);
}
console.log('tag check done');
// Vietnamese diacritics leftover scan
const vietRe = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđÀÁẠẢÃÂẦẤẬẨẪĂẰẮẶẲẴÈÉẸẺẼÊỀẾỆỂỄÌÍỊỈĨÒÓỌỎÕÔỒỐỘỔỖƠỜỚỢỞỠÙÚỤỦŨƯỪỨỰỬỮỲÝỴỶỸĐ]/;
for (const c of en) {
  for (const f of ['tieu_de','tom_tat','noi_dung']) {
    if (vietRe.test(c[f]||'')) {
      const idx = (c[f].search(vietRe));
      console.log('VI-LEFTOVER ch', c.so_thu_tu, f, JSON.stringify((c[f]||'').slice(Math.max(0,idx-40),idx+40)));
      break;
    }
  }
}
console.log('vi scan done');
// samples
for (const i of [1, 21]) {
  const c = en.find(x=>x.so_thu_tu===i);
  console.log('--- SAMPLE', i, c.tieu_de, '|', (c.tom_tat||'').slice(0,120));
  console.log((c.noi_dung||'').slice(0,400));
}
