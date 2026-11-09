const fs = require('fs');

const srcPath = 'D:\\CA NHAN\\A.WEB_HP\\tutam-mobile\\static\\offline-data\\chapters\\tt_1781224598651_2_i3l0j.json';
const dstPath = 'D:\\CA NHAN\\A.WEB_HP\\tutam-mobile\\scripts\\i18n\\work\\source_chapters.json';

console.error('Reading file...');
const content = fs.readFileSync(srcPath, 'utf-8');
console.error(`File length: ${content.length}`);

console.error('Parsing JSON...');
const data = JSON.parse(content);
console.error(`Total chapters: ${data.length}`);

for (let i = 0; i < data.length; i++) {
    const ch = data[i];
    console.error(`Ch ${i}: id=${ch.id}, title=${ch.tieu_de.substring(0, 80)}`);
}

fs.writeFileSync(dstPath, JSON.stringify(data, null, 2), 'utf-8');
console.error(`Saved to ${dstPath}`);