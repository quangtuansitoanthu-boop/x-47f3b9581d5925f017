import fs from 'node:fs';
const TGT = 'static/offline-data/chapters-en/tt_1781223481607_3_nojda.json';
const t = JSON.parse(fs.readFileSync(TGT, 'utf8'));
const c = t[26];
const text = c.tieu_de + '\n' + c.tom_tat + '\n' + c.noi_dung;
const parts = text.split(/(\s+)/);
const hits = parts.filter((w) => /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(w));
console.log(JSON.stringify([...new Set(hits)]));
