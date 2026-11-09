import fs from 'node:fs';
const en = JSON.parse(fs.readFileSync('scripts/i18n/work/en_26.json', 'utf8'));
for (const k of ['tieu_de', 'tom_tat', 'noi_dung']) {
  const v = en[k];
  const cjk = (v.match(/[\u4e00-\u9fff]/g) || []).join('');
  const bs = (v.match(/\\/g) || []).length;
  console.log(k, 'len=' + v.length, 'CJK=[' + cjk.slice(0, 20) + ']', 'backslashes=' + bs);
}
