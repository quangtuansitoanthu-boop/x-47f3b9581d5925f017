import fs from 'fs';
let p='scripts/i18n/work/ch178_00_en_p06.txt';
let t=fs.readFileSync(p,'utf8');
t=t.replace(/结成/g,'knotted into');
fs.writeFileSync(p,t,'utf8');
const files=fs.readdirSync('scripts/i18n/work').filter(f=>/_en/.test(f)&&f.includes('178'));
for(const f of files){
  const fp='scripts/i18n/work/'+f;
  if(!fs.statSync(fp).isFile()) continue;
  const c=fs.readFileSync(fp,'utf8');
  const m=c.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g);
  if(m) console.log(f, 'HAS CJK:', JSON.stringify([...new Set(m)].slice(0,10)));
}
console.log('scan done');
