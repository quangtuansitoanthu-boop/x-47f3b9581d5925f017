<script lang="ts">
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  import { shareVerifiedTalkCatalog } from '$lib/browser/talk-catalog-proof';
  const localizeUi = createInterfaceTranslator();
  import { parseAudioArtwork } from '$lib/domain/audio-artwork';
  import { onMount, untrack } from 'svelte';
  import { afterNavigate } from '$app/navigation';
  import { page } from '$app/state';
  import { catalogScrollArea } from '$lib/browser/catalog-scroll-area';
  import { localizeTalkTopic } from '$lib/i18n/talk-video';
  import TopTenDialog from '$lib/components/library/TopTenDialog.svelte';
  import { applyAlbumPlayResult, fetchAlbumPlays, readCachedAlbumPlays, ALBUM_PLAYS_CHANGED, type AlbumPlayCount } from '$lib/browser/album-plays';
  import { createQuery, useQueryClient } from '@tanstack/svelte-query';
  import AudioCatalog, { type TalkAlbum } from '$lib/components/audio/AudioCatalog.svelte';
  import AudioCatalogSkeleton from '$lib/components/audio/AudioCatalogSkeleton.svelte';
  import { readOfflineLibrarySnapshot } from '$lib/browser/offline-audio-database';
  import {
    applyRemotePlayerSync,
    captureAudioLibraryStorageSnapshot,
    dispatchAudioStorageEvent,
    readPlayerSyncPayload,
    readStoredLibrary,
    readStoredRecentAlbums,
    replaceStoredLibraryState,
    restoreAudioLibraryStorageSnapshotIfUnchanged,
    setStoredLibraryMembership,
    type AudioLibraryCollection,
  } from '$lib/browser/audio-sync';
  import { fetchWithSessionRefresh } from '$lib/browser/session-csrf';
  import { createAudioLibraryRequestLifecycle } from '$lib/browser/audio-library-request-lifecycle';
  import {
    fetchTalkAlbums,
    matchesTalkMetadataFilters,
    talkSpeaker,
    type TalkDurationFilter,
  } from '$lib/browser/content-catalogs';
  import { invalidateTalkState, serverStateKeys } from '$lib/browser/server-state';
  import { getSessionContext, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { matchesVietnameseSearch } from '$lib/utils/vietnamese-search';
  import type { PageData } from './$types';
  import {
    DEFAULT_SITE_NAME,
    DEFAULT_TALK_TITLE,
    DEFAULT_TALK_DESCRIPTION,
    ensureAbsoluteUrl,
    getImageMimeType,
    cleanMetaDescription,
  } from '$lib/domain/social-preview';
  import { compareContentRecency } from '$lib/domain/content-recency';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);

  let catalogEnabled = $state(false);
  let query = $state('');
  let topic = $state<'all' | 'favorite' | 'listen_later' | 'recent' | 'offline' | string>('all');
  let speaker = $state('all');
  let duration = $state<TalkDurationFilter>('all');
  let sort = $state<'popular' | 'newest' | 'title' | 'tracks'>('popular');
  let filterOpen = $state(false);
  const activeFilterCount = $derived((speaker !== 'all' ? 1 : 0) + (duration !== 'all' ? 1 : 0) + (sort !== 'popular' ? 1 : 0));
  function resetFilters() {
    speaker = 'all';
    duration = 'all';
    sort = 'popular';
  }
  let recentAlbumIds = $state<string[]>([]);
  let favoriteAlbumIds = $state<string[]>([]);
  let listenLaterAlbumIds = $state<string[]>([]);
  let collectionBusyKeys = $state<string[]>([]);
  let collectionStatus = $state('');
  let offlineAlbumIds = $state<string[]>([]);
  let offlineBytes = $state(0);
  const sessionStore = getSessionContext();
  const role = $derived(sessionStore.value.user?.role ?? 'guest');
  const catalogPrincipalId = $derived(sessionStore.value.authenticated ? sessionStore.value.user?.id ?? null : null);
  let previousCatalogRole = untrack(() => role);
  const collectionRequests = createAudioLibraryRequestLifecycle(
    sessionStore.value.authenticated ? sessionStore.value.user?.id ?? null : null
  );
  let collectionGeneration = 0;
  const queryClient = useQueryClient();
  const albumsQuery = createQuery(() => ({
    queryKey: serverStateKeys.talks.catalogForPrincipal(role, catalogPrincipalId),
    structuralSharing: shareVerifiedTalkCatalog,
    queryFn: ({ signal }) => fetchTalkAlbums(fetch, signal, sessionStore.value),
    enabled: catalogEnabled,
  }));
  const playsQuery = createQuery<AlbumPlayCount[]>(() => ({
    queryKey: ['album-play-totals'], queryFn: ({ signal }) => fetchAlbumPlays(signal), enabled: catalogEnabled,
    placeholderData: () => readCachedAlbumPlays(),
    // Tổng mới có thể về trước catalog; vẫn cập nhật data khi trạng thái placeholder không đổi.
    notifyOnChangeProps: ['data', 'isPending', 'isError'],
  }));
  const playCounts = $derived(new Map((playsQuery.data ?? []).map((row) => [row.albumId, row.playCount])));
  const albums = $derived((albumsQuery.data ?? []).map((album) => ({ ...album,
    playCount: playCounts.get(album.id),
  })));
  const topAlbums = $derived(albums.filter((album) => album.visibility !== 'private' && (album.playCount ?? 0) > 0)
    .sort((a, b) => (b.playCount ?? 0) - (a.playCount ?? 0) || a.id.localeCompare(b.id)).slice(0, 10));
  let refreshNotice = $state<string | null>(null);

  onMount(() => {
    // Player sync fires every ~2s while audio plays; play totals change only
    // when a play is counted, and that POST already returns the new total.
    const applyCountedPlay = (event: Event) => {
      queryClient.setQueryData<AlbumPlayCount[]>(['album-play-totals'],
        (rows) => applyAlbumPlayResult(rows, (event as CustomEvent).detail));
    };
    window.addEventListener(ALBUM_PLAYS_CHANGED, applyCountedPlay);
    return () => window.removeEventListener(ALBUM_PLAYS_CHANGED, applyCountedPlay);
  });
  const loading = $derived(albumsQuery.isPending);
  const error = $derived(albumsQuery.error instanceof Error ? albumsQuery.error.message : '');

  const TOPIC_ICONS: Record<string, string> = {
    'Nhân quả': '⚖️',
    'Vô thường': '🌊',
    'Sám hối': '🙏',
    'Thiền định': '🧘',
    'Luân hồi': '🔄',
    'Hành thiện': '🌸',
    'Pháp ngữ': '📿',
    'Câu chuyện': '📖',
    'Tổng hợp': '🎙️',
  };

  const topicCounts = $derived.by(() => {
    const counts = new Map<string, number>();
    for (const album of albums) {
      const name = album.chu_de || 'Pháp ngữ';
      counts.set(name, (counts.get(name) ?? 0) + 1);
    }
    return counts;
  });
  const topics = $derived([...topicCounts.keys()].sort((left, right) =>
    (topicCounts.get(right) ?? 0) - (topicCounts.get(left) ?? 0)
      || left.localeCompare(right, 'vi')
  ));
  const speakers = $derived([...new Set(albums.map(talkSpeaker))].sort((left, right) => left.localeCompare(right, 'vi')));
  const favoriteCount = $derived(favoriteAlbumIds.filter((albumId) => albums.some((album) => album.id === albumId)).length);
  const listenLaterCount = $derived(listenLaterAlbumIds.filter((albumId) => albums.some((album) => album.id === albumId)).length);
  const recentCount = $derived(recentAlbumIds.filter((albumId) => albums.some((album) => album.id === albumId)).length);
  const offlineCount = $derived(offlineAlbumIds.filter((albumId) => albums.some((album) => album.id === albumId)).length);

  function topicIcon(name: string): string {
    return TOPIC_ICONS[name] ?? '🎧';
  }

  function topicCount(name: string): number {
    return topicCounts.get(name) ?? 0;
  }

  async function refreshClientCollections(generation = collectionGeneration): Promise<void> {
    recentAlbumIds = readStoredRecentAlbums();
    favoriteAlbumIds = readStoredLibrary('favorite').map((item) => item.albumId);
    listenLaterAlbumIds = readStoredLibrary('listen_later').map((item) => item.albumId);
    const session = sessionStore.value;
    const offline = await readOfflineLibrarySnapshot().catch(() => ({ albums: [], bytes: 0, trackCounts: {} }));
    if (generation !== collectionGeneration
      || session.authenticated !== sessionStore.value.authenticated
      || session.user?.id !== sessionStore.value.user?.id
      || session.user?.role !== sessionStore.value.user?.role) return;
    offlineAlbumIds = offline.albums.map((album) => album.id);
    offlineBytes = offline.bytes;
    if (topic === 'offline' && offlineAlbumIds.length === 0) topic = 'all';
  }

  async function toggleCollection(album: TalkAlbum, collection: AudioLibraryCollection): Promise<void> {
    const session = sessionStore.value;
    const principalId = session.authenticated ? session.user?.id ?? null : null;
    if (!principalId || !session.csrfToken) {
      window.dispatchEvent(new CustomEvent('quangtu:login-required'));
      return;
    }
    const key = `${collection}:${album.id}`;
    if (collectionBusyKeys.includes(key)) return;
    const busyGeneration = collectionRequests.captureGeneration();
    collectionBusyKeys = [...collectionBusyKeys, key];
    collectionStatus = '';
    try {
      await collectionRequests.schedule(async () => {
        const request = collectionRequests.begin(principalId);
        if (!request) return;
        const generation = collectionGeneration;
        const previous = readPlayerSyncPayload();
        const previousStorage = captureAudioLibraryStorageSnapshot(localStorage, principalId);
        const currentIds = collection === 'favorite' ? favoriteAlbumIds : listenLaterAlbumIds;
        let optimisticStorage: ReturnType<typeof captureAudioLibraryStorageSnapshot> | null = null;
        let remoteAccepted = false;
        try {
          try {
            setStoredLibraryMembership(collection, album.id, !currentIds.includes(album.id));
          } catch {
            try {
              replaceStoredLibraryState(previous);
            } catch {
              // The storage helper already attempted a key-level rollback.
            }
            await refreshClientCollections(generation);
            collectionStatus = 'Không thể lưu thay đổi thư viện trên thiết bị. Thay đổi vừa rồi đã được hoàn nguyên.';
            return;
          }
          optimisticStorage = captureAudioLibraryStorageSnapshot(localStorage, principalId);
          await refreshClientCollections(generation);
          if (!collectionRequests.isCurrent(request) || generation !== collectionGeneration) return;
          dispatchAudioStorageEvent('quangtu:audio-library-updated', readPlayerSyncPayload());
          const optimisticPayload = readPlayerSyncPayload();
          await collectionRequests.run(
            request,
            async (signal) => {
              const response = await fetchWithSessionRefresh('/api/player-sync', {
                method: 'PUT',
                headers: { 'content-type': 'application/json', 'x-csrf-token': session.csrfToken! },
                body: JSON.stringify(optimisticPayload),
                signal,
              });
              if (!response.ok) throw new Error('library_sync_failed');
              const remote = await response.json();
              remoteAccepted = true;
              return remote;
            },
            async (remote) => {
              applyRemotePlayerSync(remote);
              await refreshClientCollections(generation);
            },
            async () => {
              replaceStoredLibraryState(previous);
              await refreshClientCollections(generation);
              collectionStatus = 'Không thể đồng bộ thư viện. Thay đổi vừa rồi đã được hoàn nguyên.';
            },
          );
        } finally {
          if (!remoteAccepted && optimisticStorage) {
            try {
              restoreAudioLibraryStorageSnapshotIfUnchanged(
                localStorage, principalId, optimisticStorage, previousStorage,
              );
            } catch {
              // A later hydration for this principal remains the recovery boundary.
            }
          }
        }
      });
    } finally {
      if (collectionRequests.isGenerationCurrent(busyGeneration)) {
        collectionBusyKeys = collectionBusyKeys.filter((value) => value !== key);
      }
    }
  }

  const filtered = $derived.by(() => {
    const recentOrder = new Map(recentAlbumIds.map((albumId, index) => [albumId, index]));
    const matches = albums.filter((album) => {
      if (topic === 'recent' && !recentOrder.has(album.id)) return false;
      if (topic === 'favorite' && !favoriteAlbumIds.includes(album.id)) return false;
      if (topic === 'listen_later' && !listenLaterAlbumIds.includes(album.id)) return false;
      if (topic === 'offline' && !offlineAlbumIds.includes(album.id)) return false;
      if (!['all', 'favorite', 'listen_later', 'recent', 'offline'].includes(topic) && (album.chu_de || 'Pháp ngữ') !== topic) return false;
      if (!matchesTalkMetadataFilters(album, speaker, duration)) return false;
      return matchesVietnameseSearch(
        [album.tieu_de, album.mo_ta, album.chu_de, talkSpeaker(album), ...album.tracks.map((track) => track.title)],
        query
      );
    });

    return matches.sort((left, right) => {
      if (topic === 'recent') return (recentOrder.get(left.id) ?? 999) - (recentOrder.get(right.id) ?? 999);
      if (sort === 'popular') return (right.playCount ?? 0) - (left.playCount ?? 0) || compareContentRecency(left, right);
      if (sort === 'newest') return compareContentRecency(left, right);
      if (sort === 'title') return left.tieu_de.localeCompare(right.tieu_de, 'vi');
      if (sort === 'tracks') return right.tracks.length - left.tracks.length;
      return (right.playCount ?? 0) - (left.playCount ?? 0) || compareContentRecency(left, right);
    });
  });

  let selectedAlbumId = $state<string | null>(null);
  const initialAlbumParams = typeof window !== 'undefined' ? new URLSearchParams(window.location.search) : null;
  const initialAlbumTarget = ['album', 'id', 'album_id', 'phap_thoai', 'phap-thoai', 'audio', 'track']
    .map(key => initialAlbumParams?.get(key)).find(Boolean);
  let recoveredInitialAlbum = false;
  const selectedAlbum = $derived.by(() => {
    if (!selectedAlbumId) return null;
    const direct = albums.find((a) => a.id === selectedAlbumId);
    if (direct) return direct;
    const needle = selectedAlbumId.toLowerCase().trim();
    return albums.find((a) =>
      a.archive_id?.toLowerCase() === needle
      || a.tieu_de.toLowerCase().includes(needle)
      || matchesVietnameseSearch(a.tieu_de, needle)
    ) ?? null;
  });
  let checkedInitialUrl = $state(false);
  let pushedAlbumHistory = false;

  afterNavigate(({ from }) => {
    // Link mới cần áp dụng lại album; cập nhật catalog/session không mở lại album đã đóng.
    if (from) checkedInitialUrl = false;
  });

  function handleSelectAlbum(album: TalkAlbum | null, pushHistory = true, isFromPopState = false): void {
    selectedAlbumId = album?.id ?? null;
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (album) {
        url.searchParams.set('album', album.id);
        if (pushHistory) {
          pushedAlbumHistory = true;
          window.history.pushState({ ...window.history.state, albumId: album.id }, '', url.toString());
        } else {
          window.history.replaceState({ ...window.history.state, albumId: album.id }, '', url.toString());
        }
      } else {
        url.searchParams.delete('album');
        url.searchParams.delete('id');
        url.searchParams.delete('album_id');
        url.searchParams.delete('phap_thoai');
        url.searchParams.delete('phap-thoai');
        url.searchParams.delete('audio');
        url.searchParams.delete('track');
        const nextUrl = url.pathname + (url.search ? url.search : '');
        pushedAlbumHistory = false;
        window.history.replaceState({ ...window.history.state, albumId: null }, '', nextUrl);
      }
    }
  }

  $effect(() => {
    if (checkedInitialUrl || (loading && !albums.length)) return;
    if (typeof window === 'undefined') return;
    const params = page.url.searchParams;
    const searchQuery = params.get('q') || params.get('search');
    if (searchQuery && !query) {
      query = searchQuery;
    }
    const targetId = params.get('album') || params.get('id') || params.get('album_id') || params.get('phap_thoai') || params.get('phap-thoai') || params.get('audio') || params.get('track');
    if (targetId) {
      checkedInitialUrl = true;
      const needle = targetId.toLowerCase().trim();
      const matched = albums.find((a) =>
        a.id === targetId ||
        a.id.toLowerCase() === needle ||
        a.archive_id?.toLowerCase() === needle ||
        a.tieu_de.toLowerCase().includes(needle) ||
        matchesVietnameseSearch(a.tieu_de, needle)
      );
      if (matched) {
        selectedAlbumId = matched.id;
      } else {
        selectedAlbumId = targetId;
      }
    }
  });

  onMount(() => {
    const skeletonPreview = import.meta.env.DEV
      && new URLSearchParams(window.location.search).get('preview') === 'skeleton';
    catalogEnabled = !skeletonPreview;
    void refreshClientCollections();
    const refresh = () => void refreshClientCollections();
    const applyCollectionSession = () => {
      const previousRole = previousCatalogRole;
      const nextCatalogRole = sessionStore.value.user?.role ?? 'guest';
      previousCatalogRole = nextCatalogRole;
      const nextPrincipalId = sessionStore.value.authenticated
        ? sessionStore.value.user?.id ?? null
        : null;
      if (!collectionRequests.transition(nextPrincipalId)) {
        if (['admin', 'ctv'].includes(previousRole) && !['admin', 'ctv'].includes(nextCatalogRole)) handleSelectAlbum(null);
        return;
      }
      const currentUrl = new URL(window.location.href);
      const currentTarget = ['album', 'id', 'album_id', 'phap_thoai', 'phap-thoai', 'audio', 'track']
        .map(key => currentUrl.searchParams.get(key)).find(Boolean);
      const openedPublicAlbum = pushedAlbumHistory && selectedAlbumId === currentTarget
        && albums.some(album => album.id === selectedAlbumId && album.visibility !== 'private');
      if (!recoveredInitialAlbum && previousRole === 'guest' && sessionStore.value.authenticated
        && ((initialAlbumTarget && currentTarget === initialAlbumTarget && !pushedAlbumHistory)
          || openedPublicAlbum)) {
        // Public guest metadata can stay visible while the confirmed account's
        // catalog and collections are loaded, including an explicitly opened
        // public album. A dismissal never reopens it.
        recoveredInitialAlbum = true;
        selectedAlbumId = currentTarget ?? null;
        checkedInitialUrl = false;
      } else handleSelectAlbum(null);
      collectionGeneration += 1;
      collectionBusyKeys = [];
      collectionStatus = '';
      void refreshClientCollections(collectionGeneration);
    };
    const onPopState = () => {
      const params = new URLSearchParams(window.location.search);
      const targetId = params.get('album') || params.get('id') || params.get('album_id') || params.get('phap_thoai') || params.get('phap-thoai') || params.get('audio') || params.get('track');
      if (!targetId) {
        pushedAlbumHistory = false;
        handleSelectAlbum(null, false, true);
      } else {
        selectedAlbumId = targetId;
      }
    };
    const onTalkCatalogUpdated = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail?.albums) {
        queryClient.setQueryData(serverStateKeys.talks.catalogForPrincipal(role, catalogPrincipalId), detail.albums);
        if (detail.newCount > 0) {
          refreshNotice = localeStore.current === 'en'
            ? `Auto-updated ${detail.newCount} new album${detail.newCount > 1 ? 's' : ''}`
            : `Tự động cập nhật ${detail.newCount} bài mới`;
          setTimeout(() => { refreshNotice = null; }, 3500);
        }
      }
    };
    const openVideoAlbum = (event: Event) => {
      const albumId = (event as CustomEvent<{ albumId?: unknown }>).detail?.albumId;
      if (typeof albumId !== 'string' || !albumId) return;
      query = ''; topic = 'all'; speaker = 'all'; duration = 'all';
      selectedAlbumId = albumId;
    };
    window.addEventListener('quangtu:open-video-album', openVideoAlbum);
    window.addEventListener('quangtu:recent-updated', refresh);
    window.addEventListener('quangtu:offline-updated', refresh);
    window.addEventListener('quangtu:audio-library-updated', refresh);
    window.addEventListener('quangtu:player-sync-updated', refresh);
    window.addEventListener('quangtu:talk-catalog-updated', onTalkCatalogUpdated);
    window.addEventListener(SESSION_CHANGE_EVENT, applyCollectionSession);
    window.addEventListener('popstate', onPopState);
    return () => {
      window.removeEventListener('quangtu:open-video-album', openVideoAlbum);
      window.removeEventListener('quangtu:recent-updated', refresh);
      window.removeEventListener('quangtu:offline-updated', refresh);
      window.removeEventListener('quangtu:audio-library-updated', refresh);
      window.removeEventListener('quangtu:player-sync-updated', refresh);
      window.removeEventListener('quangtu:talk-catalog-updated', onTalkCatalogUpdated);
      window.removeEventListener(SESSION_CHANGE_EVENT, applyCollectionSession);
      window.removeEventListener('popstate', onPopState);
      collectionRequests.destroy();
    };
  });
  const activeAlbum = $derived(selectedAlbum);
  const metaTitle = $derived(
    activeAlbum ? `${activeAlbum.tieu_de} — Pháp Thoại Quang Từ` : DEFAULT_TALK_TITLE
  );
  const metaDescription = $derived(
    cleanMetaDescription(activeAlbum?.mo_ta, DEFAULT_TALK_DESCRIPTION)
  );
  const absoluteImageUrl = $derived(
    ensureAbsoluteUrl(activeAlbum?.anh_dai_dien, typeof window !== 'undefined' ? window.location.origin : 'https://quangtu.vn')
  );
  const imageMimeType = $derived(getImageMimeType(absoluteImageUrl));
  const canonicalUrl = $derived(
    activeAlbum
      ? `${(typeof window !== 'undefined' ? window.location.origin : 'https://quangtu.vn')}/phap-thoai?album=${encodeURIComponent(activeAlbum.id)}`
      : 'https://quangtu.vn/phap-thoai'
  );
