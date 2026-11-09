import type { CloudflareRequestContext } from '../cloudflare-context';
import type { InternalSession } from '../auth/types';
import { createNotificationReadStateRepository } from '../repositories/notification-read-state-repository';
import { validNotificationReadId } from '../../contracts/notification-read-state';

/** Preserve the installed shared-web GET/PUT contract while unifying new read receipts. */
export async function getNotificationState(context: CloudflareRequestContext, session: InternalSession) {
  const owner = session.userId || session.appUserId;
  const rows = await context.env.DB.prepare(`SELECT item_key, payload FROM notification_state WHERE owner_id = ?
    UNION ALL SELECT 'receipt_ids', json_object('readIds',json_group_array(notification_id)) FROM
      (SELECT notification_id FROM notification_read_receipts WHERE owner_id = ? ORDER BY read_at DESC, notification_id LIMIT 100)`)
    .bind(owner, session.appUserId || owner).all<{ item_key: string; payload: string }>();
  let collapsedDate: string | null = null;
  const readIds = new Set<string>();
  for (const row of rows.results ?? []) {
    try {
      const value = JSON.parse(row.payload);
      if (row.item_key === 'collapsed_date' && typeof value?.collapsedDate === 'string') collapsedDate = value.collapsedDate;
      else if (Array.isArray(value?.readIds)) for (const id of value.readIds) if (validNotificationReadId(id)) readIds.add(id);
    } catch { /* Preserve the legacy tolerance for malformed historical payloads. */ }
  }
  return { collapsedDate, readIds: [...readIds] };
}

export async function saveNotificationState(context: CloudflareRequestContext, session: InternalSession, input: unknown): Promise<void> {
  if (!input || typeof input !== 'object') return;
  const body = input as { collapsedDate?: unknown; readIds?: unknown };
  const owner = session.userId || session.appUserId;
  const statements = [];
  const upsert = (key: string, payload: unknown) => context.env.DB.prepare(`INSERT INTO notification_state (owner_id,item_key,payload,saved_at)
    VALUES(?,?,?,?) ON CONFLICT(owner_id,item_key) DO UPDATE SET payload=excluded.payload,saved_at=excluded.saved_at`)
    .bind(owner, key, JSON.stringify(payload), Date.now());
  if (body.collapsedDate === null || typeof body.collapsedDate === 'string') statements.push(upsert('collapsed_date', { collapsedDate: body.collapsedDate }));
  const ids = Array.isArray(body.readIds) ? body.readIds.filter(validNotificationReadId).slice(-100) : [];
  if (Array.isArray(body.readIds)) statements.push(upsert('read_ids', { readIds: ids }));
  if (statements.length) await context.env.DB.batch(statements);
  if (ids.length) await createNotificationReadStateRepository(context.env).write(session.appUserId || owner, ids, new Date().toISOString());
}
