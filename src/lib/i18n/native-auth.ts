export const GOOGLE_IOS_CONFIGURATION_REQUIRED = 'Bản iOS chưa được cấu hình đăng nhập Google. Vui lòng cập nhật bản ứng dụng đã được cấu hình đầy đủ.';

export const FACEBOOK_BROWSER_ERRORS = {
  invalid: 'Kết quả đăng nhập Facebook không hợp lệ. Vui lòng thử lại.',
  busy: 'Đang đăng nhập Facebook. Vui lòng hoàn tất hoặc đóng cửa sổ đăng nhập.',
  stale: 'Phiên đăng nhập đã thay đổi. Vui lòng thử lại.',
  cancelled: 'Đã hủy đăng nhập.',
} as const;

export const SESSION_VERIFICATION_UNAVAILABLE = {
  vi: 'Chưa thể xác minh phiên đăng nhập. Vui lòng thử lại.',
  en: 'Could not verify your session. Please try again.',
} as const;
