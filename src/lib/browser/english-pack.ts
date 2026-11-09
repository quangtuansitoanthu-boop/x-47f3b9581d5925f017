import { throwIfAborted } from './abort-signal';
import bundledManifest from '$lib/data/english-pack-manifest.json';
import { availableContent, isContentAvailable } from './ios-content-policy';
import bundledRituals from '$lib/data/bundled-english-rituals.json';
import { isHtmlResponse, resolveRemoteUrl } from './native-api';
import { fetchWithDeadline } from './network-deadline';
const CACHE = 'tutam-english-chapters-v2';
const PREFIX = '/offline-data/chapters-en/';
type Manifest = typeof bundledManifest;
let manifest: Manifest = bundledManifest;
let checkedAt = 0;
let manifestRequest: Promise<void> | null = null;
async function currentManifest(): Promise<Manifest> {
  if (Date.now() - checkedAt > 300_000 && typeof navigator !== 'undefined' && navigator.onLine) {
    manifestRequest ??= (async () => {
      try {
        const response = await fetchWithDeadline('https://media.quangtu.vn/offline-data/english-pack-manifest.json', { cache: 'no-cache' }, 5000);
        const candidate = await response.json();
        if (response.ok && typeof candidate.version === 'string' && Array.isArray(candidate.entries) && candidate.entries.length > 0 && candidate.entries.length <= 2000 && candidate.entries.every((entry: Manifest['entries'][number]) => /^[\w-]+\.json$/.test(entry.file) && /^[a-f0-9]{64}$/.test(entry.sha256) && Number.isSafeInteger(entry.bytes) && entry.bytes > 0)) manifest = candidate;
      } catch { /* Use the shipped manifest offline. */ }
      finally { checkedAt = Date.now(); manifestRequest = null; }
    })();
    await manifestRequest;
  }
  return availableContent(manifest);
}
export async function fetchEnglishChapters(path: string, signal?: AbortSignal, expectedDigest?: string): Promise<Response> {
  if (!/^\/offline-data\/chapters-en\/[\w%-]+\.json$/.test(path)) throw new Error('Invalid English chapter path');
  throwIfAborted(signal);
  // These short rituals ship with the app and must open on the first offline launch.
  // Validate against the shipped manifest before consulting a newer remote manifest.
  const file = decodeURIComponent(path.slice(PREFIX.length));
  if (!isContentAvailable({ file })) return new Response('null', { status: 404, headers: { 'content-type': 'application/json' } });
  const bundledMetadata = bundledManifest.entries.find(entry => entry.file === file);
  if (bundledRituals.includes(file) && (!expectedDigest || expectedDigest === bundledMetadata?.sha256)) {
    try {
      const response = await fetchWithDeadline(path, { signal }, 5000);
      if (response.ok && !isHtmlResponse(response)) {
        const bytes = await response.arrayBuffer();
        const metadata = bundledMetadata;
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
        const rows = JSON.parse(new TextDecoder().decode(bytes));
        if (metadata && bytes.byteLength === metadata.bytes && digest === metadata.sha256 && Array.isArray(rows) && rows.length && rows.every(row => typeof row?.noi_dung === 'string')) {
          throwIfAborted(signal);
          return new Response(bytes, { headers: { 'content-type': 'application/json' } });
        }
      }
    } catch { throwIfAborted(signal); }
  }
  const metadata = (await currentManifest()).entries.find(entry => entry.file === decodeURIComponent(path.slice(PREFIX.length)));
  const cacheKey = `${path}?revision=${metadata?.sha256 ?? 'unlisted'}`;
  let cache: Cache | undefined;
  try { cache = await caches.open(CACHE); const saved = await cache.match(cacheKey); throwIfAborted(signal); if (saved) return saved; } catch { throwIfAborted(signal); }
  if (typeof navigator !== 'undefined' && navigator.onLine === false) throw new Error('English book is not saved offline');
  for (const url of [...new Set([`https://media.quangtu.vn${path}`, resolveRemoteUrl(path), path])]) {
    throwIfAborted(signal);
    try {
      const response = await fetchWithDeadline(url, { signal }, 20_000);
      if (!response.ok || isHtmlResponse(response)) { await response.body?.cancel(); continue; }
      const bytes = await response.arrayBuffer();
      if (metadata) {
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (bytes.byteLength !== metadata.bytes || digest !== metadata.sha256) continue;
      }
      const rows = JSON.parse(new TextDecoder().decode(bytes));
      if (!Array.isArray(rows) || !rows.length || !rows.every(row => row && typeof row.noi_dung === 'string')) continue;
      throwIfAborted(signal);
      const validated = new Response(bytes, { headers: { 'content-type': 'application/json' } });
      if (cache) await cache.put(cacheKey, validated.clone());
      return validated;
    } catch { throwIfAborted(signal); }
  }
  throw new Error('English content is unavailable. Please check your connection and try again.');
}
export async function downloadEnglishPack(onProgress: (done: number, total: number) => void, signal?: AbortSignal): Promise<void> {
  const metadata = await currentManifest();
  const cache = await caches.open(CACHE);
  const quota = typeof navigator !== 'undefined' ? await navigator.storage?.estimate?.().catch(() => null) : null;
  let missingBytes = 0;
  for (const entry of metadata.entries) { throwIfAborted(signal); if (!await cache.match(`${PREFIX}${entry.file}?revision=${entry.sha256}`)) missingBytes += entry.bytes; }
  if (quota?.quota && quota.quota - (quota.usage ?? 0) < missingBytes * 1.2) throw new Error('Not enough storage for English books');
  let done = 0;
  onProgress(done, metadata.entries.length);
  for (const entry of metadata.entries) {
    throwIfAborted(signal);
    const key = `${PREFIX}${entry.file}?revision=${entry.sha256}`;
    if (!await cache.match(key)) {
      const response = await fetchEnglishChapters(`${PREFIX}${entry.file}`, signal, entry.sha256);
      if (!await cache.match(key)) {
        // Nghi thức có sẵn mở trực tiếp từ gói app; tải trọn gói vẫn phải lưu đúng revision vào cache.
        const bytes = await response.arrayBuffer();
        const digest = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))].map(byte => byte.toString(16).padStart(2, '0')).join('');
        if (bytes.byteLength !== entry.bytes || digest !== entry.sha256) throw new Error('English manifest changed. Please retry the download.');
        throwIfAborted(signal);
        await cache.put(key, new Response(bytes, { headers: { 'content-type': 'application/json' } }));
      } else {
        await response.body?.cancel();
      }
    }
    throwIfAborted(signal);
    onProgress(++done, metadata.entries.length);
  }
  const valid = new Set(metadata.entries.map(entry => `${PREFIX}${entry.file}?revision=${entry.sha256}`));
  for (const request of await cache.keys()) { const url = new URL(request.url); if (!valid.has(url.pathname + url.search)) await cache.delete(request); }
}
