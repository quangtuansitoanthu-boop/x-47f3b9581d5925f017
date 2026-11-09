import manifest from '$lib/data/quang-tu-facebook-videos.json';

export const QUANG_TU_BOOK_ID = manifest.bookId;
export const QUANG_TU_VIDEOS_CACHE = 'tutam_quangtu_videos_cache_v1';
const CHOICE_KEY = 'tutam_quangtu_videos_choice_v1';

const allowedVideos = new Map(manifest.videos.map((v) => [v.filename, v]));
const remotePrefix = manifest.remotePrefix;

export function isQuangTuFacebookBook(id: string | undefined): boolean {
  if (!id) return false;
  return id.replace(/^book_/u, '') === QUANG_TU_BOOK_ID;
}

export function getQuangTuVideoCount(): number {
  return manifest.videos.length;
}

export function getQuangTuVideoTotalBytes(): number {
  return manifest.remoteTotalBytes;
}

export function hasQuangTuVideoChoice(): boolean {
  try {
    return localStorage.getItem(CHOICE_KEY) === '1';
  } catch {
    return false;
  }
}

export function rememberQuangTuVideoChoice(): void {
  try {
    localStorage.setItem(CHOICE_KEY, '1');
  } catch {}
}

function videoKey(filename: string): string {
  return `${remotePrefix}${filename}`;
}

export async function isSingleVideoCached(filename: string): Promise<boolean> {
  try {
    const cache = await caches.open(QUANG_TU_VIDEOS_CACHE);
    const match = await cache.match(videoKey(filename));
    return Boolean(match);
  } catch {
    return false;
  }
}

export async function cachedQuangTuVideoCount(): Promise<number> {
  try {
    const cache = await caches.open(QUANG_TU_VIDEOS_CACHE);
    const keys = await cache.keys();
    let count = 0;
    for (const req of keys) {
      const urlStr = typeof req === 'string' ? req : req?.url || '';
      const filename = urlStr.split('/').pop() || '';
      if (allowedVideos.has(filename)) count++;
    }
    return count;
  } catch {
    return 0;
  }
}

export async function cachedQuangTuVideoBytes(): Promise<number> {
  try {
    const cache = await caches.open(QUANG_TU_VIDEOS_CACHE);
    const keys = await cache.keys();
    let total = 0;
    for (const req of keys) {
      const urlStr = typeof req === 'string' ? req : req?.url || '';
      const filename = urlStr.split('/').pop() || '';
      const meta = allowedVideos.get(filename);
      if (meta) {
        const response = await cache.match(req);
        const bytes = Number(response?.headers.get('content-length'));
        total += Number.isSafeInteger(bytes) && bytes > 0 ? bytes : meta.bytes;
      }
    }
    return total;
  } catch {
    return 0;
  }
}

export async function readVideoBlobUrl(filename: string): Promise<string | null> {
  try {
    const cache = await caches.open(QUANG_TU_VIDEOS_CACHE);
    const response = await cache.match(videoKey(filename));
    if (!response) return null;
    const blob = await response.blob();
    return URL.createObjectURL(blob);
  } catch {
    return null;
  }
}

export function revokeVideoBlobUrl(url: string | null | undefined): void {
  if (url && url.startsWith('blob:')) {
    try {
      URL.revokeObjectURL(url);
    } catch {}
  }
}

