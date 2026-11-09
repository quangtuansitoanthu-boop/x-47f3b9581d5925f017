import fs from 'fs';
const EN = 'static/offline-data/chapters-en/book_c35b7e41c07303b630514153c39caa12.json';
let raw = fs.readFileSync(EN,'utf8');
for (const [a,b] of [['Bất Thuấn','Bat Thuan'],['Vương Chúng','Vuong Chung'],['Vẫn Đồ','Van Do']]) raw = raw.split(a).join(b);
fs.writeFileSync(EN, raw);
const en = JSON.parse(raw);
console.log('fixed, count=', en.length);
