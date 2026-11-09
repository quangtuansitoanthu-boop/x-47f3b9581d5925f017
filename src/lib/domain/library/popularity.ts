import type { LibraryArticle } from '$lib/components/library/article';

export function mostViewedArticles(articles: readonly LibraryArticle[]): LibraryArticle[] {
  return [...articles].sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0)
    || Number(b.featured) - Number(a.featured) || a.id.localeCompare(b.id)).slice(0, 10);
}

/** Input already has the normal catalog order; only the first ten are promoted. */
export function promoteMostViewed(articles: readonly LibraryArticle[]): LibraryArticle[] {
  const top = mostViewedArticles(articles);
  const ids = new Set(top.map((article) => article.id));
  return [...top, ...articles.filter((article) => !ids.has(article.id))];
}

export const FACEBOOK_TUYEN_TAP_BOOK_ID = 'tuyen-tap-phap-facebook-quang-tu';

/** Promotes the single most viewed article to first position, and the Facebook collection book to second position; the rest stay in their recency order. */
export function promoteSingleMostViewed(articles: readonly LibraryArticle[], secondPromotedId = FACEBOOK_TUYEN_TAP_BOOK_ID): LibraryArticle[] {
  if (articles.length <= 1) return [...articles];
  const top = mostViewedArticles(articles);
  const mostViewed = top[0];
  if (!mostViewed) return [...articles];

  const secondArticle = secondPromotedId ? articles.find((article) => article.id === secondPromotedId) : undefined;
  if (secondArticle && secondArticle.id !== mostViewed.id) {
    return [
      mostViewed,
      secondArticle,
      ...articles.filter((article) => article.id !== mostViewed.id && article.id !== secondArticle.id),
    ];
  }

  return [mostViewed, ...articles.filter((article) => article.id !== mostViewed.id)];
}

