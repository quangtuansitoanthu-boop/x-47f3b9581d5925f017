import {
  getOfflineTrack,
  offlineStorageBytes,
  putOfflineAlbum,
  putOfflineTrack,
  type OfflineAlbum,
  type OfflineAudioAccess,
} from './offline-audio-database';
import { buildZipBlob } from './audio-zip';
import { fetchWithSessionRefresh } from './session-csrf';
import { isOnlineOnlyAudioAlbum } from '$lib/domain/online-only-policy';
import { isContentAvailable } from './ios-content-policy';
import { fetchNativeJsonMutation, resolveApiUrl } from './native-api';
import { getBrowserSessionSnapshot, refreshBrowserSession } from '$lib/stores/session.svelte';

/** Album bản quyền (Muôn Kiếp Nhân Sinh) chỉ được nghe online. */
function assertAlbumDownloadAllowed(title: string | null | undefined, id?: string): void {
  if (!isContentAvailable({ id, title }) || isOnlineOnlyAudioAlbum(title)) {
    throw new Error('Album này chỉ được nghe trực tuyến, không hỗ trợ tải về.');
  }
}

export interface DownloadableTrack {
  url: string;
  title: string;
}

export interface OfflineDownloadAlbum {
  id: string;
  title: string;
  desc: string;
  tracks: DownloadableTrack[];
  archiveId?: string | null;
  visibility?: 'public' | 'private';
}

function downloadAccess(album?: OfflineDownloadAlbum): OfflineAudioAccess {
  const session = getBrowserSessionSnapshot();
  const expected = JSON.stringify([session.authenticated ? session.user?.id : null, session.user?.role]);
  return { session, album, isCurrent: () => {
    const current = getBrowserSessionSnapshot();
    return JSON.stringify([current.authenticated ? current.user?.id : null, current.user?.role]) === expected;
  } };
}
function assertDownloadAccess(access: OfflineAudioAccess): void {
  if (access.isCurrent?.() === false) throw new DOMException('Audio download principal changed', 'AbortError');
}

export interface DownloadProgress {
  completed: number;
  total: number;
  currentTitle: string;
  bytesDownloaded?: number;
  bytesTotal?: number | null;
  percent?: number | null;
}

export interface DownloadOptions {
  signal?: AbortSignal;
  authorize: () => Promise<void>;
  fetcher?: typeof fetch;
  onProgress?: (progress: DownloadProgress) => void;
  album?: OfflineDownloadAlbum;
  expectedRemainingBytes?: number | null;
  quota?: { usageBytes: number; quotaBytes: number | null } | null;
}

function remainingOfflineBytes(quota: DownloadOptions['quota']): number | null {
  if (!quota || quota.quotaBytes == null || !Number.isFinite(quota.quotaBytes) || quota.quotaBytes <= 0
    || !Number.isFinite(quota.usageBytes) || quota.usageBytes < 0) return null;
  return Math.max(0, Math.floor((quota.quotaBytes - quota.usageBytes) * 0.9));
}

const activeAlbums = new Map<string, Promise<void>>();
export const ZIP_DOWNLOAD_MAX_TRACKS = 100;
export const ZIP_DOWNLOAD_MAX_BYTES = 48 * 1024 * 1024;

