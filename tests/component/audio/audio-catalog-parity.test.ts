import { readFileSync } from 'node:fs';
import { render } from 'svelte/server';
import { describe, expect, it } from 'vitest';
import AudioCatalogSkeleton from '../../../src/lib/components/audio/AudioCatalogSkeleton.svelte';

describe('audio catalog legacy parity', () => {
  const catalog = readFileSync('src/lib/components/audio/AudioCatalog.svelte', 'utf8').replace(/\r\n/g, '\n');
  const catalogSkeleton = readFileSync('src/lib/components/audio/AudioCatalogSkeleton.svelte', 'utf8');
  const resumePrompt = readFileSync('src/lib/components/audio/AudioResumePrompt.svelte', 'utf8');
  const miniPlayer = readFileSync('src/lib/components/audio/AudioMiniPlayer.svelte', 'utf8');
  const playerController = readFileSync('src/lib/browser/audio-player-controller.ts', 'utf8');
  const page = readFileSync('src/routes/phap-thoai/+page.svelte', 'utf8');
  const catalogs = readFileSync('src/lib/browser/content-catalogs.ts', 'utf8');

  it('loads the complete catalog once through the browser API on mount', () => {
    expect(page).toContain('queryKey: serverStateKeys.talks.catalogForPrincipal(role, catalogPrincipalId)');
    expect(page).toContain('fetchTalkAlbums(fetch, signal, sessionStore.value)');
  });

  it('uses card-shaped loading placeholders and a development inspection mode', () => {
    const skeletonMarkup = render(AudioCatalogSkeleton, { props: { count: 1 } }).body;
    expect(page).toContain("get('preview') === 'skeleton'");
    expect(page).toContain('<AudioCatalogSkeleton />');
    expect(page).toContain('role="status">{t.talks.loading}');
    expect(catalogSkeleton).toContain('count = 4');
    expect(catalogSkeleton).toContain('aspect-ratio:16/7');
    expect(catalogSkeleton).toContain('aria-hidden="true"');
    expect(catalogSkeleton).toContain('prefers-reduced-motion:reduce');
    expect(skeletonMarkup.match(/class="audio-card-skeleton__meta-item(?:\s|")/gu)).toHaveLength(3);
    expect(catalogSkeleton).toContain('min-height:169px');
    expect(catalogSkeleton).toContain('.audio-card-skeleton__count.shimmer{position:absolute');
  });

  it('fetches complete tracks in the initial CSR catalog without per-album requests', () => {
    expect(catalogs).toContain('created_at,tracks&order=created_at.desc');
    expect(catalogs).toContain('tracks: normalizeTracks(row.tracks)');
    expect(page).not.toContain("fetch(`/api/talks/${encodeURIComponent(album.id)}?select=*`");
    expect(page).not.toContain('const albumRequests = new Map<string, Promise<TalkAlbum>>()');
    expect(catalog).not.toContain('loadAlbum?: (album: TalkAlbum) => Promise<TalkAlbum>');
    expect(catalog).not.toContain('resolveAlbum(album)');
  });

  it('uses the legacy publication date fallback and private album badge', () => {
    expect(catalogs).toContain('ngay_dang: row.ngay_dang');
    expect(catalog).toContain('formatVietnamDate(album.ngay_dang || album.created_at)');
    expect(catalog).toContain('pt-card-private-badge');
    expect(catalog).toContain('🔒 {t.talks.private}');
  });

  it('falls back to the topic artwork when an album image is broken', () => {
    expect(catalog).toContain('failedArtworkIds');
    expect(catalog).toContain('() => markArtworkBroken(album.id)');
    expect(catalog).toContain('pt-card-thumb-icon');
  });

  it('keeps application-wide keyboard shortcuts in the singleton controller', () => {
    expect(playerController).toContain("event.code === 'Space'");
    expect(playerController).toContain("event.code === 'ArrowRight'");
    expect(playerController).toContain("event.code === 'ArrowLeft'");
    expect(playerController).toContain("event.code === 'KeyM'");
    expect(playerController).toContain('this.seekBy(5)');
    expect(playerController).toContain('this.seekBy(-5)');
    expect(playerController).toContain('this.toggleMute()');
    expect(playerController).toContain("window.addEventListener('keydown', this.onKeyDown)");
    expect(playerController).toContain("window.removeEventListener('keydown', this.onKeyDown)");
    expect(catalog).not.toContain("event.code === 'Space'");
    expect(catalog).not.toContain("window.addEventListener('keydown', handleKeyboard)");
  });

  it('traps focus in both the album and resume dialogs', () => {
    expect(catalog).toContain('function trapAlbumFocus');
    expect(catalog).toContain("event.key !== 'Tab'");
    expect(resumePrompt).toContain('function trapFocus');
    expect(resumePrompt).toContain('onkeydown={trapFocus}');
  });

  it('keeps playback mounted across routes and exposes visible seek controls', () => {
    expect(miniPlayer).not.toContain('beforeNavigate');
    expect(miniPlayer).not.toContain('navigation.cancel();');
    expect(miniPlayer).not.toContain('Rời Pháp thoại?');
    expect(miniPlayer).not.toContain('(await getAudioPlayer()).close();');
    expect(miniPlayer).toContain('Rewind 10 seconds');
    expect(miniPlayer).toContain('Forward 30 seconds');
    expect(miniPlayer).toContain('seekBy(-10)');
    expect(miniPlayer).toContain('seekBy(30)');
  });

  it('guides users with an expand hint banner and pulsating indicator on the mini player', () => {
    expect(miniPlayer).toContain('class="pt-mp-expand-hint"');
    expect(miniPlayer).toContain('Bấm vào đây để mở giao diện phát nhạc mở rộng');
    expect(miniPlayer).toContain('class="pt-mp-hint-close"');
    expect(miniPlayer).toContain('class:has-hint={expandHintVisible}');
    expect(miniPlayer).toContain('openExpanded');
    expect(miniPlayer).toContain('dismissExpandHint');
  });

  it('aborts active album transfers and blocks async state writes after teardown', () => {
    expect(catalog).toContain('if (disposed) return;\n    downloadStatus =');
    expect(catalog).toContain('for (const ctrl of offlineControllers.values()) ctrl.abort();');
    expect(catalog).toContain('for (const ctrl of zipControllers.values()) ctrl.abort();');
    expect(catalog).toContain('offlineControllers.clear();');
    expect(catalog).toContain('zipControllers.clear();');
    expect(catalog).toContain('if (!disposed) {');
  });

  it('keeps legacy download states in one action row and prevents overlapping album transfers', () => {
    expect(catalog).toContain('offlineDownloadControl(');
    expect(catalog).toContain('async function downloadZip(');
    expect(catalog).toContain('pt-as-stop-square');
    expect(catalog).toContain("offlineControllers.has(album.id) || zipControllers.has(album.id)");
    expect(catalog).toContain("setTransferProgress(album.id, { mode: 'zip', completed, total })");
    expect(catalog).toContain("setTransferProgress(album.id, { mode: 'offline', completed, total })");
    expect(catalog).toContain('archiveId: album.archive_id ?? undefined');
    expect(catalog).toContain("result === 'archive-direct'");
  });

  it('uses the exact legacy topic icons, counts, and keeps Offline last', () => {
    expect(page).toContain("'Nhân quả': '⚖️'");
    expect(page).toContain("'Luân hồi': '🔄'");
    expect(page).toContain("'Pháp ngữ': '📿'");
    expect(page).toContain('{topicIcon(name)} {name} <small>{topicCount(name)}</small>');
    expect(page.indexOf('{#each topics as name}')).toBeLessThan(page.indexOf('{#if offlineCount}<button'));
    expect(page).toContain('t.talks.tabOffline');
  });

  it('restores recent albums after remote player sync and preserves legacy special-tab colors', () => {
    expect(page).toContain("window.addEventListener('quangtu:player-sync-updated', refresh)");
    expect(page).toContain('pt-tab pt-tab-recent');
    expect(page).toContain('t.talks.tabRecent');
    expect(page).toContain('pt-tab pt-tab-offline');
    expect(page).toContain('.pt-tab-offline,.pt-tab-offline.active{color:#27ae60}');
  });

  it('exposes synced personal-library tabs and combinable metadata filters', () => {
    expect(page).toContain('t.talks.tabFavorite');
    expect(page).toContain('listenLaterAlbumIds');
    expect(page).toContain('matchesTalkMetadataFilters(album, speaker, duration)');
    expect(page).toContain('aria-label={t.talks.allSpeakers}');
    expect(page).toContain('aria-label={t.talks.allDurations}');
    expect(catalog).toContain("onCollectionToggle(selected!, 'favorite')");
    expect(catalog).not.toContain('pt-card-fav-btn');
    expect(catalog).toContain("listenLaterAlbumIds");
    expect(catalog).toContain("album.dien_gia");
  });

  it('owns optimistic collection requests within the captured principal generation', () => {
    expect(page).toContain('createAudioLibraryRequestLifecycle(');
    expect(page).toContain('collectionRequests.begin(principalId)');
    expect(page).toContain('signal,');
    expect(page).toContain('collectionRequests.transition(nextPrincipalId)');
    expect(page).toContain('window.addEventListener(SESSION_CHANGE_EVENT, applyCollectionSession)');
    expect(page).toContain('collectionRequests.destroy();');
  });

  it('uses muted count badges by default and gold badges only for the active tab', () => {
    expect(page).toContain('.pt-tab small{padding:1px 6px;border-radius:10px;background:var(--bg3);color:var(--muted);font-size:var(--font-size-meta);font-weight:700}');
    expect(page).toContain('.pt-tab.active small{background:var(--gold-muted);color:var(--gold)}');
  });
});
