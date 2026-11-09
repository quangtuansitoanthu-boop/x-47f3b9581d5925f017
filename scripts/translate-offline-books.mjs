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

const CURATED_TITLES = {
  'book_cfab6dea8430aada3d2cf19180dd4d27': 'Letters from the Pure Land',
  'book_c35b7e41c07303b630514153c39caa12': 'Homeland of Ultimate Bliss',
  'book_ceedb666ca679c312bb423ee2f5b7f20': 'The Path to Ultimate Bliss',
  'book_a470c0b867366dc5786112ce466a4a9e': 'Instructional Talks — Volume 1',
  'book_be52a401cd827d9b66bb9792b8db5044': 'Instructional Talks — Volume 2',
  'book_cce84c5d8dba6abfdcc4d4ea8103b727': 'Instructional Talks — Volume 3',
  'book_219ab04335d3bbfb165580fc8ac495e9': 'Instructional Talks — Volume 4',
  'book_e91ef5336221b1c48dde6341bf423bef': 'Instructional Talks — Volume 5',
  'book_e7e9e35131db441efd4819880623a11a': 'Instructional Talks — Volume 6',
  'book_771454f42e9c9ed649160d7bc83de117': 'Ten Essentials of Buddha Recitation',
  'book_1788147908838_8001cf50': 'Ten Essentials of Buddha Recitation — Master Thien Tam',
  'book_aeea64c77b4096fa80518c759d3337f6': 'Inspirational Stories of Ksitigarbha Bodhisattva',
  'book_362f4bce40f435b7a380d7e81e983c77': 'Miracles of Ksitigarbha Bodhisattva',
  'book_1d90dbea5600ee1738e90ae00ba76c17': 'Chronicles of the Ocean-Wide Holy Assembly',
  'book_a120238d492a12a35e72446e40b1a94f': 'Melodies of the Pure Lotus',
  'book_8d90cc08f2897b4fd7d5712cf1372e94': 'Dharma Words',
  'book_678c9f5cd97c7a9b9a08d3141b5fe468': 'Recorded Sayings',
  'book_6b7cbd19be84cb6627aa21760cb678d0': 'Great Compassion Mantra Commentary',
  'book_369d61f117d384734e11cbec91c78dcc': "Master Yinguang's Letters — Sequel",
  'book_5a8fc5fa07f9f2bc5f6d274442c787a1': 'Shurangama Mantra — Verses and Commentary',
  'book_03e41ad07b2192eab506b36f0456213a': 'Ksitigarbha Sutra Commentary',
  'tt_1781081372340_1_xqcxo': 'Mission of Liberation — 50 Karmic Stories of Deliverance',
  'tt_1781081525279_1_t5eqk': 'Modern Karmic Retribution — Volume 1',
  'tt_1781223481607_3_nojda': 'Modern Karmic Retribution — Volume 2',
  'tt_1781224456800_1_ufvqo': 'Modern Karmic Retribution — Volume 3',
  'tt_1781224543804_1_jr077': 'Modern Karmic Retribution — Volume 4',
  'tt_1781224598651_2_i3l0j': 'Modern Karmic Retribution — Volume 5',
  'tt_1781224618652_3_1ew56': 'Modern Karmic Retribution — Volume 6',
  'tt_1781224645656_4_ijyjs': 'Modern Karmic Retribution — Volume 7',
  'tt_1781224669960_5_wx8yf': 'Modern Karmic Retribution — Volume 8',
  'book_a47c6c21f218958e353d9bbb7f8fc74e': 'Karma Explained in Buddhism — Modern Retribution Vol 5',
  'tt_than_tang_thien_truc': 'Divine Monks of Ancient India',
  'tt_klngl_q01': 'Shurangama Sutra Explained — Volume 1',
  'tt_klngl_q02': 'Shurangama Sutra Explained — Volume 2',
  'tt_klngl_q03': 'Shurangama Sutra Explained — Volume 3',
  'tt_klngl_q04': 'Shurangama Sutra Explained — Volume 4',
  'tt_klngl_q05': 'Shurangama Sutra Explained — Volume 5',
  'tt_klngl_q06': 'Shurangama Sutra Explained — Volume 6',
  'tt_klngl_q07': 'Shurangama Sutra Explained — Volume 7',
  'tt_klngl_q08': 'Shurangama Sutra Explained — Volume 8',
  'tt_klngl_q09': 'Shurangama Sutra Explained — Volume 9',
  'tt_klngl_q10': 'Shurangama Sutra Explained — Volume 10',
  'tuyen-tap-phap-facebook-quang-tu': 'Selected Dharma Teachings from Facebook Quang Tu'
};

