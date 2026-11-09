import fs from 'node:fs';
const en = JSON.parse(fs.readFileSync('static/offline-data/chapters-en/book_e91ef5336221b1c48dde6341bf423bef.json','utf8'));
const src = JSON.parse(fs.readFileSync('static/offline-data/chapters/book_e91ef5336221b1c48dde6341bf423bef.json','utf8'));
const cjk = /[\u4e00-\u9fff\u3040-\u30ff\uac00-\ud7af]/;
let bad = 0;
for (let i = 0; i < en.length; i++) {
  for (const f of ['tieu_de','tom_tat','noi_dung']) {
    const t = String(en[i][f] || '');
    if (cjk.test(t)) { console.log('CJK in ch' + i + ' ' + f); bad++; }
  }
  const tags = s => (s.match(/<\/?[a-zA-Z][^>]*>/g) || []).map(x => x.replace(/\s+/g,' ').replace(/"[^"]*"/g,'"..."'));
  const a = tags(src[i].noi_dung), b = tags(en[i].noi_dung);
  if (JSON.stringify(a) !== JSON.stringify(b)) { console.log('TAG DIFF ch' + i); console.log(' src: ' + JSON.stringify(a)); console.log(' en : ' + JSON.stringify(b)); bad++; }
}
console.log(bad === 0 ? 'ALL CLEAN: no CJK, all tag sequences identical' : 'issues=' + bad);
