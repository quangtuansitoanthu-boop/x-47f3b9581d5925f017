import fs from 'fs';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_1781224543804_1_jr077.json','utf8'));
console.log('VI count:', vi.length);
vi.forEach((c,i)=> console.log(i, 'id='+c.id, 'stt='+c.so_thu_tu, '| TI:'+(c.tieu_de||'').slice(0,80), '| TT_len='+(c.tom_tat||'').length, '| ND_len='+(c.noi_dung||'').length));
const raw = fs.readFileSync('static/offline-data/chapters/tt_1781224543804_1_jr077.json','utf8');
console.log('indent sample:', JSON.stringify(raw.slice(0,60)));
