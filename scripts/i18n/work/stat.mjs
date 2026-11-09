import fs from 'node:fs';
const src = JSON.parse(fs.readFileSync('static/offline-data/chapters/book_e91ef5336221b1c48dde6341bf423bef.json','utf8'));
const en = JSON.parse(fs.readFileSync('static/offline-data/chapters-en/book_e91ef5336221b1c48dde6341bf423bef.json','utf8'));
console.log('src_n=' + src.length);
console.log('en_n=' + en.length);
console.log('src_ids=' + JSON.stringify(src.map(c=>c.id)));
console.log('en_ids=' + JSON.stringify(en.map(c=>c.id)));
console.log('lens=' + JSON.stringify(src.map(c=>[c.so_thu_tu, c.tieu_de, c.noi_dung.length, (c.tom_tat||'').length])));
