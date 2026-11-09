import { copySourceText } from './copying-formatting';
export const COPYING_BOOKS = [
  { id: 'dia-tang', title: 'Kinh Địa Tạng Bồ Tát Bổn Nguyện', count: 13, unit: 'phẩm' },
  { id: 'phap-hoa', title: 'Kinh Diệu Pháp Liên Hoa', count: 28, unit: 'phẩm' },
  { id: 'lang-nghiem', title: 'Kinh Thủ Lăng Nghiêm', count: 10, unit: 'quyển' },
] as const;
export type CopyBookId = typeof COPYING_BOOKS[number]['id'];
export interface CopyBook { id: string; title: string; articleId: string; version: string; chapters: CopyChapter[] }
export interface CopyChapter { number: number; title: string; blocks: string[] }
export interface CopyIssue { kind: 'wrong' | 'missing' | 'extra'; expected: string; actual: string; start: number; end: number }
export const COPY_NOTICE = 'Bản chép được tự lưu trên thiết bị này. Chỉ khi bạn bấm “Lưu lên hệ thống”, phần đã chép mới được lưu vào tài khoản và yêu cầu đăng nhập. Gỡ ứng dụng hoặc xóa dữ liệu ứng dụng/dữ liệu trang web có thể làm mất phần chưa lưu lên hệ thống.';
export function normalizeCopyText(text: string): string { return tokens(copySourceText(text)).map(token => token.key).join(' '); }
export function isBlockedCopyInput(type: string): boolean { return /^insertFrom(Paste|Drop)/u.test(type); }
/** Mask optional instructions without changing original textarea selection offsets. */
function withoutCopyNotes(text: string): string {
  let depth = 0;
  return text.split('').map(character => {
    if (character === '(' || character === '（') { depth++; return ' '; }
    if ((character === ')' || character === '）') && depth > 0) { depth--; return ' '; }
    return depth > 0 ? ' ' : character;
  }).join('');
}
function tokens(text: string) {
  return [...withoutCopyNotes(text).matchAll(/[\p{L}\p{M}\p{N}]+/gu)].map(m => ({ value: m[0].normalize('NFC'), key: m[0].normalize('NFC').toLowerCase(), start: m.index!, end: m.index! + m[0].length }));
}
/** Bounded token alignment avoids a missing word turning every later word red. */
export function compareCopy(expected: string, actual: string, full = false): { complete: boolean; issues: CopyIssue[] } {
  expected = copySourceText(expected);
  const complete = normalizeCopyText(expected) === normalizeCopyText(actual);
  if (complete) return { complete, issues: [] };
  const a = tokens(expected), b = tokens(actual);
  // A copying block is <=160 tokens. Reject pathological pasted/programmatic input
  // without constructing an unbounded quadratic matrix.
  if (a.length > 240 || b.length > 320) return { complete: false, issues: [{ kind: 'extra', expected: '', actual: 'Đoạn nhập quá dài', start: 0, end: actual.length }] };
  const width = b.length + 1;
  const matrix = new Uint16Array((a.length + 1) * width);
  for (let i = 0; i <= a.length; i++) matrix[i * width] = i;
  for (let j = 0; j <= b.length; j++) matrix[j] = j;
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    matrix[i * width + j] = Math.min(matrix[(i - 1) * width + j] + 1, matrix[i * width + j - 1] + 1,
      matrix[(i - 1) * width + j - 1] + (a[i - 1].key === b[j - 1].key ? 0 : 1));
  }
  let i = a.length, j = b.length;
  // Partial typing compares to the best matching prefix; tail remains unwritten.
  if (!full) {
    i = 0;
    for (let k = 1; k <= a.length; k++) if (matrix[k * width + j] < matrix[i * width + j]) i = k;
  }
  const issues: CopyIssue[] = [];
  while (i || j) {
    const cost = matrix[i * width + j];
    if (i && j && a[i - 1].key === b[j - 1].key && cost === matrix[(i - 1) * width + j - 1]) { i--; j--; }
    else if (i && j && cost === matrix[(i - 1) * width + j - 1] + 1) {
      issues.push({ kind: 'wrong', expected: a[i - 1].value, actual: b[j - 1].value, start: b[j - 1].start, end: b[j - 1].end }); i--; j--;
    } else if (i && cost === matrix[(i - 1) * width + j] + 1) {
      const pos = j < b.length ? b[j].start : actual.length;
      issues.push({ kind: 'missing', expected: a[i - 1].value, actual: '', start: pos, end: pos }); i--;
    } else {
      issues.push({ kind: 'extra', expected: '', actual: b[j - 1].value, start: b[j - 1].start, end: b[j - 1].end }); j--;
    }
  }
  return { complete, issues: issues.reverse() };
}
