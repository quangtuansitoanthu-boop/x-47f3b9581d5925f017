import { describe, expect, it, vi } from 'vitest';

import { extractPdfPageText, normalizePdfTextItems } from '$lib/components/reader/pdf-page-text';

describe('PDF page text adapter', () => {
  it('orders items top-to-bottom and left-to-right with stable Vietnamese normalization', () => {
    const items = [
      { str: 'lành', transform: [1, 0, 0, 1, 64, 680], width: 22 },
      { str: 'Gieo\u00a0nhân', transform: [1, 0, 0, 1, 12, 700], width: 47 },
      { str: '.', transform: [1, 0, 0, 1, 87, 680], width: 2 },
      { str: 'gặt', transform: [1, 0, 0, 1, 12, 680], width: 20 },
      { str: 'lành', transform: [1, 0, 0, 1, 66, 700], width: 22 },
    ];

    expect(normalizePdfTextItems(items)).toBe('Gieo nhân lành\ngặt lành.');
  });

  it('uses PDF end-of-line markers and ignores structural/non-text items', () => {
    expect(normalizePdfTextItems([
      { str: 'Dòng một', transform: [1, 0, 0, 1, 10, 100], width: 40, hasEOL: true },
      { type: 'beginMarkedContent', id: 'p1' },
      { str: 'Dòng hai', transform: [1, 0, 0, 1, 10, 100], width: 40 },
    ])).toBe('Dòng một\nDòng hai');
  });

  it('cancels stale extraction after PDF.js returns a page', async () => {
    const controller = new AbortController();
    const getTextContent = vi.fn(async () => ({ items: [{ str: 'Văn bản', transform: [1, 0, 0, 1, 0, 0] }] }));
    const document = {
      getPage: vi.fn(async () => {
        controller.abort();
        return { getTextContent };
      }),
    };

    await expect(extractPdfPageText(document, 2, controller.signal)).rejects.toMatchObject({ name: 'AbortError' });
    expect(getTextContent).not.toHaveBeenCalled();
  });
});
