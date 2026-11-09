import { describe, expect, it } from 'vitest';
import { compareCopy } from '../../../src/lib/domain/practice/scripture-copying';
import { activeCopySentence, copyingSentences } from '../../../src/lib/domain/practice/copying-follow';
describe('copying checks words and Vietnamese accents', () => {
  it('accepts the reported Cực-Lạc example and different capitalization', () => {
    expect(compareCopy('Sanh qua cõi Cực-Lạc', 'sanh qua cõi cực lạc', true)).toEqual({ complete: true, issues: [] });
    expect(compareCopy('Nam-mô Bổn-Sư Thích Ca Mâu Ni Phật.', 'nam mô bổn sư thích ca mâu ni phật', true).complete).toBe(true);
  });
  it('still rejects incorrect accents, missing words, reordered words and numbers', () => {
    for (const actual of ['sanh qua coi cực lạc', 'sanh qua cõi cực', 'sanh qua cõi lạc cực']) {
      expect(compareCopy('Sanh qua cõi Cực-Lạc', actual, true).complete).toBe(false);
    }
    expect(compareCopy('3 lần', '2 lần', true).complete).toBe(false);
  });
  it('preserves editor offsets and follows sentences under the same relaxed rules', () => {
    const actual = 'NAM, mo PHẬT';
    const result = compareCopy('Nam-mô Phật.', actual, true);
    const issue = result.issues.find(item => item.kind === 'wrong')!;
    expect(actual.slice(issue.start, issue.end)).toBe('mo');
    const sentences = copyingSentences(['Sanh qua cõi Cực-Lạc. Nam-mô Phật.'], 0);
    expect(activeCopySentence(sentences, 'sanh qua cõi cực lạc')).toBe(1);
    expect(activeCopySentence(sentences, 'sanh qua coi cực lạc')).toBe(1);
  });
});
