import { describe, expect, it } from 'vitest';
import { createQuoteCardLayout, justifiedWordPositions, quoteWithQuotationMarks, wrapQuoteLines } from '../../../src/lib/components/reader/quote-card-layout';

const measure = (text: string, fontSize: number) => Array.from(text).length * fontSize * .55;

describe('quote card text layout', () => {
  it('wraps the original quote in double quotation marks without duplicating existing marks', () => {
    expect(quoteWithQuotationMarks(' Lời trích đã chọn. ')).toBe('“Lời trích đã chọn.”');
    expect(quoteWithQuotationMarks('“Lời trích đã chọn.”')).toBe('“Lời trích đã chọn.”');
  });

  it('justifies intermediate prose lines to both edges and leaves the paragraph end left aligned', () => {
    const line = { text: 'Một đoạn văn', paragraphEnd: false };
    const positioned = justifiedWordPositions(line, 200, (value) => value.length * 10);
    expect(positioned[0].x).toBe(0);
    const last = positioned.at(-1)!;
    expect(last.x + last.text.length * 10).toBeCloseTo(200);
    expect(justifiedWordPositions({ ...line, paragraphEnd: true }, 200, (value) => value.length * 10))
      .toEqual([{ text: line.text, x: 0 }]);
  });

  it('preserves paragraph boundaries and every character in an unbroken long word', () => {
    const lines = wrapQuoteLines('Một đoạn\n' + 'ắ'.repeat(120), 40, (value) => Array.from(value).length * 10);
    expect(lines.some((line) => line.text === 'đoạn' && line.paragraphEnd)).toBe(true);
    expect(lines.slice(2).map((line) => line.text).join('')).toBe('ắ'.repeat(120));
    expect(lines.every((line) => Array.from(line.text).length <= 4)).toBe(true);
  });

  it('fits a maximum-length quote and long source within the text area without truncation', () => {
    const quote = 'Tu tập và biết ơn. '.repeat(650).slice(0, 12_000);
    const source = 'Tên sách có nguồn đầy đủ '.repeat(30);
    const layout = createQuoteCardLayout(quote, source, measure);
    expect(layout.height).toBeLessThanOrEqual(560);
    expect(layout.top + layout.height).toBeLessThan(886);
    expect(layout.fontSize).toBeLessThan(44);
    expect(layout.lines.map((line) => line.text).join(' ').replace(/\s+/g, ' '))
      .toBe(quoteWithQuotationMarks(quote).replace(/\s+/g, ' '));
    expect(layout.sourceLines.map((line) => line.text).join(' ')).toBe(`Nguồn: ${source.trim()}`);
    expect([...layout.lines].every((line) => measure(line.text, layout.fontSize) <= layout.width)).toBe(true);
    expect(layout.sourceLines.every((line) => measure(line.text, layout.sourceFontSize) <= layout.width)).toBe(true);
  });

  it('uses the selected source rather than a sample book and does not invent a missing source', () => {
    expect(createQuoteCardLayout('Lời trích', 'Sách người dùng đang đọc', measure).sourceLines[0].text)
      .toBe('Nguồn: Sách người dùng đang đọc');
    expect(createQuoteCardLayout('Lời trích', '', measure).sourceLines).toEqual([]);
  });
});
