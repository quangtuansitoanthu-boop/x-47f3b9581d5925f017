import fs from 'node:fs';
import path from 'node:path';

const VI_PATH = 'static/offline-data/chapters/tt_1781081372340_1_xqcxo.json';
const EN_PATH = 'static/offline-data/chapters-en/tt_1781081372340_1_xqcxo.json';

const CHAPTER_TITLES = [
  'Introduction',
  'Story 1: Ten Years of Torment in the Hell of Excrement',
  'Story 2: The Retribution of Skinning Live Frogs',
  'Story 3: The Grave Sin of the Unfilial Child',
  'Story 4: The Slain Pig Reborn in Human Form',
  'Story 5: Under the Wings of the Wild Birds',
  'Story 6: Midwife to a Ghost',
  'Story 7: Exploiting Religion for Wealth',
  'Story 8: The Fatal Retribution of Harmful Speech',
  'Story 9: Vegetarian in Life, Yet Born a Hungry Ghost',
  'Story 10: Scattering Road Nails for Profit',
  'Story 11: Riding the Sacred Elephant',
  'Story 12: The Cruel Dog Thief',
  'Story 13: Sparing Neither the Young nor the Old',
  'Story 14: Blind Passion Without Escape',
  'Story 15: The Corpse Beneath the Bed',
  'Story 16: The Vast, Inescapable Net of Heaven',
  'Story 17: Abortion and Sexual Misconduct',
  'Story 18: Distortion of Truth and Slander',
  'Story 19: Fresh Blood as the Silent Accusation',
  'Story 20: The Ocean Grave of Wandering Souls',
  'Story 21: Alcohol, Domestic Violence, and Ruin',
  'Story 22: Merits and Transgressions Strictly Weighed',
  'Story 23: Sorcery and Binding Departed Spirits',
  'Story 24: The Curse of a Malicious Vow',
  'Story 25: Wasting Food and the Hungry Ghost Retribution',
  'Story 26: The Grinding Stone Hell',
  'Story 27: Defaming Monastics and Holy Sages',
  'Story 28: Reborn as a Woodworm',
  'Story 29: Karmic Fetters of Delusional Attachment',
  'Story 30: Treachery and Bitter Ingratitude',
  'Story 31: Remorse Come Too Late',
  'Story 32: The Impartial Law of the Netherworld',
  'Story 33: Light at the End of the Dark Path',
  'Story 34: The Severe Retribution of Filial Transgression',
  'Story 35: The Poisonous Oath Fulfilled',
  'Story 36: Reckless Street Racing and Ghostly Haunting',
  'Story 37: Karmic Authorization for Life Retribution',
  'Story 38: Carving Flesh to Feed the Mother-in-Law',
  'Story 39: Hypocrisy Behind a Spiritual Façade',
  'Story 40: The Vengeful Eel Spirit',
  'Story 41: Dismembered into Thirteen Pieces',
  'Story 42: The Malicious Cat Spirit',
  'Story 43: Making Amends for Unread Liturgies',
  'Story 44: The Terrible Verdict on Adultery',
  'Story 45: Dishonest Scales and Fraudulent Trade',
  'Story 46: Snake Wine, Ornamental Fish, and Suffering',
  'Story 47: Seven Lifetimes of Begging',
  'Story 48: The Compassionate Tears of a Stranger',
  'Story 49: Malicious Speech and Miserly Greed',
  'Story 50: Trafficking Purity and Exploiting Innocence'
];

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
      await new Promise((r) => setTimeout(r, 500 * (i + 1)));
    }
  }
  return text;
}

