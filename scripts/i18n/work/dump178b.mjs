import fs from 'fs';
const vi=JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_1781224598651_2_i3l0j.json','utf8'));
vi.forEach((c,i)=>{
  console.log('CH'+i+' tom_tat='+JSON.stringify(c.tom_tat));
});
