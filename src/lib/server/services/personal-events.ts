import type { CloudflareEnvLike } from '../cloudflare-context';
import { ServerInputError } from '../errors';

export async function readPersonalEvents(env: CloudflareEnvLike, owner: string) {
  const row = await env.DB.prepare('SELECT sync_metadata FROM user_sync_data WHERE id = ?').bind(owner).first<{ sync_metadata: string | null }>();
  return decode(row?.sync_metadata);
}

export async function writePersonalEvents(env: CloudflareEnvLike, owner: string, input: Record<string, unknown>) {
  if (input.ownerId !== undefined && input.ownerId !== owner) throw new ServerInputError(403, 'personal_events_owner_changed', 'Tài khoản đã thay đổi. Vui lòng thử lại.');
  if (!Array.isArray(input.events) || input.events.length > 250) throw new ServerInputError(400, 'invalid_events', 'Danh sách ngày lễ không hợp lệ.');
  const ids = new Set<string>();
  for (const event of input.events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) throw invalidEvent();
    const item = event as Record<string, unknown>;
    if (typeof item.id !== 'string' || !item.id || item.id.length > 128 || ids.has(item.id) ||
        // Cài đặt cho phép ngày lễ chỉ có loại, chưa đặt tên riêng; giữ dữ liệu của app đã cài.
        typeof item.title !== 'string' || item.title.length > 500 ||
        !integer(item.lunarDay, 1, 30) || !integer(item.lunarMonth, 0, 12) ||
        (item.calendarMode !== undefined && !['lunar', 'solar'].includes(String(item.calendarMode))) ||
        (item.calendarMode === 'solar' && (!integer(item.solarDay, 1, 31) || !integer(item.solarMonth, 1, 12)))) throw invalidEvent();
    ids.add(item.id);
  }
  const revision = input.revision;
  if (revision !== undefined && (!Number.isSafeInteger(revision) || Number(revision) < 0)) throw invalidEvent();
  const expected = revision === undefined ? null : Number(revision);
  const eventsJson = JSON.stringify(input.events);
  if (new TextEncoder().encode(eventsJson).byteLength > 90_000) throw new ServerInputError(413, 'payload_too_large', 'Danh sách ngày lễ vượt giới hạn.');
  const now = new Date().toISOString();
  const initial = JSON.stringify({ personal_lunar_events: input.events, personal_events_updated_at: now, personal_events_revision: 1 });
  // One atomic write preserves all other metadata and invalidates concurrent
  // ordinary sync CAS writes. The personal revision catches stale devices.
  const result = await env.DB.prepare(`
    INSERT INTO user_sync_data (id, sync_metadata, updated_at, sync_revision)
    SELECT ?, ?, ?, 1 WHERE ? IS NULL OR ? = 0 OR EXISTS (SELECT 1 FROM user_sync_data WHERE id = ?)
    ON CONFLICT(id) DO UPDATE SET
      sync_metadata = json_set(COALESCE(user_sync_data.sync_metadata, '{}'),
        '$.personal_lunar_events', json(?), '$.personal_events_updated_at', ?,
        '$.personal_events_revision', COALESCE(json_extract(user_sync_data.sync_metadata, '$.personal_events_revision'), 0) + 1),
      updated_at = excluded.updated_at, sync_revision = user_sync_data.sync_revision + 1
    WHERE ? IS NULL OR COALESCE(json_extract(user_sync_data.sync_metadata, '$.personal_events_revision'), 0) = ?
    RETURNING sync_metadata
  `).bind(owner, initial, now, expected, expected, owner, eventsJson, now, expected, expected).first<{ sync_metadata: string }>();
  if (!result) throw new ServerInputError(409, 'personal_events_conflict', 'Ngày lễ đã thay đổi trên thiết bị khác. Dữ liệu trên máy vẫn được giữ để đối chiếu.');
  const saved = decode(result.sync_metadata);
  return { ok: true, count: saved.events.length, revision: saved.revision };
}

function decode(raw?: string | null): { events: unknown[]; revision: number } {
  if (!raw) return { events: [], revision: 0 };
  const metadata = JSON.parse(raw);
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata) ||
      (metadata.personal_lunar_events !== undefined && !Array.isArray(metadata.personal_lunar_events))) {
    throw new ServerInputError(500, 'personal_events_invalid_storage', 'Không thể đọc dữ liệu ngày lễ.');
  }
  return { events: metadata.personal_lunar_events || [], revision: Number.isSafeInteger(metadata.personal_events_revision) ? metadata.personal_events_revision : 0 };
}
function integer(value: unknown, min: number, max: number): boolean { return Number.isInteger(value) && Number(value) >= min && Number(value) <= max; }
function invalidEvent() { return new ServerInputError(400, 'invalid_event', 'Thông tin ngày lễ không hợp lệ.'); }
