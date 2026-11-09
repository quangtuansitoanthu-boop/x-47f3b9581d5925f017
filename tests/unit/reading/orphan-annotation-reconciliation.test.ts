import { describe, expect, it, vi } from 'vitest';
import {
  READING_ACTIVITY_OUTBOX_CAPACITY_ERROR,
  type ReadingAnnotationRecord,
} from '$lib/browser/reading-activity-client';
import { enqueueOrphanAnnotationReconciliation } from '$lib/components/reader/orphan-annotation-reconciliation';

function annotation(contentKind: 'article' | 'pdf'): ReadingAnnotationRecord {
  return {
    anchorStatus: 'active',
    color: 'yellow',
    contentId: 'document-a',
    contentKind,
    contentVersion: 'v1',
    contextAfter: '',
    contextBefore: '',
    createdAt: '2026-09-04T12:00:00.000Z',
    id: `${contentKind}-quote`,
    locator: contentKind === 'pdf' ? { page: 2 } : { sectionId: 'root' },
    note: '',
    quoteText: 'Đoạn cũ',
    updatedAt: '2026-09-04T12:00:00.000Z',
  };
}

describe('orphan annotation reconciliation', () => {
  it.each(['article', 'pdf'] as const)('keeps %s readable and reports capacity without throwing', (kind) => {
    const row = annotation(kind);
    const client = {
      enqueueAnnotationUpdate: vi.fn(() => {
        throw new Error(READING_ACTIVITY_OUTBOX_CAPACITY_ERROR);
      }),
    };

    expect(enqueueOrphanAnnotationReconciliation(client, row, 'v2')).toEqual({
      error: 'Hàng đợi đọc ngoại tuyến đã đầy. Hãy kết nối để đồng bộ.',
      queued: false,
    });
    expect(row.anchorStatus).toBe('orphaned');
  });
});
