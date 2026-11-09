export interface PdfTextItemLike {
  str?: string;
  transform?: readonly number[];
  width?: number;
  hasEOL?: boolean;
}

export interface PdfPageTextSource {
  getTextContent: (options?: Record<string, unknown>) => Promise<{ items?: readonly unknown[] }>;
}

export interface PdfTextDocumentSource {
  getPage: (pageNumber: number) => Promise<PdfPageTextSource>;
}

interface PositionedTextItem {
  index: number;
  text: string;
  x: number;
  y: number;
  width: number;
  hasEOL: boolean;
}

const SAME_LINE_TOLERANCE = 3;

function normalizeFragment(value: string): string {
  return value.normalize('NFC').replace(/[\u00a0\t\r\f\v]+/gu, ' ').replace(/\s+/gu, ' ').trim();
}

function itemPosition(item: PdfTextItemLike, index: number): PositionedTextItem | null {
  const text = normalizeFragment(String(item.str ?? ''));
  if (!text) return null;
  const transform = Array.isArray(item.transform) ? item.transform : [];
  const x = Number(transform[4]);
  const y = Number(transform[5]);
  return {
    index,
    text,
    x: Number.isFinite(x) ? x : index,
    y: Number.isFinite(y) ? y : -index * (SAME_LINE_TOLERANCE + 1),
    width: Math.max(0, Number(item.width) || 0),
    hasEOL: item.hasEOL === true,
  };
}

function joinLine(items: readonly PositionedTextItem[]): string {
  let result = '';
  let previous: PositionedTextItem | null = null;
  for (const item of items) {
    if (!result) result = item.text;
    else {
      const gap = previous ? item.x - (previous.x + previous.width) : 0;
      const punctuation = /^[,.;:!?%)}\]\u00bb]/u.test(item.text);
      const opening = /[(\[{\u00ab]$/u.test(result);
      const hyphenated = /[-\u2010-\u2011]$/u.test(result);
      const separated = !punctuation && !opening && !hyphenated && (gap > -1 || !previous?.width);
      result += `${separated ? ' ' : ''}${item.text}`;
    }
    previous = item;
  }
  return result.replace(/\s+([,.;:!?%)}\]\u00bb])/gu, '$1').trim();
}

/** Stable top-to-bottom, left-to-right text for common single-column PDFs. */
export function normalizePdfTextItems(items: readonly unknown[]): string {
  const positioned = items
    .map((item, index) => itemPosition(item as PdfTextItemLike, index))
    .filter((item): item is PositionedTextItem => item !== null)
    .sort((left, right) => {
      if (left.y !== right.y) return right.y - left.y;
      if (left.x !== right.x) return left.x - right.x;
      return left.index - right.index;
    });

  const lines: PositionedTextItem[][] = [];
  for (const item of positioned) {
    const lastLine = lines[lines.length - 1];
    if (!lastLine || Math.abs(lastLine[0].y - item.y) > SAME_LINE_TOLERANCE || lastLine[lastLine.length - 1]?.hasEOL) {
      lines.push([item]);
    } else lastLine.push(item);
  }

  return lines
    .map((line) => joinLine([...line].sort((left, right) => left.x - right.x || left.index - right.index)))
    .filter(Boolean)
    .join('\n')
    .replace(/\n{3,}/gu, '\n\n')
    .trim();
}

function abortError(signal: AbortSignal): unknown {
  return signal.reason ?? new DOMException('Aborted', 'AbortError');
}

export async function extractPdfPageText(
  document: PdfTextDocumentSource,
  pageNumber: number,
  signal?: AbortSignal,
): Promise<string> {
  if (signal?.aborted) throw abortError(signal);
  const page = await document.getPage(pageNumber);
  if (signal?.aborted) throw abortError(signal);
  const content = await page.getTextContent({
    disableNormalization: false,
    includeMarkedContent: false,
  });
  if (signal?.aborted) throw abortError(signal);
  return normalizePdfTextItems(Array.isArray(content.items) ? content.items : []);
}
