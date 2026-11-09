/**
 * vietnamese-search.ts
 * Tiện ích chuẩn hoá và tìm kiếm tiếng Việt không dấu, linh hoạt theo từ khóa.
 */

/**
 * Loại bỏ dấu tiếng Việt khỏi chuỗi và chuyển về chữ thường.
 */
export function removeVietnameseDiacritics(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim();
}

/**
 * Kiểm tra xem `target` (hoặc mảng các target strings) có khớp với `query` tìm kiếm không.
 * Hỗ trợ:
 * 1. Khớp có dấu trực tiếp.
 * 2. Khớp không dấu (accent-insensitive).
 * 3. Khớp đa từ khóa (nếu gõ nhiều từ cách nhau, tất cả các từ đều phải có mặt).
 */
const searchDocuments = new Map<string, { lower: string; normalized: string }>();
const searchQueries = new Map<string, { lower: string; normalized: string; tokens: string[] }>();

export function matchesVietnameseSearch(
  target: string | Array<string | null | undefined> | null | undefined,
  query: string
): boolean {
  const rawQuery = (query || '').trim();
  if (!rawQuery) return true;

  const targetText = Array.isArray(target)
    ? target.filter(Boolean).join(' ')
    : String(target || '');

  if (!targetText.trim()) return false;

  // 1. Kiểm tra khớp chuỗi trực tiếp (có dấu)
  let document = searchDocuments.get(targetText);
  if (!document) {
    document = { lower: targetText.toLowerCase(), normalized: removeVietnameseDiacritics(targetText) };
    if (targetText.length <= 2048) {
      if (searchDocuments.size >= 256) searchDocuments.delete(searchDocuments.keys().next().value!);
      searchDocuments.set(targetText, document);
    }
  }
  let prepared = searchQueries.get(rawQuery);
  if (!prepared) {
    const normalized = removeVietnameseDiacritics(rawQuery);
    prepared = { lower: rawQuery.toLowerCase(), normalized, tokens: normalized.split(/\s+/).filter(Boolean) };
    if (rawQuery.length <= 256) {
      if (searchQueries.size >= 32) searchQueries.delete(searchQueries.keys().next().value!);
      searchQueries.set(rawQuery, prepared);
    }
  }
  if (document.lower.includes(prepared.lower)) return true;

  // 2. Chuẩn hoá bỏ dấu
  const targetNoMark = document.normalized;
  const queryNoMark = prepared.normalized;

  // Nếu chuỗi không dấu chứa trọn vẹn cụm từ
  if (targetNoMark.includes(queryNoMark)) return true;

  // 3. Khớp từng từ (tất cả các từ trong query đều xuất hiện trong target)
  const queryTokens = prepared.tokens;
  if (queryTokens.length > 1) {
    return queryTokens.every((token) => targetNoMark.includes(token));
  }

  return false;
}
