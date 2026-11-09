import fs from 'fs';
const idx = process.argv[2];
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_klngl_q09.json','utf8'))[parseInt(idx)].noi_dung;
const en = JSON.parse(fs.readFileSync('static/offline-data/chapters-en/tt_klngl_q09.json','utf8'))[parseInt(idx)].noi_dung;
const tagRe = /<\/?[a-zA-Z0-9]+(?:\s[^<>]*)?>|<br\s*\/?>/g;
const vt = vi.match(tagRe) || [];
const et = en.match(tagRe) || [];
const norm = t => t.replace(/\s+/g, ' ').trim();
console.log('VI tags:', vt.length, 'EN tags:', et.length);
let shown = 0;
const n = Math.max(vt.length, et.length);
for (let i = 0; i < n && shown < 40; i++) {
  const a = norm(vt[i] || '(none)');
  const b = norm(et[i] || '(none)');
  if (a !== b) {
    shown++;
    const ctx = (vi.slice(0, 0) , '');
    console.log(`[${i}] VI: ${a}  || EN: ${b}`);
  }
}
if (shown === 0) console.log('tag sequences identical');
