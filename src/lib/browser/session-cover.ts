import { throwIfAborted } from './abort-signal';
import { coverRemoteFallback } from '$lib/domain/cover-url';
import { fetchWithDeadline } from './network-deadline';
import { CONTENT_IMAGE_CACHE } from '$lib/contracts/content-updates';
import { resolvePublicUpdateUrl } from './native-api';

const CACHE = CONTENT_IMAGE_CACHE;
interface CoverEntry {
  task: Promise<string>;
  url?: string;
  bytes: number;
  users: number;
}
const covers = new Map<string, CoverEntry>();
const DAY = 86_400_000;
const MAX_UNUSED_COVERS = 24;
const MAX_UNUSED_BYTES = 8 * 1024 * 1024;
const waitingImages = new Map<Element, () => void>();
let sharedObserver: IntersectionObserver | undefined;

function trimCovers() {
  const unused = [...covers.entries()].filter(([, entry]) => entry.users === 0 && entry.url);
  let bytes = unused.reduce((total, [, entry]) => total + entry.bytes, 0);
  let count = unused.length;
  for (const [source, entry] of unused) {
    if (count <= MAX_UNUSED_COVERS && bytes <= MAX_UNUSED_BYTES) break;
    covers.delete(source);
    URL.revokeObjectURL(entry.url!);
    bytes -= entry.bytes;
    count--;
  }
}

function coverEntry(source: string): CoverEntry {
  const existing = covers.get(source);
  if (existing) {
    covers.delete(source);
    covers.set(source, existing);
    return existing;
  }
  const entry: CoverEntry = { task: Promise.resolve(''), users: 0, bytes: 0 };
  entry.task = loadCoverBlob(source).then(blob => {
    entry.bytes = blob.size;
    entry.url = URL.createObjectURL(blob);
    trimCovers();
    return entry.url;
  });
  covers.set(source, entry);
  void entry.task.catch(() => { if (covers.get(source) === entry) covers.delete(source); });
  return entry;
}

/** Reuse active/recent covers in memory and persist public covers for offline. */
export function getSessionCover(source: string): Promise<string> {
  if (/^(blob:|data:)/.test(source)) return Promise.resolve(source);
  return coverEntry(source).task;
}

export function offlineImageRemoteSource(source: string): string {
  try {
    const url = new URL(source, 'https://quangtu.vn');
    if (url.hostname === 'quangtu.vn' && url.pathname.startsWith('/api/media/')) {
      return `https://media.quangtu.vn/${url.pathname.slice('/api/media/'.length)}${url.search}`;
    }
  } catch { /* URL cũ vẫn đi theo resolver bìa hiện có. */ }
  return coverRemoteFallback(source) || source;
}

async function loadCoverBlob(source: string, signal?: AbortSignal, requireFresh = false): Promise<Blob> {
    let cache: Cache | undefined;
    let saved: Response | undefined;
    try { cache = await caches.open(CACHE); saved = await cache.match(source); } catch { /* Storage can be unavailable. */ }
    const offline = typeof navigator !== 'undefined' && navigator.onLine === false;
    if (!requireFresh && saved && (offline || Date.now() - Number(saved.headers.get('x-cover-saved-at')) < DAY)) {
      return saved.blob();
    }
    if (offline) {
      // Local Capacitor assets are available even without connectivity.
      if (!source.startsWith('/')) throw new Error('Cover is not saved offline');
    }
    // Bìa mới có thể đã có ở R2/API nhưng chưa có trên CDN hoặc trong APK.
    // Chỉ lượt tải thủ công thử API cuối cùng; luồng hiển thị bìa cũ giữ ngân sách cũ.
    const apiFallback = requireFresh && !offline
      ? source.startsWith('/covers/') ? resolvePublicUpdateUrl(`/api/media${source}`)
        : source.startsWith('/api/media/') ? resolvePublicUpdateUrl(source) : ''
      : '';
    for (const url of [...new Set([...(requireFresh ? [offlineImageRemoteSource(source)] : []), source, ...(!offline ? [coverRemoteFallback(source)] : []), apiFallback].filter(Boolean))]) {
      try {
        const response = await fetchWithDeadline(url, { credentials: 'omit', cache: requireFresh ? 'reload' : 'force-cache', signal }, 8000);
        if (!response.ok || !(response.headers.get('content-type') || '').startsWith('image/')) { await response.body?.cancel(); continue; }
        if (Number(response.headers.get('content-length')) > 5 * 1024 * 1024) { await response.body?.cancel(); continue; }
        const blob = await response.blob();
        if (!blob.size || blob.size > 5 * 1024 * 1024) continue;
        try { await cache?.put(source, new Response(blob, { headers: { 'content-type': blob.type, 'x-cover-saved-at': String(Date.now()) } })); } catch { /* Session reuse still works without disk quota. */ }
        return blob;
      } catch { /* Try the public media fallback or the saved offline copy. */ }
    }
    if (!requireFresh && saved) return saved.blob();
    throw new Error('Cover is unavailable');
}

