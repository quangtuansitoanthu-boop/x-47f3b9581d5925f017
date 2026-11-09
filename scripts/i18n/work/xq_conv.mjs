import fs from 'fs';
const raw = fs.readFileSync('static/offline-data/chapters-en/tt_1781081372340_1_xqcxo.json','utf8');
const en = JSON.parse(raw);
const count = (re) => (raw.match(re)||[]).length;
console.log('Yama:', count(/Yama/g), '| Diem:', count(/Diem/gi), '| Diêm Đài:', count(/Diêm Đài/g));
console.log('Tien Ong:', count(/Tien Ong/g), '| Tien Ông:', count(/Tiên Ông/g));
console.log('Ksitigarbha:', count(/Ksitigarbha/g), '| Avalokiteshvara:', count(/Avalokiteshvara/g));
console.log('Mirror:', count(/Mirror/g));
console.log('Impermanence:', count(/Black and White|Black White|Vô Thường|Vô Thuờng/g));
console.log('tomtat42:', JSON.stringify(en[42].tom_tat));
// check mirror phrase contexts
const lines = raw.split('\n');
lines.forEach((l,i)=>{ if (/Mirror/i.test(l)) console.log(i+1, l.slice(0,200)); });
// check Tiên Ông contexts
lines.forEach((l,i)=>{ if (/Tien Ong|Tiên Ông/i.test(l)) console.log('TiênÔng@'+(i+1), l.slice(0,150)); });
// check mantras in ch50
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_1781081372340_1_xqcxo.json','utf8'));
console.log('--- VI ch50 tail structure ---');
const vparas = vi[50].noi_dung.split('\n');
console.log('VI ch50 paras:', vparas.length, 'EN ch50 paras:', en[50].noi_dung.split('\n').length);
vparas.forEach((p,idx)=>{ if (p.length<120) console.log(`V[${idx}]: ${p.slice(0,120)}`); });
