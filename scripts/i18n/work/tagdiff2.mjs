import fs from 'node:fs';
const en = JSON.parse(fs.readFileSync('static/offline-data/chapters-en/book_e91ef5336221b1c48dde6341bf423bef.json','utf8'));
const src = JSON.parse(fs.readFileSync('static/offline-data/chapters/book_e91ef5336221b1c48dde6341bf423bef.json','utf8'));
function ems(s){ return [...s.matchAll(/<em>(.*?)<\/em>/gs)].map(m => m[1].replace(/\n/g,'\\n').slice(0,90)); }
function ps(s){ return (s.match(/<p( [^>]*)?>|<\/p>|<strong>|<\/strong>|<u>|<\/u>|<figure>|<\/figure>|<img[^>]*>/g) || []).map(x=>x.replace(/style="[^"]*"/,'style=".."')); }
for (const i of [4,6,7,10,14,20,23,24,28,36]) {
  console.log('=== ch' + i);
  console.log(' SRC p-tags: ' + ps(src[i].noi_dung).join(' '));
  console.log(' EN  p-tags: ' + ps(en[i].noi_dung).join(' '));
}
