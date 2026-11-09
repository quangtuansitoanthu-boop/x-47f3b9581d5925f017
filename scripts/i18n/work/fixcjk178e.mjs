import fs from 'fs';
const p='scripts/i18n/work/ch178_00_en_p10.txt';
let t=fs.readFileSync(p,'utf8');
t=t.split('luckily driver and I平安').join('luckily driver and I were safe and sound');
fs.writeFileSync(p,t,'utf8');
const m=t.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g);
console.log(m?('STILL:'+JSON.stringify([...new Set(m)])):'clean');
