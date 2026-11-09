import fs from 'node:fs';
import path from 'node:path';

const mobileRoot = path.resolve('.');
const tutamMainRoot = path.resolve('../tutam-main');

console.log('=== ĐÓNG GÓI SÁCH MỚI TRÊN WEB VÀO OFFLINE TUTAM-MOBILE ===\n');

// 1. SAO CHÉP ẢNH BÌA
const covers = [
  'phat-tu-thien-dia-du-ky-quyen-1.webp',
  'phat-tu-thien-dia-du-ky-quyen-2.webp',
  'chiem-sat-thien-ac-nghiep-bao.webp',
  'dia-tang-thap-luan-kinh-quyen-1.webp',
  'dia-tang-thap-luan-kinh-quyen-2.webp'
];

const coverDestDirs = [
  path.join(mobileRoot, 'static', 'covers'),
  path.join(mobileRoot, 'build', 'covers'),
  path.join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'public', 'covers')
];

for (const coverFile of covers) {
  const src = path.join(tutamMainRoot, 'static', 'covers', coverFile);
  if (!fs.existsSync(src)) {
    console.warn(`  [Cảnh báo] Không tìm thấy ảnh bìa nguồn: ${src}`);
    continue;
  }
  for (const destDir of coverDestDirs) {
    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, coverFile);
    fs.copyFileSync(src, dest);
  }
  console.log(`  ✓ Đã đồng bộ ảnh bìa: ${coverFile}`);
}

// 2. LẤY DỮ LIỆU CHƯƠNG VÀ METADATA TỪ DUMP / TUTAM-MAIN
const dumpPath = 'C:/Users/Admin/.gemini/antigravity/brain/ccc09c5a-9d78-4647-a266-ef99ea5e3d30/scratch/du-ky-d1-dump.json';
let q1Chapters, q2Chapters, meta;

if (fs.existsSync(dumpPath)) {
  const dump = JSON.parse(fs.readFileSync(dumpPath, 'utf8'));
  q1Chapters = dump.q1Chapters;
  q2Chapters = dump.q2Chapters;
  meta = dump.meta;
} else {
  throw new Error('Không tìm thấy dump D1: ' + dumpPath);
}

// Lưu chapters file
const chapterDestDirs = [
  path.join(mobileRoot, 'static', 'offline-data', 'chapters'),
  path.join(mobileRoot, 'build', 'offline-data', 'chapters'),
  path.join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'public', 'offline-data', 'chapters')
];

for (const [bookId, chapters] of [
  ['phat-tu-thien-dia-du-ky-quyen-1', q1Chapters],
  ['phat-tu-thien-dia-du-ky-quyen-2', q2Chapters]
]) {
  const jsonContent = JSON.stringify(chapters);
  const sizeMb = (Buffer.byteLength(jsonContent, 'utf-8') / 1024 / 1024).toFixed(2);
  for (const destDir of chapterDestDirs) {
    fs.mkdirSync(destDir, { recursive: true });
    const targetFile = path.join(destDir, `${bookId}.json`);
    fs.writeFileSync(targetFile, jsonContent, 'utf-8');
  }
  console.log(`  ✓ Đã ghi ${chapters.length} chương cho ${bookId} (${sizeMb} MB)`);
}

// 3. CẬP NHẬT offline-bundled-articles.json
const bundlePaths = [
  path.join(mobileRoot, 'src', 'lib', 'data', 'offline-bundled-articles.json'),
  path.join(mobileRoot, 'static', 'offline-bundled-articles.json'),
  path.join(mobileRoot, 'build', 'offline-bundled-articles.json'),
  path.join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'public', 'offline-bundled-articles.json')
];

const mainBundlePath = bundlePaths[0];
let currentBundle = JSON.parse(fs.readFileSync(mainBundlePath, 'utf-8'));

for (const row of meta) {
  const existingIdx = currentBundle.findIndex((a) => a.id === row.id);
  const entry = {
    ...row,
    anh_url: `covers/${path.basename(row.anh_url)}`,
    is_pdf_book: false,
    bundled_offline: true
  };
  if (existingIdx >= 0) {
    currentBundle[existingIdx] = entry;
    console.log(`  ✓ Cập nhật metadata: ${row.tieu_de} (${row.id})`);
  } else {
    currentBundle.push(entry);
    console.log(`  ✓ Thêm mới metadata: ${row.tieu_de} (${row.id})`);
  }
}

const updatedBundleContent = JSON.stringify(currentBundle);
for (const p of bundlePaths) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, updatedBundleContent, 'utf-8');
  console.log(`  -> Ghi file: ${path.relative(mobileRoot, p)} (${currentBundle.length} bài viết)`);
}

