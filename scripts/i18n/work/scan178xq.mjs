import fs from 'fs';
const VI = 'static/offline-data/chapters/tt_1781081372340_1_xqcxo.json';
const EN = 'static/offline-data/chapters-en/tt_1781081372340_1_xqcxo.json';
const vi = JSON.parse(fs.readFileSync(VI,'utf8'));
const en = JSON.parse(fs.readFileSync(EN,'utf8'));
console.log('VI', vi.length, 'EN', en.length);
console.log('indent check:', fs.readFileSync(EN,'utf8').slice(0,200));
// per-chapter Vietnamese diacritics scan
const mantraOK = /Nam Mô|A Di Đà|Ứng Cúng|Chánh Biến Tri|Ma Ha|Tát Đỏa|Án |Om |A Di Da Phat/i;
en.forEach((c,i)=>{
  const blob = (c.tieu_de||'')+'\n'+(c.tom_tat||'')+'\n'+(c.noi_dung||'');
  const lines = blob.split('\n');
  let count = 0;
  let samples = [];
  lines.forEach(l=>{
    if (mantraOK.test(l)) return;
    const m = l.match(/[ăâđêôơưĂÂĐÊÔƠƯáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/g);
    if (m) { count += m.length; if (samples.length<3) samples.push(l.slice(0,160)); }
  });
  // also rough: any obviously Vietnamese words even without diacritics? skip
  if (count>0) console.log(`VI-LEFT idx=${i} stt=${c.so_thu_tu} id=${c.id} title=${c.tieu_de.slice(0,80)} chars=${count}\n   e.g. ${samples.join(' || ').slice(0,400)}`);
});
console.log('scan done');
