import fs from 'fs';

// Read the Vietnamese source
const viContent = fs.readFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters/tt_klngl_q06.json', 'utf-8');
const viData = JSON.parse(viContent);

// Read the existing English target
const enContent = fs.readFileSync('D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters-en/tt_klngl_q06.json', 'utf-8');
const enData = JSON.parse(enContent);

console.log("Vietnamese chapters:", viData.length);
console.log("English chapters:", enData.length);

// Chapter 0 translation
const ch0_vi = viData[0];
const ch0_en = enData[0];

console.log("\n=== CHAPTER 0 ===");
console.log("VI Title:", ch0_vi.tieu_de);
console.log("EN Title:", ch0_en.tieu_de);
console.log("VI Tom_tat length:", ch0_vi.tom_tat.length);
console.log("EN Tom_tat length:", ch0_en.tom_tat.length);
console.log("VI Content length:", ch0_vi.noi_dung.length);
console.log("EN Content length:", ch0_en.noi_dung.length);

// Chapter 1 translation
const ch1_vi = viData[1];
const ch1_en = enData[1];

console.log("\n=== CHAPTER 1 ===");
console.log("VI Title:", ch1_vi.tieu_de);
console.log("EN Title:", ch1_en.tieu_de);
console.log("VI Tom_tat length:", ch1_vi.tom_tat.length);
console.log("EN Tom_tat length:", ch1_en.tom_tat.length);
console.log("VI Content length:", ch1_vi.noi_dung.length);
console.log("EN Content length:", ch1_en.noi_dung.length);

// Show first 2000 chars of VI content for chapter 0
console.log("\n=== CHAPTER 0 VI CONTENT (first 3000 chars) ===");
console.log(ch0_vi.noi_dung.substring(0, 3000));

// Show first 2000 chars of VI content for chapter 1
console.log("\n=== CHAPTER 1 VI CONTENT (first 3000 chars) ===");
console.log(ch1_vi.noi_dung.substring(0, 3000));