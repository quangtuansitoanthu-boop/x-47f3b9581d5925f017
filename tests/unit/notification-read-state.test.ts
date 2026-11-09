import { expect, it } from 'vitest';
import { notificationReadBatches, NOTIFICATION_READ_QUERY_LIMIT } from '../../src/lib/contracts/notification-read-state';
it('bounds encoded request size and IDs per batch without dropping or duplicating long valid IDs', () => {
  const ids = Array.from({ length: 225 }, (_, index) => `mindful-reaction:${String(index).padStart(3, '0')}${'a'.repeat(104)}`);
  const batches = notificationReadBatches([...ids, ids[0], 'invalid id']);
  expect(batches.flat()).toEqual(ids);
  for (const batch of batches) {
    expect(batch.length).toBeLessThanOrEqual(100);
    expect(encodeURIComponent(batch.join(',')).length).toBeLessThanOrEqual(NOTIFICATION_READ_QUERY_LIMIT);
  }
});
