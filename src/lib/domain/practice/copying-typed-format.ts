import type { CopySourceLine } from './copying-formatting';

export interface TypedRun { text: string; bold: boolean; align: CopySourceLine['align']; line: number }
const words = (text: string) => [...text.matchAll(/[\p{L}\p{M}\p{N}]+/gu)];
const key = (text: string) => text.normalize('NFC').toLocaleLowerCase('vi');

/** Formatting follows source words; the user's spelling, case and whitespace stay untouched. */
export function formatTypedCopy(source: CopySourceLine[], typed: string): TypedRun[] {
  const expected: Array<{ key: string; bold: boolean; align: CopySourceLine['align']; line: number }> = [];
  let depth = 0;
  source.forEach((line, index) => {
    for (const part of line.parts) {
      const visible = [...part.text].map(char => {
        if (char === '(' || char === '（') { depth++; return ' '; }
        if ((char === ')' || char === '）') && depth) { depth--; return ' '; }
        return depth ? ' ' : char;
      }).join('');
      for (const word of words(visible)) expected.push({ key: key(word[0]), bold: part.bold, align: line.align, line: line.paragraph ?? index });
    }
  });
  const result: TypedRun[] = [];
  let cursor = 0, position = 0, typedNoteDepth = 0;
  let style = expected[0] ?? { bold: false, align: 'justify' as const, line: 0 };
  const append = (text: string, format = style) => {
    if (!text) return;
    const last = result[result.length - 1];
    if (last && last.bold === format.bold && last.line === format.line) last.text += text;
    else result.push({ text, bold: format.bold, align: format.align, line: format.line });
  };
  const typedWords = words(typed);
  for (const [wordIndex, word] of typedWords.entries()) {
    const gap = typed.slice(position, word.index);
    append(gap);
    for (const character of gap) {
      if (character === '(' || character === '（') typedNoteDepth++;
      else if ((character === ')' || character === '）') && typedNoteDepth) typedNoteDepth--;
    }
    if (typedNoteDepth) {
      append(word[0]); position = word.index! + word[0].length; continue;
    }
    const wordKey = key(word[0]);
    let found = expected.findIndex((item, index) => index >= cursor && index < cursor + 8 && item.key === wordKey);
    const next = typedWords[wordIndex + 1];
    // Từ kế tiếp giúp phân biệt từ lặp ở ranh giới đoạn mà không sửa bản chép.
    if (found >= 0 && next && !/[.!?…。！？()（）]/u.test(typed.slice(word.index! + word[0].length, next.index))) {
      const nextKey = key(next[0]);
      const continued = expected.findIndex((item, index) => index >= found && index < cursor + 8
        && item.key === wordKey && expected[index + 1]?.key.startsWith(nextKey));
      if (continued >= 0) found = continued;
    }
    if (found >= 0) cursor = found;
    style = expected[Math.min(cursor, expected.length - 1)] ?? style;
    append(word[0]);
    if (cursor < expected.length - 1) cursor++;
    position = word.index! + word[0].length;
  }
  append(typed.slice(position));
  return result;
}
