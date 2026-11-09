import { describe, expect, it } from 'vitest';
import { activeCopySentence, copyingCursorPosition, copyingSentences, copyingSourceWordLines } from '../../../src/lib/domain/practice/copying-follow';
describe('reference follows copied sentences', () => {
  it('advances past a completed uppercase Đ word using the same Vietnamese matching key', () => {
    const source = copyingSentences(['Đạo. Phật.'], 0);
    expect(copyingCursorPosition(source, 'Đạo.')).toMatchObject({ sentence: 1, word: 0 });
    expect(copyingCursorPosition(source, 'đạo.'.normalize('NFD'))).toMatchObject({ sentence: 1, word: 0 });
  });
  it('marks complete parenthetical guidance as italic without changing text or word anchors', () => {
    const parts = copyingSourceWordLines([{ align: 'center', parts: [{ text: '(3 lần) Nam mô Phật.', bold: false }] }])[0];
    expect(parts.map(part => part.text).join('')).toBe('(3 lần) Nam mô Phật.');
    expect(parts.filter(part => part.italic).map(part => part.text).join('')).toBe('(3 lần) ');
    expect(parts.filter(part => part.word !== undefined).map(part => part.text)).toEqual(['Nam','mô','Phật']);
  });
  const sentences = copyingSentences(['{align:center|**Nam mô Phật.** Nguyện tâm thanh tịnh! Câu cuối.}'], 0);
  it('preserves text, bold and alignment', () => {
    expect(sentences).toHaveLength(3);
    expect(sentences[0].align).toBe('center');
    expect(sentences[0].parts).toEqual([{ text: 'Nam mô Phật.', bold: true }]);
    expect(sentences.flatMap(sentence => sentence.parts).map(part => part.text).join('')).toBe('Nam mô Phật. Nguyện tâm thanh tịnh! Câu cuối.');
  });
  it('follows typing and corrections without freezing on a misspelled word', () => {
    expect(activeCopySentence(sentences, 'Nam mô')).toBe(0);
    expect(activeCopySentence(sentences, 'Nam mô Phật.')).toBe(1);
    expect(activeCopySentence(sentences, 'Nam mô Phật. Nguyện tâm thanh tịnh!')).toBe(2);
    expect(activeCopySentence(sentences, 'Nam mô Phat. Nguyện tâm thanh tịnh!')).toBe(2);
    expect(activeCopySentence(sentences, 'Nam mô sai. Nguyện tâm thanh tịnh!')).toBe(2);
    expect(activeCopySentence(sentences, 'Nam mô Phật. Nguyện tâm thanh tịnh! Câu cuối.')).toBe(2);
  });
  it('accepts composed Vietnamese and spacing without skipping decimal numbers', () => {
    expect(activeCopySentence(sentences, 'Nam   mô Phật.'.normalize('NFD'))).toBe(1);
    expect(copyingSentences(['Lần 3.14 vẫn cùng câu. Câu sau.'], 0)).toHaveLength(2);
  });
});
