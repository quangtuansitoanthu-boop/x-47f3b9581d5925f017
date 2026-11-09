import { describe, it, expect } from 'vitest';
import { mostViewedArticles, promoteMostViewed } from '../../src/lib/domain/library/popularity';
import type { LibraryArticle } from '../../src/lib/components/library/article';

describe('library popularity ordering', () => {
  const articles = Array.from({ length: 15 }, (_, i) => ({ id: String(i), title: `Book ${i}`, viewCount: i, featured: false }) as LibraryArticle);
  it('promotes ten entries without losing or duplicating the remaining recency order', () => {
    const result = promoteMostViewed(articles);
    expect(result.slice(0, 10).map((item) => item.viewCount)).toEqual([14,13,12,11,10,9,8,7,6,5]);
    expect(result.slice(10).map((item) => item.id)).toEqual(['0','1','2','3','4']);
    expect(new Set(result.map((item) => item.id)).size).toBe(15);
    expect(articles[0].id).toBe('0');
  });
  it('promotes only the single most viewed entry to the top without losing or duplicating the remaining recency order', async () => {
    const { promoteSingleMostViewed } = await import('../../src/lib/domain/library/popularity');
    const result = promoteSingleMostViewed(articles, '');
    expect(result[0].id).toBe('14');
    expect(result[0].viewCount).toBe(14);
    // All other items remain in their original recency order
    expect(result.slice(1).map((item) => item.id)).toEqual(['0','1','2','3','4','5','6','7','8','9','10','11','12','13']);
    expect(new Set(result.map((item) => item.id)).size).toBe(15);
  });
  it('places Facebook collection book at second position right after most viewed book', async () => {
    const { promoteSingleMostViewed, FACEBOOK_TUYEN_TAP_BOOK_ID } = await import('../../src/lib/domain/library/popularity');
    const fbBook = { id: FACEBOOK_TUYEN_TAP_BOOK_ID, title: 'Tuyển tập FB', viewCount: 2, featured: false } as LibraryArticle;
    const testArticles = [articles[0], fbBook, ...articles.slice(1)];
    const result = promoteSingleMostViewed(testArticles);
    expect(result[0].id).toBe('14');
    expect(result[1].id).toBe(FACEBOOK_TUYEN_TAP_BOOK_ID);
    expect(new Set(result.map((item) => item.id)).size).toBe(testArticles.length);
  });
  it('handles empty/short lists and deterministic tied counts', () => {
    expect(mostViewedArticles([])).toEqual([]);
    expect(mostViewedArticles([{ ...articles[0], id: 'b' }, { ...articles[0], id: 'a' }]).map((item) => item.id)).toEqual(['a','b']);
  });
});
