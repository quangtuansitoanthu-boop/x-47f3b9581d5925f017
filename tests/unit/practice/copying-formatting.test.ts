import { describe, expect, it } from 'vitest';
import { compareCopy } from '../../../src/lib/domain/practice/scripture-copying';
import { copySourceLines } from '../../../src/lib/domain/practice/copying-formatting';
describe('copying source formatting', () => {
  it('compares visible scripture words without alignment and bold markers', () => {
    expect(compareCopy('{align:center|**Nam mô** Phật.}', 'Nam mô Phật.', true)).toEqual({ complete: true, issues: [] });
  });
  it('handles an alignment wrapper split between two copying blocks', () => {
    expect(compareCopy('Nam mô Phật.}', 'Nam mô Phật.', true).complete).toBe(true);
    expect(compareCopy('{align:justify|Nam mô', 'Nam mô', true).complete).toBe(true);
  });
  it('renders separate aligned lines and bold text across a block boundary', () => {
    const blocks = ['{align:center|**Nam mô', ' Phật**.} {align:justify|Lời kinh.}'];
    const lines = copySourceLines(blocks, 1);
    expect(lines).toEqual([
      { align: 'center', parts: [{ text: ' Phật', bold: true }, { text: '.', bold: false }] },
      { align: 'justify', parts: [{ text: 'Lời kinh.', bold: false }] },
    ]);
  });
});
