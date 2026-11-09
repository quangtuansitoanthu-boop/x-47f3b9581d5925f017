import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const BOOK_IDS = [
  'tt_1781529439696',
  'tt_1781529470187',
  'tt_1781529533555',
  'tt_tro_ve_tu_xu_tuyet'
];

console.log('Fetching chapters for missing books from D1...');

for (const bookId of BOOK_IDS) {
  const query = `SELECT id, bai_viet_id, so_thu_tu, tieu_de, tom_tat, noi_dung FROM tap_noi_dung WHERE bai_viet_id = '${bookId}' ORDER BY so_thu_tu ASC;`;
  console.log(`Fetching chapters for ${bookId}...`);
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
      console.log(`  Got ${rows.length} chapters for ${bookId}`);

      const outPath = path.resolve(`static/offline-data/chapters/${bookId}.json`);
      fs.mkdirSync(path.dirname(outPath), { recursive: true });
      fs.writeFileSync(outPath, JSON.stringify(rows), 'utf-8');
      console.log(`  Saved to ${outPath} (${(fs.statSync(outPath).size / 1024).toFixed(1)} KB)`);

      // Also copy to build if it exists
      const buildPath = path.resolve(`build/offline-data/chapters/${bookId}.json`);
      if (fs.existsSync(path.resolve('build'))) {
        fs.mkdirSync(path.dirname(buildPath), { recursive: true });
        fs.writeFileSync(buildPath, JSON.stringify(rows), 'utf-8');
      }

      // Also copy to android assets if it exists
      const androidPath = path.resolve(`android/app/src/main/assets/public/offline-data/chapters/${bookId}.json`);
      if (fs.existsSync(path.resolve('android/app/src/main/assets/public'))) {
        fs.mkdirSync(path.dirname(androidPath), { recursive: true });
        fs.writeFileSync(androidPath, JSON.stringify(rows), 'utf-8');
      }
    }
  } catch (err) {
    console.error(`  Error fetching ${bookId}:`, err.message);
  }
}

// Also fetch article metadata for these 4 books and add them to offline-bundled-articles.json if missing
console.log('Checking article metadata for missing books...');
const metaQuery = `SELECT id, tieu_de, tom_tat, noi_dung, danh_muc, tags, tac_gia, anh_url, noi_bat, ngay_dang, has_muc_luc, so_tap, trang_thai, tap_tieu_de, pdf_url, link_ngoai, created_at, updated_at FROM baiviet WHERE id IN ('${BOOK_IDS.join("','")}');`;

try {
  const stdout = execSync(`npx wrangler d1 execute quangtu-db --remote --json --command "${metaQuery.replace(/"/g, '\\"')}"`, {
    encoding: 'utf-8',
    shell: 'powershell.exe',
    maxBuffer: 50 * 1024 * 1024
  });

  const jsonStart = stdout.indexOf('[');
  const jsonEnd = stdout.lastIndexOf(']');
  if (jsonStart !== -1 && jsonEnd !== -1) {
    const parsed = JSON.parse(stdout.slice(jsonStart, jsonEnd + 1));
    const metaRows = parsed[0]?.results || [];
    console.log(`Got ${metaRows.length} metadata rows.`);

    const bundlePath = path.resolve('src/lib/data/offline-bundled-articles.json');
    let bundle = [];
    if (fs.existsSync(bundlePath)) {
      bundle = JSON.parse(fs.readFileSync(bundlePath, 'utf-8'));
    }

    const existingIds = new Set(bundle.map((a) => a.id));
    let added = 0;
    for (const row of metaRows) {
      if (!existingIds.has(row.id)) {
        bundle.push({
          ...row,
          is_pdf_book: false,
          bundled_offline: true
        });
        added++;
      }
    }

    console.log(`Added ${added} books to offline bundle.`);
    fs.writeFileSync(bundlePath, JSON.stringify(bundle), 'utf-8');

    // Also update build and android paths
    const buildBundle = path.resolve('build/offline-bundled-articles.json');
    if (fs.existsSync(path.resolve('build'))) {
      fs.writeFileSync(buildBundle, JSON.stringify(bundle), 'utf-8');
    }
    const androidBundle = path.resolve('android/app/src/main/assets/public/offline-bundled-articles.json');
    if (fs.existsSync(path.resolve('android/app/src/main/assets/public'))) {
      fs.writeFileSync(androidBundle, JSON.stringify(bundle), 'utf-8');
    }
  }
} catch (err) {
  console.error('Error fetching metadata:', err.message);
}

console.log('Done export missing books!');
