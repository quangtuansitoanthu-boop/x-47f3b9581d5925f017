import fs from 'fs';
const reps=[
 ["vowing quitting meaty foods彻底","vowing quitting meaty foods utterly"],
 ["I rose donning the tràng áo","I rose donning my ceremonial robe"],
 ["fruits结—whether","fruits—whether"],
 ["then结 kin结 enmities","then forging kinships, forging enmities"],
 ["we are sinking and浮 in six realms","we are sinking and floating in the six realms"],
 ["nets cast most密, subtle","nets cast most dense and subtle"],
];
for(const [a,b] of reps){
  for(const f of ['ch178_00_en_p08.txt','ch178_00_en_p07.txt']){
    const p='scripts/i18n/work/'+f;
    let t=fs.readFileSync(p,'utf8');
    if(t.includes(a)){ t=t.split(a).join(b); fs.writeFileSync(p,t,'utf8'); console.log('fixed',f,JSON.stringify(a)); }
  }
}
// scan all 178 en files for CJK again
const files=fs.readdirSync('scripts/i18n/work').filter(f=>f.includes('178')&&f.includes('_en'));
for(const f of files){
  const fp='scripts/i18n/work/'+f;
  if(!fs.statSync(fp).isFile()) continue;
  const c=fs.readFileSync(fp,'utf8');
  const m=c.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g);
  if(m) console.log(f, 'HAS CJK:', JSON.stringify([...new Set(m)].slice(0,10)));
}
console.log('done');
