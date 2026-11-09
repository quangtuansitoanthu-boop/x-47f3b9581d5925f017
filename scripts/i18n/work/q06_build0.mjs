import fs from 'fs';
const path = 'static/offline-data/chapters-en/tt_klngl_q06.json';
const en = JSON.parse(fs.readFileSync(path,'utf8'));
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_klngl_q06.json','utf8'));
// chapter 0: 34 chunks
let html0 = '';
const missing0 = [];
for (let i=0;i<34;i++){
  const f = `scripts/i18n/work/q06_en_ch0_c${String(i).padStart(2,'0')}.html`;
  if (!fs.existsSync(f)){ missing0.push(i); continue; }
  html0 += fs.readFileSync(f,'utf8');
}
console.log('ch0 missing:', missing0);
// close the entry-content div if opened in c00 (VI has it; check VI tail)
const viTail0 = (vi[0].noi_dung||'').slice(-200);
console.log('VI ch0 tail:', JSON.stringify(viTail0));
console.log('EN ch0 tail:', JSON.stringify(html0.slice(-200)));
if (missing0.length===0){
  en[0].noi_dung = html0;
  en[0].tieu_de = "Volume 6 (Part 1): Avalokiteshvara Bodhisattva's Perfect Penetration Through the Ear Root";
  en[0].tom_tat = "VOLUME 6 (PART 1): AVALOKITESHVARA BODHISATTVA'S PERFECT PENETRATION THROUGH THE EAR ROOT. Brief Commentary on the Shurangama Sutra by Venerable Master Hsuan Hua. Avalokiteshvara describes entering samadhi through hearing, contemplating, and cultivating; the six knots, the two supreme states, the thirty-two response bodies, the fourteen fearlessnesses, and the four inconceivable wondrous virtues.";
  fs.writeFileSync(path, JSON.stringify(en, null, 2), 'utf8');
  console.log('saved ch0, len=', html0.length);
}
