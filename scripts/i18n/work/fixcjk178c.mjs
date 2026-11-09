import fs from 'fs';
const reps=[
 ["never leaving her departing不明, wronged so!","never leaving her departing in obscurity, so wronged!"],
 ["lived most得势—freely enjoying pleasures, peaceful","thrived in power—freely enjoying pleasures, in peace"],
 ["my brother, eyes泪… had to slink","my brother, eyes brimmed with tears… had to slink"],
];
for(const [a,b] of reps){
  const p='scripts/i18n/work/ch178_00_en_p09.txt';
  let t=fs.readFileSync(p,'utf8');
  if(t.includes(a)){ t=t.split(a).join(b); fs.writeFileSync(p,t,'utf8'); console.log('fixed',JSON.stringify(a)); }
}
const c=fs.readFileSync('scripts/i18n/work/ch178_00_en_p09.txt','utf8');
const m=c.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g);
console.log(m?('STILL HAS CJK:'+JSON.stringify(m)):'clean');