export async function readAlbumDownloadSize(
  album: OfflineDownloadAlbum,
  options: { signal?: AbortSignal; fetcher?: typeof fetch } = {}
): Promise<{ bytes: number | null; remaining: number }> {
  const access = downloadAccess(album);
  const remaining: DownloadableTrack[] = [];
  for (const track of album.tracks) {
    throwIfAborted(options.signal);
    if (!await getOfflineTrack(track.url, access)) remaining.push(track);
    assertDownloadAccess(access);
  }
  throwIfAborted(options.signal);
  if (!remaining.length) return { bytes: 0, remaining: 0 };
  const sourceBase = new URL(resolveApiUrl('/'), 'https://catalog.invalid');
  const drivePath = (value: string): string | null => {
    try {
      const url = new URL(value, sourceBase);
      return url.origin === sourceBase.origin && !url.search && !url.hash
        && /^\/api\/audio\/drive\/[A-Za-z0-9_-]{5,200}$/u.test(url.pathname)
        ? url.pathname : null;
    } catch { return null; }
  };
  const drivePaths = remaining.map((track) => drivePath(track.url));
  if (drivePaths.every((path): path is string => path != null)) {
    let bundled: { version: number; albums: Record<string, Record<string, number>> } | null = null;
    try {
      bundled = (await import('$lib/data/audio-download-sizes.json')).default;
    } catch {
      // Chunk chưa có khi cập nhật web: dùng metadata endpoint thay vì chặn tải.
    }
    throwIfAborted(options.signal);
    assertDownloadAccess(access);
    const knownSizes = bundled?.version === 1 ? bundled.albums[album.id] : undefined;
    if (knownSizes) {
      let bytes = 0;
      let complete = true;
      for (const path of drivePaths) {
        const size = knownSizes[path];
        if (typeof size !== 'number' || !Number.isSafeInteger(size) || size < 0) {
          complete = false;
          break;
        }
        bytes += size;
        if (!Number.isSafeInteger(bytes)) {
          complete = false;
          break;
        }
      }
      if (complete) return { bytes, remaining: remaining.length };
    }
    // Một metadata request cho cả album, không HEAD từng bài qua gateway/D1.
    const response = await (options.fetcher ?? fetchWithSessionRefresh)(
      resolveApiUrl(`/api/talks/${encodeURIComponent(album.id)}/download-size`),
      { signal: options.signal, credentials: 'include' },
    );
    throwIfAborted(options.signal);
    assertDownloadAccess(access);
    if (!response.ok) throw new Error(`audio_metadata_failed:${response.status}`);
    const data: unknown = await response.json();
    throwIfAborted(options.signal);
    assertDownloadAccess(access);
    if (!data || typeof data !== 'object' || !('albumId' in data) || data.albumId !== album.id
      || !('tracks' in data) || !Array.isArray(data.tracks)) {
      return { bytes: null, remaining: remaining.length };
    }
    const sizes = new Map<string, number>();
    for (const track of data.tracks) {
      if (!track || typeof track !== 'object' || typeof track.url !== 'string') continue;
      const path = drivePath(track.url);
      if (!path || typeof track.bytes !== 'number' || !Number.isSafeInteger(track.bytes) || track.bytes < 0) continue;
      if (sizes.has(path)) return { bytes: null, remaining: remaining.length };
      sizes.set(path, track.bytes);
    }
    let bytes = 0;
    for (const path of drivePaths) {
      const size = sizes.get(path);
      if (size == null) return { bytes: null, remaining: remaining.length };
      bytes += size;
      if (!Number.isSafeInteger(bytes)) return { bytes: null, remaining: remaining.length };
    }
    return { bytes, remaining: remaining.length };
  }
  const paths = remaining.map((track) => {
    try {
      const url = new URL(track.url);
      if (url.origin !== 'https://archive.org') return null;
      const match = url.pathname.match(/^\/download\/([^/]+)\/(.+)$/u);
      return match ? { id: decodeURIComponent(match[1]), name: decodeURIComponent(match[2]) } : null;
    } catch { return null; }
  });
  // Chỉ đọc một metadata album, không HEAD từng bài gây N+1 qua gateway/D1.
  const id = paths[0]?.id;
  if (!id || paths.some((path) => !path || path.id !== id)) return { bytes: null, remaining: remaining.length };
  const response = await (options.fetcher ?? fetch)(`https://archive.org/metadata/${encodeURIComponent(id)}/files`, { signal: options.signal });
  throwIfAborted(options.signal);
  assertDownloadAccess(access);
  if (!response.ok) throw new Error(`audio_metadata_failed:${response.status}`);
  const data: unknown = await response.json();
  throwIfAborted(options.signal);
  assertDownloadAccess(access);
  const files = data && typeof data === 'object' && 'result' in data ? data.result : null;
  if (!Array.isArray(files)) return { bytes: null, remaining: remaining.length };
  const sizes = new Map<string, number>();
  for (const file of files) {
    if (!file || typeof file !== 'object' || typeof file.name !== 'string') continue;
    const size = Number(file.size);
    if (Number.isSafeInteger(size) && size > 0) sizes.set(file.name, size);
  }
  let bytes = 0;
  for (const path of paths) {
    const size = path ? sizes.get(path.name) : undefined;
    if (size == null) return { bytes: null, remaining: remaining.length };
    bytes += size;
    if (!Number.isSafeInteger(bytes)) return { bytes: null, remaining: remaining.length };
  }
  return { bytes, remaining: remaining.length };
}

function throwIfAborted(signal?: AbortSignal): void {
  if (signal?.aborted) {
    throw signal.reason ?? new DOMException('Aborted', 'AbortError');
  }
}

