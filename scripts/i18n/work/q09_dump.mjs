import fs from 'fs';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_klngl_q09.json','utf8'));
const idx = parseInt(process.argv[2] || '0');
const c = vi[idx];
fs.writeFileSync(`scripts/i18n/work/q09_ch${idx}_title.txt`, (c.tieu_de||'') + '\n---TOMTAT---\n' + (c.tom_tat||''));
fs.writeFileSync(`scripts/i18n/work/q09_ch${idx}_body.txt`, c.noi_dung||'');
console.log('wrote ch', idx, 'body chars:', (c.noi_dung||'').length);
