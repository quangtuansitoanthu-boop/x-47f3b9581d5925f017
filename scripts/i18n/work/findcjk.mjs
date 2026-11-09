import fs from 'node:fs';
const en = JSON.parse(fs.readFileSync('scripts/i18n/work/en_26.json', 'utf8'));
const v = en.noi_dung;
const i = v.indexOf('阴');
console.log(JSON.stringify(v.slice(Math.max(0, i - 120), i + 120)));
