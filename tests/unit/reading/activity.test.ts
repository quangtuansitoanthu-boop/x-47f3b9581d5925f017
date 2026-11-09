import { describe, expect, it } from 'vitest';

import {
  normalizeReadingAnnotationPatch,
  normalizeReadingAnnotationWrite,
  normalizeReadingProgressDelete,
  normalizeReadingProgressWrite,
} from '../../../src/lib/domain/reading/activity';

describe('reading activity contracts', () => {
  it('normalizes a causally ordered progress write', () => {
    expect(normalizeReadingProgressWrite({
      baseRevision: 4,
      clientUpdatedAt: '2026-09-04T10:00:00.000Z',
      contentId: 'book-1',
      contentKind: 'pdf',
      contentVersion: 'sha256:abc',
      deviceId: 'device-a',
      deviceSequence: 8,
      epoch: 2,
      percent: 75.5,
      position: { page: 12 },
      total: 16,
    })).toMatchObject({
      baseRevision: 4,
      contentId: 'book-1',
      contentKind: 'pdf',
      deviceSequence: 8,
      epoch: 2,
      percent: 75.5,
      position: { page: 12 },
    });
  });

  it('validates causal deletes and annotation patches', () => {
    expect(normalizeReadingProgressDelete({
      baseRevision: 2,
      contentId: 'book-1',
      contentKind: 'pdf',
      deviceId: 'device-1',
      deviceSequence: 3,
      epoch: 2,
    })).toMatchObject({ baseRevision: 2, deviceSequence: 3 });
    expect(() => normalizeReadingProgressDelete({
      baseRevision: 0,
      contentId: 'book-1',
      contentKind: 'pdf',
      deviceId: 'device-1',
      deviceSequence: 3,
      epoch: 2,
    })).toThrow('invalid_base_revision');

    expect(normalizeReadingAnnotationPatch({
      anchorStatus: 'orphaned',
      baseUpdatedAt: '2026-09-04T12:00:00.000Z',
      color: 'green',
      contentVersion: 'v2',
      locator: { page: 3 },
      note: 'ghi chú',
    })).toMatchObject({ anchorStatus: 'orphaned', color: 'green' });
  });

  it('rejects invalid progress percentages and device sequences', () => {
    expect(() => normalizeReadingProgressWrite({
      contentId: 'book-1',
      contentKind: 'pdf',
      deviceId: 'device-a',
      deviceSequence: 0,
      percent: 101,
      position: { page: 1 },
    })).toThrow();
  });

  it('accepts only yellow or green annotation colors', () => {
    const base = {
      anchorStatus: 'active',
      color: 'yellow',
      contentId: 'chapter-1',
      contentKind: 'chapter',
      id: 'annotation-1',
      idempotencyKey: 'annotation-write-1',
      locator: { end: 5, start: 0 },
      note: 'Ghi chú',
      quoteText: 'Một đoạn trích',
    };
    expect(normalizeReadingAnnotationWrite(base).color).toBe('yellow');
    expect(() => normalizeReadingAnnotationWrite({ ...base, color: 'blue' })).toThrow('invalid_highlight_color');
  });
});
