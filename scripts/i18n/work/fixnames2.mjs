import fs from 'fs';
const EN = 'static/offline-data/chapters-en/book_c35b7e41c07303b630514153c39caa12.json';
let raw = fs.readFileSync(EN,'utf8');
for (const [a,b] of [['Đa La','Da La'],['Phạm Đức','Pham Duc']]) raw = raw.split(a).join(b);
fs.writeFileSync(EN, raw);
JSON.parse(raw);
console.log('fixed2 ok');
