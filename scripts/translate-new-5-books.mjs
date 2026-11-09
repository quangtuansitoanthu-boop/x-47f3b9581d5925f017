import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

const mobileRoot = path.resolve('.');

const BOOK_IDS = [
  'phat-tu-thien-dia-du-ky-quyen-1',
  'phat-tu-thien-dia-du-ky-quyen-2',
  'tt_chiem_sat_thien_ac_nghiep_bao',
  'tt_dia_tang_thap_luan_kinh_q1',
  'tt_dia_tang_thap_luan_kinh_q2'
];

// Curated titles for specific books where exact English chapter titles are known
const CURATED_TITLES = {
  'tt_dia_tang_thap_luan_kinh_q1': {
    0: 'Prologue: Origins & Core Significance of Expounding the Ten Wheels Sūtra',
    1: 'Chapter 1: Introductory Chapter (Manifestation of Spiritual Powers & Gathering of the Great Assembly)',
    2: 'Chapter 2: The Ten Wheels (Ten Wheels of Relieving Suffering & Delivering Sentient Beings)',
    3: 'Chapter 3: Practice Without Reliance (Revering the Triple Gem & Majestic Virtue of Bhikṣus)'
  },
  'tt_dia_tang_thap_luan_kinh_q2': {
    0: 'Chapter 4: Practice With Reliance (Pratyekabuddha Vehicle & Bodhisattva Practice Wheel)',
    1: 'Chapter 5: Repentance (Eradicating Fundamental Karmic Obstacles)',
    2: 'Chapter 6: The Path of Wholesome Karma (The Ten Wholesome Deeds Fulfilling Bodhi)',
    3: 'Chapter 7: Characteristics of the Field of Merit (The Pure Field of Merit of Renunciants)',
    4: 'Chapter 8: Bestowal of Benefits and Entrustment (Upholding, Propagating & Fulfilling Auspicious Benefits)',
    5: 'Appendix I: Miraculous Responses of Kṣitigarbha Bodhisattva in the Twentieth Century',
    6: 'Appendix II: Miraculous Responses of Kṣitigarbha Bodhisattva Through Ancient and Modern Times'
  },
  'tt_chiem_sat_thien_ac_nghiep_bao': {
    0: 'Lecture 1: Origins & Core Significance of Expounding the Sūtra',
    1: 'Lecture 2: The Skillful Application of the Mind & Eliminating Doubts',
    2: 'Lecture 3: Clarifying Doubts on Divination vs. Precepts',
    3: 'Lecture 4: Sincere Repentance & The Power of Kṣitigarbha Bodhisattva',
    4: 'Lecture 5: The Three Sets of Divination Wheels & Karmic Signs',
    5: 'Lecture 6: Deep Examination of Body, Speech, and Mind Karma',
    6: 'Lecture 7: Ten Wholesome Paths & The Method of Wheel Divination',
    7: 'Lecture 8: Purifying the Sense Faculties and Transgressions',
    8: 'Lecture 9: Sincere Vows & Spiritual Responses in Divination',
    9: 'Lecture 10: Contemplation on Karmic Retribution and Empty Nature',
    10: 'Lecture 11: The Third Set of Wheels: Divining Worldly and Transcendent Events',
    11: 'Lecture 12: Understanding the 189 Divination Numerals',
    12: 'Lecture 13: Two Methods of Contemplative Practice (Quán Đạo)',
    13: 'Lecture 14: Contemplation of the One Reality Realm (Nhất Thực Cảnh Giới Quán)',
    14: 'Lecture 15: Contemplation of Consciousness-Only (Duy Tâm Thức Quán)',
    15: 'Lecture 16: Practical Instructions for Using the Divination Wheels',
    16: 'Lecture 17: Generating the Unsurpassed Bodhi Mind',
    17: 'Lecture 18: Final Exhortations & Fulfilling the Teachings'
  }
};

