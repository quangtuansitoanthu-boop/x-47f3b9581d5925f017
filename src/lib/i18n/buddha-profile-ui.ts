const vi = {
  title: 'Tiểu sử & Đại nguyện',
  trigger: 'Tìm hiểu',
  triggerFor: 'Tìm hiểu {name}',
  close: 'Đóng tiểu sử và đại nguyện',
  contents: 'Mục lục',
  sectionLabels: ['Tiểu sử', 'Phát nguyện ban đầu', 'Đại nguyện', 'Lợi ích xưng niệm', 'Thần chú & Đà-la-ni', 'Sự tích cảm ứng'],
  loading: 'Đang mở nội dung…',
  error: 'Chưa mở được nội dung. Bạn có thể thử lại hoặc đóng để tiếp tục lễ Phật.',
  unavailable: 'Chưa có nội dung cho vị đang chọn.',
  retry: 'Thử lại',
  prostrationSaveError: 'Chưa lưu được công phu. Số lần lạy được giữ nguyên. Hãy giải phóng dung lượng thiết bị rồi thử lại.',
  notes: 'Giải thích & điểm cần phân biệt',
  references: 'Dẫn kinh & văn bản đối chiếu',
  aboutContent: 'Về nội dung và dẫn kinh',
  vietnameseNotice: ''
};

const en: typeof vi = {
  title: 'Biography & Great Vows',
  trigger: 'Learn more',
  triggerFor: 'Learn about {name}',
  close: 'Close biography and great vows',
  contents: 'Contents',
  sectionLabels: ['Biography', 'Initial aspirations', 'Great vows', 'Benefits of name recitation', 'Mantras & Dhāraṇīs', 'Spiritual responses'],
  loading: 'Opening content…',
  error: 'Unable to open this content. Retry, or close to continue prostration practice.',
  unavailable: 'Content is not yet available for the selected figure.',
  retry: 'Retry',
  prostrationSaveError: 'Could not save your practice. Your prostration count is kept. Free some device storage and try again.',
  notes: 'Explanations & distinctions',
  references: 'Scriptural & textual references',
  aboutContent: 'About this content & its sources',
  vietnameseNotice: 'This reference content is currently available in Vietnamese only.'
};

export function getBuddhaProfileUi(isEnglish: boolean) {
  return isEnglish ? en : vi;
}
