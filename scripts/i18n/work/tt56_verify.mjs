import fs from 'node:fs';
const VI = 'static/offline-data/chapters/tt_1783477721256.json';
const EN = 'static/offline-data/chapters-en/tt_1783477721256.json';
const vi = JSON.parse(fs.readFileSync(VI, 'utf8'));
const en = JSON.parse(fs.readFileSync(EN, 'utf8'));
console.log('count vi=' + vi.length + ' en=' + en.length);
let ok = true;
en.forEach((c, i) => {
  const v = vi[i];
  const idOk = c.id === v.id && c.bai_viet_id === v.bai_viet_id && c.so_thu_tu === v.so_thu_tu;
  const bOk = (c.noi_dung.match(/\{align:/g) || []).length === ((v.noi_dung.match(/\{align:/g) || []).length);
  if (!idOk || !bOk) ok = false;
  console.log(`ch${i} id=${c.id} stt=${c.so_thu_tu} title=${JSON.stringify(c.tieu_de)} blocks=${(c.noi_dung.match(/\{align:/g) || []).length} idOk=${idOk} blocksOk=${bOk}`);
});
// leftover Vietnamese diacritics / CJK check
const scrub = (s) => s.replace(/Thích|Thiền|Thông|Siêu|Tâm|Đàm|Nghiêm|Ô La|O Ba Thi|Na Ha Thọ|Ế Trà|Đề Bà|Na Lý Sa Bà|Du Bệ Ma|A Bà Ma Na|Na Già Ba La|Uu Ba Ban Da|A Gia Ba|Quý Dậu|Từ/g, '');
en.forEach((c, i) => {
  const t = scrub(c.tieu_de + ' ' + (c.tom_tat || '') + ' ' + c.noi_dung);
  const viet = t.match(/[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/g);
  const cjk = t.match(/[\u4E00-\u9FFF\u3040-\u30FF]/g);
  console.log(`ch${i} viet-diacritic-left=${viet ? viet.length : 0}${viet ? ' e.g.' + viet.slice(0, 5).join(',') : ''} cjk-left=${cjk ? cjk.length : 0}`);
});
console.log('SAMPLE ch1 head: ' + JSON.stringify(en[1].noi_dung.slice(0, 300)));
console.log('SAMPLE ch2 mid: ' + JSON.stringify(en[2].noi_dung.slice(9000, 9350)));
console.log(ok ? 'VERIFY PASS' : 'VERIFY FAIL');
