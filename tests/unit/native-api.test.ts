import { afterEach, describe, expect, it, vi } from 'vitest';
import { resolveApiUrl, resolveRemoteUrl, resolvePublicUrl, resolvePublicUpdateUrl } from '../../src/lib/browser/native-api';

afterEach(() => vi.unstubAllGlobals());

describe('API routing respects the actual runtime', () => {
  it('pins public native updates and their media fallback to Workers even when the saved backend is the custom domain', () => {
    vi.stubGlobal('window', { location: { origin: 'https://localhost' } });
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    vi.stubGlobal('localStorage', { getItem: () => 'https://quangtu.vn' });
    const workers = 'https://quangtu-web.quangtu-ansitoanthu.workers.dev';
    expect(resolvePublicUpdateUrl('/api/content-updates?action=catalog')).toBe(`${workers}/api/content-updates?action=catalog`);
    expect(resolvePublicUpdateUrl('/api/media/covers/one.webp')).toBe(`${workers}/api/media/covers/one.webp`);
    expect(resolveApiUrl('/api/session')).toBe('https://quangtu.vn/api/session');
    expect(resolvePublicUpdateUrl('/api/session')).toBe('https://quangtu.vn/api/session');
  });

  it('keeps public updates same-origin on web and relative during SSR', () => {
    vi.stubGlobal('window', { location: { origin: 'https://preview.example' } });
    vi.stubGlobal('Capacitor', { isNativePlatform: () => false });
    expect(resolvePublicUpdateUrl('/api/content-updates')).toBe('/api/content-updates');
    vi.stubGlobal('window', undefined);
    expect(resolvePublicUpdateUrl('/api/content-updates')).toBe('/api/content-updates');
  });

  it.each(['https://localhost', 'capacitor://localhost'])('shares public content links from native origin %s', (origin) => {
    vi.stubGlobal('window', { location: { origin } });
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    vi.stubGlobal('localStorage', { getItem: () => 'https://quangtu-web.quangtu-ansitoanthu.workers.dev' });
    const articleId = 'sách & bài/1';
    const bookUrl = new URL(resolvePublicUrl(`/?article=${encodeURIComponent(articleId)}`));
    expect(bookUrl.origin).toBe('https://quangtu.vn');
    expect(bookUrl.searchParams.get('article')).toBe(articleId);
    const albumUrl = new URL(resolvePublicUrl('/phap-thoai?album=album-1'));
    expect(albumUrl.origin).toBe('https://quangtu.vn');
    expect(albumUrl.searchParams.get('album')).toBe('album-1');
  });

  it.each(['https://quangtu.vn', 'http://localhost:4173', 'https://preview.example'])('keeps public web links on %s', origin => {
    vi.stubGlobal('window', { location: { origin } });
    vi.stubGlobal('Capacitor', { isNativePlatform: () => false });
    expect(resolvePublicUrl('/phap-thoai?album=one')).toBe(`${origin}/phap-thoai?album=one`);
  });

  it('creates public links during SSR without browser globals', () => {
    vi.stubGlobal('window', undefined);
    expect(resolvePublicUrl('/?article=one')).toBe('https://quangtu.vn/?article=one');
  });

  it('uses the canonical host for reads and assets before startup probing when the saved backend is the retired Vercel redirect', () => {
    vi.stubGlobal('window', { location: { origin: 'https://localhost' } });
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    vi.stubGlobal('localStorage', { getItem: () => 'https://quangtu.vercel.app/' });
    expect(resolveApiUrl('/api/session')).toBe('https://quangtu.vn/api/session');
    expect(resolveRemoteUrl('/covers/a.webp')).toBe('https://quangtu.vn/covers/a.webp');
  });
  it.each(['http://127.0.0.1:4173', 'http://localhost:4173', 'https://test.local'])('keeps a web preview on its own origin: %s', (origin) => {
    vi.stubGlobal('window', { location: { origin } });
    vi.stubGlobal('Capacitor', { isNativePlatform: () => false });
    expect(resolveApiUrl('/api/articles')).toBe('/api/articles');
    expect(resolveRemoteUrl('/covers/a.webp')).toBe('/covers/a.webp');
  });
  it('routes a native WebView to the saved backend', () => {
    vi.stubGlobal('window', { location: { origin: 'https://localhost' } });
    vi.stubGlobal('Capacitor', { isNativePlatform: () => true });
    vi.stubGlobal('localStorage', { getItem: () => 'https://quangtu.vn' });
    expect(resolveApiUrl('/api/articles')).toBe('https://quangtu.vn/api/articles');
    expect(resolveApiUrl('https://media.quangtu.vn/audio')).toBe('https://media.quangtu.vn/audio');
  });
});
