import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const BOOK_ID = 'tuyen-tap-phap-facebook-quang-tu';
const SRC_FILE = path.resolve(`static/offline-data/chapters/${BOOK_ID}.json`);
const OUT_FILE = path.resolve(`static/offline-data/chapters-en/${BOOK_ID}.json`);
const BUILD_FILE = path.resolve(`build/offline-data/chapters-en/${BOOK_ID}.json`);
const ANDROID_FILE = path.resolve(`android/app/src/main/assets/public/offline-data/chapters-en/${BOOK_ID}.json`);
const IOS_FILE = path.resolve(`ios/App/App/public/offline-data/chapters-en/${BOOK_ID}.json`);

const BUDDHIST_TERMS = [
  // Mantra & Chú corrections
  [/Uncle Lăng Nghiêm/gi, 'The Śūraṅgama Mantra'],
  [/Uncle Đại Bi/gi, 'The Great Compassion Mantra'],
  [/Uncle Chuẩn Đề/gi, 'The Cundī Dhāraṇī'],
  [/Uncle Dược Sư/gi, 'The Medicine Buddha Mantra'],
  [/Uncle Vãng Sanh/gi, 'The Rebirth Dhāraṇī'],
  [/Uncle Vãng Sinh/gi, 'The Rebirth Dhāraṇī'],
  [/Uncle Thần Chú/gi, 'Mantra'],
  [/Uncle Chú/gi, 'Mantra'],
  [/\bUncle\s+([A-ZÁÀẢÃẠÂẤẦẨẪẬĂẮẰẲẴẶÉÈẺẼẸÊẾỀỂỄỆÍÌỈĨỊÓÒỎÕỌÔỐỒỔỖỘƠỚỜỞỠỢÚÙỦŨỤƯỨỪỬỮỰÝỲỶỸỴ])/g, 'Mantra $1'],
  [/\bholding uncle\b/gi, 'reciting mantras'],
  [/\bholding uncles\b/gi, 'reciting mantras'],
  [/\bchanting uncle\b/gi, 'reciting the mantra'],
  [/\breciting uncle\b/gi, 'reciting the mantra'],
  [/\breading uncle\b/gi, 'reciting the mantra'],

  // Pure Land & Extreme Orgasm MT errors
  [/EXTREMELY ORGASTIC BUDDHIST/gi, 'THE TEACHING LORD OF THE LAND OF ULTIMATE BLISS'],
  [/extremely orgastic/gi, 'Ultimate Bliss'],
  [/extreme orgasm/gi, 'Ultimate Bliss'],
  [/orgastic/gi, 'Ultimate Bliss'],
  [/Land of Extremely Orgastic/gi, 'Land of Ultimate Bliss'],
  [/Land of Extreme Orgasm/gi, 'Land of Ultimate Bliss'],
  [/Western Extremely Blissful Land/gi, 'Western Land of Ultimate Bliss'],
  [/Western Extreme Bliss/gi, 'Western Land of Ultimate Bliss'],

  // Karmic Creditors & Spirits
  [/repayments of grudge on oneself/gi, 'karmic creditors'],
  [/resentment of the host of negative forces/gi, 'karmic creditors'],
  [/creditors of unjust resentment/gi, 'karmic creditors'],
  [/LEFT HOLDER OAN/gi, 'Karmic Creditors'],
  [/holder oan/gi, 'karmic creditor'],
  [/yin predestined affinity/gi, 'unseen karmic affinity'],
  [/negative predestined love/gi, 'unseen spiritual connection'],

  // Buddhas & Bodhisattvas & Sutras
  [/Sutra of Kshiti/gi, 'Kṣitigarbha Sutra'],
  [/Kshiti Sutra/gi, 'Kṣitigarbha Sutra'],
  [/Earth Store Sutra/gi, 'Kṣitigarbha Sutra'],
  [/Earth Store Bodhisattva/gi, 'Bodhisattva Kṣitigarbha'],
  [/Bodhisattva of Earth Store/gi, 'Bodhisattva Kṣitigarbha'],
  [/Our Teacher Shakyamuni Buddha/gi, 'Our Fundamental Teacher Shakyamuni Buddha'],
  [/From Father Amitabha Buddha/gi, 'Our Compassionate Father Amitabha Buddha'],
  [/Compassionate Father Amitabha Buddha/gi, 'Our Compassionate Father Amitabha Buddha'],
  [/DHARMA BASKET BODHISATTVA/gi, 'BODHISATTVA DHARMAKARA (PHÁP TẠNG)'],
  [/Dharma Basket Bodhisattva/gi, 'Bodhisattva Dharmakara'],
  [/Treasure Basket Tathagata/gi, 'Ratnagarbha Tathagata'],

  // Monastic terms & Masters
  [/HOÀ SUPERIOR PROCLAIM/gi, 'VENERABLE MASTER HSUAN HUA'],
  [/Superior Proclaim/gi, 'Master Hsuan Hua'],
  [/Master Tuyen Hoa/gi, 'Master Hsuan Hua'],
  [/Venerable Master Tuyen Hoa/gi, 'Venerable Master Hsuan Hua'],
  [/Master Tinh Khong/gi, 'Master Chin Kung'],
  [/Venerable Master Tinh Khong/gi, 'Venerable Master Chin Kung'],
  [/Seal Light/gi, 'Master Yinguang'],
  [/Seal of Light/gi, 'Master Yinguang'],
  [/execution at the age/gi, 'renounced the household life at the age'],
  [/leaving the household life/gi, 'renouncing the household life'],
  [/leaving the home life/gi, 'renouncing the household life']
];

