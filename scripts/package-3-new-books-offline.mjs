import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BOOK_IDS = [
  'tt_chiem_sat_thien_ac_nghiep_bao',
  'tt_dia_tang_thap_luan_kinh_q1',
  'tt_dia_tang_thap_luan_kinh_q2'
];

const COVERS = [
  'chiem-sat-thien-ac-nghiep-bao.webp',
  'dia-tang-thap-luan-kinh-quyen-1.webp',
  'dia-tang-thap-luan-kinh-quyen-2.webp'
];

const mobileRoot = path.resolve('.');
const tutamMainRoot = path.resolve('../tutam-main');

console.log('=== ĐÓNG GÓI 3 SÁCH MỚI VÀO TUTAM-MOBILE OFFLINE BUNDLE ===\n');

// 1. SAO CHÉP ẢNH BÌA (COVERS)
console.log('1. Sao chép ảnh bìa vào static/covers và android assets...');
const coverDestDirs = [
  path.join(mobileRoot, 'static', 'covers'),
  path.join(mobileRoot, 'build', 'covers'),
  path.join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'public', 'covers')
];

for (const coverFile of COVERS) {
  const src = path.join(tutamMainRoot, 'static', 'covers', coverFile);
  if (!fs.existsSync(src)) {
    console.error(`  [LỖI] Không tìm thấy ảnh bìa nguồn: ${src}`);
    continue;
  }
  for (const destDir of coverDestDirs) {
    if (destDir.includes('build') && !fs.existsSync(path.join(mobileRoot, 'build'))) continue;
    if (destDir.includes('android') && !fs.existsSync(path.join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'public'))) continue;

    fs.mkdirSync(destDir, { recursive: true });
    const dest = path.join(destDir, coverFile);
    fs.copyFileSync(src, dest);
    console.log(`  ✓ Đã chép ${coverFile} -> ${path.relative(mobileRoot, dest)}`);
  }
}

// 2. TẢI TOÀN BỘ CHƯƠNG TỪ D1 VÀ LƯU VÀO offline-data/chapters/<id>.json
console.log('\n2. Tải toàn bộ nội dung các tập từ D1...');
const chapterDestDirs = [
  path.join(mobileRoot, 'static', 'offline-data', 'chapters'),
  path.join(mobileRoot, 'build', 'offline-data', 'chapters'),
  path.join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'public', 'offline-data', 'chapters')
];

for (const bookId of BOOK_IDS) {
  console.log(`  Đang lấy các chương cho ${bookId}...`);
  const query = `SELECT id, bai_viet_id, so_thu_tu, tieu_de, tom_tat, noi_dung FROM tap_noi_dung WHERE bai_viet_id = '${bookId}' ORDER BY so_thu_tu ASC;`;
  
  const env = { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' };
  const stdout = execSync(
    `npx wrangler d1 execute quangtu-db --remote --json --command "${query.replace(/"/g, '\\"')}"`,
    {
      cwd: tutamMainRoot,
      env,
      encoding: 'utf-8',
      shell: 'powershell.exe',
      maxBuffer: 60 * 1024 * 1024
    }
  );

  const jsonStart = stdout.indexOf('[');
  const jsonEnd = stdout.lastIndexOf(']');
  if (jsonStart === -1 || jsonEnd === -1) {
    throw new Error(`Không thể phân tích phản hồi JSON cho ${bookId}`);
  }

  const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
  const chapters = parsed[0]?.results || [];
  console.log(`  ✓ Đã lấy ${chapters.length} chương cho ${bookId}`);

  if (chapters.length === 0) {
    throw new Error(`Cảnh báo: không có chương nào được tìm thấy cho ${bookId}!`);
  }

  const jsonContent = JSON.stringify(chapters);
  const sizeMb = (Buffer.byteLength(jsonContent, 'utf-8') / 1024 / 1024).toFixed(2);

  for (const destDir of chapterDestDirs) {
    if (destDir.includes('build') && !fs.existsSync(path.join(mobileRoot, 'build'))) continue;
    if (destDir.includes('android') && !fs.existsSync(path.join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'public'))) continue;

    fs.mkdirSync(destDir, { recursive: true });
    const targetFile = path.join(destDir, `${bookId}.json`);
    fs.writeFileSync(targetFile, jsonContent, 'utf-8');
    console.log(`    -> Lưu ${path.relative(mobileRoot, targetFile)} (${sizeMb} MB)`);
  }
}

