export interface QuoteLine {
  text: string;
  paragraphEnd: boolean;
}

type MeasureText = (text: string, fontSize: number, italic: boolean) => number;

export function quoteWithQuotationMarks(text: string): string {
  const value = text.trim();
  return value.startsWith('“') && value.endsWith('”') ? value : `“${value}”`;
}

export function wrapQuoteLines(text: string, width: number, measure: (text: string) => number): QuoteLine[] {
  const lines: QuoteLine[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    const words = paragraph.trim().split(/\s+/).filter(Boolean);
    let current = '';
    for (const word of words) {
      if (current && measure(`${current} ${word}`) > width) {
        lines.push({ text: current, paragraphEnd: false });
        current = '';
      }
      // Một từ rất dài vẫn phải nằm trong khung, không cắt mất ký tự.
      if (measure(word) > width) {
        for (const character of Array.from(word)) {
          if (current && measure(current + character) > width) {
            lines.push({ text: current, paragraphEnd: false });
            current = '';
          }
          current += character;
        }
      } else {
        current = current ? `${current} ${word}` : word;
      }
    }
    lines.push({ text: current, paragraphEnd: true });
  }
  return lines;
}

export function createQuoteCardLayout(quote: string, source: string, measure: MeasureText) {
  const width = 808;
  const availableHeight = 560;
  const text = quoteWithQuotationMarks(quote);
  const sourceText = source.trim() ? `Nguồn: ${source.trim()}` : '';
  const layoutAt = (fontSize: number) => {
    const sourceFontSize = Math.min(26, fontSize * .8);
    const lines = wrapQuoteLines(text, width, (value) => measure(value, fontSize, true));
    const sourceLines = sourceText
      ? wrapQuoteLines(sourceText, width, (value) => measure(value, sourceFontSize, false))
      : [];
    const lineHeight = fontSize * 1.5;
    const sourceLineHeight = sourceFontSize * 1.45;
    const sourceGap = sourceLines.length ? Math.min(34, fontSize) : 0;
    return {
      lines, sourceLines, fontSize, sourceFontSize, lineHeight, sourceLineHeight, sourceGap,
      height: lines.length * lineHeight + sourceGap + sourceLines.length * sourceLineHeight,
    };
  };
  let layout = layoutAt(44);
  // Đo lại sau mỗi bước vì số dòng thay đổi theo cỡ chữ; không bỏ/ellipsis lời trích.
  for (let attempt = 0; layout.height > availableHeight && attempt < 12; attempt += 1) {
    layout = layoutAt(Math.max(1, layout.fontSize * Math.min(.9, Math.sqrt(availableHeight / layout.height) * .96)));
  }
  return { ...layout, left: 136, right: 944, top: 220, width };
}

export function justifiedWordPositions(line: QuoteLine, width: number, measure: (text: string) => number) {
  const words = line.text.split(' ');
  if (line.paragraphEnd || words.length < 2) return [{ text: line.text, x: 0 }];
  const widths = words.map(measure);
  const gap = Math.max(0, (width - widths.reduce((sum, value) => sum + value, 0)) / (words.length - 1));
  let x = 0;
  return words.map((text, index) => {
    const word = { text, x };
    x += widths[index] + gap;
    return word;
  });
}
