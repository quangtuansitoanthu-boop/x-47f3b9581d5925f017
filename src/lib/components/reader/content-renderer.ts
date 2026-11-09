import { sanitizeStoredHtml } from '$lib/domain/content-sanitizer';
import { renderPracticeContent, replaceCustomTags } from '$lib/domain/practice/content';

const HTML_ELEMENT_PATTERN = /<\/?[a-z][^>]*>/iu;
const HTML_TOKEN_PATTERN = /(<[^>]+>)/gu;

function renderInlineMarkdown(value: string): string {
  return value
    .replace(/(?:^|\n)#{1,6}\s+([^\n]+)/gu, '\n<strong>$1</strong>')
    .replace(/\*\*(.+?)\*\*/gu, '<strong>$1</strong>')
    .replace(/(?<!\*)\*([^*\n]+?)\*(?!\*)/gu, '<em>$1</em>')
    .replace(/__(.+?)__/gu, '<u>$1</u>')
    .replace(/_(.+?)_/gu, '<em>$1</em>');
}

export function renderReaderContent(raw: string): string {
  if (!raw) return '';
  const sanitized = sanitizeStoredHtml(raw);
  if (!HTML_ELEMENT_PATTERN.test(sanitized)) {
    return sanitizeStoredHtml(renderPracticeContent(sanitized));
  }

  const withCustomTags = replaceCustomTags(sanitized);

  const rendered = withCustomTags
    .split(HTML_TOKEN_PATTERN)
    .map((token) => (token.startsWith('<') ? token : renderInlineMarkdown(token)))
    .join('');

  return sanitizeStoredHtml(rendered);
}

