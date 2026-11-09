import fs from 'fs';

const jsonPath = 'D:/CA NHAN/A.WEB_HP/tutam-mobile/static/offline-data/chapters-en/tt_klngl_q09.json';
const enPath = 'D:/CA NHAN/A.WEB_HP/tutam-mobile/scripts/i18n/work/en_ch0_complete_full.html';

const jsonData = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
const enContent = fs.readFileSync(enPath, 'utf8');

jsonData[0].noi_dung = enContent;

fs.writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2), 'utf8');
console.log('Chapter 0 updated successfully');