import fs from 'fs';
let p='scripts/i18n/work/ch178_00_en_p06.txt';
let t=fs.readFileSync(p,'utf8');
t=t.replace(/结成/g,'knotted into');
fs.writeFileSync(p,t,'utf8');
// scan all en files for CJK
import path from 'path';
const files=fs.readdirSync('scripts/i18n/work').filter(f=>/_en/.test(f));
for(const f of files){
  const c=fs.readFileSync('scripts/i18n/work/'+f,'utf8');
  const m=c.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g);
  if(m) console.log(f, 'HAS CJK:', JSON.stringify([...new Set(m)].slice(0,10)));
}
console.log('scan done');
