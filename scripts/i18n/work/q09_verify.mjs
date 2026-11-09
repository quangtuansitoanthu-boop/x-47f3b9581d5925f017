import fs from 'fs';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_klngl_q09.json','utf8'));
const en = JSON.parse(fs.readFileSync('static/offline-data/chapters-en/tt_klngl_q09.json','utf8'));
console.log('counts:', vi.length, en.length);
let ok = vi.length === 5 && en.length === 5;
vi.forEach((c, i) => {
  const match = en[i].id === c.id && en[i].bai_viet_id === c.bai_viet_id && en[i].so_thu_tu === c.so_thu_tu;
  if (!match) ok = false;
  console.log(i, 'ids match:', match, '| VI body:', c.noi_dung.length, '| EN body:', en[i].noi_dung.length, '| title:', JSON.stringify(en[i].tieu_de));
});
// Vietnamese diacritics leftover check (allow none)
const viRe = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i;
en.forEach((c, i) => {
  const t = (c.tieu_de + ' ' + c.tom_tat + ' ' + c.noi_dung).replace(/<[^>]*>/g, ' ');
  // strip kept Chinese? Chinese has no VI diacritics, fine
  const m = t.match(viRe);
  console.log('ch' + i, 'VI-leftover:', m ? JSON.stringify(t.slice(Math.max(0, t.indexOf(m[0])-40), t.indexOf(m[0])+40)) : 'none');
});
// stray CJK check outside of intentional Chinese sutra lines: count Han chars in commentary paragraphs (heuristic: lines containing 'Commentary')
const hanRe = /[\u4e00-\u9fff]/g;
en.forEach((c, i) => {
  const lines = c.noi_dung.split('\n').filter(l => (l.includes('Commentary') || l.includes('Translation')) && hanRe.test(l));
  console.log('ch' + i, 'commentary/translation lines with Han chars:', lines.length);
  lines.slice(0, 5).forEach(l => console.log('   ::', l.slice(0, 160)));
});
// tag balance check
en.forEach((c, i) => {
  for (const tag of ['p', 'ol', 'li', 'strong', 'em', 'div', 'h3', 'u']) {
    const open = (c.noi_dung.match(new RegExp('<' + tag + '[ >]', 'g')) || []).length;
    const close = (c.noi_dung.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    const vOpen = (vi[i].noi_dung.match(new RegExp('<' + tag + '[ >]', 'g')) || []).length;
    const vClose = (vi[i].noi_dung.match(new RegExp('</' + tag + '>', 'g')) || []).length;
    if (open !== vOpen || close !== vClose) console.log(`ch${i} <${tag}>: VI ${vOpen}/${vClose} vs EN ${open}/${close}`);
  }
});
console.log('ids-ok:', ok);
