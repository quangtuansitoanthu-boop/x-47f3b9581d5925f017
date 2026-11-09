import { describe, expect, it } from 'vitest';
import {
  encodeBookCoverAsset,
  formatBookCoverPosition,
  normalizeBookImportPayload,
  parseBookCoverAsset,
  SAMPLE_BOOK_IMPORT,
} from '$lib/components/admin/books/book-form-helpers';

describe('admin book form helpers', () => {
  it('round-trips the legacy cover position suffix', () => {
    const encoded = encodeBookCoverAsset('https://media.quangtu.vn/cover.jpg', 'center 25%');
    expect(encoded).toBe('https://media.quangtu.vn/cover.jpg#pos=center%2025%25');
    expect(parseBookCoverAsset(encoded)).toEqual({
      url: 'https://media.quangtu.vn/cover.jpg',
      position: 'center 25%',
    });
    expect(encodeBookCoverAsset('https://media.quangtu.vn/cover.jpg', 'center')).toBe('https://media.quangtu.vn/cover.jpg');
  });

  it('maps pointer coordinates to a clamped object position', () => {
    const bounds = { left: 100, top: 50, width: 400, height: 200 };
    expect(formatBookCoverPosition(300, 100, bounds)).toBe('50% 25%');
    expect(formatBookCoverPosition(20, 400, bounds)).toBe('0% 100%');
  });

  it('normalizes legacy chapter aliases and rejects an invalid import', () => {
    expect(normalizeBookImportPayload({ tieu_de: 'Kinh', mucLuc: [{ tieu_de: 'Phẩm 1' }] })).toEqual({
      book: expect.objectContaining({ tieu_de: 'Kinh' }),
      chapters: [{ tieu_de: 'Phẩm 1' }],
    });
    expect(() => normalizeBookImportPayload({ tieu_de: '' })).toThrow('tiêu đề');
    expect(SAMPLE_BOOK_IMPORT.chapters).toHaveLength(1);
  });
});
