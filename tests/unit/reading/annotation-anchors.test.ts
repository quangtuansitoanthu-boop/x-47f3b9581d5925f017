import { describe, expect, it } from 'vitest';
import {
  createTextAnnotationDraft,
  normalizePdfAnnotationLocator,
  resolveTextAnnotation,
} from '../../../src/lib/domain/reading/annotation-anchors';

describe('reading annotation anchors', () => {
  it('captures quote, offsets and redundant context without HTML', () => {
    const content = 'Mở đầu. Tâm an thì cảnh an. Kết thúc.';
    const start = content.indexOf('Tâm an');
    expect(createTextAnnotationDraft({
      content, contentId: 'article-a', contentKind: 'article', contentVersion: 'v1',
      endOffset: start + 'Tâm an thì cảnh an.'.length, id: 'quote-a', startOffset: start,
    })).toMatchObject({
      quoteText: 'Tâm an thì cảnh an.',
      locator: { startOffset: start, endOffset: start + 'Tâm an thì cảnh an.'.length },
      color: 'yellow',
      anchorStatus: 'active',
    });
  });

  it('restores moved unique text but orphans missing or ambiguous text', () => {
    expect(resolveTextAnnotation({
      content: 'Phần mới. Lời dạy quý. Kết.', contextAfter: '. Kết', contextBefore: 'Mở. ',
      locator: { startOffset: 5, endOffset: 17 }, quoteText: 'Lời dạy quý',
    })).toMatchObject({ status: 'active', startOffset: 10 });
    expect(resolveTextAnnotation({
      content: 'Lời dạy. Một đoạn. Lời dạy.', contextAfter: '', contextBefore: '',
      locator: {}, quoteText: 'Lời dạy',
    })).toEqual({ status: 'orphaned', startOffset: null, endOffset: null });
    expect(resolveTextAnnotation({
      content: 'Không còn câu cũ.', contextAfter: '', contextBefore: '', locator: {}, quoteText: 'Lời dạy',
    })).toEqual({ status: 'orphaned', startOffset: null, endOffset: null });
  });

  it('uses surrounding context to disambiguate repeated text', () => {
    expect(resolveTextAnnotation({
      content: 'A Lời dạy B. C Lời dạy D', contextAfter: ' D', contextBefore: 'C ',
      locator: {}, quoteText: 'Lời dạy',
    })).toMatchObject({ status: 'active', startOffset: 15 });
  });

  it('validates PDF page, text offsets and geometry', () => {
    expect(normalizePdfAnnotationLocator({
      page: 2, startOffset: 1, endOffset: 8,
      rectangles: [{ x: 0.1, y: 0.2, width: 0.3, height: 0.04 }],
    })).toMatchObject({ page: 2, startOffset: 1, endOffset: 8 });
    expect(() => normalizePdfAnnotationLocator({
      page: 0, startOffset: 1, endOffset: 8, rectangles: [],
    })).toThrow('invalid_pdf_locator');
  });
});
