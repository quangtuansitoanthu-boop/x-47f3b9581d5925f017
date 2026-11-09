import { sanitizeStoredHtml } from '$lib/domain/content-sanitizer';
import { renderPracticeContent } from '$lib/domain/practice/content';

const HTML_ELEMENT_PATTERN = /<\/?[a-z][^>]*>/iu;

export function createArticleEditorHtml(content: string): string {
  if (!content.trim()) return '';
  return sanitizeStoredHtml(
    HTML_ELEMENT_PATTERN.test(content) ? content : renderPracticeContent(content),
  );
}

export function createArticleImageHtml(markdown: string): string {
  return sanitizeStoredHtml(renderPracticeContent(markdown));
}

export function createArticleLinkHtml(value: string, label = ''): string {
  const href = value.trim();
  if (!isSafeEditorLink(href)) return '';
  const text = label.trim() || href;
  return sanitizeStoredHtml(`<a href="${escapeHtmlAttribute(href)}">${escapeHtml(text)}</a>`);
}

export function createArticleTableHtml(rows: number, columns: number, withHeader = true): string {
  const safeRows = clampInteger(rows, withHeader ? 2 : 1, 12);
  const safeColumns = clampInteger(columns, 1, 8);
  const bodyStart = withHeader ? 1 : 0;
  const header = withHeader
    ? `<thead><tr>${Array.from({ length: safeColumns }, (_, index) => `<th scope="col">Cột ${index + 1}</th>`).join('')}</tr></thead>`
    : '';
  const body = Array.from(
    { length: Math.max(1, safeRows - bodyStart) },
    () => `<tr>${'<td><br></td>'.repeat(safeColumns)}</tr>`,
  ).join('');
  return sanitizeStoredHtml(`<table>${header}<tbody>${body}</tbody></table><p><br></p>`);
}

export function isSafeEditorLink(value: string): boolean {
  const normalized = value.trim();
  if (normalized.startsWith('/') && !normalized.startsWith('//')) return true;
  try {
    const url = new URL(normalized);
    return url.protocol === 'https:' || url.protocol === 'mailto:';
  } catch {
    return false;
  }
}


function clampInteger(value: number, minimum: number, maximum: number): number {
  if (!Number.isFinite(value)) return minimum;
  return Math.min(maximum, Math.max(minimum, Math.round(value)));
}

function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

function escapeHtmlAttribute(value: string): string {
  return escapeHtml(value);
}
