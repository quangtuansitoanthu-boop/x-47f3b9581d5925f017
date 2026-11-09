const vi = {
  studyTitle: 'Hướng dẫn tu học Phật pháp',
  studyDescription: 'Lộ trình cho người mới, tụng kinh, trì chú và thực hành mỗi ngày',
  appTitle: 'Hướng dẫn sử dụng ứng dụng',
  appDescription: 'Đọc sách, nghe pháp, công cụ tu tập, tài khoản và đồng bộ',
};
const en = {
  studyTitle: 'Buddhist practice guide',
  studyDescription: 'Getting started, sutra recitation, mantras and daily practice',
  appTitle: 'App user guide',
  appDescription: 'Reading, Dharma talks, practice tools, accounts and sync',
};

export function getGuideNavigationCopy(isEn: boolean) {
  return isEn ? en : vi;
}
