import type { AnnotationAnchorStatus, ReadingContentKind } from './activity';

interface CachedQuote {
  id: string;
  contentId: string;
  contentKind: ReadingContentKind;
  anchorStatus: AnnotationAnchorStatus;
  locator: Record<string, unknown>;
}

export function quoteNavigationPage(value: unknown, pageCount: number): number | null {
  const page = Number(value);
  return Number.isSafeInteger(page) && page >= 1 && page <= pageCount ? page : null;
}

/** Callers provide only the current principal's cache; URL data never supplies a locator. */
export function cachedQuoteNavigation<T extends CachedQuote>(rows: T[], id: string | null, contentId: string):
  | { status: 'text'; annotation: T; sectionId: string }
  | { status: 'pdf'; annotation: T; page: number }
  | { status: 'missing' | 'orphaned' | 'invalid' } {
  if (!id || !/^[A-Za-z0-9][A-Za-z0-9._:-]{0,191}$/u.test(id)) return { status: 'missing' };
  const annotation = rows.find(row => row.id === id && row.contentId === contentId);
  if (!annotation) return { status: 'missing' };
  if (annotation.anchorStatus === 'orphaned') return { status: 'orphaned' };
  if (annotation.contentKind === 'pdf') {
    const page = quoteNavigationPage(annotation.locator.page, Number.MAX_SAFE_INTEGER);
    return page === null ? { status: 'invalid' } : { status: 'pdf', annotation, page };
  }
  const section = annotation.locator.sectionId ?? 'root';
  if (typeof section !== 'string' || !section || section.length > 1024) return { status: 'invalid' };
  return { status: 'text', annotation, sectionId: section };
}
