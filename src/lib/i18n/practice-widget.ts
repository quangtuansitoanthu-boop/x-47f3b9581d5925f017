export const PRACTICE_WIDGET_ITEMS = [
  { id: 'meditation', icon: '🧘', title: 'Thiền định', subtitle: 'Mở công cụ thiền', path: '/tu-tap?action=meditation' },
  { id: 'chanting_beads', icon: '📿', title: 'Lần tràng hạt', subtitle: 'Mở chuỗi hạt', path: '/tu-tap?action=rosary' },
  { id: 'sutra', icon: '📖', title: 'Tụng kinh', subtitle: 'Chọn bài kinh', path: '/tu-tap?muc=kinh' },
  { id: 'mantra', icon: '🙏', title: 'Trì chú', subtitle: 'Chọn bài chú', path: '/tu-tap?muc=tri-chu' },
] as const;

const english = [
  ['Meditation', 'Open meditation'], ['Rosary', 'Open rosary beads'],
  ['Sutra recitation', 'Choose a sutra'], ['Mantra recitation', 'Choose a mantra'],
];
export function practiceWidgetItems(locale = 'vi') {
  return PRACTICE_WIDGET_ITEMS.map((item, index) => locale === 'en'
    ? { ...item, title: english[index][0], subtitle: english[index][1] } : item);
}
