import fs from 'fs';
const p = 'scripts/i18n/work/jr077_en/batch_50.mjs';
let s = fs.readFileSync(p,'utf8');
s = s.replaceAll('This怨气 seemed to take shape','This resentful aura seemed to take shape')
 .replaceAll("the girl's cold怨气 still seemed","the girl's cold, resentful aura still seemed");
const m = s.match(/[\u4e00-\u9fff]/g);
console.log('remaining CJK:', m ? [...new Set(m)] : 'none');
fs.writeFileSync(p,s);
