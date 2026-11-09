import type { LibraryArticle } from '$lib/components/library/article';
import { FACEBOOK_TUYEN_TAP_BOOK_ID } from './popularity';

/** Giữ toàn bộ sách hợp lệ; ngày cập nhật không được thay thứ hạng lượt xem. */
export function orderBookCatalog(articles: readonly LibraryArticle[]): LibraryArticle[] {
  const seen = new Set<string>();
  const ranked = articles.filter((article) => {
    if (seen.has(article.id)) return false;
    seen.add(article.id);
    return true;
  }).sort((a, b) => (b.viewCount ?? 0) - (a.viewCount ?? 0)
    || Number(b.featured) - Number(a.featured) || a.id.localeCompare(b.id));

  // Chỉ ghim tuyển tập nếu sách có trong tập đã qua kiểm tra quyền/bộ lọc.
  const facebookIndex = ranked.findIndex((article) => article.id === FACEBOOK_TUYEN_TAP_BOOK_ID);
  if (facebookIndex > 1) {
    const [facebook] = ranked.splice(facebookIndex, 1);
    ranked.splice(1, 0, facebook);
  }
  return ranked;
}
