export interface BookCoverAsset {
  position: string;
  url: string;
}

export interface BookImportPayload {
  book: Record<string, unknown>;
  chapters: Array<Record<string, unknown>>;
}

export function parseBookCoverAsset(value: string): BookCoverAsset {
  const image = parsePositionedImage(value);
  return { url: image.src, position: image.position };
}

export function encodeBookCoverAsset(url: string, position: string): string {
  const cleanUrl = String(url || '').trim().split('#pos=')[0];
  const cleanPosition = String(position || '').trim() || 'center';
  if (!cleanUrl || cleanPosition === 'center') return cleanUrl;
  return `${cleanUrl}#pos=${encodeURIComponent(cleanPosition)}`;
}

export function formatBookCoverPosition(
  clientX: number,
  clientY: number,
  bounds: Pick<DOMRect, 'left' | 'top' | 'width' | 'height'>,
): string {
  const clamp = (value: number): number => Math.round(Math.min(100, Math.max(0, Number.isFinite(value) ? value : 50)));
  const x = clamp(((clientX - bounds.left) / Math.max(bounds.width, 1)) * 100);
  const y = clamp(((clientY - bounds.top) / Math.max(bounds.height, 1)) * 100);
  return x + '% ' + y + '%';
}

export function normalizeBookImportPayload(value: unknown): BookImportPayload {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('JSON sách phải là một object.');
  const source = value as Record<string, unknown>;
  const bookValue = source.book && typeof source.book === 'object' && !Array.isArray(source.book)
    ? source.book as Record<string, unknown>
    : source;
  const chapterCandidates = source.chapters ?? source.mucLuc ?? source.mucluc ?? source.muc_luc ?? source.danhSach ?? source.taps ?? [];
  if (!Array.isArray(chapterCandidates)) throw new Error('Danh sách chương phải là một mảng.');
  const title = String(bookValue.tieu_de ?? bookValue.title ?? '').trim();
  if (!title) throw new Error('JSON chưa có tiêu đề sách.');
  return {
    book: { ...bookValue, tieu_de: title },
    chapters: chapterCandidates.filter((chapter): chapter is Record<string, unknown> => Boolean(chapter) && typeof chapter === 'object' && !Array.isArray(chapter)),
  };
}

export const SAMPLE_BOOK_IMPORT: BookImportPayload = {
  book: {
    id: 'sach_mau',
    tieu_de: 'SÁCH MẪU',
    tom_tat: 'Tóm tắt ngắn của sách.',
    danh_muc: 'SÁCH KHUYẾN THIỆN',
    tac_gia: 'Quang Từ',
    tags: 'khuyến thiện, nhân quả',
    noi_bat: 0,
    trang_thai: 'Đang cập nhật',
  },
  chapters: [
    { so_thu_tu: 0, tieu_de: 'Phần 1', tom_tat: 'Giới thiệu', noi_dung: '<p>Nội dung phần 1.</p>' },
  ],
};
import { parsePositionedImage } from '$lib/domain/positioned-image';
