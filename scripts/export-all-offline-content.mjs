import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RESTRICTED_KEYWORDS = [
  'muon kiep nhan sinh',
  'muôn kiếp nhân sinh',
  'tro ve tu xu tuyet',
  'trở về từ xứ tuyết'
];

function isRestricted(title) {
  const normalized = (title || '').toLowerCase().trim();
  return RESTRICTED_KEYWORDS.some((kw) => normalized.includes(kw));
}

console.log('=== BẮT ĐẦU XUẤT NỘI DUNG NGOẠI TUYẾN (OFFLINE BUNDLE) ===\n');

// 1. LẤY TOÀN BỘ BÀI VIẾT TỪ CLOUDFLARE D1
console.log('1. Đang tải danh sách bài viết / sách từ Cloudflare D1...');
const BATCH_SIZE = 20;
const allArticles = [];

for (let offset = 0; offset < 150; offset += BATCH_SIZE) {
  const query = `SELECT id, tieu_de, tom_tat, noi_dung, danh_muc, tags, tac_gia, anh_url, noi_bat, ngay_dang, has_muc_luc, so_tap, trang_thai, tap_tieu_de, pdf_url, link_ngoai, created_at, updated_at FROM baiviet ORDER BY created_at DESC LIMIT ${BATCH_SIZE} OFFSET ${offset};`;

  try {
    const stdout = execSync(`npx wrangler d1 execute quangtu-db --remote --json --command "${query.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      shell: 'powershell.exe',
      maxBuffer: 50 * 1024 * 1024,
      cwd: path.resolve('../tutam-main')
    });

    const jsonStart = stdout.indexOf('[');
    const jsonEnd = stdout.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
      const rows = parsed[0]?.results || [];
      if (rows.length === 0) break;
      allArticles.push(...rows);
      console.log(`  Đã tải ${allArticles.length} bài viết...`);
      if (rows.length < BATCH_SIZE) break;
    }
  } catch (err) {
    console.error(`  Lỗi tại offset ${offset}:`, err.message);
    break;
  }
}

console.log(`\nTổng số bài viết thô: ${allArticles.length}`);

// Lọc sách và loại trừ 4 cuốn theo yêu cầu
const bundledArticles = [];
let restrictedCount = 0;
let pdfCount = 0;
let nonPdfBookCount = 0;

for (const row of allArticles) {
  if (isRestricted(row.tieu_de)) {
    console.log(`  [LOẠI TRỪ THEO YÊU CẦU]: ${row.tieu_de}`);
    restrictedCount++;
    continue;
  }

  if (row.pdf_url && String(row.pdf_url).trim() !== '') {
    pdfCount++;
    bundledArticles.push({
      ...row,
      is_pdf_book: true,
      bundled_offline: false
    });
  } else {
    nonPdfBookCount++;
    bundledArticles.push({
      ...row,
      is_pdf_book: false,
      bundled_offline: true
    });
  }
}

console.log(`\nSố sách thường (không phải PDF) được đưa vào: ${nonPdfBookCount}`);
console.log(`Số sách PDF (tải theo nhu cầu): ${pdfCount}`);
console.log(`Số sách bị loại trừ: ${restrictedCount}`);

// Lưu danh sách bài viết
const articleTargetPaths = [
  path.resolve('src/lib/data/offline-bundled-articles.json'),
  path.resolve('build/offline-bundled-articles.json'),
  path.resolve('android/app/src/main/assets/public/offline-bundled-articles.json')
];

for (const p of articleTargetPaths) {
  fs.mkdirSync(path.dirname(p), { recursive: true });
  fs.writeFileSync(p, JSON.stringify(bundledArticles), 'utf-8');
  console.log(`Đã lưu danh mục: ${p} (${(fs.statSync(p).size / 1024 / 1024).toFixed(2)} MB)`);
}

// 2. LẤY TẤT CẢ CÁC CHƯƠNG TỪ tap_noi_dung CHO CÁC SÁCH THƯỜNG
console.log('\n2. Đang tải tất cả các chương nội dung (tap_noi_dung) từ Cloudflare D1...');

const CHAPTER_BATCH_SIZE = 150;
const allChapters = [];

for (let offset = 0; offset < 2500; offset += CHAPTER_BATCH_SIZE) {
  const chapterQuery = `SELECT id, bai_viet_id, so_thu_tu, tieu_de, tom_tat, noi_dung FROM tap_noi_dung WHERE bai_viet_id NOT IN ('tt_1781529439696', 'tt_1781529470187', 'tt_1781529533555', 'tt_tro_ve_tu_xu_tuyet') ORDER BY bai_viet_id ASC, so_thu_tu ASC LIMIT ${CHAPTER_BATCH_SIZE} OFFSET ${offset};`;

  try {
    const stdout = execSync(`npx wrangler d1 execute quangtu-db --remote --json --command "${chapterQuery.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      shell: 'powershell.exe',
      maxBuffer: 80 * 1024 * 1024,
      cwd: path.resolve('../tutam-main')
    });

    const jsonStart = stdout.indexOf('[');
    const jsonEnd = stdout.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
      const rows = parsed[0]?.results || [];
      if (rows.length === 0) break;
      allChapters.push(...rows);
      console.log(`  Đã tải ${allChapters.length} chương...`);
      if (rows.length < CHAPTER_BATCH_SIZE) break;
    }
  } catch (err) {
    console.error(`  Lỗi tải chương tại offset ${offset}:`, err.message);
    break;
  }
}

