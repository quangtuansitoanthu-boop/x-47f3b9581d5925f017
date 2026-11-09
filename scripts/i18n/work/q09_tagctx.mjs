import fs from 'fs';
const idx = process.argv[2] || '1';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_klngl_q09.json','utf8'))[parseInt(idx)].noi_dung;
const en = JSON.parse(fs.readFileSync('static/offline-data/chapters-en/tt_klngl_q09.json','utf8'))[parseInt(idx)].noi_dung;
function tagPos(s) {
  const re = /<\/?[a-zA-Z0-9]+(?:\s[^<>]*)?>|<br\s*\/?>/g;
  const out = []; let m;
  while ((m = re.exec(s))) out.push(m.index);
  return out;
}
const vp = tagPos(vi), ep = tagPos(en);
const show = (s, p, i0, i1) => {
  const a = p[Math.max(0, i0)], b = p[Math.min(p.length - 1, i1)];
  console.log(JSON.stringify(s.slice(Math.max(0, a - 200), b + 220)));
};
console.log('--- VI around tag 660-690 ---');
show(vi, vp, 660, 690);
console.log('--- EN around tag 660-690 ---');
show(en, ep, 660, 690);
