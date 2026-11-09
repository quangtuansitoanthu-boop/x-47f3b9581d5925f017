import fs from 'node:fs';
const f = 'scripts/i18n/work/en_26.json';
const en = JSON.parse(fs.readFileSync(f, 'utf8'));
const cjk = String.fromCharCode(0x9634);
en.noi_dung = en.noi_dung.split(cjk).join('yin');
fs.writeFileSync(f, JSON.stringify(en, null, 2) + '\n', 'utf8');
const v = JSON.parse(fs.readFileSync(f, 'utf8')).noi_dung;
const rest = v.match(/[\u4e00-\u9fff]/g) || [];
console.log('remaining CJK:', rest.length, rest.slice(0, 10).join(''));
