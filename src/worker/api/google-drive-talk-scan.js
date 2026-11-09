import {
  getDriveAccessToken, GoogleDriveError, listDirectChildFolders, listDirectMp3Files,
  SUPPORTED_AUDIO_EXTENSIONS,
} from '../integrations/google-drive.js';
import { HttpInputError, readJson } from '../http/request.js';

const MAX_TRACKS = 500;

export async function scanGoogleDriveTalks(request, env, dependencies = {}) {
  const body = await readJson(request, 1024);
  if (typeof body.dryRun !== 'boolean' || Object.keys(body).some((key) => key !== 'dryRun')) {
    throw new HttpInputError(400, 'invalid_scan_request', 'dryRun phải là boolean duy nhất.');
  }
  const rootFolderId = requiredRootFolderId(env);
  if (!body.dryRun) await ensureLegacyMappingReady(env);
  const fetchImpl = dependencies.fetchImpl || fetch;
  let token;
  let folders;
  try {
    token = dependencies.accessToken || await getDriveAccessToken(env, fetchImpl);
    folders = await listDirectChildFolders(rootFolderId, token, fetchImpl);
  } catch (error) {
    throw driveInputError(error);
  }

  folders.sort((left, right) => naturalCompare(left.name, right.name));
  const results = [];
  for (const folder of folders) {
    try {
      results.push(await synchronizeFolder({
        env, folder, rootFolderId, token, fetchImpl, dryRun: body.dryRun,
      }));
    } catch (error) {
      results.push({
        folderId: folder.id,
        folderName: folder.name,
        status: 'error',
        code: error instanceof GoogleDriveError ? error.code : 'folder_sync_failed',
      });
    }
  }
  return {
    dryRun: body.dryRun,
    counts: countStatuses(results),
    folders: results,
  };
}

async function synchronizeFolder({ env, folder, rootFolderId, token, fetchImpl, dryRun }) {
  if (!folder?.id || !folder?.name) {
    throw new GoogleDriveError('drive_invalid_folder', 'Thư mục Drive không hợp lệ.');
  }
  const discovered = await listDirectMp3Files(folder.id, token, fetchImpl, MAX_TRACKS);
  const source = await env.DB.prepare(`
    SELECT source.drive_folder_id, source.album_id, source.folder_name, source.fingerprint, talk.dien_gia
    FROM phap_thoai_drive_sources source
    JOIN phap_thoai talk ON talk.id = source.album_id
    WHERE source.drive_folder_id = ? AND source.drive_root_folder_id = ?
  `).bind(folder.id, rootFolderId).first();
  if (!discovered.length && !source) {
    return {
      folderId: folder.id,
      folderName: folder.name,
      albumId: source?.album_id || null,
      status: 'skipped',
      reason: 'no_audio_files',
      trackCount: 0,
    };
  }

  const existingFiles = source ? await loadCatalogFiles(env, folder.id) : [];
  const ordered = preserveTrackOrder(existingFiles, discovered);
  const fingerprint = await fingerprintFolder(folder.name, ordered);
  const speaker = speakerFromFolderName(folder.name);
  const needsSpeaker = source && !String(source.dien_gia || '').trim() && speaker;
  const status = source ? (source.fingerprint === fingerprint && !needsSpeaker ? 'skipped' : 'updated') : 'created';
  const albumId = source?.album_id || await deterministicAlbumId(folder.id);
  const result = {
    folderId: folder.id,
    folderName: folder.name,
    albumId,
    status,
    trackCount: ordered.length,
  };
  if (dryRun) return result;

  const scannedAt = new Date().toISOString();
  if (status === 'skipped') {
    await env.DB.prepare(`
      UPDATE phap_thoai_drive_sources SET last_scanned_at = ?
      WHERE drive_folder_id = ? AND drive_root_folder_id = ?
    `).bind(scannedAt, folder.id, rootFolderId).run();
    return result;
  }
  const tracks = JSON.stringify(ordered.map((file) => ({
    title: file.name.replace(SUPPORTED_AUDIO_EXTENSIONS, ''),
    url: `/api/audio/drive/${encodeURIComponent(file.id)}`,
  })));
  const statements = source
    ? updateFolderStatements(env, { folder, rootFolderId, fingerprint, albumId, ordered, tracks, scannedAt })
    : createFolderStatements(env, { folder, rootFolderId, fingerprint, albumId, ordered, tracks, scannedAt });
  const batch = await env.DB.batch(statements);
  if (batch.some((entry) => entry.success === false)) throw new Error('drive-folder-batch-failed');
  return result;
}

async function ensureLegacyMappingReady(env) {
  const counts = await env.DB.prepare(`
    SELECT
      COUNT(*) AS legacy_count,
      SUM(CASE WHEN NOT EXISTS (
        SELECT 1 FROM phap_thoai_drive_sources source WHERE source.album_id = talk.id
      ) THEN 1 ELSE 0 END) AS missing_count
    FROM phap_thoai talk
    WHERE archive_id <> ''
  `).first();
  if (Number(counts?.missing_count || 0) > 0) {
    throw new HttpInputError(
      409,
      'drive_mapping_required',
      'Phải seed và kiểm tra ánh xạ album cũ trước khi áp dụng quét Drive.',
    );
  }
}

