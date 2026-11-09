import { describe, expect, it } from 'vitest';
import { compareCopy, normalizeCopyText } from '../../../src/lib/domain/practice/scripture-copying';
import { activeCopySentence, copyingSentences } from '../../../src/lib/domain/practice/copying-follow';
describe('parenthetical copying instructions are optional', () => {
  const source = 'Nam-mô Phật. (3 lần) Nguyện tâm thanh tịnh.';
  it('accepts both including and omitting notes, with nested parentheses', () => {
    expect(compareCopy(source, 'nam mô phật nguyện tâm thanh tịnh', true).complete).toBe(true);
    expect(compareCopy(source, 'nam mô phật (3 lần) nguyện tâm thanh tịnh', true).complete).toBe(true);
    expect(normalizeCopyText('Nam (đọc chậm (3 lần)) mô Phật')).toBe('nam mô phật');
    expect(compareCopy('(3 lần)', '', true).complete).toBe(true);
  });
  it('still catches wrong scripture words and selects the correct original editor offsets', () => {
    const actual = 'nam (3 lần) mo phật nguyện tâm thanh tịnh';
    const result = compareCopy(source, actual, true);
    const issue = result.issues.find(item => item.kind === 'wrong')!;
    expect(actual.slice(issue.start, issue.end)).toBe('mo');
    expect(result.complete).toBe(false);
  });
  it('skips note-only lines when following the current sentence', () => {
    const sentences = copyingSentences(['{align:center|Nam mô Phật.} {align:center|(3 lần)} {align:center|Nguyện tâm thanh tịnh.}'], 0);
    expect(activeCopySentence(sentences, 'nam mô phật')).toBe(2);
    expect(activeCopySentence(sentences, 'nam mô phật nguyện tâm')).toBe(2);
    expect(activeCopySentence(sentences, 'nam mô phật (3 lần) nguyện tâm')).toBe(2);
  });
});
