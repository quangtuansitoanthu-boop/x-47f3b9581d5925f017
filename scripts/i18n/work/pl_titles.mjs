import fs from 'fs';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/book_a120238d492a12a35e72446e40b1a94f.json','utf8'));
for (const c of vi) console.log('=== ' + c.so_thu_tu + ' | ' + c.tieu_de + ' | TOMTAT: ' + (c.tom_tat||'').slice(0,300));
