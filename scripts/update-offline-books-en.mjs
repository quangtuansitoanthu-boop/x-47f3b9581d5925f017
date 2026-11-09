import fs from 'node:fs';
import path from 'node:path';

const NEW_TRANSLATIONS = {
  // === MUÔN KIẾP NHÂN SINH & NGUYÊN PHONG ===
  'tt_1781529439696': {
    title: 'Many Lives, Many Times — Volume 1',
    author: 'Nguyen Phong',
    summary: 'A spiritual voyage exploring the universal laws of cause and effect, reincarnation, and karmic retribution across civilizations from ancient Atlantis and Egypt to modern times.'
  },
  'tt_1781529470187': {
    title: 'Many Lives, Many Times — Volume 2',
    author: 'Nguyen Phong',
    summary: 'Continuing the journey of souls, unearthing memories from Assyria, Greece, Persia, and India to awaken humanity to compassion and cosmic consciousness.'
  },
  'tt_1781529533555': {
    title: 'Many Lives, Many Times — Volume 3',
    author: 'Nguyen Phong',
    summary: 'Bridging modern science and spiritual wisdom, exploring humanity’s transitional destiny into the Aquarian age and the transformative power of love and meditation.'
  },
  'tt_tro_ve_tu_xu_tuyet': {
    title: 'Return from the Snow Mountain',
    author: 'Nguyen Phong',
    summary: 'A journey into the mystical Himalayas uncovering profound wisdom, yoga philosophy, and esoteric teachings of Tibetan masters.'
  },

  // === CÁC NGHI THỨC (RITUALS & CEREMONIES) ===
  'book_1788356229855_48d01c4c': {
    title: 'Food Offering Ritual for Hungry Spirits',
    author: 'Quang Tu',
    summary: 'Ceremony and incantations for bestowing food, liberation, and comfort to wandering and hungry spirits with great compassion.'
  },
  'book_1788620832166_04b4ffd5': {
    title: 'Ritual for Deliverance & Resolving Karmic Bonds',
    author: 'Quang Tu',
    summary: 'Chanting ceremony to deliver departed souls, soothe ancestral grief, and resolve deep unseen karmic entanglements.'
  },
  'book_1788617549554_84d86968': {
    title: 'Repentance & Deliverance Ritual for Unborn Children',
    author: 'Quang Tu',
    summary: 'Heartfelt repentance ceremony and prayer for delivering unborn infants and healing parental remorse through compassionate dedication.'
  },
  'tt_1781615695204': {
    title: 'Repentance Ritual for Karmic Creditors',
    author: 'Quang Tu',
    summary: 'Prostrations, sincere confessions, and virtue dedication to seek forgiveness and make peace with karmic creditors across lifetimes.'
  },
  'tt_1781274943336': {
    title: 'Great Compassion Mantra Recitation Ritual',
    author: 'Quang Tu',
    summary: 'Sacred liturgy for reciting Avalokiteshvara Bodhisattva’s Great Compassion Dharani (Maha Karuna Dharani) for peace, healing, and protection.'
  },
  'tt_1781275267452': {
    title: 'Shurangama Mantra Recitation Ritual',
    author: 'Quang Tu',
    summary: 'The King of Mantras liturgy for subduing delusions, warding off obstacles, and maintaining pure unwavering samadhi.'
  },

  // === KINH PHẬT (BUDDHIST SUTRAS) ===
  'book_1787189827026_8b568f64': {
    title: 'Lotus Sutra (Saddharma Pundarika Sutra)',
    author: 'Venerable Master Thich Tri Tinh',
    summary: 'The ultimate king of Mahayana scriptures revealing the One Buddha Vehicle and the inherent Buddhahood in all living beings.'
  },
  'tt_kinh_duoc_su': {
    title: 'Medicine Buddha Sutra (Bhaisajyaguru Sutra)',
    author: 'Venerable Master Thich Tri Quang',
    summary: 'Scripture recounting the twelve great vows of the Medicine Master Buddha for healing illnesses, dispelling calamities, and granting spiritual fulfillment.'
  },
  'tt_1781359043077': {
    title: 'Diamond Sutra (Vajracchedika Prajnaparamita Sutra)',
    author: 'Venerable Master Thich Tri Tinh',
    summary: 'Foundational Mahayana wisdom sutra teaching the perfection of wisdom, non-attachment, and the emptiness of all conceptual phenomena.'
  },
  'tt_kinh_cuu_bat_nga_quy_diem_khau': {
    title: 'Flaming Mouth Dharani Sutra for Saving Hungry Ghosts',
    author: 'Amoghavajra (Classical translation)',
    summary: 'Esoteric scripture teaching compassionate mantras to release beings suffering hunger and thirst in the realm of hungry ghosts.'
  },
  'book_1788482371938_34f43522': {
    title: 'Shurangama Sutra',
    author: 'Upasaka Tam Minh',
    summary: 'Essential scripture detailing the nature of mind, the 25 gates to enlightenment, the Shurangama Mantra, and the 50 demonic skandha states.'
  },
  'tt_kinh_tieu_bo': {
    title: 'Khuddaka Nikaya (Minor Collection)',
    author: 'Venerable Thich Minh Chau',
    summary: 'Collection of early Buddhist verses and discourses from the Pali Canon including the Dhammapada, Sutta Nipata, and Jatakas.'
  },
  'tt_kinh_trung_bo': {
    title: 'Majjhima Nikaya (Middle Length Discourses)',
    author: 'Venerable Thich Minh Chau',
    summary: '152 profound middle-length discourses delivered by Shakyamuni Buddha covering moral conduct, mindfulness, and the cessation of suffering.'
  },
  'tt_kinh_truong_a_ham': {
    title: 'Dirgha Agama (Long Discourses)',
    author: 'Venerable Thich Tue Sy',
    summary: 'Chinese Agama canon collection of thirty comprehensive foundational discourses by the Buddha.'
  },
  'tt_kinh_truong_bo': {
    title: 'Digha Nikaya (Long Discourses)',
    author: 'Venerable Thich Minh Chau',
    summary: 'Thirty-four comprehensive Pali suttas illuminating Buddhist cosmology, social ethics, meditation stages, and the Buddha’s final days.'
  },
  'tt_kinh_tuy_cau_tuc_dac_dai_tu_tai': {
    title: 'Maha-Pratisara Dharani Sutra',
    author: 'Ratnacinta / Master Vien Duc',
    summary: 'Sacred Dharani of the Great Wish-Fulfilling Bodhisattva providing divine protection and granting virtuous aspirations.'
  },
  'tt_kinh_vo_luong_tho': {
    title: 'Infinite Life Sutra (Larger Sukhavativyuha Sutra)',
    author: 'Sanghavarman / Master Tri Tinh',
    summary: 'The primary Pure Land scripture detailing the 48 vows of Dharmakara Bodhisattva and the supreme beauty of Amitabha Buddha’s Pure Land.'
  },
  'tt_kinh_dai_bi_tam_da_la_ni': {
    title: 'Great Compassion Dharani Sutra',
    author: 'Bhagavaddharma / Master Thien Tam',
    summary: 'Scripture expounding the origin, boundless merits, and recitation method of Avalokiteshvara’s 84-phrase Great Compassion Mantra.'
  },
  'tt_kinh_nhap_nhu_lai_tri_duc_bat_tu_nghi': {
    title: 'Sutra on Entering the Inconceivable Wisdom of the Tathagata',
    author: 'Siksananda (Translation)',
    summary: 'Expounding the unfathomable, boundless wisdom and enlightened virtues of the Tathagata.'
  },
  'tt_kinh_hoa_nghiem': {
    title: 'Avatamsaka Sutra (Flower Adornment Sutra)',
    author: 'Siksananda / Master Tri Tinh',
    summary: 'The grandest Buddhist scripture revealing the interpenetration and harmony of all dharmas in the cosmic realm of Vairocana Buddha.'
  },
  'tt_1783477721256': {
    title: 'Mahayana Sutra on the Merits of Making Buddha Images',
    author: 'Quang Tu',
    summary: 'Scripture explaining the immense karmic blessings, auspicious rebirths, and purification resulting from crafting and honoring Buddha statues.'
  },
  'tt_1780910773084': {
    title: 'Ksitigarbha Bodhisattva Fundamental Vows Sutra',
    author: 'Venerable Master Thich Tri Tinh',
    summary: 'The filial piety scripture of Buddhism expounding Bodhisattva Ksitigarbha’s profound vows to deliver all beings from suffering in the lower realms.'
  },
  'tt_nghi_quy_tuy_cau_tuc_dac': {
    title: 'Maha-Pratisara Ritual Procedures',
    author: 'Amoghavajra / Master Vien Duc',
    summary: 'Esoteric ritual manual detailing altar setup, mudras, and recitation of the Maha-Pratisara Dharani.'
  },

  // === SÁCH KHUYẾN THIỆN (MORAL & VIRTUE AWAKENING BOOKS) ===
  'tt_1781528365165': {
    title: 'An Sy Complete Works — Upper Volume',
    author: 'Zhou Anshi',
    summary: 'Classic ethical masterpiece expounding the Wenchang Lord Tract on the Hidden Merit and filial piety.'
  },
  'tt_1781528545428': {
    title: 'An Sy Complete Works — Lower Volume',
    author: 'Zhou Anshi',
    summary: 'Essential treatises on refraining from killing, abstaining from lust, and mindfully reciting the Buddha’s name.'
  },
  'tt_1781528630892': {
    title: 'Urging People to Refrain from Killing',
    author: 'Zhou Anshi',
    summary: 'Compelling stories and ethical discourses advocating animal liberation, vegetarianism, and universal benevolence.'
  },
  'tt_1781528773286': {
    title: 'Urging People to Renounce Lust and Greed',
    author: 'Zhou Anshi',
    summary: 'Wise counsel and vivid karmic lessons encouraging moral integrity, self-discipline, and conquering sensual desires.'
  },
  'tt_1781528855960': {
    title: 'Urging People to Recite Buddha’s Name for Pure Land Rebirth',
    author: 'Zhou Anshi',
    summary: 'Inspiring essays guiding practitioners toward wholehearted mindfulness of Amitabha Buddha.'
  },
  'tt_1781529002479': {
    title: 'Transforming Misfortune into Blessing',
    author: 'Ancient Masters',
    summary: 'True historical accounts demonstrating how wholesome thoughts and selfless deeds reverse ill fate into prosperous fortune.'
  },
  'tt_1781517395283': {
    title: 'Travels in Samsara',
    author: 'Traditional Records',
    summary: 'Eye-opening accounts of journeys through karmic realms illustrating the cycle of rebirth.'
  },
  'tt_1781452671270': {
    title: 'Journeys to the Underworld',
    author: 'Traditional Records',
    summary: 'Records detailing the consequences of earthly actions in the realms of retribution to warn humanity away from wrongdoing.'
  },
  'tt_1783429280091_jcrra': {
    title: 'Precious Mirror for Preserving Health and Chastity',
    author: 'Venerable Master Yinguang',
    summary: 'Invaluable guide on cherishing life energy, cultivating chastity, and upholding moral virtues for health and longevity.'
  },
  'tt_1781449424574': {
    title: 'Jade Record of Karmic Treasuries',
    author: 'Traditional Records',
    summary: 'Ancient moral guide describing cosmic retribution and the virtue of early repentance and good deeds.'
  },
  'tt_1781604218473': {
    title: 'Inexorable Karmic Law — Volume 1',
    author: 'Spiritual Chronicle',
    summary: 'Vivid real-life experiences in the spiritual realms illustrating modern causes and conditions.'
  },
  'tt_1781604252515': {
    title: 'Inexorable Karmic Law — Volume 2',
    author: 'Spiritual Chronicle',
    summary: 'Second volume continuing revelations of modern karma and the importance of virtue and spiritual awakening.'
  },
  'tt_1783430466781_shqcq': {
    title: 'Past Life Stories of the Buddha (Jataka Tales)',
    author: 'Buddhist Canon',
    summary: 'Inspirational parables of Shakyamuni Buddha’s boundless sacrifices and perfection of virtues throughout countless past lives.'
  },
  'tt_1781614552425': {
    title: 'Q&A on the Holy Virtues of Ksitigarbha Bodhisattva',
    author: 'Buddhist Masters',
    summary: 'Clear answers explaining the supreme vows, merits, and proper methods of invoking Bodhisattva Ksitigarbha.'
  },
  'tt_1781614754721': {
    title: 'Miraculous Responses of Ksitigarbha Bodhisattva',
    author: 'Historical Records',
    summary: 'Historical testimonies and miraculous occurrences witnessed by devout practitioners of the Ksitigarbha vows.'
  }
};

const jsonPath = path.resolve('src/lib/data/offline-books-en.json');
const currentData = JSON.parse(fs.readFileSync(jsonPath, 'utf-8'));

for (const [id, meta] of Object.entries(NEW_TRANSLATIONS)) {
  currentData[id] = meta;
  // Also provide alias without prefix or with book_ prefix if applicable
  if (id.startsWith('book_')) {
    currentData[id.replace(/^book_/u, '')] = meta;
  } else {
    currentData[`book_${id}`] = meta;
  }
}

fs.writeFileSync(jsonPath, JSON.stringify(currentData, null, 2), 'utf-8');
console.log(`Updated ${jsonPath} with total ${Object.keys(currentData).length} entries.`);

// Also copy to build & android assets if present
const buildPath = path.resolve('build/offline-books-en.json');
if (fs.existsSync(path.resolve('build'))) {
  fs.writeFileSync(buildPath, JSON.stringify(currentData, null, 2), 'utf-8');
}
const androidPath = path.resolve('android/app/src/main/assets/public/offline-books-en.json');
if (fs.existsSync(path.resolve('android/app/src/main/assets/public'))) {
  fs.writeFileSync(androidPath, JSON.stringify(currentData, null, 2), 'utf-8');
}
