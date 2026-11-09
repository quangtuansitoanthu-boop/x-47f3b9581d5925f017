import fs from 'node:fs';
const raw = fs.readFileSync('static/offline-data/chapters-en/book_e91ef5336221b1c48dde6341bf423bef.json','utf8');
console.log('len=' + raw.length);
console.log('head=' + JSON.stringify(raw.slice(0,60)));
console.log('tail=' + JSON.stringify(raw.slice(-60)));
console.log('CRLF=' + raw.includes('\r'));
const en = JSON.parse(raw);
console.log('keys=' + JSON.stringify(Object.keys(en[0])));
console.log('roundtrip_same=' + (JSON.stringify(en, null, 2) === raw || JSON.stringify(en, null, 2) + '\n' === raw));
