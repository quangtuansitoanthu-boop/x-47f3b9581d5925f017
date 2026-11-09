/**
 * practice-audio-cache.ts
 * Nhạc thiền và tiếng mõ luôn có sẵn trong gói ứng dụng.
 * Âm thanh thiên nhiên phụ trợ giữ cơ chế tải theo nhu cầu và Cache Storage.
 * Hỗ trợ Web, Android, iOS.
 */

export const PRACTICE_AUDIO_CACHE_NAME = 'tutam-practice-audio-v1';
export const PRACTICE_AUDIO_REMOTE_BASE = 'https://media.quangtu.vn/audio/practice';

export interface PracticeAudioMeta {
  path: string;
  bytes: number;
  remoteUrl: string;
  isDefault: boolean;
  label: string;
}

export const PRACTICE_AUDIO_CATALOG: Record<string, PracticeAudioMeta> = {
  '/assets/audio/nhac-thien-01.m4a': {
    path: '/assets/audio/nhac-thien-01.m4a',
    bytes: 9_857_000,
    remoteUrl: `${PRACTICE_AUDIO_REMOTE_BASE}/nhac-thien-01.m4a`,
    isDefault: true,
    label: 'Nhạc Thiền 1 — Tĩnh lặng'
  },
  '/assets/audio/nhac-thien-02.m4a': {
    path: '/assets/audio/nhac-thien-02.m4a',
    bytes: 3_428_000,
    remoteUrl: `${PRACTICE_AUDIO_REMOTE_BASE}/nhac-thien-02.m4a`,
    isDefault: true,
    label: 'Nhạc Thiền 2 — Thanh tịnh'
  },
  '/assets/audio/nhac-thien-03.m4a': {
    path: '/assets/audio/nhac-thien-03.m4a',
    bytes: 9_814_000,
    remoteUrl: `${PRACTICE_AUDIO_REMOTE_BASE}/nhac-thien-03.m4a`,
    isDefault: true,
    label: 'Nhạc Thiền 3 — An lạc'
  },
  '/assets/audio/tieng-mo.m4a': {
    path: '/assets/audio/tieng-mo.m4a',
    bytes: 2_850_000,
    remoteUrl: `${PRACTICE_AUDIO_REMOTE_BASE}/tieng-mo.m4a`,
    isDefault: true,
    label: 'Tiếng Mõ'
  },
  '/assets/audio/ambient/tieng-mua-roi.mp3': {
    path: '/assets/audio/ambient/tieng-mua-roi.mp3',
    bytes: 723_000,
    remoteUrl: `${PRACTICE_AUDIO_REMOTE_BASE}/ambient/tieng-mua-roi.mp3`,
    isDefault: false,
    label: 'Tiếng Mưa Rơi'
  },
  '/assets/audio/ambient/tieng-on-trang.mp3': {
    path: '/assets/audio/ambient/tieng-on-trang.mp3',
    bytes: 450_000,
    remoteUrl: `${PRACTICE_AUDIO_REMOTE_BASE}/ambient/tieng-on-trang.mp3`,
    isDefault: false,
    label: 'Tiếng Ồn Trắng'
  },
  '/assets/audio/ambient/tieng-nuoc-chay.mp3': {
    path: '/assets/audio/ambient/tieng-nuoc-chay.mp3',
    bytes: 157_000,
    remoteUrl: `${PRACTICE_AUDIO_REMOTE_BASE}/ambient/tieng-nuoc-chay.mp3`,
    isDefault: false,
    label: 'Tiếng nước Chảy'
  },
  '/assets/audio/ambient/tieng-troi-mua-lon.mp3': {
    path: '/assets/audio/ambient/tieng-troi-mua-lon.mp3',
    bytes: 608_000,
    remoteUrl: `${PRACTICE_AUDIO_REMOTE_BASE}/ambient/tieng-troi-mua-lon.mp3`,
    isDefault: false,
    label: 'Tiếng Trời Mưa Lớn'
  },
  '/assets/audio/ambient/tieng-troi-mua-nhe.mp3': {
    path: '/assets/audio/ambient/tieng-troi-mua-nhe.mp3',
    bytes: 356_000,
    remoteUrl: `${PRACTICE_AUDIO_REMOTE_BASE}/ambient/tieng-troi-mua-nhe.mp3`,
    isDefault: false,
    label: 'Âm thanh tiếng trời Mưa nhẹ'
  },
  '/assets/audio/ambient/am-thanh-mua-gio-va-sam-set.mp3': {
    path: '/assets/audio/ambient/am-thanh-mua-gio-va-sam-set.mp3',
    bytes: 943_000,
    remoteUrl: `${PRACTICE_AUDIO_REMOTE_BASE}/ambient/am-thanh-mua-gio-va-sam-set.mp3`,
    isDefault: false,
    label: 'Âm thanh Mưa Gió và Sấm Sét'
  }
};

const activeBlobUrls = new Map<string, string>();

function cacheKey(path: string): string {
  const origin = typeof location !== 'undefined' && location.origin ? location.origin : 'https://localhost';
  return origin + path;
}

function isAudioResponse(response: Response): boolean {
  return response.ok && !/text\/html|application\/(?:xhtml\+xml|json)/iu.test(response.headers.get('content-type') || '');
}

