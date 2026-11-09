import fs from 'fs';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/book_a120238d492a12a35e72446e40b1a94f.json','utf8'));
for (const k of [1,3,5,8,9,10,18]) {
  const paras = vi[k].noi_dung.split('\n');
  console.log('=== ch'+k+' paras:'+paras.length);
  paras.forEach((p,i)=>{ if (p.includes('<br>')) console.log('  p'+i+': ...'+p.slice(Math.max(0,p.indexOf('<br>')-80),p.indexOf('<br>')+80)); });
}
