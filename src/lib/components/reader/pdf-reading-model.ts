export interface PdfSpread {
  canonicalPage: number;
  id: string;
  pages: number[];
}

export interface PdfOutlineSourceItem {
  dest?: unknown;
  items?: PdfOutlineSourceItem[];
  title?: string;
}

export interface PdfOutlineItem {
  depth: number;
  destination: unknown;
  id: string;
  title: string;
}

export interface PdfOutlineDocument {
  getDestination: (name: string) => Promise<unknown[] | null>;
  getPageIndex: (reference: unknown) => Promise<number>;
  numPages: number;
}

/**
 * Page one is a cover. Remaining pages are paired in reading order, leaving an
 * even-numbered final page on its own when the document ends mid-spread.
 */
export function buildPdfSpreads(pageCount: number, twoPage: boolean): PdfSpread[] {
  const count = Math.max(0, Math.floor(pageCount));
  if (!twoPage) {
    return Array.from({ length: count }, (_, index) => ({
      canonicalPage: index + 1,
      id: `page-${index + 1}`,
      pages: [index + 1],
    }));
  }
  if (count === 0) return [];

  const spreads: PdfSpread[] = [{ canonicalPage: 1, id: 'spread-1', pages: [1] }];
  for (let page = 2; page <= count; page += 2) {
    const pages = page + 1 <= count ? [page, page + 1] : [page];
    spreads.push({ canonicalPage: page, id: `spread-${page}`, pages });
  }
  return spreads;
}

export function canonicalPdfPage(page: number, pageCount: number, twoPage: boolean): number {
  const count = Math.max(1, Math.floor(pageCount));
  const bounded = Math.min(count, Math.max(1, Math.floor(page)));
  if (!twoPage || bounded === 1) return bounded;
  return bounded % 2 === 0 ? bounded : bounded - 1;
}

export function flattenPdfOutline(items: PdfOutlineSourceItem[] | null | undefined): PdfOutlineItem[] {
  const flattened: PdfOutlineItem[] = [];

  const visit = (entries: PdfOutlineSourceItem[], depth: number, prefix: string): void => {
    entries.forEach((entry, index) => {
      const id = `${prefix}${index}`;
      const title = String(entry.title || '').trim() || 'Mục không có tiêu đề';
      flattened.push({ depth, destination: entry.dest, id, title });
      if (Array.isArray(entry.items) && entry.items.length) visit(entry.items, depth + 1, `${id}-`);
    });
  };

  if (Array.isArray(items)) visit(items, 0, 'outline-');
  return flattened;
}

export async function resolvePdfOutlinePage(
  document: PdfOutlineDocument,
  destination: unknown,
): Promise<number | null> {
  let explicitDestination = destination;
  if (typeof explicitDestination === 'string') {
    explicitDestination = await document.getDestination(explicitDestination);
  }
  if (!Array.isArray(explicitDestination) || explicitDestination.length === 0) return null;

  const reference = explicitDestination[0];
  let pageIndex: number;
  if (typeof reference === 'number' && Number.isInteger(reference)) pageIndex = reference;
  else {
    try {
      pageIndex = await document.getPageIndex(reference);
    } catch {
      return null;
    }
  }
  const page = pageIndex + 1;
  return page >= 1 && page <= document.numPages ? page : null;
}
