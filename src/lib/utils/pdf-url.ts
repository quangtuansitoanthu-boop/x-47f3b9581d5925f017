export function resolvePdfUrl(raw: unknown): string {
  const s = String(raw ?? '').trim();
  if (!s) return '';
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (s.startsWith('pdfs/')) return `https://media.quangtu.vn/${s}`;
  if (s.startsWith('/pdfs/')) return `https://media.quangtu.vn${s}`;
  if (s.startsWith('/')) return s;
  return `https://media.quangtu.vn/${s}`;
}