/** Gói cập nhật chỉ hoàn tất khi ảnh đã được ghi bền, không chỉ có blob trong phiên. */
export async function saveCoverOffline(source: string, signal?: AbortSignal): Promise<void> {
  if (!/^(?:https:|\/|blob:|data:)/u.test(source)) source = `/${source}`;
  throwIfAborted(signal);
  const blob = await loadCoverBlob(source, signal, true);
  throwIfAborted(signal);
  const cache = await caches.open(CACHE);
  await cache.put(source, new Response(blob, { headers: { 'content-type': blob.type, 'x-cover-saved-at': String(Date.now()) } }));
}

/** Chỉ đọc ảnh đã lưu; không thêm request vào luồng reader đang ổn định. */
export function savedContentImages(node: HTMLElement) {
  const seen = new WeakSet<HTMLImageElement>();
  const urls = new Map<HTMLImageElement, string>();
  let disposed = false;
  async function enhance() {
    for (const [image, url] of urls) if (!node.contains(image)) { URL.revokeObjectURL(url); urls.delete(image); }
    for (const image of node.querySelectorAll<HTMLImageElement>('img')) {
      if (seen.has(image)) continue;
      seen.add(image);
      let source = image.getAttribute('src');
      if (!source || typeof caches === 'undefined') continue;
      if (!/^(?:https:|\/|blob:|data:)/u.test(source)) source = `/${source}`;
      try {
        const response = await (await caches.open(CACHE)).match(source);
        if (!response || disposed || !node.contains(image)) continue;
        const blob = await response.blob();
        if (disposed || !node.contains(image)) continue;
        const url = URL.createObjectURL(blob);
        urls.set(image, url);
        image.src = url;
      } catch { /* Ảnh chưa lưu vẫn do reader hiện có xử lý. */ }
    }
  }
  const observer = new MutationObserver(() => void enhance());
  observer.observe(node, { childList: true, subtree: true });
  void enhance();
  return { destroy() { disposed = true; observer.disconnect(); for (const url of urls.values()) URL.revokeObjectURL(url); } };
}

function waitForImage(image: HTMLImageElement, load: () => void): () => void {
  if (!sharedObserver) sharedObserver = new IntersectionObserver(entries => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      const callback = waitingImages.get(entry.target);
      waitingImages.delete(entry.target);
      sharedObserver?.unobserve(entry.target);
      callback?.();
    }
    if (!waitingImages.size) { sharedObserver?.disconnect(); sharedObserver = undefined; }
  }, { rootMargin: '200px' });
  waitingImages.set(image, load);
  sharedObserver.observe(image);
  return () => {
    waitingImages.delete(image);
    sharedObserver?.unobserve(image);
    if (!waitingImages.size) { sharedObserver?.disconnect(); sharedObserver = undefined; }
  };
}

/** Svelte action: no initial src means no second browser request before hydration. */
export function sessionCover(image: HTMLImageElement, source: string) {
  const originalVisibility = image.style.visibility;
  let appliedUrl = '';
  image.style.visibility = 'hidden';
  const decoded = () => { if (appliedUrl && image.src === appliedUrl) image.style.visibility = originalVisibility; };
  const failed = () => { image.style.visibility = 'hidden'; };
  image.addEventListener('load', decoded);
  image.addEventListener('error', failed);
  let generation = 0;
  let stopWaiting: (() => void) | undefined;
  let acquired: CoverEntry | undefined;
  let current = source;
  const release = () => {
    if (acquired) acquired.users--;
    acquired = undefined;
    trimCovers();
  };
  const load = () => {
    appliedUrl = '';
    image.style.visibility = 'hidden';
    stopWaiting?.();
    stopWaiting = undefined;
    release();
    const token = ++generation;
    if (!current) { image.removeAttribute('src'); return; }
    let task: Promise<string>;
    if (/^(blob:|data:)/.test(current)) task = Promise.resolve(current);
    else {
      acquired = coverEntry(current);
      acquired.users++;
      task = acquired.task;
    }
    void task.then(url => {
      if (token === generation) { image.src = url; appliedUrl = image.src; }
    }).catch(() => {
      if (token !== generation) return;
      // Host ngoài có thể cho phép <img> nhưng chặn fetch CORS; giữ đường đọc cũ.
      if (/^https?:\/\//iu.test(current)) {
        image.src = current;
        appliedUrl = image.src;
      } else image.dispatchEvent(new Event('error'));
    });
  };
  if (image.loading === 'lazy' && typeof IntersectionObserver !== 'undefined') {
    stopWaiting = waitForImage(image, load);
  } else load();
  return {
    update(next: string) { if (next !== current) { current = next; generation++; if (!stopWaiting) load(); } },
    destroy() {
      generation++; stopWaiting?.(); release();
      image.removeEventListener('load', decoded);
      image.removeEventListener('error', failed);
      image.style.visibility = originalVisibility;
    },
  };
}
