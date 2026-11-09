import fs from 'fs';
const raw=fs.readFileSync('static/offline-data/chapters-en/tt_1781224598651_2_i3l0j.json','utf8');
for(const ch of ['ô','Â','é']){
  let i=-1, n=0;
  while((i=raw.indexOf(ch,i+1))>=0 && n<6){ console.log(JSON.stringify(ch), '=>', JSON.stringify(raw.slice(Math.max(0,i-80),i+80))); n++; }
}