function createFolderStatements(env, context) {
  const { folder, rootFolderId, fingerprint, albumId, ordered, tracks, scannedAt } = context;
  return [
    env.DB.prepare(`
      INSERT INTO phap_thoai
        (id, tieu_de, dien_gia, mo_ta, chu_de, archive_id, tracks, ngay_dang, created_at, visibility)
      VALUES (?, ?, ?, '', 'Pháp ngữ', '', ?, ?, ?, 'public')
    `).bind(albumId, folder.name, speakerFromFolderName(folder.name), tracks, scannedAt.slice(0, 10), scannedAt),
    env.DB.prepare(`
      INSERT INTO phap_thoai_drive_sources
        (drive_folder_id, album_id, drive_root_folder_id, folder_name, fingerprint, last_scanned_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `).bind(folder.id, albumId, rootFolderId, folder.name, fingerprint, scannedAt),
    ...fileInsertStatements(env, folder.id, albumId, ordered),
  ];
}

function updateFolderStatements(env, context) {
  const { folder, rootFolderId, fingerprint, albumId, ordered, tracks, scannedAt } = context;
  return [
    env.DB.prepare(`UPDATE phap_thoai SET tieu_de = ?, tracks = ?,
      dien_gia = CASE WHEN trim(coalesce(dien_gia, '')) = '' THEN ? ELSE dien_gia END
      WHERE id = ?`)
      .bind(folder.name, tracks, speakerFromFolderName(folder.name), albumId),
    env.DB.prepare('DELETE FROM phap_thoai_drive_files WHERE drive_folder_id = ?').bind(folder.id),
    env.DB.prepare(`
      UPDATE phap_thoai_drive_sources
      SET folder_name = ?, fingerprint = ?, last_scanned_at = ?
      WHERE drive_folder_id = ? AND drive_root_folder_id = ?
    `).bind(folder.name, fingerprint, scannedAt, folder.id, rootFolderId),
    ...fileInsertStatements(env, folder.id, albumId, ordered),
  ];
}

export function speakerFromFolderName(name) {
  const parts = String(name || '').trim().split(/\s+[-–—]\s+/u);
  if (parts.length < 2 || !parts.slice(0, -1).join(' ').trim()) return null;
  return parts.at(-1).trim() || null;
}

function fileInsertStatements(env, folderId, albumId, files) {
  return files.map((file, index) => env.DB.prepare(`
    INSERT INTO phap_thoai_drive_files
      (drive_file_id, drive_folder_id, album_id, file_name, mime_type,
       byte_size, modified_time, sort_order)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(drive_file_id) DO UPDATE SET
      drive_folder_id = excluded.drive_folder_id,
      album_id = excluded.album_id,
      file_name = excluded.file_name,
      mime_type = excluded.mime_type,
      byte_size = excluded.byte_size,
      modified_time = excluded.modified_time,
      sort_order = excluded.sort_order
  `).bind(
    file.id, folderId, albumId, file.name, file.mimeType,
    file.size == null || file.size === '' ? null : Number(file.size),
    file.modifiedTime || null, index,
  ));
}

async function deterministicAlbumId(folderId) {
  const digest = new Uint8Array(await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(String(folderId)),
  ));
  const suffix = [...digest].slice(0, 16)
    .map((byte) => byte.toString(16).padStart(2, '0')).join('');
  return `pt_drive_${suffix}`;
}

async function loadCatalogFiles(env, folderId) {
  const result = await env.DB.prepare(`
    SELECT drive_file_id AS id, file_name AS name, mime_type AS mimeType,
      byte_size AS size, modified_time AS modifiedTime, sort_order
    FROM phap_thoai_drive_files
    WHERE drive_folder_id = ?
    ORDER BY sort_order
  `).bind(folderId).all();
  return result.results || [];
}

function preserveTrackOrder(existing, discovered) {
  const byId = new Map(discovered.map((file) => [file.id, file]));
  const ordered = [];
  for (const old of existing) {
    const current = byId.get(old.id);
    if (current) {
      ordered.push(current);
      byId.delete(old.id);
    }
  }
  ordered.push(...[...byId.values()].sort((left, right) => naturalCompare(left.name, right.name)));
  return ordered;
}

async function fingerprintFolder(folderName, files) {
  const canonical = JSON.stringify({
    folderName,
    files: files.map((file) => [file.id, file.name, file.mimeType, String(file.size || ''), file.modifiedTime || '']),
  });
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(canonical)));
  return [...digest].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

function naturalCompare(left, right) {
  return String(left || '').localeCompare(String(right || ''), 'vi', {
    numeric: true,
    sensitivity: 'base',
  });
}

function requiredRootFolderId(env) {
  const value = String(env.GOOGLE_DRIVE_ROOT_FOLDER_ID || '').trim();
  if (!/^[A-Za-z0-9_-]{10,200}$/u.test(value)) {
    throw new HttpInputError(500, 'drive_root_missing', 'Thiếu cấu hình thư mục Google Drive.');
  }
  return value;
}

function driveInputError(error) {
  if (error instanceof GoogleDriveError) {
    return new HttpInputError(error.status, error.code, error.message);
  }
  return error;
}

function countStatuses(results) {
  const counts = { created: 0, updated: 0, skipped: 0, error: 0 };
  for (const result of results) counts[result.status] += 1;
  return counts;
}
