/// <reference lib="webworker" />

import { build, files, prerendered, version } from '$service-worker';
import {
  IMMUTABLE_ASSET_PREFIX,
  OFFLINE_DOCUMENT_ROUTES,
  offlinePdfResolverKey,
  offlinePdfResolverPath,
  isPracticeAudioPath,
  isNetworkOnlyRequest,
  shouldPrecachePath,
  shouldRuntimeCacheStaticPath
} from '$lib/pwa/service-worker-policy';
import {
  offlinePdfKeyBelongsToPrincipal,
  resolveOfflinePdfResponse,
} from '$lib/browser/offline-pdf-database';

declare const self: ServiceWorkerGlobalScope;

const CACHE_PREFIX = 'quangtu-sveltekit-';
const CACHE_NAME = `${CACHE_PREFIX}${version}`;
interface OfflinePdfClientAuthorization {
  generation: number;
  principalId: string;
}
const offlinePdfClients = new Map<string, OfflinePdfClientAuthorization>();
const PUBLIC_OFFLINE_DOCUMENTS = [...OFFLINE_DOCUMENT_ROUTES].map((pathname) => new Request(
  new URL(pathname, self.location.origin),
  {
    credentials: 'omit',
    headers: { Accept: 'text/html' },
    redirect: 'error',
  },
));
// Install only the web shell. Native packages still contain the full offline
// bundle; web books/covers cache on use, with explicit offline stores unchanged.
const PRECACHE = [...new Set([...build, ...files, ...prerendered])]
  .filter(shouldPrecachePath);
const STATIC_ASSETS = new Set(files.filter(shouldRuntimeCacheStaticPath));

async function cachePublicOfflineDocuments(cache: Cache): Promise<void> {
  const entries = await Promise.all(PUBLIC_OFFLINE_DOCUMENTS.map(async (request) => {
    const response = await fetch(request);
    const url = new URL(request.url);
    if (!response.ok || isNetworkOnlyRequest(url, response)) {
      throw new Error(`offline-document-precache-failed:${url.pathname}`);
    }
    return { request, response };
  }));
  await Promise.all(entries.map(({ request, response }) => cache.put(request, response)));
}

async function cacheFirst(request: Request): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const cached = await cache.match(request);
  if (cached) return cached;
  const response = await fetch(request);
  if (response.status === 200 && !isNetworkOnlyRequest(new URL(request.url), response)) {
    await cache.put(request, response.clone());
  }
  return response;
}

async function documentNetworkFirst(request: Request): Promise<Response> {
  const url = new URL(request.url);
  try {
    const response = await fetch(request);
    if (response.ok && OFFLINE_DOCUMENT_ROUTES.has(url.pathname) && !isNetworkOnlyRequest(url, response)) {
      const cache = await caches.open(CACHE_NAME);
      await cache.put(request, response.clone());
    }
    return response;
  } catch (error) {
    const cache = await caches.open(CACHE_NAME);
    const cached = await cache.match(request) ?? await cache.match('/');
    if (cached) {
      if (!cached.headers.get('content-type')?.toLowerCase().includes('text/html')) return cached;
      // HTML public cũ không chứng minh phiên hiện tại đã được server xác minh.
      const html = (await cached.text()).replace(/<html(?=[\s>])/iu, '<html data-offline-shell="1"');
      const headers = new Headers(cached.headers);
      for (const name of ['content-length', 'content-encoding', 'etag']) headers.delete(name);
      return new Response(html, { status: cached.status, statusText: cached.statusText, headers });
    }
    throw error;
  }
}

async function practiceAudioCacheFirst(request: Request, event: FetchEvent): Promise<Response> {
  const cache = await caches.open(CACHE_NAME);
  const fullRequest = requestWithoutRange(request);
  const cached = await cache.match(fullRequest);
  if (cached) return rangeResponse(cached, request.headers.get('range'));

  const response = await fetch(request);
  const url = new URL(request.url);
  if (response.status === 200 && response.ok && !isNetworkOnlyRequest(url, response)) {
    await cache.put(fullRequest, response.clone());
  } else if (response.status === 206 && response.ok && !isNetworkOnlyRequest(url, response)) {
    event.waitUntil(cacheCompletePracticeAudio(fullRequest));
  }
  return response;
}

async function offlinePdfResponse(
  request: Request,
  key: string,
  clientId: string,
  authorization: OfflinePdfClientAuthorization,
): Promise<Response> {
  const response = await resolveOfflinePdfResponse(key, authorization.principalId);
  if (offlinePdfClients.get(clientId) !== authorization) {
    return new Response('Offline PDF not found', { status: 404 });
  }
  if (!response.ok) return response;
  return rangeResponse(response, request.headers.get('range'));
}

async function cacheCompletePracticeAudio(request: Request): Promise<void> {
  try {
    const response = await fetch(request);
    const url = new URL(request.url);
    if (response.status !== 200 || !response.ok || isNetworkOnlyRequest(url, response)) return;
    const cache = await caches.open(CACHE_NAME);
    await cache.put(request, response);
  } catch {
    // Playback still uses the successful range response; offline promotion can retry later.
  }
}

function requestWithoutRange(request: Request): Request {
  if (!request.headers.has('range')) return request;
  const headers = new Headers(request.headers);
  headers.delete('range');
  headers.delete('if-range');
  return new Request(request, { headers });
}

