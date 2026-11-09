import fs from 'fs';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_klngl_q06.json','utf8'));
for (let idx=0; idx<vi.length; idx++){
  const html = vi[idx].noi_dung||'';
  // split on paragraph boundaries keeping tags
  const parts = html.split(/(?=<p[ >])/);
  console.log(`CH${idx}: paras=${parts.length}`);
  // chunk into ~3500-char groups at paragraph boundaries
  let chunks=[], cur='';
  for (const p of parts){
    if ((cur+p).length > 3500 && cur){ chunks.push(cur); cur=p; } else cur+=p;
  }
  if (cur) chunks.push(cur);
  console.log(`CH${idx}: chunks=${chunks.length}`, chunks.map(c=>c.length).join(','));
  chunks.forEach((c,i)=> fs.writeFileSync(`scripts/i18n/work/q06_ch${idx}_c${String(i).padStart(2,'0')}.html`, c, 'utf8'));
}
