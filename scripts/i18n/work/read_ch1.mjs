import fs from 'fs';

const content = fs.readFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters/tt_klngl_q06.json', 'utf-8');
const data = JSON.parse(content);

const chapter1 = data[1];
console.log("=== CHAPTER 1 CONTENT ===");
console.log(chapter1.noi_dung);
console.log("\n\n=== CHAPTER 1 TOM_TAT ===");
console.log(chapter1.tom_tat);