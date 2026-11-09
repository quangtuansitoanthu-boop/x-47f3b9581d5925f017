import type { CloudflareRequestContext } from '../cloudflare-context';
import { tableDefinition, serializeRows, type QueryOptions } from '../domain/data-contract';
import { ServerInputError } from '../errors';
import { createDataRepository } from '../repositories/data-repository';
import { createTalksRepository } from '../repositories/talks-repository';
import { createGoogleDriveIntegration, GoogleDriveError } from '../integrations/google-drive';
import { assertNoNewArchiveTrackUrls } from './talk-track-policy';
import { isOnlineOnlyAudioAlbum } from '../../domain/online-only-policy';

export function createTalksService(context: CloudflareRequestContext) {
  const dataRepository = createDataRepository(context.env);
  const talksRepository = createTalksRepository(context.env);
  const drive = createGoogleDriveIntegration(context.env);

  return {
    async readAlbumDownloadSize(rawAlbumId: string) {
      let albumId: string;
      try {
        albumId = decodeURIComponent(rawAlbumId);
      } catch {
        throw new ServerInputError(404, 'audio_not_found', 'Album không tồn tại.');
      }
      if (!albumId || albumId.length > 200) {
        throw new ServerInputError(404, 'audio_not_found', 'Album không tồn tại.');
      }
      const rows = await talksRepository.readAlbumDownloadSizes(
        albumId,
        String(context.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '').trim(),
        canReadPrivateTalks(context.principal?.role),
      );
      const album = rows[0];
      if (!album) throw new ServerInputError(404, 'audio_not_found', 'Album không tồn tại.');
      if (isOnlineOnlyAudioAlbum(album.tieu_de, album.dien_gia)) {
        throw new ServerInputError(403, 'audio_online_only', 'Album này chỉ được nghe trực tuyến.');
      }
      if (rows.length > 500) {
        throw new ServerInputError(502, 'audio_metadata_invalid', 'Không thể xác định dung lượng album.');
      }
      return {
        albumId,
        tracks: rows.flatMap(row => row.drive_file_id ? [{
          url: `/api/audio/drive/${encodeURIComponent(row.drive_file_id)}`,
          bytes: Number.isSafeInteger(row.byte_size) && row.byte_size! >= 0 ? row.byte_size : null,
        }] : []),
      };
    },

    async selectTable(options: QueryOptions) {
      const definition = tableDefinition('phap_thoai');
      const rows = await dataRepository.select('phap_thoai', options, context.principal);
      return serializeRows(rows, definition, context.env);
    },

    async insertTable(payload: Record<string, unknown> | Array<Record<string, unknown>>, onConflict?: string | null) {
      authorizeTalkWrite(context, 'POST');
      assertNoNewArchiveTrackUrls(payload);
      const definition = tableDefinition('phap_thoai');
      const rows = await dataRepository.insert('phap_thoai', payload, context.principal, onConflict);
      return serializeRows(rows, definition, context.env);
    },

    async updateTable(payload: Record<string, unknown>, filters: Record<string, string | null | undefined>) {
      authorizeTalkWrite(context, 'PATCH');
      const current = await currentTalkPolicyState(dataRepository, context, filters);
      assertNoNewArchiveTrackUrls(payload, current.tracks, current.archiveIds);
      await dataRepository.update('phap_thoai', payload, context.principal, filters);
      return [];
    },

    async deleteTable(filters: Record<string, string | null | undefined>) {
      authorizeTalkWrite(context, 'DELETE');
      await dataRepository.delete('phap_thoai', context.principal, filters);
      return [];
    },

    async getGoogleDriveAudio(rawFileId: string, request: Request, dependencies: {
      accessToken?: string;
      fetchImpl?: typeof fetch;
    } = {}) {
      let fileId: string;
      try {
        fileId = decodeURIComponent(rawFileId);
      } catch {
        throw new ServerInputError(404, 'audio_not_found', 'Tệp âm thanh không tồn tại.');
      }
      if (!/^[A-Za-z0-9_-]{5,200}$/u.test(fileId)) {
        throw new ServerInputError(404, 'audio_not_found', 'Tệp âm thanh không tồn tại.');
      }
      const rootFolderId = String(context.env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '').trim();
      const catalog = await talksRepository.findDriveCatalog(fileId, rootFolderId);
      if (!catalog) throw new ServerInputError(404, 'audio_not_found', 'Tệp âm thanh không tồn tại.');
      if (catalog.visibility !== 'public' && !canReadPrivateTalks(context.principal?.role)) {
        throw new ServerInputError(404, 'audio_not_found', 'Tệp âm thanh không tồn tại.');
      }
      try {
        const upstream = await drive.fetchAudio(fileId, request, dependencies);
        return forwardAudioResponse(request, upstream, catalog.visibility === 'public');
      } catch (error) {
        if (error instanceof GoogleDriveError) {
          throw new ServerInputError(error.status, error.code, error.message);
        }
        throw error;
      }
    },
  };
}

