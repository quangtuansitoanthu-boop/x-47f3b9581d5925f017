import fs from 'fs';
const ID='tt_1781081525279_1_t5eqk';
const vi=JSON.parse(fs.readFileSync(`static/offline-data/chapters/${ID}.json`,'utf8'));
vi.forEach((c,i)=>{
  fs.writeFileSync(`scripts/i18n/work/wt_${String(i).padStart(2,'0')}_vi.txt`, `TITLE: ${c.tieu_de}\nTOMTAT: ${c.tom_tat}\n-----\n${c.noi_dung}`, 'utf8');
});
console.log('dumped '+vi.length);
