import { describe, expect, it, vi } from 'vitest';
import {
  buildPdfSpreads,
  canonicalPdfPage,
  flattenPdfOutline,
  resolvePdfOutlinePage,
  type PdfOutlineDocument,
} from '$lib/components/reader/pdf-reading-model';

describe('PDF reading model', () => {
  it('keeps every page independent in single-page mode', () => {
    expect(buildPdfSpreads(3, false)).toEqual([
      { canonicalPage: 1, id: 'page-1', pages: [1] },
      { canonicalPage: 2, id: 'page-2', pages: [2] },
      { canonicalPage: 3, id: 'page-3', pages: [3] },
    ]);
  });

  it('keeps the cover separate and deterministically pairs following pages', () => {
    expect(buildPdfSpreads(5, true).map(({ canonicalPage, pages }) => ({ canonicalPage, pages }))).toEqual([
      { canonicalPage: 1, pages: [1] },
      { canonicalPage: 2, pages: [2, 3] },
      { canonicalPage: 4, pages: [4, 5] },
    ]);
    expect(buildPdfSpreads(6, true).at(-1)?.pages).toEqual([6]);
    expect(buildPdfSpreads(0, true)).toEqual([]);
  });

  it('maps either side of a spread to its leading canonical page', () => {
    expect(canonicalPdfPage(1, 8, true)).toBe(1);
    expect(canonicalPdfPage(3, 8, true)).toBe(2);
    expect(canonicalPdfPage(8, 8, true)).toBe(8);
    expect(canonicalPdfPage(3, 8, false)).toBe(3);
  });

  it('flattens nested outline entries without discarding non-link headings', () => {
    expect(flattenPdfOutline([
      { title: 'Phần một', items: [{ title: 'Chương 1', dest: 'chapter-1' }] },
      { title: '', dest: [0] },
    ])).toEqual([
      { depth: 0, destination: undefined, id: 'outline-0', title: 'Phần một' },
      { depth: 1, destination: 'chapter-1', id: 'outline-0-0', title: 'Chương 1' },
      { depth: 0, destination: [0], id: 'outline-1', title: 'Mục không có tiêu đề' },
    ]);
  });

  it('resolves named, numeric and reference destinations to one-based pages', async () => {
    const reference = { num: 42, gen: 0 };
    const document: PdfOutlineDocument = {
      numPages: 8,
      getDestination: vi.fn(async (name: string) => name === 'chapter-1' ? [reference, { name: 'XYZ' }] : null),
      getPageIndex: vi.fn(async (value: unknown) => value === reference ? 4 : -1),
    };

    await expect(resolvePdfOutlinePage(document, 'chapter-1')).resolves.toBe(5);
    await expect(resolvePdfOutlinePage(document, [2, { name: 'Fit' }])).resolves.toBe(3);
    await expect(resolvePdfOutlinePage(document, 'missing')).resolves.toBeNull();
  });

  it('returns null for malformed or out-of-range outline destinations', async () => {
    const document: PdfOutlineDocument = {
      numPages: 2,
      getDestination: async () => null,
      getPageIndex: async () => { throw new Error('unknown reference'); },
    };

    await expect(resolvePdfOutlinePage(document, null)).resolves.toBeNull();
    await expect(resolvePdfOutlinePage(document, [5])).resolves.toBeNull();
    await expect(resolvePdfOutlinePage(document, [{}])).resolves.toBeNull();
  });
});