async function currentTalkPolicyState(
  dataRepository: ReturnType<typeof createDataRepository>,
  context: CloudflareRequestContext,
  filters: Record<string, string | null | undefined>,
): Promise<{ tracks: Map<string, unknown[]>; archiveIds: Map<string, string> }> {
  const talkId = filters.id?.startsWith('eq.') ? filters.id.slice(3) : null;
  if (!talkId) return { tracks: new Map(), archiveIds: new Map() };
  const rows = await dataRepository.select('phap_thoai', {
    select: 'id,tracks,archive_id',
    limit: 1,
    filters: { id: filters.id },
  }, context.principal);
  const tracks = new Map<string, unknown[]>();
  const archiveIds = new Map<string, string>();
  for (const row of rows) {
    archiveIds.set(String(row.id), String(row.archive_id || '').trim());
    try {
      tracks.set(String(row.id), JSON.parse(String(row.tracks || '[]')) as unknown[]);
    } catch {
      tracks.set(String(row.id), []);
    }
  }
  return { tracks, archiveIds };
}

function canReadPrivateTalks(role?: string | null): boolean {
  return role === 'ctv' || role === 'admin';
}

function authorizeTalkWrite(context: CloudflareRequestContext, method: 'POST' | 'PATCH' | 'DELETE'): void {
  const role = context.principal?.role ?? 'guest';
  if (method === 'DELETE') {
    if (role !== 'admin') throw new ServerInputError(context.principal ? 403 : 401, context.principal ? 'forbidden' : 'authentication_required', context.principal ? 'Không đủ quyền.' : 'Cần đăng nhập.');
    return;
  }
  if (role !== 'ctv' && role !== 'admin') {
    throw new ServerInputError(context.principal ? 403 : 401, context.principal ? 'forbidden' : 'authentication_required', context.principal ? 'Không đủ quyền.' : 'Cần đăng nhập.');
  }
}

function forwardAudioResponse(request: Request, upstream: Response, isPublic = false): Response {
  if (![200, 206, 304, 416].includes(upstream.status)) {
    upstream.body?.cancel?.().catch(() => {});
    if (upstream.status === 404) {
      throw new ServerInputError(404, 'audio_not_found', 'Tệp âm thanh không tồn tại.');
    }
    throw new ServerInputError(502, 'drive_audio_failed', 'Không thể tải âm thanh từ Google Drive.');
  }
  const cacheControl = isPublic
    ? 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400'
    : 'private, no-store';
  const headers = new Headers({ 'Cache-Control': cacheControl });
  for (const name of ['content-type', 'content-length', 'content-range', 'accept-ranges', 'etag']) {
    const value = upstream.headers.get(name);
    if (value != null) headers.set(name, value);
  }
  if (!headers.has('Accept-Ranges')) headers.set('Accept-Ranges', 'bytes');
  headers.set('Access-Control-Allow-Origin', '*');
  return new Response(request.method === 'HEAD' ? null : upstream.body, {
    status: upstream.status,
    headers,
  });
}
