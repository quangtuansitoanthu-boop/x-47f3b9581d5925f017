import fs from 'fs';
const p = 'scripts/i18n/work/jr077_en/batch_44_46.mjs';
let s = fs.readFileSync(p,'utf8');
s = s.replaceAll('结ing hatreds','forming hatreds')
 .replaceAll('结ing today','forming today')
 .replaceAll('karma报复 without cease','karma requiting wrong with wrong without cease')
 .replaceAll('the unloosened结 plays on','the unloosened knot plays on');
const m = s.match(/[\u4e00-\u9fff]/g);
console.log('remaining CJK:', m ? [...new Set(m)] : 'none');
fs.writeFileSync(p,s);
