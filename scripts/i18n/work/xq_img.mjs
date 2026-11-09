import fs from 'fs';
const vi = JSON.parse(fs.readFileSync('static/offline-data/chapters/tt_1781081372340_1_xqcxo.json','utf8'));
const en = JSON.parse(fs.readFileSync('static/offline-data/chapters-en/tt_1781081372340_1_xqcxo.json','utf8'));
const tag = s => (s.match(/!\[[^\]]*\]\(https:[^)]*\)/g)||[]);
console.log('VI ch50 images:', tag(vi[50].noi_dung).length);
console.log('EN ch50 images:', tag(en[50].noi_dung).length);
const vTags = tag(vi[50].noi_dung), eTags = tag(en[50].noi_dung);
console.log('tags equal:', JSON.stringify(vTags)===JSON.stringify(eTags));
// where does appendix start in VI? find index of 'MỘT SỐ CẢM NGHĨ'
const vIdx = vi[50].noi_dung.indexOf('MỘT SỐ CẢM NGHĨ');
const eIdx = en[50].noi_dung.indexOf('MỘT SỐ CẢM NGHĨ');
console.log('VI images after appendix start:', tag(vi[50].noi_dung.slice(vIdx)).length);
console.log('EN images after appendix start:', tag(en[50].noi_dung.slice(eIdx)).length);
console.log('EN story head tail:', JSON.stringify(en[50].noi_dung.slice(eIdx-120, eIdx)));
console.log('EN tail:', JSON.stringify(en[50].noi_dung.slice(-300)));
console.log('VI tail:', JSON.stringify(vi[50].noi_dung.slice(-300)));
