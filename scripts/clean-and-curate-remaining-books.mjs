import fs from 'node:fs';
import path from 'node:path';

const DIR = 'static/offline-data/chapters-en';

// Comprehensive glossary of replacements for machine-translated artifacts
const GLOSSARY = [
  // Repeated header
  [/\{align:center\|\*\*([^*]+)\*\*\}\s*\{align:center\|\*\*([^*]+)\*\*\}/gi, '{align:center|**$1**}\n\n'],
  [/\{align:center\|\*\*([^*]+)\*\*\}\s*\1\s*/gi, '{align:center|**$1**}\n\n'],

  // Severe translation errors
  [/great filial piety is one of the heaviest/gi, 'grave unfilial conduct is one of the heaviest sins'],
  [/great filial piety is a heavy sin/gi, 'grave unfilial conduct is a heavy sin'],
  [/great filial piety is the heaviest sin/gi, 'grave filial impiety is the heaviest sin'],
  [/sin of great filial piety/gi, 'sin of filial impiety'],
  [/great filial piety/gi, 'grave unfilial transgression'],
  [/the verdict of the great faith/gi, 'The Verdict on Grave Filial Impiety'],
  [/great faith/gi, 'grave filial transgression'],

  // Báo Ứng Hiện Đời specific comical artifacts
  [/LEFT HOLDER OAN/gi, 'karmic creditors'],
  [/left holder oan/gi, 'karmic creditors'],
  [/LEFT HOLDER/gi, 'karmic creditor'],
  [/PUBLICLY PUBLICLY PUBLICLY PUBLICLY PUBLICED/gi, 'Publicly confessing past misdeeds to caution the world'],
  [/PUBLICLY PUBLICLY PUBLICLY PUBLICED/gi, 'Publicly confessing past misdeeds to caution the world'],
  [/PUBLICLY PUBLICLY PUBLICED/gi, 'Publicly confessing past misdeeds'],
  [/Buddha's DISCIPLINE/gi, "the Buddha's disciple"],
  [/Buddha's discipline/gi, "the Buddha's disciple"],
  [/THE FETAL LIKES TO HEAR/gi, 'THE UNBORN CHILD LOVES LISTENING TO'],
  [/fetal likes to hear/gi, 'unborn child loves listening to'],
  [/UNWORTHY TEENS/gi, 'DELINQUENT YOUTH'],
  [/STUDENT FRIEND/gi, 'A UNIVERSITY STUDENT'],

  // Netherworld & Hell
  [/HELL MAGIC JELLY/gi, 'THE GRINDING STONE HELL'],
  [/hell magic jelly/gi, 'the Grinding Stone Hell'],
  [/magic jelly/gi, 'the Grinding Stone Hell'],
  [/ADULT SENTENCE/gi, 'THE VERDICT ON ADULTERY'],
  [/adult sentence/gi, 'the verdict on adultery'],
  [/SOUND LAW WITHOUT SENTENCE/gi, 'THE IMPARTIAL LAW OF THE NETHERWORLD'],
  [/sound law without sentence/gi, 'the impartial Law of the Netherworld'],
  [/sound law/gi, 'Law of the Netherworld'],
  [/without sentence/gi, 'impartial and relentless'],
  [/CLAIMING THE MONSTER/gi, 'DEFAMING MONASTICS AND SAGES'],
  [/claiming the monster/gi, 'defaming monastics and sages'],
  [/claim the monster/gi, 'slander virtuous monastics'],
  [/BEING A WORD/gi, 'REBORN AS A WOODWORM'],
  [/being a word/gi, 'reborn as a woodworm'],
  [/GOOD GRACE/gi, 'TREACHERY AND INGRATITUDE'],
  [/good grace/gi, 'treachery and ingratitude'],
  [/EVIL TALKING - SINGY/gi, 'MALICIOUS SPEECH AND MISERLY GREED'],
  [/evil talking - singy/gi, 'malicious speech and miserly greed'],
  [/TURNING THE SOUL/gi, 'BINDING AND SUPPRESSING DEPARTED SPIRITS'],
  [/turning the soul/gi, 'binding and suppressing departed spirits'],
  [/BREAKING MEAT FOR MY MOTHER-IN-LAW TO EAT/gi, 'CARVING FLESH TO FEED THE MOTHER-IN-LAW'],
  [/breaking meat for my mother-in-law to eat/gi, 'carving flesh to feed the mother-in-law'],
  [/POISON OATH/gi, 'MALICIOUS OATH'],
  [/poison oath/gi, 'malicious oath'],
  [/PERMITTING LIVES/gi, 'KARMIC AUTHORIZATION FOR LIFE RETRIBUTION'],
  [/permitting lives/gi, 'karmic authorization for life retribution'],
  [/READING THE CLASSICS/gi, 'MAKING AMENDS FOR UNREAD LITURGIES'],
  [/reading the classics/gi, 'making amends for unread liturgies'],
  [/THE LONG SKY NET/gi, 'THE VAST NET OF HEAVEN'],
  [/the long sky net/gi, 'the vast net of Heaven'],
  [/NURSERY FOR A GHOST/gi, 'MIDWIFE TO A GHOST'],
  [/nursery for a ghost/gi, 'midwife to a ghost'],
  [/BORROWING TO MAKE MONEY/gi, 'EXPLOITING RELIGION FOR PROFIT'],
  [/borrowing to make money/gi, 'exploiting religion for profit'],
  [/THE PROFESSIONAL MAN/gi, 'THE RETRIBUTION OF HARMFUL SPEECH'],
  [/professional man/gi, 'man of harsh speech'],
  [/10 YEARS OF SHIT/gi, 'TEN YEARS OF TORMENT IN THE HELL OF EXCREMENT'],
  [/eating shit for 10 years/gi, 'Ten Years Consuming Filth in Hell'],
  [/had to eat shit/gi, 'had to consume filth in hell'],
  [/eating shit/gi, 'consuming filth in the hell of excrement'],

  // Untranslated Vietnamese remnants
  [/người đời thường nói/gi, 'people often say'],
  [/Người đời thường nói/gi, 'People often say'],
  [/địa ngục/gi, 'the hell realms'],
  [/Địa ngục/gi, 'The Hell realm'],
  [/nhân quả/gi, 'cause and effect'],
  [/Nhân quả/gi, 'Cause and effect'],
  [/Nhân Quả/gi, 'Cause and Effect'],
  [/nghiệp chướng/gi, 'karmic obstacles'],
  [/oan gia trái chủ/gi, 'karmic creditors'],
  [/vong linh/gi, 'departed spirit'],
  [/siêu thoát/gi, 'attain liberation'],
  [/Tien Ong/gi, 'the Mountain Immortal'],
  [/Tiên Ông/gi, 'the Mountain Immortal']
];

function cleanText(text) {
  let res = text;
  for (const [pattern, replacement] of GLOSSARY) {
    res = res.replace(pattern, replacement);
  }
  return res;
}

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.json'));
let totalFixedChapters = 0;
let totalFixedFiles = 0;

for (const f of files) {
  const filePath = path.join(DIR, f);
  let changed = false;
  try {
    const chapters = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    if (!Array.isArray(chapters)) continue;

    for (const ch of chapters) {
      const oldTitle = ch.tieu_de || '';
      const oldContent = ch.noi_dung || '';

      const newTitle = cleanText(oldTitle);
      const newContent = cleanText(oldContent);

      if (newTitle !== oldTitle || newContent !== oldContent) {
        ch.tieu_de = newTitle;
        ch.noi_dung = newContent;
        changed = true;
        totalFixedChapters++;
      }
    }

    if (changed) {
      fs.writeFileSync(filePath, JSON.stringify(chapters, null, 2), 'utf8');
      totalFixedFiles++;
      console.log(`✓ Cleaned: ${f}`);
    }
  } catch (err) {
    console.error(`Error processing ${f}:`, err);
  }
}

console.log(`\n=== CLEANUP COMPLETED ===`);
console.log(`Total files cleaned: ${totalFixedFiles}`);
console.log(`Total chapters refined: ${totalFixedChapters}`);