async function readCachedAudio(cache: Cache, path: string): Promise<Response | undefined> {
  const response = await cache.match(cacheKey(path));
  if (response && !isAudioResponse(response)) {
    // Older versions could save SPA fallback HTML. Remove only that invalid entry.
    await cache.delete(cacheKey(path));
    return undefined;
  }
  return response;
}

export function getAudioTrackMeta(path: string): PracticeAudioMeta | undefined {
  return PRACTICE_AUDIO_CATALOG[path];
}

export function isDefaultAudioTrack(path: string): boolean {
  return Boolean(PRACTICE_AUDIO_CATALOG[path]?.isDefault);
}

export async function isAudioDownloaded(path: string): Promise<boolean> {
  if (isDefaultAudioTrack(path)) return true;
  if (typeof caches === 'undefined') return false;
  try {
    const cache = await caches.open(PRACTICE_AUDIO_CACHE_NAME);
    const match = await readCachedAudio(cache, path);
    if (match && !activeBlobUrls.has(path)) {
      activeBlobUrls.set(path, URL.createObjectURL(await match.blob()));
    }
    return Boolean(match);
  } catch {
    return false;
  }
}

export async function downloadAudioTrack(
  path: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal
): Promise<string> {
  if (isDefaultAudioTrack(path)) {
    onProgress?.(100);
    return path;
  }

  const meta = getAudioTrackMeta(path);
  const downloadUrl = meta ? meta.remoteUrl : path;

  if (typeof caches === 'undefined') {
    throw new Error('Cache Storage is not available');
  }

  const cache = await caches.open(PRACTICE_AUDIO_CACHE_NAME);
  const matched = await readCachedAudio(cache, path);
  if (matched) {
    onProgress?.(100);
    const active = activeBlobUrls.get(path);
    if (active) return active;
    const existingBlob = await matched.blob();
    const existingUrl = URL.createObjectURL(existingBlob);
    activeBlobUrls.set(path, existingUrl);
    return existingUrl;
  }

  onProgress?.(10);
  let response: Response | undefined;
  try {
    response = await fetch(path, { signal, credentials: 'omit' });
  } catch (cause) {
    if (signal?.aborted || downloadUrl === path) throw cause;
  }
  // Ưu tiên asset đóng gói; chỉ gọi R2 nếu web/bản app cũ thiếu nguồn local.
  if ((!response || !isAudioResponse(response)) && downloadUrl !== path) {
    response = await fetch(downloadUrl, { signal, credentials: 'omit' });
  }
  if (!response?.ok) throw new Error(`Download failed with status ${response?.status ?? 'unavailable'}`);
  // Native SPA có thể trả index.html với HTTP 200 cho asset không tồn tại.
  if (!isAudioResponse(response)) {
    throw new Error('Download did not return audio');
  }

  onProgress?.(60);
  const blob = await response.blob();
  onProgress?.(85);
  await cache.put(
    cacheKey(path),
    new Response(blob, {
      headers: { 'content-type': response.headers.get('content-type') || 'audio/mp4' }
    })
  );
  onProgress?.(100);

  const blobUrl = URL.createObjectURL(blob);
  const previous = activeBlobUrls.get(path);
  if (previous) URL.revokeObjectURL(previous);
  activeBlobUrls.set(path, blobUrl);
  return blobUrl;
}

export async function deleteAudioTrack(path: string): Promise<void> {
  if (isDefaultAudioTrack(path)) return;
  const existingUrl = activeBlobUrls.get(path);
  if (existingUrl) {
    try {
      URL.revokeObjectURL(existingUrl);
    } catch {}
    activeBlobUrls.delete(path);
  }

  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(PRACTICE_AUDIO_CACHE_NAME);
    await cache.delete(cacheKey(path));
  } catch {}
}

export function getPlayablePracticeAudioUrl(path: string): string {
  return activeBlobUrls.get(path) || path;
}

export async function resolvePlayableAudioUrl(path: string, preferRemote = false): Promise<string> {
  if (isDefaultAudioTrack(path)) return path;

  // 1. Kiểm tra bộ nhớ blob URL đang active
  const cachedBlobUrl = activeBlobUrls.get(path);
  if (cachedBlobUrl) return cachedBlobUrl;

  // 2. Kiểm tra Cache Storage
  if (typeof caches !== 'undefined') {
    try {
      const cache = await caches.open(PRACTICE_AUDIO_CACHE_NAME);
      const matched = await readCachedAudio(cache, path);
      if (matched) {
        const blob = await matched.blob();
        const blobUrl = URL.createObjectURL(blob);
        activeBlobUrls.set(path, blobUrl);
        return blobUrl;
      }
    } catch {}
  }

  // 3. Nếu chưa cache, nếu preferRemote trả về remoteUrl, ngược lại trả về path
  if (preferRemote) {
    const meta = getAudioTrackMeta(path);
    return meta?.remoteUrl || path;
  }
  return path;
}

export async function clearAllPracticeAudioCache(): Promise<void> {
  for (const url of activeBlobUrls.values()) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
  activeBlobUrls.clear();

  if (typeof caches === 'undefined') return;
  try {
    await caches.delete(PRACTICE_AUDIO_CACHE_NAME);
  } catch {}
}
