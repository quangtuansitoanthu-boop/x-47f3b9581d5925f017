import type { CloudflareRequestContext } from '../cloudflare-context';
import { ServerInputError } from '../errors';
import { createSyncRepository } from '../repositories/sync-repository';

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue };

interface SyncEnvelope {
  id?: string;
  practice_logs?: JsonValue[];
  bookmarks?: JsonValue[];
  listened_history?: JsonValue[];
  updated_at?: string;
  pt_player_state?: JsonValue | null;
  pt_album_positions?: Record<string, JsonValue> | null;
  pt_recent_albums?: JsonValue[];
  pt_favorite_albums?: JsonValue[];
  pt_listen_later_albums?: JsonValue[];
  sync_tombstones?: Partial<Record<'practice_logs' | 'bookmarks' | 'listened_history' | 'pt_recent_albums' | 'pt_favorite_albums' | 'pt_listen_later_albums', JsonValue[]>>
    & { pt_album_positions?: Array<string | JsonValue>; pt_player_state?: JsonValue | boolean | null };
}

interface MergedSyncEnvelope extends SyncEnvelope {
  practice_logs: JsonValue[];
  bookmarks: JsonValue[];
  listened_history: JsonValue[];
  updated_at: string;
  pt_player_state: JsonValue | null;
  pt_album_positions: Record<string, JsonValue>;
  pt_recent_albums: JsonValue[];
  pt_favorite_albums: JsonValue[];
  pt_listen_later_albums: JsonValue[];
  sync_tombstones?: never;
}

interface SyncMetadata {
  practice_logs?: Record<string, number>;
  bookmarks?: Record<string, number>;
  listened_history?: Record<string, number>;
  pt_recent_albums?: Record<string, number>;
  pt_favorite_albums?: Record<string, number>;
  pt_listen_later_albums?: Record<string, number>;
  pt_album_positions?: Record<string, number>;
  pt_player_state_deleted_at?: number;
}

interface StoredSyncRecord {
  envelope: SyncEnvelope | null;
  revision: number;
  metadata: SyncMetadata;
}

type SyncRepository = ReturnType<typeof createSyncRepository>;

export function createSyncService(
  context: CloudflareRequestContext,
  dependencies: { repository?: SyncRepository } = {},
) {
  const repository = dependencies.repository ?? createSyncRepository(context.env);

  return {
    async getUserSync() {
      const appUserId = context.principal?.appUserId;
      if (!appUserId) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
      const record = parseStoredSyncRow(await repository.getUserSync(appUserId));
      return materializeSyncResponse(record.envelope, record.metadata);
    },

    async putUserSync(input: SyncEnvelope) {
      const appUserId = context.principal?.appUserId;
      if (!appUserId) throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
      if (context.env.AUTOMATIC_PRACTICE_ENABLED === 'true' && (
        Object.prototype.hasOwnProperty.call(input, 'practice_logs')
        || (input.sync_tombstones?.practice_logs?.length ?? 0) > 0
      )) {
        throw new ServerInputError(409, 'legacy_practice_write_disabled', 'Nhật ký tu tập được ghi qua hệ thống phiên tự động.');
      }
      return persistUserSync(repository, appUserId, input);
    },

    async getPlayerSync() {
      ensurePlayerOwner(context);
      const id = playerOwnerId(context.principal);
      const record = parseStoredSyncRow(await repository.getPlayerSync(id));
      if (record.envelope) return materializeSyncResponse(record.envelope, record.metadata);
      // Google users may only have legacy playback fields in user_sync_data.
      // Read them once as a compatibility fallback; subsequent saves use the
      // dedicated pt_player_sync owner exclusively.
      const appUserId = context.principal?.appUserId;
      if (!appUserId) return null;
      const legacyRecord = parseStoredSyncRow(await repository.getUserSync(appUserId));
      if (!legacyRecord.envelope) return null;
      await repository.createPlayerSync(id, {
        ptPlayerState: encodeJsonNullable(legacyRecord.envelope.pt_player_state, 'pt_player_state'),
        ptAlbumPositions: encodeJsonObject(legacyRecord.envelope.pt_album_positions, 'pt_album_positions'),
        ptRecentAlbums: encodeJsonArray(legacyRecord.envelope.pt_recent_albums, 'pt_recent_albums'),
        ptFavoriteAlbums: encodeJsonArray(legacyRecord.envelope.pt_favorite_albums, 'pt_favorite_albums'),
        ptListenLaterAlbums: encodeJsonArray(legacyRecord.envelope.pt_listen_later_albums, 'pt_listen_later_albums'),
        updatedAt: legacyRecord.envelope.updated_at || new Date().toISOString(),
        syncMetadata: encodeSyncMetadata(legacyRecord.metadata),
      });
      const seeded = parseStoredSyncRow(await repository.getPlayerSync(id));
      return materializeSyncResponse(seeded.envelope, seeded.metadata);
    },

    async putPlayerSync(input: SyncEnvelope) {
      ensurePlayerOwner(context);
      const id = playerOwnerId(context.principal);
      return persistPlayerSync(repository, id, input);
    },
  };
}

