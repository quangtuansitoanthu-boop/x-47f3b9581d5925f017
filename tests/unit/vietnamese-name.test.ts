import { describe, expect, it } from 'vitest';
import { formatVietnameseFullName, isVietnameseSurname } from '../../src/lib/utils/vietnamese-name';

describe('formatVietnameseFullName utility', () => {
  it('correctly flips inverted Western name order (GivenName MiddleName Surname -> Surname MiddleName GivenName)', () => {
    // Trường hợp thực tế từ người dùng: Thị Đôi Nguyễn -> Nguyễn Thị Đôi
    expect(formatVietnameseFullName('Thị Đôi Nguyễn')).toBe('Nguyễn Thị Đôi');
    expect(formatVietnameseFullName('thị đôi nguyễn')).toBe('Nguyễn Thị Đôi');
    expect(formatVietnameseFullName('THỊ ĐÔI NGUYỄN')).toBe('Nguyễn Thị Đôi');

    // Các tên đảo ngược khác
    expect(formatVietnameseFullName('Văn An Nguyễn')).toBe('Nguyễn Văn An');
    expect(formatVietnameseFullName('An Nguyễn')).toBe('Nguyễn An');
    expect(formatVietnameseFullName('Minh Quân Trần')).toBe('Trần Minh Quân');
    expect(formatVietnameseFullName('Thị Mai Lê')).toBe('Lê Thị Mai');
    expect(formatVietnameseFullName('Thanh Tùng Hoàng')).toBe('Hoàng Thanh Tùng');
    expect(formatVietnameseFullName('Đức Trọng Phạm')).toBe('Phạm Đức Trọng');
  });

  it('keeps already standard Vietnamese names intact (Surname MiddleName GivenName)', () => {
    expect(formatVietnameseFullName('Nguyễn Thị Đôi')).toBe('Nguyễn Thị Đôi');
    expect(formatVietnameseFullName('Trần Văn An')).toBe('Trần Văn An');
    expect(formatVietnameseFullName('Lê Hồng Phúc')).toBe('Lê Hồng Phúc');
    expect(formatVietnameseFullName('Phạm Minh Đức')).toBe('Phạm Minh Đức');
    expect(formatVietnameseFullName('Võ Thị Sáu')).toBe('Võ Thị Sáu');
  });

  it('handles names with givenName and familyName separately from OAuth providers', () => {
    // Google / Apple auth tách familyName ("Nguyễn") và givenName ("Thị Đôi")
    expect(formatVietnameseFullName(null, 'Thị Đôi', 'Nguyễn')).toBe('Nguyễn Thị Đôi');
    expect(formatVietnameseFullName('', 'Văn An', 'Trần')).toBe('Trần Văn An');

    // Tên phương Tây: John Doe
    expect(formatVietnameseFullName(null, 'John', 'Doe')).toBe('John Doe');
  });

  it('handles special app identities and single-word names cleanly', () => {
    expect(formatVietnameseFullName('Quang Từ')).toBe('Quang Từ');
    expect(formatVietnameseFullName('Chiến An')).toBe('Chiến An');
    expect(formatVietnameseFullName('Phật tử')).toBe('Phật Tử');
    expect(formatVietnameseFullName('An')).toBe('An');
    expect(formatVietnameseFullName('')).toBe('');
    expect(formatVietnameseFullName(null)).toBe('');
  });

  it('identifies common Vietnamese surnames correctly', () => {
    expect(isVietnameseSurname('Nguyễn')).toBe(true);
    expect(isVietnameseSurname('nguyen')).toBe(true);
    expect(isVietnameseSurname('Trần')).toBe(true);
    expect(isVietnameseSurname('Lê')).toBe(true);
    expect(isVietnameseSurname('Smith')).toBe(false);
  });
});
