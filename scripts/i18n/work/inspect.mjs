import fs from 'fs';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/book_c35b7e41c07303b630514153c39caa12.json','utf8'));
console.log('VI count:', vi.length);
vi.forEach((c,i)=> console.log(i, c.id, c.so_thu_tu, (c.tieu_de||'').slice(0,60), 'tomtat_len='+(c.tom_tat||'').length, 'noidung_len='+(c.noi_dung||'').length));
const raw = fs.readFileSync('static/offline-data/chapters-en/book_c35b7e41c07303b630514153c39caa12.json','utf8');
console.log('EN raw starts with:', JSON.stringify(raw.slice(0,100)));
console.log('EN indent check: second char is', JSON.stringify(raw.slice(0,5)));
try { const en = JSON.parse(raw); console.log('EN count:', en.length); en.forEach((c,i)=> console.log(i, c.id, c.so_thu_tu, (c.tieu_de||'').slice(0,60))); } catch(e){ console.log('EN parse err', e.message); }