function safeFileName(value: string, extension = ''): string {
  const normalized = String(value || '')
    .normalize('NFKC')
    .replace(/[\\/:*?"<>|\u0000-\u001f]/g, '')
    .trim();
  return `${normalized || 'audio'}${extension}`;
}

function triggerBrowserDownload(blob: Blob, fileName: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  if (document.body) {
    document.body.append(link);
    link.click();
    link.remove();
  } else {
    link.click();
  }
  setTimeout(() => URL.revokeObjectURL(url), 60_000);
}

function triggerExternalDownload(url: string, fileName: string): void {
  if (typeof window === 'undefined' || typeof document === 'undefined') return;
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener noreferrer';
  if (document.body) {
    document.body.append(link);
    link.click();
    link.remove();
  } else {
    link.click();
  }
}

export function archiveAlbumZipUrl(value?: string | null): string | null {
  const archiveId = String(value ?? '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/u.test(archiveId)) return null;
  const encodedId = encodeURIComponent(archiveId);
  return `https://archive.org/compress/${encodedId}/formats=VBR%20MP3&file=/${encodedId}.zip`;
}

async function downloadAlbum(
  album: OfflineDownloadAlbum,
  options: DownloadOptions,
  access: OfflineAudioAccess,
): Promise<void> {
  const availableBytes = remainingOfflineBytes(options.quota);
  const expectedBytes = options.expectedRemainingBytes;
  if (availableBytes !== null && typeof expectedBytes === 'number' && Number.isSafeInteger(expectedBytes)
    && expectedBytes >= 0 && expectedBytes > availableBytes) throw new Error('offline_audio_quota_exceeded');
  await options.authorize();
  assertDownloadAccess(access);
  const ownerId = album.visibility === 'private' ? access.session?.user?.id : undefined;
  if (album.visibility === 'private' && (!ownerId || !access.session?.authenticated || !['admin', 'ctv'].includes(access.session.user?.role ?? ''))) {
    throw new Error('audio_download_not_authorized');
  }
  const fetcher = options.fetcher ?? fetch;
  let completed = 0;
  let bytesDownloaded = 0;
  let newBytesDownloaded = 0;

  for (let i = 0; i < album.tracks.length; i++) {
    const track = album.tracks[i];
    throwIfAborted(options.signal);

    const startingPercent = Math.min(99, Math.round((i / album.tracks.length) * 100));
    options.onProgress?.({
      completed: i,
      total: album.tracks.length,
      currentTitle: track.title,
      bytesDownloaded,
      bytesTotal: null,
      percent: startingPercent,
    });

    const stored = await getOfflineTrack(track.url, access);
    assertDownloadAccess(access);
    throwIfAborted(options.signal);
    if (!stored) {
      const response = await fetcher(resolveApiUrl(track.url), { signal: options.signal });
      if (!response.ok) throw new Error(`Không thể tải ${track.title} (${response.status})`);
      let blob: Blob;
      if (availableBytes === null) {
        // Không tự áp giới hạn ZIP lên bài nghe dài khi thiết bị chưa báo quota.
        blob = await response.blob();
      } else {
        const budget = Math.max(0, availableBytes - newBytesDownloaded);
        const declared = Number(response.headers.get('content-length'));
        if (Number.isFinite(declared) && declared > budget) {
          await response.body?.cancel('offline_audio_quota_exceeded').catch(() => undefined);
          throw new Error('offline_audio_quota_exceeded');
        }
        blob = response.body
          ? new Blob([await readResponseWithinBudget(response, budget, options.signal, 'offline_audio_quota_exceeded')],
            { type: response.headers.get('content-type') ?? '' })
          : await response.blob();
        if (blob.size > budget) throw new Error('offline_audio_quota_exceeded');
      }
      throwIfAborted(options.signal);
      assertDownloadAccess(access);
      bytesDownloaded += blob.size;
      newBytesDownloaded += blob.size;
      await putOfflineTrack({
        url: track.url,
        blob,
        albumId: String(album.id),
        title: track.title,
        downloadedAt: Date.now(), visibility: album.visibility, ownerId,
      }, access);
    } else {
      bytesDownloaded += stored.blob?.size ?? 0;
    }

    completed += 1;
    const completedPercent = Math.min(100, Math.round((completed / album.tracks.length) * 100));
    options.onProgress?.({
      completed,
      total: album.tracks.length,
      currentTitle: track.title,
      bytesDownloaded,
      bytesTotal: null,
      percent: completedPercent,
    });
  }

  const record: OfflineAlbum = {
    id: String(album.id),
    title: album.title,
    desc: album.desc,
    trackCount: album.tracks.length,
    downloadedAt: Date.now(), visibility: album.visibility, ownerId, trackUrls: album.tracks.map(track => track.url),
  };
  assertDownloadAccess(access);
  await putOfflineAlbum(record, access);
}

/**
 * Resumes at album granularity: completed track blobs are reused and an
 * aborted in-flight track may be fetched again. Concurrent starts coalesce.
 */
export function downloadAlbumForOffline(
  album: OfflineDownloadAlbum,
  options: DownloadOptions
): Promise<void> {
  try {
    assertAlbumDownloadAllowed(album.title, album.id);
  } catch (error) {
    return Promise.reject(error);
  }
  const access = downloadAccess(album);
  const id = JSON.stringify([String(album.id), access.session?.authenticated ? access.session.user?.id : null, access.session?.user?.role]);
  const active = activeAlbums.get(id);
  if (active) return active;

  const task = downloadAlbum(album, options, access).finally(() => activeAlbums.delete(id));
  activeAlbums.set(id, task);
  return task;
}

export async function authorizeDownload(
  csrfToken: string,
  fetcher: typeof fetch = fetchWithSessionRefresh
): Promise<void> {
  const init: RequestInit = {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'X-CSRF-Token': csrfToken
    },
    body: '{}'
  };
  const native = fetcher === fetchWithSessionRefresh
    ? await fetchNativeJsonMutation('/api/downloads/access', init) : null;
  const response = native ?? await fetcher('/api/downloads/access', init);
  if (native && response.status === 401) await refreshBrowserSession().catch(() => undefined);
  if (response.status === 401) throw new Error('authentication_required');
  if (!response.ok) throw new Error(`download_not_authorized:${response.status}`);
}

function inferAudioExtension(response: Response, url: string): string {
  const contentType = (response.headers.get('content-type') || '').toLowerCase().split(';')[0].trim();
  if (contentType === 'audio/mp4' || contentType === 'audio/x-m4a' || contentType === 'audio/m4a') return '.m4a';
  if (contentType === 'audio/webm' || contentType === 'video/webm') return '.webm';
  if (contentType === 'audio/ogg' || contentType === 'application/ogg' || contentType === 'audio/opus') return '.ogg';
  if (contentType === 'audio/wav' || contentType === 'audio/x-wav') return '.wav';
  if (contentType === 'audio/aac') return '.aac';
  if (contentType === 'audio/flac') return '.flac';
  if (contentType === 'audio/mpeg' || contentType === 'audio/mp3') return '.mp3';

  const match = url.match(/\.(mp3|m4a|webm|ogg|opus|wav|flac|aac)(?:[?#]|$)/iu);
  if (match) return `.${match[1].toLowerCase()}`;
  return '.mp3';
}

export async function downloadSingleTrackFile(
  track: DownloadableTrack,
  options: DownloadOptions & { fileName?: string; albumTitle?: string | null }
): Promise<void> {
  assertAlbumDownloadAllowed(options.albumTitle, options.album?.id);
  throwIfAborted(options.signal);
  const access = downloadAccess(options.album);
  await options.authorize();
  throwIfAborted(options.signal);
  assertDownloadAccess(access);

  const stored = await getOfflineTrack(track.url, access);
  throwIfAborted(options.signal);
  assertDownloadAccess(access);
  if (stored?.blob) {
    options.onProgress?.({
      completed: 1,
      total: 1,
      currentTitle: track.title,
      bytesDownloaded: stored.blob.size,
      bytesTotal: stored.blob.size
    });
    triggerBrowserDownload(stored.blob, options.fileName || safeFileName(track.title, '.mp3'));
    return;
  }

  const fetcher = options.fetcher ?? fetch;
  const response = await fetcher(resolveApiUrl(track.url), { signal: options.signal });
  if (!response.ok) throw new Error(`Không thể tải ${track.title} (${response.status})`);

  let blob: Blob;
  const contentLength = Number(response.headers.get('content-length') || 0);
  const totalBytes = Number.isFinite(contentLength) && contentLength > 0 ? contentLength : null;

  if (response.body?.getReader) {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];
    let receivedBytes = 0;
    try {
      while (true) {
        throwIfAborted(options.signal);
        const { done, value } = await reader.read();
        if (done) break;
        chunks.push(value);
        receivedBytes += value.byteLength;
        options.onProgress?.({
          completed: 0,
          total: 1,
          currentTitle: track.title,
          bytesDownloaded: receivedBytes,
          bytesTotal: totalBytes
        });
      }
    } finally {
      reader.releaseLock();
    }
    const contentType = (response.headers.get('content-type') || '').split(';')[0].trim() || 'audio/mpeg';
    blob = new Blob(chunks as BlobPart[], { type: contentType });
  } else {
    blob = await response.blob();
  }

  options.onProgress?.({
    completed: 1,
    total: 1,
    currentTitle: track.title,
    bytesDownloaded: blob.size,
    bytesTotal: blob.size
  });
  const ext = inferAudioExtension(response, track.url);
  throwIfAborted(options.signal);
  assertDownloadAccess(access);
  triggerBrowserDownload(blob, options.fileName || safeFileName(track.title, ext));
}

export async function downloadAlbumAsZip(
  album: OfflineDownloadAlbum,
  options: DownloadOptions & { fileName?: string }
): Promise<'archive-direct' | 'browser-generated'> {
  assertAlbumDownloadAllowed(album.title, album.id);
  throwIfAborted(options.signal);
  const access = downloadAccess(album);
  await options.authorize();
  throwIfAborted(options.signal);
  assertDownloadAccess(access);

  const archiveZipUrl = archiveAlbumZipUrl(album.archiveId);
  if (archiveZipUrl) {
    triggerExternalDownload(
      archiveZipUrl,
      options.fileName || safeFileName(album.title, '.zip'),
    );
    options.onProgress?.({
      completed: album.tracks.length,
      total: album.tracks.length,
      currentTitle: 'Archive.org',
      bytesDownloaded: 0,
      bytesTotal: null,
    });
    return 'archive-direct';
  }

  if (album.tracks.length > ZIP_DOWNLOAD_MAX_TRACKS) {
    throw new Error('zip_album_too_large');
  }

  const fetcher = options.fetcher ?? fetch;
  const entries: Array<{ fileName: string; bytes: ArrayBuffer; extension?: string }> = [];
  let completed = 0;
  let bytesDownloaded = 0;

  for (const track of album.tracks) {
    throwIfAborted(options.signal);
    assertDownloadAccess(access);
    const response = await fetcher(resolveApiUrl(track.url), { signal: options.signal });
    if (!response.ok) throw new Error(`Không thể tải ${track.title} (${response.status})`);
    const declaredSize = Number(response.headers.get('content-length') || 0);
    const remainingBytes = ZIP_DOWNLOAD_MAX_BYTES - bytesDownloaded;
    if (Number.isFinite(declaredSize) && declaredSize > remainingBytes) {
      await response.body?.cancel('zip_album_too_large').catch(() => {});
      throw new Error('zip_album_too_large');
    }
    const bytes = await readResponseWithinBudget(response, remainingBytes, options.signal);
    assertDownloadAccess(access);
    bytesDownloaded += bytes.byteLength;
    const ext = inferAudioExtension(response, track.url);
    entries.push({ fileName: track.title, bytes, extension: ext });
    completed += 1;
    options.onProgress?.({
      completed,
      total: album.tracks.length,
      currentTitle: track.title,
      bytesDownloaded,
      bytesTotal: null
    });
  }

  throwIfAborted(options.signal);
  assertDownloadAccess(access);
  triggerBrowserDownload(buildZipBlob(entries), options.fileName || safeFileName(album.title, '.zip'));
  return 'browser-generated';
}

async function readResponseWithinBudget(
  response: Response,
  byteBudget: number,
  signal?: AbortSignal,
  budgetError = 'zip_album_too_large',
): Promise<ArrayBuffer> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error('zip_track_body_missing');
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      if (signal?.aborted) throw signal.reason ?? new DOMException('Aborted', 'AbortError');
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > byteBudget) {
        await reader.cancel(budgetError).catch(() => {});
        throw new Error(budgetError);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const output = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    output.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return output.buffer;
}

export async function estimateOfflineQuota(): Promise<{
  usageBytes: number;
  quotaBytes: number | null;
  savedBytes: number;
}> {
  const savedBytes = await offlineStorageBytes().catch(() => 0);
  if (typeof navigator === 'undefined' || !navigator.storage?.estimate) {
    return { usageBytes: savedBytes, quotaBytes: null, savedBytes };
  }
  const estimate = await navigator.storage.estimate();
  return {
    usageBytes: Number(estimate.usage ?? savedBytes),
    quotaBytes: estimate.quota == null ? null : Number(estimate.quota),
    savedBytes
  };
}
