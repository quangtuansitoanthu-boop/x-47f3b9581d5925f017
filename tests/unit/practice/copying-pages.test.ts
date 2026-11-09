import { describe, expect, it } from 'vitest';
import { copyingCarryStart, copyingPageStarts, editCopyingPage } from '../../../src/lib/domain/practice/copying-pages';
describe('writing pages keep the last sentence without duplicating stored words', () => {
  it('carries the final sentence or verse, including when it ends with punctuation', () => {
    for (const text of ['Câu trước. Câu cuối đang gõ', 'Câu trước. Câu cuối.', 'Dòng trước\nDòng cuối\n']) {
      const start = copyingCarryStart(text);
      expect(text.slice(start)).toMatch(/^(Câu cuối|Dòng cuối)/u);
    }
  });
  it('keeps one continuous draft when continuing on the next page', () => {
    const text = 'Câu trước. Câu cuối';
    const starts = [0, copyingCarryStart(text)];
    const result = editCopyingPage(text, starts, 1, 'Câu cuối viết tiếp.');
    expect(result.text).toBe('Câu trước. Câu cuối viết tiếp.');
    expect(result.text.match(/Câu cuối/gu)).toHaveLength(1);
  });
  it('preserves later pages when correcting an earlier page and adjusts offsets', () => {
    const result = editCopyingPage('Câu đầu. Câu sau.', [0, 9], 0, 'Câu đầu sửa. ');
    expect(result.text).toBe('Câu đầu sửa. Câu sau.');
    expect(result.starts).toEqual([0, 13]);
    expect(result.text.slice(result.starts[1])).toBe('Câu sau.');
  });
  it('keeps the separator when the browser trims whitespace at a page boundary', () => {
    const result = editCopyingPage('Nam mô\nPhật', [0, 7], 0, 'Nam mô');
    expect(result.text).toBe('Nam mô\nPhật');
    expect(result.starts).toEqual([0, 7]);
  });
  it('reflows pages without dropping or duplicating text when the available size changes', () => {
    const text = 'Câu đầu tiên. Câu tiếp theo. Câu cuối cùng.';
    for (const capacity of [12, 24, 200]) {
      const starts = copyingPageStarts(text, (start, end) => end - start <= capacity);
      expect(starts.every((start, index) => index === 0 || start > starts[index - 1])).toBe(true);
      expect(starts.map((start, index) => text.slice(start, starts[index + 1])).join('')).toBe(text);
    }
    expect(copyingPageStarts(text, () => true)).toEqual([0]);
    expect(copyingPageStarts('', () => false)).toEqual([0]);
  });
});
