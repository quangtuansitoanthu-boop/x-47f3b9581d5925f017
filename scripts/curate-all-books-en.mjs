import fs from 'fs';

// 1. Curate book_5a8fc5fa07f9f2bc5f6d274442c787a1 (Shurangama Mantra Verses & Commentary by Master Hsuan Hua)
const pShurangamaVerses = 'static/offline-data/chapters-en/book_5a8fc5fa07f9f2bc5f6d274442c787a1.json';
if (fs.existsSync(pShurangamaVerses)) {
  const data = JSON.parse(fs.readFileSync(pShurangamaVerses, 'utf8'));
  const titles = [
    "Introduction: Origins & Inconceivable Virtues of the Śūraṅgama Mantra",
    "First Assembly (Part 1: Lines 1–50) — Taking Refuge in the Triple Gem & Buddhas of the Ten Directions",
    "First Assembly (Part 2: Lines 51–100) — Heavenly Deities, Vajra Protectors & Secret Dhāraṇī Gathering",
    "First Assembly (Part 3: Lines 101–150) — Subduing Demonic Obstacles & Awesome Virtues of the Spirits",
    "First Assembly (Part 4: Lines 151–187) — Dharma Seals, Precepts & Establishing the Bodhimaṇḍa",
    "Second Assembly (Lines 188–232) — Śākyamuni Buddha's Majestic Eloquence & Radiant Empowerment",
    "Third Assembly (Part 1: Lines 233–299) — Avalokiteśvara Bodhisattva's Assembly & Dispelling Calamities",
    "Third Assembly (Part 2: Lines 300–363) — The Almsbowl Secret Seal & Vajra Guardians",
    "Fourth Assembly (Lines 364–434) — Vajra Subjugation Assembly & Destroying Negative Mantras",
    "Fifth Assembly (Part 1: Lines 435–499) — Mañjuśrī Bodhisattva's Assembly & Purifying All Defilements",
    "Fifth Assembly (Part 2: Lines 500–554) — The Secret Samādhi Seal & Complete Fulfillment"
  ];
  data.forEach((ch, i) => {
    if (titles[i]) ch.tieu_de = titles[i];
    let content = ch.noi_dung || ch.content || '';
    content = content.replace(/Disciple Most Assembly/g, 'First Assembly');
    content = content.replace(/Disciple Two Assembly/g, 'Second Assembly');
    content = content.replace(/Disciple Three Assembly/g, 'Third Assembly');
    content = content.replace(/Disciple Four Assembly/g, 'Fourth Assembly');
    content = content.replace(/Disciple Five Assembly/g, 'Fifth Assembly');
    content = content.replace(/Compare Lô/g, 'Vairocana');
    ch.noi_dung = content;
  });
  fs.writeFileSync(pShurangamaVerses, JSON.stringify(data, null, 2), 'utf8');
  console.log('Successfully curated Shurangama Mantra Verses book!');
}

// 2. Curate book_e7e9e35131db441efd4819880623a11a (Khai Thị 6)
const pKhaiThi6 = 'static/offline-data/chapters-en/book_e7e9e35131db441efd4819880623a11a.json';
if (fs.existsSync(pKhaiThi6)) {
  const data = JSON.parse(fs.readFileSync(pKhaiThi6, 'utf8'));
  const titleFixes = {
    0: "The Buddha's Light Universally Illuminates",
    1: "The Key to Enlightenment",
    2: "Non-Attachment to All Phenomena",
    3: "Prajñā and the Buddha-Nature",
    4: "Returning to the Original Source",
    5: "The Dharma Door of Patience",
    6: "Please Bestow Charity Upon Me",
    7: "The Rise and Fall of Buddhism — Everyone's Responsibility",
    8: "Everything is Created by the Mind",
    9: "The Human-Faced Ulcer of Past Karma & The Six Great Principles",
    10: "Descendants of the Demon King",
    11: "Educational Guidelines of the City of Ten Thousand Buddhas & The Four Immeasurables",
    12: "Patience is a Priceless Treasure",
    13: "Greed Prevents All True Attainment & Ignorance as the Root of Samsāra",
    14: "Needless Worrying Creates Affliction & Fostering Noble Character",
    22: "Physical Illness and Karmic Obstacles",
    23: "Never Compare Demons with the Buddha",
    24: "Why the Buddha Radiates Light When Teaching the Dharma",
    25: "Stillness and Serenity",
    26: "Why Moral Precepts are Falling into Decline",
    28: "The Crisis of the Dharma-Ending Age & Entering Nirvāṇa"
  };
  data.forEach((ch, i) => {
    if (titleFixes[i]) ch.tieu_de = titleFixes[i];
    else if (ch.tieu_de) {
      ch.tieu_de = ch.tieu_de.replace(/^Hật\s+/i, "The Buddha's ")
                             .replace(/^Hìa\s+/i, "Key ")
                             .replace(/^Hông\s+/i, "Not ")
                             .replace(/^Háp\s+/i, "Dharma ")
                             .replace(/\s*\/\s*$/g, "");
    }
  });
  fs.writeFileSync(pKhaiThi6, JSON.stringify(data, null, 2), 'utf8');
  console.log('Successfully curated Khai Thi 6 book!');
}

