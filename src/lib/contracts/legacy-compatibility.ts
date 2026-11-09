import {
  LEGACY_INDEXED_DB_CONTRACT,
  LEGACY_LOCAL_STORAGE_KEYS,
  LEGACY_LOCAL_STORAGE_PREFIXES,
  LEGACY_SESSION_STORAGE_KEYS,
} from '$lib/browser/storage-contract';

export const LEGACY_BASELINE_EVIDENCE = Object.freeze({
  asOfDate: '2026-07-31',
  buildSuite: { passed: 19, total: 19 },
  migrationSuite: {
    expectedFailures: 3,
    passed: 10,
    reason: 'Protected migration snapshot is intentionally absent from the public checkout.',
    total: 13,
  },
  workerAssetVersion: 'v37',
  workerSuite: { passed: 57, total: 57 },
} as const);

export const LEGACY_ROUTE_MATRIX = Object.freeze([
  { canonicalPathname: '/', htmlPathname: '/index.html', pathname: '/', preservesQuery: true, redirectStatus: null },
  { canonicalPathname: '/', htmlPathname: '/index.html', pathname: '/index.html', preservesQuery: true, redirectStatus: 308 },
  { canonicalPathname: '/tu-tap', htmlPathname: '/tu-tap.html', pathname: '/tu-tap.html', preservesQuery: true, redirectStatus: 308 },
  { canonicalPathname: '/tu-tap', htmlPathname: '/tu-tap.html', pathname: '/tutap.html', preservesQuery: true, redirectStatus: 308 },
  { canonicalPathname: '/phap-thoai', htmlPathname: '/phap-thoai.html', pathname: '/phap-thoai.html', preservesQuery: true, redirectStatus: 308 },
  { canonicalPathname: '/phap-thoai', htmlPathname: '/phap-thoai.html', pathname: '/phapthoai.html', preservesQuery: true, redirectStatus: 308 },
  { canonicalPathname: '/huong-dan', htmlPathname: '/huong-dan.html', pathname: '/huong-dan.html', preservesQuery: true, redirectStatus: 308 },
  { canonicalPathname: '/huong-dan', htmlPathname: '/huong-dan.html', pathname: '/huongdan.html', preservesQuery: true, redirectStatus: 308 },
] as const);

export const LEGACY_API_SURFACE = Object.freeze({
  auth: ['/api/session', '/api/auth/session', '/api/auth/google', '/api/auth/google/start', '/api/auth/google/callback', '/api/auth/logout'],
  data: ['/api/articles', '/api/talks', '/api/sync', '/api/player-sync', '/api/data/:table'],
  operational: ['/api/downloads/access', '/api/presence', '/api/media', '/api/audio/drive/:fileId', '/api/admin/talks/drive-scan'],
  sameOriginPrefixes: ['/api/', '/auth/', '/oauth/'],
} as const);

export const LEGACY_ROLE_MATRIX = Object.freeze({
  admin: ['content:delete', 'comments:contact-read', 'downloads:use', 'drive-scan:run', 'media:write', 'sync:self', 'talks:private-read'],
  ctv: ['content:write', 'downloads:use', 'media:write', 'sync:self', 'talks:private-read'],
  guest: ['comments:write', 'content:public-read', 'views:write'],
  user: ['comments:write', 'content:public-read', 'downloads:use', 'sync:self', 'views:write'],
} as const);

export const LEGACY_VISUAL_BASELINES = Object.freeze({
  projects: [
    { colorScheme: 'light', id: 'mobile-390-light', viewport: { height: 844, width: 390 } },
    { colorScheme: 'dark', id: 'mobile-390-dark', viewport: { height: 844, width: 390 } },
    { colorScheme: 'light', id: 'desktop-1440-light', viewport: { height: 1400, width: 1440 } },
    { colorScheme: 'dark', id: 'desktop-1440-dark', viewport: { height: 1400, width: 1440 } },
  ],
  routes: ['/', '/tu-tap', '/phap-thoai', '/huong-dan'],
} as const);

export const LEGACY_SERVICE_WORKER_CONTRACT = Object.freeze({
  buildTimestamp: '20260731-auth-download-presence-v37',
  cacheName: 'tutam-cache-v37',
  networkOnlyHosts: ['script.google.com', 'api.cloudinary.com', 'api.jsonbin.io', 'archive.org'],
  networkOnlyPrefixes: ['/api/', '/auth/', '/oauth/'],
  path: '/service-worker.js',
  precacheEntries: [
    '/',
    '/index.html',
    '/phap-thoai.html',
    '/tu-tap.html',
    '/huong-dan.html',
    '/src/styles/main-v37.css',
    '/src/scripts/cloudflare-api-client-v37.js',
    '/src/scripts/cloudflare-application-runtime-v37.js',
    '/src/scripts/cloudflare-main-application-v37.js',
  ],
} as const);

export const LEGACY_MASTER_LAYOUT_CONTRACT = Object.freeze({
  contractVersion: 'phase-01',
  documentTitle: 'Tu tập cùng Quang Từ',
  layoutId: 'quangtu-master-layout',
  nestedLayoutsMayOwn: ['page-specific data loading', 'page-specific toolbar actions', 'page-specific presentational wrappers'],
  sharedShellState: ['auth-session', 'dark-mode', 'navigation-shell', 'presence-heartbeat', 'service-worker-update-banner'],
} as const);

export const LEGACY_STORAGE_AND_IDB_CONTRACT = Object.freeze({
  indexedDb: LEGACY_INDEXED_DB_CONTRACT,
  localStorageKeys: LEGACY_LOCAL_STORAGE_KEYS,
  localStoragePrefixes: LEGACY_LOCAL_STORAGE_PREFIXES,
  sessionStorageKeys: LEGACY_SESSION_STORAGE_KEYS,
} as const);