async function persistUserSync(repository: SyncRepository, id: string, input: SyncEnvelope) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = parseStoredSyncRow(await repository.getUserSync(id));
    const merged = mergeUserSync(current.envelope, input, current.metadata);
    const success = current.envelope
      ? await repository.compareAndSetUserSync(id, current.revision, {
        practiceLogs: encodeJsonArray(merged.practice_logs, 'practice_logs'),
        bookmarks: encodeJsonArray(merged.bookmarks, 'bookmarks'),
        listenedHistory: encodeJsonArray(merged.listened_history, 'listened_history'),
        updatedAt: merged.updated_at,
        ptPlayerState: encodeJsonNullable(merged.pt_player_state, 'pt_player_state'),
        ptAlbumPositions: encodeJsonNullable(merged.pt_album_positions, 'pt_album_positions'),
        ptRecentAlbums: encodeJsonArray(merged.pt_recent_albums, 'pt_recent_albums'),
        ptFavoriteAlbums: encodeJsonArray(merged.pt_favorite_albums, 'pt_favorite_albums'),
        ptListenLaterAlbums: encodeJsonArray(merged.pt_listen_later_albums, 'pt_listen_later_albums'),
        syncMetadata: encodeSyncMetadata(merged.metadata),
      })
      : await repository.createUserSync(id, {
        practiceLogs: encodeJsonArray(merged.practice_logs, 'practice_logs'),
        bookmarks: encodeJsonArray(merged.bookmarks, 'bookmarks'),
        listenedHistory: encodeJsonArray(merged.listened_history, 'listened_history'),
        updatedAt: merged.updated_at,
        ptPlayerState: encodeJsonNullable(merged.pt_player_state, 'pt_player_state'),
        ptAlbumPositions: encodeJsonNullable(merged.pt_album_positions, 'pt_album_positions'),
        ptRecentAlbums: encodeJsonArray(merged.pt_recent_albums, 'pt_recent_albums'),
        ptFavoriteAlbums: encodeJsonArray(merged.pt_favorite_albums, 'pt_favorite_albums'),
        ptListenLaterAlbums: encodeJsonArray(merged.pt_listen_later_albums, 'pt_listen_later_albums'),
        syncMetadata: encodeSyncMetadata(merged.metadata),
      });
    if (success) return { id, ...stripSyncMetadata(merged) };
  }
  throw new ServerInputError(409, 'sync_conflict', 'Không thể đồng bộ dữ liệu. Vui lòng thử lại.');
}