</script>

<svelte:head>
  <!-- Basic SEO -->
  <title>{metaTitle}</title>
  <meta name="title" content={metaTitle} />
  <meta name="description" content={metaDescription} />
  <link rel="canonical" href={canonicalUrl} />

  <!-- Open Graph / Facebook / Zalo / Messenger -->
  <meta property="og:type" content={activeAlbum ? 'music.album' : 'website'} />
  <meta property="og:site_name" content={DEFAULT_SITE_NAME} />
  <meta property="og:title" content={metaTitle} />
  <meta property="og:description" content={metaDescription} />
  <meta property="og:url" content={canonicalUrl} />
  <meta property="og:image" content={absoluteImageUrl} />
  <meta property="og:image:secure_url" content={absoluteImageUrl} />
  <meta property="og:image:type" content={imageMimeType} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content={metaTitle} />
  <meta property="og:locale" content="vi_VN" />
  {#if activeAlbum}
    <meta property="music:musician" content="Quang Từ" />
    {#if activeAlbum.ngay_dang}
      <meta property="music:release_date" content={activeAlbum.ngay_dang} />
    {/if}
  {/if}

  <!-- Twitter / X -->
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={metaTitle} />
  <meta name="twitter:description" content={metaDescription} />
  <meta name="twitter:image" content={absoluteImageUrl} />
  <meta name="twitter:image:alt" content={metaTitle} />

  <!-- Zalo Compatibility -->
  <meta property="zalo:title" content={metaTitle} />
  <meta property="zalo:description" content={metaDescription} />
  <meta property="zalo:image" content={absoluteImageUrl} />

  <meta name="robots" content="index, follow" />
</svelte:head>

<header class="pt-page-header">
  <div class="pt-page-header-inner">
    <div>
      <span class="pt-page-eyebrow">{t.talks.heroEyebrow}</span>
      <h1 class="pt-page-title">{t.talks.heroTitle} <em>{t.talks.heroTitleAccent}</em></h1>
    </div>
    <span class="pt-page-deco" aria-hidden="true">🎧</span>
  </div>
</header>

<section class="pt-library" aria-busy={loading}>
  <div class="pt-browse-controls" use:catalogScrollArea>
  <div class="pt-toolbar">
    <div class="pt-toolbar-inner">
      <div class="pt-toolbar-main">
        <label class="pt-search-wrap">
          <span class="sr-only">{t.talks.searchPlaceholder}</span>
          <svg width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.35-4.35"/></svg>
          <input class="pt-search" bind:value={query} type="search" placeholder={t.talks.searchPlaceholder} />
          {#if query}
            <button type="button" class="pt-search-clear" onclick={() => query = ''} aria-label={localeStore.current === 'en' ? 'Clear search' : 'Xóa tìm kiếm'}>✕</button>
          {/if}
        </label>
        <div class="pt-toolbar-end">
          <button type="button" class="filter-toggle" aria-expanded={filterOpen} aria-controls="talk-options" onclick={() => filterOpen = !filterOpen}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M4 7h16M4 17h16M8 4v6M16 14v6" /></svg>
            {localizeUi("Tìm kiếm và bộ lọc")}
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d={filterOpen ? 'm6 15 6-6 6 6' : 'm6 9 6 6 6-6'} /></svg>
          </button>
          <TopTenDialog title={localizeUi("Top 10 album được nghe nhiều nhất")} unit={t.talks.playCountUnit} loading={playsQuery.isPending}
            error={playsQuery.isError ? localizeUi('Chưa tải được lượt nghe. Vui lòng thử lại sau.') : ''}
            items={topAlbums.map((album) => ({ id: album.id, title: album.tieu_de, count: album.playCount ?? 0, image: parseAudioArtwork(album.anh_dai_dien).src }))}
            onOpen={(id) => { query = ''; topic = 'all'; speaker = 'all'; duration = 'all'; selectedAlbumId = id; }} />
          {#if !loading && (!error || albums.length > 0)}
            <span class="pt-count">{filtered.length} {t.talks.albumUnit}</span>
          {/if}
        </div>
      </div>
    </div>
  </div>
  <div id="talk-options" hidden={!filterOpen}>
  <div class="pt-options">
      {#if speaker !== 'all' || duration !== 'all' || sort !== 'popular' || query.trim()}
        <div class="filter-summary" aria-live="polite"><span>{speaker !== 'all' ? speaker : localizeUi("Mọi giảng sư")} · {duration !== 'all' ? localizeUi("Đã chọn thời lượng") : localizeUi("Mọi thời lượng")}</span><button type="button" class="filter-reset" onclick={() => { speaker = 'all'; duration = 'all'; sort = 'popular'; query = ''; }}>{localizeUi("Xóa lọc")}</button></div>
      {/if}
      <div class="pt-filter-chips" class:filters-open={filterOpen} id="talk-filters">
        <label class="pt-chip-wrap"><span>{localizeUi("Chủ đề")}</span><select class="pt-chip-select" bind:value={topic} aria-label={localizeUi("Chủ đề")}><option value="all">{t.talks.tabAll}</option><option value="favorite">{t.talks.tabFavorite}</option><option value="listen_later">{t.talks.tabListenLater}</option><option value="recent">{t.talks.tabRecent}</option>{#if offlineCount}<option value="offline">{t.talks.tabOffline}</option>{/if}{#each topics as name (name)}<option value={name}>{topicIcon(name)} {localizeTalkTopic(name, localeStore.current)}</option>{/each}</select></label>
        <label class="pt-chip-wrap"><span>{localizeUi("Người giảng")}</span><select class="pt-chip-select" bind:value={speaker} aria-label={t.talks.allSpeakers}><option value="all">{localizeUi("Mọi giảng sư")}</option>{#each speakers as name (name)}<option value={name}>{name}</option>{/each}</select></label>
        <label class="pt-chip-wrap"><span>{localizeUi("Thời lượng")}</span><select class="pt-chip-select" bind:value={duration} aria-label={t.talks.allDurations}><option value="all">{localizeUi("Mọi thời lượng")}</option><option value="short">{localizeUi("Dưới 15'")}</option><option value="medium">15–45'</option><option value="long">{localizeUi("Trên 45'")}</option><option value="unknown">{localizeUi("Chưa rõ")}</option></select></label>
        <label class="pt-chip-wrap"><span>{localizeUi("Sắp xếp")}</span><select class="pt-chip-select" bind:value={sort} aria-label={localizeUi("Sắp xếp")}><option value="popular">{localizeUi("Nghe nhiều nhất")}</option><option value="newest">{localizeUi("Mới nhất")}</option><option value="title">A–Z</option><option value="tracks">{localizeUi("Nhiều bài")}</option></select></label>
      </div>
  </div>
  <div class="pt-tabs" aria-label={localizeUi("Chủ đề")}>
    <button class:active={topic === 'all'} class="pt-tab" type="button" onclick={() => topic = 'all'}>{t.talks.tabAll} <small>{albums.length}</small></button>
    <button class:active={topic === 'favorite'} class="pt-tab" type="button" onclick={() => topic = 'favorite'}>{t.talks.tabFavorite} <small>{favoriteCount}</small></button>
    <button class:active={topic === 'listen_later'} class="pt-tab" type="button" onclick={() => topic = 'listen_later'}>{t.talks.tabListenLater} <small>{listenLaterCount}</small></button>
    <button class:active={topic === 'recent'} class="pt-tab pt-tab-recent" type="button" onclick={() => topic = 'recent'}>{t.talks.tabRecent} <small>{recentCount}</small></button>
    {#each topics as name (name)}
      <button class:active={topic === name} class="pt-tab" type="button" onclick={() => topic = name}>{topicIcon(name)} {name} <small>{topicCount(name)}</small></button>
    {/each}
    {#if offlineCount}<button class:active={topic === 'offline'} class="pt-tab pt-tab-offline" type="button" onclick={() => topic = 'offline'}>{t.talks.tabOffline} <small>{offlineCount}</small></button>{/if}
  </div>

  </div>
  </div>

  {#if loading}
    <p class="sr-only" role="status">{t.talks.loading}</p>
    <AudioCatalogSkeleton />
  {:else if error}
    <div class="state error" role="alert"><p>{error}</p><button type="button" onclick={() => void albumsQuery.refetch()}>{t.talks.retry}</button></div>
  {:else if filtered.length === 0}
    <p class="state">{topic === 'offline' ? t.talks.emptyOffline : t.talks.emptySearch}</p>
  {:else}
    <AudioCatalog
      albums={filtered}
      {recentAlbumIds}
      {favoriteAlbumIds}
      {listenLaterAlbumIds}
      {collectionBusyKeys}
      {offlineAlbumIds}
      {role}
      {selectedAlbumId}
      onOfflineChanged={refreshClientCollections}
      onSelectAlbum={handleSelectAlbum}
      onCollectionToggle={(album, collection) => void toggleCollection(album, collection)}
    />
  {/if}
  {#if collectionStatus}<p class="state" role="status">{collectionStatus}</p>{/if}
</section>

<style>
  .pt-tab { min-width:44px; min-height:44px; flex-shrink:0; }
  :global(body),:global(button),:global(input),:global(select),:global(textarea){font-family:var(--font-app)!important}
  .pt-page-header{padding:14px 24px 12px;border-bottom:1px solid var(--border);background:linear-gradient(135deg,var(--gold-muted) 0%,rgba(232,208,160,.2) 100%)}
  :global([data-theme="dark"]) .pt-page-header{background:linear-gradient(135deg,rgba(200,150,62,.07) 0%,transparent 80%)}
  .pt-page-header-inner{display:flex;align-items:center;justify-content:space-between;max-width:900px;margin:0 auto;gap:16px}
  .pt-page-eyebrow{display:block;margin-bottom:3px;color:var(--gold);font-size:var(--font-size-meta);font-weight:700;letter-spacing:2.5px;text-transform:uppercase}
  .pt-page-title{margin:0;color:var(--brown-dark);font-size:var(--font-size-section-title);font-weight:800;line-height:1.25;letter-spacing:-.3px}
  :global([data-theme="dark"]) .pt-page-title{color:var(--text)}
  .pt-page-title em{color:var(--gold);font-style:normal}
  .pt-page-deco{font-size:32px;opacity:.16;flex-shrink:0;line-height:1}
  .pt-library{padding-bottom:24px}
  .pt-browse-controls{display:block;position:sticky;top:var(--site-header-height,var(--nav-h));z-index:120;background:var(--white)}
  .pt-toolbar{padding:8px 20px;border-bottom:1px solid var(--border2);background:var(--white)}
  :global([data-theme="dark"]) .pt-toolbar{background:var(--bg)}
  .pt-toolbar-inner{max-width:900px;margin:0 auto}
  .pt-toolbar-main{display:flex;flex-direction:column;align-items:stretch;gap:var(--radius)}
  .pt-search-wrap{position:relative;display:block;min-width:0;width:100%}
  .pt-search-wrap svg{position:absolute;top:50%;left:10px;transform:translateY(-50%);color:var(--muted);pointer-events:none}
  .pt-search{width:100%;padding:6px 12px 6px 30px;border:1.5px solid var(--border2);border-radius:12px;outline:none;background:var(--bg);color:var(--text);font-family:inherit;font-size:16px;line-height:normal;transition:border-color .15s,background .15s}
  .pt-search:focus{border-color:var(--gold);background:var(--white)}
  :global([data-theme="dark"]) .pt-search:focus{background:var(--bg2)}
  .pt-search-clear{position:absolute;right:8px;top:50%;transform:translateY(-50%);width:17px;height:17px;display:grid;place-items:center;border:0;background:var(--bg3);color:var(--muted);border-radius:999px;font-size:9.5px;cursor:pointer;line-height:1;transition:background .15s,color .15s}
  .pt-search-clear:hover{background:var(--gold-muted);color:var(--gold)}
  @keyframes pt-toast-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}
  .pt-filter-chips{display:flex;align-items:center;gap:6px;flex-shrink:0}
  .pt-chip-wrap{display:grid;grid-template-columns:calc(var(--space-page) * 4.5) minmax(0,1fr);align-items:center;gap:var(--radius);min-width:0;color:var(--text2);font-size:var(--font-size-label)}
  .pt-chip-select{padding:5px 22px 5px 10px;border:1.5px solid var(--border2);border-radius:10px;outline:none;background-color:var(--bg);background-image:url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='7' viewBox='0 0 10 7'%3E%3Cpath d='M1 1l4 4 4-4' stroke='%238A7B68' stroke-width='1.5' fill='none' stroke-linecap='round'/%3E%3C/svg%3E");background-repeat:no-repeat;background-position:right 8px center;background-size:10px;color:var(--text2);font-family:inherit;font-size:16px;font-weight:600;line-height:normal;appearance:none;cursor:pointer;transition:border-color .15s,color .15s}
  .pt-chip-select:focus{border-color:var(--gold);color:var(--text)}
  .pt-toolbar-end{display:flex;align-items:center;gap:var(--radius-sm);flex-wrap:wrap;min-width:0}
  :global(.pt-toolbar .top-ten-trigger){min-height:44px!important;height:44px!important;padding:0 12px!important;font-size:var(--font-size-label)!important;font-weight:600!important;border-radius:10px!important;border:1.5px solid var(--border2)!important;background:var(--bg)!important;color:var(--text2)!important;display:inline-flex!important;align-items:center!important;cursor:pointer;transition:all .15s ease;line-height:normal!important}
  :global([data-theme="dark"] .pt-toolbar .top-ten-trigger){background:var(--bg2)!important;border-color:var(--border2)!important}
  :global(.pt-toolbar .top-ten-trigger:hover){border-color:var(--gold)!important;color:var(--gold)!important;background:var(--gold-muted)!important}
  .pt-count{margin-left:auto;color:var(--text2);font-size:var(--font-size-meta);font-weight:600;white-space:nowrap}
  .pt-tabs{display:flex;overflow-x:auto;gap:5px;padding:7px 20px;border-bottom:1px solid var(--border2);background:var(--white);scrollbar-width:none}
  :global([data-theme="dark"]) .pt-tabs{background:var(--bg)}
  .pt-tab{display:inline-flex;min-height:44px;align-items:center;gap:5px;padding:6px 13px;border:1.5px solid transparent;border-radius:10px;background:transparent;color:var(--text2);font-family:inherit;font-size:var(--font-size-label);font-weight:600;line-height:normal;white-space:nowrap;cursor:pointer;transition:background .15s,color .15s,border-color .15s}
  .pt-tab:hover:not(.active){background:var(--bg2);color:var(--text)}
  .pt-tab-recent{color:var(--gold2)}
  .pt-tab-offline,.pt-tab-offline.active{color:#27ae60}
  .pt-tab.active{border-color:var(--gold);background:var(--gold-light);color:var(--brown,#6b4e2a);font-weight:700}
  :global([data-theme="dark"]) .pt-tab.active{background:var(--gold-muted);color:var(--gold2)}
  .pt-tab.active.pt-tab-offline{border-color:#27ae60;background:rgba(39,174,96,.1);color:#27ae60}
  .pt-tab small{padding:1px 6px;border-radius:10px;background:var(--bg3);color:var(--muted);font-size:var(--font-size-meta);font-weight:700}
  .pt-tab.active small{background:var(--gold-muted);color:var(--gold)}
  .pt-tab.active.pt-tab-offline small{background:#27ae60;color:#fff}
  .pt-library>:global(.album-grid){width:min(880px,calc(100% - 32px));margin:18px auto 0}
  .state{padding:56px;text-align:center;color:var(--muted)}.state p{margin:0 0 12px}.state button{min-width:44px;min-height:44px;border:0;background:none;color:var(--gold);font:inherit;font-weight:700;cursor:pointer}.state.error{color:var(--red)}
  .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0 0 0 0)}
  @media(max-width:860px){
    .pt-filter-chips{width:100%;overflow-x:auto;scrollbar-width:none;-webkit-overflow-scrolling:touch;padding-bottom:2px}

  }
  @media(max-width:600px){
    .pt-page-header{padding:12px 16px}
    .pt-toolbar{padding:7px 14px}
    .pt-tabs{padding:6px 14px;gap:3px}
    .pt-library>:global(.album-grid){width:calc(100% - 24px);margin-top:14px}
    .pt-chip-select{font-size:16px;padding:5px 20px 5px 9px}
  }
  @media(max-width:600px) and (max-height:500px){
    .pt-toolbar{padding-block:4px}
  }
  .pt-toolbar .pt-search{min-height:44px;font-size:16px;border-radius:var(--radius-feature)}
  .pt-toolbar .filter-toggle{display:inline-flex;align-items:center;justify-content:center;gap:var(--radius-sm);min-width:44px;background:var(--gold-light);border-color:var(--gold);color:var(--gold)}
  .pt-toolbar .filter-toggle:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .pt-options{display:flex;flex-direction:column;align-items:stretch;gap:var(--radius);max-width:900px;margin:var(--radius) auto;padding:var(--space-page);border:1px solid var(--border);border-radius:var(--radius-card);background:var(--gold-light)}
  #talk-options[hidden]{display:none}
  .pt-options .pt-filter-chips{display:grid!important;grid-template-columns:minmax(0,1fr);gap:var(--radius-control);width:100%;overflow:visible;padding:0}
  .pt-options .pt-chip-wrap{font-size:16px}
  .pt-options .pt-chip-select{width:100%;min-width:0;min-height:44px;max-width:100%;font-size:16px;border-radius:var(--radius-control);background-color:var(--card)}
  .pt-browse-controls .pt-tabs{max-width:900px;margin:0 auto;flex-wrap:wrap;overflow:visible;border:0;background:transparent}
  .pt-browse-controls .pt-tab{max-width:100%;white-space:normal;overflow-wrap:anywhere}
  .pt-options .filter-summary{width:100%;margin:0}
  @media(max-width:940px){.pt-options{margin-inline:var(--space-page)}}
</style>
