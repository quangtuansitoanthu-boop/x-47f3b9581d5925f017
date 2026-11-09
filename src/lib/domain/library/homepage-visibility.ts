export interface HomepageArticleVisibilityInput {
  danh_muc?: unknown;
  playlist_json?: unknown;
  trang_thai?: unknown;
}

export function isHomepageArticleVisible(
  row: HomepageArticleVisibilityInput,
  role?: string,
): boolean {
  const status = String(row.trang_thai ?? '').trim();
  if (status !== 'Hoàn thành' && role !== 'admin' && role !== 'ctv') return false;
  const category = String(row.danh_muc ?? '').trim().toUpperCase();
  if (category === 'PHÁP THOẠI' || category === 'PHAP THOAI' || row.playlist_json) return false;
  return role === 'admin' || (
    category !== 'KINH PHẬT' &&
    category !== 'CÁC NGHI THỨC' &&
    category !== 'TRÌ CHÚ' &&
    category !== 'NGHI THỨC KHÁC' &&
    category !== 'NGHI THỨC'
  );
}
