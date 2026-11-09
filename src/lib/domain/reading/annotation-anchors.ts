import type { AnnotationAnchorStatus, ReadingAnnotationWrite } from './activity';

const CONTEXT_LENGTH = 80;

export interface TextAnnotationLocator {
  startOffset: number;
  endOffset: number;
}

export interface PdfAnnotationLocator extends TextAnnotationLocator {
  page: number;
  rectangles: Array<{ x: number; y: number; width: number; height: number }>;
}

export interface ResolvedTextAnchor {
  startOffset: number | null;
  endOffset: number | null;
  status: AnnotationAnchorStatus;
}

export function createTextAnnotationDraft(input: {
  content: string;
  contentId: string;
  contentKind: ReadingAnnotationWrite['contentKind'];
  contentVersion: string | null;
  endOffset: number;
  id: string;
  startOffset: number;
}): ReadingAnnotationWrite {
  const startOffset = boundedOffset(input.startOffset, input.content.length);
  const endOffset = boundedOffset(input.endOffset, input.content.length);
  if (endOffset <= startOffset) throw new Error('invalid_text_selection');
  const quoteText = input.content.slice(startOffset, endOffset);
  if (!quoteText.trim()) throw new Error('invalid_text_selection');
  return {
    id: input.id,
    contentKind: input.contentKind,
    contentId: input.contentId,
    locator: { startOffset, endOffset } satisfies TextAnnotationLocator,
    quoteText,
    contextBefore: input.content.slice(Math.max(0, startOffset - CONTEXT_LENGTH), startOffset),
    contextAfter: input.content.slice(endOffset, endOffset + CONTEXT_LENGTH),
    color: 'yellow',
    note: '',
    contentVersion: input.contentVersion,
    anchorStatus: 'active',
    idempotencyKey: input.id,
  };
}

export function resolveTextAnnotation(input: {
  content: string;
  contextAfter: string;
  contextBefore: string;
  locator: Record<string, unknown>;
  quoteText: string;
}): ResolvedTextAnchor {
  const startOffset = Number(input.locator.startOffset);
  const endOffset = Number(input.locator.endOffset);
  if (Number.isSafeInteger(startOffset) && Number.isSafeInteger(endOffset)
    && startOffset >= 0 && endOffset > startOffset
    && input.content.slice(startOffset, endOffset) === input.quoteText) {
    return { startOffset, endOffset, status: 'active' };
  }

  const candidates = exactMatches(input.content, input.quoteText);
  if (candidates.length === 1) {
    const start = candidates[0];
    return { startOffset: start, endOffset: start + input.quoteText.length, status: 'active' };
  }
  const contextual = candidates.filter((start) => {
    const beforeStart = Math.max(0, start - input.contextBefore.length);
    const afterStart = start + input.quoteText.length;
    return input.content.slice(beforeStart, start).endsWith(input.contextBefore)
      && input.content.slice(afterStart, afterStart + input.contextAfter.length).startsWith(input.contextAfter);
  });
  if (contextual.length === 1) {
    const start = contextual[0];
    return { startOffset: start, endOffset: start + input.quoteText.length, status: 'active' };
  }
  return { startOffset: null, endOffset: null, status: 'orphaned' };
}

export function normalizePdfAnnotationLocator(input: unknown): PdfAnnotationLocator {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('invalid_pdf_locator');
  const row = input as Record<string, unknown>;
  const page = Number(row.page);
  const startOffset = Number(row.startOffset);
  const endOffset = Number(row.endOffset);
  const rawRectangles = row.rectangles;
  if (!Number.isSafeInteger(page) || page < 1
    || !Number.isSafeInteger(startOffset) || startOffset < 0
    || !Number.isSafeInteger(endOffset) || endOffset <= startOffset
    || !Array.isArray(rawRectangles) || rawRectangles.length > 100) {
    throw new Error('invalid_pdf_locator');
  }
  const rectangles = rawRectangles.map((rectangle) => {
    if (!rectangle || typeof rectangle !== 'object' || Array.isArray(rectangle)) throw new Error('invalid_pdf_locator');
    const record = rectangle as Record<string, unknown>;
    const normalized = {
      x: Number(record.x), y: Number(record.y), width: Number(record.width), height: Number(record.height),
    };
    if (Object.values(normalized).some((value) => !Number.isFinite(value))
      || normalized.width <= 0 || normalized.height <= 0) throw new Error('invalid_pdf_locator');
    return normalized;
  });
  return { page, startOffset, endOffset, rectangles };
}

function boundedOffset(value: number, maximum: number): number {
  if (!Number.isSafeInteger(value) || value < 0 || value > maximum) throw new Error('invalid_text_selection');
  return value;
}

function exactMatches(content: string, quote: string): number[] {
  if (!quote) return [];
  const matches: number[] = [];
  let start = 0;
  while (start <= content.length - quote.length) {
    const match = content.indexOf(quote, start);
    if (match < 0) break;
    matches.push(match);
    start = match + Math.max(1, quote.length);
  }
  return matches;
}
