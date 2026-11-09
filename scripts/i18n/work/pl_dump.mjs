import fs from 'fs';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/book_a120238d492a12a35e72446e40b1a94f.json','utf8'));
for (const c of vi) {
  fs.writeFileSync(`scripts/i18n/work/pl_vi_${c.so_thu_tu}.html`, c.noi_dung ?? '');
  fs.writeFileSync(`scripts/i18n/work/pl_vi_${c.so_thu_tu}_title.txt`, (c.tieu_de ?? '') + '\n---TOMTAT---\n' + (c.tom_tat ?? ''));
  console.log(c.so_thu_tu, c.id, (c.tieu_de||'').slice(0,60), (c.noi_dung||'').length);
}
