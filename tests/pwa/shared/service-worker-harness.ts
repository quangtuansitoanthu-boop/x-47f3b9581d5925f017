import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import ts from 'typescript';

import {
  IMMUTABLE_ASSET_PREFIX,
  OFFLINE_DOCUMENT_ROUTES,
  offlinePdfResolverKey,
  offlinePdfResolverPath,
  isNetworkOnlyRequest,
  isPracticeAudioPath,
  shouldPrecachePath,
  shouldRuntimeCacheStaticPath,
} from '../../../src/lib/pwa/service-worker-policy';
import { offlinePdfKeyBelongsToPrincipal } from '../../../src/lib/browser/offline-pdf-database';

const ROOT = path.resolve(import.meta.dirname, '../../..');

export interface HarnessResponseInit {
  body?: string;
  headers?: Record<string, string>;
  status?: number;
}

export interface ServiceWorkerHarnessOptions {
  clientUrls?: readonly string[];
  existingCaches?: readonly string[];
  fetchImpl?: (request: Request) => Promise<Response>;
  resolveOfflinePdf?: (key: string, principalId: string) => Promise<Response>;
  manifest?: {
    build?: string[];
    files?: string[];
    prerendered?: string[];
    version?: string;
  };
}

export interface ServiceWorkerHarness {
  cachesApi: {
    getEntries(cacheName: string): string[];
    has(cacheName: string, input: string | Request): boolean;
    names(): string[];
  };
  dispatchFetch(input: string | Request, init?: RequestInit, clientId?: string): Promise<Response | null>;
  dispatchMessage(data: unknown, clientId?: string): Promise<unknown[]>;
  readHandler(type: 'activate' | 'fetch' | 'install' | 'message'): EventListener;
  runLifecycle(type: 'activate' | 'install'): Promise<void>;
  state(): { claimed: boolean; deletedCaches: string[]; skipped: boolean };
}

type CacheEntryStore = Map<string, Response>;

type EventListener = (event: {
  data?: unknown;
  clientId?: string;
  source?: { id?: string; postMessage: (value: unknown) => void };
  request?: Request;
  respondWith?: (value: Promise<Response> | Response) => void;
  waitUntil?: (value: Promise<unknown>) => void;
}) => void;

