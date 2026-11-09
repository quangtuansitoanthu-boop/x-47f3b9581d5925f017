import fs from 'fs';
const raw = fs.readFileSync('static/offline-data/chapters-en/tt_1781081372340_1_xqcxo.json','utf8');
const re = new RegExp('[' + '\u4e00-\u9fff' + '\u3040-\u30ff' + '\uac00-\ud7af' + ']', 'g');
const m = raw.match(re);
console.log('CJK count:', m ? m.length : 0);
if (m) console.log([...new Set(m)].join(' '));
