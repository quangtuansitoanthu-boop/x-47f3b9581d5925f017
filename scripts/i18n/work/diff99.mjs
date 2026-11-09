import fs from 'node:fs';
const SRC = 'static/offline-data/chapters/tt_1781223481607_3_nojda.json';
const TGT = 'static/offline-data/chapters-en/tt_1781223481607_3_nojda.json';
const s = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const t = JSON.parse(fs.readFileSync(TGT, 'utf8'));
const idxs = [9, 10];
for (const idx of idxs) {
  const sp = s[idx].noi_dung.split('\n');
  const tp = t[idx].noi_dung.split('\n');
  console.log('IDX ' + idx + ' srcParas=' + sp.length + ' tgtParas=' + tp.length);
  for (let i = 0; i < sp.length; i++) {
    console.log('S' + i + ' ' + sp[i].slice(0, 55));
  }
  console.log('---TGT---');
  for (let i = 0; i < tp.length; i++) {
    console.log('T' + i + ' ' + tp[i].slice(0, 55));
  }
}
const diac = /[abcd]+/g;
void diac;
