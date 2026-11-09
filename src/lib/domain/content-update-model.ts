import type { ContentGroup, ContentRow, ContentUpdateItem } from '../contracts/content-updates';
import { normalizeVietnameseText } from './online-only-policy';

export function updateGroup(row: ContentRow, kind: 'article' | 'talk'): ContentGroup | null {
  // Album updates contain shells, never the recording payload. Installer exclusions
  // must not prevent an explicit metadata/text download after installation.
  if (kind === 'talk') return 'talk';
  // Mục lục thắng PDF URL cũ, nhưng không đổi nhóm kinh/nghi thức thành sách thường.
  const hasChapters = Boolean(row.has_muc_luc) || Number(row.so_tap) > 0;
  if (row.pdf_url && !hasChapters) return 'pdf';
  const category = normalizeVietnameseText(String(row.danh_muc ?? ''));
  if (category.includes('nghi thuc') || category.includes('tri chu')) return 'ritual';
  if (category.startsWith('kinh')) return 'scripture';
  if (hasChapters || category.startsWith('sach')) return 'book';
  return null;
}

export async function contentVersion(row: ContentRow, kind: 'article' | 'talk'): Promise<string> {
  const fields = kind === 'article'
    ? ['id', 'tieu_de', 'tom_tat', 'danh_muc', 'tags', 'tac_gia', 'anh_url', 'link_ngoai', 'noi_bat', 'ngay_dang', 'has_muc_luc', 'so_tap', 'trang_thai', 'pdf_url', 'updated_at']
    : ['id', 'tieu_de', 'mo_ta', 'chu_de', 'dien_gia', 'archive_id', 'anh_dai_dien', 'visibility', 'tracks'];
  const values = fields.map(field => {
    let value = row[field] ?? '';
    if (['anh_url', 'anh_dai_dien'].includes(field) && typeof value === 'string' && value) {
      try {
        const url = new URL(value, 'https://media.quangtu.vn/');
        value = url.pathname.replace(/^\/api\/media\//u, '/') + url.search + url.hash;
      } catch { /* Giữ nguyên URL cũ không hợp lệ để phát hiện thay đổi. */ }
    }
    if (field === 'tracks' && typeof value === 'string') {
      try { value = JSON.parse(value); } catch { /* Bản cũ không hợp lệ sẽ có version riêng. */ }
    }
    return value;
  });
  const bytes = new TextEncoder().encode(JSON.stringify(values));
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('');
}

export function updateItemKey(item: Pick<ContentUpdateItem, 'kind' | 'row'>): string {
  return `${item.kind}:${item.row.id}`;
}

export function imageSources(html: string): string[] {
  return [...new Set([...html.matchAll(/<img\b[^>]*\bsrc=["']([^"']+)["']/giu)]
    .map(match => match[1].replaceAll('&amp;', '&')).filter(source => /^(https:\/\/|\/(?!\/)|(?:content|covers)\/)/u.test(source)))];
}