export async function downloadSingleVideo(
  filename: string,
  signal: AbortSignal,
  onProgress?: (percent: number) => void
): Promise<void> {
  const meta = allowedVideos.get(filename);
  if (!meta) throw new Error(`unknown-video:${filename}`);

  const cache = await caches.open(QUANG_TU_VIDEOS_CACHE);
  const key = videoKey(filename);
  const existing = await cache.match(key);
  if (existing) {
    onProgress?.(100);
    return;
  }

  const response = await fetch(key, { signal, credentials: 'omit' });
  if (!response.ok) throw new Error(`video-fetch-failed:${response.status}`);
  // A partial response or a fallback HTML document is not an offline video.
  const contentType = response.headers.get('content-type')?.split(';')[0].trim().toLowerCase();
  if (response.status === 206 || (contentType && !['video/mp4', 'application/octet-stream'].includes(contentType))) {
    throw new Error('video-integrity-failed');
  }

  // The bundled manifest describes compressed local files; R2 may still serve
  // the original video. Validate the transfer against its own response length.
  const responseLength = Number(response.headers.get('content-length'));
  const hasResponseLength = Number.isSafeInteger(responseLength) && responseLength > 0;
  const contentLength = hasResponseLength ? responseLength : meta.remoteBytes;
  function verifyLength(bytes: number): void {
    const tolerance = hasResponseLength ? 0 : 2000;
    if (bytes === 0 || (contentLength > 0 && Math.abs(bytes - contentLength) > tolerance)) {
      throw new Error('video-integrity-failed');
    }
    if (signal.aborted) throw new Error('download-aborted');
  }
  let bytesLoaded = 0;

  if (response.body && typeof ReadableStream !== 'undefined') {
    const reader = response.body.getReader();
    const chunks: Uint8Array[] = [];

    while (true) {
      if (signal.aborted) {
        await reader.cancel();
        throw new Error('download-aborted');
      }
      const { done, value } = await reader.read();
      if (done) break;
      if (value) {
        chunks.push(value);
        bytesLoaded += value.length;
        if (contentLength > 0 && onProgress) {
          const pct = Math.min(100, Math.round((bytesLoaded / contentLength) * 100));
          onProgress(pct);
        }
      }
    }

    const totalLength = chunks.reduce((acc, c) => acc + c.length, 0);
    const fullBuffer = new Uint8Array(totalLength);
    let offset = 0;
    for (const chunk of chunks) {
      fullBuffer.set(chunk, offset);
      offset += chunk.length;
    }

    verifyLength(fullBuffer.byteLength);

    await cache.put(
      key,
      new Response(fullBuffer, {
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(fullBuffer.byteLength),
          'accept-ranges': 'bytes'
        }
      })
    );
  } else {
    // Fallback if ReadableStream is not available
    const arrayBuffer = await response.arrayBuffer();
    verifyLength(arrayBuffer.byteLength);
    await cache.put(
      key,
      new Response(arrayBuffer, {
        headers: {
          'content-type': 'video/mp4',
          'content-length': String(arrayBuffer.byteLength),
          'accept-ranges': 'bytes'
        }
      })
    );
    onProgress?.(100);
  }
}

export async function downloadAllQuangTuVideos(
  signal: AbortSignal,
  onProgress?: (completed: number, total: number) => void
): Promise<void> {
  const total = manifest.videos.length;
  let completed = 0;

  // Process 2 videos concurrently to balance bandwidth & device memory
  const concurrency = 2;
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < total) {
      if (signal.aborted) throw new Error('download-aborted');
      const idx = nextIndex++;
      const video = manifest.videos[idx];
      await downloadSingleVideo(video.filename, signal);
      completed++;
      onProgress?.(completed, total);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, total) }, () => worker())
  );
}

export async function deleteSingleVideo(filename: string): Promise<void> {
  try {
    const cache = await caches.open(QUANG_TU_VIDEOS_CACHE);
    await cache.delete(videoKey(filename));
  } catch {}
}

export async function clearAllQuangTuVideos(): Promise<void> {
  try {
    await caches.delete(QUANG_TU_VIDEOS_CACHE);
  } catch {}
}

/**
 * Transforms video sources in HTML:
 * 1. If a video is cached in Blob URLs, point src to the local blob.
 * 2. If not cached, rewrite local '/videos/fb-video-*.mp4' to the remote CDN 'https://media.quangtu.vn/videos/fb-video-*.mp4'
 *    so the video can stream online seamlessly without needing local files bundled.
 */
export function withQuangTuVideoSources(
  html: string,
  cachedUrls: ReadonlyMap<string, string>
): string {
  return html.replace(
    /<source\b([^>]*)\bsrc="([^"]+)"([^>]*)>/giu,
    (tag, before, src, after) => {
      const filename = src.split('/').pop() || '';
      if (!allowedVideos.has(filename)) return tag;

      const cachedBlob = cachedUrls.get(filename);
      if (cachedBlob) {
        return `<source${before}src="${cachedBlob}"${after}>`;
      }

      // Rewrite relative or legacy url to CDN stream URL
      const cdnUrl = `${remotePrefix}${filename}`;
      return `<source${before}src="${cdnUrl}"${after}>`;
    }
  );
}