console.log(`\nTổng số chương nội dung đã tải: ${allChapters.length}`);

// Gom nhóm các chương theo từng cuốn sách
const chaptersByBook = new Map();
for (const chap of allChapters) {
  const bookId = chap.bai_viet_id;
  if (!chaptersByBook.has(bookId)) {
    chaptersByBook.set(bookId, []);
  }
  chaptersByBook.get(bookId).push(chap);
}

console.log(`Số cuốn sách có nhiều chương: ${chaptersByBook.size}`);

// Lưu từng cuốn sách thành file JSON riêng trong offline-data/chapters/
const chapterOutputDirs = [
  path.resolve('static/offline-data/chapters'),
  path.resolve('build/offline-data/chapters'),
  path.resolve('android/app/src/main/assets/public/offline-data/chapters')
];

for (const dir of chapterOutputDirs) {
  fs.mkdirSync(dir, { recursive: true });
}

let totalChapterBytes = 0;
for (const [bookId, chapters] of chaptersByBook.entries()) {
  const jsonContent = JSON.stringify(chapters);
  totalChapterBytes += Buffer.byteLength(jsonContent, 'utf-8');

  for (const dir of chapterOutputDirs) {
    fs.writeFileSync(path.join(dir, `${bookId}.json`), jsonContent, 'utf-8');
  }
}

console.log(`Đã xuất ${chaptersByBook.size} file chương sách (${(totalChapterBytes / 1024 / 1024).toFixed(2)} MB text).`);

// 3. SAO CHÉP ASSETS (AUDIO CHẾ ĐỘ THIỀN, TU TẬP, LOGO, COVERS, FONTS) VÀO APK
console.log('\n3. Đang sao chép âm thanh thiền, chuông mõ, logo app và phông chữ vào APK...');

const sourceAssetDir = path.resolve('../tutam-main/assets');
const targetPublicDir = path.resolve('android/app/src/main/assets/public/assets');
const targetBuildDir = path.resolve('build/assets');

const assetFolders = ['audio', 'branding', 'covers', 'fonts'];

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

for (const folder of assetFolders) {
  const src = path.join(sourceAssetDir, folder);
  copyDirRecursive(src, path.join(targetPublicDir, folder));
  copyDirRecursive(src, path.join(targetBuildDir, folder));
  console.log(`  Đã sao chép thư mục: assets/${folder}`);
}

console.log('\n=== HOÀN THÀNH XUẤT DỮ LIỆU OFFLINE CHO APK! ===');
