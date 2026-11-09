import fs from 'fs';
const EN = 'static/offline-data/chapters-en/tt_1781081372340_1_xqcxo.json';
const VI = 'static/offline-data/chapters/tt_1781081372340_1_xqcxo.json';
const en = JSON.parse(fs.readFileSync(EN,'utf8'));
const vi = JSON.parse(fs.readFileSync(VI,'utf8'));
const e = en[50], v = vi[50];
console.log('EN title:', e.tieu_de, '| VI title:', v.tieu_de);
console.log('EN tomtat len:', (e.tom_tat||'').length, '| VI tomtat len:', (v.tom_tat||'').length);
console.log('--- EN tom_tat ---'); console.log(e.tom_tat);
console.log('--- VI tom_tat ---'); console.log(v.tom_tat);
// find paragraphs containing Vietnamese diacritics in EN
const paras = e.noi_dung.split('\n');
const rx = /[ăâđêôơưĂÂĐÊÔƠƯáàảãạắằẳẵặấầẩẫậéèẻẽẹếềểễệíìỉĩịóòỏõọốồổỗộớờởỡợúùủũụứừửữựýỳỷỹỵ]/;
paras.forEach((p,idx)=>{ if (rx.test(p) && !/Nam Mô|A Di Đà/.test(p)) console.log(`\n[EN para ${idx} len=${p.length}] ${p.slice(0,600)}`); });
fs.writeFileSync('scripts/i18n/work/xq_vi_50.txt', `TITLE: ${v.tieu_de}\nTOMTAT: ${v.tom_tat}\n\n${v.noi_dung}`);
fs.writeFileSync('scripts/i18n/work/xq_en_50.txt', `TITLE: ${e.tieu_de}\nTOMTAT: ${e.tom_tat}\n\n${e.noi_dung}`);
console.log('\nwrote files');