function postProcessEnglish(text, chapterIndex) {
  let cleaned = text;

  const replacements = [
    // Filial impiety
    [/great filial piety is one of the heaviest/gi, 'grave unfilial conduct is one of the heaviest sins'],
    [/great filial piety is a heavy sin/gi, 'grave unfilial conduct is a heavy sin'],
    [/great filial piety is the heaviest sin/gi, 'grave filial impiety is the heaviest sin'],
    [/sin of great filial piety/gi, 'sin of filial impiety'],
    [/great filial piety/gi, 'grave unfilial transgression'],
    [/unclaimed child/gi, 'Unfilial Child'],
    [/unfortunate child/gi, 'Unfilial Child'],
    [/the verdict of the great faith/gi, 'The Verdict on Grave Filial Impiety'],
    [/great faith/gi, 'grave filial transgression'],
    [/sin of filial piety/gi, 'sin of filial impiety'],

    // Hell and retribution
    [/eating shit for 10 years/gi, 'Ten Years of Torment in the Hell of Excrement'],
    [/10 years of shit/gi, 'Ten Years Consuming Filth in Hell'],
    [/had to eat shit for ten years/gi, 'had to consume filth for ten years'],
    [/eat shit/gi, 'consume filth and excrement'],
    [/ate shit/gi, 'consumed filth and excrement'],
    [/eating shit/gi, 'consuming filth in the excrement hell'],
    [/hell magic jelly/gi, 'the Grinding Stone Hell'],
    [/magic jelly/gi, 'the Grinding Stone Hell'],
    [/the professional man/gi, 'The Retribution of Harmful Speech'],
    [/professional man/gi, 'man with severe karma of speech'],
    [/adult sentence/gi, 'The Verdict on Adultery'],
    [/sound law without sentence/gi, 'The Impartial Law of the Netherworld'],
    [/sound law/gi, 'Law of the Netherworld'],
    [/without sentence/gi, 'impartial and relentless'],
    [/claiming the monster/gi, 'Defaming Monastics and Holy Sages'],
    [/claim the monster/gi, 'slander virtuous monastics'],
    [/being a word/gi, 'Reborn as a Woodworm'],
    [/good grace/gi, 'Treachery and Bitter Ingratitude'],
    [/evil talking - singy/gi, 'Malicious Speech and Miserly Greed'],
    [/turning the soul/gi, 'Binding and Suppressing Departed Spirits'],
    [/breaking meat for my mother-in-law to eat/gi, 'Carving Flesh to Feed the Mother-in-Law'],
    [/poison oath/gi, 'Malicious Oath'],
    [/permitting lives/gi, 'Karmic Authorization for Life Retribution'],
    [/reading the classics/gi, 'Making Amends for Unread Liturgies'],
    [/the long sky net/gi, 'The Vast Net of Heaven'],
    [/sky net/gi, 'inviolable net of Heaven'],
    [/nursery for a ghost/gi, 'Midwife to a Ghost'],
    [/borrowing to make money/gi, 'Exploiting Religion for Profit'],

    // Spiritual terms
    [/Tien Ong/gi, 'the Mountain Immortal'],
    [/fairy grandfather/gi, 'the Mountain Immortal'],
    [/fairy father/gi, 'the Mountain Immortal'],
    [/salvation path/gi, 'path of spirit deliverance'],
    [/path to salvation/gi, 'path of spirit deliverance'],
    [/do vong/gi, 'spirit deliverance'],
    [/cannot be escaped/gi, 'cannot find deliverance'],
    [/could not be escaped/gi, 'could not find deliverance'],
    [/cannot escape after leaving the body/gi, 'cannot attain liberation after leaving their physical body'],
    [/cannot escape/gi, 'cannot attain liberation'],
    [/ghostly woman/gi, 'female spirit'],
    [/dead woman/gi, 'female spirit'],
    [/female ghost/gi, 'female spirit'],
    [/Buddha Dharma/gi, 'the Buddha Dharma'],
    [/Cause and Effect - Spirituality/gi, 'Cause and Effect, and the Spiritual Realm'],
    [/hungry demons/gi, 'hungry ghosts'],
    [/hunger demons/gi, 'hungry ghosts'],
    [/karmic creditors/gi, 'karmic creditors'],
    [/oan gia trai chu/gi, 'karmic creditors'],
    [/vong linh/gi, 'departed spirit'],
    [/vong nu/gi, 'female spirit'],

    // Grammar & Flow
    [/In the midst of life full of hustle and bustle/gi, 'Amidst a life filled with clamor, worldly conflict,'],
    [/know how to stop before bad things/gi, 'pause before committing unwholesome deeds'],
    [/know how to turn back while there is still time/gi, 'repent and turn back while time remains'],
    [/people can read and be afraid/gi, 'readers may awaken to reverent awe before karma'],
    [/luckier in that I am/gi, 'blessed with the good fortune to be'],
    [/social network account/gi, 'social media channel'],
    [/Duc is Studying Buddhism/gi, 'Duc is Learning Buddhism']
  ];

  for (const [pattern, replacement] of replacements) {
    cleaned = cleaned.replace(pattern, replacement);
  }

  // Prepend single centered header
  const targetTitle = CHAPTER_TITLES[chapterIndex] || `Story ${chapterIndex}`;
  const headerUpper = targetTitle.toUpperCase();
  cleaned = `{align:center|**${headerUpper}**}\n\n` + cleaned.trim();

  return cleaned;
}

