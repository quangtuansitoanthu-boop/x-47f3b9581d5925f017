import fs from 'fs';
import path from 'path';
import { pathToFileURL } from 'url';
const batchFile = process.argv[2];
const batch = (await import(pathToFileURL(path.resolve(batchFile)).href)).default;
const enPath = 'static/offline-data/chapters-en/tt_1781224543804_1_jr077.json';
const viPath = 'static/offline-data/chapters/tt_1781224543804_1_jr077.json';
const en = JSON.parse(fs.readFileSync(enPath,'utf8'));
const vi = JSON.parse(fs.readFileSync(viPath,'utf8'));
if (en.length !== vi.length) throw new Error('length mismatch '+en.length+' vs '+vi.length);
for (const [idx, tr] of Object.entries(batch)) {
  const i = Number(idx);
  if (en[i].id !== vi[i].id || en[i].so_thu_tu !== vi[i].so_thu_tu) throw new Error('id/order mismatch at '+i);
  for (const k of ['tieu_de','tom_tat','noi_dung']) {
    if (typeof tr[k] !== 'string' || !tr[k].length) throw new Error('missing '+k+' at '+i);
  }
  const srcAlign = (vi[i].noi_dung.match(/\{align:/g)||[]).length;
  const trAlign = (tr.noi_dung.match(/\{align:/g)||[]).length;
  if (srcAlign !== trAlign) throw new Error('align count mismatch at '+i+': src='+srcAlign+' tr='+trAlign);
  // residual Vietnamese diacritics check (allowlisted names/mantras checked separately)
  en[i].tieu_de = tr.tieu_de; en[i].tom_tat = tr.tom_tat; en[i].noi_dung = tr.noi_dung;
  console.log('patched', i, 'id='+en[i].id);
}
fs.writeFileSync(enPath, JSON.stringify(en, null, 2));
console.log('wrote EN file, count='+en.length);
