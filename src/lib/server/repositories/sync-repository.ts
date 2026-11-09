import type { CloudflareEnvLike, D1ResultRow } from '../cloudflare-context';

export interface UserSyncRow extends D1ResultRow {
  id: string;
  practice_logs: string | null;
  bookmarks: string | null;
  listened_history: string | null;
  updated_at: string;
  pt_player_state: string | null;
  pt_album_positions: string | null;
  pt_recent_albums: string | null;
  pt_favorite_albums: string | null;
  pt_listen_later_albums: string | null;
  sync_revision?: number;
  sync_metadata?: string | null;
}

export interface PlayerSyncRow extends D1ResultRow {
  id: string;
  pt_player_state: string | null;
  pt_album_positions: string | null;
  pt_recent_albums: string | null;
  pt_favorite_albums: string | null;
  pt_listen_later_albums: string | null;
  updated_at: string;
  sync_revision?: number;
  sync_metadata?: string | null;
}

interface SyncWriteValues {
  ptPlayerState: string | null;
  ptAlbumPositions: string | null;
  ptRecentAlbums: string | null;
  ptFavoriteAlbums?: string | null;
  ptListenLaterAlbums?: string | null;
  updatedAt: string;
  syncMetadata: string;
}

interface UserSyncWriteValues extends SyncWriteValues {
  practiceLogs: string;
  bookmarks: string;
  listenedHistory: string;
}

interface AudioLibrarySyncItem extends D1ResultRow {
  item_type: 'favorite' | 'listen_later';
  item_key: string;
  payload: string | null;
  deleted_at: number | null;
}

export function createSyncRepository(env: CloudflareEnvLike) {
  async function withNormalizedAudioLibrary<T extends UserSyncRow | PlayerSyncRow>(
    row: T | null,
    ownerId: string,
  ): Promise<T | null> {
    if (!row) return null;
    const result = await env.DB.prepare(`
      SELECT item_type, item_key, payload, deleted_at
      FROM player_sync_items
      WHERE owner_id = ? AND item_type IN ('favorite', 'listen_later')
      ORDER BY saved_at DESC, item_key
    `).bind(ownerId).all<AudioLibrarySyncItem>();
    const items = result.results ?? [];
    const parsedMetadata = JSON.parse(row.sync_metadata || '{}');
    const metadata = parsedMetadata && typeof parsedMetadata === 'object' && !Array.isArray(parsedMetadata)
      ? parsedMetadata : {};
    const normalized = { ...row };
    // The rollback playback bridge rematerializes snapshot metadata independently
    // of library writes. Membership and deletions therefore come from their
    // normalized owner, whose tombstones survive that compatibility projection.
    for (const [field, type] of [
      ['pt_favorite_albums', 'favorite'],
      ['pt_listen_later_albums', 'listen_later'],
    ] as const) {
      const collection = items.filter((item) => item.item_type === type);
      normalized[field] = `[${collection.filter((item) => item.deleted_at === null && item.payload !== null)
        .map((item) => item.payload).join(',')}]`;
      metadata[field] = Object.fromEntries(collection.filter((item) => item.deleted_at !== null)
        .map((item) => [`albumId:${item.item_key}`, item.deleted_at]));
    }
    normalized.sync_metadata = JSON.stringify(metadata);
    return normalized;
  }

  return {
    async getUserSync(id: string): Promise<UserSyncRow | null> {
      const row = await env.DB.prepare('SELECT * FROM user_sync_data WHERE id = ?').bind(id).first<UserSyncRow>();
      return withNormalizedAudioLibrary(row, id);
    },

    async createUserSync(
      id: string,
      values: UserSyncWriteValues,
    ): Promise<boolean> {
      const result = await env.DB.prepare(`
        INSERT INTO user_sync_data
          (id, practice_logs, bookmarks, listened_history, updated_at,
           pt_player_state, pt_album_positions, pt_recent_albums, pt_favorite_albums, pt_listen_later_albums, sync_revision, sync_metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(id) DO NOTHING
      `).bind(
        id,
        values.practiceLogs,
        values.bookmarks,
        values.listenedHistory,
        values.updatedAt,
        values.ptPlayerState,
        values.ptAlbumPositions,
        values.ptRecentAlbums,
        values.ptFavoriteAlbums ?? '[]',
        values.ptListenLaterAlbums ?? '[]',
        values.syncMetadata,
      ).run();
      return Number(result.meta?.changes || 0) > 0;
    },

    async compareAndSetUserSync(
      id: string,
      expectedRevision: number,
      values: UserSyncWriteValues,
    ): Promise<boolean> {
      const result = await env.DB.prepare(`
        UPDATE user_sync_data
        SET practice_logs = ?, bookmarks = ?, listened_history = ?, updated_at = ?,
            pt_player_state = ?, pt_album_positions = ?, pt_recent_albums = ?, pt_favorite_albums = ?, pt_listen_later_albums = ?,
            sync_revision = ?, sync_metadata = ?
        WHERE id = ? AND sync_revision = ?
      `).bind(
        values.practiceLogs,
        values.bookmarks,
        values.listenedHistory,
        values.updatedAt,
        values.ptPlayerState,
        values.ptAlbumPositions,
        values.ptRecentAlbums,
        values.ptFavoriteAlbums ?? '[]',
        values.ptListenLaterAlbums ?? '[]',
        expectedRevision + 1,
        values.syncMetadata,
        id,
        expectedRevision,
      ).run();
      return Number(result.meta?.changes || 0) > 0;
    },

    async getPlayerSync(id: string): Promise<PlayerSyncRow | null> {
      const row = await env.DB.prepare('SELECT * FROM pt_player_sync WHERE id = ?').bind(id).first<PlayerSyncRow>();
      return id.startsWith('google_') ? withNormalizedAudioLibrary(row, id.slice(7)) : row;
    },

    async createPlayerSync(
      id: string,
      values: SyncWriteValues,
    ): Promise<boolean> {
      const result = await env.DB.prepare(`
        INSERT INTO pt_player_sync
          (id, pt_player_state, pt_album_positions, pt_recent_albums, pt_favorite_albums, pt_listen_later_albums, updated_at, sync_revision, sync_metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)
        ON CONFLICT(id) DO NOTHING
      `).bind(
        id,
        values.ptPlayerState,
        values.ptAlbumPositions,
        values.ptRecentAlbums,
        values.ptFavoriteAlbums ?? '[]',
        values.ptListenLaterAlbums ?? '[]',
        values.updatedAt,
        values.syncMetadata,
      ).run();
      return Number(result.meta?.changes || 0) > 0;
    },

    async compareAndSetPlayerSync(
      id: string,
      expectedRevision: number,
      values: SyncWriteValues,
    ): Promise<boolean> {
      const result = await env.DB.prepare(`
        UPDATE pt_player_sync
        SET pt_player_state = ?, pt_album_positions = ?, pt_recent_albums = ?, pt_favorite_albums = ?, pt_listen_later_albums = ?, updated_at = ?,
            sync_revision = ?, sync_metadata = ?
        WHERE id = ? AND sync_revision = ?
      `).bind(
        values.ptPlayerState,
        values.ptAlbumPositions,
        values.ptRecentAlbums,
        values.ptFavoriteAlbums ?? '[]',
        values.ptListenLaterAlbums ?? '[]',
        values.updatedAt,
        expectedRevision + 1,
        values.syncMetadata,
        id,
        expectedRevision,
      ).run();
      return Number(result.meta?.changes || 0) > 0;
    },
  };
}
