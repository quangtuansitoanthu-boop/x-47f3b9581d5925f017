import { describe, expect, it } from 'vitest';
import { matchesVietnameseSearch, removeVietnameseDiacritics } from '../../src/lib/utils/vietnamese-search';

describe('vietnamese-search utility', () => {
  it('removes Vietnamese diacritics accurately', () => {
    expect(removeVietnameseDiacritics('Nhân Quả')).toBe('nhan qua');
    expect(removeVietnameseDiacritics('Đạo Phật')).toBe('dao phat');
    expect(removeVietnameseDiacritics('ĐẢO ĐIÊN')).toBe('dao dien');
    expect(removeVietnameseDiacritics('Gậy Kim Cang')).toBe('gay kim cang');
    expect(removeVietnameseDiacritics('Tụng Kinh — Sám Hối')).toBe('tung kinh — sam hoi');
  });

  it('matches Vietnamese searches with or without accents', () => {
    const text = 'GẬY KIM CANG HÉT - TẬP 1';
    expect(matchesVietnameseSearch(text, 'Gậy Kim Cang')).toBe(true);
    expect(matchesVietnameseSearch(text, 'gay kim cang')).toBe(true);
    expect(matchesVietnameseSearch(text, 'kim cang het')).toBe(true);
    expect(matchesVietnameseSearch(text, 'tap 1')).toBe(true);
    expect(matchesVietnameseSearch(text, 'tap 2')).toBe(false);
  });

  it('handles multiple target fields and array inputs', () => {
    const fields = ['Kinh Pháp Cú', 'Lời Phật Dạy', 'Đức Thế Tôn'];
    expect(matchesVietnameseSearch(fields, 'phap cu')).toBe(true);
    expect(matchesVietnameseSearch(fields, 'duc the ton')).toBe(true);
    expect(matchesVietnameseSearch(fields, 'loi phat')).toBe(true);
    expect(matchesVietnameseSearch(fields, 'khong co')).toBe(false);
  });

  it('returns true for empty or whitespace query', () => {
    expect(matchesVietnameseSearch('Nội dung bất kỳ', '')).toBe(true);
    expect(matchesVietnameseSearch('Nội dung bất kỳ', '   ')).toBe(true);
  });

  it('keeps searches correct after many different documents and changing field values', () => {
    for (let index = 0; index < 600; index++) {
      expect(matchesVietnameseSearch(`Tụng kinh số ${index}`, `kinh ${index}`)).toBe(true);
    }
    const fields = ['Địa Tạng', 'Nội dung cũ'];
    expect(matchesVietnameseSearch(fields, 'noi dung cu')).toBe(true);
    fields[1] = 'Nội dung mới';
    expect(matchesVietnameseSearch(fields, 'noi dung cu')).toBe(false);
    expect(matchesVietnameseSearch(fields, 'moi dia')).toBe(true);
  });
});