async function translateChapter(viContent, chapterIndex) {
  // 1. Extract images with placeholders
  const images = [];
  let text = viContent.replace(/!\[[^\]]*\]\([^)]+\)/g, (m) => {
    images.push(m);
    return `\n\n__IMG_TOKEN_${images.length - 1}__\n\n`;
  });

  // 2. Remove any old header
  text = text.replace(/^\{align:center\|\*\*[^*]+\*\*\}\s*/i, '').trim();

  // 3. Split into paragraphs
  const rawParagraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const translatedParagraphs = [];

  for (const p of rawParagraphs) {
    if (p.startsWith('__IMG_TOKEN_')) {
      translatedParagraphs.push(p);
      continue;
    }

    // Split long paragraphs if over 1200 chars
    if (p.length > 1200) {
      const sentences = p.split(/(?<=[.!?…])\s+/);
      let subChunk = '';
      for (const s of sentences) {
        if ((subChunk + ' ' + s).length > 1000) {
          if (subChunk) {
            const tr = await translateChunk(subChunk);
            translatedParagraphs.push(tr);
          }
          subChunk = s;
        } else {
          subChunk = subChunk ? `${subChunk} ${s}` : s;
        }
      }
      if (subChunk) {
        const tr = await translateChunk(subChunk);
        translatedParagraphs.push(tr);
      }
    } else {
      const tr = await translateChunk(p);
      translatedParagraphs.push(tr);
    }
    await new Promise((r) => setTimeout(r, 60));
  }

  let finalContent = translatedParagraphs.join('\n\n');

  // 4. Restore images
  images.forEach((img, idx) => {
    finalContent = finalContent.replace(`__IMG_TOKEN_${idx}__`, img);
  });

  // 5. Post-process English grammar and Buddhist terminology
  return postProcessEnglish(finalContent, chapterIndex);
}

async function main() {
  console.log('=== RETRANSLATING & POLISHING SỨ MỆNH ĐỘ VONG (51 CHAPTERS) ===');
  const viChapters = JSON.parse(fs.readFileSync(VI_PATH, 'utf8'));
  let enChapters = fs.existsSync(EN_PATH) ? JSON.parse(fs.readFileSync(EN_PATH, 'utf8')) : [];

  for (let i = 0; i < viChapters.length; i++) {
    const viChap = viChapters[i];
    const curatedTitle = CHAPTER_TITLES[i] || viChap.tieu_de;
    console.log(`[${i + 1}/${viChapters.length}] Translating Chapter ${i}: ${curatedTitle}...`);

    const translatedContent = await translateChapter(viChap.noi_dung, i);

    enChapters[i] = {
      id: viChap.id,
      bai_viet_id: viChap.bai_viet_id,
      so_thu_tu: viChap.so_thu_tu,
      tieu_de: curatedTitle,
      tom_tat: viChap.tom_tat ? await translateChunk(viChap.tom_tat) : '',
      noi_dung: translatedContent
    };

    // Save progressively every 5 chapters
    if ((i + 1) % 5 === 0 || i === viChapters.length - 1) {
      fs.writeFileSync(EN_PATH, JSON.stringify(enChapters, null, 2), 'utf8');
      console.log(`--> Saved progress up to Chapter ${i}.`);
    }
  }

  fs.writeFileSync(EN_PATH, JSON.stringify(enChapters, null, 2), 'utf8');
  console.log('=== COMPLETED RETRANSLATION OF ALL 51 CHAPTERS! ===');
}

main().catch((err) => {
  console.error('Error during retranslation:', err);
  process.exit(1);
});
