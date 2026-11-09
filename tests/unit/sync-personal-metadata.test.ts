import { expect, it, vi } from 'vitest';
import { createSyncService } from '../../src/lib/server/services/sync';
it('preserves personal events and other metadata owned by separate features during bookmark sync', async () => {
  const events = [{ id: 'event-a', title: 'Private anniversary' }];
  const metadata = { personal_lunar_events: events, personal_events_updated_at: '2026-10-22T00:00:00Z', future_feature: { value: 42 } };
  const compareAndSetUserSync = vi.fn(async (..._args: any[]) => true);
  const repository = { getUserSync: vi.fn(async () => ({ id: 'user', practice_logs: '[]', bookmarks: '[]', listened_history: '[]', sync_revision: 1, sync_metadata: JSON.stringify(metadata) })), compareAndSetUserSync };
  await createSyncService({ env: {}, principal: { appUserId: 'user' }, requestId: 'test' } as any, { repository: repository as any }).putUserSync({ bookmarks: [{ id: 'book' }] });
  expect(JSON.parse(compareAndSetUserSync.mock.calls[0][2].syncMetadata)).toMatchObject(metadata);
});
