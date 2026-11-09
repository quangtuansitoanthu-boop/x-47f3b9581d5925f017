/**
 * upload-practice-audio-r2.mjs
 * Script hỗ trợ tải các tệp âm thanh thiền (Nhạc Thiền 2, 3) và Âm thanh phụ trợ thiên nhiên
 * lên Cloudflare R2 bucket `quangtu` (prefix: `audio/practice/`).
 *
 * Yêu cầu:
 * - Đã cấu hình Wrangler CLI đăng nhập tài khoản Cloudflare
 *   hoặc có các biến môi trường R2 (R2_ACCESS_KEY_ID, R2_SECRET_ACCESS_KEY, R2_ENDPOINT).
 *
 * Cách chạy:
 *   node scripts/upload-practice-audio-r2.mjs
 */

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const root = process.cwd();
const bucketName = 'quangtu';
const targetPrefix = 'audio/practice';

const audioFiles = [
  { local: 'assets/audio/nhac-thien-01.m4a', r2: `${targetPrefix}/nhac-thien-01.m4a`, mime: 'audio/mp4' },
  { local: 'assets/audio/nhac-thien-02.m4a', r2: `${targetPrefix}/nhac-thien-02.m4a`, mime: 'audio/mp4' },
  { local: 'assets/audio/nhac-thien-03.m4a', r2: `${targetPrefix}/nhac-thien-03.m4a`, mime: 'audio/mp4' },
  { local: 'assets/audio/tieng-mo.m4a', r2: `${targetPrefix}/tieng-mo.m4a`, mime: 'audio/mp4' },
  { local: 'assets/audio/ambient/tieng-mua-roi.mp3', r2: `${targetPrefix}/ambient/tieng-mua-roi.mp3`, mime: 'audio/mpeg' },
  { local: 'assets/audio/ambient/tieng-on-trang.mp3', r2: `${targetPrefix}/ambient/tieng-on-trang.mp3`, mime: 'audio/mpeg' },
  { local: 'assets/audio/ambient/tieng-nuoc-chay.mp3', r2: `${targetPrefix}/ambient/tieng-nuoc-chay.mp3`, mime: 'audio/mpeg' },
  { local: 'assets/audio/ambient/tieng-troi-mua-lon.mp3', r2: `${targetPrefix}/ambient/tieng-troi-mua-lon.mp3`, mime: 'audio/mpeg' },
  { local: 'assets/audio/ambient/tieng-troi-mua-nhe.mp3', r2: `${targetPrefix}/ambient/tieng-troi-mua-nhe.mp3`, mime: 'audio/mpeg' },
  { local: 'assets/audio/ambient/am-thanh-mua-gio-va-sam-set.mp3', r2: `${targetPrefix}/ambient/am-thanh-mua-gio-va-sam-set.mp3`, mime: 'audio/mpeg' }
];

console.log('=== CHUẨN BỊ TẢI ÂM THANH THIỀN LÊN CLOUDFLARE R2 ===');
console.log(`Bucket: ${bucketName}`);
console.log(`Số tệp cần tải: ${audioFiles.length}`);

for (const item of audioFiles) {
  const localPath = path.join(root, item.local);
  if (!fs.existsSync(localPath)) {
    console.warn(`[Cảnh báo] Không tìm thấy file: ${item.local}`);
    continue;
  }
  const sizeMb = (fs.statSync(localPath).size / (1024 * 1024)).toFixed(2);
  console.log(`- ${item.local} (${sizeMb} MB) -> r2://${bucketName}/${item.r2}`);

  try {
    // Chạy wrangler r2 object put
    execFileSync('npx', [
      'wrangler', 'r2', 'object', 'put',
      `${bucketName}/${item.r2}`,
      `--file=${localPath}`,
      `--content-type=${item.mime}`,
      '--remote'
    ], {
      cwd: root,
      shell: process.platform === 'win32',
      stdio: 'inherit'
    });
    console.log(`✓ Thành công: ${item.r2}`);
  } catch (err) {
    console.error(`❌ Lỗi khi tải ${item.local}:`, err.message);
  }
}

console.log('=== HOÀN TẤT KIỂM TRA TẢI ÂM THANH R2 ===');