const BUDDHIST_GLOSSARY = [
  // 1. Extreme MT Artifacts & Vulgarisms
  [/extremely orgastic/gi, 'Ultimate Bliss'],
  [/extreme orgasm/gi, 'Ultimate Bliss'],
  [/orgastic/gi, 'Ultimate Bliss'],
  [/Land of Extremely Orgastic/gi, 'Land of Ultimate Bliss'],
  [/Land of Extreme Orgasm/gi, 'Land of Ultimate Bliss'],
  [/Western Extremely Blissful Land/gi, 'Western Land of Ultimate Bliss'],
  [/Western Extreme Bliss/gi, 'Western Land of Ultimate Bliss'],
  [/Episode\s+(\d+)/gi, 'Lecture $1'],

  // Mantras & "Chú" -> never "Uncle"
  [/Uncle Lăng Nghiêm/gi, 'Śūraṅgama Mantra'],
  [/Uncle Đại Bi/gi, 'Great Compassion Mantra'],
  [/Uncle Chuẩn Đề/gi, 'Cundī Dhāraṇī'],
  [/Uncle Dược Sư/gi, 'Medicine Buddha Mantra'],
  [/Uncle Vãng Sanh/gi, 'Rebirth Dhāraṇī'],
  [/Uncle Vãng Sinh/gi, 'Rebirth Dhāraṇī'],
  [/Uncle Thần Chú/gi, 'Mantra'],
  [/\bUncle\s+([A-ZÁÀẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ])/g, 'Mantra $1'],
  [/\bholding uncle\b/gi, 'reciting mantras'],
  [/\bholding uncles\b/gi, 'reciting mantras'],
  [/\bchanting uncle\b/gi, 'reciting the mantra'],
  [/\breciting uncle\b/gi, 'reciting the mantra'],
  [/\breading uncle\b/gi, 'reciting the mantra'],

  // Karmic Creditors
  [/LEFT HOLDER OAN/gi, 'Karmic Creditors'],
  [/holder oan/gi, 'karmic creditor'],
  [/holder of injustice/gi, 'karmic creditor'],
  [/creditors of unjust resentment/gi, 'karmic creditors'],
  [/resentment of the host of negative forces/gi, 'karmic creditors'],
  [/repayments of grudge on oneself/gi, 'karmic creditors'],
  [/\boan gia trái chủ\b/gi, 'karmic creditors'],
  [/\boan gia\b/gi, 'karmic creditors'],

  // Underworld & King Yama
  [/\bground government\b/gi, 'the Underworld'],
  [/\bnegative government\b/gi, 'the Underworld'],
  [/\bnether government\b/gi, 'the Underworld'],
  [/\bland government\b/gi, 'the Underworld'],
  [/\bKing Diem\b/gi, 'King Yama'],
  [/\bDiem King\b/gi, 'King Yama'],
  [/\bKing of Hell Diem\b/gi, 'King Yama'],
  [/\bDiem Vuong\b/gi, 'King Yama'],
  [/\bYama King\b/gi, 'King Yama'],
  [/\bDiem La Thien Tu\b/gi, 'Emperor Yama'],
  [/\bPalace of Diem\b/gi, 'Palace of King Yama'],
  [/\bPalace of King Diem\b/gi, 'Palace of King Yama'],
  [/\bĐiện Diêm Vương\b/gi, 'Palace of King Yama'],

  // Buddhas, Bodhisattvas, Masters
  [/Our Teacher Shakyamuni Buddha/gi, 'Our Fundamental Teacher Śākyamuni Buddha'],
  [/Teacher Shakyamuni Buddha/gi, 'Fundamental Teacher Śākyamuni Buddha'],
  [/From Father Amitabha Buddha/gi, 'Our Compassionate Father Amitābha Buddha'],
  [/Compassionate Father Amitabha Buddha/gi, 'Our Compassionate Father Amitābha Buddha'],
  [/Amitabha Buddha/gi, 'Amitābha Buddha'],
  [/Shakyamuni Buddha/gi, 'Śākyamuni Buddha'],
  [/Avalokitesvara Bodhisattva/gi, 'Guan Yin Bodhisattva (Avalokiteśvara)'],
  [/Avalokiteshvara Bodhisattva/gi, 'Guan Yin Bodhisattva (Avalokiteśvara)'],
  [/Bodhisattva of Earth Store/gi, 'Kṣitigarbha Bodhisattva'],
  [/Earth Store Bodhisattva/gi, 'Kṣitigarbha Bodhisattva'],
  [/Earth Store King Bodhisattva/gi, 'Kṣitigarbha Bodhisattva'],
  [/Bodhisattva Kien Tinh Tin/gi, 'Bodhisattva Firm and Pure Faith (Dṛḍhamati)'],
  [/Kien Tinh Tin Bodhisattva/gi, 'Bodhisattva Firm and Pure Faith (Dṛḍhamati)'],
  [/Venerable Master Thich Mong Tham/gi, 'Venerable Master Meng Can'],
  [/Venerable Thich Mong Tham/gi, 'Venerable Master Meng Can'],
  [/Master Thich Mong Tham/gi, 'Venerable Master Meng Can'],
  [/Thich Mong Tham/gi, 'Master Meng Can'],
  [/Living Buddha Te Cong/gi, 'Living Buddha Ji Gong'],
  [/Quan De Bodhisattva/gi, 'Guan Di Bodhisattva'],
  [/Thai Tue Bodhisattva/gi, 'Tai Sui Bodhisattva'],
  [/Fighting and Winning Buddha/gi, 'Victorious Fighting Buddha'],
  [/Battle-winning Buddha/gi, 'Victorious Fighting Buddha'],
  [/Victorious Fighting Buddha/gi, 'Victorious Fighting Buddha'],
  [/Protector Bodhisattva/gi, 'Dharma Protector Bodhisattva'],

  // Du Ký & Tâm Linh specific terms
  [/Pure Land Spiritual Realm/gi, 'Sacred Realm of the Spiritual Pure Land'],
  [/Spiritual Pure Land Realm/gi, 'Sacred Realm of the Spiritual Pure Land'],
  [/Holy Land of the Spiritual Mind/gi, 'Sacred Realm of the Spiritual Pure Land'],
  [/Holy Land of Spiritual Pure Land/gi, 'Sacred Realm of the Spiritual Pure Land'],
  [/Spiritual Pure Land Holy Land/gi, 'Sacred Realm of the Spiritual Pure Land'],
  [/Eight Merits Water/gi, 'Eightfold Merit Water'],
  [/Water of Merit/gi, 'Eightfold Merit Water'],
  [/Seven Treasure Pond/gi, 'Seven-Jeweled Pond'],
  [/Seven Treasures Pond/gi, 'Seven-Jeweled Pond'],
  [/Mirror of sin/gi, 'Mirror of Karmic Retribution (Nghiệt Cảnh Đài)'],
  [/Sin Mirror/gi, 'Mirror of Karmic Retribution'],
  [/Small House\s*\(?XFZ\)?/gi, 'Little House (XFZ)'],
  [/\bSmall House\b/g, 'Little House (XFZ)'],
  [/\bSmall house\b/g, 'Little House (XFZ)'],
  [/Ngôi Nhà Nhỏ/gi, 'Little House (XFZ)'],
  [/White Discourse Buddhism/gi, 'Buddhism in Plain Terms'],
  [/White Discourse Buddhist Dharma/gi, 'Buddhism in Plain Terms'],
  [/Plain white Buddha Dharma/gi, 'Buddhism in Plain Terms'],
  [/Bạch Thoại Phật Pháp/gi, 'Buddhism in Plain Terms'],
  [/Huyền Nghệ Tổng Thuật/gi, 'Art of Totem and Metaphysics'],
  [/General Art of Metaphysics/gi, 'Art of Totem and Metaphysics'],
  [/Totem General Art/gi, 'Art of Totem and Metaphysics'],
  [/Master of the station/gi, 'Master Lu Junhong'],
  [/Station Master Lu/gi, 'Master Lu Junhong'],
  [/Station Master/gi, 'Master Lu'],
  [/Đài Trưởng Lư Quân Hoành/gi, 'Master Lu Junhong'],
  [/Đài Trưởng/gi, 'Master Lu'],

  // Section Headers in Du Ký
  [/^High Grade:\s*/i, 'Part I (Upper Section): '],
  [/^Thượng Phẩm:\s*/i, 'Part I (Upper Section): '],
  [/^Middle Grade:\s*/i, 'Part II (Middle Section): '],
  [/^Trung Phẩm:\s*/i, 'Part II (Middle Section): '],
  [/^Low Grade:\s*/i, 'Part III (Lower Section): '],
  [/^Lower Grade:\s*/i, 'Part III (Lower Section): '],
  [/^Hạ Phẩm:\s*/i, 'Part III (Lower Section): '],
  [/^Phẩm Phụ:\s*/i, 'Supplementary Section: '],
  [/^Sub-grade:\s*/i, 'Supplementary Section: '],

  // Sutra terminology
  [/Chiem Sat Sutra/gi, 'Sutra of Divining Good and Evil Karmic Retribution'],
  [/Sutra of Divining Good and Evil Karmic Retribution/gi, 'Sutra of Divining Good and Evil Karmic Retribution'],
  [/Ten Wheels Sutra/gi, 'Ten Wheels of Kṣitigarbha Sūtra'],
  [/Ten Wheel Sutra/gi, 'Ten Wheels of Kṣitigarbha Sūtra'],
  [/Mahayana Great Collection Ten Wheel Sutra/gi, 'Mahāyāna Great Collection Ten Wheels of Kṣitigarbha Sūtra'],
  [/Mahayana Great Collection/gi, 'Mahāyāna Great Collection'],
  [/Divination Wheel/gi, 'Divination Wheel'],
  [/Divination Wheels/gi, 'Divination Wheels'],
  [/Three Wheels of Divination/gi, 'Three Sets of Divination Wheels'],
  [/One Reality Realm/gi, 'One Reality Realm'],
  [/One Real Realm/gi, 'One Reality Realm'],
  [/Consciousness-Only Contemplation/gi, 'Contemplation of Consciousness-Only'],
  [/Contemplation of Consciousness Only/gi, 'Contemplation of Consciousness-Only'],
  [/Two Ways of Contemplation/gi, 'Two Methods of Contemplative Practice'],
  [/Two Methods of Contemplation/gi, 'Two Methods of Contemplative Practice'],
  [/Dharma-Ending Age/gi, 'Dharma-Ending Age'],
  [/Dharma Ending Age/gi, 'Dharma-Ending Age'],
  [/end-time Dharma/gi, 'Dharma-Ending Age'],
  [/Ten Wholesome Deeds/gi, 'Ten Wholesome Karmic Paths'],
  [/Ten Good Deeds/gi, 'Ten Wholesome Actions'],
  [/Ten Evil Deeds/gi, 'Ten Unwholesome Deeds'],
  [/karmic obstacles/gi, 'karmic obstacles'],
  [/karmic hindrances/gi, 'karmic hindrances'],
  [/field of merit/gi, 'field of merit (puṇyakṣetra)'],
  [/Field of Merit/gi, 'Field of Merit'],
  [/liberating living beings/gi, 'liberating living beings (life release)'],
  [/releasing living beings/gi, 'liberating captive animals (life release)']
];

