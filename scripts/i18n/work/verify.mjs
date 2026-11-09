import fs from 'node:fs';
const EN = 'static/offline-data/chapters-en/book_e91ef5336221b1c48dde6341bf423bef.json';
const SRC = 'static/offline-data/chapters/book_e91ef5336221b1c48dde6341bf423bef.json';
const en = JSON.parse(fs.readFileSync(EN,'utf8'));
const src = JSON.parse(fs.readFileSync(SRC,'utf8'));
console.log('en_n=' + en.length + ' src_n=' + src.length);
let ok = true;
for (let i = 0; i < src.length; i++) {
  if (en[i].id !== src[i].id || en[i].so_thu_tu !== src[i].so_thu_tu || en[i].bai_viet_id !== src[i].bai_viet_id) { console.log('MISMATCH at ' + i); ok = false; }
  for (const k of ['id','bai_viet_id','so_thu_tu','tieu_de','tom_tat','noi_dung']) if (!(k in en[i])) { console.log('MISSING KEY ' + k + ' at ' + i); ok = false; }
}
console.log('ids_order_match=' + ok);
// leftover Vietnamese scan (allow verbatim mantras)
const allowed = ['Nam Mô Quán Thế Âm Bồ-tát', 'Nam Mô A Di Đà Phật', 'A Di Đà Phật'];
const vietRe = /[àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđÀÁẢÃẠĂẰẮẲẴẶÂẦẤẨẪẬÈÉẺẼẸÊỀẾỂỄỆÌÍỈĨỊÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢÙÚỦŨỤƯỪỨỬỮỰỲÝỶỸỴĐ]/;
for (let i = 0; i < en.length; i++) {
  for (const f of ['tieu_de','tom_tat','noi_dung']) {
    let t = String(en[i][f] || '');
    for (const a of allowed) t = t.split(a).join('');
    // strip HTML tags/attrs for checking? tags are ASCII anyway
    const m = t.match(vietRe);
    if (m) { console.log('VIET left ch' + i + ' field=' + f + ' near=' + JSON.stringify(t.slice(Math.max(0,t.indexOf(m[0])-40), t.indexOf(m[0])+60))); }
  }
}
console.log('--- SAMPLE ch1 title: ' + en[1].tieu_de);
console.log('--- SAMPLE ch1 summary: ' + en[1].tom_tat);
console.log('--- SAMPLE ch40 body head: ' + en[40].noi_dung.slice(0, 400));
console.log('DONE');
