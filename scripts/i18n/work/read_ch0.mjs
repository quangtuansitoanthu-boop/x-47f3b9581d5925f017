import fs from 'fs';

const content = fs.readFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters/tt_klngl_q06.json', 'utf-8');
const data = JSON.parse(content);

const chapter0 = data[0];
console.log("=== CHAPTER 0 CONTENT ===");
console.log(chapter0.noi_dung);
console.log("\n\n=== CHAPTER 0 TOM_TAT ===");
console.log(chapter0.tom_tat);