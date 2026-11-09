import fs from 'fs';
const P = 'static/offline-data/chapters-en/tt_1781081372340_1_xqcxo.json';
const raw = fs.readFileSync(P,'utf8');
console.log('has unicode escapes:', /\\u[0-9a-fA-F]{4}/.test(raw));
console.log('trailing newline:', JSON.stringify(raw.slice(-20)));
console.log('indent sample:', JSON.stringify(raw.slice(0,60)));
const en = JSON.parse(raw);
console.log('idx48 title:', en[48].tieu_de, '| idx49 title:', en[49].tieu_de);
console.log('idx42 tomtat exact:', JSON.stringify(en[42].tom_tat));
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_1781081372340_1_xqcxo.json','utf8'));
console.log('VI42 tomtat exact:', JSON.stringify(vi[42].tom_tat));
console.log('VI42 tomtat len:', vi[42].tom_tat.length);
console.log('VI45 tomtat exact:', JSON.stringify(vi[45].tom_tat).slice(0,250));
console.log('EN45 tomtat exact:', JSON.stringify(en[45].tom_tat).slice(0,250));
// ch50 story VI lines around madam
const v50 = vi[50].noi_dung.split('\n');
v50.slice(0,20).forEach((p,i)=>console.log(`V50[${i}]: ${p.slice(0,130)}`));
