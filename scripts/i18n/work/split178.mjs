import fs from 'fs';
const vi=JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_1781224598651_2_i3l0j.json','utf8'));
vi.forEach((c,i)=>{
  fs.writeFileSync(`scripts/i18n/work/ch178_${String(i).padStart(2,'0')}_vi.txt`, `TITLE: ${c.tieu_de}\nTOMTAT: ${c.tom_tat}\n-----\n${c.noi_dung}`, 'utf8');
  const paras=(c.noi_dung||'').split('\n').length;
  console.log(i, 'paras='+paras, 'chars='+(c.noi_dung||'').length);
});
