import fs from 'fs';
const en = JSON.parse(fs.readFileSync('static/offline-data/chapters-en/tt_1781224543804_1_jr077.json','utf8'));
console.log('EN count:', en.length);
en.slice(0,3).forEach((c,i)=> console.log('---',i,'id='+c.id,'stt='+c.so_thu_tu,'\nTI:'+c.tieu_de+'\nTT:'+c.tom_tat+'\nND head:'+(c.noi_dung||'').slice(0,300)));
const raw = fs.readFileSync('static/offline-data/chapters-en/tt_1781224543804_1_jr077.json','utf8');
console.log('EN raw head:', JSON.stringify(raw.slice(0,80)));
