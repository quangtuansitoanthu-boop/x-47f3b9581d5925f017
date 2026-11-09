import fs from 'fs';
const VI = 'static/offline-data/chapters/tt_1781081372340_1_xqcxo.json';
const EN = 'static/offline-data/chapters-en/tt_1781081372340_1_xqcxo.json';
const vi = JSON.parse(fs.readFileSync(VI,'utf8'));
const en = JSON.parse(fs.readFileSync(EN,'utf8'));
for (const i of [41,42,45,50]) {
  fs.writeFileSync(`scripts/i18n/work/xq_vi_${i}.txt`, `TITLE: ${vi[i].tieu_de}\nTOMTAT: ${vi[i].tom_tat}\n\n${vi[i].noi_dung}`);
  fs.writeFileSync(`scripts/i18n/work/xq_en_${i}.txt`, `TITLE: ${en[i].tieu_de}\nTOMTAT: ${en[i].tom_tat}\n\n${en[i].noi_dung}`);
  console.log(`=== idx ${i} VI len=${vi[i].noi_dung.length} EN len=${en[i].noi_dung.length} ===`);
  console.log('VI title:', vi[i].tieu_de, '| EN title:', en[i].tieu_de);
  console.log('VI tomtat:', (vi[i].tom_tat||'').slice(0,300));
  console.log('EN tomtat:', (en[i].tom_tat||'').slice(0,300));
  console.log('');
}