function cleanBuddhistText(text) {
  if (!text) return '';
  let res = text;
  for (const [pattern, replacement] of BUDDHIST_TERMS) {
    res = res.replace(pattern, replacement);
  }
  return res;
}

let bingSession = null;

async function getBingSession(forceFresh = false) {
  if (!forceFresh && bingSession && Date.now() - bingSession.time < 10 * 60 * 1000) {
    return bingSession;
  }
  const homeRes = await fetch('https://www.bing.com/translator', {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    }
  });
  const html = await homeRes.text();
  const igMatch = html.match(/IG:"([a-zA-Z0-9]+)"/);
  const paramsMatch = html.match(/params_AbusePreventionHelper\s*=\s*\[([0-9]+),"([^"]+)",([0-9]+)\]/);

  if (!igMatch || !paramsMatch) {
    throw new Error('Could not extract Bing tokens');
  }

  bingSession = {
    ig: igMatch[1],
    key: paramsMatch[1],
    token: paramsMatch[2],
    time: Date.now()
  };
  return bingSession;
}

async function translateWithBing(text) {
  let session = await getBingSession();
  const body = new URLSearchParams({
    fromLang: 'vi',
    text: text,
    to: 'en',
    token: session.token,
    key: session.key
  });

  let res = await fetch(`https://www.bing.com/ttranslatev3?isVertical=1&&IG=${session.ig}&IID=translator.5028`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
    },
    body: body.toString()
  });

  if (!res.ok) {
    session = await getBingSession(true);
    const retryBody = new URLSearchParams({
      fromLang: 'vi',
      text: text,
      to: 'en',
      token: session.token,
      key: session.key
    });
    res = await fetch(`https://www.bing.com/ttranslatev3?isVertical=1&&IG=${session.ig}&IID=translator.5028`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36'
      },
      body: retryBody.toString()
    });
    if (!res.ok) {
      bingSession = null;
      throw new Error(`Bing HTTP ${res.status}`);
    }
  }

  const data = await res.json();
  if (data && data[0] && data[0].translations && data[0].translations[0]) {
    return cleanBuddhistText(data[0].translations[0].text);
  }
  bingSession = null;
  throw new Error('Invalid Bing response format');
}

