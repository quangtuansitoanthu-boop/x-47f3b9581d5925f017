import { fetchDriveAudio, getDriveAccessToken, GoogleDriveError } from '../integrations/google-drive.js';
import { can } from '../auth/rbac.js';
import { HttpInputError } from '../http/request.js';

const FORWARDED_RESPONSE_HEADERS = [
  'content-type', 'content-length', 'content-range', 'accept-ranges', 'etag',
];

export async function getGoogleDriveAudio(request, env, rawFileId, dependencies = {}) {
  let fileId;
  try {
    fileId = decodeURIComponent(rawFileId);
  } catch {
    throw new HttpInputError(404, 'audio_not_found', 'Tệp âm thanh không tồn tại.');
  }
  if (!/^[A-Za-z0-9_-]{5,200}$/u.test(fileId)) {
    throw new HttpInputError(404, 'audio_not_found', 'Tệp âm thanh không tồn tại.');
  }
  const rootFolderId = String(env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '').trim();
  const catalog = await env.DB.prepare(`
    SELECT files.drive_file_id, talks.visibility
    FROM phap_thoai_drive_files AS files
    INNER JOIN phap_thoai_drive_sources AS sources
      ON sources.drive_folder_id = files.drive_folder_id
      AND sources.album_id = files.album_id
    INNER JOIN phap_thoai AS talks ON talks.id = files.album_id
    WHERE files.drive_file_id = ? AND sources.drive_root_folder_id = ?
    LIMIT 1
  `).bind(fileId, rootFolderId).first();
  if (!catalog) throw new HttpInputError(404, 'audio_not_found', 'Tệp âm thanh không tồn tại.');
  if (catalog.visibility !== 'public' && !can(dependencies.session, 'talks:read-private')) {
    throw new HttpInputError(404, 'audio_not_found', 'Tệp âm thanh không tồn tại.');
  }

  const fetchImpl = dependencies.fetchImpl || fetch;
  let upstream;
  try {
    const token = dependencies.accessToken || await getDriveAccessToken(env, fetchImpl);
    upstream = await fetchDriveAudio(fileId, token, request, fetchImpl);
  } catch (error) {
    if (error instanceof GoogleDriveError) {
      throw new HttpInputError(error.status, error.code, error.message);
    }
    throw error;
  }
  if (![200, 206, 304, 416].includes(upstream.status)) {
    upstream.body?.cancel?.().catch(() => {});
    if (upstream.status === 404) {
      throw new HttpInputError(404, 'audio_not_found', 'Tệp âm thanh không tồn tại.');
    }
    throw new HttpInputError(502, 'drive_audio_failed', 'Không thể tải âm thanh từ Google Drive.');
  }
  const isPublic = catalog.visibility === 'public';
  const cacheControl = isPublic
    ? 'public, max-age=604800, s-maxage=2592000, stale-while-revalidate=86400'
    : 'private, no-store';
  const headers = new Headers({ 'Cache-Control': cacheControl });
  for (const name of FORWARDED_RESPONSE_HEADERS) {
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
