import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const mobileRoot = path.resolve('.');

const BOOK_IDS = [
  'phat-tu-thien-dia-du-ky-quyen-1',
  'phat-tu-thien-dia-du-ky-quyen-2',
  'tt_chiem_sat_thien_ac_nghiep_bao',
  'tt_dia_tang_thap_luan_kinh_q1',
  'tt_dia_tang_thap_luan_kinh_q2'
];

const POST_CLEANUP_RULES = [
  // 1. Title prefixes in Du Ky
  [/^(?:Low Quality|Low Product|Lower Product|Low Rank|Lower Rank|Degradation|Ha Pham|Xia Pham|Low Pham):\s*(\d+)\.\s*/i, 'Part III (Lower Section): $1. '],
  [/^(?:High Rank|High Quality):\s*(\d+)\.\s*/i, 'Part I (Upper Section): $1. '],
  [/^(?:Middle Level):\s*(\d+)\.\s*/i, 'Part II (Middle Section): $1. '],
  [/^(?:Additional Products|Extra Products):\s*(\d+)\.\s*/i, 'Supplementary Section: $1. '],
  [/^Part III \(Lower Section\):\s*(\d+)\.\s*/i, 'Part III (Lower Section): $1. '],
  [/^Part II \(Middle Section\):\s*(\d+)\.\s*/i, 'Part II (Middle Section): $1. '],
  [/^Part I \(Upper Section\):\s*(\d+)\.\s*/i, 'Part I (Upper Section): $1. '],
  [/^Hau Ky \(The End of Good Fate\) - 后记（结善缘）/i, 'Afterword: Forming Wholesome Affinities (后记 · 结善缘)'],
  [/^Hau Ky \(Introduction to Stage Chief Lu Quan Hoanh\) - 后记/i, 'Afterword: Introduction to Master Lu Junhong (后记)'],
  [/^Hau Ky \(后记\)/i, 'Afterword (后记)'],
  [/^Conclusion \(后 序\)/i, 'Epilogue (后序)'],

  // 2. High-priority phrases & MT artifacts
  [/THE SAINT MIND OF THE PURE LAND/gi, 'Sacred Realm of the Spiritual Pure Land'],
  [/SAINT MIND OF THE PURE LAND/gi, 'Sacred Realm of the Spiritual Pure Land'],
  [/Holy Land of the Spiritual Mind/gi, 'Sacred Realm of the Spiritual Pure Land'],
  [/Holy Land of Spiritual Pure Land/gi, 'Sacred Realm of the Spiritual Pure Land'],
  [/Spiritual Pure Land Holy Land/gi, 'Sacred Realm of the Spiritual Pure Land'],
  [/King of Hell's Palace/gi, 'Palace of King Yama'],
  [/King of Hell Palace/gi, 'Palace of King Yama'],
  [/Palace of Hell/gi, 'Palace of King Yama'],
  [/King of Hell/gi, 'King Yama'],
  [/King of Hades/gi, 'King Yama'],
  [/Hell's Palace/gi, 'Palace of King Yama'],

  // 3. Moral & Buddhist Terminology
  [/high tribute and arrogance/gi, 'arrogance and conceit'],
  [/high tribute/gi, 'arrogance'],
  [/adultery/gi, 'sexual misconduct'],
  [/prostitution in the film industry/gi, 'lewdness and debauchery in the film industry'],
  [/borrowing Buddha to conserve their wealth/gi, 'exploiting Buddhism for illicit wealth'],
  [/borrow Buddhist teachings to save money/gi, 'exploiting Buddhism for illicit wealth'],
  [/borrowing Buddha to save money/gi, 'exploiting Buddhism for illicit wealth'],
  [/borrowing Buddha to collect money/gi, 'exploiting Buddhism for illicit wealth'],
  [/borrowing Buddha/gi, 'exploiting Buddhism'],
  [/Stage Chief Lu Quan Hoanh/gi, 'Master Lu Junhong'],
  [/Stage Chief Lu/gi, 'Master Lu Junhong'],
  [/Stage Chief/gi, 'Master Lu'],
  [/Dai Truong/gi, 'Master Lu'],
  [/Đài Trưởng/gi, 'Master Lu'],
  [/General Art of Mysteries/gi, 'Art of Totem and Metaphysics'],
  [/General Art of Metaphysics/gi, 'Art of Totem and Metaphysics'],
  [/Art of Mysteries/gi, 'Art of Totem and Metaphysics'],
  [/Dau Chien Thang Buddha/gi, 'Victorious Fighting Buddha'],
  [/Dau Chien Thang/gi, 'Victorious Fighting Buddha'],
  [/Dong Tu/gi, 'Tong Zi (Buddhist Disciple)'],
  [/Ji Cong Hoat Buddha/gi, 'Living Buddha Ji Gong'],
  [/Te Cong Hoat Buddha/gi, 'Living Buddha Ji Gong'],
  [/Guan De Palace/gi, 'Guan Di Palace'],
  [/Quan De Palace/gi, 'Guan Di Palace'],
  [/Guan De/gi, 'Guan Di'],
  [/Tai Tue Bodhisattva/gi, 'Tai Sui Bodhisattva'],
  [/Dharma Dharma Protector Bodhisattva/gi, 'Dharma Protector Bodhisattva'],
  [/Dharma Dharma Protector/gi, 'Dharma Protector'],
  [/Hau Ky/gi, 'Afterword'],
  [/Yang Yang people/gi, 'people in the human realm'],
  [/people of Duong/gi, 'people in the human world'],
  [/Duong people/gi, 'people in the human world'],
  [/Duong the/gi, 'the human world'],
  [/Ksitigarbha Temple/gi, 'Sacred Palace of Bodhisattva Kṣitigarbha'],
  [/Black Hell Hell/gi, 'Black Rope Hell (Kālasūtra)'],
  [/Black Hell/gi, 'Black Rope Hell'],
  [/Embracing Pillar Hell/gi, 'Copper Pillar Hell'],
  [/endless hell/gi, 'Avīci Hell (Relentless Hell)'],
  [/Hell without interruption/gi, 'Avīci Hell (Relentless Hell)'],
  [/Hell without Interruption/gi, 'Avīci Hell (Relentless Hell)'],
  [/blood lake hell/gi, 'Blood Pool Hell'],
  [/great Cauldron Hell/gi, 'Great Oil Cauldron Hell'],
  [/sharp ice hell/gi, 'Sharp Ice Hell'],
  [/snow mountain hell/gi, 'Snow Mountain Hell'],
  [/Iron Mountain Hell/gi, 'Iron Mountain Hell'],
  [/evil path/gi, 'evil destinies'],
  [/evil paths/gi, 'evil destinies'],
  [/spiritual bodies/gi, 'spiritual entities'],
  [/sinful spirits/gi, 'sinful souls'],
  [/sin of an unfaithful man/gi, 'sinful soul of an unfaithful man'],
  [/defaming the Buddha/gi, 'slandering the Buddha'],
  [/defaming the Dharma/gi, 'slandering the True Dharma'],
  [/defaming Buddha/gi, 'slandering the Buddha'],
  [/releasing animals/gi, 'liberating captive animals (life release)'],
  [/release animals/gi, 'liberating living beings (life release)'],
  [/vegetarian vow/gi, 'vow of vegetarianism'],
  [/making a vegetarian vow/gi, 'taking a vegetarian vow'],
  [/Small House\s*\(?XFZ\)?/gi, 'Little House (XFZ)'],
  [/\bSmall House\b/g, 'Little House (XFZ)'],
  [/\bSmall house\b/g, 'Little House (XFZ)'],
  [/White Discourse Buddhism/gi, 'Buddhism in Plain Terms'],
  [/White Discourse Buddhist Dharma/gi, 'Buddhism in Plain Terms'],
  [/Plain white Buddha Dharma/gi, 'Buddhism in Plain Terms']
];

function cleanString(str) {
  if (!str) return str;
  let s = str;
  for (const [pattern, replacement] of POST_CLEANUP_RULES) {
    s = s.replace(pattern, replacement);
  }
  return s;
}

const destDirs = [
  path.join(mobileRoot, 'static', 'offline-data', 'chapters-en'),
  path.join(mobileRoot, 'build', 'offline-data', 'chapters-en'),
  path.join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'public', 'offline-data', 'chapters-en'),
  path.join(mobileRoot, 'ios', 'App', 'App', 'public', 'offline-data', 'chapters-en')
];

console.log('=== TIẾN HÀNH HẬU KIỂM & CHUẨN HÓA VĂN PHONG PHẬT HỌC 5 SÁCH ===\n');

for (const bookId of BOOK_IDS) {
  const file = path.join(mobileRoot, 'static', 'offline-data', 'chapters-en', `${bookId}.json`);
  if (!fs.existsSync(file)) {
    console.warn(`Không tìm thấy file: ${file}`);
    continue;
  }

  const chapters = JSON.parse(fs.readFileSync(file, 'utf-8'));
  let changesCount = 0;

  for (const c of chapters) {
    const oldTitle = c.tieu_de;
    c.tieu_de = cleanString(c.tieu_de);
    if (c.tieu_de !== oldTitle) changesCount++;

    if (c.tom_tat) c.tom_tat = cleanString(c.tom_tat);
    if (c.noi_dung) c.noi_dung = cleanString(c.noi_dung);
  }

  const jsonContent = JSON.stringify(chapters, null, 2);

  for (const dir of destDirs) {
    try {
      if (fs.existsSync(path.dirname(dir))) {
        fs.mkdirSync(dir, { recursive: true });
        const target = path.join(dir, `${bookId}.json`);
        fs.writeFileSync(target, jsonContent, 'utf-8');
      }
    } catch {}
  }

  console.log(`✓ Đã chuẩn hóa ${bookId} (${chapters.length} chương, ${changesCount} tiêu đề được chỉnh trang nghiêm)`);
}

console.log('\n--- CẬP NHẬT METADATA OFFLINE-BOOKS-EN.JSON ---');
const enPath = path.join(mobileRoot, 'src', 'lib', 'data', 'offline-books-en.json');
let enData = JSON.parse(fs.readFileSync(enPath, 'utf-8'));

const entries = {
  'phat-tu-thien-dia-du-ky-quyen-1': {
    title: "Buddhist Disciple's Journey Through Heaven and Earth — Volume 1",
    author: 'Tong Zi (Buddhist Disciple)',
    summary:
      'Spiritual journeys through heavenly realms, the Sacred Realm of the Spiritual Pure Land, witnessing the hell realms, and the karmic trials before King Yama in the Underworld.'
  },
  'phat-tu-thien-dia-du-ky-quyen-2': {
    title: "Buddhist Disciple's Journey Through Heaven and Earth — Volume 2",
    author: 'Tong Zi (Buddhist Disciple)',
    summary:
      'Journeys to the Western Pure Land of Ultimate Bliss, receiving announcements from Buddhas and Bodhisattvas in the Heavens, and witnessing trials and lessons in the Underworld.'
  },
  'tt_chiem_sat_thien_ac_nghiep_bao': {
    title: 'Lectures on the Sutra of Divining Good and Evil Karmic Retribution',
    author: 'Venerable Master Meng Can',
    summary:
      'Profound lectures by Venerable Master Meng Can explaining the Sutra of Divining Good and Evil Karmic Retribution, detailing the methods of using the wooden divination wheels revealed by Kṣitigarbha Bodhisattva for karmic examination, sincere repentance, and cultivating liberating wisdom.'
  },
  'tt_dia_tang_thap_luan_kinh_q1': {
    title: 'Lectures on the Mahāyāna Great Collection Ten Wheels of Kṣitigarbha Sūtra — Volume 1',
    author: 'Venerable Master Meng Can',
    summary:
      "Lectures by Venerable Master Meng Can on Volume 1 of the Ten Wheels of Kṣitigarbha Sūtra, expounding the immense virtues of Kṣitigarbha Bodhisattva, revering the Triple Gem, upholding pure precepts, and protecting the Buddha's true Dharma."
  },
  'tt_dia_tang_thap_luan_kinh_q2': {
    title: 'Lectures on the Mahāyāna Great Collection Ten Wheels of Kṣitigarbha Sūtra — Volume 2',
    author: 'Venerable Master Meng Can',
    summary:
      'Lectures by Venerable Master Meng Can on Volume 2 of the Ten Wheels of Kṣitigarbha Sūtra, detailing the ten wholesome karmic paths, sincere repentance, the field of merit, and gradual attainment of enlightenment.'
  }
};

for (const [id, val] of Object.entries(entries)) {
  enData[id] = val;
  enData[`book_${id}`] = val;
}

fs.writeFileSync(enPath, JSON.stringify(enData, null, 2), 'utf-8');
console.log(`✓ Đã cập nhật ${enPath}`);

console.log('\n--- ĐỒNG BỘ DANH MỤC SẴN CÓ ---');
execFileSync('node', ['scripts/i18n/sync-english-coverage.mjs'], { stdio: 'inherit' });

console.log('\n🎉 HOÀN THÀNH TOÀN BỘ TIẾN TRÌNH HẬU KIỂM & ĐỒNG BỘ!');
