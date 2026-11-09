import { throwIfAborted } from './abort-signal';
import manifest from '$lib/data/mission-book-images.json';
import { OFFLINE_ILLUSTRATION_CACHE } from '$lib/contracts/book-illustrations';

export const MISSION_BOOK_ID = manifest.bookId;
const CACHE = OFFLINE_ILLUSTRATION_CACHE;
const CHOICE = 'tutam_mission_images_choice_v1';
const allowed = new Map(manifest.images.map(image => [image.path, image]));
const remotePrefix = `https://media.quangtu.vn/content/${manifest.directory.split('/').slice(-1)[0]}/`;
const localPrefix = `/${manifest.directory}/`;
function canonicalSource(source: string): string {
  return source.startsWith(remotePrefix) ? localPrefix + source.slice(remotePrefix.length) : source;
}
export const missionImageCount = manifest.images.length;
export const missionImageBytes = manifest.images.reduce((sum, image) => sum + image.bytes, 0);

export function isMissionBook(id: string | undefined): boolean {
  return id?.replace(/^book_/u, '') === MISSION_BOOK_ID;
}

export function missionImageSources(html: string): string[] {
  return [...new Set([...html.matchAll(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/giu)]
    .map(match => canonicalSource(match[1])).filter(source => allowed.has(source)))];
}

// Chặn request ảnh trước khi người dùng đồng ý; không sửa nội dung nguồn đã lưu.
export function withMissionImages(html: string, urls: ReadonlyMap<string, string>): string {
  return html.replace(/<img\b[^>]*\bsrc="([^"]+)"[^>]*>/giu, (tag: string, source: string) => {
    const canonical = canonicalSource(source);
    if (!allowed.has(canonical)) return tag;
    const url = urls.get(canonical);
    return url ? tag.replace(`src="${source}"`, `src="${url}"`) : '';
  });
}

export function hasMissionImageChoice(): boolean {
  try { return localStorage.getItem(CHOICE) === '1'; } catch { return false; }
}
export function rememberMissionImageChoice(): void {
  try { localStorage.setItem(CHOICE, '1'); } catch { /* Vẫn đọc được nếu storage bị chặn. */ }
}

function key(source: string): string { return new URL(source, location.origin).href; }

export async function cachedMissionImageCount(): Promise<number> {
  const cache = await caches.open(CACHE);
  return (await cache.keys()).filter(request => allowed.has(new URL(request.url).pathname)).length;
}

export async function readMissionImageUrls(sources: string[]): Promise<Map<string, string>> {
  const cache = await caches.open(CACHE);
  const urls = new Map<string, string>();
  try {
    for (const source of sources) {
      if (!allowed.has(source)) continue;
      const response = await cache.match(key(source));
      if (response) urls.set(source, URL.createObjectURL(await response.blob()));
    }
    return urls;
  } catch (error) {
    revokeMissionImageUrls(urls);
    throw error;
  }
}

export function revokeMissionImageUrls(urls: ReadonlyMap<string, string>): void {
  for (const url of urls.values()) URL.revokeObjectURL(url);
}

export async function downloadMissionImages(signal: AbortSignal, progress: (count: number) => void): Promise<void> {
  const cache = await caches.open(CACHE);
  const controller = new AbortController();
  const abort = () => controller.abort();
  signal.addEventListener('abort', abort, { once: true });
  if (signal.aborted) abort();
  let next = 0, completed = 0;
  async function worker(): Promise<void> {
    while (next < manifest.images.length) {
      throwIfAborted(controller.signal);
      const image = manifest.images[next++];
      if (!await cache.match(key(image.path))) {
        const response = await fetch(remotePrefix + image.path.slice(localPrefix.length), { signal: controller.signal, credentials: 'omit' });
        if (!response.ok) throw new Error('image-download-failed');
        const bytes = await response.arrayBuffer();
        const hash = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map(value => value.toString(16).padStart(2, '0')).join('');
        if (bytes.byteLength !== image.bytes || hash !== image.sha256) throw new Error('image-integrity-failed');
        throwIfAborted(controller.signal);
        await cache.put(key(image.path), new Response(bytes, { headers: { 'content-type': 'image/webp' } }));
      }
      throwIfAborted(controller.signal);
      progress(++completed);
    }
  }
  try {
    await Promise.all(Array.from({ length: 3 }, async () => {
      try { await worker(); } catch (error) { controller.abort(); throw error; }
    }));
  } finally {
    controller.abort();
    signal.removeEventListener('abort', abort);
  }
}

export async function clearMissionImagesCache(): Promise<void> {
  try {
    await caches.delete(CACHE);
  } catch {}
}
