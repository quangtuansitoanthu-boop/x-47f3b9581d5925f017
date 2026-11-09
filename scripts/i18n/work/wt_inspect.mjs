import fs from 'fs';
const en=JSON.parse(fs.readFileSync('static/offline-data/chapters-en/tt_1781081525279_1_t5eqk.json','utf8'));
console.log(JSON.stringify(en[0].noi_dung.slice(0,300)));
console.log('---CH1---');
console.log(JSON.stringify(en[1].noi_dung.slice(0,300)));
console.log('align0=' + en[0].noi_dung.includes('{align'));
console.log('align1=' + en[1].noi_dung.includes('{align'));
