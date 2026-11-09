import fs from 'node:fs';
const en = JSON.parse(fs.readFileSync('static/offline-data/chapters-en/book_e91ef5336221b1c48dde6341bf423bef.json','utf8'));
const src = JSON.parse(fs.readFileSync('static/offline-data/chapters/book_e91ef5336221b1c48dde6341bf423bef.json','utf8'));
// tokenize into tags and text chunks (first 60 chars)
function toks(s) {
  const parts = s.split(/(<\/?[a-zA-Z][^>]*>)/g);
  return parts.map(p => p.startsWith('<') ? p.replace(/\s+/g,' ').replace(/style="[^"]*"/, 'style="..."') : ('TXT:' + p.slice(0,50).replace(/\n/g,'\\n')));
}
for (const i of [4,6,7,10,14,20,23,24,28,36]) {
  const a = toks(src[i].noi_dung), b = toks(en[i].noi_dung);
  console.log('=== ch' + i + ' src_len=' + a.length + ' en_len=' + b.length);
  const n = Math.max(a.length, b.length);
  for (let k = 0; k < n; k++) {
    if (a[k] !== b[k]) { console.log('  @' + k + ' SRC=' + a[k]); console.log('  @' + k + ' EN =' + b[k]); }
  }
}