// 3. Promote verified books in chapters-en-availability.json
const avPath = 'src/lib/data/chapters-en-availability.json';
const av = JSON.parse(fs.readFileSync(avPath, 'utf8'));

const verifiedIdsToPromote = [
  // 3 volumes of Many Lives Many Times (Nguyên Phong / John Vu)
  'tt_1781529439696',
  'tt_1781529470187',
  'tt_1781529533555',
  // Return from the Snow Mountains (Nguyên Phong)
  'tt_tro_ve_tu_xu_tuyet',
  // Earth Store Sutra Commentary by Master Hsuan Hua (BTTS)
  'book_03e41ad07b2192eab506b36f0456213a',
  // Instructional Talks (Khai Thị 1-6) by Master Hsuan Hua (BTTS)
  'book_a470c0b867366dc5786112ce466a4a9e',
  'book_be52a401cd827d9b66bb9792b8db5044',
  'book_cce84c5d8dba6abfdcc4d4ea8103b727',
  'book_219ab04335d3bbfb165580fc8ac495e9',
  'book_e91ef5336221b1c48dde6341bf423bef',
  'book_e7e9e35131db441efd4819880623a11a',
  // Master Hsuan Hua's Dharma Words and Quotes
  'book_8d90cc08f2897b4fd7d5712cf1372e94',
  'book_678c9f5cd97c7a9b9a08d3141b5fe468',
  // Shurangama Mantra Verses & Great Compassion Mantra Commentary (BTTS)
  'book_5a8fc5fa07f9f2bc5f6d274442c787a1',
  'book_6b7cbd19be84cb6627aa21760cb678d0',
  // Pure Land Classics
  'book_cfab6dea8430aada3d2cf19180dd4d27',
  'book_369d61f117d384734e11cbec91c78dcc',
  'book_c35b7e41c07303b630514153c39caa12',
  'book_ceedb666ca679c312bb423ee2f5b7f20',
  'book_1d90dbea5600ee1738e90ae00ba76c17',
  'book_771454f42e9c9ed649160d7bc83de117',
  // Earth Store Bodhisattva Miracles
  'book_362f4bce40f435b7a380d7e81e983c77',
  'book_aeea64c77b4096fa80518c759d3337f6',
  // Karmic Retribution (Báo Ứng Hiện Đời 1-8)
  'tt_1781081525279_1_t5eqk',
  'tt_1781223481607_3_nojda',
  'tt_1781224456800_1_ufvqo',
  'tt_1781224543804_1_jr077',
  'tt_1781224598651_2_i3l0j',
  'tt_1781224618652_3_1ew56',
  'tt_1781224645656_4_ijyjs',
  'tt_1781224669960_5_wx8yf',
  'book_a47c6c21f218958e353d9bbb7f8fc74e',
  // Divine Monks of Ancient India
  'tt_than_tang_thien_truc',
  // Melodies of the Pure Lotus
  'book_a120238d492a12a35e72446e40b1a94f'
];

for (const id of verifiedIdsToPromote) {
  if (!av.ids.includes(id)) {
    av.ids.push(id);
  }
}

if (av.mtIds) {
  av.mtIds = av.mtIds.filter(id => !verifiedIdsToPromote.includes(id));
}

av.count = av.ids.length;
fs.writeFileSync(avPath, JSON.stringify(av, null, 2), 'utf8');
console.log('Successfully updated availability index! Verified IDs total:', av.ids.length, 'mtIds remaining:', av.mtIds?.length);
