import fs from 'fs';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_klngl_q06.json','utf8'));
console.log('VI count:', vi.length);
vi.forEach((c,i)=> console.log(i, c.id, c.so_thu_tu, (c.tieu_de||'').slice(0,80), 'tomtat_len='+(c.tom_tat||'').length, 'noidung_len='+(c.noi_dung||'').length));
// dump plain text versions for translation reading
vi.forEach((c,i)=>{
  fs.writeFileSync(`scripts/i18n/work/q06_vi_${i}.html`, c.noi_dung||'', 'utf8');
  fs.writeFileSync(`scripts/i18n/work/q06_vi_${i}_tomtat.txt`, (c.tieu_de||'')+'\n---\n'+(c.tom_tat||''), 'utf8');
});
const raw = fs.readFileSync('static/offline-data/chapters-en/tt_klngl_q06.json','utf8');
console.log('EN raw starts with:', JSON.stringify(raw.slice(0,80)));
try { const en = JSON.parse(raw); console.log('EN count:', en.length); en.forEach((c,i)=> console.log(i, c.id, c.so_thu_tu, (c.tieu_de||'').slice(0,80), 'noidung_len='+(c.noi_dung||'').length)); } catch(e){ console.log('EN parse err', e.message); }
