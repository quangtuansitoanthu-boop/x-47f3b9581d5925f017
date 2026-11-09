import fs from 'fs';
const p = process.argv[2];
const s = fs.readFileSync(p,'utf8');
const m = s.match(/[\u4e00-\u9fff]/g);
if (m) { console.log(p, 'HAS CJK:', [...new Set(m)].join(' ')); process.exit(1); }
else console.log(p, 'clean');
