import fs from 'fs';
const idx = process.argv[2] || '0';
let html = fs.readFileSync(`scripts/i18n/work/q09_ch${idx}_body.txt`, 'utf8');
// Put each block element on its own line for readability
html = html.replace(/<\/p>/g, '</p>\n');
html = html.replace(/<p([ >])/g, '\n<p$1');
html = html.replace(/<\/?(ol|div|h3|ul)([ >])/g, '\n<$1$2');
html = html.replace(/<\/(li)>/g, '</$1>\n');
html = html.replace(/<(li)([ >])/g, '\n<$1$2');
html = html.replace(/\n{2,}/g, '\n');
fs.writeFileSync(`scripts/i18n/work/q09_ch${idx}_pretty.txt`, html);
const lines = html.split('\n');
console.log('ch' + idx, 'lines:', lines.length, 'chars:', html.length);
let n = 0, acc = '', chunk = 0;
const chunks = [];
for (const ln of lines) {
  acc += ln + '\n'; n += ln.length;
  if (n > 7000) { chunks.push(acc); acc = ''; n = 0; }
}
if (acc.trim()) chunks.push(acc);
chunks.forEach((c, i) => fs.writeFileSync(`scripts/i18n/work/q09_ch${idx}_c${i}.txt`, c));
console.log('chunks:', chunks.length, chunks.map(c => c.length));
