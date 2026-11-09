import fs from 'fs';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_klngl_q09.json','utf8'));
const en = JSON.parse(fs.readFileSync('static/offline-data/chapters-en/tt_klngl_q09.json','utf8'));
console.log('VI len:', vi.length, 'EN len:', en.length);
vi.forEach((c,i) => console.log(i, c.id, c.so_thu_tu, JSON.stringify(c.tieu_de), 'tomtat:', (c.tom_tat||'').length, 'noidung:', (c.noi_dung||'').length));
console.log('---EN---');
en.forEach((c,i) => console.log(i, c.id, c.so_thu_tu, JSON.stringify(c.tieu_de), 'tomtat:', (c.tom_tat||'').length, 'noidung:', (c.noi_dung||'').length));
