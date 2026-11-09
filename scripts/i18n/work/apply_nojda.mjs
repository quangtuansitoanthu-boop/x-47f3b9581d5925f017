import fs from 'node:fs';
// usage: node apply_nojda.mjs <idx> <enfile.json>
// enfile.json contains {tieu_de, tom_tat, noi_dung}
const idx = Number(process.argv[2]);
const enFile = process.argv[3];
const target = 'static/offline-data/chapters-en/tt_1781223481607_3_nojda.json';
const t = JSON.parse(fs.readFileSync(target, 'utf8'));
const en = JSON.parse(fs.readFileSync(enFile, 'utf8'));
if (t[idx].id !== undefined && en.id && t[idx].id !== en.id) {
  console.error('ID mismatch');
  process.exit(1);
}
t[idx].tieu_de = en.tieu_de;
t[idx].tom_tat = en.tom_tat;
t[idx].noi_dung = en.noi_dung;
fs.writeFileSync(target, JSON.stringify(t, null, 2) + '\n', 'utf8');
console.log('saved idx=' + idx + ' id=' + t[idx].id);
