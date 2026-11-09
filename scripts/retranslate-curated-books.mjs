import fs from 'node:fs';
import path from 'node:path';

const GLOSSARY = [
  // Extreme mistranslations
  [/EXTREMELY ORGASTIC BUDDHIST/gi, 'THE TEACHING LORD OF THE LAND OF ULTIMATE BLISS'],
  [/extremely orgastic/gi, 'Ultimate Bliss'],
  [/orgastic/gi, 'Ultimate Bliss'],
  [/cực lạc/gi, 'Ultimate Bliss'],
  [/Cực Lạc/gi, 'Ultimate Bliss'],
  [/Sukhavati/gi, 'the Land of Ultimate Bliss'],

  // Buddhas & Bodhisattvas
  [/Our Teacher Shakyamuni Buddha/gi, 'Our Fundamental Teacher Shakyamuni Buddha'],
  [/From Father Amitabha Buddha/gi, 'Our Compassionate Father Amitabha Buddha'],
  [/Compassionate Father Amitabha Buddha/gi, 'Our Compassionate Father Amitabha Buddha'],
  [/King Non Avoid Mindfulness/gi, 'King Aranemi (Vô Tránh Niệm)'],
  [/KING NON AVOID MINDFULNESS/gi, 'KING ARANEMI'],
  [/King Aranemi and Two King Child/gi, 'King Aranemi and the Two Princes'],
  [/TWO KING CHILD/gi, 'THE TWO PRINCES'],
  [/two king child/gi, 'two princes'],
  [/DHARMA BASKET BODHISATTVA/gi, 'BODHISATTVA DHARMAKARA (PHÁP TẠNG)'],
  [/Dharma Basket Bodhisattva/gi, 'Bodhisattva Dharmakara'],
  [/Dharma Basket/gi, 'Dharmakara'],
  [/Treasure Basket Tathagata/gi, 'Ratnagarbha Tathagata (Bảo Tạng Như Lai)'],

  // Person names in Báo Ứng Hiện Đời
  [/English fruit/gi, 'Guo Ying (Quả Anh)'],
  [/Fruit English/gi, 'Guo Ying (Quả Anh)'],
  [/Qua Khanh/gi, 'Guo Qing (Quả Khanh)'],
  [/Qua Hong/gi, 'Guo Hong (Quả Hồng)'],
  [/Qua Anh/gi, 'Guo Ying (Quả Anh)'],

  // Master Yinguang & Letters
  [/Seal Tống Seal Light Letters Why Worldly Border/gi, "Preface to the Propagation of Master Yinguang's Collected Works"],
  [/Seal Light/gi, 'Master Yinguang'],
  [/Seal of Light/gi, 'Master Yinguang'],
  [/A leaf letter gởi everywhere/gi, 'A Comprehensive Letter Sent to Practitioners Everywhere'],
  [/A leaf letter/gi, 'A letter'],
  [/gởi everywhere/gi, 'sent everywhere'],
  [/teacher Clear Original/gi, 'Venerable Minh Bon'],
  [/lay follower Awakening Clear/gi, 'Lay Practitioner Giac Minh'],
  [/lay follower Quách Adorn Awaken/gi, 'Lay Practitioner Quach Trang Ngo'],
  [/person new arouse the mind study Buddha at quê I/gi, 'newly aspiring Buddhist practitioners in my hometown'],
  [/Mind Sutra/gi, 'Heart Sutra'],

  // Thần Tăng Thiên Trúc (Holy Indian Monks)
  [/Venerable one Embrace Demon Đằng \(Kasyapa-Matanga, Kashyapa Demon Đằng\)/gi, '01. Venerable Kasyapa Matanga (Ca Diếp Ma Đằng)'],
  [/Embrace Demon Đằng/gi, 'Kasyapa Matanga (Nhiếp Ma Đằng)'],
  [/Venerable one Bamboo Dharma Orchid \(Dharmaraksa\)/gi, '02. Venerable Dharmaratna (Trúc Pháp Lan)'],
  [/Bamboo Dharma Orchid/gi, 'Dharmaratna (Trúc Pháp Lan)'],
  [/You Peaceful World High \(Parthamasiris\)/gi, '03. Venerable An Shigao (An Thế Cao)'],
  [/Peaceful World High/gi, 'An Shigao (An Thế Cao)'],
  [/You Branch Long Sing Sấm \(Lokaraksa\)/gi, '04. Venerable Lokaksema (Chi Lâu Ca Sấm)'],
  [/Branch Long Sing Sấm/gi, 'Lokaksema (Chi Lâu Ca Sấm)'],
  [/You Talk Kha Sing Scold \(Dharmakala\)/gi, '05. Venerable Dharmakala (Đàm Kha Ca La)'],
  [/Talk Kha Sing Scold/gi, 'Dharmakala (Đàm Kha Ca La)'],
  [/You Khương Sangha Khải/gi, '06. Venerable Sanghavarman (Khương Tăng Khải)'],
  [/Khương Sangha Khải/gi, 'Sanghavarman (Khương Tăng Khải)'],
  [/You Talk Emperor or Talk Non Emperor \(Dharmasatya\)/gi, '07. Venerable Dharmasatya (Đàm Đế)'],
  [/Talk Emperor/gi, 'Dharmasatya'],
  [/You Khương Sangha Assembly/gi, '08. Venerable Kang Senghui (Khương Tăng Hội)'],
  [/Khương Sangha Assembly/gi, 'Kang Senghui (Khương Tăng Hội)'],
  [/Branch Cương Provisions Continue/gi, '09. Venerable Zhi Qian (Chi Cương Lương Tiếp)'],
  [/person middle Heaven Bamboo/gi, 'native of Central India'],
  [/Heaven Bamboo/gi, 'India (Tianzhu)'],

  // General Buddhist Terms
  [/three faculties/gi, 'the three spiritual capacities (superior, medium, inferior)'],
  [/benefit - độn fully thâu/gi, 'embracing both the sharp and dull faculties'],
  [/substance phác/gi, 'plain and unadorned'],
  [/Three basket/gi, 'Tripitaka (Three Baskets)'],
  [/leaving the home life/gi, 'Leaving the Home Life (Renunciation)'],
  [/Also is words self narrate/gi, "Author's Autobiographical Words"]
];