async function persistPlayerSync(repository: SyncRepository, id: string, input: SyncEnvelope) {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const current = parseStoredSyncRow(await repository.getPlayerSync(id));
    const merged = mergePlayerSync(current.envelope, input, current.metadata);
    const success = current.envelope
      ? await repository.compareAndSetPlayerSync(id, current.revision, {
        ptPlayerState: encodeJsonNullable(merged.pt_player_state, 'pt_player_state'),
        ptAlbumPositions: encodeJsonObject(merged.pt_album_positions, 'pt_album_positions'),
        ptRecentAlbums: encodeJsonArray(merged.pt_recent_albums, 'pt_recent_albums'),
        ptFavoriteAlbums: encodeJsonArray(merged.pt_favorite_albums, 'pt_favorite_albums'),
        ptListenLaterAlbums: encodeJsonArray(merged.pt_listen_later_albums, 'pt_listen_later_albums'),
        updatedAt: merged.updated_at,
        syncMetadata: encodeSyncMetadata(merged.metadata),
      })
      : await repository.createPlayerSync(id, {
        ptPlayerState: encodeJsonNullable(merged.pt_player_state, 'pt_player_state'),
        ptAlbumPositions: encodeJsonObject(merged.pt_album_positions, 'pt_album_positions'),
        ptRecentAlbums: encodeJsonArray(merged.pt_recent_albums, 'pt_recent_albums'),
        ptFavoriteAlbums: encodeJsonArray(merged.pt_favorite_albums, 'pt_favorite_albums'),
        ptListenLaterAlbums: encodeJsonArray(merged.pt_listen_later_albums, 'pt_listen_later_albums'),
        updatedAt: merged.updated_at,
        syncMetadata: encodeSyncMetadata(merged.metadata),
      });
    if (success) return { id, ...stripSyncMetadata(merged) };
  }
  throw new ServerInputError(409, 'sync_conflict', 'Không thể đồng bộ dữ liệu. Vui lòng thử lại.');
}

function ensurePlayerOwner(context: CloudflareRequestContext): void {
  const role = context.principal?.role ?? 'guest';
  if (role === 'guest' || (!context.principal?.appUserId && !context.principal?.displayName)) {
    throw new ServerInputError(401, 'authentication_required', 'Cần đăng nhập.');
  }
}

function parseStoredSyncRow(row: Record<string, unknown> | null): StoredSyncRecord {
  if (!row) return { envelope: null, revision: 0, metadata: {} };
  const result: SyncEnvelope = { ...row } as SyncEnvelope;
  for (const field of [
    'practice_logs',
    'bookmarks',
    'listened_history',
    'pt_player_state',
    'pt_album_positions',
    'pt_recent_albums',
    'pt_favorite_albums',
    'pt_listen_later_albums',
  ]) {
    const value = row[field];
    if (typeof value !== 'string') continue;
    try {
      (result as Record<string, unknown>)[field] = JSON.parse(value);
    } catch {
      (result as Record<string, unknown>)[field] = null;
      }
  }
  delete (result as Record<string, unknown>).sync_revision;
  delete (result as Record<string, unknown>).sync_metadata;
  return {
    envelope: result,
    revision: normalizeRevision(row.sync_revision),
    metadata: parseSyncMetadata(row.sync_metadata),
  };
}

