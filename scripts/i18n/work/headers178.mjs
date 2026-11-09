import fs from 'fs';
for(const n of ['11','16','17']){
 const t=fs.readFileSync(`scripts/i18n/work/ch178_${n}_vi.txt`,'utf8').split('\n');
 console.log('=== CH'+n+' total lines '+t.length+' ===');
 // print lines that look like headers (short, uppercase)
 t.forEach((l,i)=>{ const inner=l.replace(/^\{align:[a-z]+\|/,'').replace(/\}$/,''); if(inner.length<90 && (/^[A-ZÀ-Ỹ0-9\.\s\-–:()“”"]+$/.test(inner) || /^(LỜI|PHẦN|CHUYỆN|MỤC|CHÚ|HỒI|PHỤ)/.test(inner))) console.log(i+': '+inner.slice(0,90)); });
 console.log('');
}
