import fs from 'node:fs';
import path from 'node:path';

const CURATED_TITLES = {
  'book_cfab6dea8430aada3d2cf19180dd4d27': {
    title: 'Letters from the Pure Land',
    author: 'Venerable Master Yinguang',
    summary: 'Collection of letters and Dharma instructions by Patriarch Yinguang guiding practitioners toward sincere Buddha recitation and rebirth in the Western Pure Land.'
  },
  'book_c35b7e41c07303b630514153c39caa12': {
    title: 'Homeland of Ultimate Bliss',
    author: 'Venerable Master Thich Thien Tam',
    summary: 'Inspiring explanations of the wonders of the Western Pure Land and the profound vows of Amitabha Buddha.'
  },
  'book_ceedb666ca679c312bb423ee2f5b7f20': {
    title: 'The Path to Ultimate Bliss',
    author: 'Venerable Master Thich Thien Tam',
    summary: 'A comprehensive guide on mindfulness of Amitabha Buddha, maintaining pure precepts, and walking the direct path to liberation.'
  },
  'book_a470c0b867366dc5786112ce466a4a9e': {
    title: 'Instructional Talks — Volume 1',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Profound Dharma talks by Master Hsuan Hua clarifying true cultivation, patience, and diligence in daily life.'
  },
  'book_be52a401cd827d9b66bb9792b8db5044': {
    title: 'Instructional Talks — Volume 2',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Teachings on overcoming greed, anger, and delusion, illuminating the path of living the Dharma.'
  },
  'book_cce84c5d8dba6abfdcc4d4ea8103b727': {
    title: 'Instructional Talks — Volume 3',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Instructional talks on moral conduct, Chan meditation, and cultivating a sincere Buddhist mind.'
  },
  'book_219ab04335d3bbfb165580fc8ac495e9': {
    title: 'Instructional Talks — Volume 4',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Detailed instructions on the boundless efficacy of the Great Compassion Mantra and mindfully calling upon Bodhisattva Avalokiteshvara.'
  },
  'book_e91ef5336221b1c48dde6341bf423bef': {
    title: 'Instructional Talks — Volume 5',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Collection of essential talks delivered during Chan sessions, Buddha-recitation retreats, and Guanyin retreats.'
  },
  'book_e7e9e35131db441efd4819880623a11a': {
    title: 'Instructional Talks — Volume 6',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Words of wisdom on unlocking Prajna wisdom, cultivating perfection of patience, and upholding the proper Dharma.'
  },
  'book_771454f42e9c9ed649160d7bc83de117': {
    title: 'Ten Essentials of Buddha Recitation',
    author: 'Venerable Master Thich Thien Tam',
    summary: 'Ten essential principles for Pure Land practitioners to establish unshakeable faith and resolve.'
  },
  'book_1788147908838_8001cf50': {
    title: 'Ten Essentials of Buddha Recitation — Master Thien Tam',
    author: 'Venerable Master Thich Thien Tam',
    summary: 'Ten essentials of mindful Buddha recitation for rebirth in the Pure Land.'
  },
  'book_aeea64c77b4096fa80518c759d3337f6': {
    title: 'Inspirational Stories of Ksitigarbha Bodhisattva',
    author: 'Ancient Masters',
    summary: 'Authentic historical records and spiritual responses from practitioners who sincerely recited the name of Bodhisattva Ksitigarbha.'
  },
  'book_362f4bce40f435b7a380d7e81e983c77': {
    title: 'Miracles of Ksitigarbha Bodhisattva',
    author: 'Traditional',
    summary: 'Vows and compassionate miracles of Bodhisattva Ksitigarbha in liberating souls from the lower realms.'
  },
  'book_1d90dbea5600ee1738e90ae00ba76c17': {
    title: 'Chronicles of the Ocean-Wide Holy Assembly',
    author: 'Disciples of Venerable Master Hai Xian',
    summary: 'Life and pure cultivation of Elder Master Hai Xian (1900–2013) — a living example of dedicated Buddha recitation and auspicious rebirth.'
  },
  'book_a120238d492a12a35e72446e40b1a94f': {
    title: 'Melodies of the Pure Lotus',
    author: 'Pure Land Tradition',
    summary: 'Pure Land reflections and poetic verses inspiring aspiration for the Land of Ultimate Bliss.'
  },
  'book_8d90cc08f2897b4fd7d5712cf1372e94': {
    title: 'Dharma Words',
    author: 'Masters',
    summary: 'Concise aphorisms and core teachings for daily Buddhist cultivation.'
  },
  'book_678c9f5cd97c7a9b9a08d3141b5fe468': {
    title: 'Recorded Sayings',
    author: 'Masters',
    summary: 'Dialogues and sayings of Buddhist teachers awakening disciples to truth.'
  },
  'book_6b7cbd19be84cb6627aa21760cb678d0': {
    title: 'Great Compassion Mantra Commentary',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Detailed line-by-line verses and commentary on the Great Compassion Dharani.'
  },
  'book_369d61f117d384734e11cbec91c78dcc': {
    title: "Master Yinguang's Letters — Sequel",
    author: 'Patriarch Yinguang',
    summary: 'Continued volume of letters, instructions, and practical guidance for practitioners.'
  },
  'book_5a8fc5fa07f9f2bc5f6d274442c787a1': {
    title: 'Shurangama Mantra — Verses and Commentary',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Verses and explanations of the Shurangama Mantra by Venerable Master Hsuan Hua.'
  },
  'book_03e41ad07b2192eab506b36f0456213a': {
    title: 'Ksitigarbha Sutra Commentary',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Commentary on the Past Vows of Earth Store Bodhisattva Sutra.'
  },
  'tt_1781081372340_1_xqcxo': {
    title: 'Mission of Liberation — 50 Karmic Stories of Deliverance',
    author: 'Do Chan Duc',
    summary: 'Fifty real stories from the deliverance journeys of the four-member team under the guidance of the Venerable Elder in That Son mountains, illustrating the infallible law of karma and the power of repentance.'
  },
  'tt_1781081525279_1_t5eqk': {
    title: 'Modern Karmic Retribution — Volume 1',
    author: 'Upasaka Guo Khanh',
    summary: 'Collection of verified modern-day accounts of karmic retribution recorded at Mount Wutai, urging people to abstain from evil and cultivate wholesome deeds.'
  },
  'tt_1781223481607_3_nojda': {
    title: 'Modern Karmic Retribution — Volume 2',
    author: 'Upasaka Guo Khanh',
    summary: 'Real karmic cause-and-effect accounts showing the consequences of past and present actions.'
  },
  'tt_1781224456800_1_ufvqo': {
    title: 'Modern Karmic Retribution — Volume 3',
    author: 'Upasaka Guo Khanh',
    summary: 'Accounts of hell realms, near-death experiences, and the heavy consequences of unfilial deeds and taking life.'
  },
  'tt_1781224543804_1_jr077': {
    title: 'Modern Karmic Retribution — Volume 4',
    author: 'Upasaka Guo Khanh',
    summary: 'Focuses on the power of sincere repentance, prenatal education, and how deep faith in karma turns misfortune into blessings.'
  },
  'tt_1781224598651_2_i3l0j': {
    title: 'Modern Karmic Retribution — Volume 5',
    author: 'Upasaka Guo Khanh',
    summary: 'Karma explained through the Buddhist perspective, examining classic literature and modern encounters.'
  },
  'tt_1781224618652_3_1ew56': {
    title: 'Modern Karmic Retribution — Volume 6',
    author: 'Upasaka Guo Khanh',
    summary: 'Cautions against sexual misconduct and urges maintaining purity of body, speech, and mind for enduring happiness.'
  },
  'tt_1781224645656_4_ijyjs': {
    title: 'Modern Karmic Retribution — Volume 7',
    author: 'Upasaka Guo Khanh',
    summary: 'Accounts of spiritual realms, soul deliverances, and the vital role of morality and precepts over mere psychic faculties.'
  },
  'tt_1781224669960_5_wx8yf': {
    title: 'Modern Karmic Retribution — Volume 8',
    author: 'Upasaka Guo Khanh',
    summary: 'Final volume summarizing karmic lectures, sincere repentance, and genuine Buddhist cultivation.'
  },
  'book_a47c6c21f218958e353d9bbb7f8fc74e': {
    title: 'Karma Explained in Buddhism — Modern Retribution Vol 5',
    author: 'Upasaka Guo Khanh',
    summary: 'Explanations of karmic retribution and wholesome cultivation.'
  },
  'tt_than_tang_thien_truc': {
    title: 'Divine Monks of Ancient India',
    author: 'Buddhist Historical Records',
    summary: 'Biographies and miraculous deeds of eminent Indian and Central Asian masters who transmitted the Dharma.'
  },
  'tt_klngl_q01': {
    title: 'Shurangama Sutra Explained — Volume 1',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Explanation of the Shurangama Sutra — Volume 1.'
  },
  'tt_klngl_q02': {
    title: 'Shurangama Sutra Explained — Volume 2',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Explanation of the Shurangama Sutra — Volume 2.'
  },
  'tt_klngl_q03': {
    title: 'Shurangama Sutra Explained — Volume 3',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Explanation of the Shurangama Sutra — Volume 3.'
  },
  'tt_klngl_q04': {
    title: 'Shurangama Sutra Explained — Volume 4',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Explanation of the Shurangama Sutra — Volume 4.'
  },
  'tt_klngl_q05': {
    title: 'Shurangama Sutra Explained — Volume 5',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Explanation of the Shurangama Sutra — Volume 5.'
  },
  'tt_klngl_q06': {
    title: 'Shurangama Sutra Explained — Volume 6',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Explanation of the Shurangama Sutra — Volume 6.'
  },
  'tt_klngl_q07': {
    title: 'Shurangama Sutra Explained — Volume 7',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Explanation of the Shurangama Sutra — Volume 7.'
  },
  'tt_klngl_q08': {
    title: 'Shurangama Sutra Explained — Volume 8',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Explanation of the Shurangama Sutra — Volume 8.'
  },
  'tt_klngl_q09': {
    title: 'Shurangama Sutra Explained — Volume 9',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Explanation of the Shurangama Sutra — Volume 9.'
  },
  'tt_klngl_q10': {
    title: 'Shurangama Sutra Explained — Volume 10',
    author: 'Venerable Master Hsuan Hua',
    summary: 'Explanation of the Shurangama Sutra — Volume 10.'
  },
  'tuyen-tap-phap-facebook-quang-tu': {
    title: 'Selected Dharma Teachings from Facebook Quang Tu',
    author: 'Quang Tu',
    summary: "Collection of sermons explaining cause and effect, practice instructions, inspiring stories and teachings selected from Quang Tu's page."
  }
};

const metaPath = path.resolve('src/lib/data/offline-books-en.json');
fs.writeFileSync(metaPath, JSON.stringify(CURATED_TITLES, null, 2), 'utf8');
console.log(`Đã ghi thành công metadata tiếng Anh cho ${Object.keys(CURATED_TITLES).length} cuốn sách vào ${metaPath}`);
