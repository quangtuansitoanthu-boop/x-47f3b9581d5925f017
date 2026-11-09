import fs from 'node:fs';
const SRC = 'static/offline-data/chapters/tt_1781223481607_3_nojda.json';
const TGT = 'static/offline-data/chapters-en/tt_1781223481607_3_nojda.json';
const s = JSON.parse(fs.readFileSync(SRC, 'utf8'));
const t = JSON.parse(fs.readFileSync(TGT, 'utf8'));
console.log('src=' + s.length + ' tgt=' + t.length);
let ok = true;
for (let i = 0; i < s.length; i++) {
  if (s[i].id !== t[i].id || s[i].bai_viet_id !== t[i].bai_viet_id || s[i].so_thu_tu !== t[i].so_thu_tu) {
    console.log('MISMATCH idx=' + i, s[i].id, t[i].id);
    ok = false;
  }
}
console.log('ids/order: ' + (ok ? 'OK' : 'FAIL'));
// markup parity: count {align: markers + leftover Vietnamese check (diacritics) per chapter
const diac = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
t.forEach((c, i) => {
  const sm = (s[i].noi_dung.match(/\{align:/g) || []).length;
  const tm = (c.noi_dung.match(/\{align:/g) || []).length;
  const left = diac.test(c.tieu_de + ' ' + c.tom_tat + ' ' + c.noi_dung);
  console.log(i, 'id=' + c.id, 'title=' + JSON.stringify(c.tieu_de), 'align src/tgt=' + sm + '/' + tm, 'VI-leftover=' + left);
});