async function translateChunk(text, retries = 3) {
  const trimmed = text.trim();
  if (!trimmed) return text;
  const url = 'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=vi&tl=en&q=' + encodeURIComponent(trimmed);
  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && typeof data[0] === 'string') return data[0];
      }
    } catch {
      if (i === retries - 1) return text;
      await new Promise((r) => setTimeout(r, 600));
    }
  }
  return text;
}

async function translateHtml(html) {
  if (!html) return '';
  const parts = html.split(/(<\/p>|<br\s*\/?>|<\/h[1-6]>|<\/div>|<\/li>)/i);
  const chunks = [];
  let cur = '';
  for (let i = 0; i < parts.length; i += 2) {
    const p = parts[i] + (parts[i + 1] || '');
    if ((cur + p).length > 1500) {
      if (cur) chunks.push(cur);
      cur = p;
    } else {
      cur += p;
    }
  }
  if (cur) chunks.push(cur);

  const results = [];
  const BATCH = 6;
  for (let i = 0; i < chunks.length; i += BATCH) {
    const batch = chunks.slice(i, i + BATCH);
    const translated = await Promise.all(batch.map((c) => translateChunk(c)));
    results.push(...translated);
  }
  return results.join('');
}

async function main() {
  console.log('=== BẮT ĐẦU DỊCH BỘ SÁCH THƯỜNG THÀNH OFFLINE BUNDLE TIẾNG ANH ===\n');

  const articlesPath = path.resolve('src/lib/data/offline-bundled-articles.json');
  const articles = JSON.parse(fs.readFileSync(articlesPath, 'utf8'));

  const regularBooks = articles.filter((a) =>
    !a.is_pdf_book &&
    (a.danh_muc === 'SÁCH' || a.danh_muc === 'SÁCH KHUYẾN THIỆN' || a.danh_muc === 'KHÁC') &&
    !isRestricted(a.tieu_de)
  );

  // Sắp xếp: Ưu tiên các sách tiêu biểu và ngắn trước, bộ Facebook 518 bài để sau cùng
  regularBooks.sort((a, b) => {
    if (a.id === 'tuyen-tap-phap-facebook-quang-tu') return 1;
    if (b.id === 'tuyen-tap-phap-facebook-quang-tu') return -1;
    return (a.so_tap || 0) - (b.so_tap || 0);
  });

  console.log(`Tìm thấy ${regularBooks.length} cuốn sách thường cần đóng gói bản dịch.`);

  const outDirs = [
    path.resolve('static/offline-data/chapters-en'),
    path.resolve('build/offline-data/chapters-en'),
    path.resolve('android/app/src/main/assets/public/offline-data/chapters-en')
  ];
  for (const dir of outDirs) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const metaPath = path.resolve('src/lib/data/offline-books-en.json');
  let booksMetaEn = {};
  if (fs.existsSync(metaPath)) {
    try {
      booksMetaEn = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
    } catch {}
  }

  let totalBooksDone = 0;
  let totalChaptersTranslated = 0;

  for (let bIdx = 0; bIdx < regularBooks.length; bIdx++) {
    const book = regularBooks[bIdx];
    const srcChapterFile = path.resolve(`static/offline-data/chapters/${book.id}.json`);

    let chapters = [];
    if (fs.existsSync(srcChapterFile)) {
      chapters = JSON.parse(fs.readFileSync(srcChapterFile, 'utf8'));
    } else if (book.noi_dung) {
      chapters = [{
        id: `${book.id}_full`,
        bai_viet_id: book.id,
        so_thu_tu: 1,
        tieu_de: book.tieu_de,
        tom_tat: book.tom_tat || '',
        noi_dung: book.noi_dung
      }];
    }

    if (chapters.length === 0) continue;

    console.log(`\n[${bIdx + 1}/${regularBooks.length}] Đang xử lý: ${book.tieu_de} (${chapters.length} chương)...`);

    // Lưu metadata tiếng Anh
    const curatedTitle = CURATED_TITLES[book.id];
    if (!booksMetaEn[book.id] || (curatedTitle && booksMetaEn[book.id].title !== curatedTitle)) {
      const [titleEn, summaryEn] = await Promise.all([
        curatedTitle ? Promise.resolve(curatedTitle) : translateChunk(book.tieu_de),
        book.tom_tat ? translateChunk(book.tom_tat) : Promise.resolve('')
      ]);
      booksMetaEn[book.id] = {
        title: titleEn,
        summary: summaryEn,
        author: book.tac_gia || ''
      };
      fs.writeFileSync(metaPath, JSON.stringify(booksMetaEn, null, 2), 'utf8');
      console.log(`  -> Tiêu đề tiếng Anh: "${titleEn}"`);
    }

    // Check if chapters-en already translated
    const outTarget = path.join(outDirs[0], `${book.id}.json`);
    let translatedChapters = [];
    if (fs.existsSync(outTarget)) {
      try {
        translatedChapters = JSON.parse(fs.readFileSync(outTarget, 'utf8'));
      } catch {}
    }

    if (translatedChapters.length === chapters.length) {
      console.log(`  -> Đã có sẵn bản dịch đầy đủ (${translatedChapters.length} chương). Bỏ qua.`);
      totalBooksDone++;
      continue;
    }

    const chapMap = new Map(translatedChapters.map((c) => [c.id || c.so_thu_tu, c]));
    const finalChapters = [];

    for (let cIdx = 0; cIdx < chapters.length; cIdx++) {
      const chap = chapters[cIdx];
      const key = chap.id || chap.so_thu_tu;
      if (chapMap.has(key)) {
        finalChapters.push(chapMap.get(key));
        continue;
      }

      process.stdout.write(`  Chương ${cIdx + 1}/${chapters.length}: ${chap.tieu_de.slice(0, 35)}... `);
      const t0 = Date.now();
      const [tEn, sEn, cEn] = await Promise.all([
        translateChunk(chap.tieu_de || `Chapter ${cIdx + 1}`),
        chap.tom_tat ? translateChunk(chap.tom_tat) : Promise.resolve(''),
        translateHtml(chap.noi_dung)
      ]);

      const translatedChap = {
        ...chap,
        tieu_de: tEn,
        tom_tat: sEn,
        noi_dung: cEn
      };
      finalChapters.push(translatedChap);
      totalChaptersTranslated++;
      console.log(`✓ (${((Date.now() - t0) / 1000).toFixed(1)}s)`);

      // Save periodically to avoid losing progress
      if ((cIdx + 1) % 5 === 0 || cIdx === chapters.length - 1) {
        const jsonStr = JSON.stringify(finalChapters);
        for (const dir of outDirs) {
          fs.writeFileSync(path.join(dir, `${book.id}.json`), jsonStr, 'utf8');
        }
      }
    }

    // Final save for this book across all output dirs
    const jsonStr = JSON.stringify(finalChapters);
    for (const dir of outDirs) {
      fs.writeFileSync(path.join(dir, `${book.id}.json`), jsonStr, 'utf8');
    }
    totalBooksDone++;
  }

  // Copy metadata file to build and android
  const metaOutDirs = [
    path.resolve('build/offline-books-en.json'),
    path.resolve('android/app/src/main/assets/public/offline-books-en.json')
  ];
  for (const mOut of metaOutDirs) {
    fs.mkdirSync(path.dirname(mOut), { recursive: true });
    fs.copyFileSync(metaPath, mOut);
  }

  console.log(`\n=== HOÀN TẤT! Đã dịch ${totalBooksDone} cuốn sách (${totalChaptersTranslated} chương mới) ===`);
}

main().catch((err) => {
  console.error('Lỗi quy trình:', err);
  process.exit(1);
});
