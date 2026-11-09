import fs from 'node:fs';
import path from 'node:path';

async function translateChunk(text, retries = 4) {
  const trimmed = text.trim();
  if (!trimmed) return text;
  // If chunk is just image tag or html tag without text
  if (/^!\[.*?\]\(.*?\)$/.test(trimmed) || /^<img\b[^>]*>$/i.test(trimmed)) {
    return text;
  }
  const url = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=vi&tl=en&q=' + encodeURIComponent(trimmed);
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && typeof data[0] === 'string') return data[0];
      }
    } catch {
      if (i === retries - 1) return text;
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return text;
}

// Split content into chunks that preserve paragraphs and markdown images
function splitContentIntoChunks(content, maxLen = 1400) {
  if (!content) return [];
  // Split on double newline or paragraph tags
  const blocks = content.split(/(\n\n+|<\/p>|<br\s*\/?>)/i);
  const chunks = [];
  let current = '';

  for (let i = 0; i < blocks.length; i++) {
    const block = blocks[i];
    if ((current + block).length > maxLen) {
      if (current.trim()) chunks.push(current);
      current = block;
    } else {
      current += block;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks;
}

async function translateText(text) {
  if (!text) return '';
  const chunks = splitContentIntoChunks(text);
  const CONCURRENCY = 6;
  const results = [];

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const translatedBatch = await Promise.all(batch.map((c) => translateChunk(c)));
    results.push(...translatedBatch);
    // Tiny delay to avoid rate limiting
    await new Promise((r) => setTimeout(r, 80));
  }
  return results.join('');
}

export async function translateBookById(bookId) {
  console.log(`\n=== DỊCH SÁCH: ${bookId} ===`);
  const srcFile = path.resolve(`static/offline-data/chapters/${bookId}.json`);
  if (!fs.existsSync(srcFile)) {
    console.error(`Không tìm thấy file nguồn: ${srcFile}`);
    return;
  }

  const chapters = JSON.parse(fs.readFileSync(srcFile, 'utf8'));
  console.log(`Số lượng chương: ${chapters.length}`);

  const outDir = path.resolve('static/offline-data/chapters-en');
  fs.mkdirSync(outDir, { recursive: true });
  const outFile = path.join(outDir, `${bookId}.json`);

  let existing = [];
  if (fs.existsSync(outFile)) {
    try {
      existing = JSON.parse(fs.readFileSync(outFile, 'utf8'));
    } catch {}
  }

  const translatedChapters = [];

  for (let i = 0; i < chapters.length; i++) {
    const chap = chapters[i];
    if (existing[i] && existing[i].noi_dung && existing[i].tieu_de) {
      console.log(`  [${i + 1}/${chapters.length}] Đã có sẵn: ${existing[i].tieu_de}`);
      translatedChapters.push(existing[i]);
      continue;
    }

    console.log(`  [${i + 1}/${chapters.length}] Đang dịch: ${chap.tieu_de}...`);
    const [titleEn, summaryEn, contentEn] = await Promise.all([
      translateChunk(chap.tieu_de),
      chap.tom_tat ? translateChunk(chap.tom_tat) : Promise.resolve(''),
      translateText(chap.noi_dung)
    ]);

    const item = {
      id: chap.id,
      bai_viet_id: chap.bai_viet_id,
      so_thu_tu: chap.so_thu_tu ?? i,
      tieu_de: titleEn,
      tom_tat: summaryEn,
      noi_dung: contentEn
    };
    translatedChapters.push(item);

    // Lưu tiến độ từng chương để nếu mất kết nối có thể tiếp tục
    fs.writeFileSync(outFile, JSON.stringify(translatedChapters, null, 2), 'utf8');
  }

  // Copy sang build và android
  const buildDir = path.resolve('build/offline-data/chapters-en');
  if (fs.existsSync(path.resolve('build'))) {
    fs.mkdirSync(buildDir, { recursive: true });
    fs.writeFileSync(path.join(buildDir, `${bookId}.json`), JSON.stringify(translatedChapters, null, 2), 'utf8');
  }
  const androidDir = path.resolve('android/app/src/main/assets/public/offline-data/chapters-en');
  if (fs.existsSync(androidDir)) {
    fs.writeFileSync(path.join(androidDir, `${bookId}.json`), JSON.stringify(translatedChapters, null, 2), 'utf8');
  }

  console.log(`✓ HOÀN THÀNH DỊCH SÁCH ${bookId}: ${translatedChapters.length} chương!`);
}

// Chạy trực tiếp nếu có đối số dòng lệnh
if (process.argv[1] && process.argv[1].endsWith('translate-book.mjs')) {
  const targetId = process.argv[2] || 'tt_1781081372340_1_xqcxo';
  translateBookById(targetId);
}
