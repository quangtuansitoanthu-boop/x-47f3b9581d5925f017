import { NOTIFICATION_READ_BATCH, NOTIFICATION_READ_QUERY_LIMIT, validNotificationReadId, type NotificationReadState } from '../../contracts/notification-read-state';
import type { CloudflareRequestContext } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import { createNotificationReadStateRepository } from '../repositories/notification-read-state-repository';

export function createNotificationReadStateService(context: CloudflareRequestContext) {
  const owner = context.principal?.appUserId;
  const repository = createNotificationReadStateRepository(context.env);
  if (!owner) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
  function validate(value: unknown): string[] {
    if (!Array.isArray(value) || value.length > NOTIFICATION_READ_BATCH || !value.every(validNotificationReadId)) {
      throw new ServerInputError(400, 'invalid_notification_ids', 'Danh sách thông báo không hợp lệ.');
    }
    return [...new Set(value)];
  }
  return {
    async read(query: string | null): Promise<NotificationReadState> {
      if (query === null || encodeURIComponent(query).length > NOTIFICATION_READ_QUERY_LIMIT) {
        throw new ServerInputError(400, 'invalid_notification_ids', 'Danh sách thông báo không hợp lệ.');
      }
      const ids = validate(query ? query.split(',') : []);
      if (!ids.length) return { readIds: [] };
      return { readIds: await repository.read(owner, ids) };
    },
    async write(input: unknown): Promise<NotificationReadState> {
      const ids = validate(input && typeof input === 'object' && 'ids' in input ? input.ids : null);
      if (ids.length) await repository.write(owner, ids, new Date().toISOString());
      return { readIds: ids };
    },
  };
}
