import fs from 'fs';
const en=JSON.parse(fs.readFileSync('static/offline-data/chapters-en/tt_1781224598651_2_i3l0j.json','utf8'));
console.log('SAMPLE 1 [ch0] title:', en[0].tieu_de);
console.log(en[0].noi_dung.slice(0,700));
console.log('\nSAMPLE 2 [ch10] title:', en[10].tieu_de);
console.log(en[10].noi_dung.slice(0,700));
