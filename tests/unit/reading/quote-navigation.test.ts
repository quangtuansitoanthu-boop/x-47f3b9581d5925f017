import { describe, expect, it } from 'vitest';
import { cachedQuoteNavigation, quoteNavigationPage } from '$lib/domain/reading/quote-navigation';

const quote = { id: 'quote-1', contentId: 'book-1', contentKind: 'book' as const,
  anchorStatus: 'active' as const, locator: { sectionId: 'chapter-2', startOffset: 20, endOffset: 30 } };

describe('private cached quote navigation', () => {
  it('chooses an exact cached annotation and section without treating it as reading progress', () => {
    expect(cachedQuoteNavigation([quote], 'quote-1', 'book-1')).toEqual({ status: 'text', annotation: quote, sectionId: 'chapter-2' });
  });
  it.each([null, '', '<bad>', 'unknown', 'x'.repeat(193)])('keeps normal source opening for an unavailable or invalid ID %s', id => {
    expect(cachedQuoteNavigation([quote], id, 'book-1')).toEqual({ status: 'missing' });
  });
  it('does not use an annotation from another content or one absent from the principal-scoped cache', () => {
    expect(cachedQuoteNavigation([quote], 'quote-1', 'other-book')).toEqual({ status: 'missing' });
    expect(cachedQuoteNavigation([], 'quote-1', 'book-1')).toEqual({ status: 'missing' });
  });
  it('does not jump to an orphaned or malformed section', () => {
    expect(cachedQuoteNavigation([{ ...quote, anchorStatus: 'orphaned' }], 'quote-1', 'book-1')).toEqual({ status: 'orphaned' });
    expect(cachedQuoteNavigation([{ ...quote, locator: { sectionId: {} } }], 'quote-1', 'book-1')).toEqual({ status: 'invalid' });
  });
  it('uses the real PDF locator and rejects out-of-range pages instead of clamping to another page', () => {
    const pdf = { ...quote, contentKind: 'pdf' as const, locator: { page: 4, startOffset: 0, endOffset: 5 } };
    expect(cachedQuoteNavigation([pdf], 'quote-1', 'book-1')).toEqual({ status: 'pdf', annotation: pdf, page: 4 });
    expect(quoteNavigationPage(pdf.locator.page, 4)).toBe(4);
    for (const page of [0, -1, 1.5, 5, NaN]) expect(quoteNavigationPage(page, 4)).toBeNull();
  });
});