function mergeUserSync(existing: SyncEnvelope | null, incoming: SyncEnvelope, metadata: SyncMetadata): MergedSyncEnvelope & { metadata: SyncMetadata } {
  const updatedAt = latestTimestamp(existing?.updated_at, incoming.updated_at);
  const nextMetadata = mergeSyncMetadata(metadata, incoming.sync_tombstones, new Date().toISOString());
  return {
    practice_logs: mergeArrayField(existing?.practice_logs, incoming.practice_logs, nextMetadata.practice_logs),
    bookmarks: mergeArrayField(existing?.bookmarks, incoming.bookmarks, nextMetadata.bookmarks),
    listened_history: mergeArrayField(existing?.listened_history, incoming.listened_history, nextMetadata.listened_history),
    pt_player_state: mergePlayerState(existing?.pt_player_state, incoming.pt_player_state, nextMetadata),
    pt_album_positions: mergeAlbumPositions(existing?.pt_album_positions, incoming.pt_album_positions, nextMetadata.pt_album_positions),
    pt_recent_albums: mergeRecentAlbums(existing?.pt_recent_albums, incoming.pt_recent_albums, nextMetadata.pt_recent_albums),
    pt_favorite_albums: mergeArrayField(existing?.pt_favorite_albums, incoming.pt_favorite_albums, nextMetadata.pt_favorite_albums),
    pt_listen_later_albums: mergeArrayField(existing?.pt_listen_later_albums, incoming.pt_listen_later_albums, nextMetadata.pt_listen_later_albums),
    updated_at: updatedAt,
    metadata: pruneSyncMetadata(nextMetadata, {
      practice_logs: existing?.practice_logs,
      bookmarks: existing?.bookmarks,
      listened_history: existing?.listened_history,
      pt_player_state: existing?.pt_player_state,
      pt_album_positions: existing?.pt_album_positions,
      pt_recent_albums: existing?.pt_recent_albums,
      pt_favorite_albums: existing?.pt_favorite_albums,
      pt_listen_later_albums: existing?.pt_listen_later_albums,
    }, incoming),
  };
}

function mergePlayerSync(existing: SyncEnvelope | null, incoming: SyncEnvelope, metadata: SyncMetadata): MergedSyncEnvelope & { metadata: SyncMetadata } {
  const updatedAt = latestTimestamp(existing?.updated_at, incoming.updated_at);
  const nextMetadata = mergeSyncMetadata(metadata, incoming.sync_tombstones, new Date().toISOString());
  return {
    practice_logs: normalizeArray(existing?.practice_logs),
    bookmarks: normalizeArray(existing?.bookmarks),
    listened_history: normalizeArray(existing?.listened_history),
    pt_player_state: mergePlayerState(existing?.pt_player_state, incoming.pt_player_state, nextMetadata),
    pt_album_positions: mergeAlbumPositions(existing?.pt_album_positions, incoming.pt_album_positions, nextMetadata.pt_album_positions),
    pt_recent_albums: mergeRecentAlbums(existing?.pt_recent_albums, incoming.pt_recent_albums, nextMetadata.pt_recent_albums),
    pt_favorite_albums: mergeArrayField(existing?.pt_favorite_albums, incoming.pt_favorite_albums, nextMetadata.pt_favorite_albums),
    pt_listen_later_albums: mergeArrayField(existing?.pt_listen_later_albums, incoming.pt_listen_later_albums, nextMetadata.pt_listen_later_albums),
    updated_at: updatedAt,
    metadata: pruneSyncMetadata(nextMetadata, {
      pt_player_state: existing?.pt_player_state,
      pt_album_positions: existing?.pt_album_positions,
      pt_recent_albums: existing?.pt_recent_albums,
      pt_favorite_albums: existing?.pt_favorite_albums,
      pt_listen_later_albums: existing?.pt_listen_later_albums,
    }, incoming),
  };
}

function mergeArrayField(
  existing: JsonValue[] | undefined,
  incoming: JsonValue[] | undefined,
  tombstones: Record<string, number> | undefined,
): JsonValue[] {
  if (!incoming) {
    return normalizeArray(existing)
      .filter((item) => survivesTombstone(item, tombstones))
      .sort((left, right) => itemTimestamp(right) - itemTimestamp(left));
  }
  const merged = new Map<string, JsonValue>();
  for (const item of normalizeArray(existing)) merged.set(itemKey(item), item);
  for (const item of normalizeArray(incoming)) {
    const key = itemKey(item);
    const previous = merged.get(key);
    merged.set(key, pickNewestObject(previous ?? null, item) ?? item);
  }
  return [...merged.values()]
    .filter((item) => survivesTombstone(item, tombstones))
    .sort((left, right) => itemTimestamp(right) - itemTimestamp(left));
}