async function translateWithGoogleProxy(text) {
  const gUrl = `https://translate.googleapis.com/translate_a/single?client=at&sl=vi&tl=en&dt=t&q=${encodeURIComponent(text)}`;
  const pUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(gUrl)}`;
  const res = await fetch(pUrl);
  if (!res.ok) throw new Error(`Google proxy HTTP ${res.status}`);
  const data = await res.json();
  if (Array.isArray(data) && Array.isArray(data[0])) {
    const raw = data[0].map((x) => x[0] || '').join('');
    return cleanBuddhistText(raw);
  }
  throw new Error('Invalid Google response');
}

async function translateChunk(text, retries = 4) {
  const trimmed = text.trim();
  if (!trimmed) return text;
  if (!/[a-zA-Z\u00C0-\u1EF9]/.test(trimmed)) return text;

  for (let i = 0; i < retries; i++) {
    try {
      return await translateWithBing(trimmed);
    } catch {
      try {
        return await translateWithGoogleProxy(trimmed);
      } catch {
        if (i === retries - 1) {
          return text;
        }
        await new Promise((r) => setTimeout(r, 600 * (i + 1)));
      }
    }
  }
  return text;
}

function splitSafe(text, maxLen = 650) {
  if (text.length <= maxLen) return [text];
  const parts = [];
  let cur = '';
  const tokens = text.split(/([.,;!?\n]+\s*|\s+)/);
  for (let i = 0; i < tokens.length; i += 2) {
    const word = (tokens[i] || '') + (tokens[i + 1] || '');
    if ((cur + word).length > maxLen && cur.trim()) {
      parts.push(cur);
      cur = word;
    } else {
      cur += word;
    }
  }
  if (cur.trim()) parts.push(cur);
  return parts;
}

function splitContentIntoBlocks(html, maxLen = 650) {
  if (!html) return [];
  const parts = html.split(/(<\/p>|<br\s*\/?>|<\/h[1-6]>|<\/div>|\n\n+)/i);
  const blocks = [];
  for (let i = 0; i < parts.length; i += 2) {
    const text = parts[i] || '';
    const delim = parts[i + 1] || '';
    const full = text + delim;
    if (full) blocks.push(full);
  }

  const chunks = [];
  let cur = '';

  for (const b of blocks) {
    const textOnly = b.replace(/<[^>]+>/g, '').trim();
    if (!textOnly) {
      if (cur) {
        chunks.push(cur);
        cur = '';
      }
      chunks.push(b);
      continue;
    }

    if (b.length > maxLen) {
      if (cur) {
        chunks.push(cur);
        cur = '';
      }
      const safeParts = splitSafe(b, maxLen);
      chunks.push(...safeParts);
    } else if ((cur + b).length > maxLen) {
      if (cur) chunks.push(cur);
      cur = b;
    } else {
      cur += b;
    }
  }
  if (cur) chunks.push(cur);
  return chunks;
}

async function translateContent(html) {
  if (!html) return '';
  const chunks = splitContentIntoBlocks(html);
  const results = [];
  const CONCURRENCY = 4;

  for (let i = 0; i < chunks.length; i += CONCURRENCY) {
    const batch = chunks.slice(i, i + CONCURRENCY);
    const translatedBatch = await Promise.all(
      batch.map(async (c) => {
        const textOnly = c.replace(/<[^>]+>/g, '').trim();
        if (!textOnly) return c; // Giữ nguyên ảnh và thẻ định dạng
        return await translateChunk(c);
      })
    );
    results.push(...translatedBatch);
    await new Promise((r) => setTimeout(r, 40));
  }
  return results.join('');
}

function saveToAllDestinations(data) {
  const json = JSON.stringify(data, null, 2);
  fs.writeFileSync(OUT_FILE, json, 'utf8');

  for (const f of [BUILD_FILE, ANDROID_FILE, IOS_FILE]) {
    try {
      if (fs.existsSync(path.dirname(f))) {
        fs.writeFileSync(f, json, 'utf8');
      }
    } catch {}
  }
}

async function run() {
  if (!fs.existsSync(SRC_FILE)) {
    console.error(`Không tìm thấy file nguồn: ${SRC_FILE}`);
    process.exit(1);
  }

  const viChapters = JSON.parse(fs.readFileSync(SRC_FILE, 'utf8'));
  console.log(`Tổng số chương tiếng Việt: ${viChapters.length}`);

  let enChapters = [];
  if (fs.existsSync(OUT_FILE)) {
    try {
      enChapters = JSON.parse(fs.readFileSync(OUT_FILE, 'utf8'));
      if (!Array.isArray(enChapters)) enChapters = [];
    } catch {
      enChapters = [];
    }
  }
  console.log(`Số chương tiếng Anh hiện có: ${enChapters.length}`);

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

    if (existing && existing.noi_dung && existing.tieu_de) {
      finalChapters.push(existing);
      continue;
    }

    const pct = ((finalChapters.length / viChapters.length) * 100).toFixed(1);
    console.log(`[${i + 1}/${viChapters.length}] (${pct}%) Đang dịch: ${chap.tieu_de.slice(0, 60)}...`);

    const [titleEn, summaryEn, contentEn] = await Promise.all([
      translateChunk(chap.tieu_de),
      chap.tom_tat ? translateChunk(chap.tom_tat) : Promise.resolve(''),
      translateContent(chap.noi_dung)
    ]);

    const translatedItem = {
      id: chap.id,
      bai_viet_id: chap.bai_viet_id,
      so_thu_tu: chap.so_thu_tu ?? i,
      tieu_de: titleEn,
      tom_tat: summaryEn,
      noi_dung: contentEn
    };

    finalChapters.push(translatedItem);
    existingMap.set(chap.id, translatedItem);

    // Lưu ngay sau mỗi chương để đảm bảo tiến độ không bị mất
    saveToAllDestinations(finalChapters);
    console.log(`  ✓ Đã xong bài ${i + 1}: ${titleEn.slice(0, 45)}...`);
  }

  saveToAllDestinations(finalChapters);
  console.log(
    `\n🎉 HOÀN TẤT: Toàn bộ ${finalChapters.length}/${viChapters.length} bài tiếng Anh đã được chuyển ngữ và lưu thành công!`
  );

  console.log('\n📦 ĐANG ĐÓNG GÓI VÀO ỨNG DỤNG (MOBILE & WEB)...');
  try {
    execFileSync('node', ['scripts/i18n/sync-english-coverage.mjs'], { stdio: 'inherit' });
    execFileSync('npx', ['cap', 'sync'], { stdio: 'inherit', shell: process.platform === 'win32' });
    console.log('✅ ĐÃ ĐÓNG GÓI VÀ ĐỒNG BỘ THÀNH CÔNG VÀO ỨNG DỤNG!');
  } catch (syncErr) {
    console.error('Lỗi khi đồng bộ đóng gói:', syncErr);
  }
}

run().catch((err) => {
  console.error('Lỗi dịch thuật:', err);
  process.exit(1);
});
