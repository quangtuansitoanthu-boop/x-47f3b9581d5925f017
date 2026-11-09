/**
 * Tiện ích chuẩn hoá định dạng Họ Tên người dùng tiếng Việt.
 *
 * Khắc phục hiện tượng đăng nhập qua Google, Apple, Facebook thường bị đảo
 * thứ tự tên kiểu phương Tây (Tên đệm + Tên + Họ, ví dụ "Thị Đôi Nguyễn"),
 * đưa về chuẩn tiếng Việt truyền thống: Họ + Tên đệm + Tên ("Nguyễn Thị Đôi").
 */

const VIETNAMESE_SURNAMES = new Set([
  'nguyen', 'nguyễn',
  'tran', 'trần',
  'le', 'lê',
  'pham', 'phạm',
  'hoang', 'hoàng',
  'huynh', 'huỳnh',
  'phan',
  'vu', 'vũ',
  'vo', 'võ',
  'dang', 'đặng',
  'bui', 'bùi',
  'do', 'đỗ',
  'ho', 'hồ',
  'ngo', 'ngô',
  'duong', 'dương',
  'ly', 'lý',
  'dao', 'đào',
  'dinh', 'đinh',
  'doan', 'đoàn',
  'lam', 'lâm',
  'phung', 'phùng',
  'mai',
  'luong', 'lương',
  'trinh', 'trịnh',
  'truong', 'trương',
  'luu', 'lưu',
  'ta', 'tạ',
  'ha', 'hà',
  'cao',
  'chu',
  'trieu', 'triệu',
  'vuong', 'vương',
  'quach', 'quách',
  'bach', 'bạch',
  'tang', 'tăng',
  'la',
  'nhan',
  'hua', 'hứa',
  'diep', 'diệp',
  'tieu', 'tiêu',
  'ninh',
  'nghiem', 'nghiêm',
  'cu', 'cù',
  'tong', 'tống',
  'on', 'ôn',
  'doan', 'doãn',
  'khong', 'khổng',
  'thach', 'thạch',
  'nong', 'nông',
  'luc', 'lục',
  'ma',
  'sam', 'sầm',
  'lai', 'lại',
  'kieu', 'kiều',
  'ân',
  'thai', 'thái',
]);

const VIETNAMESE_MIDDLE_NAMES = new Set([
  'thi', 'thị',
  'van', 'văn',
  'huu', 'hữu',
  'duc', 'đức',
  'dinh', 'đình',
  'xuan', 'xuân',
  'thanh',
  'ngoc', 'ngọc',
  'ba', 'bá',
  'manh', 'mạnh',
  'trong', 'trọng',
  'quang',
  'dang', 'đăng',
  'cong', 'công',
  'phuoc', 'phước',
  'hoai', 'hoài',
  'minh',
  'thu',
  'anh', 'ánh',
  'hai', 'hải',
  'nhat', 'nhật',
  'kim',
  'bao', 'bảo',
  'phu', 'phú',
  'thanh',
  'my', 'mỹ',
  'ngoc', 'ngọc',
  'hong', 'hồng',
]);

function capitalizeWord(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1).toLocaleLowerCase('vi-VN');
}

/**
 * Kiểm tra xem một họ có thuộc bảng họ phổ biến của người Việt hay không.
 */
export function isVietnameseSurname(word: string): boolean {
  if (!word) return false;
  return VIETNAMESE_SURNAMES.has(word.trim().toLowerCase());
}

/**
 * Định dạng tên đầy đủ theo chuẩn Họ Tên tiếng Việt.
 *
 * @param name Chuỗi họ tên đầy đủ hoặc displayName.
 * @param givenName Tên / Tên đệm (tuỳ chọn nếu có từ OAuth provider).
 * @param familyName Họ (tuỳ chọn nếu có từ OAuth provider).
 */
export function formatVietnameseFullName(
  name?: string | null,
  givenName?: string | null,
  familyName?: string | null,
): string {
  const fName = String(familyName || '').trim();
  const gName = String(givenName || '').trim();

  // Nếu cả familyName và givenName được truyền riêng rẽ
  if (fName && gName) {
    const fLower = fName.toLowerCase();
    const isVn =
      VIETNAMESE_SURNAMES.has(fLower) ||
      /[àáạảãâầấậẩẫăằắặẳẵèéẹẻẽêềếệểễìíịỉĩòóọỏõôồốộổỗơờớợởỡùúụủũưừứựửữỳýỵỷỹđ]/i.test(fName + gName);

    if (isVn) {
      // Chuẩn tiếng Việt: Họ đứng trước, Tên đứng sau
      return `${fName} ${gName}`.split(/\s+/).filter(Boolean).map(capitalizeWord).join(' ');
    } else {
      // Chuẩn phương Tây cho tên nước ngoài: Given name + Family name
      return `${gName} ${fName}`.split(/\s+/).filter(Boolean).map(capitalizeWord).join(' ');
    }
  }

  const raw = String(name || '').trim();
  if (!raw) return '';

  const words = raw.split(/\s+/).filter(Boolean);
  if (words.length < 2) {
    return words.map(capitalizeWord).join(' ');
  }

  const firstLower = words[0].toLowerCase();
  const lastLower = words[words.length - 1].toLowerCase();

  const lastIsSurname = VIETNAMESE_SURNAMES.has(lastLower);
  const firstIsSurname = VIETNAMESE_SURNAMES.has(firstLower);
  const firstIsMiddle = VIETNAMESE_MIDDLE_NAMES.has(firstLower);

  // Đảo thứ tự nếu:
  // 1. Từ cuối cùng là Họ Việt Nam mà từ đầu tiên KHÔNG phải họ Việt Nam (ví dụ "Thị Đôi Nguyễn", "Văn An Nguyễn", "An Nguyễn").
  // 2. Hoặc từ đầu tiên là từ đệm đặc trưng không bao giờ là họ (ví dụ "Thị") và từ cuối là họ Việt.
  const isInverted = (lastIsSurname && !firstIsSurname) || (lastIsSurname && firstIsMiddle);

  if (isInverted) {
    const lastWord = words[words.length - 1];
    const remaining = words.slice(0, words.length - 1);
    const reordered = [lastWord, ...remaining];
    return reordered.map(capitalizeWord).join(' ');
  }

  return words.map(capitalizeWord).join(' ');
}
