import fs from 'fs';
const idx = process.argv[2];
const nChunks = parseInt(process.argv[3]);
let body = '';
for (let i = 0; i < nChunks; i++) {
  body += fs.readFileSync(`scripts/i18n/work/q09_en_ch${idx}_c${i}.txt`, 'utf8');
}
// Rejoin: chunk files start with blank line continuation; normalize leading newline of first chunk
body = body.replace(/^\n/, '');
const path = 'static/offline-data/chapters-en/tt_klngl_q09.json';
const en = JSON.parse(fs.readFileSync(path, 'utf8'));
en[parseInt(idx)].noi_dung = body;
fs.writeFileSync(path, JSON.stringify(en, null, 2), 'utf8');
console.log('saved ch' + idx, 'chars:', body.length);