function mergeRecentAlbums(
  existing: JsonValue[] | undefined,
  incoming: JsonValue[] | undefined,
  tombstones: Record<string, number> | undefined,
): JsonValue[] {
  const seen = new Set<string>();
  const merged: JsonValue[] = [];
  for (const item of [...normalizeArray(incoming), ...normalizeArray(existing)]) {
    const key = itemKey(item);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged
    .filter((item) => survivesTombstone(item, tombstones))
    .sort((left, right) => itemTimestamp(right) - itemTimestamp(left));
}

function mergeAlbumPositions(
  existing: Record<string, JsonValue> | null | undefined,
  incoming: Record<string, JsonValue> | null | undefined,
  tombstones: Record<string, number> | undefined,
): Record<string, JsonValue> {
  const merged: Record<string, JsonValue> = {};
  for (const [albumId, value] of Object.entries(existing || {})) merged[albumId] = value;
  for (const [albumId, value] of Object.entries(incoming || {})) {
    merged[albumId] = pickNewestObject(merged[albumId] ?? null, value) ?? value;
  }
  return Object.fromEntries(Object.entries(merged).filter(([albumId, value]) => {
    const deletedAt = tombstones?.[albumId] ?? tombstones?.[`albumId:${albumId}`] ?? 0;
    return itemTimestamp(value) > deletedAt;
  }));
}

function mergePlayerState(
  existing: JsonValue | null | undefined,
  incoming: JsonValue | null | undefined,
  metadata: SyncMetadata,
): JsonValue | null {
  const merged = pickNewestObject(existing, incoming);
  const deletedAt = metadata.pt_player_state_deleted_at ?? 0;
  return deletedAt > 0 && itemTimestamp(merged) <= deletedAt ? null : merged;
}

function pickNewestObject(existing: JsonValue | null | undefined, incoming: JsonValue | null | undefined): JsonValue | null {
  if (incoming == null) return existing ?? null;
  if (existing == null) return incoming;
  const incomingTs = itemTimestamp(incoming);
  const existingTs = itemTimestamp(existing);
  if (incomingTs > existingTs) return incoming;
  if (incomingTs < existingTs) return existing;
  return stableCanonicalize(incoming) >= stableCanonicalize(existing) ? incoming : existing;
}

function itemKey(value: JsonValue): string {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, JsonValue>;
    if (typeof record.key === 'string' || typeof record.key === 'number') {
      return String(record.key);
    }
    for (const field of ['id', 'articleId', 'albumId', 'slug', 'date', 'savedAt']) {
      if (typeof record[field] === 'string' || typeof record[field] === 'number') {
        return `${field}:${record[field]}`;
      }
    }
  }
  return stableCanonicalize(value);
}

function itemTimestamp(value: JsonValue): number {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    const record = value as Record<string, JsonValue>;
    for (const field of ['savedAt', 'updated_at', 'updatedAt', 'date', 'tao_luc']) {
      const timestamp = parseTimestamp(record[field]);
      if (timestamp > 0) return timestamp;
    }
  }
  return 0;
}

function parseTimestamp(value: JsonValue | undefined): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
    const numeric = Number(value);
    if (Number.isFinite(numeric)) return numeric;
  }
  return 0;
}

function latestTimestamp(left?: string, right?: string): string {
  const leftValue = left ? Date.parse(left) : 0;
  const rightValue = right ? Date.parse(right) : 0;
  return new Date(Math.max(leftValue, rightValue, Date.now())).toISOString();
}

function normalizeArray(value: JsonValue[] | undefined): JsonValue[] {
  return Array.isArray(value) ? value : [];
}

function encodeJsonArray(value: JsonValue[] | undefined, field: string): string {
  return encodeJson(normalizeArray(value), field);
}

function encodeJsonObject(value: Record<string, JsonValue> | null | undefined, field: string): string {
  return encodeJson(value && typeof value === 'object' ? value : {}, field);
}

function encodeJsonNullable(value: JsonValue | null | undefined, field: string): string | null {
  return value == null ? null : encodeJson(value, field);
}