// 3. TẢI THÔNG TIN SÁCH (METADATA) TỪ BAIVIET VÀ CẬP NHẬT offline-bundled-articles.json
console.log('\n3. Tải thông tin sách từ D1 baiviet và cập nhật danh mục offline...');
const metaQuery = `SELECT id, tieu_de, tom_tat, noi_dung, danh_muc, tags, tac_gia, anh_url, noi_bat, ngay_dang, has_muc_luc, so_tap, trang_thai, tap_tieu_de, pdf_url, link_ngoai, created_at, updated_at FROM baiviet WHERE id IN ('${BOOK_IDS.join("','")}');`;

const env = { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' };
const metaStdout = execSync(
  `npx wrangler d1 execute quangtu-db --remote --json --command "${metaQuery.replace(/"/g, '\\"')}"`,
  {
    cwd: tutamMainRoot,
    env,
    encoding: 'utf-8',
    shell: 'powershell.exe',
    maxBuffer: 20 * 1024 * 1024
  }
);

const mStart = metaStdout.indexOf('[');
const mEnd = metaStdout.lastIndexOf(']');
const metaParsed = JSON.parse(metaStdout.slice(mStart, mEnd + 1));
const newBookRows = metaParsed[0]?.results || [];

console.log(`  ✓ Đã lấy thông tin ${newBookRows.length} sách từ baiviet`);

const bundlePaths = [
  path.join(mobileRoot, 'src', 'lib', 'data', 'offline-bundled-articles.json'),
  path.join(mobileRoot, 'static', 'offline-bundled-articles.json'),
  path.join(mobileRoot, 'build', 'offline-bundled-articles.json'),
  path.join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'public', 'offline-bundled-articles.json')
];

const mainBundlePath = bundlePaths[0];
let currentBundle = [];
if (fs.existsSync(mainBundlePath)) {
  currentBundle = JSON.parse(fs.readFileSync(mainBundlePath, 'utf-8'));
}

for (const row of newBookRows) {
  const existingIdx = currentBundle.findIndex((a) => a.id === row.id);
  const entry = {
    ...row,
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
  if (p.includes('build') && !fs.existsSync(path.join(mobileRoot, 'build'))) continue;
  if (p.includes('android') && !fs.existsSync(path.join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'public'))) continue;

  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, updatedBundleContent, 'utf-8');
  console.log(`  -> Ghi file bundle: ${path.relative(mobileRoot, p)} (${currentBundle.length} bài viết)`);
}

// 4. BỔ SUNG METADATA TIẾNG ANH (offline-books-en.json)
console.log('\n4. Bổ sung thông tin tiếng Anh cho 3 sách vào offline-books-en.json...');
const enPath = path.join(mobileRoot, 'src', 'lib', 'data', 'offline-books-en.json');
if (fs.existsSync(enPath)) {
  const enData = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
  enData['tt_chiem_sat_thien_ac_nghiep_bao'] = {
    title: 'Lectures on the Sutra of Divining Good and Evil Karmic Retribution',
    author: 'Venerable Master Meng Can',
    summary: 'Profound lectures by Venerable Master Meng Can explaining the Sutra of Divining Good and Evil Karmic Retribution, detailing the methods of using the wooden divination wheels revealed by Ksitigarbha Bodhisattva for karmic examination, deep repentance, and cultivating wisdom.'
  };
  enData['tt_dia_tang_thap_luan_kinh_q1'] = {
    title: 'Lectures on the Mahayana Great Collection Ten Wheels of Ksitigarbha Sutra — Volume 1',
    author: 'Venerable Master Meng Can',
    summary: 'Lectures by Venerable Master Meng Can on Volume 1 of the Ten Wheels of Ksitigarbha Sutra, expounding the immense virtues of Ksitigarbha Bodhisattva, upholding pure precepts, and protecting the Buddha\'s true Dharma.'
  };
  enData['tt_dia_tang_thap_luan_kinh_q2'] = {
    title: 'Lectures on the Mahayana Great Collection Ten Wheels of Ksitigarbha Sutra — Volume 2',
    author: 'Venerable Master Meng Can',
    summary: 'Lectures by Venerable Master Meng Can on Volume 2 of the Ten Wheels of Ksitigarbha Sutra, detailing the ten wholesome karmic paths, sincere repentance, the field of merit, and gradual attainment of enlightenment.'
  };
  fs.writeFileSync(enPath, JSON.stringify(enData, null, 2), 'utf-8');
  console.log(`  ✓ Đã cập nhật ${enPath}`);
}

console.log('\n=== HOÀN TẤT ĐÓNG GÓI DỮ LIỆU CỦA 3 SÁCH MỚI VÀO TUTAM-MOBILE! ===');
