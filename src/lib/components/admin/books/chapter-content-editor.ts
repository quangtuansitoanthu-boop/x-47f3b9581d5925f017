import { renderReaderContent } from '$lib/components/reader/content-renderer';
import { sanitizeStoredHtml } from '$lib/domain/content-sanitizer';

export function createChapterEditorHtml(content: string): string {
  return content.trim() ? renderReaderContent(content) : '';
}

export function serializeChapterEditorHtml(html: string): string {
  const sanitized = sanitizeStoredHtml(html);
  const visibleText = sanitized
    .replace(/<br\s*\/?>/giu, '')
    .replace(/<[^>]+>/gu, '')
    .replace(/(?:&nbsp;|&#160;)/giu, ' ')
    .trim();
  return visibleText || /<(?:hr|img|table)\b/iu.test(sanitized) ? sanitized : '';
}

export function createChapterImageHtml(markdown: string): string {
  return renderReaderContent(markdown);
}
