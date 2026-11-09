import fs from 'node:fs';
const t = JSON.parse(fs.readFileSync('static/offline-data/chapters-en/tt_1781223481607_3_nojda.json', 'utf8'));
for (const i of [0, 24]) {
  console.log('===== SAMPLE idx=' + i + ' id=' + t[i].id + ' =====');
  console.log('TITLE: ' + t[i].tieu_de);
  console.log('SUMMARY: ' + t[i].tom_tat);
  console.log('BODY-HEAD: ' + t[i].noi_dung.slice(0, 600));
  console.log('');
}
