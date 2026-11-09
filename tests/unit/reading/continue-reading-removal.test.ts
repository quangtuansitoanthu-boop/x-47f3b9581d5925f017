import { describe, expect, it, vi } from 'vitest';
import { READING_ACTIVITY_OUTBOX_CAPACITY_ERROR } from '$lib/browser/reading-activity-client';
import {
  removeContinueReadingProgress,
  removeContinueReadingProgressIfCurrent,
} from '$lib/components/library/continue-reading-removal';

const row = {
  clientUpdatedAt: '2026-09-04T12:00:00.000Z',
  contentId: 'review-pdf',
  contentKind: 'pdf' as const,
  contentVersion: 'v1',
  deviceId: 'device-a',
  deviceSequence: 4,
  epoch: 2,
  percent: 50,
  position: { page: 5 },
  revision: 7,
  serverUpdatedAt: '2026-09-04T12:00:01.000Z',
  total: 10,
};

describe('continue-reading removal', () => {
  it('preserves the row and reports a recoverable message when the durable outbox is full', async () => {
    const flush = vi.fn(async () => 0);
    const client = {
      enqueueProgressDelete: vi.fn(() => { throw new Error(READING_ACTIVITY_OUTBOX_CAPACITY_ERROR); }),
      flush,
    };

    await expect(removeContinueReadingProgress(client, row)).resolves.toEqual({
      error: 'Hàng đợi đọc ngoại tuyến đã đầy. Hãy kết nối để đồng bộ rồi thử lại.',
      removed: false,
      syncDeferred: false,
    });
    expect(flush).not.toHaveBeenCalled();
  });

  it('removes only after enqueue succeeds and treats a network flush failure as deferred sync', async () => {
    const enqueueProgressDelete = vi.fn();
    const client = {
      enqueueProgressDelete,
      flush: vi.fn(async () => { throw new Error('offline'); }),
    };

    await expect(removeContinueReadingProgress(client, row)).resolves.toEqual({
      error: '',
      removed: true,
      syncDeferred: true,
    });
    expect(enqueueProgressDelete).toHaveBeenCalledWith({
      baseRevision: 7,
      contentId: 'review-pdf',
      contentKind: 'pdf',
      epoch: 2,
    });
  });

  it('does not publish a deferred account-A removal into account B with the same content', async () => {
    let resolveFlush!: () => void;
    const flush = new Promise<void>((resolve) => { resolveFlush = resolve; });
    let principal = 'account-a';
    let visible = [{ ...row }];
    const publish = vi.fn((result) => {
      if (result.removed) visible = [];
    });
    const pending = removeContinueReadingProgressIfCurrent({
      enqueueProgressDelete: vi.fn(),
      flush: () => flush,
    }, row, () => principal === 'account-a', publish);

    principal = 'account-b';
    visible = [{ ...row, deviceId: 'device-b' }];
    resolveFlush();

    await expect(pending).resolves.toBe(false);
    expect(publish).not.toHaveBeenCalled();
    expect(visible).toEqual([expect.objectContaining({ contentId: 'review-pdf', deviceId: 'device-b' })]);
  });
});
