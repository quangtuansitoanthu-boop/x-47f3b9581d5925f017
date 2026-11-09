import fs from 'fs';
const reps=[
 ["gentle品行—strictly","gentle conduct—strictly"],
 ["I kính beg all","I earnestly beg you all"],
 ["mountain mud and rocks流 down","mountain mud and rocks streaming down"],
 ["luckily driver and I平安—then","luckily driver and I平安—then"], // placeholder
 ["studies and品行 shall ascend","studies and conduct shall ascend"],
 ["gathering all fine teachers—品行 tư cách most high","gathering all fine teachers—conduct and character most noble"],
];
const p='scripts/i18n/work/ch178_00_en_p10.txt';
let t=fs.readFileSync(p,'utf8');
for(const [a,b] of reps){ if(t.includes(a)){ t=t.split(a).join(b); console.log('fixed',JSON.stringify(a)); } }
fs.writeFileSync(p,t,'utf8');
const m=t.match(/[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]+/g);
console.log(m?('STILL HAS CJK:'+JSON.stringify([...new Set(m)])):'clean');
