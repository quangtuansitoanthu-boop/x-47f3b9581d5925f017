import { describe, expect, it } from 'vitest';

import {
  OFFLINE_DOCUMENT_ROUTES,
  isNetworkOnlyRequest,
  isPracticeAudioPath,
  shouldPrecachePath,
  shouldRuntimeCacheStaticPath
} from '../../../src/lib/pwa/service-worker-policy';

describe('SvelteKit service worker policy', () => {
  it('never caches API, authentication or private responses', () => {
    for (const pathname of ['/api/session', '/auth/callback', '/oauth/start']) {
      expect(isNetworkOnlyRequest(new URL(`https://quangtu.vn${pathname}`))).toBe(true);
    }
    expect(isNetworkOnlyRequest(
      new URL('https://quangtu.vn/'),
      new Response('private', { headers: { 'cache-control': 'private, no-store' } })
    )).toBe(true);
    expect(isNetworkOnlyRequest(
      new URL('https://quangtu.vn/'),
      new Response('cookie', { headers: { 'set-cookie': 'session=secret' } })
    )).toBe(true);
  });

  it('keeps route fallback explicit and excludes large practice audio from precache', () => {
    expect([...OFFLINE_DOCUMENT_ROUTES]).toEqual(['/', '/huong-dan', '/phap-thoai', '/tu-tap']);
    expect(shouldPrecachePath('/assets/audio/nhac-thien-01.mp3')).toBe(false);
    expect(shouldPrecachePath('/assets')).toBe(false);
    expect(shouldPrecachePath('/assets/branding/tu-tap-logo.png')).toBe(true);
    expect(shouldPrecachePath('/assets/fonts/be-vietnam-pro-regular.ttf')).toBe(true);
    expect(shouldPrecachePath('/_app/immutable/entry/app.js')).toBe(true);
  });

  it('limits runtime audio caching to the same static practice-audio namespace', () => {
    expect(isPracticeAudioPath('/assets/audio/nhac-thien-01.mp3')).toBe(true);
    expect(isPracticeAudioPath('/assets/audio/tieng-mo.mp3')).toBe(true);
    expect(isPracticeAudioPath('/api/audio/drive/private-file')).toBe(false);
    expect(isPracticeAudioPath('/assets/audio/not-audio.json')).toBe(false);
    expect(isPracticeAudioPath('/other/audio/nhac-thien-01.mp3')).toBe(false);
  });

  it('installs the small web shell without downloading every book or video and caches visited public static content', () => {
    for (const path of ['/videos/example.mp4', '/offline-data/chapters/book.json', '/offline-data/chapters-en/book.json', '/covers/book.webp']) expect(shouldPrecachePath(path)).toBe(false);
    for (const path of ['/fonts/bookerly/regular.ttf', '/images/icons/sac-moc-anh-kim-v1.webp', '/vendor/pdfjs/pdf.worker.mjs', '/manifest.json']) expect(shouldPrecachePath(path)).toBe(true);
    expect(shouldRuntimeCacheStaticPath('/offline-data/chapters/book.json')).toBe(true);
    expect(shouldRuntimeCacheStaticPath('/covers/book.webp')).toBe(true);
    expect(shouldRuntimeCacheStaticPath('/videos/example.mp4')).toBe(false);
    expect(shouldRuntimeCacheStaticPath('/assets')).toBe(false);
  });
});
