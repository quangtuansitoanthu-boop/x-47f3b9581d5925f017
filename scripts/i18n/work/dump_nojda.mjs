import fs from 'node:fs';
const idx = Number(process.argv[2]);
const src = 'static/offline-data/chapters/tt_1781223481607_3_nojda.json';
const d = JSON.parse(fs.readFileSync(src, 'utf8'));
const c = d[idx];
if (!c) { console.error('no chapter ' + idx); process.exit(1); }
console.log('ID=' + c.id + ' STT=' + c.so_thu_tu + ' TITLE=' + c.tieu_de);
console.log('---TOMTAT---');
console.log(c.tom_tat);
console.log('---NOIDUNG---');
console.log(c.noi_dung);
