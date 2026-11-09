import fs from 'fs';
const idx = process.argv[2] || '1';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_klngl_q09.json','utf8'))[parseInt(idx)].noi_dung;
const en = JSON.parse(fs.readFileSync('static/offline-data/chapters-en/tt_klngl_q09.json','utf8'))[parseInt(idx)].noi_dung;
const tagRe = /<\/?[a-zA-Z0-9]+(?:\s[^<>]*)?>|<br\s*\/?>/g;
const vt = vi.match(tagRe) || [], et = en.match(tagRe) || [];
const norm = t => t.replace(/\s+/g, ' ').trim();
for (let i = 655; i < 690; i++) console.log(i, 'VI:', norm(vt[i] || '(none)'), ' | EN:', norm(et[i] || '(none)'));
