/**
 * Vietnamese text normalizer and chunking optimizer for speech synthesis (TTS).
 * Specifically designed for Vietnamese Buddhist texts, sutras, and literary PDFs.
 */

const ROMAN_TO_ARABIC: Record<string, string> = {
  I: '1', II: '2', III: '3', IV: '4', V: '5',
  VI: '6', VII: '7', VIII: '8', IX: '9', X: '10',
  XI: '11', XII: '12', XIII: '13', XIV: '14', XV: '15',
  XVI: '16', XVII: '17', XVIII: '18', XIX: '19', XX: '20',
  XXI: '21', XXII: '22', XXIII: '23', XXIV: '24', XXV: '25',
  XXX: '30',
};

const ROMAN_PATTERN = '(?:XXX|XX[IVX]*|X[IVX]*|IX|VIII|VII|VI|V|IV|III|II|I)';

/**
 * Cleans and normalizes Vietnamese text so that Text-To-Speech engines
 * (Google TTS, Microsoft Natural Voices, Apple Voices, etc.)
 * pronounce the text accurately, smoothly, and without stumbling over
 * PDF artifacts, Buddhist terminology, or Roman numerals.
 */
export function cleanVietnameseTextForSpeech(rawText: string): string {
  if (!rawText || !rawText.trim()) return '';

  let text = rawText.normalize('NFC');

  // 1. Strip non-printable and zero-width characters
  text = text.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F-\u009F\u00AD\u200B-\u200F\uFEFF]/g, '');

  // 1b. Expand common typographical ligatures into standard letters
  text = text
    .replace(/\uFB00/g, 'ff')
    .replace(/\uFB01/g, 'fi')
    .replace(/\uFB02/g, 'fl')
    .replace(/\uFB03/g, 'ffi')
    .replace(/\uFB04/g, 'ffl')
    .replace(/\uFB05/g, 'ft')
    .replace(/\uFB06/g, 'st');

  // 2. Remove footnote references: [1], [2], (1), ¹, ², ³, etc.
  text = text.replace(/\[\d+\]/gu, '');
  text = text.replace(/\(\d+\)/gu, '');
  text = text.replace(/[¹²³⁴⁵⁶⁷⁸⁹⁰]/gu, '');

  // 3. Filter out standalone header/footer page numbers and running titles
  const rawLines = text.split(/\r?\n/).map((l) => l.trim());
  const filteredLines = rawLines.filter((line, index) => {
    if (!line) return false;
    const isEdgeLine = index <= 1 || index >= rawLines.length - 2;
    if (isEdgeLine) {
      // Standalone numbers, e.g. "15", "- 15 -", "— 15 —", "~ 15 ~"
      if (/^[-–—~*•\s]*\d+[-–—~*•\s]*$/u.test(line)) return false;
      // "Trang 15", "Trang 15 / 120", "Page 15"
      if (/^(?:trang|page)\s+\d+(?:\s*\/\s*\d+)?$/iu.test(line)) return false;
      // "15/120"
      if (/^\d+\s*\/\s*\d+$/u.test(line)) return false;
      // Standalone Roman numeral page numbers: e.g. "II", "IV", "- IX -"
      if (/^[-–—~*•\s]*(?:XXX|XX[IVX]*|X[IVX]*|IX|VIII|VII|VI|V|IV|III|II|I)[-–—~*•\s]*$/iu.test(line)) return false;
      // Common running headers (repeated site/book title headers at edge)
      const cleanHeader = line.replace(/[-–—•*|~]/gu, ' ').replace(/\s+/gu, ' ').trim();
      if (/^(?:tu tập cùng quang tử|phật tử thiên địa du ký|tủ sách phật học|quang tử)$/iu.test(cleanHeader)) return false;
    }
    return true;
  });
  text = filteredLines.join('\n');

  // 4. Strip bullet points and list symbols at start of lines
  text = text.replace(/(^|\n)\s*[•●○■□▪▫◆◇▲▼★☆❖✓✔✕✗*~]\s*/gu, '$1');

  // 5. Dehyphenate words broken at line breaks in PDFs (e.g. "phát-\n triển" -> "phát triển")
  text = text.replace(/([a-zA-ZÀ-ỹ0-9])[-‐‑‒–—]\s*\n+\s*([a-zA-ZÀ-ỹ0-9])/gu, '$1 $2');

  // 5b. Repair broken Vietnamese syllables and kerning splits from PDF font encoding
  // Merge detached combining tone marks with the preceding vowel
  text = text
    .replace(/([a-zA-ZÀ-ỹ])\s+([\u0300-\u036F\u1DC0-\u1DFF\u20D0-\u20FF\uFE20-\uFE2F])/gu, '$1$2')
    .normalize('NFC');

  // Merge compound initial consonants that cannot be standalone words:
  // ngh, ch, gh, kh, nh, ph, th, tr, qu, ng, đ followed by vowel
  text = text.replace(
    /(?<![\p{L}\p{N}])(ngh|Ngh|NGH|ch|Ch|CH|gh|Gh|GH|kh|Kh|KH|nh|Nh|NH|ph|Ph|PH|th|Th|TH|tr|Tr|TR|qu|Qu|QU|ng|Ng|NG|đ|Đ)\s+([aàáảãạăằắẳẵặâầấẩẫậeèéẻẽẹêềếểễệiìíỉĩịoòóỏõọôồốổỗộơờớởỡợuùúủũụưừứửữựyỳýỷỹỵ][a-zA-ZÀ-ỹ]*)(?![\p{L}\p{N}])/gu,
    '$1$2'
  );

  // Merge single initial consonants followed by an accented Vietnamese vowel (e.g. "t âm" -> "tâm", "c ủa" -> "của", "s ự" -> "sự")
  text = text.replace(
    /(?<![\p{L}\p{N}])([b-df-hj-np-tv-zđB-DF-HJ-NP-TV-ZĐ])\s+([àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệiìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵ][a-zA-ZÀ-ỹ]*)(?![\p{L}\p{N}])/gu,
    '$1$2'
  );

  // Merge split diphthong codas (e.g. "ngư ời" -> "người", "trư ớc" -> "trước", "ti ếp" -> "tiếp", "hi ện" -> "hiện")
  text = text.replace(
    /(?<![\p{L}\p{N}])(ngư|trư|nư|ti|hi|li|bi|vi|si|tri|khi|phi|nghi|chi)\s+(ời|ớc|ợc|ớn|ợn|ớp|ợp|ớt|ợt|ỡng|ựng|ực|ức|ưng|ẹp|ệt|ệm|ện|ếp|ết|ếm|ến|ập|ật|ậm|ận|ắp|ắt|ắm|ắn)(?![\p{L}\p{N}])/giu,
    '$1$2'
  );

  // 5c. Ensure headings and titles end with terminal punctuation for natural speech pauses
  const linesAfterHyphen = text.split(/\r?\n/);
  const punctuatedLines = linesAfterHyphen.map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    const isHeading =
      /^(?:Chương|Phần|Tập|Mục|Bài|Quyển|Phẩm|Tiết|Hồi|Đoạn|\d+\.|(?:XXX|XX[IVX]*|X[IVX]*|IX|VIII|VII|VI|V|IV|III|II|I)\.)\b/iu.test(trimmed) ||
      (trimmed.length <= 50 && trimmed === trimmed.toUpperCase() && /[A-ZÀ-Ỹ]{3,}/u.test(trimmed));
    if (isHeading && !/[.?!:;…]$/u.test(trimmed)) {
      return `${trimmed}.`;
    }
    return line;
  });
  text = punctuatedLines.join('\n');

  // 6. Soft line breaks to spaces within sentences, but keep double newlines or end-of-sentence breaks
  text = text.replace(/([^\n])\n([^\n])/gu, (match, p1, p2) => {
    if (/[.?!:;…]$/u.test(p1.trim())) {
      return `${p1}\n${p2}`;
    }
    return `${p1} ${p2}`;
  });

  // 7. Expand Roman numerals in chapter/section titles:
  // "Chương I" -> "Chương 1", "Phần IV" -> "Phần 4", "Thế kỷ XXI" -> "Thế kỷ 21"
  const prefixRegex = new RegExp(
    `(?<=^|[\\s,;:(])(Chương|Phần|Tập|Mục|Bài|Quyển|Phẩm|Hồi|Tiết|Kỳ|Đoạn|Thế kỷ)\\s+(${ROMAN_PATTERN})(?=[\\s,;:.?!)]|$)`,
    'giu'
  );
  text = text.replace(prefixRegex, (_, prefix, roman) => {
    const arabic = ROMAN_TO_ARABIC[roman.toUpperCase()];
    return arabic ? `${prefix} ${arabic}` : `${prefix} ${roman}`;
  });

  // Standalone Roman numerals at beginning of lines: e.g. "\nI. " -> "\n1. "
  const startRomanRegex = new RegExp(`(^|\\n)(${ROMAN_PATTERN})\\.\\s+`, 'gmu');
  text = text.replace(startRomanRegex, (_, start, roman) => {
    const arabic = ROMAN_TO_ARABIC[roman.toUpperCase()];
    return arabic ? `${start}${arabic}. ` : `${start}${roman}. `;
  });

  // 8. Expand Vietnamese Buddhist, ecclesiastical, and literature abbreviations
  text = text
    .replace(/(?<=^|[\s,;:(])TT\.\s*([A-ZÀ-Ỹ])/gu, 'Thượng tọa $1')
    .replace(/(?<=^|[\s,;:(])HT\.\s*([A-ZÀ-Ỹ])/gu, 'Hòa thượng $1')
    .replace(/(?<=^|[\s,;:(])ĐĐ\.\s*([A-ZÀ-Ỹ])/gu, 'Đại đức $1')
    .replace(/(?<=^|[\s,;:(])NS\.\s*([A-ZÀ-Ỹ])/gu, 'Ni sư $1')
    .replace(/(?<=^|[\s,;:(])SC\.\s*([A-ZÀ-Ỹ])/gu, 'Sư cô $1')
    .replace(/(?<=^|[\s,;:(])GS\.\s*([A-ZÀ-Ỹ])/gu, 'Giáo sư $1')
    .replace(/(?<=^|[\s,;:(])PGS\.\s*([A-ZÀ-Ỹ])/gu, 'Phó giáo sư $1')
    .replace(/(?<=^|[\s,;:(])TS\.\s*([A-ZÀ-Ỹ])/gu, 'Tiến sĩ $1')
    .replace(/(?<=^|[\s,;:(])ThS\.\s*([A-ZÀ-Ỹ])/gu, 'Thạc sĩ $1')
    .replace(/(?<=^|[\s,;:(])BS\.\s*([A-ZÀ-Ỹ])/gu, 'Bác sĩ $1')
    .replace(/(?<=^|[\s,;:(])tr\.\s*(\d+)/giu, 'trang $1')
    .replace(/(?<=^|[\s,;:(])v\.v(?:\.{1,3}|…)?(?=[\s,;:.?!)]|$)/giu, 'vân vân.')
    .replace(/(?<=^|[\s,;:(])k\/g(?=[\s,;:.?!)]|$)/giu, 'Kính gửi')
    .replace(/(?<=^|[\s,;:(])đ\/c(?=[\s,;:.?!)]|$)/giu, 'đồng chí')
    .replace(/(?<=^|[\s,;:(])STT(?=[\s,;:.?!)]|$)/gu, 'số thứ tự')
    .replace(/(?<=^|[\s,;:(])NXB(?=[\s,;:.?!)]|$)/gu, 'Nhà xuất bản')
    .replace(/(?<=^|[\s,;:(])TP\.\s*([A-ZÀ-Ỹ])/gu, 'Thành phố $1')
    .replace(/(?<=^|[\s,;:(])TX\.\s*([A-ZÀ-Ỹ])/gu, 'Thị xã $1')
    .replace(/\b(\d+)\/(\d+)\b/gu, '$1 phần $2')
    .replace(/(\d+)\s*[-–—]\s*(\d+)/gu, '$1 đến $2')
    .replace(/(\d+)\s*%/gu, '$1 phần trăm')
    .replace(/\s*&\s*/gu, ' và ');

  // 9. Clean hyphenated Buddhist terms and compound syllables
  // E.g. "Thích-ca" -> "Thích ca", "Bồ-tát" -> "Bồ tát", "A-di-đà" -> "A di đà"
  while (/([a-zA-ZÀ-ỹ])-([a-zA-ZÀ-ỹ])/u.test(text)) {
    text = text.replace(/([a-zA-ZÀ-ỹ])-([a-zA-ZÀ-ỹ])/gu, '$1 $2');
  }

  // 10. Clean raw web links and remaining bullet symbols
  text = text.replace(/https?:\/\/\S+/giu, ' ');
  text = text.replace(/www\.\S+/giu, ' ');
  text = text.replace(/[•●○■□▪▫◆◇▲▼★☆❖✓✔✕✗*~]/gu, ', ');

  // 11. Normalize punctuation and spaces
  text = text
    .replace(/(?:\.{3,}|…)\s*(?=[a-zà-ỹ])/gu, ', ') // ellipsis followed by lowercase becomes comma pause
    .replace(/(?:\.{3,}|…)/gu, '. ') // ellipsis at sentence end becomes period pause
    .replace(/[.]{2,}/gu, '.')
    .replace(/[!]{2,}/gu, '!')
    .replace(/[?]{2,}/gu, '?')
    .replace(/[-—–]{2,}/gu, ' — ')
    .replace(/,\s*,+/gu, ',')
    .replace(/\s+([,.;:!?%)}\]\u00bb”’])/gu, '$1') // remove space before punctuation
    .replace(/([(\[{\u00ab“‘])\s+/gu, '$1') // remove space after opening quote/paren
    .replace(/([,;:?!])([^\s0-9"”’)])/gu, '$1 $2') // ensure space after punctuation
    .replace(/[ \t]+/gu, ' ')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();

  return text;
}

/**
 * Splits normalized text into chunks suitable for speech synthesis.
 * Preserves paragraph boundaries (\n\n) and adds paragraph ending pauses,
 * allowing the reader speech engine to introduce natural breathing pauses between sentences and paragraphs.
 */
export function splitIntoSpeechChunks(text: string, maxChars = 160, minChars = 35): string[] {
  if (!text || !text.trim()) return [];

  const paragraphs = text
    .split(/\n\s*\n+/u)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];

  for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
    const paragraph = paragraphs[pIdx];
    const isLastParagraph = pIdx === paragraphs.length - 1;

    const rawSentences = paragraph
      .split(/(?<=[.?!…])\s+/u)
      .map((s) => s.trim())
      .filter(Boolean);

    const paraChunks: string[] = [];

    for (const sentence of rawSentences) {
      if (sentence.length <= maxChars) {
        const prev = paraChunks[paraChunks.length - 1];
        if (prev && prev.length < 15 && !/[.?!…]$/u.test(prev) && (prev.length + sentence.length + 1) <= maxChars) {
          paraChunks[paraChunks.length - 1] = `${prev} ${sentence}`;
        } else {
          paraChunks.push(sentence);
        }
      } else {
        const subChunks = splitLongSentence(sentence, maxChars, minChars);
        for (const sc of subChunks) {
          if (sc.trim()) paraChunks.push(sc.trim());
        }
      }
    }

    if (paraChunks.length > 0) {
      // Add trailing newline to the last chunk of each paragraph so calculatePauseDuration awards a natural breathing pause
      if (!isLastParagraph) {
        paraChunks[paraChunks.length - 1] += '\n';
      }
      chunks.push(...paraChunks);
    }
  }

  return chunks;
}

/**
 * Splits a single long sentence into smaller clauses using punctuation boundaries (, ; : — –).
 */
function splitLongSentence(sentence: string, maxChars: number, minChars: number): string[] {
  if (sentence.length <= maxChars) return [sentence];

  const result: string[] = [];
  let remaining = sentence;

  while (remaining.length > maxChars) {
    const window = remaining.slice(0, maxChars);
    let splitIdx = -1;

    const clauseMatch = /[,;:—–)"]\s+/gu;
    let match: RegExpExecArray | null;
    let lastMatchEnd = -1;

    while ((match = clauseMatch.exec(window)) !== null) {
      if (match.index >= minChars) {
        lastMatchEnd = match.index + match[0].length;
      }
    }

    if (lastMatchEnd > 0) {
      splitIdx = lastMatchEnd;
    } else {
      const lastSpace = window.lastIndexOf(' ');
      if (lastSpace >= minChars) {
        splitIdx = lastSpace + 1;
      } else {
        splitIdx = maxChars;
      }
    }

    const chunk = remaining.slice(0, splitIdx).trim();
    if (chunk) result.push(chunk);
    remaining = remaining.slice(splitIdx).trim();
  }

  if (remaining.trim()) {
    result.push(remaining.trim());
  }

  return result;
}
