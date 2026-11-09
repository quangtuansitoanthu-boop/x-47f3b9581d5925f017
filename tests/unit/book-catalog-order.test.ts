import { describe, expect, it } from 'vitest';
import type { LibraryArticle } from '../../src/lib/components/library/article';
import { FACEBOOK_TUYEN_TAP_BOOK_ID, mostViewedArticles } from '../../src/lib/domain/library/popularity';
import { orderBookCatalog } from '../../src/lib/domain/library/book-catalog-order';

function book(id: string, viewCount = 0, overrides: Partial<LibraryArticle> = {}): LibraryArticle {
  return {
    id, title: id, summary: '', content: '', category: 'KHÁC', tags: [], author: '', imageUrl: '',
    featured: false, publishedAt: '', hasTableOfContents: false, volumeCount: 0, status: 'Hoàn thành',
    pdfUrl: '', viewCount, ...overrides,
  };
}

describe('default book catalog order', () => {
  it('pins the most viewed book then the Facebook collection and ranks the full remaining catalog by views', () => {
    const newest = book('newest', 1, { updatedAt: '2099-01-01' });
    const facebook = book(FACEBOOK_TUYEN_TAP_BOOK_ID, 2);
    const input = [newest, book('third', 60), facebook, book('first', 100), book('second', 80)];
    expect(orderBookCatalog(input).map(item => item.id)).toEqual([
      'first', FACEBOOK_TUYEN_TAP_BOOK_ID, 'second', 'third', 'newest',
    ]);
    expect(input[0]).toBe(newest);
  });

  it('backfills the top ten from eligible rank eleven after an excluded title is removed upstream', () => {
    const ranked = Array.from({ length: 12 }, (_, index) => book(`rank-${index + 1}`, 100 - index));
    const eligible = ranked.filter(item => item.id !== 'rank-4');
    const result = orderBookCatalog(eligible);
    expect(result.slice(0, 10).map(item => item.id)).toEqual([
      'rank-1', 'rank-2', 'rank-3', 'rank-5', 'rank-6', 'rank-7', 'rank-8', 'rank-9', 'rank-10', 'rank-11',
    ]);
    expect(mostViewedArticles(eligible).map(item => item.id)).toEqual(result.slice(0, 10).map(item => item.id));
    expect(result).toHaveLength(11);
  });

  it('does not duplicate a Facebook collection that is already most viewed', () => {
    const input = [book('other', 3), book(FACEBOOK_TUYEN_TAP_BOOK_ID, 9)];
    expect(orderBookCatalog(input).map(item => item.id)).toEqual([FACEBOOK_TUYEN_TAP_BOOK_ID, 'other']);
  });

  it('preserves only eligible filtered inputs without injecting the Facebook book or extra books', () => {
    expect(orderBookCatalog([book('match-b', 2), book('match-a', 7)]).map(item => item.id)).toEqual(['match-a', 'match-b']);
    expect(orderBookCatalog([])).toEqual([]);
    expect(orderBookCatalog([book('only')]).map(item => item.id)).toEqual(['only']);
  });

  it('ranks missing view counts deterministically without using new update dates', () => {
    const missing = book('b', 0, { viewCount: undefined, updatedAt: '2099-01-01' });
    const input = [missing, book('a'), book('featured', 0, { featured: true })];
    expect(orderBookCatalog(input).map(item => item.id)).toEqual(['featured', 'a', 'b']);
  });

  it('keeps the first catalog entry for duplicate IDs without rendering duplicate keyed cards', () => {
    const first = book('same', 5);
    expect(orderBookCatalog([first, book('other', 1), book('same', 10)])).toEqual([first, book('other', 1)]);
  });
});
