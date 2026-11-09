import fs from 'fs';
import path from 'path';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_1781224543804_1_jr077.json','utf8'));
const dir = 'scripts/i18n/work/jr077_vi';
fs.mkdirSync(dir, {recursive:true});
vi.forEach((c,i)=>{
  const txt = 'ID='+c.id+' STT='+c.so_thu_tu+'\nTIEU_DE: '+c.tieu_de+'\nTOM_TAT: '+c.tom_tat+'\nNOI_DUNG:\n'+c.noi_dung;
  fs.writeFileSync(path.join(dir, String(i).padStart(2,'0')+'.txt'), txt);
});
console.log('wrote', vi.length, 'files');