function applyBuddhistGlossary(text) {
  if (!text) return '';
  let res = text;
  for (const [pattern, replacement] of BUDDHIST_GLOSSARY) {
    res = res.replace(pattern, replacement);
  }
  return res;
}

async function translateChunk(text, retries = 5) {
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (!/[a-zA-Z\u00C0-\u1EF9]/.test(trimmed)) return text;

  const url =
    'https://clients5.google.com/translate_a/t?client=dict-chrome-ex&sl=vi&tl=en&q=' +
    encodeURIComponent(trimmed);

  for (let i = 0; i < retries; i++) {
    try {
      const res = await fetch(url);
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data) && typeof data[0] === 'string') {
          return applyBuddhistGlossary(data[0]);
        }
      }
    } catch {
      if (i === retries - 1) return applyBuddhistGlossary(text);
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return applyBuddhistGlossary(text);
}

function splitHtmlIntoChunks(html, maxLen = 1200) {
  if (!html) return [];
  const parts = html.split(/(<\/p>|<br\s*\/?>|<\/h[1-6]>|<\/div>|<\/li>)/i);
  const chunks = [];
  let cur = '';

  for (let i = 0; i < parts.length; i += 2) {
    const p = parts[i] + (parts[i + 1] || '');
    if ((cur + p).length > maxLen) {
      if (cur) chunks.push(cur);
      cur = p;
    } else {
      cur += p;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function translateHtmlContent(html) {
  if (!html) return '';
  const chunks = splitHtmlIntoChunks(html);
  const results = [];
  const CONCURRENCY = 6;

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const translated = await Promise.all(
      batch.map(async (c) => {
        // If chunk is only html tags or whitespace
        const textOnly = c.replace(/<[^>]+>/g, '').trim();
        if (!textOnly) return c;
        return await translateChunk(c);
      })
    );
    results.push(...translated);
    await new Promise((r) => setTimeout(r, 60));
  }
  return results.join('');
}

function saveChapterFile(bookId, data) {
  const destDirs = [
    path.join(mobileRoot, 'static', 'offline-data', 'chapters-en'),
    path.join(mobileRoot, 'build', 'offline-data', 'chapters-en'),
    path.join(mobileRoot, 'android', 'app', 'src', 'main', 'assets', 'public', 'offline-data', 'chapters-en'),
    path.join(mobileRoot, 'ios', 'App', 'App', 'public', 'offline-data', 'chapters-en')
  ];

  const jsonContent = JSON.stringify(data, null, 2);

  for (const dir of destDirs) {
    try {
      if (fs.existsSync(path.dirname(dir))) {
        fs.mkdirSync(dir, { recursive: true });
        const target = path.join(dir, `${bookId}.json`);
        fs.writeFileSync(target, jsonContent, 'utf-8');
      }
    } catch {}
  }
}

async function translateBook(bookId) {
  console.log(`\n=============================================================`);
  console.log(`BẮT ĐẦU DỊCH SÁCH: ${bookId}`);
  console.log(`=============================================================`);

  const srcFile = path.join(mobileRoot, 'static', 'offline-data', 'chapters', `${bookId}.json`);
  if (!fs.existsSync(srcFile)) {
    console.error(`Không tìm thấy file tiếng Việt: ${srcFile}`);
    return;
  }

  const viChapters = JSON.parse(fs.readFileSync(srcFile, 'utf-8'));
  console.log(`Tổng số chương cần dịch: ${viChapters.length}`);

  const outFile = path.join(mobileRoot, 'static', 'offline-data', 'chapters-en', `${bookId}.json`);
  let enChapters = [];
  if (fs.existsSync(outFile)) {
    try {
      enChapters = JSON.parse(fs.readFileSync(outFile, 'utf-8'));
      if (!Array.isArray(enChapters)) enChapters = [];
    } catch {
      enChapters = [];
    }
  }

  const existingMap = new Map();
  enChapters.forEach((c) => {
    if (c && c.id != null && c.tieu_de && c.noi_dung) {
      existingMap.set(c.id, c);
    }
  });

  const finalChapters = [];

  for (let i = 0; i < viChapters.length; i++) {
    const chap = viChapters[i];
    const existing = existingMap.get(chap.id);

    if (existing && existing.tieu_de && existing.noi_dung) {
      finalChapters.push(existing);
      console.log(`  [${i + 1}/${viChapters.length}] Đã có sẵn: ${existing.tieu_de.slice(0, 50)}...`);
      continue;
    }

    const tStart = Date.now();
    const pct = ((finalChapters.length / viChapters.length) * 100).toFixed(1);

    // Title translation
    let titleEn = '';
    const curatedBookTitles = CURATED_TITLES[bookId];
    if (curatedBookTitles && curatedBookTitles[chap.so_thu_tu ?? i]) {
      titleEn = curatedBookTitles[chap.so_thu_tu ?? i];
    } else {
      titleEn = await translateChunk(chap.tieu_de || `Chapter ${i + 1}`);
    }

    // Summary translation
    let summaryEn = '';
    if (chap.tom_tat) {
      summaryEn = await translateChunk(chap.tom_tat);
    }

    // Content translation
    const contentEn = await translateHtmlContent(chap.noi_dung);

    const translatedChap = {
      id: chap.id,
      bai_viet_id: chap.bai_viet_id,
      so_thu_tu: chap.so_thu_tu ?? i,
      tieu_de: titleEn,
      tom_tat: summaryEn,
      noi_dung: contentEn
    };

    finalChapters.push(translatedChap);
    existingMap.set(chap.id, translatedChap);

    // Lưu ngay sau mỗi chương để đảm bảo không mất tiến trình
    saveChapterFile(bookId, finalChapters);

    const dur = ((Date.now() - tStart) / 1000).toFixed(1);
    console.log(
      `  ✓ [${i + 1}/${viChapters.length}] (${pct}%) Xong trong ${dur}s: ${titleEn.slice(0, 55)}...`
    );
  }

  saveChapterFile(bookId, finalChapters);
  console.log(`🎉 HOÀN TẤT DỊCH SÁCH: ${bookId} (${finalChapters.length} chương)`);
}

async function updateMetadata() {
  console.log('\n--- Cập nhật metadata tiếng Anh (offline-books-en.json) ---');
  const enPath = path.join(mobileRoot, 'src', 'lib', 'data', 'offline-books-en.json');
  let enData = {};
  if (fs.existsSync(enPath)) {
    enData = JSON.parse(fs.readFileSync(enPath, 'utf-8'));
  }

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

  console.log('\n--- Đồng bộ danh mục sẵn có (chapters-en-availability.json) ---');
  try {
    execFileSync('node', ['scripts/i18n/sync-english-coverage.mjs'], { stdio: 'inherit' });
  } catch (err) {
    console.error('Lỗi khi chạy sync-english-coverage:', err);
  }
}

async function main() {
  console.log('===============================================================');
  console.log('TIẾN HÀNH DỊCH 5 SÁCH MỚI TRONG BỘ CÀI OFFLINE SANG TIẾNG ANH CHUẨN');
  console.log('===============================================================\n');

  for (const bookId of BOOK_IDS) {
    await translateBook(bookId);
  }

  await updateMetadata();

  console.log('\n===============================================================');
  console.log('🎉 TẤT CẢ 5 SÁCH MỚI ĐÃ ĐƯỢC CHUYỂN NGỮ VÀ ĐỒNG BỘ THÀNH CÔNG!');
  console.log('===============================================================');
}

main().catch((err) => {
  console.error('Lỗi trong quá trình dịch:', err);
  process.exit(1);
});
