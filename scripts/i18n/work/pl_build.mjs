import fs from 'fs';
const enPath = 'static/offline-data/chapters-en/book_a120238d492a12a35e72446e40b1a94f.json';
const viPath = 'static/offline-data/chapters/book_a120238d492a12a35e72446e40b1a94f.json';
const en = JSON.parse(fs.readFileSync(enPath,'utf8'));
const vi = JSON.parse(fs.readFileSync(viPath,'utf8'));
function parseTitle(i){
  const raw = fs.readFileSync(`scripts/i18n/work/pl_en_${i}_title.txt`,'utf8');
  const parts = raw.split('---TOMTAT---');
  return { t: (parts[0]||'').trim(), s: (parts[1]||'').trim() };
}
for (const c of en) {
  const i = c.so_thu_tu;
  const html = fs.readFileSync(`scripts/i18n/work/pl_en_${i}.html`,'utf8');
  const { t, s } = parseTitle(i);
  c.tieu_de = t;
  c.tom_tat = s;
  c.noi_dung = html;
}
// verify ids/order unchanged vs VI
if (en.length !== vi.length) throw new Error('length mismatch '+en.length+' vs '+vi.length);
for (let k=0;k<en.length;k++){
  if (en[k].id !== vi[k].id || en[k].bai_viet_id !== vi[k].bai_viet_id || en[k].so_thu_tu !== vi[k].so_thu_tu) throw new Error('key mismatch at '+k);
}
// preserve original indent: detect
const rawEn = fs.readFileSync(enPath,'utf8');
const indent = rawEn.includes('\n  ') ? 2 : 0;
fs.writeFileSync(enPath, JSON.stringify(en, null, indent));
console.log('saved', en.length, 'indent', indent);
