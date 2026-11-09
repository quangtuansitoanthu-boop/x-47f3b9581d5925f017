const LEGACY_PAGE_NAMES = new Set([
  'index.html',
  'huong-dan.html',
  'huongdan.html',
  'phap-thoai.html',
  'phapthoai.html',
  'tu-tap.html',
  'tutap.html'
]);

export function match(value: string): boolean {
  return LEGACY_PAGE_NAMES.has(value);
}