function encodeJson(value: JsonValue, field: string): string {
  try {
    const encoded = JSON.stringify(value);
    if (encoded.length > 500_000) throw new Error();
    return encoded;
  } catch {
    throw new ServerInputError(400, 'invalid_field', `${field} không hợp lệ.`);
  }
}

function stableCanonicalize(value: JsonValue): string {
  if (Array.isArray(value)) return `[${value.map((entry) => stableCanonicalize(entry)).join(',')}]`;
  if (value && typeof value === 'object') {
    const entries = Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, entry]) => `${JSON.stringify(key)}:${stableCanonicalize(entry)}`);
    return `{${entries.join(',')}}`;
  }
  return JSON.stringify(value);
}

function parseSyncMetadata(value: unknown): SyncMetadata {
  if (typeof value !== 'string') return {};
  try {
    const parsed = JSON.parse(value) as SyncMetadata;
    return typeof parsed === 'object' && parsed ? parsed : {};
  } catch {
    return {};
  }
}

function encodeSyncMetadata(value: SyncMetadata): string {
  return JSON.stringify(value);
}

function normalizeRevision(value: unknown): number {
  return Number.isSafeInteger(value) && Number(value) >= 0 ? Number(value) : 0;
}

function mergeSyncMetadata(
  current: SyncMetadata,
  incoming: SyncEnvelope['sync_tombstones'],
  fallbackTimestamp: string,
): SyncMetadata {
  const merged: SyncMetadata = {
    // Other features share this record. Their namespaces must survive sync.
    ...current,
    practice_logs: { ...(current.practice_logs || {}) },
    bookmarks: { ...(current.bookmarks || {}) },
    listened_history: { ...(current.listened_history || {}) },
    pt_recent_albums: { ...(current.pt_recent_albums || {}) },
    pt_favorite_albums: { ...(current.pt_favorite_albums || {}) },
    pt_listen_later_albums: { ...(current.pt_listen_later_albums || {}) },
    pt_album_positions: { ...(current.pt_album_positions || {}) },
    ...(current.pt_player_state_deleted_at ? { pt_player_state_deleted_at: current.pt_player_state_deleted_at } : {}),
  };
  if (!incoming) return merged;
  for (const field of ['practice_logs', 'bookmarks', 'listened_history', 'pt_recent_albums', 'pt_favorite_albums', 'pt_listen_later_albums'] as const) {
    merged[field] = mergeDeletionMap(merged[field], incoming[field], fallbackTimestamp);
  }
  merged.pt_album_positions = mergeDeletionMap(merged.pt_album_positions, incoming.pt_album_positions, fallbackTimestamp);
  const playerDeleteTs = parseDeletionValue(incoming.pt_player_state, fallbackTimestamp);
  if (playerDeleteTs > (merged.pt_player_state_deleted_at ?? 0)) {
    merged.pt_player_state_deleted_at = playerDeleteTs;
  }
  return merged;
}

function mergeDeletionMap(
  current: Record<string, number> | undefined,
  incoming: JsonValue[] | Array<string | JsonValue> | undefined,
  fallbackTimestamp: string,
): Record<string, number> | undefined {
  const output = { ...(current || {}) };
  for (const entry of incoming || []) {
    const key = itemKey(entry as JsonValue);
    if (!key) continue;
    const deletedAt = parseDeletionValue(entry, fallbackTimestamp);
    if (deletedAt > (output[key] ?? 0)) output[key] = deletedAt;
  }
  return Object.keys(output).length ? output : undefined;
}

function parseDeletionValue(value: unknown, fallbackTimestamp: string): number {
  if (value === undefined || value === null || value === false) return 0;
  // Client clocks are not trusted for deletion ordering. Recording receipt time
  // prevents a future-dated device from suppressing legitimate data forever.
  return parseTimestamp(fallbackTimestamp);
}

function survivesTombstone(value: JsonValue, tombstones: Record<string, number> | undefined): boolean {
  if (!tombstones) return true;
  return itemTimestamp(value) > (tombstones[itemKey(value)] ?? 0);
}

