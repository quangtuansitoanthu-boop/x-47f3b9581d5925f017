/**
 * Logic kiểm tra xem bài viết hoặc album có bị giới hạn chỉ đọc/nghe trực tuyến (Online-Only),
 * không cho phép tải offline (PDF, EPUB, MP3, ZIP) hay không.
 */

// Legacy exported identifiers; installer filtering is owned by ios-content-policy.
// 1. Muôn Kiếp Nhân Sinh Tập 1
// 2. Muôn Kiếp Nhân Sinh Tập 2
// 3. Muôn Kiếp Nhân Sinh Tập 3
// 4. Trở Về Từ Xứ Tuyết
export const ONLINE_ONLY_BOOK_IDS = new Set<string>([
  'tt_1781529439696',
  'tt_1781529470187',
  'tt_1781529533555',
  'tt_tro_ve_tu_xu_tuyet',
  'book_tt_1781529439696',
  'book_tt_1781529470187',
  'book_tt_1781529533555',
  'book_tt_tro_ve_tu_xu_tuyet'
]);

/**
 * Chuẩn hóa chuỗi tiếng Việt (bỏ dấu, chuyển chữ thường, bỏ ký tự đặc biệt) để so sánh an toàn
 */
export function normalizeVietnameseText(str: string | null | undefined): string {
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
 * Compatibility predicate: books may now be explicitly downloaded. The four
 * named books are excluded at packaging time, not from user-owned offline data.
 */
export function isOnlineOnlyBook(_title?: string | null, _author?: string | null, _id?: string | null): boolean {
  return false;
}

/**
 * Kiểm tra một album audio pháp thoại có bị chặn tải offline hay không (3 cuốn Muôn Kiếp Nhân Sinh)
 */
export function isOnlineOnlyAudioAlbum(title: string | null | undefined, speaker?: string | null | undefined): boolean {
  const normTitle = normalizeVietnameseText(title);
  const normSpeaker = normalizeVietnameseText(speaker);
  if (normTitle.includes('muon kiep nhan sinh')) return true;
  if (normSpeaker.includes('muon kiep nhan sinh')) return true;
  return false;
}
