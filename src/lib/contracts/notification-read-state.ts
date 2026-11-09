export const NOTIFICATION_READ_BATCH = 100;
export const NOTIFICATION_READ_QUERY_LIMIT = 6_000;
export interface NotificationReadState { readIds: string[] }
export function validNotificationReadId(value: unknown): value is string {
  return typeof value === 'string' && value.length <= 128 && /^[A-Za-z0-9][A-Za-z0-9_:.-]*$/u.test(value);
}
export function notificationReadBatches(ids: Iterable<string>): string[][] {
  const batches: string[][] = [];
  let batch: string[] = [], length = 0;
  for (const id of new Set(ids)) {
    if (!validNotificationReadId(id)) continue;
    const size = encodeURIComponent(id).length + 3;
    if (batch.length >= NOTIFICATION_READ_BATCH || length + size > NOTIFICATION_READ_QUERY_LIMIT) {
      batches.push(batch); batch = []; length = 0;
    }
    batch.push(id); length += size;
  }
  if (batch.length) batches.push(batch);
  return batches;
}
