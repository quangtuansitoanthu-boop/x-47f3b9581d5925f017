import fs from 'fs';
const en = JSON.parse(fs.readFileSync('static/offline-data/chapters-en/book_a120238d492a12a35e72446e40b1a94f.json','utf8'));
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/book_a120238d492a12a35e72446e40b1a94f.json','utf8'));
function tags(s){ return (s.match(/<[^>]+>/g)||[]); }
for (const k of [1,3,5,8,9,10,18]) {
  const a = tags(vi[k].noi_dung), b = tags(en[k].noi_dung);
  console.log('=== ch', k, 'VI tags:', a.length, 'EN tags:', b.length);
  const n = Math.max(a.length, b.length);
  for (let i=0;i<n;i++) if (a[i]!==b[i]) { console.log('  idx',i,'VI:',a[i],'EN:',b[i]); }
}
