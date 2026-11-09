const fs = require('fs');

const srcPath = 'D:\\CA NHAN\\A.WEB_HP\\tutam-mobile\\scripts\\i18n\\work\\source_chapters.json';
const dstPath = 'D:\\CA NHAN\\A.WEB_HP\\tutam-mobile\\static\\offline-data\\chapters-en\\tt_1781224598651_2_i3l0j.json';

console.error('Reading files...');
const srcChapters = JSON.parse(fs.readFileSync(srcPath, 'utf-8'));
const dstChapters = JSON.parse(fs.readFileSync(dstPath, 'utf-8'));

console.error(`Source chapters: ${srcChapters.length}`);
console.error(`Target chapters: ${dstChapters.length}`);

let output = '';
for (let i = 0; i < srcChapters.length; i++) {
    const src = srcChapters[i];
    const dst = dstChapters[i];
    output += `Chapter ${i} (id=${src.id}):\n`;
    output += `  VI Title: ${src.tieu_de.substring(0, 80)}\n`;
    output += `  EN Title: ${dst.tieu_de.substring(0, 80)}\n`;
    output += `  VI Summary: ${src.tom_tat.substring(0, 100)}...\n`;
    output += `  EN Summary: ${dst.tom_tat.substring(0, 100)}...\n`;
    output += `  VI Content len: ${src.noi_dung.length}\n`;
    output += `  EN Content len: ${dst.noi_dung.length}\n\n`;
}

fs.writeFileSync('D:\\CA NHAN\\A.WEB_HP\\tutam-mobile\\scripts\\i18n\\work\\verify.txt', output, 'utf-8');
console.error('Verification written to file');