// 4. CẬP NHẬT offline-books-vi.json
const viPath = path.join(mobileRoot, 'src', 'lib', 'data', 'offline-books-vi.json');
let viData = {};
if (fs.existsSync(viPath)) {
  viData = JSON.parse(fs.readFileSync(viPath, 'utf8'));
}

const viEntries = {
  'phat-tu-thien-dia-du-ky-quyen-1': {
    title: 'Phật Tử Thiên Địa Du Ký - Quyển 1',
    author: 'Đồng Tử',
    summary: 'Tuyển tập du hành cõi Thiên Giới, Thánh Cảnh Tâm Linh Tịnh Thổ Quán Âm, chứng kiến các tầng Địa Ngục và việc thẩm phán thiện ác nhân quả tại Địa Phủ Diêm Vương.'
  },
  'phat-tu-thien-dia-du-ky-quyen-2': {
    title: 'Phật Tử Thiên Địa Du Ký - Quyển 2',
    author: 'Đồng Tử',
    summary: 'Du hành Tây Phương Cực Lạc, Thánh Cảnh Tâm Linh Tịnh Thổ, nghe thông cáo của chư Phật Bồ Tát tại Thiên Giới, và chứng kiến các vụ thẩm xét tội linh tại Địa Phủ Diêm Vương.'
  },
  'tt_chiem_sat_thien_ac_nghiep_bao': {
    title: 'LƯỢC GIẢNG KINH CHIÊM SÁT THIỆN ÁC NGHIỆP BÁO',
    author: 'HT. Thích Mộng Tham chủ giảng',
    summary: 'Kinh Chiêm Sát Thiện Ác Nghiệp Báo do Bồ Tát Địa Tạng chỉ dạy pháp dùng ba loại Chiêm Sát Luân để thẩm tra thiện ác ba đời, sám hối diệt trừ tội chướng và tu hành hai loại quán đạo khai mở trí huệ giải thoát.'
  },
  'tt_dia_tang_thap_luan_kinh_q1': {
    title: 'ĐẠI THỪA ĐẠI TẬP ĐỊA TẠNG THẬP LUÂN KINH GIẢNG KÝ - QUYỂN 1',
    author: 'HT. Thích Mộng Tham chủ giảng',
    summary: 'Bộ kinh xiển dương oai đức và đại nguyện cứu bạt thập phương của Bồ Tát Địa Tạng, hộ trì chánh pháp, phá trừ mười điều ác và giữ giới thanh tịnh.'
  },
  'tt_dia_tang_thap_luan_kinh_q2': {
    title: 'ĐẠI THỪA ĐẠI TẬP ĐỊA TẠNG THẬP LUÂN KINH GIẢNG KÝ - QUYỂN 2',
    author: 'HT. Thích Mộng Tham chủ giảng',
    summary: 'Bộ kinh giảng giải chi tiết về mười nghiệp thiện, sám hối nghiệp chướng, ruộng phước vô lượng và con đường chứng đắc Bồ Đề.'
  }
};

for (const [id, val] of Object.entries(viEntries)) {
  viData[id] = val;
  viData[`book_${id}`] = val;
}
fs.writeFileSync(viPath, JSON.stringify(viData, null, 2), 'utf8');
console.log(`  ✓ Đã cập nhật ${viPath}`);

// 5. CẬP NHẬT offline-books-en.json
const enPath = path.join(mobileRoot, 'src', 'lib', 'data', 'offline-books-en.json');
if (fs.existsSync(enPath)) {
  const enData = JSON.parse(fs.readFileSync(enPath, 'utf8'));
  const enEntries = {
    'phat-tu-thien-dia-du-ky-quyen-1': {
      title: "Buddhist Disciple's Journey Through Heaven and Earth — Volume 1",
      author: 'Tong Zi (Buddhist Disciple)',
      summary: 'A spiritual journey through heavenly realms, the Guan Yin Pure Land, witnessing the realms of hell, and the karmic trials before King Yama in the Underworld.'
    },
    'phat-tu-thien-dia-du-ky-quyen-2': {
      title: "Buddhist Disciple's Journey Through Heaven and Earth — Volume 2",
      author: 'Tong Zi (Buddhist Disciple)',
      summary: 'Journeys to the Western Pure Land of Ultimate Bliss, the Spiritual Pure Land, receiving announcements from Buddhas and Bodhisattvas in the Heavens, and witnessing trials in the Underworld.'
    }
  };
  for (const [id, val] of Object.entries(enEntries)) {
    enData[id] = val;
    enData[`book_${id}`] = val;
  }
  fs.writeFileSync(enPath, JSON.stringify(enData, null, 2), 'utf8');
  console.log(`  ✓ Đã cập nhật ${enPath}`);
}

console.log('\n=== HOÀN TẤT ĐÓNG GÓI TẤT CẢ SÁCH MỚI! ===');
