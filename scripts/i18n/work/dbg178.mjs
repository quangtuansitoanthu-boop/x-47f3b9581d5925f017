import fs from 'fs';
for(const f of ['ch178_16_en_p1.txt','ch178_16_en_p2.txt','ch178_16_en_p3.txt']){
  const t=fs.readFileSync('scripts/i18n/work/'+f,'utf8').trim();
  console.log(f, 'lines='+t.split('\n').length, 'align='+(t.match(/\{align:/g)||[]).length);
}
// check VI ranges
const vi=fs.readFileSync('scripts/i18n/work/ch178_16_vi.txt','utf8').split('\n');
// find ----- line
console.log('line3:', JSON.stringify(vi[3]), 'line4:', JSON.stringify(vi[4]).slice(0,60));
const body=vi.slice(5); // content starts after TITLE,TOMTAT-multiline?,-----?
console.log('total lines', vi.length);
// TOMTAT spans lines 1..? find -----
const di=vi.indexOf('-----');
console.log('dash at', di, 'body paras=', vi.length-1-di);