function cleanText(text) {
  let res = text;
  for (const [pattern, replacement] of GLOSSARY) {
    res = res.replace(pattern, replacement);
  }
  return res;
}

async function translateChunk(text, retries = 4) {
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
      await new Promise((r) => setTimeout(r, 400 * (i + 1)));
    }
  }
  return text;
}

async function retranslateBook(bookId, bookName) {
  const viFile = `static/offline-data/chapters/${bookId}.json`;
  const enFile = `static/offline-data/chapters-en/${bookId}.json`;
  if (!fs.existsSync(viFile)) {
    console.log(`Skipping ${bookId} (VI file not found)`);
    return;
  }

  console.log(`\n========================================`);
  console.log(`RETRANSLATING: ${bookName} (${bookId})`);
  console.log(`========================================`);

  const viChapters = JSON.parse(fs.readFileSync(viFile, 'utf8'));
  let enChapters = fs.existsSync(enFile) ? JSON.parse(fs.readFileSync(enFile, 'utf8')) : [];

  for (let i = 0; i < viChapters.length; i++) {
    const viChap = viChapters[i];
    const rawTitle = viChap.tieu_de || `Chapter ${i + 1}`;
    console.log(`[${i + 1}/${viChapters.length}] Translating Chapter ${i + 1}: ${rawTitle.slice(0, 50)}...`);

    // 1. Translate Title
    let translatedTitle = await translateChunk(rawTitle);
    translatedTitle = cleanText(translatedTitle);

    // 2. Parse HTML / Paragraphs in content
    const viContent = viChap.noi_dung || '';
    const paras = viContent.split(/(<\/p>|<br\s*\/?>|<\/h[1-6]>|<\/div>|\n\s*\n)/i);

    const translatedParts = [];
    for (let pIdx = 0; pIdx < paras.length; pIdx++) {
      const part = paras[pIdx];
      // Keep HTML tags intact
      if (/^(<\/p>|<br\s*\/?>|<\/h[1-6]>|<\/div>|\n\s*\n)$/i.test(part)) {
        translatedParts.push(part);
        continue;
      }
      const stripped = part.replace(/<[^>]+>/g, '').trim();
      if (!stripped) {
        translatedParts.push(part);
        continue;
      }

      const translatedText = await translateChunk(stripped);
      const cleanedText = cleanText(translatedText);

      // Re-embed in original tag if present
      const matchTag = part.match(/^<([a-z0-9]+)[^>]*>(.*?)<\/\1>$/is);
      if (matchTag) {
        const opening = part.slice(0, part.indexOf('>') + 1);
        const closing = part.slice(part.lastIndexOf('<'));
        translatedParts.push(`${opening}${cleanedText}${closing}`);
      } else {
        translatedParts.push(cleanedText);
      }
      await new Promise((r) => setTimeout(r, 40));
    }

    let finalContent = translatedParts.join('');
    finalContent = cleanText(finalContent);

    enChapters[i] = {
      id: viChap.id,
      bai_viet_id: viChap.bai_viet_id,
      so_thu_tu: viChap.so_thu_tu,
      tieu_de: translatedTitle,
      tom_tat: viChap.tom_tat ? cleanText(await translateChunk(viChap.tom_tat)) : '',
      noi_dung: finalContent
    };

    if ((i + 1) % 10 === 0 || i === viChapters.length - 1) {
      fs.writeFileSync(enFile, JSON.stringify(enChapters, null, 2), 'utf8');
      console.log(`--> Saved progress up to Chapter ${i + 1}.`);
    }
  }

  fs.writeFileSync(enFile, JSON.stringify(enChapters, null, 2), 'utf8');
  console.log(`✓ FINISHED: ${bookName}`);
}

async function main() {
  // 1. Đường Về Cực Lạc (56 chaps)
  await retranslateBook('book_ceedb666ca679c312bb423ee2f5b7f20', 'Đường Về Cực Lạc (The Path to Ultimate Bliss)');

  // 2. Nhân Quả Giải Theo Phật Giáo — Báo Ứng Hiện Đời Tập 5 (31 chaps)
  await retranslateBook('book_a47c6c21f218958e353d9bbb7f8fc74e', 'Báo Ứng Hiện Đời Tập 5 (Modern Karmic Retribution Vol 5)');

  // 3. Thần Tăng Thiên Trúc (81 chaps)
  await retranslateBook('tt_than_tang_thien_truc', 'Thần Tăng Thiên Trúc (Divine Monks of Ancient India)');

  // 4. Ấn Quang Pháp Sư Văn Sao Tục Biên (117 chaps)
  await retranslateBook('book_369d61f117d384734e11cbec91c78dcc', "Ấn Quang Pháp Sư Văn Sao Tục Biên (Master Yinguang's Letters)");

  console.log('\n=============================================');
  console.log('ALL TARGETED BOOKS HAVE BEEN FULLY RETRANSLATED!');
  console.log('=============================================');
}

main().catch((err) => {
  console.error('Fatal error in retranslation:', err);
  process.exit(1);
});
