import type { CloudflareEnvLike } from '../cloudflare-context';

export function createNotificationReadStateRepository(env: CloudflareEnvLike) {
  return {
    async read(owner: string, ids: string[]): Promise<string[]> {
      const result = await env.DB.prepare(`SELECT notification_id FROM notification_read_receipts
        WHERE owner_id = ? AND notification_id IN (SELECT value FROM json_each(?))
        UNION SELECT j.value AS notification_id FROM notification_state s, json_each(s.payload, '$.readIds') j
        WHERE s.owner_id = ? AND s.item_key = 'read_ids' AND j.value IN (SELECT value FROM json_each(?))`)
        .bind(owner, JSON.stringify(ids), owner, JSON.stringify(ids)).all<{ notification_id: string }>();
      return (result.results ?? []).map(row => row.notification_id);
    },
    async write(owner: string, ids: string[], now: string): Promise<void> {
      await env.DB.prepare(`INSERT INTO notification_read_receipts (owner_id, notification_id, read_at)
        SELECT ?, value, ? FROM json_each(?) WHERE 1
        ON CONFLICT(owner_id, notification_id) DO NOTHING`)
        .bind(owner, now, JSON.stringify(ids)).run();
    },
  };
}
