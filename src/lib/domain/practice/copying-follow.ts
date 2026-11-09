import { normalizeCopyText } from './scripture-copying';
import { copySourceLines, type CopySourceLine } from './copying-formatting';

/** Keep alignment and bold runs while dividing the reference into visible sentences. */
export function copyingSentences(blocks: string[], block: number, layout?: CopySourceLine[]): CopySourceLine[] {
  let noteDepth = 0;
  return (layout ?? copySourceLines(blocks, block)).flatMap((line, paragraph) => {
    const text = line.parts.map(part => part.text).join('');
    let scanned = 0;
    const ends = [...text.matchAll(/[.!?…。！？]+[”"’')\]]*(?=\s|$)/gu)].flatMap(match => {
      const end = match.index! + match[0].length;
      for (const char of text.slice(scanned, match.index)) {
        if (char === '(' || char === '（') noteDepth++;
        else if ((char === ')' || char === '）') && noteDepth) noteDepth--;
      }
      const insideNote = noteDepth > 0;
      for (const char of match[0]) {
        if ((char === ')' || char === '）') && noteDepth) noteDepth--;
      }
      scanned = end;
      return insideNote ? [] : [end];
    });
    for (const char of text.slice(scanned)) {
      if (char === '(' || char === '（') noteDepth++;
      else if ((char === ')' || char === '）') && noteDepth) noteDepth--;
    }
    if (ends[ends.length - 1] !== text.length) ends.push(text.length);
    let start = 0;
    return ends.map(end => {
      let offset = 0;
      const parts = line.parts.flatMap(part => {
        const left = Math.max(start, offset), right = Math.min(end, offset + part.text.length);
        const selected = right > left ? [{ text: part.text.slice(left - offset, right - offset), bold: part.bold }] : [];
        offset += part.text.length;
        return selected;
      });
      start = end;
      return { align: line.align, parts, paragraph };
    }).filter(sentence => sentence.parts.some(part => part.text.trim()));
  });
}

/** Preserve every source character while exposing word anchors for long sentences. */
export function copyingSourceWordLines(lines: CopySourceLine[]) {
  let depth = 0;
  return lines.map(line => {
    let index = 0;
    return line.parts.flatMap(part => [...part.text.matchAll(/[\p{L}\p{M}\p{N}]+|[^\p{L}\p{M}\p{N}]+/gu)].map(match => {
      const italic = depth > 0 || /[(（]/u.test(match[0]);
      const word = !depth && /^[\p{L}\p{M}\p{N}]/u.test(match[0]) ? index++ : undefined;
      for (const char of match[0]) {
        if (char === '(' || char === '（') depth++;
        else if ((char === ')' || char === '）') && depth) depth--;
      }
      return { text: match[0], bold: part.bold, word, italic };
    }));
  });
}

export function copyingSourceWords(line: CopySourceLine) { return copyingSourceWordLines([line])[0]; }

const followKey = (text: string) => text.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/đ/gu, 'd');

/** Locate the caret's prefix, allowing a typo or missing accent without freezing the reference. */
export function copyingCursorPosition(sentences: CopySourceLine[], typed: string): { sentence: number; word: number } {
  const expected = copyingSourceWordLines(sentences).flatMap((parts, sentence) => parts.flatMap(part =>
    part.word === undefined ? [] : [{ sentence, word: part.word, key: followKey(part.text) }]));
  if (!expected.length) return { sentence: 0, word: 0 };
  const actual = normalizeCopyText(typed).split(' ').filter(Boolean).slice(0, 640).map(followKey);
  if (!actual.length) return expected[0];
  let previous = Uint16Array.from({ length: actual.length + 1 }, (_, index) => index);
  let best = 0, cost = actual.length, bestMatch = false;
  for (let i = 1; i <= expected.length; i++) {
    const row = new Uint16Array(actual.length + 1); row[0] = i;
    for (let j = 1; j <= actual.length; j++) {
      const matches = expected[i - 1].key === actual[j - 1]
        || (j === actual.length && expected[i - 1].key.startsWith(actual[j - 1]));
      row[j] = Math.min(previous[j] + 1, row[j - 1] + 1, previous[j - 1] + (matches ? 0 : 1));
    }
    const matches = expected[i - 1].key.startsWith(actual[actual.length - 1]);
    const score = row[actual.length];
    if (score < cost || (score === cost && ((matches && !bestMatch)
      || (matches === bestMatch && Math.abs(i - actual.length) < Math.abs(best - actual.length))))) {
      cost = score; best = i; bestMatch = matches;
    }
    previous = row;
  }
  const index = Math.max(0, best - 1), current = expected[index], next = expected[index + 1];
  // A fully copied sentence points to the next required sentence, skipping notes.
  if (next && next.sentence !== current.sentence && current.key === actual[actual.length - 1]) return next;
  return current;
}

export function activeCopySentence(sentences: CopySourceLine[], typed: string): number { return copyingCursorPosition(sentences, typed).sentence; }
export function activeCopyWord(sentences: CopySourceLine[], typed: string): number { return copyingCursorPosition(sentences, typed).word; }