export async function loadSvelteKitServiceWorker(
  options: ServiceWorkerHarnessOptions = {},
): Promise<ServiceWorkerHarness> {
  const source = await readFile(path.join(ROOT, 'src/service-worker.ts'), 'utf8');
  const transformed = source
    .replace(
      "import { build, files, prerendered, version } from '$service-worker';",
      'const { build, files, prerendered, version } = globalThis.__manifest;',
    )
    .replace(
      /import\s*\{[\s\S]*?\}\s*from '\$lib\/pwa\/service-worker-policy';/u,
      'const { IMMUTABLE_ASSET_PREFIX, OFFLINE_DOCUMENT_ROUTES, offlinePdfResolverKey, offlinePdfResolverPath, isNetworkOnlyRequest, isPracticeAudioPath, shouldPrecachePath, shouldRuntimeCacheStaticPath } = globalThis.__policy;',
    )
    .replace(
      /import\s*\{[\s\S]*?\}\s*from '\$lib\/browser\/offline-pdf-database';/u,
      'const { offlinePdfKeyBelongsToPrincipal, resolveOfflinePdfResponse } = globalThis.__offlinePdf;',
    )
    .replace("declare const self: ServiceWorkerGlobalScope;\n\n", '');

  const { outputText } = ts.transpileModule(transformed, {
    compilerOptions: {
      module: ts.ModuleKind.None,
      target: ts.ScriptTarget.ES2022,
    },
  });

  const handlers = new Map<string, EventListener>();
  const cacheStores = new Map<string, CacheEntryStore>();
  const cacheNames = new Set(options.existingCaches ?? []);
  const deletedCaches: string[] = [];
  let skipped = false;
  let claimed = false;

  const origin = 'https://quangtu.vn';
  const fetchImpl = options.fetchImpl ?? defaultFetch;
  const manifest = {
    build: options.manifest?.build ?? ['/_app/immutable/entry/app.js'],
    files: options.manifest?.files ?? ['/manifest.json'],
    prerendered: options.manifest?.prerendered ?? [],
    version: options.manifest?.version ?? '2026-07-31',
  };

  function normalizeInput(input: string | Request): string {
    const value = typeof input === 'string' ? new Request(new URL(input, origin)) : input;
    return new URL(value.url, origin).toString();
  }

  function cloneResponse(response: Response): Response {
    return new Response(response.body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  }

  function ensureStore(name: string): CacheEntryStore {
    cacheNames.add(name);
    const existing = cacheStores.get(name);
    if (existing) return existing;
    const next = new Map<string, Response>();
    cacheStores.set(name, next);
    return next;
  }

  const cachesApi = {
    async delete(name: string): Promise<boolean> {
      deletedCaches.push(name);
      cacheNames.delete(name);
      return cacheStores.delete(name);
    },
    async keys(): Promise<string[]> {
      return [...cacheNames];
    },
    async open(name: string) {
      const store = ensureStore(name);
      return {
        addAll: async (inputs: Array<string | Request>) => {
          const pending = new Map<string, Response>();
          for (const input of inputs) {
            const request = typeof input === 'string' ? new Request(new URL(input, origin)) : input;
            const response = await fetchImpl(request);
            if (!response.ok) {
              throw new Error(`precache-failed:${new URL(request.url).pathname}`);
            }
            pending.set(normalizeInput(request), cloneResponse(response));
          }
          for (const [key, value] of pending) {
            store.set(key, value);
          }
        },
        match: async (input: string | Request) => {
          const value = store.get(normalizeInput(input));
          return value ? cloneResponse(value) : undefined;
        },
        put: async (input: string | Request, response: Response) => {
          store.set(normalizeInput(input), cloneResponse(response));
        },
      };
    },
  };

  const context = vm.createContext({
    URL,
    Headers,
    Request,
    Response,
    caches: cachesApi,
    console,
    fetch: fetchImpl,
    globalThis: null,
    self: {
      addEventListener: (type: string, handler: EventListener) => handlers.set(type, handler),
      clients: {
        claim: async () => { claimed = true; },
        matchAll: async () => (options.clientUrls ?? []).map((url) => ({
          id: `client-${(options.clientUrls ?? []).indexOf(url) + 1}`,
          url: new URL(url, origin).toString(),
        })),
      },
      location: { origin },
      skipWaiting: async () => { skipped = true; },
    },
    __manifest: manifest,
    __policy: {
      IMMUTABLE_ASSET_PREFIX,
      OFFLINE_DOCUMENT_ROUTES,
      offlinePdfResolverKey,
      offlinePdfResolverPath,
      isNetworkOnlyRequest,
      isPracticeAudioPath,
      shouldPrecachePath,
      shouldRuntimeCacheStaticPath,
    },
    __offlinePdf: {
      offlinePdfKeyBelongsToPrincipal,
      resolveOfflinePdfResponse: options.resolveOfflinePdf ?? (async () => new Response('Offline PDF not found', { status: 404 })),
    },
  });
  context.globalThis = context;

  vm.runInContext(outputText, context, { filename: 'src/service-worker.ts' });

  async function runLifecycle(type: 'activate' | 'install') {
    const handler = handlers.get(type);
    if (!handler) throw new Error(`missing-handler:${type}`);
    let work: Promise<unknown> | undefined;
    handler({
      waitUntil(value) {
        work = Promise.resolve(value);
      },
    });
    await work;
  }

  async function dispatchFetch(input: string | Request, init?: RequestInit, clientId = 'client-1'): Promise<Response | null> {
    const handler = handlers.get('fetch');
    if (!handler) throw new Error('missing-handler:fetch');
    const request = typeof input === 'string'
      ? createRequestWithMode(new URL(input, origin), init)
      : input;
    let response: Promise<Response> | undefined;
    let work: Promise<unknown> | undefined;
    handler({
      clientId,
      request,
      respondWith(value) {
        response = Promise.resolve(value);
      },
      waitUntil(value) {
        work = Promise.resolve(value);
      },
    });
    const result = response ? await response : null;
    await work;
    return result;
  }

  async function dispatchMessage(data: unknown, clientId = 'client-1'): Promise<unknown[]> {
    const handler = handlers.get('message');
    if (!handler) throw new Error('missing-handler:message');
    let work: Promise<unknown> | undefined;
    const messages: unknown[] = [];
    handler({
      data,
      source: { id: clientId, postMessage: (value) => messages.push(value) },
      waitUntil(value) {
        work = Promise.resolve(value);
      },
    });
    await work;
    return messages;
  }

  return {
    cachesApi: {
      getEntries(cacheName: string) {
        return [...(cacheStores.get(cacheName)?.keys() ?? [])];
      },
      has(cacheName: string, input: string | Request) {
        return cacheStores.get(cacheName)?.has(normalizeInput(input)) ?? false;
      },
      names() {
        return [...cacheNames];
      },
    },
    dispatchFetch,
    dispatchMessage,
    readHandler(type) {
      const handler = handlers.get(type);
      if (!handler) throw new Error(`missing-handler:${type}`);
      return handler;
    },
    runLifecycle,
    state() {
      return {
        claimed,
        deletedCaches: [...deletedCaches],
        skipped,
      };
    },
  };
}

export async function loadScriptFixture(
  relativePath: string,
  options: ServiceWorkerHarnessOptions = {},
): Promise<ServiceWorkerHarness> {
  const source = await readFile(path.join(ROOT, relativePath), 'utf8');
  const fileName = path.basename(relativePath);
  return loadExecutableScript(source, fileName, options);
}

async function loadExecutableScript(
  source: string,
  fileName: string,
  options: ServiceWorkerHarnessOptions = {},
): Promise<ServiceWorkerHarness> {
  const handlers = new Map<string, EventListener>();
  const cacheStores = new Map<string, CacheEntryStore>();
  const cacheNames = new Set(options.existingCaches ?? []);
  const deletedCaches: string[] = [];
  let skipped = false;
  let claimed = false;
  const origin = 'https://quangtu.vn';
  const fetchImpl = options.fetchImpl ?? defaultFetch;

  function normalizeInput(input: string | Request): string {
    const value = typeof input === 'string' ? new Request(new URL(input, origin)) : input;
    return new URL(value.url, origin).toString();
  }

  function cloneResponse(response: Response): Response {
    return new Response(response.body, {
      headers: response.headers,
      status: response.status,
      statusText: response.statusText,
    });
  }

  function ensureStore(name: string): CacheEntryStore {
    cacheNames.add(name);
    const existing = cacheStores.get(name);
    if (existing) return existing;
    const next = new Map<string, Response>();
    cacheStores.set(name, next);
    return next;
  }

  const cachesApi = {
    async delete(name: string): Promise<boolean> {
      deletedCaches.push(name);
      cacheNames.delete(name);
      return cacheStores.delete(name);
    },
    async keys(): Promise<string[]> {
      return [...cacheNames];
    },
    async match(input: string | Request) {
      for (const store of cacheStores.values()) {
        const value = store.get(normalizeInput(input));
        if (value) return cloneResponse(value);
      }
      return undefined;
    },
    async open(name: string) {
      const store = ensureStore(name);
      return {
        addAll: async (inputs: Array<string | Request>) => {
          const pending = new Map<string, Response>();
          for (const input of inputs) {
            const request = typeof input === 'string' ? new Request(new URL(input, origin)) : input;
            const response = await fetchImpl(request);
            if (!response.ok) {
              throw new Error(`precache-failed:${new URL(request.url).pathname}`);
            }
            pending.set(normalizeInput(request), cloneResponse(response));
          }
          for (const [key, value] of pending) {
            store.set(key, value);
          }
        },
        match: async (input: string | Request) => {
          const value = store.get(normalizeInput(input));
          return value ? cloneResponse(value) : undefined;
        },
        put: async (input: string | Request, response: Response) => {
          store.set(normalizeInput(input), cloneResponse(response));
        },
      };
    },
  };

  const context = vm.createContext({
    URL,
    Headers,
    Request,
    Response,
    caches: cachesApi,
    console,
    fetch: fetchImpl,
    self: {
      addEventListener: (type: string, handler: EventListener) => handlers.set(type, handler),
      clients: {
        claim: async () => { claimed = true; },
        matchAll: async () => (options.clientUrls ?? []).map((url) => ({
          url: new URL(url, origin).toString(),
        })),
      },
      location: { origin },
      skipWaiting: async () => { skipped = true; },
    },
  });

  vm.runInContext(source, context, { filename: fileName });

  async function runLifecycle(type: 'activate' | 'install') {
    const handler = handlers.get(type);
    if (!handler) throw new Error(`missing-handler:${type}`);
    let work: Promise<unknown> | undefined;
    handler({
      waitUntil(value) {
        work = Promise.resolve(value);
      },
    });
    await work;
  }

  async function dispatchFetch(input: string | Request, init?: RequestInit, clientId = 'client-1'): Promise<Response | null> {
    const handler = handlers.get('fetch');
    if (!handler) throw new Error('missing-handler:fetch');
    const request = typeof input === 'string'
      ? createRequestWithMode(new URL(input, origin), init)
      : input;
    let response: Promise<Response> | undefined;
    let work: Promise<unknown> | undefined;
    handler({
      clientId,
      request,
      respondWith(value) {
        response = Promise.resolve(value);
      },
      waitUntil(value) {
        work = Promise.resolve(value);
      },
    });
    const result = response ? await response : null;
    await work;
    return result;
  }

  async function dispatchMessage(data: unknown, clientId = 'client-1'): Promise<unknown[]> {
    const handler = handlers.get('message');
    if (!handler) throw new Error('missing-handler:message');
    let work: Promise<unknown> | undefined;
    const messages: unknown[] = [];
    handler({
      data,
      source: { id: clientId, postMessage: (value) => messages.push(value) },
      waitUntil(value) {
        work = Promise.resolve(value);
      },
    });
    await work;
    return messages;
  }

  return {
    cachesApi: {
      getEntries(cacheName: string) {
        return [...(cacheStores.get(cacheName)?.keys() ?? [])];
      },
      has(cacheName: string, input: string | Request) {
        return cacheStores.get(cacheName)?.has(normalizeInput(input)) ?? false;
      },
      names() {
        return [...cacheNames];
      },
    },
    dispatchFetch,
    dispatchMessage,
    readHandler(type) {
      const handler = handlers.get(type);
      if (!handler) throw new Error(`missing-handler:${type}`);
      return handler;
    },
    runLifecycle,
    state() {
      return {
        claimed,
        deletedCaches: [...deletedCaches],
        skipped,
      };
    },
  };
}

function defaultFetch(request: Request): Promise<Response> {
  return Promise.resolve(responseForPath(new URL(request.url).pathname));
}

export function responseForPath(pathname: string, init: HarnessResponseInit = {}): Response {
  return new Response(init.body ?? `network:${pathname}`, {
    headers: init.headers,
    status: init.status ?? 200,
  });
}

function createRequestWithMode(input: URL, init?: RequestInit): Request {
  const mode = init?.mode;
  const safeInit = mode === 'navigate' ? { ...init, mode: undefined } : init;
  const request = new Request(input, safeInit);
  if (mode === 'navigate') {
    Object.defineProperty(request, 'mode', {
      configurable: true,
      value: 'navigate',
    });
  }
  return request;
}
