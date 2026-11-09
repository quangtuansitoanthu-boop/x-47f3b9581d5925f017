<script lang="ts">
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  import { copyVerifiedTalkCatalog } from '$lib/browser/talk-catalog-proof';
  const localizeUi = createInterfaceTranslator();
  import { sessionCover } from '$lib/browser/session-cover';
  import { acquireScrollLock } from '$lib/browser/scroll-lock';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { confirmInApp, promptInApp } from '$lib/browser/app-dialog';
  let releaseBodyScroll: (() => void) | null = null;
  import { onMount, tick } from 'svelte';

  import {
    authorizeDownload,
    downloadAlbumAsZip,
    downloadAlbumForOffline,
    downloadSingleTrackFile,
    estimateOfflineQuota,
    readAlbumDownloadSize,
  } from '$lib/browser/audio-downloads';
  import { deleteOfflineAlbum, readOfflineLibrarySnapshot } from '$lib/browser/offline-audio-database';
  import { readStoredAlbumPosition } from '$lib/browser/audio-sync';
  import { getBrowserSession, hasUsableBrowserCsrf, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import { resolvePublicUrl } from '$lib/browser/native-api';
  import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { parseAudioArtwork } from '$lib/domain/audio-artwork';
  import { handleCoverImgError, normalizeCoverSrc } from '$lib/domain/cover-url';
  import { audioPlayer, getAudioPlayer } from '$lib/stores/audio-player.svelte';
  import { formatVietnamDate } from '$lib/utils/vietnam-date-format';
  import AudioResumePrompt from './AudioResumePrompt.svelte';
  import TalkVideoViewer from './TalkVideoViewer.svelte';
  import { localizeTalkTopic, talkVideoText } from '$lib/i18n/talk-video';
  import {
    offlineDownloadControl,
    type AlbumTransferProgress,
  } from './audio-download-control-state';
  import { isOnlineOnlyAudioAlbum } from '$lib/domain/online-only-policy';
  import { isNativeApp } from '$lib/browser/native-platform';
  import { getLocaleContext } from '$lib/stores/locale.svelte';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);
  const mediaText = $derived(talkVideoText[localeStore.current]);

  export interface TalkTrack {
    title: string;
    url: string;
    duration_sec?: number;
    media_type?: 'video';
  }

  export interface TalkAlbum {
    id: string;
    tieu_de: string;
    mo_ta?: string;
    chu_de?: string;
    dien_gia?: string | null;
    archive_id?: string | null;
    anh_dai_dien?: string | null;
    tracks: TalkTrack[];
    visibility?: string;
    ngay_dang?: string | null;
    created_at?: string | null;
    playCount?: number;
  }

  interface Props {
    albums: TalkAlbum[];
    role: 'guest' | 'user' | 'ctv' | 'admin';
    recentAlbumIds?: string[];
    favoriteAlbumIds?: string[];
    listenLaterAlbumIds?: string[];
    collectionBusyKeys?: string[];
    offlineAlbumIds?: string[];
    selectedAlbumId?: string | null;
    onOfflineChanged?: () => void;
    onEdit?: (album: TalkAlbum) => void;
    onSelectAlbum?: (album: TalkAlbum | null) => void;
    onCollectionToggle?: (album: TalkAlbum, collection: 'favorite' | 'listen_later') => void;
  }

  interface PendingResume {
    album: TalkAlbum;
    trackIndex: number;
    positionSeconds: number;
    trackTitle: string;
  }

  let {
    albums,
    role,
    recentAlbumIds = [],
    favoriteAlbumIds = [],
    listenLaterAlbumIds = [],
    collectionBusyKeys = [],
    offlineAlbumIds = [],
    selectedAlbumId = null,
    onOfflineChanged = () => {},
    onEdit = () => {},
    onSelectAlbum = () => {},
    onCollectionToggle = () => {},
  }: Props = $props();

  let selected = $state<TalkAlbum | null>(null);
  let offlineNoticeVisible = $state(false);

  $effect(() => {
    const albumId = selected?.id;
    offlineNoticeVisible = Boolean(albumId);
    if (!albumId) return;
    const timer = setTimeout(() => { offlineNoticeVisible = false; }, 10_000);
    return () => clearTimeout(timer);
  });
  let videoExpanded = $state(true);
  const selectedHasVideo = $derived(Boolean(selected?.tracks.some(track => track.media_type === 'video')));
  const selectedVideoTrack = $derived(selected?.id === $audioPlayer.album?.id
    && selected?.tracks[$audioPlayer.trackIndex]?.media_type === 'video'
    ? selected.tracks[$audioPlayer.trackIndex] : null);
  const videoIsFull = $derived(Boolean(selectedVideoTrack && videoExpanded));
  let downloadStatus = $state<Record<string, string>>({});
  let albumStatuses = $state<Record<string, 'none' | 'partial' | 'downloaded'>>({});
  let offlineStateReady = $state(false);
  let offlineTrackCounts = $state<Record<string, number>>({});
  let busyModes = $state<Record<string, 'offline' | 'zip' | null>>({});
  let transferProgress = $state<Record<string, AlbumTransferProgress | null>>({});
  let storageStatus = $state('');
  let trackDownloadPending = $state(false);
  let albumDialog = $state<HTMLElement | null>(null);
  let offlineConfirmation = $state<{ album: TalkAlbum; trigger: HTMLElement } | null>(null);
  let offlineSize = $state<{ bytes: number | null; remaining: number } | null>(null);
  let offlineSizeController: AbortController | null = null;
  let loginModalOpen = $state(false);
  let pendingResume = $state<PendingResume | null>(null);
  let resumePromptVisible = $state(false);
  let shareToast = $state('');
  let shareToastTimer: ReturnType<typeof setTimeout> | undefined;
  let albumReturnFocus: HTMLElement | null = null;
  let previousBodyOverflow = '';
  let albumOpenGeneration = 0;
  let disposed = false;
  let offlineStateGeneration = 0;
  let resumeOpenTimer: ReturnType<typeof setTimeout> | undefined;
  let resumeDismissTimer: ReturnType<typeof setTimeout> | undefined;
  let resumeAnimationTimer: ReturnType<typeof setTimeout> | undefined;
  let failedArtworkIds = $state<Set<string>>(new Set());

  interface AudioOfflineProgress {
    albumId: string;
    albumTitle: string;
    completed: number;
    total: number;
    currentTitle: string;
    percent: number;
    bytesDownloaded: number;
  }

  let audioDownloadModalOpen = $state(false);
  let audioDownloadProgress = $state<AudioOfflineProgress | null>(null);
  let audioDownloadError = $state('');

  function cancelAudioOfflineDownload(): void {
    if (audioDownloadProgress?.albumId) {
      offlineControllers.get(audioDownloadProgress.albumId)?.abort();
    }
    audioDownloadModalOpen = false;
  }

  const offlineControllers = new Map<string, AbortController>();
  const zipControllers = new Map<string, AbortController>();
  let trackDownload: { controller: AbortController; albumId: string } | undefined;
  const pendingOfflineRemovals = new Set<string>();
  let transferSession: ReturnType<typeof transferIdentity> | undefined;
  function transferIdentity() {
    const session = getBrowserSessionSnapshot();
    const id = session.authenticated ? session.user?.id ?? null : null;
    const role = session.user?.role ?? 'guest';
    return { id, role, key: JSON.stringify([id, role]) };
  }
  function rememberTransferSession(): string {
    transferSession = transferIdentity();
    return transferSession.key;
  }

  const mapped = (album: TalkAlbum) => copyVerifiedTalkCatalog({
    id: album.id,
    title: album.tieu_de,
    description: album.mo_ta || 'Pháp Thoại',
    artwork: album.anh_dai_dien ?? undefined,
    tracks: album.tracks,
    visibility: album.visibility === 'private' ? 'private' as const : album.visibility === 'public' ? 'public' as const : undefined,
  }, album);

  const recentLookup = $derived(new Set(recentAlbumIds));
  const favoriteLookup = $derived(new Set(favoriteAlbumIds));
  const listenLaterLookup = $derived(new Set(listenLaterAlbumIds));
  const collectionBusyLookup = $derived(new Set(collectionBusyKeys));
  const offlineLookup = $derived(new Set(offlineAlbumIds));
  const selectedArtwork = $derived(parseAudioArtwork(normalizeCoverSrc(selected?.anh_dai_dien)));
  const isSelectedOnlineOnly = $derived(Boolean(selected && isOnlineOnlyAudioAlbum(selected.tieu_de, selected.dien_gia)));

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

  function topicIcon(topic?: string): string {
    return TOPIC_ICONS[String(topic || 'Pháp ngữ').trim()] || '🎧';
  }

  function showToast(msg: string): void {
    clearTimeout(shareToastTimer);
    shareToast = msg;
    shareToastTimer = setTimeout(() => {
      shareToast = '';
      shareToastTimer = undefined;
    }, 3000);
  }

  async function shareAlbum(album: TalkAlbum): Promise<void> {
    if (typeof window === 'undefined') return;
    const url = new URL(resolvePublicUrl('/phap-thoai'));
    url.searchParams.set('album', album.id);
    const shareUrl = url.toString();
    const shareData = {
      title: localizeUi("{0} — Pháp Thoại Quang Từ", album.tieu_de),
      text: album.mo_ta || localizeUi('Lắng nghe album pháp thoại “{0}”', album.tieu_de),
      url: shareUrl,
    };

    if (typeof navigator !== 'undefined' && navigator.share && navigator.canShare?.(shareData)) {
      try {
        await navigator.share(shareData);
        showToast(localeStore.current === 'en' ? 'Album link shared!' : 'Đã mở chia sẻ album.');
        return;
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') return;
      }
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      showToast(localeStore.current === 'en' ? 'Album link copied!' : 'Đã sao chép link chia sẻ album!');
    } catch {
      await promptInApp(localeStore.current === 'en' ? 'Copy album link:' : 'Sao chép liên kết chia sẻ album:', shareUrl);
    }
  }

  function markArtworkBroken(albumId: string): void {
    failedArtworkIds = new Set([...failedArtworkIds, albumId]);
  }

  function setAlbumStatus(albumId: string, value: string): void {
    if (disposed) return;
    downloadStatus = { ...downloadStatus, [albumId]: value };
  }

  function setTransferProgress(albumId: string, value: AlbumTransferProgress | null): void {
    if (disposed) return;
    transferProgress = { ...transferProgress, [albumId]: value };
  }

  function clearResumePrompt(): void {
    clearTimeout(resumeOpenTimer);
    clearTimeout(resumeDismissTimer);
    clearTimeout(resumeAnimationTimer);
    resumeOpenTimer = undefined;
    resumeDismissTimer = undefined;
    resumeAnimationTimer = undefined;
    resumePromptVisible = false;
    pendingResume = null;
  }

  $effect(() => {
    if (selectedAlbumId && selectedAlbumId !== selected?.id) {
      const match = albums.find((a) => a.id === selectedAlbumId);
      if (match) void openAlbum(match, null);
    } else if (!selectedAlbumId && selected) {
      closeAlbum();
    }
  });

  async function openAlbum(album: TalkAlbum, trigger: EventTarget | null): Promise<void> {
    const generation = ++albumOpenGeneration;
    clearResumePrompt();
    albumReturnFocus = trigger instanceof HTMLElement ? trigger : null;
    if (disposed || generation !== albumOpenGeneration) return;
    selected = album;
    videoExpanded = true;
    if (selectedAlbumId !== album.id) {
      onSelectAlbum(album);
    }

    releaseBodyScroll ??= acquireScrollLock();
    await tick();
    if (disposed || generation !== albumOpenGeneration || selected?.id !== album.id) return;
    albumDialog?.focus({ preventScroll: true });
    const player = await getAudioPlayer();
    await player.ready;
    if (disposed || loginModalOpen || generation !== albumOpenGeneration || selected?.id !== album.id) return;
    if (selectedVideoTrack) return;
    scheduleResumePrompt(album);
  }

  function closeAlbum(): void {
    closeOfflineConfirmation();
    if (!selected) return;
    albumOpenGeneration += 1;
    clearResumePrompt();
    selected = null;
    onSelectAlbum(null);
    releaseBodyScroll?.(); releaseBodyScroll = null;
    albumReturnFocus?.focus({ preventScroll: true });
  }

  function scheduleResumePrompt(album: TalkAlbum): void {
    if (disposed || loginModalOpen) return;
    const saved = readStoredAlbumPosition(album.id);
    const trackIndex = Number(saved?.trackIndex);
    const positionSeconds = Number(saved?.pos || 0);
    const track = album.tracks[trackIndex];
    if (!saved || positionSeconds < 10 || !Number.isInteger(trackIndex) || !track) return;
    if ($audioPlayer.album?.id === album.id && $audioPlayer.playing) return;

    resumeOpenTimer = setTimeout(() => {
      if (disposed || loginModalOpen || selected?.id !== album.id) return;
      if ($audioPlayer.album?.id === album.id && $audioPlayer.playing) return;
      pendingResume = {
        album,
        trackIndex,
        positionSeconds,
        trackTitle: saved.trackTitle || track.title || localizeUi('Bài {0}', trackIndex + 1),
      };
      resumeAnimationTimer = setTimeout(() => {
        if (pendingResume?.album.id === album.id) resumePromptVisible = true;
      });
      resumeDismissTimer = setTimeout(() => void resolveResume(false), 15_000);
    }, 400);
  }

  async function resolveResume(choice: true | false | null): Promise<void> {
    const resume = pendingResume;
    clearTimeout(resumeOpenTimer);
    clearTimeout(resumeDismissTimer);
    clearTimeout(resumeAnimationTimer);
    resumeOpenTimer = undefined;
    resumeDismissTimer = undefined;
    resumePromptVisible = false;
    resumeAnimationTimer = setTimeout(() => {
      if (pendingResume === resume) pendingResume = null;
      resumeAnimationTimer = undefined;
    }, 280);
    albumDialog?.focus({ preventScroll: true });
    if (!resume || choice === null) return;
    if (choice) {
      await play(resume.album, resume.trackIndex, resume.positionSeconds, false);
      return;
    }
    if ($audioPlayer.album?.id === resume.album.id) {
      (await getAudioPlayer()).seek(0);
    }
  }

  async function play(album: TalkAlbum, trackIndex = 0, resumeSeconds = 0, dismissPrompt = true): Promise<void> {
    if (dismissPrompt) clearResumePrompt();
    if (album.tracks[trackIndex]?.media_type === 'video') videoExpanded = true;
    const player = await getAudioPlayer();
    await player.playTrack(mapped(album), trackIndex, resumeSeconds);
  }

  async function playAll(album: TalkAlbum): Promise<void> {
    clearResumePrompt();
    await (await getAudioPlayer()).playAll(mapped(album));
  }

  async function playFromCard(album: TalkAlbum): Promise<void> {
    const saved = readStoredAlbumPosition(album.id);
    const trackIndex = Number(saved?.trackIndex);
    const positionSeconds = Number(saved?.pos || 0);
    if (saved && positionSeconds >= 10 && Number.isInteger(trackIndex) && album.tracks[trackIndex]) {
      await play(album, trackIndex, positionSeconds);
      return;
    }
    await play(album);
  }

  async function cycleRepeat(): Promise<void> {
    (await getAudioPlayer()).cycleRepeat();
  }

  function repeatLabel(): string {
    if ($audioPlayer.repeat === 1) return t.talks.repeatOne;
    if ($audioPlayer.repeat === 2) return t.talks.repeatAll;
    return t.talks.repeatOff;
  }

  function formatBytes(bytes: number): string {
    if (!Number.isFinite(bytes) || bytes <= 0) return '0 MB';
    return `${(bytes / 1024 / 1024).toFixed(bytes >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
  }

  function focusableItems(container: HTMLElement): HTMLElement[] {
    return [...container.querySelectorAll<HTMLElement>(
      'button:not(:disabled),a[href],input:not(:disabled),select:not(:disabled),textarea:not(:disabled),[tabindex]:not([tabindex="-1"])',
    )].filter((element) => !element.hasAttribute('hidden') && !element.closest('[inert]') && element.getAttribute('aria-hidden') !== 'true');
  }

  function trapAlbumFocus(event: KeyboardEvent): boolean {
    if (event.key !== 'Tab' || !selected || !albumDialog || pendingResume) return false;
    const items = focusableItems(albumDialog);
    if (!items.length) return false;
    const first = items[0];
    const last = items[items.length - 1];
    if (event.shiftKey && (document.activeElement === first || document.activeElement === albumDialog)) {
      event.preventDefault();
      last.focus();
      return true;
    }
    if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
      return true;
    }
    return false;
  }

  async function syncOfflineState(): Promise<void> {
    // Root đăng ký session sau lượt mount con; chờ để đọc đúng principal ngay lần đầu.
    await tick();
    if (disposed) return;
    const generation = offlineStateGeneration;
    const session = getBrowserSessionSnapshot();
    const principalId = session.authenticated ? session.user?.id ?? null : null;
    const snapshot = await readOfflineLibrarySnapshot().catch(() => ({
      albums: [],
      bytes: 0,
      trackCounts: {} as Record<string, number>,
    }));
    const current = getBrowserSessionSnapshot();
    if (disposed || generation !== offlineStateGeneration) return;
    if (principalId !== (current.authenticated ? current.user?.id ?? null : null) || session.user?.role !== current.user?.role) {
      void syncOfflineState();
      return;
    }
    const downloadedIds = new Set(snapshot.albums.map((album) => album.id));
    const nextStatuses: Record<string, 'none' | 'partial' | 'downloaded'> = {};
    const knownIds = new Set([...albums.map(album => album.id), ...downloadedIds, ...Object.keys(snapshot.trackCounts)]);
    for (const albumId of knownIds) {
      const count = snapshot.trackCounts[albumId] ?? 0;
      if (downloadedIds.has(albumId)) nextStatuses[albumId] = 'downloaded';
      else if (count > 0) nextStatuses[albumId] = 'partial';
      else nextStatuses[albumId] = 'none';
    }
    albumStatuses = nextStatuses;
    offlineStateReady = true;
    offlineTrackCounts = snapshot.trackCounts;
    storageStatus = snapshot.bytes > 0 ? `Đang lưu offline ${formatBytes(snapshot.bytes)}.` : '';
    window.dispatchEvent(new CustomEvent('quangtu:offline-updated', { detail: nextStatuses }));
    onOfflineChanged();
  }

  async function requireDownloadAccess(reason: 'offline' | 'zip' | 'mp3', returnFocusTo?: HTMLElement): Promise<void> {
    if (isNativeApp() && reason === 'offline') {
      return;
    }
    const principal = transferIdentity().key;
    const requireLogin = (): never => {
      window.dispatchEvent(new CustomEvent('quangtu:login-required', {
        detail: { reason, returnTo: '/phap-thoai', returnFocusTo },
      }));
      throw new Error('authentication_required');
    };
    const session = await getBrowserSession();
    if (disposed) throw new DOMException('Component disposed', 'AbortError');
    if (!session.authenticated) requireLogin();
    if (principal !== transferIdentity().key) throw new DOMException('Session changed', 'AbortError');
    let csrfToken = session.csrfToken;
    if (!hasUsableBrowserCsrf(csrfToken)) {
      try {
        csrfToken = await requireBrowserCsrf();
      } catch (error) {
        if (disposed) throw new DOMException('Component disposed', 'AbortError');
        if (!getBrowserSessionSnapshot().authenticated) requireLogin();
        throw error;
      }
    }
    if (disposed || principal !== transferIdentity().key) throw new DOMException('Session changed', 'AbortError');
    await authorizeDownload(csrfToken);
    if (disposed || principal !== transferIdentity().key) throw new DOMException('Session changed', 'AbortError');
  }

  async function removeOffline(album: TalkAlbum): Promise<void> {
    const albumId = album.id;
    if (pendingOfflineRemovals.has(albumId)) return;
    pendingOfflineRemovals.add(albumId);
    const principal = transferIdentity().key;
    try {
      if (!await confirmInApp(`Xóa bản offline của album "${album.tieu_de}"?`)) return;
      if (disposed || transferIdentity().key !== principal) return;
      await deleteOfflineAlbum(albumId);
      setAlbumStatus(albumId, localizeUi('Đã xóa bản offline.'));
      await syncOfflineState();
    } finally {
      pendingOfflineRemovals.delete(albumId);
    }
  }

  async function toggleOffline(album: TalkAlbum, returnFocusTo: HTMLElement): Promise<void> {
    if (disposed) return;
    if (albumStatuses[album.id] === 'downloaded') {
      await removeOffline(album);
      return;
    }

    if (offlineControllers.has(album.id) || zipControllers.has(album.id)) return;
    if (offlineConfirmation) return;
    rememberTransferSession();
    offlineConfirmation = { album, trigger: returnFocusTo };
    offlineSize = null;
    const controller = new AbortController();
    offlineSizeController = controller;
    const timeout = setTimeout(() => {
      if (!disposed && offlineSizeController === controller) {
        offlineSize = { bytes: null, remaining: album.tracks.length };
        controller.abort();
      }
    }, 10_000);
    try {
      const size = await readAlbumDownloadSize(
        { ...mapped(album), desc: album.mo_ta || '' },
        { signal: controller.signal },
      );
      if (!disposed && !controller.signal.aborted) offlineSize = size;
    } catch {
      if (!disposed && !controller.signal.aborted) offlineSize = { bytes: null, remaining: album.tracks.length };
    } finally {
      clearTimeout(timeout);
    }
  }

  function closeOfflineConfirmation(): void {
    offlineSizeController?.abort();
    offlineSizeController = null;
    offlineConfirmation = null;
    offlineSize = null;
  }

  async function confirmOfflineDownload(): Promise<void> {
    const pending = offlineConfirmation;
    if (!pending || !offlineSize) return;
    const expectedRemainingBytes = offlineSize.bytes;
    closeOfflineConfirmation();
    await startOfflineDownload(pending.album, pending.trigger, expectedRemainingBytes);
  }

  async function startOfflineDownload(album: TalkAlbum, returnFocusTo: HTMLElement, expectedRemainingBytes: number | null): Promise<void> {
    if (disposed || offlineControllers.has(album.id) || zipControllers.has(album.id)) return;
    const principal = rememberTransferSession();
    const quota = await estimateOfflineQuota().catch(() => null);
    if (disposed || principal !== transferIdentity().key) return;
    if (quota) {
      storageStatus = quota.quotaBytes == null
        ? localizeUi('Trình duyệt đang lưu khoảng {0} dữ liệu offline.', formatBytes(quota.savedBytes))
        : localizeUi('Offline {0} / quota ~{1}.', formatBytes(quota.savedBytes), formatBytes(quota.quotaBytes));
    }

    const controller = new AbortController();
    offlineControllers.set(album.id, controller);
    busyModes = { ...busyModes, [album.id]: 'offline' };
    const initialCompleted = Math.min(offlineTrackCounts[album.id] ?? 0, album.tracks.length);
    const initialPercent = Math.min(100, Math.round((initialCompleted / album.tracks.length) * 100));

    audioDownloadProgress = {
      albumId: album.id,
      albumTitle: album.tieu_de,
      completed: initialCompleted,
      total: album.tracks.length,
      currentTitle: album.tracks[initialCompleted]?.title || '',
      percent: initialPercent,
      bytesDownloaded: 0,
    };
    audioDownloadError = '';
    audioDownloadModalOpen = true;

    setTransferProgress(album.id, {
      mode: 'offline',
      completed: initialCompleted,
      total: album.tracks.length,
    });
    setAlbumStatus(album.id, localizeUi('Đang chuẩn bị tải album…'));

    try {
      await downloadAlbumForOffline(
        { ...mapped(album), desc: album.mo_ta || '' },
        {
          signal: controller.signal,
          quota,
          expectedRemainingBytes,
          authorize: () => requireDownloadAccess('offline', returnFocusTo),
          onProgress: ({ completed, total, currentTitle, bytesDownloaded, percent }) => {
            if (disposed || controller.signal.aborted) return;
            const currentPercent = typeof percent === 'number' ? percent : Math.min(100, Math.round((completed / total) * 100));
            audioDownloadProgress = {
              albumId: album.id,
              albumTitle: album.tieu_de,
              completed,
              total,
              currentTitle,
              percent: currentPercent,
              bytesDownloaded: bytesDownloaded ?? 0,
            };
            setTransferProgress(album.id, { mode: 'offline', completed, total });
            setAlbumStatus(
              album.id,
              `Offline ${completed}/${total} · ${currentTitle} · ${formatBytes(bytesDownloaded ?? 0)}`,
            );
          },
        },
      );
      setAlbumStatus(album.id, localizeUi('Đã lưu album để nghe offline.'));
      audioDownloadModalOpen = false;
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setAlbumStatus(album.id, localizeUi('Đã dừng tải. Các track hoàn tất vẫn được giữ nguyên.'));
        audioDownloadModalOpen = false;
      } else if (String(error).includes('authentication_required')) {
        setAlbumStatus(album.id, '');
        audioDownloadModalOpen = false;
      } else if (error instanceof Error && /quota/i.test(error.name + error.message)) {
        const msg = localizeUi('Không đủ dung lượng trình duyệt. Hãy giải phóng bộ nhớ rồi tải tiếp.');
        setAlbumStatus(album.id, msg);
        audioDownloadError = msg;
      } else if (error instanceof Error && error.message.includes('trực tuyến')) {
        setAlbumStatus(album.id, error.message);
        audioDownloadError = error.message;
      } else {
        const msg = localizeUi('Không thể tải album. Bạn có thể thử lại để tiếp tục phần còn thiếu.');
        setAlbumStatus(album.id, msg);
        audioDownloadError = msg;
      }
    } finally {
      if (offlineControllers.get(album.id) === controller) offlineControllers.delete(album.id);
      if (!disposed) {
        busyModes = { ...busyModes, [album.id]: null };
        setTransferProgress(album.id, null);
        await syncOfflineState();
      }
    }
  }

  async function downloadZip(album: TalkAlbum, returnFocusTo: HTMLElement): Promise<void> {
    if (disposed || offlineControllers.has(album.id) || zipControllers.has(album.id)) return;
    rememberTransferSession();
    if (album.tracks.length === 1 && album.tracks[0]) {
      await downloadTrack(album, album.tracks[0], returnFocusTo);
      return;
    }
    const controller = new AbortController();
    zipControllers.set(album.id, controller);
    busyModes = { ...busyModes, [album.id]: 'zip' };
    setTransferProgress(album.id, { mode: 'zip', completed: 0, total: album.tracks.length });
    setAlbumStatus(album.id, localizeUi('Đang tạo ZIP MP3…'));

    try {
      const result = await downloadAlbumAsZip(
        {
          id: album.id,
          title: album.tieu_de,
          desc: album.mo_ta || '',
          tracks: album.tracks,
          archiveId: album.archive_id ?? undefined,
        },
        {
          signal: controller.signal,
          authorize: () => requireDownloadAccess('zip', returnFocusTo),
          onProgress: ({ completed, total, currentTitle, bytesDownloaded }) => {
            setTransferProgress(album.id, { mode: 'zip', completed, total });
            setAlbumStatus(
              album.id,
              `ZIP ${completed}/${total} · ${currentTitle} · ${formatBytes(bytesDownloaded ?? 0)}`,
            );
          },
        },
      );
      setAlbumStatus(
        album.id,
        result === 'archive-direct'
          ? localizeUi('Đã bắt đầu tải ZIP MP3 từ Archive.org.')
          : localizeUi('Đã tải ZIP MP3.'),
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') {
        setAlbumStatus(album.id, localizeUi('Đã dừng tải ZIP.'));
      } else if (String(error).includes('authentication_required')) {
        setAlbumStatus(album.id, '');
      } else if (String(error).includes('zip_album_too_large')) {
        setAlbumStatus(album.id, localizeUi('Album gồm nhiều bài (dung lượng lớn). Vui lòng bấm biểu tượng tải ⬇️ ở từng bài bên dưới để tải về máy.'));
      } else {
        setAlbumStatus(album.id, localizeUi('Không thể tạo ZIP MP3 cho album này. Vui lòng bấm biểu tượng tải ⬇️ ở từng bài bên dưới.'));
      }
    } finally {
      if (zipControllers.get(album.id) === controller) zipControllers.delete(album.id);
      if (!disposed) {
        busyModes = { ...busyModes, [album.id]: null };
        setTransferProgress(album.id, null);
      }
    }
  }

  async function downloadTrack(album: TalkAlbum, track: TalkTrack, returnFocusTo: HTMLElement): Promise<void> {
    if (disposed || trackDownloadPending) return;
    const principal = rememberTransferSession();
    const controller = new AbortController();
    trackDownload = { controller, albumId: album.id };
    const isCurrent = () => !disposed && !controller.signal.aborted
      && trackDownload?.controller === controller && transferIdentity().key === principal;
    trackDownloadPending = true;
    setAlbumStatus(album.id, localizeUi('Đang tải {0}…', track.title));
    try {
      await downloadSingleTrackFile(track, {
        signal: controller.signal,
        albumTitle: album.tieu_de,
        album: { ...mapped(album), desc: album.mo_ta || '' },
        authorize: () => requireDownloadAccess('mp3', returnFocusTo),
        onProgress: ({ bytesDownloaded, bytesTotal }) => {
          if (!isCurrent()) return;
          if (bytesTotal && bytesTotal > 0) {
            const percent = Math.round(((bytesDownloaded ?? 0) / bytesTotal) * 100);
            setAlbumStatus(album.id, localizeUi('Đang tải {0}… ({1}% · {2})', track.title, percent, formatBytes(bytesDownloaded ?? 0)));
          } else if (bytesDownloaded) {
            setAlbumStatus(album.id, localizeUi('Đang tải {0}… ({1})', track.title, formatBytes(bytesDownloaded)));
          }
        },
      });
      if (!isCurrent()) return;
      setAlbumStatus(album.id, localizeUi('Đã tải {0}.', track.title));
    } catch (error) {
      if (!isCurrent()) return;
      if (String(error).includes('authentication_required')) {
        setAlbumStatus(album.id, '');
      } else if (error instanceof Error && error.message.includes('trực tuyến')) {
        setAlbumStatus(album.id, error.message);
      } else {
        setAlbumStatus(album.id, localizeUi('Không thể tải {0}.', track.title));
      }
    } finally {
      if (trackDownload?.controller === controller) {
        trackDownload = undefined;
        if (!disposed) trackDownloadPending = false;
      }
    }
  }

  function cancelTrackDownload(): void {
    if (!trackDownload) return;
    trackDownload.controller.abort();
    setAlbumStatus(trackDownload.albumId, '');
    trackDownload = undefined;
    if (!disposed) trackDownloadPending = false;
  }

  function stopTransfer(albumId: string): void {
    offlineControllers.get(albumId)?.abort();
    zipControllers.get(albumId)?.abort();
  }

  onMount(() => {
    disposed = false;
    void syncOfflineState();
    const closeStaleTransfers = () => {
      const next = transferIdentity(), previous = transferSession;
      if (!previous || previous.key === next.key) return;
      transferSession = next;
      cancelTrackDownload();
      for (const controller of offlineControllers.values()) controller.abort();
      for (const controller of zipControllers.values()) controller.abort();
      closeOfflineConfirmation();
      audioDownloadModalOpen = false;
      audioDownloadProgress = null;
      audioDownloadError = '';
      clearResumePrompt();
      if (previous.id !== next.id || (['admin', 'ctv'].includes(previous.role) && !['admin', 'ctv'].includes(next.role))) closeAlbum();
    };
    window.addEventListener(SESSION_CHANGE_EVENT, closeStaleTransfers);

    const updateLoginModalState = (event: Event) => {
      loginModalOpen = Boolean((event as CustomEvent<{ open?: boolean }>).detail?.open);
      if (loginModalOpen) clearResumePrompt();
    };

    const handleDialogKeyboard = (event: KeyboardEvent) => {
      if (offlineConfirmation) return;
      if (loginModalOpen) return;
      if (event.key === 'Escape' && selected) {
        event.preventDefault();
        if (videoIsFull) videoExpanded = false;
        else closeAlbum();
      } else {
        trapAlbumFocus(event);
      }
    };

    const handleTabReset = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string }>).detail;
      if (detail?.path === '/phap-thoai' && selected) {
        closeAlbum();
      }
    };

    const openVideoAlbum = (event: Event) => {
      const albumId = (event as CustomEvent<{ albumId?: string }>).detail?.albumId;
      if (!albumId) return;
      videoExpanded = true;
      clearResumePrompt();
      if (selected?.id !== albumId) {
        const album = albums.find(item => item.id === albumId);
        if (album) void openAlbum(album, null);
      }
    };
    window.addEventListener('quangtu:open-video-album', openVideoAlbum);
    window.addEventListener('quangtu:tab-reset', handleTabReset);
    window.addEventListener('quangtu:login-modal-closed', updateLoginModalState);
    window.addEventListener('quangtu:auth-session-cleared', syncOfflineState);
    window.addEventListener('keydown', handleDialogKeyboard);

    return () => {
      disposed = true;
      cancelTrackDownload();
      window.removeEventListener(SESSION_CHANGE_EVENT, closeStaleTransfers);
      transferSession = undefined;
      closeOfflineConfirmation();
      window.removeEventListener('quangtu:open-video-album', openVideoAlbum);
      releaseBodyScroll?.(); releaseBodyScroll = null;
      clearResumePrompt();
      clearTimeout(shareToastTimer);
      window.removeEventListener('quangtu:tab-reset', handleTabReset);
      window.removeEventListener('quangtu:login-modal-closed', updateLoginModalState);
      window.removeEventListener('quangtu:auth-session-cleared', syncOfflineState);
      window.removeEventListener('keydown', handleDialogKeyboard);
      for (const ctrl of offlineControllers.values()) ctrl.abort();
      for (const ctrl of zipControllers.values()) ctrl.abort();
      offlineControllers.clear();
      zipControllers.clear();
    };
  });
</script>

<div class="album-grid pt-grid">
  {#each albums as album (album.id)}
    {@const artwork = parseAudioArtwork(normalizeCoverSrc(album.anh_dai_dien))}
    <article class:now-playing={$audioPlayer.album?.id === album.id} class="pt-card" data-private={album.visibility === 'private' ? '1' : '0'}>
      <button class="pt-card-thumb" type="button" onclick={(event) => openAlbum(album, event.currentTarget)} aria-label={`${localeStore.current === 'en' ? 'Open album' : 'Mở album'} ${album.tieu_de}`}>
        {#if artwork.src && !failedArtworkIds.has(album.id)}
          <img class="pt-card-art-img" use:sessionCover={artwork.src} style:object-position={artwork.position} alt="" loading="lazy" decoding="async" onerror={(event) => handleCoverImgError(event.currentTarget as HTMLImageElement, () => markArtworkBroken(album.id))} />
        {/if}
        <span class:with-art={Boolean(artwork.src) && !failedArtworkIds.has(album.id)} class="pt-card-thumb-icon">{topicIcon(album.chu_de)}</span>
        {#if $audioPlayer.album?.id === album.id && $audioPlayer.playing}
          <span class="pt-card-thumb-playing" aria-hidden="true">
            <span class="pt-as-playing-bars"><i></i><i></i><i></i></span>
          </span>
        {:else}
          <span class="pt-card-thumb-play" aria-hidden="true">
            <svg viewBox="0 0 24 24"><path d="M8 5v14l11-7z" fill="currentColor"/></svg>
          </span>
        {/if}
      </button>

      <div class="pt-card-body">
        <button
          class="pt-card-body-open"
          type="button"
          aria-label={`${localeStore.current === 'en' ? 'View details for album' : 'Xem chi tiết album'} ${album.tieu_de}`}
          onclick={(event) => openAlbum(album, event.currentTarget)}
        ></button>
        <div class="pt-card-top-row">
          <span class="pt-card-topic">{topicIcon(album.chu_de)} {localizeTalkTopic(album.chu_de, localizeUi.locale() === 'en-GB' ? 'en' : 'vi')}</span>
          <span class="pt-card-date">· {formatVietnamDate(album.ngay_dang || album.created_at)}</span>
          {#if album.visibility === 'private'}<span class="pt-card-private-badge">🔒 {t.talks.private}</span>{/if}
        </div>
        <h2 class="pt-card-title">{album.tieu_de}</h2>
        <div class="pt-card-meta">
          <div class="pt-card-meta-row">
            {#if album.tracks.some(track => track.media_type === 'video')}<span class="pt-video-badge">{mediaText.video}</span>{/if}
            <span class="pt-card-meta-item pt-card-meta-count">♫ {album.tracks.length} {t.talks.tracksCount}</span>
            <span class="pt-card-meta-sep">·</span>
            <span class="pt-card-meta-item">🎤 {album.dien_gia || t.talks.unknownSpeaker}</span>
          </div>
          <div class="pt-card-meta-row">
            <span class="pt-card-meta-item pt-card-meta-plays">▶ {album.playCount == null ? (localeStore.current === 'en' ? '0 plays' : '0 lượt phát') : `${new Intl.NumberFormat(localeStore.current === 'en' ? 'en-US' : 'vi-VN').format(album.playCount)} ${t.talks.playCountUnit}`}</span>
            {#if recentLookup.has(album.id)}<span class="pt-card-meta-sep">·</span><span class="pt-card-meta-item pt-card-meta-recent">🕘 {t.talks.recentlyPlayed}</span>{/if}
            {#if albumStatuses[album.id] === 'downloaded' || offlineLookup.has(album.id)}<span class="pt-card-meta-sep">·</span><span class="pt-card-meta-item pt-card-meta-offline">⬇ Offline</span>{/if}
          </div>
        </div>
      </div>

      <div class="pt-card-actions">
        {#if !isNativeApp() && (role === 'admin' || role === 'ctv')}
          <button class="pt-card-action-btn pt-card-edit" type="button" aria-label={`${localeStore.current === 'en' ? 'Edit album' : 'Sửa album'} ${album.tieu_de}`} onclick={(event) => { event.stopPropagation(); onEdit(album); }}>✏️</button>
        {/if}

        <button class="pt-card-play-btn" type="button" disabled={album.tracks.length === 0} onclick={(event) => { event.stopPropagation(); playFromCard(album); }} aria-label={`${localeStore.current === 'en' ? 'Play album' : 'Phát album'} ${album.tieu_de}`}>
          {#if $audioPlayer.album?.id === album.id && $audioPlayer.playing}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="4" width="4" height="16" rx="1"/><rect x="14" y="4" width="4" height="16" rx="1"/></svg>
          {:else}
            <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M8 5v14l11-7z"/></svg>
          {/if}
        </button>
      </div>
    </article>
  {/each}
</div>

{#if storageStatus}
  <p class="storage-note" role="status">{storageStatus}</p>
{/if}

{#if selected}
  {@const selectedTransfer = transferProgress[selected.id]}
  {@const offlineControl = offlineDownloadControl(
    albumStatuses[selected.id] ?? 'none',
    offlineTrackCounts[selected.id] ?? 0,
    selectedTransfer,
  )}
  <div class="album-overlay" class:video-full={videoIsFull} role="presentation" inert={loginModalOpen} aria-hidden={loginModalOpen ? 'true' : undefined}>
    <div class="album-dialog" class:has-video={Boolean(selectedVideoTrack)} role="dialog" aria-modal={loginModalOpen ? 'false' : 'true'} aria-labelledby="album-title" tabindex="-1" bind:this={albumDialog}>
      <header class="pt-as-header" inert={videoIsFull}>
        <div class="pt-as-header-row1">
          <button class="pt-as-back" type="button" onclick={closeAlbum} aria-label={localeStore.current === 'en' ? 'Back' : 'Quay lại'}>
            <svg class="pt-as-back-icon" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" viewBox="0 0 24 24" aria-hidden="true"><path d="M19 12H5M12 19l-7-7 7-7" /></svg>
          </button>
          <div class="pt-as-header-info">
            <h2 class="pt-as-title" id="album-title">{selected.tieu_de}</h2>
            <p class="pt-as-meta">{#if selectedHasVideo}<span class="pt-video-badge">{mediaText.video}</span> {/if}{selected.tracks.length} {t.talks.tracksCount} · {localizeTalkTopic(selected.chu_de, localeStore.current)} · {selected.dien_gia || t.talks.unknownSpeaker}</p>
          </div>
        </div>
        <div class="pt-as-header-row2">
          <!-- 1. Yêu thích -->
          <button
            class:active={favoriteLookup.has(selected.id)}
            class="pt-as-action-btn pt-as-btn-fav"
            type="button"
            disabled={collectionBusyLookup.has(`favorite:${selected.id}`)}
            aria-pressed={favoriteLookup.has(selected.id)}
            onclick={() => onCollectionToggle(selected!, 'favorite')}
            aria-label={`${favoriteLookup.has(selected.id) ? (localeStore.current === 'en' ? 'Remove from' : 'Bỏ khỏi') : (localeStore.current === 'en' ? 'Add to' : 'Thêm vào')} ${t.talks.favorite}`}
          >
            <span class="pt-as-btn-heart" aria-hidden="true">♥</span>
            <span>{t.talks.favorite}</span>
          </button>

          <!-- 2. Tải Offline -->
          {#if !isSelectedOnlineOnly}
            {#if busyModes[selected.id]}
              <button class="pt-as-action-btn pt-as-stop" type="button" onclick={() => stopTransfer(selected!.id)}>
                <span class="pt-as-stop-square" aria-hidden="true"></span>
                <span>{t.talks.stopDownload}</span>
              </button>
            {:else}
              <button
                class:warning={offlineControl.tone === 'warning'}
                class:danger={offlineControl.tone === 'danger'}
                class:is-busy={offlineControl.tone === 'busy'}
                class="pt-as-action-btn pt-as-btn-offline"
                type="button"
                onclick={(event) => void toggleOffline(selected!, event.currentTarget as HTMLElement)}
                disabled={Boolean(busyModes[selected.id])}
                aria-label={offlineControl.label}
              >
                <span class="pt-as-action-symbol" aria-hidden="true">{offlineControl.icon}</span>
                <span>{offlineControl.label}</span>
                {#if role === 'guest' && !isNativeApp()}<span class="download-lock" aria-hidden="true">🔒</span>{/if}
              </button>
            {/if}
          {/if}

          <!-- 3. Chia sẻ -->
          <button
            class="pt-as-action-btn pt-as-share-btn"
            type="button"
            onclick={() => void shareAlbum(selected!)}
            aria-label={t.talks.shareAlbum}
            title={t.talks.shareAlbum}
          >
            <svg class="pt-as-action-icon" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.368 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
            </svg>
            <span>{t.talks.share}</span>
          </button>
        </div>
      </header>

      {#if offlineNoticeVisible && offlineStateReady && !isSelectedOnlineOnly && albumStatuses[selected.id] !== 'downloaded' && !offlineLookup.has(selected.id) && !busyModes[selected.id]}
        <aside class="album-offline-notice" aria-label={t.talks.offlineRecommendationTitle}>
          <span class="album-offline-hand" aria-hidden="true">👆</span>
          <p>{t.talks.offlineRecommendation}</p>
        </aside>
      {/if}

      <div class="pt-as-album-banner" inert={videoIsFull}>
        <div class="pt-as-banner-cover">
          {#if selectedArtwork.src && !failedArtworkIds.has(selected.id)}
            <img class="pt-as-cover-img" use:sessionCover={selectedArtwork.src} style:object-position={selectedArtwork.position} alt={selected.tieu_de} decoding="async" onerror={(event) => handleCoverImgError(event.currentTarget as HTMLImageElement, () => markArtworkBroken(selected!.id))} />
          {:else}
            <span class="pt-as-cover-fallback" aria-hidden="true">{topicIcon(selected.chu_de)}</span>
          {/if}
        </div>
        <div class="pt-as-album-info">
          <div class="pt-as-banner-badges">
            <span class="pt-as-album-topic">{topicIcon(selected.chu_de)} {localizeTalkTopic(selected.chu_de, localizeUi.locale() === 'en-GB' ? 'en' : 'vi')}</span>
            {#if albums.find((album) => album.id === selected?.id)?.playCount != null}
              <span class="pt-as-album-plays">▶ {new Intl.NumberFormat(localeStore.current === 'en' ? 'en-US' : 'vi-VN').format(albums.find((album) => album.id === selected?.id)!.playCount!)} {t.talks.playCountUnit}</span>
            {/if}
          </div>
          <h3 class="pt-as-album-title">{selected.tieu_de}</h3>
          <p class="pt-as-album-desc">{selected.tracks.length} {t.talks.tracksCount}{selected.dien_gia ? ` — ${selected.dien_gia}` : ''}</p>
          <div class="pt-as-banner-actions">
              <button class="pt-as-play-all-btn" type="button" disabled={selected.tracks.length === 0} onclick={() => playAll(selected!)}>
              <svg width="14" height="14" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z"/></svg>
              <span>{t.talks.playAll || 'Phát tất cả'} ({selected.tracks.length} {t.talks.tracksCount})</span>
            </button>
          </div>
        </div>
      </div>

      {#if selectedVideoTrack}
        {#key selectedVideoTrack.url}
          <TalkVideoViewer url={selectedVideoTrack.url} title={selectedVideoTrack.title} bind:expanded={videoExpanded} onBack={closeAlbum} />
        {/key}
      {/if}
      <div class="pt-as-track-list-wrap" inert={videoIsFull}>
        <ol class="pt-as-track-list">
        {#each selected.tracks as track, index}
          <li class:active={$audioPlayer.album?.id === selected.id && $audioPlayer.trackIndex === index} class:is-playing={$audioPlayer.album?.id === selected.id && $audioPlayer.trackIndex === index && $audioPlayer.playing} class="pt-as-track-item">
            <button type="button" class="pt-as-track-main" onclick={() => play(selected!, index)} onpointerup={(event) => event.currentTarget.blur()} aria-label={`${localeStore.current === 'en' ? 'Play' : 'Phát'} ${track.title}`}>
              <span class="pt-as-track-num">{index + 1}</span>
              <span class="pt-as-track-icon" aria-hidden="true">
                {#if $audioPlayer.album?.id === selected.id && $audioPlayer.trackIndex === index && $audioPlayer.playing}
                  <span class="pt-as-playing-bars"><i></i><i></i><i></i></span>
                {:else}
                  <svg width="12" height="12" fill="currentColor" viewBox="0 0 24 24"><path d="M8 5v14l11-7z" /></svg>
                {/if}
              </span>
              <strong class="pt-as-track-name">{track.title}</strong>
              {#if track.duration_sec}<span class="pt-as-duration">{Math.floor(track.duration_sec / 60)}:{String(track.duration_sec % 60).padStart(2, '0')}</span>{/if}
            </button>
            {#if !isSelectedOnlineOnly && !isNativeApp()}
              <button type="button" class="pt-as-track-dl-btn" disabled={trackDownloadPending} onclick={(event) => void downloadTrack(selected!, track, event.currentTarget as HTMLElement)} aria-label={`${localeStore.current === 'en' ? 'Download' : 'Tải'} ${track.title}`}>
                <svg width="16" height="16" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true"><path d="M5 20h14v-2H5v2zM19 9h-4V3H9v6H5l7 7 7-7z" /></svg>
                {#if role === 'guest' && !isNativeApp()}<span class="download-lock track-lock" aria-hidden="true">🔒</span>{/if}
              </button>
            {/if}
          </li>
        {/each}
        </ol>

        {#if downloadStatus[selected.id]}
          <p class="album-status" role="status">{downloadStatus[selected.id]}</p>
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if pendingResume}
  <AudioResumePrompt
    trackTitle={pendingResume.trackTitle}
    positionSeconds={pendingResume.positionSeconds}
    visible={resumePromptVisible}
    onStartOver={() => void resolveResume(false)}
    onResume={() => void resolveResume(true)}
    onClose={() => void resolveResume(null)}
  />
{/if}

{#if shareToast}
  <div class="pt-share-toast" role="status" aria-live="polite">
    <svg width="15" height="15" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true"><path stroke-linecap="round" stroke-linejoin="round" d="M5 13l4 4L19 7" /></svg>
    <span>{shareToast}</span>
  </div>
{/if}

{#if offlineConfirmation}
  <dialog class="audio-offline-confirm" data-dialog-glass use:modalDialog aria-labelledby="audio-offline-confirm-title" aria-describedby="audio-offline-confirm-description" oncancel={(event) => { event.preventDefault(); closeOfflineConfirmation(); }}>
    <h3 id="audio-offline-confirm-title">{t.talks.offlineConfirmTitle}</h3>
    <p class="audio-offline-confirm-album">{offlineConfirmation.album.tieu_de}</p>
    <p id="audio-offline-confirm-description" aria-live="polite">
      {#if !offlineSize}
        {t.talks.offlineSizeLoading}
      {:else if offlineSize.bytes == null}
        {t.talks.offlineSizeUnknown}
      {:else}
        {t.talks.offlineSizeLabel} <strong>{new Intl.NumberFormat(localeStore.current === 'en' ? 'en-US' : 'vi-VN', { maximumFractionDigits: 1, minimumFractionDigits: 1 }).format(offlineSize.bytes / 1_000_000)} MB</strong>
        <br />{offlineSize.remaining} {t.talks.offlineRemainingTracks}
      {/if}
    </p>
    <div class="audio-offline-confirm-actions dialog-actions-balanced">
      <button type="button" data-modal-focus onclick={closeOfflineConfirmation}>{t.talks.offlineCancel}</button>
      <button class="audio-offline-confirm-submit" type="button" disabled={!offlineSize} onclick={() => void confirmOfflineDownload()}>{t.talks.offlineConfirmDownload}</button>
    </div>
  </dialog>
{/if}

{#if audioDownloadModalOpen && audioDownloadProgress}
  <div class="audio-offline-modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="audio-dl-progress-title" tabindex="-1">
    <div class="audio-offline-modal-card" data-dialog-glass>
      <div class="audio-offline-modal-icon pulse">⏳</div>
      <h3 id="audio-dl-progress-title">Đang tải album Pháp thoại...</h3>
      <p class="audio-offline-modal-sub">{audioDownloadProgress.albumTitle}</p>

      {#if audioDownloadProgress.currentTitle}
        <div class="audio-dl-track-tag">
          Bài {audioDownloadProgress.completed + 1}/{audioDownloadProgress.total}: <strong>{audioDownloadProgress.currentTitle}</strong>
        </div>
      {/if}

      <div class="audio-dl-progress-display">
        <div class="audio-dl-percent-number">
          {audioDownloadProgress.percent}%
        </div>
        <progress
          class="audio-dl-progress-bar"
          value={audioDownloadProgress.completed}
          max={audioDownloadProgress.total}
          aria-label="Tiến độ tải album"
        ></progress>
        <div class="audio-dl-bytes-info">
          <span>Đã tải {audioDownloadProgress.completed}/{audioDownloadProgress.total} bài</span>
          {#if audioDownloadProgress.bytesDownloaded > 0}
            <span>({formatBytes(audioDownloadProgress.bytesDownloaded)})</span>
          {/if}
        </div>
      </div>

      {#if audioDownloadError}
        <p class="audio-dl-error-msg" role="alert">{audioDownloadError}</p>
      {/if}

      <div class="audio-offline-modal-actions">
        <button type="button" class="btn-cancel" onclick={cancelAudioOfflineDownload}>
          Hủy tải
        </button>
      </div>
    </div>
  </div>
{/if}

<style>
  .album-offline-notice{position:relative;margin:calc(var(--space-page) / 2) var(--space-page);padding:calc(var(--space-page) / 2);background:var(--gold-light);border:1px solid var(--border);border-radius:var(--radius-control);box-shadow:var(--shadow);color:var(--text2);flex-shrink:0}
  .album-offline-notice p{margin:0;font-size:small;line-height:1.5;text-align:center}
  .album-offline-hand{position:absolute;bottom:100%;left:50%;transform:translateX(-50%);font-size:large;pointer-events:none}
  .audio-offline-confirm{margin:auto;width:min(100% - var(--space-page) * 2, var(--practice-dialog-width));max-height:calc(100dvh - var(--space-page) * 2 - env(safe-area-inset-top) - env(safe-area-inset-bottom));overflow:auto;padding:var(--space-page);border:1px solid var(--dialog-surface-border,var(--border));border-radius:var(--radius-card);background:var(--dialog-surface-background,var(--card));color:var(--text);box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));font:inherit}
  .pt-as-header-row2 .pt-as-action-btn{min-height:44px}
  .audio-offline-confirm::backdrop{background:var(--practice-dialog-backdrop)}
  .audio-offline-confirm h3{margin:0;font-size:inherit}
  .audio-offline-confirm p{margin:calc(var(--space-page) / 2) 0;line-height:1.5;overflow-wrap:anywhere}
  .audio-offline-confirm-album{color:var(--text2)}
  .audio-offline-confirm-actions{display:flex;flex-wrap:wrap;justify-content:flex-end;gap:calc(var(--space-page) / 2);margin-top:var(--space-page)}
  .audio-offline-confirm-actions button{min-height:44px;min-width:44px;padding:calc(var(--space-page) / 2) var(--space-page);border:1px solid var(--border);border-radius:var(--radius-control);background:var(--bg2);color:var(--text);font:inherit;cursor:pointer}
  .audio-offline-confirm-actions .audio-offline-confirm-submit{background:var(--gold);color:var(--on-gold)}
  .audio-offline-confirm-actions button:disabled{opacity:.5;cursor:wait}
  .album-grid{display:flex;flex-direction:column;gap:8px;border:0;background:transparent}
  .pt-card{position:relative;display:flex;align-items:center;min-height:calc(var(--space-page) * 6);border:1px solid var(--border2);border-radius:var(--radius-card);background:var(--card);transition:background var(--motion-fast),border-color var(--motion-fast),box-shadow var(--motion-fast);animation:audio-card-reveal .2s ease-out backwards}
  .pt-card:hover{border-color:var(--gold);box-shadow:0 4px 16px rgba(0,0,0,.04)}
  :global([data-theme="dark"]) .pt-card:hover{box-shadow:0 4px 16px rgba(0,0,0,.25)}
  .pt-card.now-playing{background:var(--gold-muted);border-color:var(--gold)}
  :global([data-theme="dark"]) .pt-card.now-playing{background:rgba(200,150,62,.1)}
  .pt-card-thumb{position:relative;display:flex;overflow:hidden;align-self:stretch;width:calc(var(--space-page) * 4);height:auto;min-height:calc(var(--space-page) * 6);margin:var(--radius-sm) 0 var(--radius-sm) var(--radius-sm);border-radius:var(--radius-control);flex-shrink:0;align-items:center;justify-content:center;padding:0;border:0;background:linear-gradient(135deg,var(--gold-muted),var(--gold-light));cursor:pointer}
  .pt-card-art-img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;border-radius:inherit}
  .pt-card-thumb-icon{position:relative;z-index:1;font-size:28px;opacity:.6;transition:transform .25s}
  .pt-card-thumb-icon.with-art{opacity:.1}
  .pt-card:hover .pt-card-thumb-icon{transform:scale(1.08)}
  .pt-card-thumb-play{position:absolute;z-index:3;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(200,150,62,.22);opacity:0;transition:opacity .2s}
  .pt-card:hover .pt-card-thumb-play{opacity:1}
  .pt-card-thumb-play svg{width:28px;height:28px;padding:6px;border-radius:10px;background:var(--gold);color:#fff;box-shadow:0 2px 10px rgba(200,150,62,.5)}
  .pt-card-body{position:relative;display:flex;min-width:0;flex:1;flex-direction:column;justify-content:center;gap:3px;padding:14px 16px}
  .pt-card-body-open{position:absolute;inset:0;padding:0;border:0;background:transparent;cursor:pointer}
  .pt-card-body-open:focus-visible{outline:3px solid var(--gold);outline-offset:-3px;border-radius:10px}
  .pt-card-top-row{display:flex;align-items:center;gap:5px;min-width:0;line-height:1}
  .pt-card-topic{display:inline-flex;align-items:center;gap:3px;color:var(--gold);font-size:var(--font-size-meta);font-weight:700;letter-spacing:.5px;text-transform:uppercase;white-space:nowrap;flex-shrink:0}
  .pt-card-date{color:var(--text2);font-size:var(--font-size-meta);font-weight:500;white-space:nowrap;flex-shrink:0}
  .pt-card-private-badge{padding:1px 6px;border-radius:6px;background:rgba(180,50,50,.12);color:#b43232;font-size:var(--font-size-meta);font-weight:700;white-space:nowrap;flex-shrink:0}
  .pt-card-title{margin:0;color:var(--text);font-size:var(--font-size-card-title);font-weight:700;line-height:1.35;letter-spacing:-.1px;display:-webkit-box;overflow:hidden;-webkit-box-orient:vertical;-webkit-line-clamp:2;line-clamp:2}
  .pt-card-meta{display:flex;flex-direction:column;gap:calc(var(--radius-sm) / 2);margin-top:calc(var(--radius-sm) / 3)}
  .pt-card-meta-row{display:flex;align-items:center;flex-wrap:wrap;gap:calc(var(--radius-sm) / 2)}
  .pt-card-meta-item{color:var(--text2);font-size:var(--font-size-meta);font-weight:500}
  .pt-card-meta-count{white-space:nowrap}
  .pt-card-meta-sep{color:var(--border);font-size:10px;line-height:1}
  .pt-card-meta-recent{color:var(--gold2)}
  .pt-card-meta-offline{color:var(--green-ok)}
  .pt-card-meta-plays{color:var(--gold2);font-weight:600}
  .pt-card-actions{display:flex;align-items:center;gap:8px;padding:0 14px 0 6px;flex-shrink:0;margin-left:auto}
  .storage-note{width:min(900px,calc(100% - 32px));margin:14px auto 0;color:var(--muted);font-size:var(--font-size-meta)}
  .album-overlay{position:fixed;z-index:450;inset:0;background:var(--bg)}
  .album-overlay.video-full{z-index:1500}
  .video-full .album-dialog{animation:none}
  .pt-video-badge{display:inline-flex;padding:1px 6px;border-radius:var(--radius-control);background:var(--gold-muted);color:var(--brown);font-size:var(--font-size-meta);font-weight:700;white-space:nowrap}
  @media(max-width:600px){.has-video .pt-as-album-banner{display:none}}
  .album-dialog{display:flex;width:100%;height:100dvh;overflow:hidden;flex-direction:column;outline:0;background:var(--bg);animation:album-enter .32s cubic-bezier(.4,0,.2,1)}
  .pt-card-action-btn{display:grid;width:34px;height:34px;flex-shrink:0;place-items:center;padding:0;border:1.5px solid var(--border2);border-radius:10px;background:var(--bg);color:var(--text2);cursor:pointer;font-size:15px;position:relative;z-index:2;transition:all .15s ease}
  .pt-card-action-btn:hover:not(:disabled){background:var(--bg2);border-color:var(--gold);color:var(--gold);transform:translateY(-1px)}
  .pt-card-action-btn:disabled{cursor:progress;opacity:.5}
  .pt-card-play-btn{display:grid;width:44px;height:44px;flex-shrink:0;place-items:center;padding:0;border:0;border-radius:14px;background:linear-gradient(135deg,var(--gold) 0%,var(--brown2,#9a733e) 100%);color:#fff;cursor:pointer;position:relative;z-index:2;box-shadow:0 3px 12px rgba(200,150,62,.35);transition:transform .18s cubic-bezier(.2,.8,.2,1),box-shadow .18s ease,filter .15s ease}
  .pt-card-play-btn:hover{transform:scale(1.08);box-shadow:0 6px 18px rgba(200,150,62,.48);filter:brightness(1.05)}
  .pt-card-play-btn:active{transform:scale(.96)}
  .pt-card-edit{position:absolute;z-index:6;top:10px;left:10px;min-height:30px;padding:4px 10px;border:1px solid var(--border);border-radius:10px;background:rgba(255,255,255,.94);color:var(--brown);cursor:pointer;font:inherit;font-size:var(--font-size-label);font-weight:700;transition:background .15s,border-color .15s,color .15s}
  .pt-card-edit:hover{border-color:var(--gold);background:var(--gold);color:#fff}
  .pt-card-edit:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
  @keyframes album-enter{from{transform:translateX(100%)}to{transform:translateX(0)}}
  .pt-as-header{
    display:flex;
    flex-shrink:0;
    flex-direction:column;
    gap:10px;
    padding:max(calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 10px), 18px) 14px 10px;
    border-bottom:1px solid var(--border2);
    background:var(--white);
  }
  :global([data-theme="dark"]) .pt-as-header{background:var(--bg2)}
  .pt-as-header-row1{display:flex;width:100%;align-items:center;gap:12px}
  .pt-as-header-row2{
    display:flex;
    gap:8px;
    width:100%;
    min-height:44px;
    align-items:center;
    overflow-x:auto;
    scrollbar-width:none;
    -webkit-overflow-scrolling:touch;
  }
  .pt-as-header-row2::-webkit-scrollbar{display:none}
  .pt-as-back{
    display:flex;
    width:38px;
    height:38px;
    flex-shrink:0;
    align-items:center;
    justify-content:center;
    border:1.5px solid var(--border2);
    border-radius:12px;
    background:var(--bg2);
    color:var(--text);
    cursor:pointer;
    touch-action:manipulation;
    position:relative;
    z-index:3;
    transition:background .15s,transform .15s;
  }
  .pt-as-back:hover{background:var(--bg3);transform:translateX(-1px)}
  .pt-as-back:active{background:var(--border);transform:scale(.95)}
  .pt-as-back-icon{display:block;width:18px;height:18px;pointer-events:none}
  .pt-as-header-info{min-width:0;flex:1}
  .pt-as-title{overflow:hidden;margin:0;color:var(--text);font-size:var(--font-size-card-title);font-weight:700;line-height:1.35;text-overflow:ellipsis;white-space:nowrap}
  .pt-as-meta{overflow:hidden;margin:2px 0 0;color:var(--muted);font-size:var(--font-size-meta);text-overflow:ellipsis;white-space:nowrap}
  .pt-as-action-btn{
    position:relative;
    display:inline-flex;
    min-width:0;
    min-height:44px;
    align-items:center;
    justify-content:center;
    gap:6px;
    padding:6px 14px;
    border:1.5px solid var(--border2);
    border-radius:999px;
    background:var(--bg2);
    color:var(--text2);
    cursor:pointer;
    font:inherit;
    font-size:var(--font-size-label);
    font-weight:600;
    line-height:normal;
    white-space:nowrap;
    flex-shrink:0;
    transition:all .16s ease;
    user-select:none;
    -webkit-tap-highlight-color:transparent;
  }
  .pt-as-action-btn:hover:not(:disabled){background:var(--hover);border-color:var(--gold);color:var(--brown)}
  .pt-as-action-btn:active:not(:disabled){transform:scale(.97)}
  .pt-as-btn-heart{font-size:14px;color:var(--red)}
  .pt-as-btn-fav.active{border-color:var(--gold);color:var(--gold);background:var(--gold-light)}
  :global([data-theme="dark"]) .pt-as-btn-fav.active{background:var(--gold-muted)}
  .pt-as-btn-fav.active .pt-as-btn-heart{color:var(--gold)}
  .pt-as-share-btn{border-color:var(--border2);color:var(--text2)}
  .pt-as-share-btn:hover:not(:disabled){border-color:var(--gold);background:var(--gold-light);color:var(--gold)}
  .pt-as-action-icon{display:block;width:15px;height:15px;flex:none}
  .pt-as-action-symbol{display:inline-flex;min-width:14px;flex:none;align-items:center;justify-content:center;font-size:13px;line-height:1}
  .pt-as-btn-offline.warning{border-color:var(--gold);color:var(--gold)}
  .pt-as-btn-offline.danger{border-color:var(--red);color:var(--red)}
  .pt-as-action-btn:disabled{cursor:not-allowed;opacity:.6}
  .pt-as-action-btn.is-busy:disabled{cursor:progress}
  .pt-as-stop{border-color:var(--red);color:var(--red)}
  .pt-as-stop:hover{background:color-mix(in srgb,var(--red) 7%,var(--bg2))}
  .pt-as-stop-square{display:block;width:8px;height:8px;flex:none;background:currentColor;border-radius:2px}
  .download-lock{position:absolute;top:-6px;right:-5px;display:grid;width:16px;height:16px;place-items:center;border-radius:6px;background:var(--white);box-shadow:0 1px 4px rgba(0,0,0,.18);font-size:8.5px;line-height:1}
  .pt-as-album-banner{position:relative;display:flex;align-items:center;gap:16px;padding:14px 18px;background:linear-gradient(135deg,var(--bg2) 0%,var(--hover) 100%);border-bottom:1px solid var(--border2);flex-shrink:0}
  :global([data-theme="dark"]) .pt-as-album-banner{background:linear-gradient(135deg,var(--bg2) 0%,var(--bg3) 100%)}
  .pt-as-banner-cover{width:90px;height:90px;flex-shrink:0;border-radius:14px;overflow:hidden;background:var(--bg3);border:1px solid var(--border2);box-shadow:0 4px 14px rgba(60,40,10,.08);display:flex;align-items:center;justify-content:center}
  :global([data-theme="dark"]) .pt-as-banner-cover{box-shadow:0 4px 14px rgba(0,0,0,.3)}
  .pt-as-cover-img{width:100%;height:100%;object-fit:cover;display:block}
  .pt-as-cover-fallback{font-size:36px;display:flex;align-items:center;justify-content:center}
  .pt-as-album-info{min-width:0;flex:1;display:flex;flex-direction:column;gap:4px}
  .pt-as-banner-badges{display:flex;align-items:center;flex-wrap:wrap;gap:6px}
  .pt-as-album-topic{display:inline-flex;align-items:center;gap:4px;padding:2px 8px;border-radius:999px;background:var(--gold-light);color:var(--brown);font-size:var(--font-size-meta);font-weight:700;letter-spacing:.3px;border:1px solid rgba(200,150,62,.25)}
  :global([data-theme="dark"]) .pt-as-album-topic{background:var(--gold-muted);color:var(--gold2)}
  .pt-as-album-plays{display:inline-flex;align-items:center;gap:3px;padding:2px 8px;border-radius:999px;background:rgba(200,150,62,.1);color:var(--gold2);font-size:var(--font-size-meta);font-weight:700}
  .pt-as-album-title{margin:2px 0 0;color:var(--text);font-size:var(--font-size-card-title);font-weight:800;line-height:1.35;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .pt-as-album-desc{margin:0;color:var(--muted);font-size:var(--font-size-body);line-height:1.4;display:-webkit-box;-webkit-line-clamp:2;line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}
  .pt-as-banner-actions{margin-top:4px;display:flex;align-items:center;gap:8px}
  .pt-as-play-all-btn{display:inline-flex;align-items:center;gap:6px;padding:6px 16px;border:0;border-radius:999px;background:linear-gradient(135deg,var(--gold) 0%,var(--brown2,#9a733e) 100%);color:#fff;cursor:pointer;font-size:var(--font-size-label);font-weight:700;box-shadow:0 2px 10px rgba(200,150,62,.3);transition:transform .15s ease,box-shadow .15s ease,filter .15s ease}
  .pt-as-play-all-btn:hover{transform:translateY(-1px);box-shadow:0 4px 14px rgba(200,150,62,.42);filter:brightness(1.05)}
  .pt-as-play-all-btn:active{transform:translateY(0)}
  .pt-as-track-list-wrap{min-height:0;flex:1;overflow-y:auto;padding-bottom:120px;overscroll-behavior:contain}
  .pt-as-track-list{margin:0;padding:6px 8px;list-style:none}
  .pt-as-track-item{display:flex;align-items:center;gap:8px;padding:9px 12px;border-radius:12px;margin-bottom:2px;border-bottom:1px solid var(--border2);cursor:pointer;transition:background .14s}
  .pt-as-track-item:last-child{border-bottom:0}
  .pt-as-track-item:hover{background:var(--hover)}
  .pt-as-track-item.active{background:var(--gold-muted);border-bottom-color:transparent}
  :global([data-theme="dark"]) .pt-as-track-item.active{background:rgba(200,150,62,.14)}
  .pt-as-track-main{display:flex;min-width:0;flex:1;align-items:center;gap:10px;padding:0;border:0;background:transparent;color:var(--text);cursor:pointer;font:inherit;text-align:left}
  .pt-as-track-num{width:22px;flex-shrink:0;color:var(--muted);font-size:12px;font-weight:600;text-align:center}
  .pt-as-track-item.active .pt-as-track-num{color:var(--gold)}
  .pt-as-track-icon{display:flex;width:30px;height:30px;flex-shrink:0;align-items:center;justify-content:center;border-radius:9px;background:var(--bg2);color:var(--muted);transition:background .15s,color .15s}
  .pt-as-track-item.active .pt-as-track-icon,.pt-as-track-item:hover .pt-as-track-icon{background:var(--gold);color:#fff}
  .pt-as-track-name{min-width:0;flex:1;color:var(--text);font-size:var(--font-size-body);font-weight:500;line-height:1.4}
  .pt-as-track-item.active .pt-as-track-name{color:var(--brown);font-weight:700}
  :global([data-theme="dark"]) .pt-as-track-item.active .pt-as-track-name{color:var(--gold2)}
  .pt-as-duration{margin-right:6px;color:var(--muted);font-size:11px;white-space:nowrap}
  .pt-as-track-dl-btn{position:relative;display:grid;width:34px;height:34px;flex-shrink:0;place-items:center;margin:0 0 0 auto;padding:0;border:0;border-radius:9px;background:none;color:var(--muted);cursor:pointer;transition:background .15s,color .15s}
  .pt-as-track-dl-btn:hover,.pt-as-track-dl-btn:focus-visible{background:var(--gold-light);color:var(--gold)}
  :global([data-theme="dark"]) .pt-as-track-dl-btn:hover{background:var(--gold-muted)}
  .pt-as-track-dl-btn:disabled{cursor:progress;opacity:.35}
  .track-lock{top:0;right:-2px}
  .album-status{margin:0;padding:9px 16px;border-top:1px solid var(--border2);background:var(--white);color:var(--muted);font-size:var(--font-size-meta)}
  .pt-as-playing-bars{display:inline-flex;height:14px;align-items:flex-end;gap:2px}
  .pt-as-playing-bars i{width:3px;border-radius:2px;background:currentColor;animation:pt-bar .6s ease infinite alternate}
  .pt-as-playing-bars i:nth-child(2){animation-delay:.15s}
  .pt-as-playing-bars i:nth-child(3){animation-delay:.3s}
  @keyframes pt-bar{from{height:4px}to{height:14px}}
  @keyframes audio-card-reveal{from{opacity:.15}to{opacity:1}}
  .pt-card-thumb-playing{position:absolute;z-index:3;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(200,150,62,.48);color:#fff;border-radius:inherit}
  .pt-card-thumb-playing .pt-as-playing-bars i{background:#fff}
  .pt-share-toast{position:fixed;bottom:90px;left:50%;transform:translateX(-50%);z-index:1500;display:inline-flex;align-items:center;gap:8px;padding:10px 18px;border-radius:24px;background:var(--brown-dark);color:#fff;box-shadow:var(--shadow-xl);font-size:var(--font-size-meta);font-weight:600;pointer-events:none;animation:pt-toast-in .22s cubic-bezier(.16,1,.3,1)}
  .pt-share-toast svg{color:#22c55e}
  @keyframes pt-toast-in{from{opacity:0;transform:translate(-50%,12px)}to{opacity:1;transform:translate(-50%,0)}}
  @media(max-width:600px){
    .has-video .pt-as-album-banner{display:none}
    .album-grid{gap:6px}
    .pt-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;border-radius:var(--radius-card)}
    .pt-card-body{padding:8px 8px}
    .pt-card-top-row{flex-wrap:wrap;gap:4px}
    .pt-card-topic{font-size:var(--font-size-meta)}
    .pt-card-date{font-size:var(--font-size-meta)}
    .pt-card-title{font-size:var(--font-size-card-title);-webkit-line-clamp:2;line-clamp:2}
    .pt-card-actions{display:flex;flex-direction:column;gap:var(--radius-sm);margin:0;padding:var(--radius-sm)}
    .pt-card-action-btn{width:44px;height:44px;font-size:13px;border-radius:8px}
    .pt-card-play-btn{margin-left:auto;width:44px;height:44px;border-radius:12px}
    .pt-card-edit{position:static;min-width:44px;min-height:44px}
    .pt-card-play-btn svg{width:16px;height:16px}
    .pt-as-header{padding:max(calc(var(--app-safe-top, env(safe-area-inset-top, 0px)) + 6px), 12px) 12px 8px;gap:8px}
    .pt-as-header-row2{gap:6px}
    .pt-as-action-btn{min-height:44px;font-size:var(--font-size-label);padding:6px 14px}
    .pt-as-album-banner{padding:12px 14px;gap:12px}
    .pt-as-banner-cover{width:76px;height:76px;border-radius:12px}
    .pt-as-album-title{font-size:var(--font-size-card-title);font-weight:700}
    .pt-as-album-desc{font-size:var(--font-size-body)}
    .pt-as-play-all-btn{padding:6px 14px;font-size:var(--font-size-label)}
    .pt-as-track-item{padding:8px 10px}
    .pt-as-track-name{font-size:var(--font-size-body)}
  }
  @media(max-width:768px){
    .album-overlay{
      bottom:calc(56px + max(env(safe-area-inset-bottom, 0px), 6px));
      overflow:hidden;
    }
    :global(.qts-shell--audio-active) .album-overlay{
      bottom:calc(114px + max(env(safe-area-inset-bottom, 0px), 6px));
    }
    .album-dialog{
      height:100%;
      max-height:100%;
    }
    .pt-as-track-list-wrap{
      padding-bottom:24px;
    }
  }
  :global([data-native-app='true']) .album-overlay{
    bottom:calc(56px + max(env(safe-area-inset-bottom, 0px), 6px));
    overflow:hidden;
  }
  :global([data-native-app='true'] .qts-shell--audio-active) .album-overlay{
    bottom:calc(114px + max(env(safe-area-inset-bottom, 0px), 6px));
  }
  :global([data-native-app='true']) .album-dialog{
    height:100%;
    max-height:100%;
  }
  :global([data-native-app='true']) .pt-as-track-list-wrap,
  :global([data-narrow-screen='true']) .pt-as-track-list-wrap{
    padding-bottom:var(--space-page);
  }
  :global([data-narrow-screen='true']) .album-overlay{
    bottom:calc(56px + max(env(safe-area-inset-bottom, 0px), 6px));
    overflow:hidden;
  }
  :global([data-narrow-screen='true'] .qts-shell--audio-active) .album-overlay{
    bottom:calc(114px + max(env(safe-area-inset-bottom, 0px), 6px));
  }
  :global([data-narrow-screen='true']) .album-dialog{
    height:100%;
    max-height:100%;
  }
  @media(prefers-reduced-motion:reduce){.album-dialog,.pt-card{animation:none}.pt-as-playing-bars i{animation:none;height:10px}}

  /* Audio offline modal */
  .audio-offline-modal-backdrop{position:fixed;inset:0;background:rgba(0,0,0,.6);backdrop-filter:blur(4px);-webkit-backdrop-filter:blur(4px);display:grid;place-items:center;z-index:9999;padding:16px}
  .audio-offline-modal-card{position:relative;width:min(380px,100%);background:var(--dialog-surface-background,var(--card));color:var(--text,#1c1a15);border:1.5px solid var(--dialog-surface-border,var(--border));border-radius:20px;padding:24px 20px 20px;box-shadow:var(--dialog-surface-shadow,var(--shadow-xl));display:flex;flex-direction:column;align-items:center;text-align:center;box-sizing:border-box;animation:audioModalUp .24s cubic-bezier(.34,1.3,.64,1)}
  .audio-offline-modal-icon{font-size:38px;line-height:1;margin-bottom:12px}
  .audio-offline-modal-icon.pulse{animation:audioPulse 1.4s ease-in-out infinite}
  .audio-offline-modal-card h3{margin:0 0 8px;font-size:var(--font-size-card-title);font-weight:700;color:var(--text)}
  .audio-offline-modal-sub{margin:0 0 12px;font-size:var(--font-size-body);color:var(--muted);font-weight:600;max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .audio-dl-track-tag{display:inline-block;padding:5px 12px;margin-bottom:14px;border-radius:12px;background:rgba(179,125,34,.1);color:var(--gold,#b37d22);font-size:var(--font-size-meta);max-width:100%;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
  .audio-dl-progress-display{width:100%;display:flex;flex-direction:column;align-items:center;gap:10px;margin-bottom:18px}
  .audio-dl-percent-number{font-size:34px;font-weight:800;color:var(--gold,#b37d22);font-variant-numeric:tabular-nums;line-height:1}
  .audio-dl-progress-bar{width:100%;height:10px;border-radius:5px;accent-color:var(--gold,#b37d22)}
  .audio-dl-bytes-info{display:flex;gap:6px;font-size:var(--font-size-meta);color:var(--muted);font-weight:600}
  .audio-dl-error-msg{margin:0 0 14px;color:#d93829;font-size:var(--font-size-body)}
  .audio-offline-modal-actions{display:flex;gap:10px;width:100%;justify-content:center}
  .audio-offline-modal-actions button{flex:1;min-height:42px;border-radius:12px;font:700 var(--font-size-label) var(--font-app);cursor:pointer;transition:all .15s ease}
  .audio-offline-modal-actions .btn-cancel{border:1px solid var(--border);background:var(--bg2,#f5f5f5);color:var(--text2,#444)}
  .audio-offline-modal-actions .btn-cancel:hover{background:var(--bg3,#e5e5e5)}
  @keyframes audioModalUp{from{opacity:0;transform:scale(.92) translateY(12px)}to{opacity:1;transform:scale(1) translateY(0)}}
  @keyframes audioPulse{0%,100%{transform:scale(1)}50%{transform:scale(1.12)}}
  @media(max-width:600px){
    .pt-card{min-height:calc(var(--space-page) * 6);border-radius:var(--radius-card);box-shadow:var(--shadow)}
    .pt-card-title{font-size:var(--font-size-card-title);line-height:1.4}
    .pt-card-topic{font-size:var(--font-size-meta);letter-spacing:.08em}
    .pt-card-play-btn{width:max(44px,calc(var(--space-page) * 2.6));height:max(44px,calc(var(--space-page) * 2.6));background:linear-gradient(120deg,var(--gold2),var(--gold));color:var(--on-gold);box-shadow:var(--shadow)}
    .pt-card-meta-item{font-size:var(--font-size-meta)}
  }
  .pt-card-topic,.pt-as-album-topic{display:inline-block;min-width:0;max-width:100%;white-space:normal;overflow-wrap:break-word;flex-shrink:1}
  .pt-card-title,.pt-as-album-title,.pt-as-track-name{overflow-wrap:break-word}
</style>
