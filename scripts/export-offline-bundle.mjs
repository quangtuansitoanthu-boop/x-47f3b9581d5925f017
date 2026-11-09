import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const RESTRICTED_TITLES = [
  'muon kiep nhan sinh',
  'muôn kiếp nhân sinh',
  'tro ve tu xu tuyet',
  'trở về từ xứ tuyết'
];

function isRestricted(title) {
  const normalized = (title || '').toLowerCase().trim();
  return RESTRICTED_TITLES.some((t) => normalized.includes(t));
}

console.log('Exporting all published articles from Cloudflare D1 in batches...');

const BATCH_SIZE = 10;
const allArticles = [];

for (let offset = 0; offset < 95; offset += BATCH_SIZE) {
  const query = `SELECT id, tieu_de, tom_tat, noi_dung, danh_muc, tags, tac_gia, anh_url, noi_bat, ngay_dang, has_muc_luc, so_tap, trang_thai, tap_tieu_de, pdf_url, link_ngoai, created_at, updated_at FROM baiviet ORDER BY created_at DESC LIMIT ${BATCH_SIZE} OFFSET ${offset};`;

  console.log(`Fetching batch offset ${offset}...`);
  try {
    const stdout = execSync(`npx wrangler d1 execute quangtu-db --remote --json --command "${query.replace(/"/g, '\\"')}"`, {
      encoding: 'utf-8',
      shell: 'powershell.exe',
      maxBuffer: 50 * 1024 * 1024
    });

    const jsonStart = stdout.indexOf('[');
    const jsonEnd = stdout.lastIndexOf(']');
    if (jsonStart !== -1 && jsonEnd !== -1) {
      const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
      const rows = parsed[0]?.results || [];
      if (rows.length === 0) {
        console.log(`Reached end of data at offset ${offset}.`);
        break;
      }
      allArticles.push(...rows);
      console.log(`  Fetched ${rows.length} rows (accumulated: ${allArticles.length})`);
    } else {
      console.warn(`  Warning: Could not parse JSON for offset ${offset}`);
    }
  } catch (err) {
    console.error(`  Error at offset ${offset}:`, err.message);
  }
}

console.log(`Total fetched raw articles: ${allArticles.length}`);

const bundledArticles = [];
let restrictedCount = 0;
let pdfCount = 0;

for (const row of allArticles) {
  if (isRestricted(row.tieu_de)) {
    console.log(`[RESTRICTED - SKIPPED FROM OFFLINE BUNDLE]: ${row.tieu_de}`);
    restrictedCount++;
    continue;
  }

  if (row.pdf_url) {
    pdfCount++;
    bundledArticles.push({
      ...row,
      is_pdf_book: true,
      bundled_offline: false
    });
  } else {
    bundledArticles.push({
      ...row,
      is_pdf_book: false,
      bundled_offline: true
    });
  }
}

console.log(`\n=== BUNDLE SUMMARY ===`);
console.log(`Total articles processed: ${allArticles.length}`);
console.log(`Restricted books excluded: ${restrictedCount} (Online-only)`);
console.log(`PDF books (metadata only, downloadable on demand): ${pdfCount}`);
console.log(`Full-text offline books/sutras/rituals: ${bundledArticles.length - pdfCount}`);
console.log(`Total items in bundle: ${bundledArticles.length}`);

const targetPaths = [
  path.resolve('src/lib/data/offline-bundled-articles.json'),
  path.resolve('build/offline-bundled-articles.json'),
  path.resolve('android/app/src/main/assets/public/offline-bundled-articles.json')
];

for (const p of targetPaths) {
  const dir = path.dirname(p);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(p, JSON.stringify(bundledArticles), 'utf-8');
  console.log(`Saved: ${p} (${(fs.statSync(p).size / 1024 / 1024).toFixed(2)} MB)`);
}

console.log('Done!');
