import { expect, it } from 'vitest';
import { copyingBlockCompleted, copyingChapterCompletion, copyingTextCompletion } from '../../../src/lib/domain/practice/copying-completion-progress';

it('accepts 90 percent, but not 89 percent, with no required copying of notes', () => {
  const words = Array.from({ length: 100 }, (_, index) => `từ${index}`);
  const source = words.join(' ') + ' (đọc chậm, không bắt buộc chép)';
  expect(copyingTextCompletion(source, words.slice(0, 90).join(' ')).accepted).toBe(true);
  expect(copyingTextCompletion(source, words.slice(0, 89).join(' ')).accepted).toBe(false);
  expect(copyingTextCompletion(source, words.join(' ').toUpperCase() + ' (đọc chậm)')).toMatchObject({ accepted: true, matched: 100 });
});

it('weighs the whole chapter rather than requiring perfection in every block', () => {
  const blocks = ['một hai ba bốn năm sáu bảy tám chín', 'mười'];
  expect(copyingChapterCompletion(blocks, [blocks[0], ''])).toMatchObject({ accepted: true, percent: 90 });
  expect(copyingChapterCompletion(blocks, ['', ''])).toMatchObject({ accepted: false, percent: 0 });
  expect(copyingChapterCompletion(['(3 lần)'], [''])).toMatchObject({ accepted: false });
});

it('allows a small copying mistake but does not reward unrelated or repeated filler', () => {
  const source = 'một hai ba bốn năm sáu bảy tám chín mười';
  expect(copyingTextCompletion(source, 'một hai ba bốn năm sáu bảy tám sai mười').accepted).toBe(true);
  expect(copyingTextCompletion(source, 'không liên quan gì đến kinh mẫu').accepted).toBe(false);
  expect(copyingTextCompletion(source, (source + ' ').repeat(5)).accepted).toBe(false);
});

it('detects when typing reaches the end of the sample text of a block', () => {
  const source = 'Nam Mô Bổn Sư Thích Ca Mâu Ni Phật. (1 lạy)';
  // Incomplete (only up to Ni, 8 words of 9)
  expect(copyingBlockCompleted(source, 'Nam Mô Bổn Sư Thích Ca Mâu Ni')).toBe(false);
  // Reached last word but only typed partial prefix without delimiter
  expect(copyingBlockCompleted(source, 'Nam Mô Bổn Sư Thích Ca Mâu Ni P')).toBe(false);
  // Completed with exact last word
  expect(copyingBlockCompleted(source, 'Nam Mô Bổn Sư Thích Ca Mâu Ni Phật')).toBe(true);
  // Completed with period
  expect(copyingBlockCompleted(source, 'Nam Mô Bổn Sư Thích Ca Mâu Ni Phật.')).toBe(true);
  // Completed with optional notes also copied
  expect(copyingBlockCompleted(source, 'Nam Mô Bổn Sư Thích Ca Mâu Ni Phật. (1 lạy)')).toBe(true);
  // Completed with small typo at end in a longer passage with trailing delimiter
  const tenWords = 'một hai ba bốn năm sáu bảy tám chín mười';
  expect(copyingBlockCompleted(tenWords, 'một hai ba bốn năm sáu bảy tám chín muoi.')).toBe(true);
  // Empty or unrelated
  expect(copyingBlockCompleted(source, '')).toBe(false);
  expect(copyingBlockCompleted(source, 'Văn bản hoàn toàn khác')).toBe(false);
});
