import fs from 'fs';
const ENP = 'static/offline-data/chapters-en/tt_1781081372340_1_xqcxo.json';
const VIP = 'static/offline-data/chapters/tt_1781081372340_1_xqcxo.json';
const en = JSON.parse(fs.readFileSync(ENP,'utf8'));
const vi = JSON.parse(fs.readFileSync(VIP,'utf8'));
const v = vi[50].noi_dung;
function span(startMark, endMark, endFromMark) {
  const s = v.indexOf(startMark);
  if (s < 0) throw new Error('start not found: ' + startMark);
  const ef = endFromMark ? v.indexOf(endFromMark, s) : s;
  if (ef < 0) throw new Error('endFrom not found: ' + endFromMark);
  const e = v.indexOf(endMark, ef) + endMark.length;
  if (e < endMark.length) throw new Error('end not found: ' + endMark);
  return v.slice(s, e);
}
let LIT1 = span('Đại từ, đại bi thương chúng sanh', '(1 lạy)', 'vô lượng Bồ Tát');
let LIT2 = span('Tự quy y Phật', '(1 lạy)', 'hết thảy không ngại');
let LIT3 = span('Ngày hôm nay, đệ tử là', 'mãn Bồ Đề nguyện.', null);
let LIT4 = span('Xin đem công đức trì tụng này', 'Đều sanh Cực Lạc thành Phật đạo', null);
console.log('LIT1 len', LIT1.length, '| LIT2 len', LIT2.length, '| LIT3 len', LIT3.length, '| LIT4 len', LIT4.length);
// stage directions inside liturgy -> English
for (const [o,n] of [['(lạy 1 lạy)','(bow once)'], ['(1 lạy)','(bow once)']]) {
  LIT1 = LIT1.replaceAll(o,n); LIT2 = LIT2.replaceAll(o,n);
}
const A = fs.readFileSync('scripts/i18n/work/xq_app_a.txt','utf8').trim();
const B = fs.readFileSync('scripts/i18n/work/xq_app_b.txt','utf8').trim();
let C = fs.readFileSync('scripts/i18n/work/xq_app_c.txt','utf8').trim();
C = C.replaceAll('{{LIT1}}', LIT1).replaceAll('{{LIT2}}', LIT2).replaceAll('{{LIT3}}', LIT3).replaceAll('{{LIT4}}', LIT4);
if (/{{LIT/.test(C)) throw new Error('placeholder left');
const marker = 'MỘT SỐ CẢM NGHĨ TỪ 50 CÂU CHUYỆN SỨ MỆNH ĐỘ VONG';
const head = en[50].noi_dung.slice(0, en[50].noi_dung.indexOf(marker)).trimEnd();
en[50].noi_dung = head + '\n\n' + A + '\n\n' + B + '\n\n' + C;
fs.writeFileSync(ENP, JSON.stringify(en, null, 2));
console.log('ch50 appendix replaced. new len:', en[50].noi_dung.length);
