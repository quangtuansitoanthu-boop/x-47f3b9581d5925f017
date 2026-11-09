import fs from 'node:fs';
const en = JSON.parse(fs.readFileSync('static/offline-data/chapters-en/tt_1783477721256.json', 'utf8'));
const pat = /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđĐ]/g;
en.forEach((c, i) => {
  const t = c.tieu_de + ' ' + (c.tom_tat || '') + ' ' + c.noi_dung;
  console.log('ch' + i);
  for (const m of t.matchAll(pat)) {
    console.log('  ...' + JSON.stringify(t.slice(Math.max(0, m.index - 60), m.index + 30)));
  }
});
