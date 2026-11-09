import fs from 'node:fs';
const idx = Number(process.argv[2]);
const EN = 'static/offline-data/chapters-en/book_e91ef5336221b1c48dde6341bf423bef.json';
const tr = JSON.parse(fs.readFileSync('scripts/i18n/work/tr' + String(idx).padStart(2,'0') + '.json','utf8'));
const en = JSON.parse(fs.readFileSync(EN,'utf8'));
if (en[idx].so_thu_tu !== idx) { console.error('INDEX MISMATCH'); process.exit(1); }
en[idx].tieu_de = tr.tieu_de;
en[idx].tom_tat = tr.tom_tat;
en[idx].noi_dung = tr.noi_dung;
fs.writeFileSync(EN, JSON.stringify(en, null, 2));
console.log('applied ch' + idx + ' id=' + en[idx].id + ' title=' + tr.tieu_de.slice(0,60));
