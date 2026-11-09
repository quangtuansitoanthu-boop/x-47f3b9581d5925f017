import fs from 'node:fs';
const idx = Number(process.argv[2]);
const src = JSON.parse(fs.readFileSync('static/offline-data/chapters/book_e91ef5336221b1c48dde6341bf423bef.json','utf8'));
const c = src[idx];
let out = '=== TITLE: ' + c.tieu_de + '\n=== SUMMARY:\n' + (c.tom_tat||'') + '\n=== BODY:\n' + c.noi_dung;
fs.writeFileSync('scripts/i18n/work/ch' + String(idx).padStart(2,'0') + '.txt', out);
console.log('wrote ch' + idx + ' title=' + c.tieu_de);
