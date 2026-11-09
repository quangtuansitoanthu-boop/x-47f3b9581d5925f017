import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

describe('navigation and route payload performance contracts', () => {
  const layout = readFileSync('src/routes/+layout.svelte', 'utf8');
  const layoutServer = readFileSync('src/routes/+layout.ts', 'utf8');
  const homepage = readFileSync('src/routes/+page.svelte', 'utf8');
  const practicePage = readFileSync('src/routes/tu-tap/+page.svelte', 'utf8');
  const talksPage = readFileSync('src/routes/phap-thoai/+page.svelte', 'utf8');
  const catalogs = readFileSync('src/lib/browser/content-catalogs.ts', 'utf8');
  const offlineLibrary = readFileSync('src/lib/browser/offline-pdf-library.ts', 'utf8');
  const sessionStore = readFileSync('src/lib/stores/session.svelte.ts', 'utf8');
  const sessionCsrf = readFileSync('src/lib/browser/session-csrf.ts', 'utf8');
  const sessionStatus = readFileSync('src/lib/components/auth/SessionStatus.svelte', 'utf8');

  it('serializes the SSR session once and does not repeat /api/session on mount', () => {
    expect(layoutServer).toContain("export const ssr = import.meta.env.VITE_CAPACITOR_BUILD !== '1'");
    expect(layoutServer).toContain('authenticated: false');
    expect(layoutServer).not.toContain("fetch('/api/session'");
    expect(layout).toContain('const initialSessionVerified = untrack(() => data?.sessionVerified === true && !isNativeApp()');
    expect(layout).toContain("!document.documentElement.hasAttribute('data-offline-shell')");
    expect(layout).toContain('if (native || !initialSessionVerified)');
    expect(layout.match(/sessionStore\.refresh\(\)/gu)).toHaveLength(1);
    expect(layout).not.toContain('startPresence(');
    expect(layout).not.toContain("from '$lib/browser/presence'");
    expect(layout).not.toContain("fetch('/api/session'");
    expect(homepage).not.toContain("fetch('/api/session'");
    expect(practicePage).not.toContain("fetch('/api/session'");
    expect(talksPage).not.toContain("fetch('/api/session'");
  });

  it('derives the active route in the browser so the root server load is navigation-stable', () => {
    expect(layout).toContain("import { page } from '$app/state'");
    expect(layout).toContain('currentPath={page.url.pathname}');
    expect(layoutServer).not.toContain('url.pathname');
    expect(layoutServer).not.toContain('currentPath');
  });

  it('hydrates one in-memory session store and refreshes it only through the CSR session endpoint', () => {
    expect(layout).toContain('untrack(() => data?.session ?? defaultSession)');
    expect(layout).toContain('registerBrowserSessionStore(sessionStore)');
    expect(layout).toContain('session={sessionStore.value}');
    expect(sessionStore).toContain("resolveApiUrl('/api/session')");
    expect(sessionStore).toContain("cache: 'no-store'");
    expect(sessionCsrf).toContain('getBrowserSessionSnapshot');
    expect(sessionCsrf).toContain('refreshBrowserSession');
    expect(sessionStatus).toContain('refreshBrowserSession');
    expect(sessionStatus).toContain('clearBrowserSession');
    expect(sessionStatus).toContain('clearBrowserSession');
    expect(sessionStatus).not.toContain("location.href = '/'");
  });

  it('owns the persistent audio principal lifecycle at the root layout', () => {
    expect(layout).toContain('selectAudioPlayerSession(sessionStore.value)');
    expect(layout).toContain('window.addEventListener(SESSION_CHANGE_EVENT, selectAudioSession)');
    expect(layout).toContain('window.removeEventListener(SESSION_CHANGE_EVENT, selectAudioSession)');
    expect(talksPage).not.toContain('selectAudioSyncPrincipal');
    expect(talksPage).toContain('window.addEventListener(SESSION_CHANGE_EVENT, applyCollectionSession)');
    expect(talksPage).toContain('window.removeEventListener(SESSION_CHANGE_EVENT, applyCollectionSession)');
  });

  it('does not keep a global progress bar visible during client navigation', () => {
    expect(layout).not.toContain("import { navigating } from '$app/state'");
    expect(layout).not.toContain('route-progress');
  });

  it('loads the complete article collection through the client API after shell mount', () => {
    expect(homepage).toContain('createQuery(() => ({');
    expect(homepage).toContain('queryKey: serverStateKeys.articles.homepageForPrincipal(effectiveRole, effectivePrincipal)');
    expect(homepage).toContain('fetchHomepageWithOfflinePdfs(fetch, effectiveRole, effectivePrincipal, signal)');
    expect(offlineLibrary).toContain('fetchHomepageArticles(fetchWithNetworkEvidence, role, signal)');
    expect(catalogs).toContain('/api/articles?select=id,tieu_de,tom_tat,noi_dung');
    expect(catalogs).toContain('defaultViewsRaw');
    expect(homepage).not.toContain("fetch('/api/session'");
  });

  it('loads full talk tracks and practice summaries through one client request per catalog', () => {
    expect(talksPage).toContain('queryKey: serverStateKeys.talks.catalogForPrincipal(role, catalogPrincipalId)');
    expect(talksPage).toContain('fetchTalkAlbums(fetch, signal, sessionStore.value)');
    expect(practicePage).toContain('queryKey: serverStateKeys.articles.practice(clientRole)');
    expect(practicePage).toContain('fetchPracticeCatalog(fetch, signal)');
    expect(catalogs).toContain('created_at,tracks&order=created_at.desc');
    expect(catalogs).toContain('limit=300');
    expect(catalogs).not.toContain("fetcher('/api/session'");
  });
});
