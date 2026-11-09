import fs from 'fs';

const content = fs.readFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters/tt_klngl_q06.json', 'utf-8');
const data = JSON.parse(content);

console.log(`Total chapters: ${data.length}`);
for (let i = 0; i < data.length; i++) {
    const d = data[i];
    console.log(`Chapter ${i}: id=${d.id}, so_thu_tu=${d.so_thu_tu}`);
    console.log(`  Title: ${d.tieu_de}`);
    console.log(`  Tom_tat length: ${d.tom_tat.length}`);
    console.log(`  Content length: ${d.noi_dung.length}`);
    console.log();
}