function pruneSyncMetadata(
  metadata: SyncMetadata,
  _existing: Partial<SyncEnvelope>,
  incoming: SyncEnvelope,
): SyncMetadata {
  const next = {
    ...metadata,
    practice_logs: pruneDeletionMap(metadata.practice_logs, incoming.practice_logs),
    bookmarks: pruneDeletionMap(metadata.bookmarks, incoming.bookmarks),
    listened_history: pruneDeletionMap(metadata.listened_history, incoming.listened_history),
    pt_recent_albums: pruneDeletionMap(metadata.pt_recent_albums, incoming.pt_recent_albums),
    pt_favorite_albums: pruneDeletionMap(metadata.pt_favorite_albums, incoming.pt_favorite_albums),
    pt_listen_later_albums: pruneDeletionMap(metadata.pt_listen_later_albums, incoming.pt_listen_later_albums),
    pt_album_positions: pruneDeletionMap(metadata.pt_album_positions, incoming.pt_album_positions ? Object.values(incoming.pt_album_positions) : undefined),
  };
  if (next.pt_player_state_deleted_at && itemTimestamp(incoming.pt_player_state ?? null) > next.pt_player_state_deleted_at) {
    delete next.pt_player_state_deleted_at;
  }
  return next;
}

function pruneDeletionMap(
  tombstones: Record<string, number> | undefined,
  incoming: JsonValue[] | Array<JsonValue> | undefined,
): Record<string, number> | undefined {
  if (!tombstones) return undefined;
  const output = { ...tombstones };
  for (const item of incoming || []) {
    const key = itemKey(item);
    if (itemTimestamp(item) > (output[key] ?? 0)) delete output[key];
  }
  return Object.keys(output).length ? output : undefined;
}

function stripSyncMetadata(merged: MergedSyncEnvelope & { metadata: SyncMetadata }) {
  return materializeSyncResponse(merged, merged.metadata);
}

function materializeSyncResponse(
  envelope: SyncEnvelope | null,
  metadata: SyncMetadata,
): SyncEnvelope | null {
  if (!envelope) return null;
  const tombstones = serializeSyncTombstones(metadata);
  return tombstones ? { ...envelope, sync_tombstones: tombstones } : { ...envelope };
}

function serializeSyncTombstones(metadata: SyncMetadata): SyncEnvelope['sync_tombstones'] | undefined {
  const tombstones = {
    practice_logs: serializeDeletionEntries(metadata.practice_logs),
    bookmarks: serializeDeletionEntries(metadata.bookmarks),
    listened_history: serializeDeletionEntries(metadata.listened_history),
    pt_recent_albums: serializeDeletionEntries(metadata.pt_recent_albums),
    pt_favorite_albums: serializeDeletionEntries(metadata.pt_favorite_albums),
    pt_listen_later_albums: serializeDeletionEntries(metadata.pt_listen_later_albums),
    pt_album_positions: serializeDeletionEntries(metadata.pt_album_positions),
    pt_player_state: metadata.pt_player_state_deleted_at
      ? { deletedAt: serializeDeletionTimestamp(metadata.pt_player_state_deleted_at) }
      : undefined,
  };
  return Object.values(tombstones).some((value) => Array.isArray(value) ? value.length > 0 : Boolean(value))
    ? tombstones
    : undefined;
}

function serializeDeletionEntries(map: Record<string, number> | undefined): JsonValue[] | undefined {
  if (!map || !Object.keys(map).length) return undefined;
  return Object.entries(map).map(([key, deletedAt]) => ({
    key,
    deletedAt: serializeDeletionTimestamp(deletedAt),
  }));
}

function serializeDeletionTimestamp(value: number): string | number {
  return value > 0 ? new Date(value).toISOString() : value;
}

function playerOwnerId(principal: CloudflareRequestContext['principal']): string {
  if (principal?.appUserId) return `google_${principal.appUserId}`;
  const username = String(principal?.displayName || '').normalize('NFKC').trim().toLocaleLowerCase('vi');
  return `local_${username}`;
}
