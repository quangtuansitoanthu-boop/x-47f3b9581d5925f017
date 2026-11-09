export const PRACTICE_WIDGET_OPEN_EVENT = 'quangtu:practice-widget-open';

const ACTIONS = new Set([
  'giu-gioi', 'bat-quan-trai', 'thanh-tinh', 'le-phat', 'rosary', 'meditation',
  'cong-phu', 'thoi-khoa', 'tiep-tuc-cong-phu',
]);
const SECTIONS = new Set(['kinh', 'kinh-phat', 'tri-chu', 'chu', 'nghi-thuc', 'nghi-thuc-khac']);
const HASHES = new Set([
  '#thien-dinh', '#trang-hat', '#le-phat', '#giu-gioi', '#bat-quan-trai', '#thanh-tinh',
  '#tung-kinh', '#tri-chu', '#nghi-thuc',
]);

export function isPracticeWidgetTarget(url: URL): boolean {
  if (url.pathname !== '/tu-tap') return false;
  const action = url.searchParams.get('action');
  const mode = url.searchParams.get('mode');
  const screen = url.searchParams.get('screen');
  const section = url.searchParams.get('muc') || url.searchParams.get('section')
    || url.searchParams.get('tab') || url.searchParams.get('category');
  return Boolean((action && ACTIONS.has(action)) || (section && SECTIONS.has(section))
    || (mode && ['meditation', 'rosary', 'le-phat', 'lephat'].includes(mode))
    || (screen && ['rosary', 'le-phat'].includes(screen))
    || url.searchParams.get('rosary') === 'start' || url.searchParams.get('le-phat') === 'start'
    || HASHES.has(url.hash));
}