async function rangeResponse(response: Response, rangeHeader: string | null): Promise<Response> {
  if (!rangeHeader) return response;
  const match = /^bytes=(\d*)-(\d*)$/u.exec(rangeHeader.trim());
  if (!match) return response;
  const bytes = new Uint8Array(await response.arrayBuffer());
  const total = bytes.byteLength;
  let start = match[1] ? Number(match[1]) : Math.max(0, total - Number(match[2] || 0));
  let end = match[1] && match[2] ? Number(match[2]) : total - 1;
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start < 0 || start >= total || end < start) {
    return new Response(null, {
      status: 416,
      headers: { 'Content-Range': `bytes */${total}` },
    });
  }
  end = Math.min(end, total - 1);
  const headers = new Headers(response.headers);
  headers.delete('Content-Encoding');
  headers.set('Accept-Ranges', 'bytes');
  headers.set('Content-Length', String(end - start + 1));
  headers.set('Content-Range', `bytes ${start}-${end}/${total}`);
  return new Response(bytes.slice(start, end + 1), { status: 206, headers });
}

async function cacheOpenDocumentRoutes(): Promise<void> {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
  const cache = await caches.open(CACHE_NAME);
  await Promise.all(windows.map(async (client) => {
    const url = new URL(client.url);
    if (url.origin !== self.location.origin || !OFFLINE_DOCUMENT_ROUTES.has(url.pathname)) return;
    try {
      const request = new Request(url, {
        credentials: 'same-origin',
        headers: { Accept: 'text/html' },
      });
      const response = await fetch(request);
      if (response.ok && !isNetworkOnlyRequest(url, response)) {
        await cache.put(request, response);
      }
    } catch {
      // A later successful navigation can still populate the offline document cache.
    }
  }));
}

self.addEventListener('install', (event) => {
  event.waitUntil((async () => {
    const cache = await caches.open(CACHE_NAME);
    await cache.addAll(PRECACHE);
    await cachePublicOfflineDocuments(cache);
  })());
});

self.addEventListener('message', (event) => {
  if (event.data?.type === 'SKIP_WAITING') {
    event.waitUntil(self.skipWaiting());
  } else if (event.data?.type === 'OFFLINE_PDF_PRINCIPAL') {
    const source = event.source as Client | ServiceWorker | MessagePort | null;
    const clientId = source && 'id' in source ? String(source.id) : '';
    const principalId = String(event.data.principalId ?? '').trim();
    const generation = Number(event.data.generation);
    const current = offlinePdfClients.get(clientId);
    if (
      clientId
      && principalId
      && principalId.length <= 256
      && Number.isSafeInteger(generation)
      && generation > 0
      && (!current || generation >= current.generation)
    ) {
      offlinePdfClients.set(clientId, { generation, principalId });
    }
  } else if (event.data?.type === 'OFFLINE_PDF_RESOLVE') {
    const key = String(event.data.key ?? '');
    const requestId = String(event.data.requestId ?? '');
    const source = event.source as Client | ServiceWorker | MessagePort | null;
    const clientId = source && 'id' in source ? String(source.id) : '';
    const authorization = offlinePdfClients.get(clientId);
    if (
      key
      && key.length <= 1_024
      && authorization
      && offlinePdfKeyBelongsToPrincipal(key, authorization.principalId)
      && source
      && 'postMessage' in source
    ) {
      source.postMessage({
        type: 'OFFLINE_PDF_RESOLVER',
        requestId,
        url: offlinePdfResolverPath(key),
      });
    }
  }
});

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    const names = await caches.keys();
    await Promise.all(names
      .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
      .map((name) => caches.delete(name)));
    await self.clients.claim();
    await cacheOpenDocumentRoutes();
  })());
});

self.addEventListener('fetch', (event) => {
  const { request } = event;
  if (request.method !== 'GET') return;
  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  const offlinePdfKey = offlinePdfResolverKey(url.pathname);
  if (offlinePdfKey) {
    const clientId = event.clientId;
    const authorization = offlinePdfClients.get(clientId);
    if (!authorization || !offlinePdfKeyBelongsToPrincipal(offlinePdfKey, authorization.principalId)) {
      event.respondWith(Promise.resolve(new Response('Offline PDF not found', { status: 404 })));
    } else {
      event.respondWith(offlinePdfResponse(request, offlinePdfKey, clientId, authorization));
    }
  } else if (isNetworkOnlyRequest(url)) {
    return;
  } else if (request.mode === 'navigate') {
    event.respondWith(documentNetworkFirst(request));
  } else if (isPracticeAudioPath(url.pathname)) {
    event.respondWith(practiceAudioCacheFirst(request, event));
  } else if (url.pathname.startsWith(IMMUTABLE_ASSET_PREFIX) || STATIC_ASSETS.has(url.pathname)) {
    event.respondWith(cacheFirst(request));
  }
});

self.addEventListener('push', (event) => {
  let data = { title: 'Tu tập cùng Quang Từ', body: 'Thời khóa tu tập và bài viết mới.', url: '/' };
  if (event.data) {
    try {
      data = { ...data, ...event.data.json() };
    } catch {
      data.body = event.data.text() || data.body;
    }
  }

  event.waitUntil(
    self.registration.showNotification(data.title, {
      body: data.body,
      icon: '/assets/branding/tu-tap-logo.png',
      badge: '/assets/branding/tu-tap-logo.png',
      data: { url: data.url || '/' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const clientList = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of clientList) {
      if ('navigate' in client && 'focus' in client) {
        await client.focus();
        await client.navigate(targetUrl);
        return;
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(targetUrl);
    }
  })());
});

