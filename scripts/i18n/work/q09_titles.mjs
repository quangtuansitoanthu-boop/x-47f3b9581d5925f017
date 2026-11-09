import fs from 'fs';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_klngl_q09.json','utf8'));
for (let i = 1; i < 5; i++) {
  fs.writeFileSync(`scripts/i18n/work/q09_ch${i}_title.txt`, vi[i].tieu_de + '\n---TOMTAT---\n' + vi[i].tom_tat);
}
console.log('done');
