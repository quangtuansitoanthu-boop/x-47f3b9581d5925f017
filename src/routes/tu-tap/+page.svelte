<script lang="ts">
  import { recordPracticeParticipation } from '$lib/browser/practice-participation';
  import { createBrowserId } from '$lib/browser/random-id';
  import { alertInApp, confirmInApp } from '$lib/browser/app-dialog';
  import { createRosaryCompletion } from '$lib/browser/rosary-completion';
  import { isPracticeWidgetTarget, PRACTICE_WIDGET_OPEN_EVENT } from '$lib/browser/practice-widget-link';
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  import { practiceLogUnit, practiceUi } from '$lib/i18n/practice-ui';
  import { watchCalendarDay } from '$lib/browser/calendar-day-rollover';
  const localizeUi = createInterfaceTranslator();
  import { restoreCompletedToolLog } from '$lib/domain/practice/completed-logs';
  import { buildRosaryLogEvidence, restoreRosarySessionLog } from '$lib/domain/practice/rosary-log-sync';
  import { acknowledgeRestoredToolLogs } from '$lib/browser/practice-log-outbox';
  import { isNativeAdminReadOnly } from '$lib/browser/admin-access';
  import { fetchEnglishChapters } from '$lib/browser/english-pack';
  import '$lib/styles/practice-theme.css';
  import { onMount, tick, untrack } from 'svelte';
  import { afterNavigate, beforeNavigate, goto } from '$app/navigation';
  import { createMutation, createQuery, useQueryClient } from '@tanstack/svelte-query';
  import { fetchWithSessionRefresh, requireBrowserCsrf } from '$lib/browser/session-csrf';
  import { getSessionContext, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getThemeContext } from '$lib/stores/theme.svelte';
  import { fetchPracticeCatalog, normalizePracticeCategory } from '$lib/browser/content-catalogs';
  import { resolveOfflineBundledResponse } from '$lib/browser/offline-bundled-resolver';
  import { loadBundledPracticeMantra } from '$lib/browser/bundled-practice-mantras';
  import { isHtmlResponse, resolveApiUrl, fetchNativeJsonMutation } from '$lib/browser/native-api';
  import {
    ANONYMOUS_STORAGE_PRINCIPAL,
    copyLegacyKeysToAnonymousNamespace,
    createPrincipalStorage
  } from '$lib/browser/principal-storage';
  import {
    LEGACY_LOCAL_STORAGE_KEYS,
    LEGACY_LOCAL_STORAGE_PREFIXES
  } from '$lib/browser/storage-contract';
  import { invalidateArticleState, serverStateKeys } from '$lib/browser/server-state';
  import type { ArticleCategory, LibraryArticle } from '$lib/components/library/article';
  import {
    getCanonicalVietnameseArticle,
    getEnglishBookMeta,
    hasEnglishChapters,
    hasEnglishReadingContent,
    ENGLISH_TRANSLATION_NOTICE,
    prepareLocalizedReadingContent,
    localizeChapterTitle
  } from '$lib/domain/library/localized-article';

  import PracticeCatalog from '$lib/components/practice/catalog/PracticeCatalog.svelte';
  import PracticeRecommendations from '$lib/components/practice/catalog/PracticeRecommendations.svelte';
  import PracticeContinueReadingShelf from '$lib/components/practice/catalog/PracticeContinueReadingShelf.svelte';
  import MeditationChooser from '$lib/components/practice/dialog/MeditationChooser.svelte';
  import PracticeConfirmDialog from '$lib/components/practice/dialog/PracticeConfirmDialog.svelte';
  import RosaryEndDialog from '$lib/components/practice/dialog/RosaryEndDialog.svelte';
  import MeditationScreen from '$lib/components/practice/meditation/MeditationScreen.svelte';
  import PracticePreview from '$lib/components/practice/reader/PracticePreview.svelte';
  import PracticeSession from '$lib/components/practice/reader/PracticeSession.svelte';
  import RosaryScreen from '$lib/components/practice/rosary/RosaryScreen.svelte';
  import { createRosaryMetronome, type RosaryMetronomeState } from '$lib/browser/rosary-metronome';
  import { partitionRosaryDaySegments, rosaryPlaybackAnchor } from '$lib/domain/practice/rosary-day-segments';
  import { validateRosaryRhythm, type RosaryInterval } from '$lib/domain/practice/rosary-rhythm';
  import DailyRoutineSession from '$lib/components/practice/routine/DailyRoutineSession.svelte';
  import PersonalPracticePanel from '$lib/components/practice/personal/PersonalPracticePanel.svelte';
  import DailyRoutineEditor from '$lib/components/practice/personal/DailyRoutineEditor.svelte';
  import { personalPracticeCopy } from '$lib/i18n/personal-practice-copy';
  import MindfulCommunity from '$lib/components/practice/community/MindfulCommunity.svelte';
  import { createMindfulPost } from '$lib/browser/mindful-community-client';
  import { createPersonalPracticeStorage } from '$lib/browser/personal-practice-storage';
  import { cloneDailyRoutine, type DailyRoutine } from '$lib/domain/practice/personal-practice';
  import { loadPracticeDedicationTemplates, type PracticeDedicationTemplate } from '$lib/browser/practice-dedication-templates';
  import { createPersonalSettingsSync } from '$lib/browser/personal-settings-sync';
  import type { PersonalSettingsSnapshot } from '$lib/domain/practice/personal-settings';
  import type { MindfulPostPage } from '$lib/contracts/mindful-community';
  import type { InfiniteData } from '@tanstack/svelte-query';
  import LePhatScreen, { type BuddhaInfo } from '$lib/components/practice/le-phat/LePhatScreen.svelte';
  import ThanhTinhScreen from '$lib/components/practice/thanh-tinh/ThanhTinhScreen.svelte';
  import { loadPreceptCompanion, getDailySessionConduct, getDailySessionTestingConduct } from '$lib/browser/precept-companion-storage';
  import PreceptPracticeScreen from '$lib/components/practice/thanh-tinh/PreceptPracticeScreen.svelte';
  import PracticeTracker from '$lib/components/practice/tracker/PracticeTracker.svelte';
  import PracticeLogModal from '$lib/components/practice/tracker/PracticeLogModal.svelte';
  import DharmaGivingGuidePrompt from '$lib/components/guide/DharmaGivingGuidePrompt.svelte';
  import {
    fetchPracticeCampaigns,
    PRACTICE_COMMUNITY_QUERY_POLICY,
    joinPracticeCampaign,
    contributePracticeCampaign,
    deletePracticeCampaignContribution,
    type PracticeCampaign
  } from '$lib/browser/practice-community';
  import {
    createPracticeSyncClient,
    getPracticeStorage,
    type PracticePreferences,
    type PracticeSyncSession
  } from '$lib/browser/practice-storage';
  import {
    DEFAULT_MEDITATION_SETUP,
    type MeditationSetup
  } from '$lib/browser/practice-meditation';
  import {
    createPracticeMotionController,
    type MeditationMotionSnapshot
  } from '$lib/browser/practice-motion';
  import {
    MEDITATION_TRACKS,
    MEDITATION_TRACK_OPTIONS,
    createPracticeAudioController,
    type MeditationTrack
  } from '$lib/browser/practice-audio';
  import {
    createPracticeAutoScrollController,
    type PracticeAutoScrollSpeed
  } from '$lib/browser/practice-auto-scroll';
  import { createWakeLockController } from '$lib/browser/wake-lock';
  import {
    configureMediaSession,
    updateMediaSessionMetadata,
    updateMediaSessionPlaybackState
  } from '$lib/browser/media-session';
  import { setPracticePresence, type PracticePresenceProjection } from '$lib/browser/presence';
  import {
    createPracticeLog,
    inferPracticeType,
    type PracticeLog,
    type PracticePeriod,
    type PracticeType
  } from '$lib/domain/practice/logs';
  import {
    getBrowserPracticeSessionOutbox,
    isPracticeOutboxCapacityError
  } from '$lib/browser/practice-session-outbox';
  import {
    createPracticeEvidenceController,
    type PracticeEvidenceHandle,
    type PracticeEvidenceStartInput
  } from '$lib/browser/practice-evidence-controller';
  import {
    advancePracticeContentGeneration,
    practiceContentIdentity,
    publishCurrentPracticeContent,
    runPracticePrincipalPull,
    settleActivePracticeProducers
  } from '$lib/browser/practice-principal-lifecycle';
  import {
    currentDocumentScrollDepth,
    createPracticeReaderProgressClient,
    practiceReadingMinimumSeconds,
    restorePracticeWindowScroll
  } from '$lib/browser/practice-reader-progress';
  import type { ReaderBookmark } from '$lib/browser/reader-bookmarks';
  import {
    getPracticeRecommendations,
    type PracticeRecommendation,
    type PracticeRecommendationPeriod
  } from '$lib/browser/practice-recommendations';
  import {
    ROSARY_DAILY_GOALS,
    ROSARY_MINIMUM_INTERACTION_MS,
    CUSTOM_ROSARY_PHRASES_STORAGE_KEY,
    normalizeCustomRosaryPhrases,
    resolveRosarySelection,
    type CustomRosaryPhraseItem,
    ROSARY_PHRASES,
    ROSARY_SIZES,
    acceptRosaryInteraction,
    advanceMeditationSession,
    cancelMeditationSession,
    createMeditationSession,
    createRosarySession,
    meditationDurationSeconds,
    meditationEvidence,
    pauseMeditationSession,
    resumeMeditationSession,
    reconcileMeditationPlayback,
    rosaryEvidence,
    rosaryGoalProgress,
    setMeditationVisibility,
    woodenFishBeatsDue,
    type MeditationSessionState,
    type RosaryDailyGoal,
    type RosaryPhrase,
    type RosarySessionState,
    type RosarySize
  } from '$lib/domain/practice/guided-sessions';
  import {
    filterPracticeCatalog,
    mergePracticeLogs,
    type PracticeArticleDetail,
    type PracticeArticleSummary,
    type PracticeCategory,
    type PracticeChapterContent,
    type PracticeChapterPreview,
    type PracticeScreen
  } from '$lib/domain/practice/state';
  import { renderReaderContent } from '$lib/components/reader/content-renderer';
  import { createReaderTextToSpeech } from '$lib/components/reader/reader-text-to-speech';
  import { isChuLangNghiem } from '$lib/domain/practice/state';
  import { practiceChantText } from '$lib/browser/practice-chant-text';
  import { getVietnamIsoDate, summarizePracticeStats } from '$lib/domain/practice/stats';
  import { resolveMediaUrl } from '$lib/domain/domain-priority';
  import '$lib/styles/global.css';

  interface ArticleDetailRow {
    id?: unknown;
    tieu_de?: unknown;
    danh_muc?: unknown;
    ngay_dang?: unknown;
    anh_url?: unknown;
    tac_gia?: unknown;
    tags?: unknown;
    has_muc_luc?: unknown;
    noi_dung?: unknown;
    tap_tieu_de?: unknown;
  }

  interface ChapterRow {
    so_thu_tu?: unknown;
    tieu_de?: unknown;
    tom_tat?: unknown;
    noi_dung?: unknown;
  }

  interface ScriptureEvidenceState {
    activeElapsedMs: number;
    handle: PracticeEvidenceHandle;
    hidden: boolean;
    lastObservedAtMs: number;
    maximumScrollDepth: number;
    startedAtMs: number;
  }

  interface ModelChantEvidenceState {
    activeElapsedMs: number;
    activeStartedAtMs: number | null;
    handle: PracticeEvidenceHandle | null;
    startedAtMs: number;
    speech: ReturnType<typeof createReaderTextToSpeech> | null;
  }

  type ConfirmationKind = 'delete-log' | 'exit-practice' | 'exit-rosary' | 'reset-rosary' | 'start-practice' | 'start-rosary' | 'toggle-mo';

  const CONFIRMATION_COPY: Record<ConfirmationKind, {
    cancelLabel: string;
    confirmLabel: string;
    description: string;
    icon: string;
    title: string;
  }> = {
    'delete-log': {
      cancelLabel: 'Hủy',
      confirmLabel: 'Xóa mục này',
      description: 'Bạn có chắc chắn muốn xóa bản ghi công phu này không? Hành động này không thể hoàn tác.',
      icon: '🗑️',
      title: 'Xóa Mục Công Phu?'
    },
    'start-practice': {
      cancelLabel: 'Chưa vội',
      confirmLabel: 'Bắt đầu 🙏',
      description: 'Bạn sắp vào chế độ tu tập tĩnh lặng.\nHãy giữ tâm thành kính, chuyên chú tụng đọc.',
      icon: '🙏',
      title: 'Bắt Đầu Công Phu?'
    },
    'exit-practice': {
      cancelLabel: 'Tiếp tục tu',
      confirmLabel: 'Hồi hướng & Thoát',
      description: '',
      icon: '☸️',
      title: 'Kết Thúc Công Phu?'
    },
    'start-rosary': {
      cancelLabel: 'Chưa vội',
      confirmLabel: 'Bắt đầu 🙏',
      description: 'Chế độ giả lập tràng hạt giúp mọi người tĩnh lặng và chuyên chú hơn trong niệm Phật và trì chú.',
      icon: '📿',
      title: 'Bắt Đầu Lần Hạt?'
    },
    'reset-rosary': {
      cancelLabel: 'Hủy',
      confirmLabel: 'Đồng ý',
      description: 'Bạn có chắc chắn muốn đặt lại số đếm hạt về 0 không?',
      icon: '🔄',
      title: 'Đặt lại bộ đếm?'
    },
    'exit-rosary': {
      cancelLabel: 'Không',
      confirmLabel: 'Có, Thoát',
      description: 'Bạn có muốn thoát chế độ giả lập tràng hạt không?',
      icon: '🚪',
      title: 'Thoát chế độ giả lập?'
    },
    'toggle-mo': {
      cancelLabel: 'Không cần',
      confirmLabel: 'Bật tiếng mõ 🙏',
      description: 'Tiếng mõ sẽ vang lên mỗi khi bạn bấm đếm, giúp công phu thêm trang nghiêm.',
      icon: '🪘',
      title: 'Bật Tiếng Mõ?'
    }
  };

  const sessionStore = getSessionContext();
  const localeStore = getLocaleContext();
  const theme = getThemeContext();
  const t = $derived(localeStore.t.practice);
  const isEn = $derived(localeStore.current === 'en');

  const guestSession: PracticeSyncSession = {
    authenticated: false,
    csrfToken: null,
    user: null
  };

  // Dùng ngay phiên root nếu route được mở sau khi root đã hydrate.
  let syncSession = $state<PracticeSyncSession>(untrack(() => sessionStore.value.authenticated ? sessionStore.value : guestSession));
  const initialRole = (() => {
    const role = (sessionStore.value.user as { role?: unknown } | null)?.role;
    return role === 'admin' || role === 'ctv' || role === 'user' ? role : 'guest';
  })();
  let clientRole = $state<'guest' | 'user' | 'ctv' | 'admin'>(initialRole);
  let anonymousAdoptionUserId = $state<string | null>(null);
  let anonymousAdoptionCount = $state(0);
  let adminEditorSequence = 0;
  let adminEditorController: AbortController | null = null;
  let editingArticle = $state<LibraryArticle | null>(null);
  let adminNotice = $state('');
  let catalogEnabled = $state(false);
  let screen = $state<PracticeScreen>('catalog');
  let personalPracticeStorage = $state<ReturnType<typeof createPersonalPracticeStorage> | null>(null);
  let personalPanel = $state<PersonalPracticePanel>();
  beforeNavigate(navigation => {
    if (personalPanel?.preserveDraft() === false) navigation.cancel();
  });
  let upgradeTab = $state<'catalog' | 'personal' | 'community'>('catalog');
  let communityPostId = $state<string | null>(null);
  let communityReactionId = $state<string | null>(null);
  let communityPostIntent = $state(0);
  let communityPostVisible = $state(false);
  function applyCommunityNotificationUrl(url: URL): boolean {
    const values = url.searchParams.getAll('communityPost');
    const id = values.length === 1 && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/u.test(values[0]) ? values[0] : null;
    communityPostId = id;
    const reaction = url.searchParams.getAll('communityReaction');
    communityReactionId = id && reaction.length === 1 && /^[A-Za-z0-9][A-Za-z0-9._:-]{0,99}$/u.test(reaction[0]) ? reaction[0] : null;
    if (!id) return false;
    communityPostVisible = true;
    communityPostIntent += 1;
    // Thông báo không kết thúc phiên thực hành/player đang chạy phía dưới modal.
    if (screen === 'catalog') {
      upgradeTab = 'community';
      window.history.replaceState({ ...window.history.state, tuTapUpgradeTab: 'community' }, '', url.toString());
    }
    return true;
  }
  function closeCommunityNotification(): void {
    communityPostVisible = false;
    const url = new URL(window.location.href);
    url.searchParams.delete('communityPost');
    url.searchParams.delete('communityReaction');
    window.history.replaceState(window.history.state, '', url.toString());
  }
  afterNavigate(({ to }) => {
    if (to?.url.pathname === '/tu-tap') applyCommunityNotificationUrl(new URL(window.location.href));
  });
  let rhythmState = $state<RosaryMetronomeState>({ count: 0, target: 0, playing: false, completed: false, error: '' });
  let rhythmBusy = $state(false);
  let rhythm: ReturnType<typeof createRosaryMetronome> | null = null;
  let rhythmAccepted = 0;
  let activeRoutine = $state<DailyRoutine | null>(null);
  let routineIndex = $state(0);
  let routinePaused = $state(false);
  let routineCountdown = $state(0);
  let routineWaiting = $state(false);
  let routineTimer: ReturnType<typeof setTimeout> | null = null;
  let routineStartedAt = 0;
  let routineIncomplete = false;
  let routineAdvancing = false;
  let routineLog: PracticeLog | null = null;
  let routineBowingSetup = $state<{id:string;phrase:string;count:number} | undefined>();
  let dedicationTemplates = $state<PracticeDedicationTemplate[]>([]);
  let rosaryDedication = $state<DailyRoutine | null>(null);
  let personalSync: ReturnType<typeof createPersonalSettingsSync> | null = null;
  let personalSyncNotice = $state('');
  let personalSummaries = $state<PracticeLog[]>([]);
  let rosaryReturnScreen = $state<'catalog' | 'practice'>('catalog');
  let lePhatReturnScreen = $state<'catalog' | 'practice'>('catalog');
  let lePhatScreen = $state<LePhatScreen>();
  let settlingBowingPrincipal = false;
  let thanhTinhReturnScreen = $state<'catalog' | 'practice'>('catalog');
  let preceptReturnScreen = $state<'catalog' | 'practice'>('catalog');
  const preceptsOpen = $derived(screen === 'precepts');
  let preceptMode = $state<'daily' | 'eight'>('daily');
  let preceptResumeReflection = $state(false);
  let preceptTestingPrincipal = $state<string | null>(null);
  let preceptTestingConductConfirmed = $state(false);
  let preceptTestingConductAnswer = $state<'kept' | 'review' | undefined>();
  let preceptConductIntent: { sessionId: string; principal: string | null } | null = null;
  let abstinenceReturnToPrecepts = false;
  let preceptScreen = $state<{ handleBack: () => boolean }>();
  let articleLoadError = $state('');
  let rosaryFeedback = $state('');
  let failedChapterIndex = $state<number | null>(null);
  let lastRequestedArticle = $state<PracticeArticleSummary | null>(null);
  let query = $state('');
  let activeCategory = $state<PracticeCategory>('all');
  let currentSection = $state<'KINH PHẬT' | 'TRÌ CHÚ' | 'NGHI THỨC KHÁC' | null>(null);
  let savedHubScrollY = 0;
  let currentArticle = $state<PracticeArticleDetail | null>(null);
  let singleArticleEnglish = $state<{ articleId: string; content: string } | null>(null);
  const currentSingleArticleEnglish = $derived(localeStore.current === 'en' && singleArticleEnglish?.articleId === currentArticle?.id ? singleArticleEnglish?.content ?? null : null);
  function handleEnglishContentReady(articleId: string, content: string | null): void {
    if (localeStore.current !== 'en' || currentArticle?.id !== articleId) return;
    singleArticleEnglish = content ? { articleId, content } : null;
  }
  $effect(() => {
    const articleId = currentArticle?.id;
    const locale = localeStore.current;
    untrack(() => {
      if (locale !== 'en' || singleArticleEnglish?.articleId !== articleId) singleArticleEnglish = null;
    });
  });
  let chapters = $state<PracticeChapterPreview[]>([]);
  let loadedChapters = $state<Record<number, PracticeChapterContent>>({});
  let currentChapterIndex = $state<number | null>(null);
  let activePeriod = $state<PracticePeriod>('month');
  let trackerHistoryOpen = $state(false);
  let recommendationsCollapsed = $state(true);
  let continueReadingCollapsed = $state(true);
  let manualLogModalOpen = $state(false);
  let manualLogDraft = $state<PracticeLog | null>(null);
  let manualLogMutationPending = $state(false);
  let preferences = $state<PracticePreferences>({
    fontSize: 15,
    practiceBackground: 'cream',
    practiceBold: false,
    readBackground: 'cream',
    rosaryCount: 0,
    rosaryDirection: 'up',
    rosarySoundEnabled: false,
    trackerOpen: false
  });
  let logs = $state<PracticeLog[]>([]);
  let practiceCount = $state(0);
  let panelOpen = $state(false);
  let confirmation = $state<ConfirmationKind | null>(null);
  let pendingDeleteLogId = $state<number | null>(null);
  let fabPosition = $state<{ x: number; y: number } | null>(null);
  let autoScrollActive = $state(false);
  let autoScrollSpeed = $state<PracticeAutoScrollSpeed>(0.5);
  let meditationChooserOpen = $state(false);
  let meditationSetup = $state<MeditationSetup>({ ...DEFAULT_MEDITATION_SETUP });
  let meditationBackgroundArtwork = $state<string | null>(null);
  let meditationSession = $state<MeditationSessionState | null>(null);
  let meditationMotionSnapshot = $state<MeditationMotionSnapshot>({
    sampleCount: 0,
    sampleLimitReached: false,
    status: 'disabled',
    stillnessPercent: null,
    stillSampleCount: 0,
  });
  let meditationEvidenceHandle: PracticeEvidenceHandle | null = null;
  let meditationLogFinished = false;
  let meditationPendingLog: PracticeLog | null = null;
  let meditationLocalLogSaved = false;
  let meditationTicker: ReturnType<typeof setInterval> | null = null;
  let meditationLastActiveElapsedMs = 0;
  let meditationVisibilityGeneration = 0;
  let customRosaryPhrases = $state<CustomRosaryPhraseItem[]>([]);
  let rosaryCustomText = $state('');
  let rosaryCustomType = $state<'Niệm danh hiệu' | 'Trì chú'>('Niệm danh hiệu');
  let lastRosaryInteractionAtMs: number | null = null;
  let rosaryDailyGoal = $state<RosaryDailyGoal>(ROSARY_DAILY_GOALS[0]);
  let rosaryDate = $state('');
  let rosaryPhrase = $state<RosaryPhrase>(ROSARY_PHRASES[0]);
  let rosarySize = $state<RosarySize>(ROSARY_SIZES[ROSARY_SIZES.length - 1] ?? 108);
  let rosarySession = $state<RosarySessionState | null>(null);
  let rosaryVisitCount = $state(0);
  let rosaryVisitPhrases = $state<string[]>([]);
  let rosaryEndStage = $state<'confirm' | 'complete' | null>(null);
  let rosaryEndError = $state('');
  let pendingDeleteLogIds = $state<number[]>([]);
  let deletingLogGroup = $state(false);
  let rosaryEvidenceHandle: PracticeEvidenceHandle | null = null;
  let recommendationPeriod = $state<PracticeRecommendationPeriod>('morning');
  let recommendationClock = $state(new Date());
  const trackerNow = $derived(recommendationClock);
  let pendingPracticeBookmark = $state<ReaderBookmark | null>(null);
  let practicePositionReady = $state(false);
  let practiceCompatibilityPull: Promise<void> = Promise.resolve();
  let scriptureEvidenceState: ScriptureEvidenceState | null = null;
  let modelChantActive = $state(false);
  let modelChantLoading = $state(false);
  let modelChantEvidenceState: ModelChantEvidenceState | null = null;
  let modelChantSilentAudio: HTMLAudioElement | null = null;
  let disposeModelChantMediaSession: (() => void) | null = null;
  const SILENT_AUDIO_URI = 'data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAEA';
  let presenceMounted = $state(false);
  let practicePresenceActivity: PracticePresenceProjection['activity'] | null = null;
  let practicePresenceStartedAt = 0;
  let audioState = $state({
    meditationActive: false,
    moActive: false,
    selectedTrack: null as MeditationSetup['musicTrack']
  });
  let articleRequestSequence = 0;
  let chapterRequestSequence = 0;
  let practiceSyncGeneration = 0;
  let rosaryFeedbackTimer = 0;
  const articleDetailCache = new Map<string, { detail: PracticeArticleDetail; chapters: PracticeChapterPreview[]; identity: string | null; contents?: Record<number, PracticeChapterContent>; locale?: 'vi' | 'en' }>();
  const GUIDED_SETTINGS_KEY = 'quangtu_guided_practice_settings_v1';

  const queryClient = useQueryClient();
  const practiceCatalogQuery = createQuery(() => ({
    queryKey: serverStateKeys.articles.practice(clientRole),
    queryFn: ({ signal }) => fetchPracticeCatalog(fetch, signal),
    networkMode: 'always',
    retry: 0,
    enabled: catalogEnabled,
  }));
  const practiceCampaignsQuery = createQuery(() => ({
    ...PRACTICE_COMMUNITY_QUERY_POLICY,
    queryKey: serverStateKeys.practiceCommunity.campaigns(sessionStore.value.user?.id ?? 'anonymous'),
    queryFn: ({ signal }) => fetchPracticeCampaigns(fetchWithSessionRefresh, { signal }),
    enabled: manualLogModalOpen && sessionStore.value.authenticated,
    networkMode: 'always',
    retry: 0,
  }));
  const articles = $derived(practiceCatalogQuery.data ?? []);
  const communityCampaigns = $derived(practiceCampaignsQuery.data?.campaigns ?? []);
  const catalogLoading = $derived(practiceCatalogQuery.isPending);
  const catalogLoadError = $derived(practiceCatalogQuery.error instanceof Error ? practiceCatalogQuery.error.message : null);
  const deleteArticleMutation = createMutation(() => ({
    mutationFn: async ({ target }: { target: PracticeArticleSummary; generation: number }) => {
      const csrf = await requireBrowserCsrf();
      const response = await fetchWithSessionRefresh(`/api/articles/${encodeURIComponent(target.id)}`, {
        method: 'DELETE',
        headers: { 'x-csrf-token': csrf },
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(payload?.error?.message || 'Không thể xóa bài viết.');
    },
    onSuccess: async (_data, { target, generation }) => {
      if (!publishCurrentPracticeContent(
        () => generation === practiceSyncGeneration,
        () => { adminNotice = `Đã xóa “${target.title}”.`; },
      )) return;
      articleRequestSequence += 1;
      chapterRequestSequence += 1;
      articleDetailCache.delete(target.id);
      await invalidateArticleState(queryClient);
    },
  }));

  function getLocalizedChapterTitle(title: string | undefined): string {
    return localizeChapterTitle(title, localeStore.current);
  }

  const localizedArticles = $derived.by(() => {
    if (localeStore.current === 'en') {
      return articles.map((art) => {
        const en = getEnglishBookMeta(art.id);
        if (!en) return art;
        return {
          ...art,
          title: en.title || art.title,
          author: en.author || art.author,
          originalTitle: art.originalTitle || art.title
        };
      });
    }
    return articles.map((art) => {
      const viMeta = getCanonicalVietnameseArticle(art.id);
      const originalTitle = art.originalTitle || viMeta?.title;
      const originalAuthor = (art as any).originalAuthor || viMeta?.author;
      if (!originalTitle && !originalAuthor) return art;
      if (originalTitle === art.title && (!originalAuthor || originalAuthor === art.author)) return art;
      return {
        ...art,
        title: originalTitle || art.title,
        author: originalAuthor || art.author
      };
    });
  });

  const localizedCurrentArticle = $derived.by(() => {
    if (!currentArticle) return currentArticle;
    if (localeStore.current === 'en') {
      const en = getEnglishBookMeta(currentArticle.id);
      if (!en) return currentArticle;
      return {
        ...currentArticle,
        title: en.title || currentArticle.title,
        author: en.author || currentArticle.author,
        originalTitle: currentArticle.originalTitle || currentArticle.title
      };
    }
    const viMeta = getCanonicalVietnameseArticle(currentArticle.id);
    const originalTitle = currentArticle.originalTitle || viMeta?.title;
    const originalAuthor = (currentArticle as any).originalAuthor || viMeta?.author;
    if (!originalTitle && !originalAuthor) return currentArticle;
    if (originalTitle === currentArticle.title && (!originalAuthor || originalAuthor === currentArticle.author)) return currentArticle;
    return {
      ...currentArticle,
      title: originalTitle || currentArticle.title,
      author: originalAuthor || currentArticle.author
    };
  });

  const isCurrentBookEnglishAvailable = $derived(currentArticle ? hasEnglishReadingContent(currentArticle.id, currentSingleArticleEnglish) : false);
  const showEnglishContentFallback = $derived(localeStore.current === 'en' && currentArticle !== null && !isCurrentBookEnglishAvailable);
  const showEnglishDraftNotice = $derived(localeStore.current === 'en' && currentArticle !== null && isCurrentBookEnglishAvailable);
  const filteredArticles = $derived(filterPracticeCatalog(localizedArticles, query, activeCategory));

  let lastLocaleForChapters = localeStore.current;
  $effect(() => {
    const activeLocale = localeStore.current;
    if (activeLocale === lastLocaleForChapters) return;
    lastLocaleForChapters = activeLocale;
    if (!currentArticle) return;
    const keepIndex = currentChapterIndex;
    loadedChapters = {};
    failedChapterIndex = null;
    articleLoadError = '';
    if (keepIndex !== null) void loadChapter(keepIndex);
  });
  const canManageContent = $derived(!isNativeAdminReadOnly(clientRole) && (clientRole === 'admin' || clientRole === 'ctv'));
  const canDeleteContent = $derived(!isNativeAdminReadOnly(clientRole) && (clientRole === 'admin'));
  const visibleScreenPractice = $derived(screen === 'practice' || screen === 'rosary');
  const currentChapterContent = $derived(
    currentChapterIndex === null ? null : (loadedChapters[currentChapterIndex] ?? null)
  );
  const practiceHtml = $derived(currentChapterContent
    ? renderReaderContent(prepareLocalizedReadingContent(currentChapterContent.content, localeStore.current))
    : renderReaderContent(prepareLocalizedReadingContent(currentSingleArticleEnglish ?? currentArticle?.content ?? '', localeStore.current))
  );
  const trackerStats = $derived(summarizePracticeStats(logs, activePeriod, trackerNow, localeStore.current));
  const recentLogs = $derived(logs.slice(0, 10));
  const confirmationCopy = $derived(confirmation ? {
    cancelLabel: confirmation === 'delete-log'
      ? t.cancel
      : confirmation === 'start-practice'
        ? t.notYet
        : confirmation === 'exit-practice'
          ? t.confirmContinueCultivating
          : confirmation === 'start-rosary'
            ? t.notYet
            : confirmation === 'reset-rosary'
              ? t.cancel
              : confirmation === 'exit-rosary'
                ? t.no
                : t.no,
    confirmLabel: confirmation === 'delete-log'
      ? t.confirmDeleteLogBtn
      : confirmation === 'start-practice'
        ? t.confirmStartPracticeBtn
        : confirmation === 'exit-practice'
          ? t.confirmExitPracticeBtn
          : confirmation === 'start-rosary'
            ? t.confirmStartPracticeBtn
            : confirmation === 'reset-rosary'
              ? t.agree
              : confirmation === 'exit-rosary'
                ? t.confirmExitRosaryBtn
                : t.confirmToggleMoBtn,
    title: confirmation === 'delete-log'
      ? t.confirmDeleteLogTitle
      : confirmation === 'start-practice'
        ? (pendingPracticeBookmark ? t.confirmResumePracticeTitle : t.confirmStartPracticeTitle)
        : confirmation === 'exit-practice'
          ? t.confirmExitPracticeTitle
          : confirmation === 'start-rosary'
            ? t.confirmStartRosaryTitle
            : confirmation === 'reset-rosary'
              ? t.confirmResetRosaryTitle
              : confirmation === 'exit-rosary'
                ? t.confirmExitRosaryTitle
                : t.confirmToggleMoTitle,
    icon: CONFIRMATION_COPY[confirmation].icon,
    description: confirmation === 'delete-log'
      ? (() => {
          const target = pendingDeleteLogId !== null
            ? logs.find((l) => String(l.id) === String(pendingDeleteLogId) || Number(l.id) === Number(pendingDeleteLogId))
            : null;
          const selectedLogs = logs.filter(log => pendingDeleteLogIds.includes(log.id));
          if (selectedLogs.length > 1) return localeStore.current === 'en'
            ? `Delete all ${selectedLogs.length} records for "${target?.note || target?.type}" on ${target?.date} (total: ${selectedLogs.reduce((sum, log) => sum + log.count, 0)} ${practiceLogUnit(true, target?.type ?? '')})?\nThis action cannot be undone.`
            : `Xóa toàn bộ ${selectedLogs.length} bản ghi "${target?.note || target?.type}" ngày ${target?.date} (tổng: ${selectedLogs.reduce((sum, log) => sum + log.count, 0)} ${practiceLogUnit(false, target?.type ?? '')})?\nHành động này không thể hoàn tác.`;
          return target
            ? (localeStore.current === 'en'
                ? `Are you sure you want to delete "${target.note || target.type}" (${target.count} ${practiceLogUnit(true, target.type)})?\nThis action cannot be undone.`
                : `Bạn có chắc chắn muốn xóa bản ghi "${target.note || target.type}" (${target.count} ${practiceLogUnit(false, target.type)}) không?\nHành động này không thể hoàn tác.`)
            : t.confirmDeleteLogDesc;
        })()
      : confirmation === 'exit-practice'
        ? t.confirmExitPracticeDesc.replace('{count}', String(practiceCount))
        : confirmation === 'start-practice'
          ? (pendingPracticeBookmark
            ? (localeStore.current === 'en'
                ? `Would you like to enter practice mode to continue ${currentArticle?.title ? `"${currentArticle.title}"` : 'this sutra'}?\nPlease keep a sincere and focused mind.`
                : `Bạn có muốn vào chế độ tu tập để tiếp tục ${currentArticle?.title ? `"${currentArticle.title}"` : 'bài kinh'} đang đọc dở không?\nHãy giữ tâm thành kính, chuyên chú công phu.`)
            : t.confirmStartPracticeDesc)
          : confirmation === 'start-rosary'
            ? t.confirmStartRosaryDesc
            : confirmation === 'reset-rosary'
              ? t.confirmResetRosaryDesc
              : confirmation === 'exit-rosary'
                ? t.confirmExitRosaryDesc
                : t.confirmToggleMoDesc,
  } : null);
  const practiceRecommendationSet = $derived(getPracticeRecommendations(recommendationClock, recommendationPeriod, localizedArticles, localeStore.current));
  const rosaryProgress = $derived(rosarySession
    ? rosaryGoalProgress({ ...rosarySession, dailyGoal: rosaryDailyGoal })
    : Math.min(1, preferences.rosaryCount / rosaryDailyGoal));



  $effect(() => {
    if (!presenceMounted) return;
    const meditationVisible = meditationSession
      && !['paused', 'completed', 'cancelled'].includes(meditationSession.phase);
    const activity: PracticePresenceProjection['activity'] | null = !syncSession.authenticated
      ? null
      : meditationVisible
        ? 'meditation'
        : screen === 'rosary'
          ? 'rosary'
          : modelChantActive
            ? 'model_chant'
            : screen === 'practice'
              ? 'scripture'
              : null;
    if (activity === practicePresenceActivity) return;
    practicePresenceActivity = activity;
    practicePresenceStartedAt = activity ? Date.now() : 0;
    setPracticePresence(activity ? {
      activity,
      startedAt: practicePresenceStartedAt,
      visible: true,
    } : null);
  });

  const browserStorage = typeof window === 'undefined' ? null : window.localStorage;
  let storage = browserStorage
    ? getPracticeStorage(createPrincipalStorage(browserStorage, untrack(() => sessionPrincipalId(syncSession))))
    : null;
  const syncClient = typeof window === 'undefined' ? null : createPracticeSyncClient(fetchWithSessionRefresh);
  const readerProgress = browserStorage
    ? createPracticeReaderProgressClient(fetchWithSessionRefresh, browserStorage, () => {
      showPracticeFeedback(isEn ? 'Cannot save reading position on device. Please connect to internet and retry.' : 'Không thể lưu vị trí đọc trên thiết bị. Hãy kết nối mạng và thử lại.');
    })
    : null;
  const sessionOutbox = browserStorage
    ? getBrowserPracticeSessionOutbox(fetchWithSessionRefresh, browserStorage)
    : null;
  const practiceEvidence = sessionOutbox ? createPracticeEvidenceController(sessionOutbox, { principalId: () => sessionPrincipalId(syncSession) ?? ANONYMOUS_STORAGE_PRINCIPAL }) : null;
  const audio = typeof window === 'undefined' ? null : createPracticeAudioController();
  const meditationMotion = typeof window === 'undefined' ? null : createPracticeMotionController();
  const wakeLock = typeof window === 'undefined' ? null : createWakeLockController();
  const autoScroll = typeof window === 'undefined' ? null : createPracticeAutoScrollController((active) => {
    autoScrollActive = active;
  });

  function reportPracticeEvidenceFailure(cause: unknown): void {
    showPracticeFeedback(isPracticeOutboxCapacityError(cause)
      ? (isEn ? 'Offline practice queue is full. Please connect to internet to sync and retry; this session was not recorded.' : 'Hàng đợi tu tập ngoại tuyến đã đầy. Hãy kết nối mạng để đồng bộ rồi thử lại; phiên này chưa được ghi nhận.')
      : (isEn ? 'Cannot save practice evidence on device. This session was not recorded.' : 'Không thể lưu bằng chứng tu tập trên thiết bị. Phiên này chưa được ghi nhận.'));
  }

  function startPracticeEvidence(input: PracticeEvidenceStartInput, observedStart?: Date): PracticeEvidenceHandle | null {
    try {
      return practiceEvidence?.start(input, observedStart) ?? null;
    } catch (cause) {
      reportPracticeEvidenceFailure(cause);
      return null;
    }
  }

  function finishPracticeEvidence(
    handle: PracticeEvidenceHandle | null,
    evidenceSummary: Record<string, unknown>,
  ): boolean {
    try {
      return practiceEvidence?.finish(handle, evidenceSummary) ?? false;
    } catch (cause) {
      reportPracticeEvidenceFailure(cause);
      return false;
    }
  }

  function principalStorage() {
    if (!browserStorage) return null;
    return createPrincipalStorage(
      browserStorage,
      syncSession.authenticated ? syncSession.user?.id ?? null : null
    );
  }

  function adoptAnonymousPractice(): void {
    const userId = syncSession.authenticated ? syncSession.user?.id ?? null : null;
    if (!userId || userId !== anonymousAdoptionUserId) return;
    let adopted = 0;
    try {
      adopted = sessionOutbox?.adoptAnonymousQueue(userId) ?? 0;
    } catch {
      showPracticeFeedback(isEn ? 'The queue is too large to merge safely. Please connect to internet to sync your account and retry.' : 'Hàng đợi đang quá lớn để gộp an toàn. Hãy kết nối mạng để đồng bộ tài khoản rồi thử lại.');
      return;
    }
    anonymousAdoptionUserId = null;
    anonymousAdoptionCount = 0;
    void sessionOutbox?.flush().catch(() => undefined);
    showPracticeFeedback(adopted > 0
      ? (isEn ? `Merged ${adopted} practice activities into your account.` : `Đã gộp ${adopted} hoạt động tu tập vào tài khoản.`)
      : (isEn ? 'No anonymous activities remaining to merge.' : 'Không còn hoạt động ẩn danh cần gộp.'));
  }

  function keepAnonymousPracticeSeparate(): void {
    const userId = syncSession.authenticated ? syncSession.user?.id ?? null : null;
    if (!userId || userId !== anonymousAdoptionUserId) return;
    try {
      sessionOutbox?.keepAnonymousQueueSeparate(userId);
    } catch {
      showPracticeFeedback(isEn ? 'Cannot save preference on device. Please free up storage and retry.' : 'Không thể lưu lựa chọn trên thiết bị. Hãy giải phóng dung lượng rồi thử lại.');
      return;
    }
    anonymousAdoptionUserId = null;
    anonymousAdoptionCount = 0;
    showPracticeFeedback(isEn ? 'Kept anonymous practice activities separate.' : 'Đã giữ riêng hoạt động tu tập ẩn danh.');
  }

  function sessionPrincipalId(session: PracticeSyncSession): string | null {
    return session.authenticated ? session.user?.id ?? null : null;
  }

  function initialPracticeCacheReceipt(targetId: string | null, identity: string) {
    const cached = targetId ? articleDetailCache.get(targetId) : undefined;
    return cached?.identity === identity ? cached : undefined;
  }

  function settlePracticeBeforePrincipalSwitch(): void {
    stopRhythm();
    endRoutine();
    rosaryDedication = null;
    if (screen === 'precepts') screen = 'catalog';
    articleRequestSequence += 1;
    chapterRequestSequence += 1;
    articleDetailCache.clear();
    adminEditorSequence += 1;
    adminEditorController?.abort();
    adminEditorController = null;

    settleActivePracticeProducers({
      cleanupResources: cleanupPracticeResources,
      closeGuidedMeditation: () => closeGuidedMeditation(true),
      finishBowing: () => {
        settlingBowingPrincipal = true;
        try {
          if (lePhatScreen?.finish(true) === false) throw new Error('bowing_log_not_saved');
        } finally {
          settlingBowingPrincipal = false;
        }
      },
      finishRosaryEvidence,
      finishScriptureEvidence,
      onError: (cause) => reportPracticeEvidenceFailure(cause),
      saveReaderPosition: () => {
        if (screen === 'practice') saveCurrentPracticePosition(false);
      },
      stopModelChant,
    });

    // Không mang phiên hoặc bản ghi chưa lưu của tài khoản cũ sang chủ thể mới.
    meditationSession = null;
    meditationEvidenceHandle = null;
    meditationPendingLog = null;
    meditationLocalLogSaved = false;
    rosarySession = null;
    rosaryEvidenceHandle = null;

    rosaryVisitCount = 0;
    rosaryVisitPhrases = [];
    rosaryEndStage = null;
    rosaryEndError = '';
    pendingDeleteLogIds = [];

    confirmation = null;
    meditationChooserOpen = false;
    trackerHistoryOpen = false;
    manualLogModalOpen = false;
    editingArticle = null;
    adminNotice = '';
    deleteArticleMutation.reset();
    currentArticle = null;
    pendingPracticeBookmark = null;
    practicePositionReady = false;
    chapters = [];
    loadedChapters = {};
    currentChapterIndex = null;
    failedChapterIndex = null;
    lastRequestedArticle = null;
    articleLoadError = '';
    practiceCount = 0;
    panelOpen = false;
    rosaryReturnScreen = 'catalog';
    lePhatReturnScreen = 'catalog';
    screen = 'catalog';
  }

  function resetRosaryCount(date = rosaryDate || getVietnamIsoDate()): void {
    const selectedStorage = principalStorage();
    if (!selectedStorage) return;
    createRosaryCompletion(selectedStorage).resetCounter(date, () => {
      preferences = storage?.savePreferences({ rosaryCount: 0 }) ?? preferences;
    });
  }

  function loadCustomRosaryPhrases(): void {
    customRosaryPhrases = [];
    try {
      const raw = principalStorage()?.getItem(CUSTOM_ROSARY_PHRASES_STORAGE_KEY);
      customRosaryPhrases = normalizeCustomRosaryPhrases(raw ? JSON.parse(raw) : []);
    } catch {
      customRosaryPhrases = [];
    }
  }

  function saveCustomRosaryPhrases(list: CustomRosaryPhraseItem[]): void {
    const selectedStorage = principalStorage();
    if (!selectedStorage) throw new Error('rosary_storage_unavailable');
    selectedStorage.setItem(CUSTOM_ROSARY_PHRASES_STORAGE_KEY, JSON.stringify(list));
    customRosaryPhrases = list;
  }

  function settleRestoredRosaryCount(): void {
    if (rosarySession || preferences.rosaryCount <= 0) return;
    const selectedStorage = principalStorage();
    if (!selectedStorage) throw new Error('rosary_storage_unavailable');
    const completion = createRosaryCompletion(selectedStorage);
    const date = rosaryDate || getVietnamIsoDate();
    if (!completion.unaccountedCount(preferences.rosaryCount, date)) return;
    const selection = resolveRosarySelection(rosaryPhrase, customRosaryPhrases);
    if (!selection) throw new Error('invalid_rosary_phrase');
    logs = completion.settle(preferences.rosaryCount, preferences.rosaryCount, date, selection.phrase, selection.type);
  }

  function handleAddCustomPhrase(item: { text: string; type: 'Niệm danh hiệu' | 'Trì chú' }): void {
    const newItem: CustomRosaryPhraseItem = customRosaryPhrases.find(saved => saved.text === item.text.trim() && saved.type === item.type) ?? {
      id: `cp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      text: item.text.trim(),
      type: item.type,
      createdAt: new Date().toISOString(),
    };
    if (!normalizeCustomRosaryPhrases([newItem]).length) return;
    try { saveCustomRosaryPhrases(customRosaryPhrases.some(saved => saved.id === newItem.id) ? customRosaryPhrases : [...customRosaryPhrases, newItem]); }
    catch {
      showPracticeFeedback(localizeUi("Không thể lưu danh hiệu trên thiết bị. Hãy giải phóng dung lượng rồi thử lại."));
      return;
    }
    const previousText = rosaryCustomText;
    const previousType = rosaryCustomType;
    rosaryCustomText = '';
    rosaryCustomType = 'Niệm danh hiệu';
    if (!updateRosaryPhrase(`custom:${newItem.id}`)) {
      rosaryCustomText = previousText;
      rosaryCustomType = previousType;
      showPracticeFeedback(localizeUi("Danh hiệu đã có trong danh sách, nhưng chưa thể chuyển lựa chọn. Hãy thử lại."));
      return;
    }
    showPracticeFeedback(localizeUi("📿 Đã lưu “{0}” vào danh sách lựa chọn", newItem.text));
  }

  function handleDeleteCustomPhrase(id: string): void {
    const target = customRosaryPhrases.find(cp => cp.id === id);
    if (!target) return;
    try {
      if (rosaryPhrase === `custom:${id}`) {
        if (rosarySession) finishRosaryEvidence();
        else settleRestoredRosaryCount();
      }
    } catch (cause) { reportPracticeEvidenceFailure(cause); return; }
    const nextList = customRosaryPhrases.filter(cp => cp.id !== id);
    try { saveCustomRosaryPhrases(nextList); }
    catch {
      showPracticeFeedback(localizeUi("Không thể lưu danh hiệu trên thiết bị. Hãy giải phóng dung lượng rồi thử lại."));
      return;
    }
    if (rosaryPhrase === `custom:${id}`) {
      rosaryPhrase = ROSARY_PHRASES[0];
      try { saveGuidedSettings(); } catch { reportPracticeEvidenceFailure(new Error('rosary_settings_write_failed')); }
    }
    if (target) {
      showPracticeFeedback(localizeUi("🗑️ Đã xóa “{0}” khỏi danh sách lựa chọn", target.text));
    }
  }

  function updateRosaryCustomText(text: string): void {
    rosaryCustomText = text.slice(0, 120);
    const lower = text.toLowerCase();
    if (lower.includes('chú') || lower.includes('chân ngôn') || lower.includes('đà la ni') || lower.includes('ôm') || lower.includes('om') || lower.includes('hum') || lower.includes('hồng') || lower.includes('soha') || lower.includes('xoa ha')) {
      rosaryCustomType = 'Trì chú';
    }
    try { saveGuidedSettings(); }
    catch { showPracticeFeedback(localizeUi("Bản nháp chưa lưu được trên thiết bị. Nội dung vẫn được giữ trong phiên này.")); }
  }

  function updateRosaryCustomType(type: 'Niệm danh hiệu' | 'Trì chú'): void {
    rosaryCustomType = type;
    try { saveGuidedSettings(); }
    catch { showPracticeFeedback(localizeUi("Bản nháp chưa lưu được trên thiết bị. Nội dung vẫn được giữ trong phiên này.")); }
  }

  function readGuidedSettings(): void {
    lastRosaryInteractionAtMs = null;
    customRosaryPhrases = [];
    rosaryCustomText = '';
    rosaryCustomType = 'Niệm danh hiệu';
    rosaryPhrase = ROSARY_PHRASES[0];
    rosaryDate = '';
    rosarySize = ROSARY_SIZES[ROSARY_SIZES.length - 1] ?? 108;
    rosaryDailyGoal = ROSARY_DAILY_GOALS[0];
    const selectedStorage = principalStorage();
    if (!selectedStorage) return;
    loadCustomRosaryPhrases();
    try {
      createRosaryCompletion(selectedStorage).recoverReset(() => {
        preferences = storage?.savePreferences({ rosaryCount: 0 }) ?? preferences;
      });
    } catch (cause) { reportPracticeEvidenceFailure(cause); return; }
    let restoredSettings: Record<string, unknown> | null = null;
    try {
      const parsed = JSON.parse(selectedStorage.getItem(GUIDED_SETTINGS_KEY) || '{}') as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) restoredSettings = parsed as Record<string, unknown>;
    } catch { /* Giữ nhánh báo dữ liệu lỗi bên dưới, không thay nội dung đã lưu. */ }
    const restoredDate = typeof restoredSettings?.rosaryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(restoredSettings.rosaryDate)
      ? restoredSettings.rosaryDate : getVietnamIsoDate();
    rosaryDate = restoredDate;
    try { createRosaryCompletion(selectedStorage).initializeRestoredCount(preferences.rosaryCount, restoredDate); }
    catch (cause) {
      rosaryPhrase = 'Tùy chọn';
      reportPracticeEvidenceFailure(cause);
      return;
    }
    let guidedSettingsRead = false;
    try {
      const raw = restoredSettings;
      if (!raw) throw new Error('invalid_guided_settings');
      guidedSettingsRead = true;
      const size = Number(raw.rosarySize);
      const goal = Number(raw.rosaryDailyGoal);
      const phrase = String(raw.rosaryPhrase ?? ROSARY_PHRASES[0]);
      const today = getVietnamIsoDate();
      const savedDate = typeof raw.rosaryDate === 'string' && /^\d{4}-\d{2}-\d{2}$/u.test(raw.rosaryDate)
        ? raw.rosaryDate : today;
      // Receipt là mốc khôi phục khi chuyển ngày đã lưu nhưng ghi settings bị ngắt.
      rosaryDate = createRosaryCompletion(selectedStorage).getCounterDate() ?? savedDate;
      if (ROSARY_SIZES.includes(size as RosarySize)) rosarySize = size as RosarySize;
      if (ROSARY_DAILY_GOALS.includes(goal as RosaryDailyGoal)) rosaryDailyGoal = goal as RosaryDailyGoal;
      if ((ROSARY_PHRASES as readonly string[]).includes(phrase)
        || (phrase.startsWith('custom:') && (resolveRosarySelection(phrase, customRosaryPhrases)
          || preferences.rosaryCount > 0))) {
        rosaryPhrase = phrase;
      }
      else if (preferences.rosaryCount > 0) {
        rosaryPhrase = 'Tùy chọn';
      }
      if (rosaryDate !== today) ensureCurrentRosaryDay(false);
      rosaryCustomText = typeof raw.rosaryCustomText === 'string' ? raw.rosaryCustomText.slice(0, 120) : '';
      rosaryCustomType = raw.rosaryCustomType === 'Trì chú' ? 'Trì chú' : 'Niệm danh hiệu';
      const setup = raw.meditationSetup as Partial<MeditationSetup> | undefined;
      if (setup && typeof setup === 'object') {
        const musicTrack = MEDITATION_TRACKS.includes(setup.musicTrack as never)
          ? setup.musicTrack as MeditationSetup['musicTrack']
          : null;
        meditationSetup = {
          ...DEFAULT_MEDITATION_SETUP,
          ...setup,
          durationMinutes: Math.max(1, Math.min(1_440, Number(setup.durationMinutes) || 15)),
          motionEnabled: setup.motionEnabled === true,
          musicTrack,
        };
      }
      if (raw.rosaryDate !== today) saveGuidedSettings();
    } catch {
      if ((!guidedSettingsRead || !resolveRosarySelection(rosaryPhrase, customRosaryPhrases))
        && preferences.rosaryCount > 0) {
        rosaryPhrase = 'Tùy chọn';
      }
    }
  }

  function saveGuidedSettings(): void {
    principalStorage()?.setItem(GUIDED_SETTINGS_KEY, JSON.stringify({
      meditationSetup,
      rosaryDailyGoal,
      rosaryDate,
      rosaryPhrase,
      rosarySize,
      rosaryCustomText,
      rosaryCustomType,
    }));
  }

  function ensureCurrentRosaryDay(persistSettings = true): void {
    const today = getVietnamIsoDate();
    if (rosaryDate === today) return;
    finishRosaryEvidence();
    settleRestoredRosaryCount();
    const selectedStorage = principalStorage();
    if (!selectedStorage) throw new Error('rosary_storage_unavailable');
    createRosaryCompletion(selectedStorage).continueCounter(preferences.rosaryCount, today);
    rosaryDate = today;
    if (persistSettings) saveGuidedSettings();
  }

  function refreshAudioState(): void {
    if (!audio) return;
    audioState = audio.getState();
  }

  function mapArticleDetail(row: ArticleDetailRow): PracticeArticleDetail {
    let tocTitles: string[] = [];
    try {
      // Server's parseJsonFields already deserializes tap_tieu_de to an array.
      // Handle both cases: already-parsed array (production API) and raw JSON string (local/fallback).
      const rawToc = row.tap_tieu_de ?? '[]';
      const parsed = Array.isArray(rawToc) ? rawToc : JSON.parse(String(rawToc));
      if (Array.isArray(parsed)) tocTitles = parsed.map((value) => String(value)).filter(Boolean);
    } catch {
      tocTitles = [];
    }

    return {
      author: String(row.tac_gia ?? 'Tu Tập'),
      category: normalizePracticeCategory(row.danh_muc, row.tieu_de) ?? 'KINH PHẬT',
      content: String(row.noi_dung ?? ''),
      hasTableOfContents: Boolean(row.has_muc_luc),
      id: String(row.id ?? ''),
      imageUrl: resolveMediaUrl(row.anh_url),
      publishedAt: String(row.ngay_dang ?? ''),
      tags: String(row.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
      title: String(row.tieu_de ?? ''),
      tocTitles
    };
  }

  async function openAdminEditor(article: PracticeArticleSummary): Promise<void> {
    const sequence = ++adminEditorSequence;
    adminEditorController?.abort();
    const controller = new AbortController();
    adminEditorController = controller;
    adminNotice = '';
    try {
      const response = await fetchWithSessionRefresh(`/api/data/baiviet?id=eq.${encodeURIComponent(article.id)}&select=*`, { cache: 'no-store', signal: controller.signal });
      if (!response.ok) throw new Error('Không thể tải dữ liệu bài viết.');
      const rows = await response.json() as Array<Record<string, unknown>>;
      if (sequence !== adminEditorSequence) return;
      const row = rows[0];
      if (!row) throw new Error('Không tìm thấy bài viết.');
      editingArticle = {
        id: String(row.id ?? article.id),
        title: String(row.tieu_de ?? article.title),
        summary: String(row.tom_tat ?? ''),
        content: String(row.noi_dung ?? ''),
        category: String(row.danh_muc ?? article.category) as ArticleCategory,
        tags: String(row.tags ?? '').split(',').map((tag) => tag.trim()).filter(Boolean),
        author: String(row.tac_gia ?? article.author),
        imageUrl: resolveMediaUrl(row.anh_url ?? article.imageUrl),
        featured: Number(row.noi_bat ?? 0) > 0,
        publishedAt: String(row.ngay_dang ?? article.publishedAt),
        hasTableOfContents: Boolean(row.has_muc_luc),
        volumeCount: Number(row.so_tap ?? 0),
        status: String(row.trang_thai ?? ''),
        pdfUrl: String(row.pdf_url ?? ''),
        externalUrl: String(row.link_ngoai ?? '')
      };
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === 'AbortError') return;
      if (sequence !== adminEditorSequence) return;
      adminNotice = cause instanceof Error ? cause.message : 'Không thể mở trình chỉnh sửa.';
    } finally {
      if (adminEditorController === controller) adminEditorController = null;
    }
  }

  function finishAdminChange(message = 'Đã cập nhật nội dung.'): void {
    articleRequestSequence += 1;
    chapterRequestSequence += 1;
    if (editingArticle?.id) articleDetailCache.delete(editingArticle.id);
    editingArticle = null;
    adminNotice = message;
  }

  function createAdminPracticeArticle(category: 'KINH PHẬT' | 'TRÌ CHÚ' | 'NGHI THỨC KHÁC' = 'KINH PHẬT'): void {
    editingArticle = {
      id: '',
      title: '',
      summary: '',
      content: '',
      category,
      tags: [],
      author: 'Tu Tập',
      imageUrl: '',
      featured: false,
      publishedAt: getVietnamIsoDate(),
      hasTableOfContents: false,
      volumeCount: 0,
      status: 'published',
      pdfUrl: '',
      externalUrl: ''
    };
  }

  let pushedSectionHistory = false;
  let handledHistoryBackPending = false;

  function backAfterHandledTransition(): void {
    if (handledHistoryBackPending || window.history.length <= 1) return;
    handledHistoryBackPending = true;
    window.history.back();
  }

  function handleSelectSection(section: 'KINH PHẬT' | 'TRÌ CHÚ' | 'NGHI THỨC KHÁC' | null): void {
    if (typeof window !== 'undefined') {
      savedHubScrollY = window.scrollY;
    }
    currentSection = section;
    if (section) {
      activeCategory = section;
      if (typeof window !== 'undefined') {
        const url = new URL(window.location.href);
        url.searchParams.set('muc', section === 'KINH PHẬT' ? 'kinh' : (section === 'TRÌ CHÚ' ? 'tri-chu' : 'nghi-thuc'));
        pushedSectionHistory = true;
        window.history.pushState({ ...window.history.state, section }, '', url.toString());
        window.scrollTo({ top: 0, behavior: 'instant' });
        void tick().then(() => {
          requestAnimationFrame(() => {
            window.scrollTo({ top: 0, behavior: 'instant' });
          });
        });
      }
    } else {
      handleBackToHub();
    }
    query = '';
  }

  $effect(() => {
    if (!presenceMounted || screen !== 'catalog' || (!currentSection && upgradeTab === 'catalog')) return;
    const title = upgradeTab !== 'catalog' ? personalPracticeCopy[isEn ? 'en' : 'vi'].reflectionTab : localeStore.t.header.practiceMode;
    let disposed = false;
    let published = false;
    // Chờ preview dọn header trước khi trả quyền điều hướng cho danh mục.
    void (async () => {
      await tick();
      if (disposed) return;
      document.dispatchEvent(new CustomEvent('qts:practice-header', {
        detail: { active: true, title, onBack: () => upgradeTab !== 'catalog' ? void selectUpgradeTab('catalog') : handleBackToHub() },
      }));
      published = true;
    })();
    return () => {
      disposed = true;
      if (published) document.dispatchEvent(new CustomEvent('qts:practice-header', { detail: { active: false } }));
    };
  });

  function handleBackToHub(isFromPopState = false): void {
    currentSection = null;
    activeCategory = 'all';
    query = '';
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('muc');
      url.searchParams.delete('section');
      url.searchParams.delete('tab');
      url.searchParams.delete('category');
      if (['#tung-kinh', '#tri-chu', '#nghi-thuc'].includes(url.hash)) url.hash = '';
      if (!isFromPopState && pushedSectionHistory) {
        pushedSectionHistory = false;
        backAfterHandledTransition();
      } else {
        pushedSectionHistory = false;
        window.history.replaceState({ ...window.history.state, section: null }, '', url.toString());
      }
      void tick().then(() => {
        requestAnimationFrame(() => {
          window.scrollTo({ top: savedHubScrollY, behavior: 'instant' });
        });
      });
    }
  }

  async function deleteAdminArticle(article: PracticeArticleSummary): Promise<void> {
    if (!canDeleteContent) return;
    const generation = practiceSyncGeneration;
    if (!await confirmInApp(`Xóa “${article.title}”?`) || !canDeleteContent || generation !== practiceSyncGeneration) return;
    adminNotice = '';
    try {
      await deleteArticleMutation.mutateAsync({ target: article, generation });
    } catch (cause) {
      publishCurrentPracticeContent(
        () => generation === practiceSyncGeneration,
        () => { adminNotice = cause instanceof Error ? cause.message : 'Không thể xóa bài viết.'; },
      );
    }
  }

  function updateScriptureEvidence(observedAtMs = performance.now()): void {
    if (!scriptureEvidenceState) return;
    const delta = Math.max(0, observedAtMs - scriptureEvidenceState.lastObservedAtMs);
    if (!scriptureEvidenceState.hidden) scriptureEvidenceState.activeElapsedMs += delta;
    scriptureEvidenceState.lastObservedAtMs = Math.max(scriptureEvidenceState.lastObservedAtMs, observedAtMs);
    scriptureEvidenceState.maximumScrollDepth = Math.max(
      scriptureEvidenceState.maximumScrollDepth,
      currentDocumentScrollDepth()
    );
  }

  function suspendScriptureEvidence(suspended: boolean): void {
    if (!scriptureEvidenceState) return;
    updateScriptureEvidence();
    scriptureEvidenceState.hidden = suspended || document.visibilityState === 'hidden';
  }

  function saveCurrentPracticePosition(upload = true, throttled = false): void {
    if (!readerProgress || !currentArticle || screen !== 'practice' || !practicePositionReady) return;
    const input = {
      articleId: currentArticle.id,
      articleTitle: currentArticle.title,
      chapterIndex: currentChapterIndex,
      chapterTitle: currentChapterContent?.title ?? '',
      chapterCount: chapters.length,
      scrollDepthPercent: currentDocumentScrollDepth(),
      scrollTop: window.scrollY,
    };
    try {
      if (throttled) readerProgress.schedule(input);
      else {
        readerProgress.save(input);
        pendingPracticeBookmark = {
          id: input.articleId, title: input.articleTitle,
          chapIdx: input.chapterIndex, chapTitle: input.chapterTitle,
          scrollTop: Math.max(0, Math.round(input.scrollTop)), date: new Date().toISOString(),
        };
      }
      if (upload && !throttled) void readerProgress.flush().catch(() => undefined);
    } catch {
      showPracticeFeedback(isEn ? 'Cannot save reading position on device. Please connect to internet and retry.' : 'Không thể lưu vị trí đọc trên thiết bị. Hãy kết nối mạng và thử lại.');
    }
  }

  function finishScriptureEvidence(): void {
    if (!scriptureEvidenceState) return;
    updateScriptureEvidence();
    const state = scriptureEvidenceState;
    finishPracticeEvidence(state.handle, {
      activeSeconds: Math.floor(state.activeElapsedMs / 1_000),
      clientElapsedSeconds: Math.max(0, Math.floor((state.lastObservedAtMs - state.startedAtMs) / 1_000)),
      scrollDepthPercent: Math.min(100, Number(state.maximumScrollDepth.toFixed(2))),
    });
    scriptureEvidenceState = null;
  }

  function updateModelChantElapsed(observedAtMs = performance.now()): void {
    if (!modelChantEvidenceState?.activeStartedAtMs) return;
    modelChantEvidenceState.activeElapsedMs += Math.max(0, observedAtMs - modelChantEvidenceState.activeStartedAtMs);
    modelChantEvidenceState.activeStartedAtMs = observedAtMs;
  }

  function finishModelChant(sequential: boolean): void {
    const state = modelChantEvidenceState;
    if (!state) return;
    updateModelChantElapsed();
    const now = performance.now();
    const articleTitle = currentArticle?.title || '';
    const specificTitle = currentChapterContent?.title && currentChapterContent.title !== currentArticle?.title
      ? `${articleTitle} - ${currentChapterContent.title}`
      : articleTitle;
    finishPracticeEvidence(state.handle, {
      articleTitle,
      title: specificTitle,
      clientElapsedSeconds: Math.max(0, Math.floor((now - state.startedAtMs) / 1_000)),
      playedSeconds: Math.max(0, Math.floor(state.activeElapsedMs / 1_000)),
      sequential,
      skippedSeconds: sequential ? 0 : 1,
    });
    modelChantEvidenceState = null;
    modelChantActive = false;
    modelChantLoading = false;
    state.speech?.destroy();
    try {
      if (modelChantSilentAudio) {
        modelChantSilentAudio.pause();
        modelChantSilentAudio.currentTime = 0;
      }
    } catch {}
    if (disposeModelChantMediaSession) {
      disposeModelChantMediaSession();
      disposeModelChantMediaSession = null;
    }
    updateMediaSessionPlaybackState('none');
    updateMediaSessionMetadata(null);
  }

  function stopModelChant(): void {
    if (!modelChantEvidenceState) {
      try {
        if (modelChantSilentAudio) {
          modelChantSilentAudio.pause();
          modelChantSilentAudio.currentTime = 0;
        }
      } catch {}
      if (disposeModelChantMediaSession) {
        disposeModelChantMediaSession();
        disposeModelChantMediaSession = null;
      }
      updateMediaSessionPlaybackState('none');
      updateMediaSessionMetadata(null);
      return;
    }
    finishModelChant(false);
  }

  function toggleModelChant(): void {
    if (modelChantEvidenceState) {
      stopModelChant();
      showPracticeFeedback(isEn ? 'Chant audio stopped; this session was not recorded as fully completed.' : 'Đã dừng tụng mẫu; phiên này không được ghi nhận là nghe trọn vẹn.');
      return;
    }
    if (!currentArticle) return;
    const text = practiceChantText(practiceHtml);
    if (!text) {
      showPracticeFeedback(isEn ? 'This section has no text to chant.' : 'Phần này chưa có nội dung để tụng mẫu.');
      return;
    }
    const wordCount = text.split(/\s+/u).length;
    const targetDurationSeconds = Math.max(1, Math.floor(wordCount / 5));
    const articleId = currentArticle.id;
    const chantLocale = isEn ? 'en' : 'vi';
    const startedAtMs = performance.now();
    const state: ModelChantEvidenceState = {
      activeElapsedMs: 0,
      activeStartedAtMs: null,
      handle: null,
      startedAtMs,
      speech: null,
    };
    modelChantEvidenceState = state;
    modelChantLoading = true;
    const started = () => {
      if (modelChantEvidenceState !== state) return;
      // Chỉ ghi bằng chứng khi giọng đã phát, không ghi phiên lỗi/thiếu giọng lúc chuẩn bị.
      if (!state.handle) {
        state.handle = startPracticeEvidence({
          activityType: 'model_chant', sourceId: articleId,
          sourceKind: 'practice_article_speech', targetDurationSeconds,
        });
        if (!state.handle) { finishModelChant(false); return; }
        state.startedAtMs = performance.now();
      }
      state.activeStartedAtMs ??= performance.now();
      modelChantLoading = false;
      modelChantActive = true;
      try {
        if (!modelChantSilentAudio && typeof Audio !== 'undefined') {
          modelChantSilentAudio = new Audio(SILENT_AUDIO_URI);
          modelChantSilentAudio.loop = true;
          modelChantSilentAudio.volume = 0.01;
        }
        void modelChantSilentAudio?.play().catch(() => {});
      } catch {}
      if (disposeModelChantMediaSession) {
        disposeModelChantMediaSession();
      }
      disposeModelChantMediaSession = configureMediaSession({
        play: () => {
          try {
            state.speech?.resume();
            void modelChantSilentAudio?.play().catch(() => {});
            updateMediaSessionPlaybackState('playing');
          } catch {}
        },
        pause: () => {
          try {
            state.speech?.pause();
            modelChantSilentAudio?.pause();
            updateMediaSessionPlaybackState('paused');
          } catch {}
        },
        stop: () => {
          stopModelChant();
        }
      });
      const artTitle = currentArticle?.title || (isEn ? 'Scripture Chant' : 'Tụng kinh');
      const specTitle = currentChapterContent?.title && currentChapterContent.title !== currentArticle?.title
        ? `${artTitle} - ${currentChapterContent.title}`
        : artTitle;
      updateMediaSessionMetadata({
        title: specTitle,
        artist: isEn ? 'Chant Voice · Tu Tap' : 'Giọng tụng mẫu · Tu Tập',
        album: isEn ? 'Daily Chanting' : 'Khóa tụng kinh hằng ngày',
        artwork: '/assets/branding/tu-tap-logo.png'
      });
      updateMediaSessionPlaybackState('playing');
    };
    state.speech = createReaderTextToSpeech({
      getText: () => text,
      getLocale: () => chantLocale,
      initialRate: 0.82,
      onState: speechState => {
        if (modelChantEvidenceState !== state) return;
        if (speechState === 'playing') started();
        else if (speechState === 'paused') {
          updateModelChantElapsed();
          state.activeStartedAtMs = null;
          updateMediaSessionPlaybackState('paused');
        } else if (speechState === 'error') finishModelChant(false);
      },
      onNotify: message => showPracticeFeedback(isEn ? localeStore.t.practice.modelChantUnavailable : message),
      onFinish: completed => {
        if (modelChantEvidenceState !== state) return;
        const listened = completed && state.handle !== null;
        finishModelChant(listened);
        showPracticeFeedback(listened
          ? (isEn ? 'Completed listening to the chant.' : 'Đã nghe trọn phần tụng mẫu.')
          : (isEn ? 'Chant audio was interrupted and not counted as completed.' : 'Tụng mẫu bị gián đoạn và không được tính hoàn tất.'));
      },
    });
    state.speech.play();
  }

  function applyMeditationTransition(transition: ReturnType<typeof advanceMeditationSession>): void {
    const wasCompleted = meditationSession?.phase === 'completed';
    const previousActiveElapsedMs = meditationLastActiveElapsedMs;
    meditationSession = transition.state;
    meditationLastActiveElapsedMs = transition.state.activeElapsedMs;
    let startBellIndex = 0;
    for (const cue of transition.cues) {
      if (cue === 'start_bell') {
        const routineStep = activeRoutine?.steps[routineIndex];
        audio?.playPracticeCue(routineStep?.kind === 'meditation' ? routineStep.cue ?? 'bell' : 'bell', startBellIndex * 0.55);
        startBellIndex += 1;
      } else {
        const practiceText = localeStore.t.practice;
        audio?.playMeditationCompletion(practiceText.completionAnnouncement, localeStore.current, () => {
          showPracticeFeedback(practiceText.completionAudioUnavailable);
        });
      }
    }
    if (meditationSetup.woodenFishEnabled && transition.state.phase === 'active' && !transition.state.hidden) {
      for (const _beat of woodenFishBeatsDue(
        previousActiveElapsedMs,
        transition.state.activeElapsedMs,
        meditationSetup.woodenFishBpm,
      )) audio?.playWoodenFishBeat(true);
    }
    if (transition.state.phase === 'completed' && !wasCompleted) {
      stopMeditationTickers();
      const saved = finishMeditationEvidence(transition.state);
      if (saved && activeRoutine?.steps[routineIndex]?.kind === 'meditation') queueMicrotask(() => { void advanceRoutine(false); });
      audio?.pauseMeditation();
      refreshAudioState();
      void wakeLock?.release();
    }
  }

  function finishMeditationEvidence(session: MeditationSessionState): boolean {
    if (meditationLogFinished) return true;
    const minutes = Math.max(1, Math.round(session.activeElapsedMs / 60_000));
    try {
      if (session.activeElapsedMs >= 30_000 && storage && !meditationLocalLogSaved) {
        // Giữ một ID khi ghi sổ hoặc hàng đợi lỗi, để lần thử lại không cộng trùng.
        meditationPendingLog ??= createPracticeLog({
          count: minutes,
          date: getVietnamIsoDate(new Date()),
          note: `Ngồi thiền ${minutes} phút`,
          type: 'Ngồi thiền'
        });
        logs = storage.saveLog(meditationPendingLog);
        meditationLocalLogSaved = true;
      }
      if (meditationEvidenceHandle && practiceEvidence && !practiceEvidence.hasFinished(meditationEvidenceHandle)) {
        if (!practiceEvidence.finish(meditationEvidenceHandle, {
          ...meditationEvidence(session),
          title: localizeUi("Ngồi thiền {0} phút", minutes),
          note: `Ngồi thiền ${minutes} phút`,
          ...(meditationMotion?.getEvidence() ?? { motionStatus: 'disabled' }),
        })) return false;
      }
      meditationLogFinished = true;
      return true;
    } catch (cause) {
      reportPracticeEvidenceFailure(cause);
      return false;
    } finally {
      meditationMotion?.stop();
    }
  }

  function startMeditationTickers(): void {
    stopMeditationTickers();
    // Một ticker đủ cập nhật đồng hồ; RAF song song sẽ nhân vòng lặp theo thời gian.
    meditationTicker = setInterval(() => {
      if (meditationSession && meditationSession.phase !== 'completed' && meditationSession.phase !== 'cancelled') {
        stepMeditation(Date.now());
      } else {
        stopMeditationTickers();
      }
    }, 250);
  }

  function stopMeditationTickers(): void {
    if (meditationTicker) {
      clearInterval(meditationTicker);
      meditationTicker = null;
    }
  }

  function stepMeditation(observedAtMs?: number): void {
    if (!meditationSession) {
      stopMeditationTickers();
      return;
    }
    if (audio?.hasNativeMeditation()) return;
    const now = typeof observedAtMs === 'number' && Number.isFinite(observedAtMs) ? observedAtMs : Date.now();
    applyMeditationTransition(advanceMeditationSession(meditationSession, now));
    if (meditationSession.phase === 'completed' || meditationSession.phase === 'cancelled') {
      stopMeditationTickers();
    }
  }

  async function startGuidedMeditation(setup: MeditationSetup): Promise<void> {
    const generation = practiceSyncGeneration;
    writeToolUrl('meditation', 'meditation', true);
    const principalId = sessionPrincipalId(syncSession);
    if (setup.motionEnabled) void meditationMotion?.requestAndStart();
    else meditationMotion?.disable();
    meditationChooserOpen = false;
    meditationSetup = setup;
    saveGuidedSettings();
    suspendScriptureEvidence(true);
    cleanupPracticeResources();
    const startedAtMs = Date.now();
    meditationLogFinished = false;
    meditationPendingLog = null;
    meditationLocalLogSaved = false;
    meditationSession = createMeditationSession(meditationDurationSeconds(setup.durationMinutes), startedAtMs, undefined, true);
    meditationLastActiveElapsedMs = 0;
    const evidenceHandle = startPracticeEvidence({
      activityType: 'meditation',
      sourceKind: 'guided_meditation',
      targetDurationSeconds: meditationSession.targetSeconds,
    }) ?? null;
    meditationEvidenceHandle = evidenceHandle;
    let reportedMusicError = '';
    let musicUnavailable = false;
    if (setup.musicTrack) {
      const played = await audio?.setMeditationTrack(setup.musicTrack, {
        remainingMs: (meditationSession.preparationSeconds + meditationSession.targetSeconds) * 1_000,
        title: localeStore.t.practice.meditationTitle,
        onNativeState: (state) => {
          if (meditationEvidenceHandle !== evidenceHandle || !meditationSession
            || meditationSession.phase === 'completed' || meditationSession.phase === 'cancelled') return;
          applyMeditationTransition(reconcileMeditationPlayback(meditationSession, state.sleepRemainingMs, Date.now(), state.playWhenReady && !state.error));
          if (state.error && state.error !== reportedMusicError) showPracticeFeedback(localeStore.t.practice.meditationMusicUnavailable);
          reportedMusicError = state.error;
          refreshAudioState();
        },
        onInterrupted: () => {
          if (meditationEvidenceHandle === evidenceHandle && meditationSession
            && ['active', 'preparing'].includes(meditationSession.phase)) pauseGuidedMeditation();
        },
      });
      musicUnavailable = !played;
    }
    if (
      generation !== practiceSyncGeneration
      || principalId !== sessionPrincipalId(syncSession)
      || meditationEvidenceHandle !== evidenceHandle
      || !meditationSession
    ) {
      if (meditationEvidenceHandle === evidenceHandle) closeGuidedMeditation();
      return;
    }
    // Không nhận lại tài nguyên của callback tải nhạc nếu phiên đã dừng hoặc kết thúc.
    if (meditationSession.phase !== 'preparing' && meditationSession.phase !== 'active') return;
    if (musicUnavailable) showPracticeFeedback(localeStore.t.practice.meditationMusicUnavailable);
    refreshAudioState();
    void wakeLock?.request();
    if (!audio?.hasNativeMeditation()) startMeditationTickers();
  }

  function pauseGuidedMeditation(): void {
    if (!meditationSession) return;
    stopMeditationTickers();
    applyMeditationTransition(pauseMeditationSession(meditationSession, audio?.hasNativeMeditation() ? meditationSession.lastObservedAtMs : Date.now()));
    audio?.pauseMeditation();
    refreshAudioState();
    void wakeLock?.release();
  }

  function resumeGuidedMeditation(): void {
    if (!meditationSession) return;
    applyMeditationTransition(resumeMeditationSession(meditationSession, audio?.hasNativeMeditation() ? meditationSession.lastObservedAtMs : Date.now()));
    if (meditationSetup.musicTrack) void audio?.resumeMeditation().then(refreshAudioState);
    if (meditationSession.phase === 'preparing' || meditationSession.phase === 'active') void wakeLock?.request();
    if (!audio?.hasNativeMeditation()) startMeditationTickers();
  }

  function endGuidedMeditation(): void {
    if (!meditationSession || meditationSession.phase === 'completed' || meditationSession.phase === 'cancelled') return;
    stopMeditationTickers();
    const transition = cancelMeditationSession(meditationSession, audio?.hasNativeMeditation() ? meditationSession.lastObservedAtMs : Date.now());
    applyMeditationTransition(transition);
    // Chạm hạn đã thử ghi trong transition; nếu lỗi, nút đóng sẽ thử lại với cùng ID.
    if (transition.state.phase !== 'completed') finishMeditationEvidence(transition.state);
    audio?.pauseMeditation();
    refreshAudioState();
    void wakeLock?.release();
  }

  function closeGuidedMeditation(fromHistory = false): void {
    const hadSession = Boolean(meditationSession);
    if (meditationSession) {
      if (meditationSession.phase !== 'completed' && meditationSession.phase !== 'cancelled') endGuidedMeditation();
      else if (!finishMeditationEvidence(meditationSession)) return;
      if (!meditationLogFinished) return;
    }
    audio?.stopMeditationCompletion();
    meditationMotion?.stop();
    stopMeditationTickers();
    meditationSession = null;
    meditationEvidenceHandle = null;
    meditationPendingLog = null;
    meditationLocalLogSaved = false;
    if (screen === 'practice') suspendScriptureEvidence(false);
    if (hadSession && !fromHistory && presenceMounted) closeToolUrl('meditation');
    if (activeRoutine && !routineAdvancing) endRoutine();
  }

  function cleanupPracticeResources(): void {
    stopAutoScroll();
    stopModelChant();
    audio?.stopAll();
    refreshAudioState();
    void wakeLock?.release();
  }

  async function loadChapter(index: number, pushHistory = true): Promise<void> {
    if (!currentArticle) return;
    const articleId = currentArticle.id;
    if (pushHistory && screen === 'preview' && index !== currentChapterIndex && typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.get('chap') !== String(index)) {
        url.searchParams.set('chap', String(index));
        window.history.pushState({ ...window.history.state, tuTapScreen: 'preview', articleId, chapterIndex: index }, '', url.toString());
      }
    }
    const requestSequence = ++chapterRequestSequence;
    articleLoadError = '';
    failedChapterIndex = null;
    if (loadedChapters[index]) {
      currentChapterIndex = index;
      void preloadChapter(index + 1);
      return;
    }

    const queries = [
      `/api/data/tap_noi_dung?bai_viet_id=eq.${encodeURIComponent(currentArticle.id)}&so_thu_tu=eq.${index}&select=noi_dung,tieu_de,so_thu_tu`,
      `/api/data/tap_noi_dung?bai_viet_id=eq.${encodeURIComponent(currentArticle.id)}&so_thu_tu=eq.${index + 1}&select=noi_dung,tieu_de,so_thu_tu`
    ];

    // Tối ưu tốc độ mở kinh (0-5ms): Luôn nạp từ offline bundle trước
    if (true) {
      try {
        const enCandidates = [
          `/api/data/tap_noi_dung?bai_viet_id=eq.${encodeURIComponent(articleId)}&so_thu_tu=eq.${index}&select=noi_dung,tieu_de,so_thu_tu`,
          `/api/data/tap_noi_dung?bai_viet_id=eq.${encodeURIComponent(articleId)}&so_thu_tu=eq.${index + 1}&select=noi_dung,tieu_de,so_thu_tu`,
          `/api/articles/${encodeURIComponent(articleId)}/chapters`
        ];
        for (const offlineUrl of enCandidates) {
          const offlineResp = await resolveOfflineBundledResponse(offlineUrl);
          if (offlineResp?.ok) {
            const offlineRows = await offlineResp.json() as ChapterRow[];
            const targetRow = (offlineUrl.includes('/chapters') && Array.isArray(offlineRows))
              ? (offlineRows[index] ?? offlineRows[0])
              : offlineRows[0];
            if (targetRow && requestSequence === chapterRequestSequence && currentArticle?.id === articleId) {
              loadedChapters = {
                ...loadedChapters,
                [index]: {
                  content: String(targetRow.noi_dung ?? ""),
                  index,
                  title: String(targetRow.tieu_de ?? chapters[index]?.title ?? currentArticle.title)
                }
              };
              currentChapterIndex = index;
              void preloadChapter(index + 1);
              return;
            }
          }
        }
        if (localeStore.current === 'en') {
          const directEnFiles = [
            `/offline-data/chapters-en/${encodeURIComponent(articleId)}.json`,
            `/offline-data/chapters-en/${encodeURIComponent(articleId.replace(/^book_/u, ''))}.json`,
            `/offline-data/chapters-en/book_${encodeURIComponent(articleId)}.json`
          ];
          for (const path of directEnFiles) {
            try {
              const resp = await (path.startsWith('/offline-data/chapters-en/') ? fetchEnglishChapters(path) : fetch(path));
              if (resp.ok && !isHtmlResponse(resp)) {
                const data = await resp.json().catch(() => []);
                if (Array.isArray(data) && data.length > 0) {
                  const targetRow = data.find((r: any) => Number(r?.so_thu_tu) === index) ?? data[index] ?? data[0];
                  if (targetRow && requestSequence === chapterRequestSequence && currentArticle?.id === articleId) {
                    loadedChapters = {
                      ...loadedChapters,
                      [index]: {
                        content: String(targetRow.noi_dung ?? ""),
                        index,
                        title: String(targetRow.tieu_de ?? chapters[index]?.title ?? currentArticle.title)
                      }
                    };
                    currentChapterIndex = index;
                    void preloadChapter(index + 1);
                    return;
                  }
                }
              }
            } catch {}
          }
        }
      } catch {
        // Roi xuong network/VI fallback ben duoi.
      }
    }
    let networkFailure = false;
    for (const url of queries) {
      try {
        const response = await fetchWithSessionRefresh(url, { headers: { accept: 'application/json' } });
        if (!response.ok) {
          networkFailure = true;
          continue;
        }
        const rows = await response.json() as ChapterRow[];
        if (!rows.length) continue;
        if (requestSequence !== chapterRequestSequence || currentArticle?.id !== articleId) return;

        loadedChapters = {
          ...loadedChapters,
          [index]: {
            content: String(rows[0].noi_dung ?? ''),
            index,
            title: String(rows[0].tieu_de ?? chapters[index]?.title ?? currentArticle.title)
          }
        };
        currentChapterIndex = index;
        void preloadChapter(index + 1);
        return;
      } catch {
        networkFailure = true;
      }
    }

    if (requestSequence !== chapterRequestSequence || currentArticle?.id !== articleId) return;
    // Thử offline bundled resolver nếu chưa tải được nội dung:
    try {
      const offlineCandidates = [
        `/api/data/tap_noi_dung?bai_viet_id=eq.${encodeURIComponent(articleId)}&so_thu_tu=eq.${index}&select=noi_dung,tieu_de,so_thu_tu`,
        `/api/data/tap_noi_dung?bai_viet_id=eq.${encodeURIComponent(articleId)}&so_thu_tu=eq.${index + 1}&select=noi_dung,tieu_de,so_thu_tu`,
        `/api/articles/${encodeURIComponent(articleId)}/chapters`
      ];
      for (const offlineUrl of offlineCandidates) {
        const offlineResp = await resolveOfflineBundledResponse(offlineUrl);
        if (offlineResp?.ok) {
          const offlineRows = await offlineResp.json() as ChapterRow[];
          const targetRow = (offlineUrl.includes('/chapters') && Array.isArray(offlineRows))
            ? (offlineRows[index] ?? offlineRows[0])
            : offlineRows[0];
          if (targetRow && requestSequence === chapterRequestSequence && currentArticle?.id === articleId) {
            loadedChapters = {
              ...loadedChapters,
              [index]: {
                content: String(targetRow.noi_dung ?? ''),
                index,
                title: String(targetRow.tieu_de ?? chapters[index]?.title ?? currentArticle.title)
              }
            };
            currentChapterIndex = index;
            void preloadChapter(index + 1);
            return;
          }
        }
      }
    } catch {
      // Offline resolver thất bại, tiếp tục hiển thị lỗi bên dưới.
    }
    failedChapterIndex = index;
    articleLoadError = localeStore.current === 'en' ? 'Unable to load chapter content. Please check your connection and try again.' : 'Không thể tải nội dung tập. Vui lòng kiểm tra lại.';
    return;

    loadedChapters = {
      ...loadedChapters,
      [index]: {
        content: '',
        index,
        title: chapters[index]?.title ?? currentArticle?.title ?? ''
      }
    };
    currentChapterIndex = index;
  }

  async function preloadChapter(index: number): Promise<void> {
    const article = currentArticle;
    if (!article || index < 0 || index >= chapters.length || loadedChapters[index]) return;
    const articleSequence = articleRequestSequence;
    const locale = localeStore.current;
    // Foreground chapter navigation must not invalidate useful same-book prefetches.
    const isCurrent = () => articleRequestSequence === articleSequence
      && currentArticle === article && localeStore.current === locale && !loadedChapters[index];
    // PRELOAD_EN_FIRST_MARK: preload cung uu tien EN offline.
    if (locale === 'en') {
      try {
        const preResp = await resolveOfflineBundledResponse(
          `/api/data/tap_noi_dung?bai_viet_id=eq.${encodeURIComponent(article.id)}&so_thu_tu=eq.${index}&select=noi_dung,tieu_de,so_thu_tu`
        );
        if (!isCurrent()) return;
        if (preResp?.ok) {
          const preRows = await preResp.json() as ChapterRow[];
          if (!isCurrent()) return;
          if (preRows.length) {
            loadedChapters = {
              ...loadedChapters,
              [index]: {
                content: String(preRows[0].noi_dung ?? ""),
                index,
                title: String(preRows[0].tieu_de ?? chapters[index]?.title ?? article.title)
              }
            };
            return;
          }
        }
      } catch {
        // Roi xuong network.
      }
    }

    const queries = [
      `/api/data/tap_noi_dung?bai_viet_id=eq.${encodeURIComponent(article.id)}&so_thu_tu=eq.${index}&select=noi_dung,tieu_de,so_thu_tu`,
      `/api/data/tap_noi_dung?bai_viet_id=eq.${encodeURIComponent(article.id)}&so_thu_tu=eq.${index + 1}&select=noi_dung,tieu_de,so_thu_tu`
    ];
    for (const url of queries) {
      if (!isCurrent()) return;
      try {
        const response = await fetchWithSessionRefresh(url, { headers: { accept: 'application/json' } });
        if (!isCurrent()) return;
        if (!response.ok) continue;
        const rows = await response.json() as ChapterRow[];
        if (!isCurrent() || !rows.length) return;
        loadedChapters = {
          ...loadedChapters,
          [index]: {
            content: String(rows[0].noi_dung ?? ''),
            index,
            title: String(rows[0].tieu_de ?? chapters[index]?.title ?? article.title)
          }
        };
        return;
      } catch {
        // Preloading is opportunistic. The foreground loader keeps retry UI.
      }
    }
  }

  async function switchPracticeChapter(index: number): Promise<void> {
    const generation = practiceSyncGeneration;
    const article = currentArticle;
    saveCurrentPracticePosition();
    practicePositionReady = false;
    await loadChapter(index);
    await tick();
    if (generation !== practiceSyncGeneration || currentArticle !== article || screen !== 'practice') return;
    window.scrollTo({ behavior: 'instant', left: window.scrollX, top: 0 });
    practicePositionReady = true;
    saveCurrentPracticePosition();
    if (scriptureEvidenceState) scriptureEvidenceState.maximumScrollDepth = currentDocumentScrollDepth();
  }

  let pushedTuTapHistory = false;
  let ignoreNextHandledPopState = false;
  let toolNavigationGeneration = 0;
  type ToolAction = 'giu-gioi' | 'bat-quan-trai' | 'thanh-tinh' | 'le-phat' | 'rosary' | 'meditation' | 'cong-phu' | 'thoi-khoa' | 'tiep-tuc-cong-phu';
  const toolActions: readonly string[] = ['giu-gioi', 'bat-quan-trai', 'thanh-tinh', 'le-phat', 'rosary', 'meditation', 'cong-phu', 'thoi-khoa', 'tiep-tuc-cong-phu'];

  function toolFromUrl(url: URL): ToolAction | null {
    const action = url.searchParams.get('action');
    if (action && toolActions.includes(action)) return action as ToolAction;
    const mode = url.searchParams.get('mode');
    const legacyScreen = url.searchParams.get('screen');
    if (mode === 'meditation' || url.hash === '#thien-dinh') return 'meditation';
    if (mode === 'rosary' || legacyScreen === 'rosary' || url.searchParams.get('rosary') === 'start' || url.hash === '#trang-hat') return 'rosary';
    if (mode === 'le-phat' || mode === 'lephat' || legacyScreen === 'le-phat' || url.searchParams.get('le-phat') === 'start' || url.hash === '#le-phat') return 'le-phat';
    if (url.hash === '#giu-gioi') return 'giu-gioi';
    if (url.hash === '#bat-quan-trai') return 'bat-quan-trai';
    if (url.hash === '#thanh-tinh') return 'thanh-tinh';
    return null;
  }

  function withoutToolUrl(url: URL): URL {
    if (toolActions.includes(url.searchParams.get('action') ?? '')) url.searchParams.delete('action');
    if (['meditation', 'rosary', 'le-phat', 'lephat'].includes(url.searchParams.get('mode') ?? '')) url.searchParams.delete('mode');
    if (['rosary', 'le-phat'].includes(url.searchParams.get('screen') ?? '')) url.searchParams.delete('screen');
    if (url.searchParams.get('rosary') === 'start') url.searchParams.delete('rosary');
    if (url.searchParams.get('le-phat') === 'start') url.searchParams.delete('le-phat');
    if (['#thien-dinh', '#trang-hat', '#giu-gioi', '#bat-quan-trai', '#thanh-tinh', '#le-phat'].includes(url.hash)) url.hash = '';
    return url;
  }

  function toolHistoryState(action: ToolAction, stage: string, returnScreen: 'catalog' | 'practice' = screen === 'practice' ? 'practice' : 'catalog') {
    return { ...window.history.state, tuTapScreen: stage, tuTapAction: action, tuTapReturnScreen: returnScreen, tuTapPreceptMode: action === 'bat-quan-trai' ? 'eight' : action === 'giu-gioi' ? 'daily' : window.history.state?.tuTapPreceptMode, tuTapPreceptBridge: false };
  }

  function writeToolUrl(action: ToolAction, stage: string, replace = false, returnScreen: 'catalog' | 'practice' = screen === 'practice' ? 'practice' : 'catalog'): void {
    if (typeof window === 'undefined') return;
    toolNavigationGeneration += 1;
    const current = new URL(window.location.href);
    const sameEntry = toolFromUrl(current) === action && window.history.state?.tuTapAction === action;
    const url = withoutToolUrl(current);
    // URL chỉ đổi trạng thái điều hướng trong shell, không gọi lại load/API.
    url.searchParams.set('action', action);
    if (action === 'rosary' && stage === 'rosary') url.searchParams.set('mode', 'rosary');
    window.history[replace || sameEntry ? 'replaceState' : 'pushState'](toolHistoryState(action, stage, returnScreen), '', url.toString());
  }

  function closeToolUrl(action: ToolAction): void {
    if (typeof window === 'undefined') return;
    toolNavigationGeneration += 1;
    if (window.history.state?.tuTapAction === action && toolFromUrl(new URL(window.location.href)) === action) {
      ignoreNextHandledPopState = true;
      window.history.back();
    } else {
      const url = withoutToolUrl(new URL(window.location.href));
      window.history.replaceState({ ...window.history.state, tuTapAction: null, tuTapScreen: screen }, '', url.toString());
    }
  }

  function dismissCatalogOverlays(): void {
    recommendationsCollapsed = true;
    continueReadingCollapsed = true;
    if (preferences.trackerOpen) preferences = { ...preferences, trackerOpen: false };
  }

  function refreshTrackerDate(): void {
    const now = new Date();
    if (getVietnamIsoDate(recommendationClock) !== getVietnamIsoDate(now)) recommendationClock = now;
  }

  function setCatalogOverlay(action: 'cong-phu' | 'thoi-khoa' | 'tiep-tuc-cong-phu', open: boolean, updateHistory = true): void {
    if (action === 'cong-phu') {
      if (open) refreshTrackerDate();
      if (preferences.trackerOpen !== open) preferences = storage?.savePreferences({ trackerOpen: open }) ?? { ...preferences, trackerOpen: open };
    } else if (action === 'thoi-khoa') recommendationsCollapsed = !open;
    else continueReadingCollapsed = !open;
    if (updateHistory) {
      if (open) writeToolUrl(action, 'catalog-tool');
      else closeToolUrl(action);
    }
  }

  function restoreTool(action: ToolAction, stage?: string): void {
    const returnScreen = currentArticle && (screen === 'practice' || window.history.state?.tuTapReturnScreen === 'practice') ? 'practice' : 'catalog';
    if (action === 'giu-gioi' || action === 'bat-quan-trai') {
      openPrecepts(action === 'bat-quan-trai' ? 'eight' : 'daily', false, returnScreen);
    } else if (action === 'thanh-tinh') openThanhTinh(returnScreen, false);
    else if (action === 'le-phat') openLePhat(returnScreen, false);
    else if (action === 'meditation') { if (!meditationSession) void requestMeditation(false); }
    else if (action === 'rosary') {
      if (stage === 'rosary') {
        if (screen !== 'rosary') resumeRosaryVisit();
        rosaryReturnScreen = returnScreen; suspendScriptureEvidence(true); screen = 'rosary';
      }
      else requestRosaryStart(returnScreen, false);
    } else setCatalogOverlay(action, true, false);
  }

  function sectionFromUrl(url: URL): 'KINH PHẬT' | 'TRÌ CHÚ' | 'NGHI THỨC KHÁC' | null {
    const section = url.searchParams.get('muc') || url.searchParams.get('section') || url.searchParams.get('tab') || url.searchParams.get('category') || url.hash;
    if (['kinh', 'kinh-phat', '#tung-kinh'].includes(section)) return 'KINH PHẬT';
    if (['tri-chu', 'chu', '#tri-chu'].includes(section)) return 'TRÌ CHÚ';
    if (['nghi-thuc', 'nghi-thuc-khac', '#nghi-thuc'].includes(section)) return 'NGHI THỨC KHÁC';
    return null;
  }

  async function handleOpenArticle(article: PracticeArticleSummary): Promise<void> {
    if (typeof window !== 'undefined') {
      savedHubScrollY = window.scrollY;
    }
    if (currentSection === null && (article.category === 'KINH PHẬT' || article.category === 'TRÌ CHÚ' || article.category === 'NGHI THỨC KHÁC')) {
      currentSection = article.category;
      activeCategory = article.category;
    }
    await openArticle(article);
  }

  function backToCatalog(isFromPopState = false): void {
    currentArticle = null;
    pendingPracticeBookmark = null;
    practicePositionReady = false;
    currentChapterIndex = null;
    screen = 'catalog';
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.delete('article');
      url.searchParams.delete('book');
      url.searchParams.delete('id');
      url.searchParams.delete('sach');
      url.searchParams.delete('chap');
      const nextUrl = url.pathname + (url.search ? url.search : '');
      if (!isFromPopState && pushedTuTapHistory) {
        pushedTuTapHistory = false;
        backAfterHandledTransition();
      } else {
        pushedTuTapHistory = false;
        window.history.replaceState({ ...window.history.state, articleId: null }, '', nextUrl);
      }
    }
  }

  let handledTargetId = $state<string | null>(null);
  let checkedInitialUrl = $state(false);
  let initialToolRestoring = $state(false);
  const communityTargetReady = $derived(checkedInitialUrl && !initialToolRestoring);
  async function restoreInitialTool(initialUrl: URL, action: ToolAction): Promise<void> {
    const navigationGeneration = toolNavigationGeneration;
    const previousState = window.history.state;
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming | undefined;
    // Reload có thể không còn custom state sau khi shell khôi phục lịch sử.
    const restoreHistoryEntry = previousState?.tuTapAction === action || navigation?.type === 'reload' || navigation?.type === 'back_forward';
    const params = initialUrl.searchParams;
    const targetId = params.get('article') || params.get('book') || params.get('id') || params.get('sach');
    const article = targetId ? findInitialArticle(targetId) : null;
    const returnScreen = article && (previousState?.tuTapReturnScreen === 'practice' || params.get('mode') === 'practice' || params.get('start') === '1') ? 'practice' : 'catalog';
    if (article) {
      const expectedSequence = articleRequestSequence + 1;
      await openArticle(article, false, false, true);
      if (!presenceMounted || navigationGeneration !== toolNavigationGeneration || articleRequestSequence !== expectedSequence || currentArticle?.id !== article.id) return;
      const chapter = Number(params.get('chap'));
      if (Number.isInteger(chapter) && chapter > 0) await loadChapter(chapter - 1, false);
      if (!presenceMounted || navigationGeneration !== toolNavigationGeneration || articleRequestSequence !== expectedSequence) return;
      window.history.replaceState(previousState, '', initialUrl.toString());
    }
    if (!presenceMounted) return;
    screen = returnScreen;
    const legacyActiveRosary = params.get('mode') === 'rosary' || params.get('screen') === 'rosary' || params.get('rosary') === 'start';
    const stage = previousState?.tuTapScreen ?? (action === 'rosary' ? (legacyActiveRosary ? 'rosary' : 'rosary-start') : action === 'meditation' ? 'meditation-chooser' : action);
    if (!restoreHistoryEntry) {
      const base = withoutToolUrl(new URL(initialUrl));
      window.history.replaceState({ ...previousState, tuTapAction: null, tuTapScreen: returnScreen }, '', base.toString());
    }
    writeToolUrl(action, stage, restoreHistoryEntry, returnScreen);
    if (previousState?.tuTapPreceptBridge) window.history.replaceState({ ...window.history.state, tuTapPreceptBridge: true, tuTapPreceptMode: previousState.tuTapPreceptMode }, '', window.location.href);
    restoreTool(action, stage);
  }
  function findInitialArticle(targetId: string): PracticeArticleSummary | undefined {
    const normalizedTarget = targetId.toLowerCase().trim();
    return articles.find((article: PracticeArticleSummary) => article.id === targetId || article.id.toLowerCase() === normalizedTarget
      || article.id.replace(/^tt_/u, '').replace(/_/gu, '-') === normalizedTarget.replace(/_/gu, '-')
      || article.title.toLowerCase().includes(normalizedTarget)
      || (normalizedTarget.includes('dai-bi') && (article.id.includes('dai-bi') || article.id.includes('dai_bi') || article.title.toLowerCase().includes('đại bi')))
      || (normalizedTarget.includes('dia-tang') && (article.id.includes('dia-tang') || article.id.includes('dia_tang') || article.title.toLowerCase().includes('địa tạng'))));
  }
  $effect(() => {
    if (checkedInitialUrl || !presenceMounted || (catalogLoading && !articles.length)) return;
    checkedInitialUrl = true;
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const initialUrl = new URL(window.location.href);
    const tool = toolFromUrl(initialUrl);
    if (tool) {
      initialToolRestoring = true;
      void restoreInitialTool(initialUrl, tool).catch(() => {
        console.warn('Không thể khôi phục công cụ từ liên kết khởi động.');
      }).finally(() => { if (presenceMounted) initialToolRestoring = false; });
      return;
    }
    const section = sectionFromUrl(new URL(window.location.href));
    if (section) {
      currentSection = section; activeCategory = section;
      const url = new URL(window.location.href);
      url.searchParams.set('muc', section === 'KINH PHẬT' ? 'kinh' : section === 'TRÌ CHÚ' ? 'tri-chu' : 'nghi-thuc');
      for (const alias of ['section', 'tab', 'category']) url.searchParams.delete(alias);
      if (['#tung-kinh', '#tri-chu', '#nghi-thuc'].includes(url.hash)) url.hash = '';
      window.history.replaceState({ ...window.history.state, section }, '', url.toString());
    }
    const targetId = params.get('article') || params.get('book') || params.get('id') || params.get('sach');
    if (targetId) {
      handledTargetId = targetId;
      const found = findInitialArticle(targetId);
      if (found) {
        const autoPractice = params.get('mode') === 'practice' || params.get('action') === 'practice' || params.get('start') === '1';
        initialToolRestoring = true;
        void openArticle(found, autoPractice, false).then(() => {
          if (autoPractice) {
            void startPractice();
          }
        }).catch(() => {
          console.warn('Không thể khôi phục bài thực hành từ liên kết khởi động.');
        }).finally(() => { if (presenceMounted) initialToolRestoring = false; });
      }
    } else if (preferences.trackerOpen) writeToolUrl('cong-phu', 'catalog-tool');
  });

  async function openArticle(article: PracticeArticleSummary, autoStart = false, pushHistory = true, restoreContextOnly = false): Promise<void> {
    dismissCatalogOverlays();
    const requestSequence = ++articleRequestSequence;
    ++chapterRequestSequence;
    lastRequestedArticle = article;
    failedChapterIndex = null;
    articleLoadError = '';

    if (typeof window !== 'undefined') {
      const url = withoutToolUrl(new URL(window.location.href));
      url.searchParams.set('article', article.id);
      if (pushHistory) {
        pushedTuTapHistory = true;
        window.history.pushState({ ...window.history.state, tuTapScreen: 'preview', articleId: article.id }, '', url.toString());
      } else {
        window.history.replaceState({ ...window.history.state, tuTapScreen: 'preview', articleId: article.id }, '', url.toString());
      }
    }

    const previousBundle = articleDetailCache.get(article.id);
    if (previousBundle?.locale && previousBundle.locale !== localeStore.current) articleDetailCache.delete(article.id);
    if (!articleDetailCache.has(article.id)) {
      try {
        const bundled = await loadBundledPracticeMantra(article.id, localeStore.current);
        if (requestSequence !== articleRequestSequence) return;
        if (bundled) articleDetailCache.set(article.id, {
          detail: { ...article, content: bundled.detail.content, tocTitles: bundled.detail.tocTitles },
          chapters: bundled.chapters.map((row, index) => ({ index, title: row.tieu_de, summary: row.tom_tat })),
          contents: Object.fromEntries(bundled.chapters.map((row, index) => [index, { index, title: row.tieu_de, content: row.noi_dung }])),
          identity: null,
          locale: localeStore.current,
        });
      } catch {
        // Gói không khả dụng vẫn dùng luồng đọc/offline hiện có, không xóa dữ liệu.
      }
    }
    // Fast path: if article was already loaded in memory, open in 0ms
    const cached = articleDetailCache.get(article.id);
    if (cached) {
      currentArticle = cached.detail;
      chapters = cached.chapters;
      loadedChapters = cached.contents ?? {};
      currentChapterIndex = null;
      practicePositionReady = false;
      if (restoreContextOnly) return;
      screen = 'preview';
      if (typeof window !== 'undefined') {
        window.scrollTo({ behavior: 'instant', left: 0, top: 0 });
      }

      void readerProgress?.load(cached.detail.id).then((resume) => {
        if (requestSequence === articleRequestSequence && currentArticle?.id === cached.detail.id) {
          pendingPracticeBookmark = resume;
          if (resume?.chapIdx !== null && resume?.chapIdx !== undefined && resume.chapIdx >= 0 && currentChapterIndex === null) {
            void loadChapter(resume.chapIdx);
          }
          if (autoStart) {
            confirmation = 'start-practice';
          }
        }
      });
      return;
    }

    try {
      let rows: ArticleDetailRow[] | null = null;
      let contentIdentity: string | null = null;
      // 1. Kiểm tra dữ liệu offline bundled cục bộ trước để mở tức thì (0-2ms), khắc phục hoàn toàn độ trễ 1-2s mạng
      try {
        const offlineResp = await resolveOfflineBundledResponse(`/api/data/baiviet?id=eq.${encodeURIComponent(article.id)}&select=*`);
        if (offlineResp?.ok) {
          const offlineRows = await offlineResp.json() as ArticleDetailRow[];
          if (offlineRows.length) rows = offlineRows;
        }
      } catch {}

      // 2. Nếu không có trong bundle ngoại tuyến, mới tải qua mạng
      if (!rows || !rows.length) {
        try {
          const response = await fetchWithSessionRefresh(`/api/data/baiviet?id=eq.${encodeURIComponent(article.id)}&select=*`, {
            headers: { accept: 'application/json' }
          });
          if (response.ok) {
            rows = await response.json() as ArticleDetailRow[];
            contentIdentity = response.headers.get('X-Practice-Content-Identity');
          }
        } catch {
          // Mạng thất bại
        }
      }
      if (!rows || !rows.length) throw new Error('article_unavailable');
      if (requestSequence !== articleRequestSequence) return;

      const detail = mapArticleDetail(rows[0]);
      currentArticle = detail;
      chapters = [];
      loadedChapters = {};
      currentChapterIndex = null;
      practicePositionReady = false;
      screen = 'preview';
      if (typeof window !== 'undefined') {
        window.scrollTo({ behavior: 'instant', left: 0, top: 0 });
      }

      const resumePromise = restoreContextOnly ? undefined : readerProgress?.load(detail.id);

      let loadedChapterPreviews: PracticeChapterPreview[] = [];
      if (detail.hasTableOfContents) {
        if (detail.tocTitles.length) {
          loadedChapterPreviews = detail.tocTitles.map((title, index) => ({
            index,
            summary: '',
            title
          }));
          chapters = loadedChapterPreviews;
        }

        // Ưu tiên danh sách chương tiếng Anh nếu ở EN mode
        if (localeStore.current === 'en') {
          try {
            let enRows: ChapterRow[] = [];
            const enOffline = await resolveOfflineBundledResponse(`/api/articles/${encodeURIComponent(detail.id)}/chapters`);
            if (enOffline?.ok) {
              enRows = (await enOffline.json().catch(() => [])) as ChapterRow[];
            }
            if (!Array.isArray(enRows) || enRows.length === 0) {
              const directEnFiles = [
                `/offline-data/chapters-en/${encodeURIComponent(detail.id)}.json`,
                `/offline-data/chapters-en/${encodeURIComponent(detail.id.replace(/^book_/u, ''))}.json`,
                `/offline-data/chapters-en/book_${encodeURIComponent(detail.id)}.json`
              ];
              for (const path of directEnFiles) {
                try {
                  const resp = await (path.startsWith('/offline-data/chapters-en/') ? fetchEnglishChapters(path) : fetch(path));
                  if (resp.ok && !isHtmlResponse(resp)) {
                    const data = await resp.json().catch(() => []);
                    if (Array.isArray(data) && data.length > 0) {
                      enRows = data as ChapterRow[];
                      break;
                    }
                  }
                } catch {}
              }
            }
            if (Array.isArray(enRows) && enRows.length > 0 && requestSequence === articleRequestSequence && currentArticle?.id === detail.id) {
              contentIdentity = null;
              loadedChapterPreviews = enRows.map((row, index) => ({
                index,
                summary: String(row.tom_tat ?? ''),
                title: String(row.tieu_de ?? '')
              })).filter((chapter) => chapter.title);
              chapters = loadedChapterPreviews;
            }
          } catch {}
        }

        try {
          const chapterResponse = await fetchWithSessionRefresh(
            `/api/data/tap_noi_dung?bai_viet_id=eq.${encodeURIComponent(detail.id)}&order=so_thu_tu.asc&select=so_thu_tu,tieu_de,tom_tat&limit=5000`,
            { headers: { accept: 'application/json' } }
          );
          if (chapterResponse.ok) {
            const rowsPreview = await chapterResponse.json() as ChapterRow[];
            if (requestSequence === articleRequestSequence && currentArticle?.id === detail.id && rowsPreview.length) {
              if (localeStore.current !== 'en' || !hasEnglishChapters(detail.id)) {
                if (chapterResponse.headers.get('X-Practice-Content-Identity') !== contentIdentity) contentIdentity = null;
                loadedChapterPreviews = rowsPreview.map((row, index) => ({
                  index,
                  summary: String(row.tom_tat ?? ''),
                  title: String(row.tieu_de ?? '')
                })).filter((chapter) => chapter.title);
                chapters = loadedChapterPreviews;
              }
            }
          }
        } catch {
          // Khi mất mạng, dùng tocTitles từ dữ liệu bundled đã có.
        }
      }

      // Không để phản hồi trước lần sửa nội dung/đổi tài khoản làm sống lại cache cũ.
      if (requestSequence !== articleRequestSequence || currentArticle?.id !== detail.id) return;
      articleDetailCache.set(article.id, { detail, chapters: loadedChapterPreviews, identity: contentIdentity });
      if (restoreContextOnly) return;

      const resume = await resumePromise;
      if (requestSequence === articleRequestSequence && currentArticle?.id === detail.id) {
        pendingPracticeBookmark = resume ?? null;
        if (resume?.chapIdx !== null && resume?.chapIdx !== undefined && resume.chapIdx >= 0 && currentChapterIndex === null) {
          void loadChapter(resume.chapIdx);
        }
        if (autoStart) {
          confirmation = 'start-practice';
        }
      }
    } catch {
      if (requestSequence !== articleRequestSequence) return;
      articleLoadError = localeStore.current === 'en'
        ? 'Unable to load practice scripture. Please check your connection and try again.'
        : 'Không thể tải bài tu tập. Vui lòng kiểm tra kết nối và thử lại.';
    }
  }

  function requestStartPractice(): void {
    confirmation = 'start-practice';
  }

  async function startPractice(): Promise<void> {
    if (!currentArticle) return;
    const generation = practiceSyncGeneration;
    const principalId = sessionPrincipalId(syncSession);
    const article = currentArticle;
    confirmation = null;
    practiceCount = 0;
    panelOpen = true;
    screen = 'practice';
    if (currentArticle.hasTableOfContents) {
      let waited = 0;
      while (!chapters.length && waited < 25) {
        await new Promise((r) => setTimeout(r, 80));
        waited++;
      }
      const savedChapter = pendingPracticeBookmark?.chapIdx;
      const chapterIndex = savedChapter !== null && savedChapter !== undefined && savedChapter < chapters.length
        ? savedChapter
        : currentChapterIndex ?? 0;
      await loadChapter(chapterIndex);
    }
    if (
      generation !== practiceSyncGeneration
      || principalId !== sessionPrincipalId(syncSession)
      || currentArticle !== article
      || screen !== 'practice'
    ) return;
    await tick();
    if (
      generation !== practiceSyncGeneration
      || principalId !== sessionPrincipalId(syncSession)
      || currentArticle !== article
      || screen !== 'practice'
    ) return;
    if (pendingPracticeBookmark && pendingPracticeBookmark.scrollTop > 0) {
      const articleId = currentArticle.id;
      restorePracticeWindowScroll(
        pendingPracticeBookmark.scrollTop,
        requestAnimationFrame,
        () => generation === practiceSyncGeneration
          && principalId === sessionPrincipalId(syncSession)
          && screen === 'practice' && currentArticle?.id === articleId,
      );
      showPracticeFeedback(localeStore.current === 'en'
        ? `📖 Continuing cultivation${pendingPracticeBookmark.chapTitle ? `: ${pendingPracticeBookmark.chapTitle}` : ''}`
        : `📖 Tiếp tục công phu${pendingPracticeBookmark.chapTitle ? `: ${pendingPracticeBookmark.chapTitle}` : ''}`);
    } else {
      if (typeof window !== 'undefined') {
        window.scrollTo({ behavior: 'instant', left: 0, top: 0 });
      }
    }
    requestAnimationFrame(() => requestAnimationFrame(() => {
      if (generation === practiceSyncGeneration && currentArticle === article && screen === 'practice') {
        practicePositionReady = true;
      }
    }));
    const startedAtMs = performance.now();
    const targetDurationSeconds = practiceReadingMinimumSeconds(practiceHtml);
    const handle = startPracticeEvidence({
      activityType: 'scripture',
      sourceId: currentArticle.id,
      sourceKind: 'practice_article',
      targetDurationSeconds,
    });
    if (handle) {
      scriptureEvidenceState = {
        activeElapsedMs: 0,
        handle,
        hidden: document.visibilityState === 'hidden',
        lastObservedAtMs: startedAtMs,
        maximumScrollDepth: currentDocumentScrollDepth(),
        startedAtMs,
      };
    }
    history.pushState({ practice: true }, '', window.location.href);
    void wakeLock?.request();
    showPracticeFeedback(localeStore.current === 'en' ? '🙏 Namo! Practice session began' : '🙏 Nam mô! Công phu bắt đầu');
  }

  function stopAutoScroll(): void {
    autoScroll?.stop();
  }

  function toggleAutoScroll(): void {
    autoScroll?.toggle();
  }

  function changeAutoScrollSpeed(speed: PracticeAutoScrollSpeed): void {
    autoScrollSpeed = speed;
    autoScroll?.setSpeed(speed);
  }

  function requestExitPractice(): void {
    if (!currentArticle) return;
    confirmation = 'exit-practice';
  }

  function confirmExitPractice(): void {
    confirmation = null;
    saveCurrentPracticePosition();
    const count = practiceCount;
    if (count > 0 && storage) {
      const today = getVietnamIsoDate(new Date());
      const pType = inferPracticeType(currentArticle?.title, currentArticle?.category);
      const articleTitle = currentArticle?.title || '';
      const specificTitle = currentChapterContent?.title && currentChapterContent.title !== articleTitle
        ? `${articleTitle} - ${currentChapterContent.title}`
        : (articleTitle || pType);
      const newLog = createPracticeLog({
        count,
        date: today,
        note: specificTitle,
        type: pType
      });
      logs = storage.saveLog(newLog);
      practiceCount = 0;
      void syncClient?.push(syncSession);
      showPracticeFeedback(localeStore.current === 'en'
        ? `☸️ Merit dedicated & auto-recorded ${count} counts (${pType}: ${specificTitle})`
        : `☸️ Đã hồi hướng & tự động ghi nhận ${count} biến (${pType}: ${specificTitle})`);
    } else {
      showPracticeFeedback(localeStore.current === 'en' ? '☸️ Merit dedicated to all sentient beings' : '☸️ Đã hồi hướng công đức');
    }
    finishScriptureEvidence();
    cleanupPracticeResources();
    screen = 'preview';
    if (typeof window !== 'undefined' && window.history.state?.practice === true) {
      backAfterHandledTransition();
    }
    if (typeof window !== 'undefined') {
      window.scrollTo({ behavior: 'instant', left: 0, top: 0 });
    }
  }

  function requestRosaryStart(returnScreen: 'catalog' | 'practice', updateHistory = true): void {
    // Không để dữ liệu danh mục trả muộn mở lại chooser sau lựa chọn trực tiếp.
    checkedInitialUrl = true;
    dismissCatalogOverlays();
    rosaryReturnScreen = returnScreen;
    confirmation = 'start-rosary';
    if (updateHistory) writeToolUrl('rosary', 'rosary-start', false, returnScreen);
  }

  function requestRosaryExit(): void {
    rhythm?.pause();
    confirmation = null;
    rosaryEndError = '';
    rosaryEndStage = 'confirm';
  }

  function resumeRosaryVisit(): void {
    if (rosaryVisitCount !== preferences.rosaryCount) rosaryVisitPhrases = [];
    rosaryVisitCount = preferences.rosaryCount;
    rosaryEndStage = null;
    rosaryEndError = '';
  }

  function leaveRosary(isFromPopState = false): void {
    stopRhythm();
    confirmation = null;
    try {
      settleRestoredRosaryCount();
      finishRosaryEvidence();
      if (rosarySession) throw new Error('practice_evidence_not_saved');
      saveGuidedSettings();
    } catch (cause) { reportPracticeEvidenceFailure(cause); return; }
    rosaryEndStage = null;
    rosaryEndError = '';
    screen = rosaryReturnScreen === 'practice' && currentArticle ? 'practice' : 'catalog';
    if (screen === 'practice') suspendScriptureEvidence(false);
    if (!isFromPopState) closeToolUrl('rosary');
    if (activeRoutine && !routineAdvancing) endRoutine();
  }

  function closeRosary(isFromPopState = false, showSummary = false): void {
    stopRhythm();
    if (activeRoutine && !routineAdvancing) endRoutine();
    confirmation = null;
    try {
      if (rosaryEndStage !== 'complete') {
        const selectedStorage = principalStorage();
        if (selectedStorage) createRosaryCompletion(selectedStorage).recoverReset(() => {
          preferences = storage?.savePreferences({ rosaryCount: 0 }) ?? preferences;
        });
        settleRestoredRosaryCount();
        finishRosaryEvidence();
        if (rosarySession) throw new Error('practice_evidence_not_saved');
        // Kết thúc đã xác nhận mới đặt lại bộ đếm, sau khi sổ và bằng chứng được lưu.
        resetRosaryCount();
      }
    } catch (cause) {
      rosaryEndError = practiceUi(localeStore.current === 'en', 'Chưa chốt sổ được. Phiên vẫn được giữ; vui lòng thử lại.');
      reportPracticeEvidenceFailure(cause);
      return;
    }
    rosaryEndError = '';
    if (rosaryEndStage !== 'complete') void syncClient?.push(syncSession);
    if (showSummary) { rosaryEndStage = 'complete'; return; }
    rosaryEndStage = null;
    screen = rosaryReturnScreen === 'practice' && currentArticle ? 'practice' : 'catalog';
    if (screen === 'practice') suspendScriptureEvidence(false);
    if (!isFromPopState) closeToolUrl('rosary');
  }

  function resetRosary(): void {
    confirmation = null;
    try {
      finishRosaryEvidence();
      resetRosaryCount();
      rosaryVisitCount = 0;
      rosaryVisitPhrases = [];
    } catch (cause) { reportPracticeEvidenceFailure(cause); }
  }

  function openLePhat(returnScreen: 'catalog' | 'practice' = 'catalog', updateHistory = true): void {
    dismissCatalogOverlays();
    lePhatReturnScreen = returnScreen;
    suspendScriptureEvidence(true);
    screen = 'le-phat';
    if (updateHistory) writeToolUrl('le-phat', 'le-phat', false, returnScreen);
  }

  function closeLePhat(count = 0, buddha?: BuddhaInfo, isFromPopState = false, fromRoutine = false): void {
    if (count > 0 && storage && buddha) {
      const today = getVietnamIsoDate(new Date());
      const newLog = createPracticeLog({
        count,
        date: today,
        note: localeStore.current === 'en' ? `Prostrations — ${buddha.name}` : `Lễ Phật — ${buddha.name}`,
        type: 'Lễ Phật'
      });
      logs = storage.saveLog(newLog);
      if (!settlingBowingPrincipal) {
        void syncClient?.push(syncSession);
        showPracticeFeedback(localeStore.current === 'en'
          ? `🙏 Auto-recorded ${count} prostrations (${buddha.name}) into practice journal`
          : `🙏 Đã tự động ghi nhận ${count} lạy (${buddha.name}) vào Sổ công phu`);
      }
    }
    screen = lePhatReturnScreen === 'practice' && currentArticle ? 'practice' : 'catalog';
    if (screen === 'practice') suspendScriptureEvidence(false);
    if (!isFromPopState) closeToolUrl('le-phat');
    if (activeRoutine && !routineAdvancing && !fromRoutine) endRoutine();
  }

  function openPrecepts(mode: 'daily' | 'eight' = 'daily', updateHistory = true, returnScreen: 'catalog' | 'practice' = screen === 'practice' ? 'practice' : 'catalog'): void {
    if (preceptsOpen && preceptMode === mode) return;
    dismissCatalogOverlays();
    preceptMode = mode;
    preceptResumeReflection = false;
    preceptTestingPrincipal = null;
    preceptTestingConductConfirmed = false;
    preceptTestingConductAnswer = undefined;
    preceptConductIntent = null;
    preceptReturnScreen = returnScreen;
    suspendScriptureEvidence(true);
    screen = 'precepts';
    if (updateHistory) writeToolUrl(mode === 'eight' ? 'bat-quan-trai' : 'giu-gioi', 'precepts', false, returnScreen);
  }

  function closePrecepts(fromHistory = false): void {
    screen = preceptReturnScreen === 'practice' && currentArticle ? 'practice' : 'catalog';
    if (screen === 'practice') suspendScriptureEvidence(false);
    if (!fromHistory) closeToolUrl(preceptMode === 'eight' ? 'bat-quan-trai' : 'giu-gioi');
  }

  function currentPreceptAdminPrincipal(): string | null {
    const current = sessionStore.value;
    const expiry = Date.parse(current.expiresAt ?? '');
    return current.authenticated && current.user?.role === 'admin' && current.user.id && Number.isFinite(expiry) && expiry > Date.now() ? current.user.id : null;
  }

  function openAbstinenceFromPrecepts(options: { sessionId: string; principal: string | null }): void {
    const current = loadPreceptCompanion();
    const session = current.state.dailySessions?.find(row => row.id === options.sessionId && row.group === 'combined' && row.status === 'active');
    if (current.error || !session) return;
    const early = Date.now() < Date.parse(session.endsAt);
    if (early && (!options.principal || options.principal !== currentPreceptAdminPrincipal())) return;
    preceptConductIntent = { sessionId: session.id, principal: early ? options.principal : null };
    preceptTestingPrincipal = early ? options.principal : null;
    preceptTestingConductConfirmed = false;
    preceptTestingConductAnswer = undefined;
    abstinenceReturnToPrecepts = true;
    thanhTinhReturnScreen = preceptReturnScreen;
    suspendScriptureEvidence(true);
    screen = 'thanh-tinh';
    writeToolUrl('thanh-tinh', 'thanh-tinh', true, preceptReturnScreen);
    window.history.replaceState({
      ...window.history.state,
      tuTapPreceptBridge: true,
      tuTapPreceptMode: preceptMode,
      tuTapPreceptSessionId: session.id,
      tuTapPreceptTestingPrincipal: early ? options.principal : null,
    }, '', window.location.href);
  }

  function returnAfterPreceptConduct(): void {
    if (!abstinenceReturnToPrecepts || !preceptConductIntent) return;
    const current = loadPreceptCompanion();
    const session = current.state.dailySessions?.find(row => row.id === preceptConductIntent?.sessionId && row.group === 'combined' && row.status === 'active');
    if (current.error || !session) return;
    const liveSource = getDailySessionTestingConduct(session);
    if (liveSource.error || !liveSource.confirmed) return;
    if (Date.now() < Date.parse(session.endsAt)) {
      const principal = preceptConductIntent.principal;
      if (!principal || principal !== currentPreceptAdminPrincipal()) return;
      preceptTestingPrincipal = principal;
      preceptTestingConductConfirmed = true;
      preceptTestingConductAnswer = liveSource.answer;
    } else {
      const conduct = getDailySessionConduct(session);
      if (conduct.error || !conduct.confirmed) return;
      preceptTestingPrincipal = null;
      preceptTestingConductConfirmed = false;
      preceptTestingConductAnswer = undefined;
    }
    closeThanhTinh();
  }

  async function openPreceptActivity(target: 'books' | 'talks' | 'practice'): Promise<void> {
    if (target === 'practice') { closePrecepts(); return; }
    screen = preceptReturnScreen === 'practice' && currentArticle ? 'practice' : 'catalog';
    await goto(target === 'books' ? '/kinh-sach' : '/phap-thoai', { replaceState: true });
  }

  function openThanhTinh(returnScreen: 'catalog' | 'practice' = 'catalog', updateHistory = true): void {
    dismissCatalogOverlays();
    abstinenceReturnToPrecepts = Boolean(!updateHistory && window.history.state?.tuTapPreceptBridge);
    preceptConductIntent = null;
    preceptTestingPrincipal = null;
    preceptTestingConductConfirmed = false;
    preceptTestingConductAnswer = undefined;
    if (abstinenceReturnToPrecepts) {
      preceptMode = window.history.state?.tuTapPreceptMode === 'eight' ? 'eight' : 'daily';
      preceptReturnScreen = returnScreen;
      const sessionId = window.history.state?.tuTapPreceptSessionId;
      const current = loadPreceptCompanion();
      const session = typeof sessionId === 'string' ? current.state.dailySessions?.find(row => row.id === sessionId && row.group === 'combined' && row.status === 'active') : null;
      if (!current.error && session) {
        const early = Date.now() < Date.parse(session.endsAt);
        const principal = window.history.state?.tuTapPreceptTestingPrincipal;
        // History chỉ giữ ngữ cảnh; quyền kiểm thử phải được xác minh lại sau tải trang.
        if (!early || (typeof principal === 'string' && principal === currentPreceptAdminPrincipal())) {
          preceptConductIntent = { sessionId: session.id, principal: early ? principal : null };
          preceptTestingPrincipal = early ? principal : null;
        }
      }
    }
    thanhTinhReturnScreen = returnScreen;
    suspendScriptureEvidence(true);
    screen = 'thanh-tinh';
    if (updateHistory) writeToolUrl('thanh-tinh', 'thanh-tinh', false, returnScreen);
  }

  function closeThanhTinh(isFromPopState = false): void {
    if (abstinenceReturnToPrecepts) {
      abstinenceReturnToPrecepts = false;
      preceptResumeReflection = true;
      preceptConductIntent = null;
      screen = 'precepts';
      writeToolUrl(preceptMode === 'eight' ? 'bat-quan-trai' : 'giu-gioi', 'precepts', !isFromPopState, preceptReturnScreen);
      return;
    }
    screen = thanhTinhReturnScreen === 'practice' && currentArticle ? 'practice' : 'catalog';
    if (screen === 'practice') suspendScriptureEvidence(false);
    if (!isFromPopState) closeToolUrl('thanh-tinh');
  }

  function confirmActiveDialog(): void {
    switch (confirmation) {
      case 'delete-log':
        void deletePendingLogs();
        break;
      case 'start-practice':
        void startPractice();
        break;
      case 'exit-practice':
        confirmExitPractice();
        break;
      case 'start-rosary':
        confirmation = null;
        suspendScriptureEvidence(true);
        rosarySession = null;
        rosaryEvidenceHandle = null;
        resumeRosaryVisit();
        screen = 'rosary';
        writeToolUrl('rosary', 'rosary', true, rosaryReturnScreen);
        break;
      case 'reset-rosary':
        resetRosary();
        break;
      case 'exit-rosary':
        closeRosary();
        break;
      case 'toggle-mo':
        void confirmMo();
        break;
    }
  }

  function updateReadBackground(value: string): void {
    if (value !== 'dark') window.localStorage.setItem('tt_light_bg', value);
    preferences = storage?.savePreferences({ readBackground: value }) ?? preferences;
  }

  function updatePracticeBackground(value: string): void {
    preferences = storage?.savePreferences({ practiceBackground: value }) ?? preferences;
  }

  function adjustFontSize(delta: number): void {
    preferences = storage?.savePreferences({
      fontSize: Math.max(12, Math.min(26, preferences.fontSize + delta))
    }) ?? preferences;
  }

  function togglePracticeBold(): void {
    preferences = storage?.savePreferences({
      practiceBold: !preferences.practiceBold
    }) ?? preferences;
  }

  async function toggleMo(): Promise<void> {
    if (!audioState.moActive) {
      confirmation = 'toggle-mo';
      return;
    }
    await audio?.toggleMo();
    refreshAudioState();
    showPracticeFeedback(isEn ? '🔇 Wooden fish muted' : '🔇 Đã tắt tiếng mõ');
  }

  async function confirmMo(): Promise<void> {
    confirmation = null;
    const enabled = await audio?.toggleMo();
    refreshAudioState();
    showPracticeFeedback(enabled ? (isEn ? '🪘 Wooden fish sound enabled' : '🪘 Đã bật tiếng mõ') : (isEn ? '⚠️ Unable to play wooden fish sound' : '⚠️ Không phát được tiếng mõ'));
  }

  async function requestMeditation(updateHistory = true): Promise<void> {
    dismissCatalogOverlays();
    meditationChooserOpen = true;
    if (updateHistory) writeToolUrl('meditation', 'meditation-chooser');
  }

  function closeMeditationChooser(fromHistory = false): void {
    meditationChooserOpen = false;
    if (!fromHistory) closeToolUrl('meditation');
  }

  function bumpCount(delta: number): void {
    practiceCount = Math.max(0, practiceCount + delta);
  }

  function personalSnapshot(): PersonalSettingsSnapshot {
    return { routines: personalPracticeStorage?.getRoutines() ?? [], nickname: personalPracticeStorage?.getNickname() ?? '' };
  }

  function notifyPersonalChange(): void {
    try { personalSync?.changed(personalSnapshot()); void personalSync?.active(); }
    catch { personalSyncNotice = isEn ? 'Changes are kept locally; sync is unavailable.' : 'Thay đổi đang giữ trên máy; chưa đồng bộ được.'; }
  }

  function selectPersonalStorage(principal: string | null): void {
    if (!browserStorage) return;
    const owner = createPersonalPracticeStorage(browserStorage, principal);
    personalPracticeStorage = {
      ...owner,
      saveRoutine(routine) { const result = owner.saveRoutine(routine); notifyPersonalChange(); return result; },
      saveNickname(value) { const result = owner.saveNickname(value); notifyPersonalChange(); return result; },
    };
    try {
      const raw: unknown = JSON.parse(createPrincipalStorage(browserStorage, principal).getItem('tt_routine_summaries_v1') || '[]');
      personalSummaries = Array.isArray(raw) ? raw.filter((item): item is PracticeLog => Boolean(item && typeof item === 'object' && typeof item.note === 'string')) : [];
    } catch { personalSummaries = []; }
    personalSync?.sessionChanged();
    notifyPersonalChange();
  }

  async function selectUpgradeTab(tab: typeof upgradeTab): Promise<void> {
    if (tab === upgradeTab) return;
    if (upgradeTab !== 'catalog' && personalPanel?.preserveDraft() === false) return;
    upgradeTab = tab;
    if (typeof window !== 'undefined') {
      if (tab === 'catalog') {
        if (window.history.state?.tuTapUpgradeTab) window.history.back();
        await tick();
        window.scrollTo({ top: savedHubScrollY, behavior: 'instant' });
      } else {
        savedHubScrollY = window.scrollY;
        window.history.pushState({ ...window.history.state, tuTapUpgradeTab: tab }, '', window.location.href);
        window.scrollTo({ top: 0, behavior: 'instant' });
      }
    }
  }

  $effect(() => {
    if (!recommendationsCollapsed) untrack(() => { void prepareRoutineTemplates(); });
  });

  async function prepareRoutineTemplates(): Promise<void> {
    if (!dedicationTemplates.length) {
      try { dedicationTemplates = await loadPracticeDedicationTemplates(); }
      catch { personalSyncNotice = isEn ? 'Dedication templates could not be loaded. You can write your own.' : 'Chưa tải được mẫu hồi hướng. Anh/chị vẫn có thể tự viết.'; }
    }
  }

  let pendingShare: { fingerprint: string; id: string } | null = null;
  async function shareReflection(kind: 'repentance' | 'good_deed', content: string, nickname: string): Promise<void> {
    const principal = sessionPrincipalId(syncSession);
    if (!principal) throw new Error('authentication_required');
    const generation = practiceSyncGeneration;
    const fingerprint = JSON.stringify([principal,kind,content,nickname]);
    if (pendingShare?.fingerprint !== fingerprint) pendingShare = { fingerprint, id: createBrowserId() };
    const post = await createMindfulPost({ clientPostId: pendingShare.id, kind, content, nickname });
    if (sessionPrincipalId(syncSession) !== principal || generation !== practiceSyncGeneration) return;
    await queryClient.cancelQueries({ queryKey: [...serverStateKeys.mindfulCommunity.principal(principal), 'posts'] });
    if (sessionPrincipalId(syncSession) !== principal || generation !== practiceSyncGeneration) return;
    for (const tab of [kind, 'mine'] as const) {
      const family = serverStateKeys.mindfulCommunity.posts(principal, tab);
      for (const [key] of queryClient.getQueriesData<InfiniteData<MindfulPostPage>>({ queryKey: family })) {
      const day = key[family.length];
      if (typeof day === 'string' && day !== getVietnamIsoDate(new Date(post.createdAt))) continue;
      queryClient.setQueryData<InfiniteData<MindfulPostPage>>(key, current => {
        if (!current?.pages.length) return current;
        const pages = current.pages.map(page => ({ ...page, items: page.items.filter(item => item.id !== post.id) }));
        pages[0] = { ...pages[0], items: [post, ...pages[0].items] };
        return { ...current, pages };
      });
      }
    }
    pendingShare = null;
  }

  function stopRhythm(): void {
    rhythm?.stop();
    rhythmState = { count: 0, target: 0, playing: false, completed: false, error: '' };
  }

  async function stopRosaryRhythm(): Promise<void> {
    if (rhythmBusy) return;
    const selected = rhythm;
    if (!selected) { stopRhythm(); return; }
    const generation = practiceSyncGeneration;
    const principal = sessionPrincipalId(syncSession);
    const current = () => selected === rhythm && generation === practiceSyncGeneration && principal === sessionPrincipalId(syncSession);
    rhythmBusy = true;
    try {
      // The native queue serializes refresh after pause, publishing the final audible beats before release.
      selected.pause();
      await selected.refresh();
      if (current()) stopRhythm();
    } catch (cause) {
      if (current()) {
        selected.pause();
        rhythmState = { ...rhythmState, playing: false, error: isEn ? 'Unable to settle the paused count. Please try Stop again.' : 'Chưa chốt được số biến đã tạm dừng. Vui lòng bấm Dừng lại.' };
        reportPracticeEvidenceFailure(cause);
      }
    } finally {
      if (selected === rhythm) rhythmBusy = false;
    }
  }

  function endRoutine(): void {
    if (routineTimer) clearTimeout(routineTimer);
    routineTimer = null;
    activeRoutine = null;
    routineBowingSetup = undefined;
    routineCountdown = 0;
    routineWaiting = false;
    routinePaused = false;
    routineAdvancing = false;
  }

  async function completeAutomaticRosary(): Promise<void> {
    const generation = practiceSyncGeneration;
    rosaryEndStage = 'complete';
    rosaryEndError = '';
    try {
      const templates = dedicationTemplates.length ? dedicationTemplates : await loadPracticeDedicationTemplates();
      if (generation !== practiceSyncGeneration || screen !== 'rosary') return;
      dedicationTemplates = templates;
      const selected = templates[0];
      if (!selected) throw new Error('dedication_source_unavailable');
      rosaryDedication = { id: `rosary-dedication-${Date.now()}`, name: isEn ? 'DEDICATION OF MERIT' : 'HỒI HƯỚNG CÔNG ĐỨC', updatedAt: new Date().toISOString(), steps: [{ id: 'dedication', kind: 'dedication', text: selected.text, sourceId: selected.id }] };
    } catch { if (generation === practiceSyncGeneration && screen === 'rosary') rosaryEndError = isEn ? 'Unable to open the dedication text. Your practice has been saved.' : 'Chưa mở được bài hồi hướng. Công phu đã được lưu.'; }
  }

  async function runRoutine(routine: DailyRoutine): Promise<void> {
    if (activeRoutine || meditationSession || screen !== 'catalog') return;
    dismissCatalogOverlays();
    // Thời khóa thay màn gợi ý; tải lại trang không được mở lại lớp gợi ý cũ.
    if (typeof window !== 'undefined' && toolFromUrl(new URL(window.location.href)) === 'thoi-khoa') {
      const url = withoutToolUrl(new URL(window.location.href));
      window.history.replaceState({ ...window.history.state, tuTapAction: null, tuTapScreen: screen }, '', url.toString());
    }
    activeRoutine = cloneDailyRoutine(routine);
    routineIndex = 0;
    routineStartedAt = Date.now();
    recordPracticeParticipation('routine','started',personalPracticeStorage?.ownerId ?? null);
    routineIncomplete = false;
    routineLog = null;
    routinePaused = false;
    await launchRoutineStep();
  }

  async function launchRoutineStep(): Promise<void> {
    const step = activeRoutine?.steps[routineIndex];
    if (!step) return;
    routineWaiting = false;
    routineCountdown = 0;
    try {
      if (step.kind === 'prostration') {
        routineBowingSetup = { id: `${activeRoutine!.id}:${step.id}:${routineStartedAt}`, phrase: step.phrase, count: step.count };
        openLePhat('catalog');
      } else if (step.kind === 'meditation') {
        await startGuidedMeditation({ ...DEFAULT_MEDITATION_SETUP, durationMinutes: step.minutes });
      } else if (step.kind === 'rosary') {
        const known = ROSARY_PHRASES.find(item => item.toLocaleLowerCase('vi') === step.phrase.toLocaleLowerCase('vi'));
        if (known) rosaryPhrase = known;
        else {
          const custom = customRosaryPhrases.find(item => item.text === step.phrase);
          if (custom) rosaryPhrase = `custom:${custom.id}`;
          else { handleAddCustomPhrase({ text: step.phrase, type: 'Niệm danh hiệu' }); }
        }
        if (resolveRosarySelection(rosaryPhrase, customRosaryPhrases)?.phrase.toLocaleLowerCase('vi') !== step.phrase.toLocaleLowerCase('vi')) throw new Error('invalid_rosary_phrase');
        settleRestoredRosaryCount();
        finishRosaryEvidence();
        rosaryReturnScreen = 'catalog';
        screen = 'rosary';
        writeToolUrl('rosary', 'rosary');
        if (step.automatic) {
          await startRosaryRhythm({ target: step.count, intervalMs: 60_000 / step.bpm });
          if (rhythmState.error) { routinePaused = true; routineWaiting = true; }
        }
      } else {
        screen = 'catalog';
      }
    } catch (cause) { routinePaused = true; routineWaiting = true; reportPracticeEvidenceFailure(cause); }
  }

  function pauseRoutine(): void {
    routinePaused = !routinePaused;
    if (routinePaused) {
      if (routineTimer) clearTimeout(routineTimer);
      routineTimer = null;
      rhythm?.pause();
      if (meditationSession) pauseGuidedMeditation();
    } else if (routineCountdown > 0) scheduleRoutineCountdown();
    else {
      if (rhythmState.error) { void launchRoutineStep(); return; }
      if (rhythmState.target > 0 && !rhythmState.completed) void resumeRosaryRhythm();
      if (meditationSession?.phase === 'paused') resumeGuidedMeditation();
    }
  }

  function continueRoutineNow(): void {
    if (!activeRoutine || routinePaused) return;
    if (routineCountdown > 0) {
      if (routineTimer) clearTimeout(routineTimer);
      routineTimer = null;
      routineIndex += 1;
      routineAdvancing = false;
      void launchRoutineStep();
    } else void advanceRoutine(false);
  }

  function scheduleRoutineCountdown(): void {
    if (!activeRoutine || routinePaused) return;
    const id = activeRoutine.id;
    const index = routineIndex;
    const generation = practiceSyncGeneration;
    routineTimer = setTimeout(() => {
      if (!activeRoutine || activeRoutine.id !== id || routineIndex !== index || generation !== practiceSyncGeneration || routinePaused) return;
      routineCountdown = Math.max(0, routineCountdown - 1);
      if (routineCountdown) scheduleRoutineCountdown();
      else { routineIndex += 1; routineAdvancing = false; void launchRoutineStep(); }
    }, 1000);
  }

  async function advanceRoutine(skipped = true): Promise<void> {
    if (!activeRoutine || routineAdvancing || routineCountdown > 0 || routinePaused) return;
    routineAdvancing = true;
    const step = activeRoutine.steps[routineIndex];
    try {
      if (step.kind === 'rosary') {
        stopRhythm(); finishRosaryEvidence();
        if (rosarySession) throw new Error('practice_evidence_not_saved');
        screen = 'catalog';
      } else if (step.kind === 'meditation' && meditationSession) {
        if (meditationSession.phase !== 'completed') { routineIncomplete = true; endGuidedMeditation(); }
        if (!finishMeditationEvidence(meditationSession)) throw new Error('practice_evidence_not_saved');
        closeGuidedMeditation();
      } else if (step.kind === 'prostration' && screen === 'le-phat') {
        if (lePhatScreen?.finish(true) === false) throw new Error('bowing_log_not_saved');
      }
      if (skipped && step.kind !== 'dedication') routineIncomplete = true;
      routineBowingSetup = undefined;
      if (routineIndex + 1 >= activeRoutine.steps.length) {
        if (!routineIncomplete) {
          // A routine summary is separate from counted tool logs to avoid adding the same practice twice.
          const scoped = principalStorage();
          if (!scoped) throw new Error('practice_storage_unavailable');
          const key = 'tt_routine_summaries_v1';
          const prior: unknown = JSON.parse(scoped.getItem(key) || '[]');
          if (!Array.isArray(prior)) throw new Error('invalid_routine_summaries');
          routineLog ??= createPracticeLog({ id: routineStartedAt, date: getVietnamIsoDate(), type: 'Khác', count: 1, note: `${activeRoutine.name} · ${Math.max(1, Math.round((Date.now() - routineStartedAt) / 60000))} ${isEn ? 'minutes' : 'phút'}` });
          const summaries = [...prior.filter(item => item?.id !== routineLog!.id), routineLog];
          scoped.setItem(key, JSON.stringify(summaries));
          personalSummaries = summaries;
          showPracticeFeedback(isEn ? `Completed ${activeRoutine.name}` : `Đã hoàn thành ${activeRoutine.name}`);
        } else showPracticeFeedback(isEn ? 'Routine ended with skipped steps.' : 'Đã kết thúc thời khóa có bước bỏ qua.');
        endRoutine();
        screen = 'catalog';
        return;
      }
      audio?.playPracticeCue(step.kind === 'meditation' ? step.cue ?? 'bell' : 'bell');
      routineWaiting = true;
      routineCountdown = 5;
      scheduleRoutineCountdown();
    } catch (cause) { routineAdvancing = false; reportPracticeEvidenceFailure(cause); }
  }

  async function startRosaryRhythm(input: { intervalMs: number; target: number }): Promise<void> {
    if (rhythmBusy || !storage) return;
    const selection = resolveRosarySelection(rosaryPhrase, customRosaryPhrases);
    if (!selection) return;
    try { validateRosaryRhythm(input.target, input.intervalMs); }
    catch (cause) { rhythmState = { ...rhythmState, error: cause instanceof Error ? cause.message : 'invalid_rosary_rhythm' }; return; }
    const principal = sessionPrincipalId(syncSession);
    const generation = practiceSyncGeneration;
    const routineId = activeRoutine?.id;
    const routineStepId = activeRoutine?.steps[routineIndex]?.id;
    let completionConsumed = false;
    let playbackAnchor = Date.now();
    rhythmBusy = true;
    try {
      stopRhythm();
      settleRestoredRosaryCount();
      finishRosaryEvidence();
      if (rosarySession) throw new Error('practice_evidence_not_saved');
      ensureCurrentRosaryDay();
      rhythmAccepted = 0;
      rosarySession = createRosarySession({ dailyCountBeforeSession: preferences.rosaryCount, dailyGoal: rosaryDailyGoal, phrase: rosaryPhrase, size: rosarySize, startedAtMs: performance.now() });
      rosaryEvidenceHandle = startPracticeEvidence({ activityType: 'rosary', sourceId: rosaryPhrase, sourceKind: 'guided_rosary', targetCount: rosarySize }) ?? null;
      if (!rosaryEvidenceHandle) throw new Error('practice_evidence_not_saved');
      rhythm?.dispose();
      rhythm = createRosaryMetronome({
        onState: next => {
          if (generation !== practiceSyncGeneration || principal !== sessionPrincipalId(syncSession)) return;
          try {
            const delta = next.count - rhythmAccepted;
            const intervalMs = next.intervalMs ?? input.intervalMs;
            if (next.playing) playbackAnchor = rosaryPlaybackAnchor(next.observedAtMs ?? Date.now(), next.positionSeconds ?? next.count * intervalMs / 1000, intervalMs, next.phaseStartCount, next.phaseStartPositionSeconds);
            if (delta > 0 && storage) {
              const segments = partitionRosaryDaySegments(rhythmAccepted, next.count, intervalMs, playbackAnchor);
              for (const segment of segments) {
                if (segment.date !== rosaryDate) {
                  finishRosaryEvidence();
                  settleRestoredRosaryCount();
                  const scoped = principalStorage();
                  if (!scoped) throw new Error('rosary_storage_unavailable');
                  createRosaryCompletion(scoped).continueCounter(preferences.rosaryCount, segment.date);
                  rosaryDate = segment.date;
                  saveGuidedSettings();
                }
                if (!rosarySession) {
                  const midnight = Date.parse(segment.date + 'T00:00:00+07:00');
                  const began = Math.min(Date.now(), Math.max(midnight, segment.firstTickAtMs - intervalMs));
                  rosarySession = createRosarySession({ dailyCountBeforeSession: preferences.rosaryCount, dailyGoal: rosaryDailyGoal, phrase: rosaryPhrase, size: rosarySize, startedAtMs: performance.now() - Math.max(0, Date.now() - began) });
                  rosaryEvidenceHandle = startPracticeEvidence({ activityType: 'rosary', sourceId: rosaryPhrase, sourceKind: 'guided_rosary', targetCount: rosarySize }, new Date(began));
                  if (!rosaryEvidenceHandle) throw new Error('practice_evidence_not_saved');
                }
                const accepted = rosarySession.acceptedCount + segment.count;
                const nextSession = { ...rosarySession, acceptedCount: accepted, lastAcceptedAtMs: performance.now(), minimumIntervalMs: Math.min(rosarySession.minimumIntervalMs, intervalMs) };
                preferences = storage.savePreferences({ rosaryCount: nextSession.dailyCountBeforeSession + accepted });
                rosarySession = nextSession;
                rhythmAccepted += segment.count;
              }
              rosaryVisitCount = preferences.rosaryCount;
              if (!rosaryVisitPhrases.includes(selection.phrase)) rosaryVisitPhrases = [...rosaryVisitPhrases, selection.phrase];
              try { if (delta === 1) navigator.vibrate?.(10); } catch { /* Optional device feedback. */ }
            }
            rhythmState = next;
            if (next.completed && !completionConsumed) {
              completionConsumed = true;
              finishRosaryEvidence();
              if (activeRoutine?.id === routineId && activeRoutine?.steps[routineIndex]?.id === routineStepId && activeRoutine?.steps[routineIndex]?.kind === 'rosary') void advanceRoutine(false);
              else void completeAutomaticRosary();
            }
          } catch (cause) { stopRhythm(); reportPracticeEvidenceFailure(cause); }
        },
        onInterrupted: () => { rhythmState = { ...rhythmState, playing: false }; },
      });
      audio?.stopAll();
      await rhythm.start({ intervalMs: input.intervalMs as RosaryInterval, target: input.target, title: selection.phrase });
      if (generation !== practiceSyncGeneration || principal !== sessionPrincipalId(syncSession)) stopRhythm();
    } catch (cause) {
      stopRhythm();
      if (generation === practiceSyncGeneration) {
        rhythmState = { ...rhythmState, error: isEn ? 'Unable to start the rhythm. Please try again.' : 'Chưa phát được nhịp mõ. Vui lòng thử lại.' };
        reportPracticeEvidenceFailure(cause);
      }
    } finally { rhythmBusy = false; }
  }

  async function resumeRosaryRhythm(intervalMs?: number): Promise<void> {
    if (rhythmBusy || rhythmState.playing) return;
    rhythmBusy = true;
    try { await rhythm?.resume(intervalMs as RosaryInterval | undefined); }
    catch { rhythmState = { ...rhythmState, error: isEn ? 'Unable to resume audio.' : 'Chưa tiếp tục được âm thanh.' }; }
    finally { rhythmBusy = false; }
  }

  function bumpRosary(delta: number): boolean {
    if (activeRoutine && routinePaused) return false;
    if (delta <= 0 || !storage || rosaryEndStage) return false;
    try {
      const selectedStorage = principalStorage();
      if (selectedStorage) createRosaryCompletion(selectedStorage).recoverReset(() => {
        preferences = storage?.savePreferences({ rosaryCount: 0 }) ?? preferences;
      });
      ensureCurrentRosaryDay();
    }
    catch (cause) { reportPracticeEvidenceFailure(cause); return false; }
    const observedAtMs = performance.now();
    if (lastRosaryInteractionAtMs !== null && observedAtMs - lastRosaryInteractionAtMs < ROSARY_MINIMUM_INTERACTION_MS) return false;
    const selection = resolveRosarySelection(rosaryPhrase, customRosaryPhrases);
    if (!selection) return false;
    if (!rosarySession) {
      try { settleRestoredRosaryCount(); }
      catch (cause) { reportPracticeEvidenceFailure(cause); return false; }
      rosarySession = createRosarySession({
        dailyCountBeforeSession: preferences.rosaryCount,
        dailyGoal: rosaryDailyGoal,
        phrase: rosaryPhrase,
        size: rosarySize,
        startedAtMs: observedAtMs,
      });
      rosaryEvidenceHandle = startPracticeEvidence({
        activityType: 'rosary',
        sourceId: rosaryPhrase,
        sourceKind: 'guided_rosary',
        targetCount: rosarySize,
      }) ?? null;
      if (!rosaryEvidenceHandle) {
        // Chưa lưu được start thì không nhận thêm hạt không thể đồng bộ; lần chạm sau được thử lại.
        rosarySession = null;
        return false;
      }
    }
    const result = acceptRosaryInteraction(rosarySession, observedAtMs);
    if (!result.accepted) return false;
    const nextCount = result.state.dailyCountBeforeSession + result.state.acceptedCount;
    try { preferences = storage.savePreferences({ rosaryCount: nextCount }); }
    catch (cause) { reportPracticeEvidenceFailure(cause); return false; }
    lastRosaryInteractionAtMs = observedAtMs;
    rosarySession = result.state;
    rosaryVisitCount += 1;
    if (!rosaryVisitPhrases.includes(selection.phrase)) rosaryVisitPhrases = [...rosaryVisitPhrases, selection.phrase];
    try {
      audio?.playRosaryTap(preferences.rosarySoundEnabled);
    } catch {
      // Feedback is optional; the accepted interaction remains counted.
    }
    try {
      navigator.vibrate?.(result.completedCycle ? [100, 50, 160] : 10);
    } catch {
      // Haptic support and permission vary by browser.
    }
    if (result.completedCycle) showPracticeFeedback(localizeUi("🌸 Đã hoàn thành 1 chuỗi ({0} hạt)!", rosarySize));
    else if (result.reachedDailyGoal) showPracticeFeedback(localizeUi("🙏 Đã đạt mục tiêu {0} niệm!", rosaryDailyGoal.toLocaleString(localizeUi.locale())));
    const step = activeRoutine?.steps[routineIndex];
    if (step?.kind === 'rosary' && !step.automatic && result.state.acceptedCount >= step.count) void advanceRoutine(false);
    return true;
  }

  function finishRosaryEvidence(): void {
    if (rosarySession) {
      const accepted = rosarySession.acceptedCount;
      const selection = resolveRosarySelection(rosarySession.phrase, customRosaryPhrases);
      if (!selection) throw new Error('invalid_rosary_phrase');
      const actualPhrase = selection.phrase;
      const resolvedType = selection.type;

      if (accepted > 0 && storage) {
        const selectedStorage = principalStorage();
        if (!selectedStorage) return;
        logs = createRosaryCompletion(selectedStorage).settle(
          rosarySession.dailyCountBeforeSession + accepted, accepted,
          rosaryDate || getVietnamIsoDate(), actualPhrase, resolvedType,
        );
        showPracticeFeedback(localizeUi("📿 Đã ghi nhận {0} biến lần hạt ({1})", accepted, actualPhrase));
      }
      // Để lỗi ghi hàng đợi truyền về caller; giữ handle và receipt cho lần thử lại.
      if (rosaryEvidenceHandle && practiceEvidence && !practiceEvidence.hasFinished(rosaryEvidenceHandle)) {
        if (!practiceEvidence.finish(rosaryEvidenceHandle, {
          ...rosaryEvidence(rosarySession, performance.now()),
          phrase: actualPhrase,
          title: actualPhrase,
          note: `Lần hạt: ${actualPhrase}`,
          ...buildRosaryLogEvidence(logs, {
            count: accepted, date: rosaryDate || getVietnamIsoDate(), phrase: actualPhrase, type: resolvedType,
          }),
        })) throw new Error('practice_evidence_not_saved');
      }
    }
    rosarySession = null;
    rosaryEvidenceHandle = null;
  }

  function updateRosarySize(value: RosarySize): void {
    rosarySize = value;
    if (rosarySession) rosarySession = { ...rosarySession, size: value };
    saveGuidedSettings();
  }

  function updateRosaryPhrase(value: RosaryPhrase): boolean {
    if (value === rosaryPhrase) return true;
    try {
      if (rosarySession) finishRosaryEvidence();
      else settleRestoredRosaryCount();
    } catch (cause) { reportPracticeEvidenceFailure(cause); return false; }
    const previousPhrase = rosaryPhrase;
    rosaryPhrase = value;
    try { saveGuidedSettings(); }
    catch (cause) {
      rosaryPhrase = previousPhrase;
      showPracticeFeedback(localizeUi("Không thể lưu lựa chọn trên thiết bị. Hãy giải phóng dung lượng rồi thử lại."));
      return false;
    }
    return true;
  }

  function updateRosaryDailyGoal(value: RosaryDailyGoal): void {
    rosaryDailyGoal = value;
    if (rosarySession) rosarySession = { ...rosarySession, dailyGoal: value };
    saveGuidedSettings();
  }

  function showPracticeFeedback(message: string): void {
    rosaryFeedback = message;
    window.clearTimeout(rosaryFeedbackTimer);
    rosaryFeedbackTimer = window.setTimeout(() => {
      rosaryFeedback = '';
      rosaryFeedbackTimer = 0;
    }, 3_000);
  }

  function openManualLog(): void {
    const today = getVietnamIsoDate(new Date());
    manualLogDraft = createPracticeLog({
      count: 1,
      date: today,
      note: '',
      type: 'Chép kinh'
    });
    manualLogModalOpen = true;
  }

  async function saveManualLog(entry: PracticeLog): Promise<void> {
    if (!storage || manualLogMutationPending) return;
    const capturedStorage = storage;
    const owner = sessionPrincipalId(syncSession);
    const authenticated = syncSession.authenticated;
    const isCurrent = () => storage === capturedStorage && owner === sessionPrincipalId(syncSession);
    manualLogMutationPending = true;
    try {
      // Giữ công phu trên máy và bản nháp để người dùng chủ động thử lại cùng ID.
      logs = capturedStorage.saveLog(entry);

      if (entry.campaignId) {
        if (authenticated) {
          await contributePracticeCampaign(
            entry.campaignId,
            { logId: entry.id, type: entry.type, count: entry.count, date: entry.date, note: entry.note },
            fetchWithSessionRefresh,
          );
          if (!isCurrent()) return;
          await Promise.all([
            queryClient.invalidateQueries({ queryKey: serverStateKeys.practiceCommunity.campaigns(owner ?? 'anonymous') }),
            queryClient.invalidateQueries({ queryKey: serverStateKeys.practiceCommunity.progress(owner ?? 'anonymous') }),
            queryClient.invalidateQueries({ queryKey: serverStateKeys.practiceCommunity.leaderboard, refetchType: 'none' }),
          ]);
        } else {
          showPracticeFeedback(isEn ? '💡 Log in to automatically contribute your practice to community campaigns.' : '💡 Đăng nhập để tự động đóng góp công phu vào chiến dịch cộng đồng.');
        }
      }

      if (!isCurrent()) return;
      manualLogModalOpen = false;
      const unit = practiceLogUnit(localeStore.current === 'en', entry.type);
      const campaignSuffix = entry.campaignTitle ? (localeStore.current === 'en' ? ` (Campaign: ${entry.campaignTitle})` : ` (Chiến dịch: ${entry.campaignTitle})`) : '';
      showPracticeFeedback(localeStore.current === 'en'
        ? `✍️ Recorded: ${entry.type} (${entry.count} ${unit})${campaignSuffix}`
        : `✍️ Đã ghi nhận: ${entry.type} (${entry.count} ${unit})${campaignSuffix}`);
    } catch (cause) {
      if (isCurrent()) await alertInApp(cause instanceof Error ? cause.message : String(cause));
    } finally {
      manualLogMutationPending = false;
    }
  }

  async function deleteManualLog(id: number): Promise<boolean> {
    if (!storage || manualLogMutationPending) return false;
    const capturedStorage = storage;
    const owner = sessionPrincipalId(syncSession);
    const isCurrent = () => storage === capturedStorage && owner === sessionPrincipalId(syncSession);
    const target = logs.find((l) => String(l.id) === String(id) || Number(l.id) === Number(id));
    manualLogMutationPending = true;
    try {
      // Không bỏ mất bản ghi cục bộ trước khi máy chủ xác nhận xóa đóng góp.
      if (target?.campaignId && syncSession.authenticated) {
        await deletePracticeCampaignContribution(target.campaignId, id, fetchWithSessionRefresh);
        if (!isCurrent()) return false;
        await Promise.all([
          queryClient.invalidateQueries({ queryKey: serverStateKeys.practiceCommunity.campaigns(owner ?? 'anonymous') }),
          queryClient.invalidateQueries({ queryKey: serverStateKeys.practiceCommunity.progress(owner ?? 'anonymous') }),
          queryClient.invalidateQueries({ queryKey: serverStateKeys.practiceCommunity.leaderboard, refetchType: 'none' }),
        ]);
      }
      if (!isCurrent()) return false;
      logs = capturedStorage.deleteLog(id);
      showPracticeFeedback(localeStore.current === 'en' ? 'Practice log deleted.' : 'Đã xóa mục công phu.');
      return true;
    } catch (cause) {
      if (isCurrent()) await alertInApp(cause instanceof Error ? cause.message : String(cause));
      return false;
    } finally {
      manualLogMutationPending = false;
    }
  }

  async function deletePendingLogs(): Promise<void> {
    if (deletingLogGroup) return;
    const selectedIds = pendingDeleteLogIds;
    deletingLogGroup = true;
    try {
      for (const id of selectedIds) {
        if (pendingDeleteLogIds !== selectedIds) return;
        if (!logs.some(log => log.id === id)) continue;
        if (!await deleteManualLog(id)) {
          if (pendingDeleteLogIds === selectedIds) {
            pendingDeleteLogIds = selectedIds.filter(id => logs.some(log => log.id === id));
            pendingDeleteLogId = pendingDeleteLogIds[0] ?? null;
          }
          return;
        }
      }
      if (pendingDeleteLogIds === selectedIds) {
        pendingDeleteLogIds = [];
        pendingDeleteLogId = null;
        confirmation = null;
      }
    } finally { deletingLogGroup = false; }
  }

  function requestDeleteLog(id: number | number[]): void {
    pendingDeleteLogIds = Array.isArray(id) ? [...id] : [id];
    pendingDeleteLogId = pendingDeleteLogIds[0] ?? null;
    confirmation = 'delete-log';
  }

  async function handleSelectMeditationTrack(track: MeditationTrack): Promise<void> {
    if (audioState.meditationActive && audioState.selectedTrack === track) {
      audio?.pauseMeditation();
      refreshAudioState();
      showPracticeFeedback(localeStore.current === 'en' ? '🔇 Meditation music turned off' : '🔇 Đã tắt nhạc thiền');
      return;
    }
    const started = await audio?.setMeditationTrack(track);
    refreshAudioState();
    const option = MEDITATION_TRACK_OPTIONS.find((opt) => opt.track === track);
    if (started) {
      showPracticeFeedback(localeStore.current === 'en' ? `🎵 Playing: ${option?.label ?? 'Meditation track'}` : `🎵 Đang phát: ${option?.label ?? 'Nhạc thiền'}`);
    } else {
      showPracticeFeedback(localeStore.current === 'en' ? '⚠️ Cannot play meditation music (check audio permissions)' : '⚠️ Không phát được nhạc thiền (kiểm tra quyền âm thanh)');
    }
  }

  function handleStopMeditationMusic(): void {
    audio?.pauseMeditation();
    refreshAudioState();
    showPracticeFeedback(localeStore.current === 'en' ? '🔇 Meditation music turned off' : '🔇 Đã tắt nhạc thiền');
  }

  function handleRecommendation(recommendation: PracticeRecommendation): void {
    const { action } = recommendation;
    if (action === 'meditation') {
      void requestMeditation();
      return;
    }
    if (action === 'rosary') {
      requestRosaryStart('catalog');
      return;
    }
    if (action === 'ceremony') {
      if (recommendation.articleId) {
        const article = articles.find((a) => a.id === recommendation.articleId);
        if (article) {
          void openArticle(article);
          return;
        }
      }
      const keywords = recommendation.articleKeywords?.map(normalizeRecommendationText) ?? [];
      const ceremony = articles.find((a) => a.category === 'CÁC NGHI THỨC'
        && (!keywords.length || keywords.some((kw) => normalizeRecommendationText(a.title).includes(kw))));
      if (ceremony) {
        void openArticle(ceremony);
        return;
      }
      openLePhat('catalog');
      return;
    }

    if (recommendation.articleId) {
      const article = articles.find((a) => a.id === recommendation.articleId);
      if (article) {
        void openArticle(article);
        return;
      }
    }
    const articleCategory = recommendation.articleCategory ?? 'KINH PHẬT';
    const keywords = recommendation.articleKeywords?.map(normalizeRecommendationText) ?? [];
    const scripture = articles.find((article) => article.category === articleCategory
      && (!keywords.length || keywords.some((keyword) => normalizeRecommendationText(article.title).includes(keyword))))
      ?? (!keywords.length ? articles.find((article) => article.category === articleCategory) : undefined);
    if (scripture) void openArticle(scripture);
    else {
      activeCategory = articleCategory;
      query = recommendation.articleKeywords?.[0] ?? '';
      showPracticeFeedback(isEn ? `"${recommendation.title}" is not available in the catalog yet.` : `Chưa có “${recommendation.title}” trong danh mục.`);
    }
  }

  function normalizeRecommendationText(value: string): string {
    return value
      .normalize('NFD')
      .replace(/\p{M}/gu, '')
      .replace(/[đĐ]/gu, 'd')
      .toLocaleLowerCase('vi-VN');
  }

  async function syncPracticeDataFromCloud(): Promise<void> {
    const generation = practiceSyncGeneration;
    const capturedSession = syncSession;
    const capturedPrincipalId = sessionPrincipalId(capturedSession);
    const capturedStorage = storage;
    if (!capturedPrincipalId || !capturedStorage) return;
    const isCurrent = () => generation === practiceSyncGeneration
      && capturedPrincipalId === sessionPrincipalId(syncSession)
      && capturedStorage === storage;
    await runPracticePrincipalPull({
      pull: async () => {
        const [cloudLogs, sessionsData] = await Promise.all([
          syncClient?.pull(capturedSession) ?? Promise.resolve(null),
          fetchWithSessionRefresh('/api/practice/sessions?limit=200', {
            headers: { accept: 'application/json' }
          }).then(async (res) => {
            if (!res.ok) return [];
            const data = await res.json() as { sessions?: Array<Record<string, unknown>> };
            return Array.isArray(data?.sessions) ? data.sessions : [];
          }).catch(() => [])
        ]);

        const deletedIds = capturedStorage.getDeletedLogIds?.() ?? new Set<string>();

        const sessionLogs: PracticeLog[] = [];
        const restoredTools: PracticeLog[] = [];
        for (const session of sessionsData) {
          if (session.status !== 'completed' || session.verificationResult !== 'accepted') continue;
          const restored = restoreCompletedToolLog(session);
          if (restored) {
            restoredTools.push(restored);
            if (!deletedIds.has(String(restored.id))) sessionLogs.push(restored);
            continue;
          }
          const rosaryLog = restoreRosarySessionLog(session);
          if (rosaryLog) {
            if (!deletedIds.has(String(rosaryLog.id))) sessionLogs.push(rosaryLog);
            continue;
          }
          let count = Math.max(1, Number(session.acceptedCount || session.targetCount || 1));
          const activityType = String(session.activityType || '');
          let type: PracticeType;
          if (activityType === 'meditation') {
            type = 'Ngồi thiền';
            const durationSec = Number(session.acceptedDurationSeconds || session.targetDurationSeconds || 0);
            count = Math.max(1, Math.round(durationSec / 60));
          } else if (activityType === 'scripture' || activityType === 'model_chant') {
            type = 'Tụng kinh';
          } else if (activityType === 'dharma_talk') {
            type = 'Nghe pháp thoại';
            const durationSec = Number(session.acceptedDurationSeconds || session.targetDurationSeconds || 0);
            count = Math.max(1, Math.round(durationSec / 60));
          } else {
            type = 'Niệm danh hiệu';
          }
          const completedAt = String(session.completedAt || session.startedAt || '');
          const date = completedAt ? getVietnamIsoDate(new Date(completedAt)) : getVietnamIsoDate();

          let id = Date.parse(completedAt);
          const clientSessionId = String(session.clientSessionId || '');
          if (clientSessionId.startsWith('legacy_import_')) {
            const parsedId = Number(clientSessionId.replace('legacy_import_', ''));
            if (Number.isFinite(parsedId)) id = parsedId;
          }
          if (!Number.isFinite(id)) id = Date.now();

          if (deletedIds.has(String(id))) continue;

          const evidence = (session.evidenceSummary && typeof session.evidenceSummary === 'object' ? session.evidenceSummary : {}) as Record<string, unknown>;
          const specificTitle = String(evidence.title || evidence.phrase || evidence.chapterTitle || evidence.articleTitle || session.sourceId || '');
          const note = specificTitle || (type === 'Ngồi thiền' ? `Ngồi thiền ${count} phút` : type === 'Nghe pháp thoại' ? `Nghe pháp thoại ${count} phút` : 'Tu tập');
          sessionLogs.push({
            id,
            date,
            type,
            count,
            note,
            created: completedAt || new Date().toISOString()
          });
        }

        if (isCurrent()) acknowledgeRestoredToolLogs(createPrincipalStorage(window.localStorage, capturedPrincipalId), restoredTools);
        const baseLogs = (Array.isArray(cloudLogs) ? cloudLogs : []).filter((l) => !deletedIds.has(String(l.id)));
        return mergePracticeLogs(baseLogs, sessionLogs);
      },
      isCurrent,
      apply: (cloudLogs) => {
        const deletedIds = capturedStorage.getDeletedLogIds?.() ?? new Set<string>();
        const localLogs = capturedStorage.getLogs().filter((l) => !deletedIds.has(String(l.id)));
        const filteredCloud = (cloudLogs ?? []).filter((l) => !deletedIds.has(String(l.id)));
        const merged = mergePracticeLogs(localLogs, filteredCloud);
        createPrincipalStorage(window.localStorage, capturedPrincipalId).setItem(
          LEGACY_LOCAL_STORAGE_KEYS.practiceLogs,
          JSON.stringify(merged)
        );
        logs = capturedStorage.getLogs();
      },
    });
  }

  onMount(() => {
    refreshTrackerDate();
    const stopTrackerDayRefresh = watchCalendarDay(refreshTrackerDate);
    const restoredUpgradeTab = window.history.state?.tuTapUpgradeTab;
    if (restoredUpgradeTab === 'personal' || restoredUpgradeTab === 'community') upgradeTab = restoredUpgradeTab;
    presenceMounted = true;
    if (browserStorage) {
      const settingsRequest = async (method: 'GET' | 'PUT', signal: AbortSignal, body?: unknown, csrf?: string) => {
        const url = resolveApiUrl('/api/practice/personal-settings');
        const init: RequestInit = { method, signal, credentials: 'include', headers: { accept: 'application/json', ...(method === 'PUT' ? { 'content-type': 'application/json', 'x-csrf-token': csrf ?? '' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) };
        return await fetchNativeJsonMutation(url, init) ?? await fetchWithSessionRefresh(url, init);
      };
      personalSync = createPersonalSettingsSync({ storage: browserStorage, getSession: () => syncSession,
        transport: { read: signal => settingsRequest('GET', signal), write: (input, csrf, signal) => settingsRequest('PUT', signal, input, csrf) } });
    }
    const unsubscribeMeditationMotion = meditationMotion?.subscribe((snapshot) => {
      meditationMotionSnapshot = snapshot;
    });
    if (browserStorage) {
      copyLegacyKeysToAnonymousNamespace(
        browserStorage,
        Object.values(LEGACY_LOCAL_STORAGE_KEYS),
        Object.values(LEGACY_LOCAL_STORAGE_PREFIXES)
      );
    }
    const skeletonPreview = import.meta.env.DEV
      && new URLSearchParams(window.location.search).get('preview') === 'skeleton';
    catalogEnabled = !skeletonPreview;
    if (storage) {
      preferences = storage.getPreferences();
      logs = storage.getLogs();
      fabPosition = storage.getFabPosition();
    }
    readGuidedSettings();
    recommendationClock = new Date();
    recommendationPeriod = getPracticeRecommendations(recommendationClock).period;
    const initialPracticeParams = new URLSearchParams(window.location.search);
    const practiceTargetKeys = ['article', 'book', 'id', 'sach'];
    const initialPracticeTarget = practiceTargetKeys.map(key => initialPracticeParams.get(key)).find(Boolean) ?? null;
    let recoveredInitialPractice = false;
    const applySession = () => {
      const nextSession = sessionStore.value.authenticated ? sessionStore.value : guestSession;
      const previousPrincipalId = sessionPrincipalId(syncSession);
      const principalId = sessionPrincipalId(nextSession);
      const previousContentIdentity = practiceContentIdentity(syncSession);
      const nextContentIdentity = practiceContentIdentity(nextSession);
      const currentParams = new URLSearchParams(window.location.search);
      const currentTarget = practiceTargetKeys.map(key => currentParams.get(key)).find(Boolean) ?? null;
      const recoverInitialPractice = !recoveredInitialPractice && previousPrincipalId === null && principalId !== null
        && initialPracticeTarget !== null && handledTargetId === initialPracticeTarget && !pushedTuTapHistory
        && (currentTarget === initialPracticeTarget || currentTarget === currentArticle?.id || currentTarget === lastRequestedArticle?.id);
      const role = (nextSession.user as { role?: unknown } | null)?.role;
      const nextRole = role === 'admin' || role === 'ctv' || role === 'user' ? role : 'guest';
      const nextGeneration = advancePracticeContentGeneration(
        practiceSyncGeneration,
        syncSession,
        nextSession,
      );
      if (previousContentIdentity !== nextContentIdentity) {
        practiceSyncGeneration = nextGeneration;
        const recoveredCache = recoverInitialPractice
          ? initialPracticeCacheReceipt(currentArticle?.id ?? initialPracticeTarget, nextContentIdentity) : undefined;
        if (previousPrincipalId !== principalId) personalPanel?.preserveDraft();
        try {
          settlePracticeBeforePrincipalSwitch();
        } finally {
          syncSession = nextSession;
        }
        if (recoverInitialPractice) {
          if (recoveredCache) articleDetailCache.set(recoveredCache.detail.id, recoveredCache);
          // Phiên ban đầu về muộn chỉ mở lại link còn hiệu lực, không khôi phục thao tác đã đóng.
          recoveredInitialPractice = true;
          handledTargetId = null;
          checkedInitialUrl = false;
        }
      } else {
        syncSession = nextSession;
      }
      if (browserStorage) {
        if (!personalPracticeStorage || previousPrincipalId !== principalId) selectPersonalStorage(principalId);
        storage = getPracticeStorage(createPrincipalStorage(browserStorage, principalId));
        preferences = storage.getPreferences();
        logs = storage.getLogs();
        fabPosition = storage.getFabPosition();
      }
      sessionOutbox?.setSession(syncSession);
      if (principalId && sessionOutbox?.shouldOfferAnonymousAdoption(principalId)) {
        try {
          const adopted = sessionOutbox.adoptAnonymousQueue(principalId);
          if (adopted > 0) {
            void sessionOutbox.flush().catch(() => undefined);
          }
        } catch {
          // Safe fallback
        }
      }
      anonymousAdoptionUserId = null;
      anonymousAdoptionCount = 0;
      if (sessionOutbox?.getStatus().phase === 'pending') void sessionOutbox.flush().catch(() => undefined);
      syncClient?.setSession(syncSession);
      readerProgress?.setSession(syncSession);
      void readerProgress?.flush().catch(() => undefined);
      readGuidedSettings();
      if (nextRole !== clientRole) {
        void queryClient.cancelQueries({ queryKey: serverStateKeys.articles.practice(clientRole) });
        queryClient.removeQueries({ queryKey: serverStateKeys.articles.practice(clientRole) });
      }
      clientRole = nextRole;
      practiceCompatibilityPull = syncSession.authenticated
        ? syncPracticeDataFromCloud().catch(() => undefined)
        : Promise.resolve();
    };
    applySession();
    refreshAudioState();

    const updateVisibility = () => {
      if (document.visibilityState === 'visible') {
        void rhythm?.refresh().catch(() => undefined);
        void personalSync?.active();
      }
      if (document.visibilityState === 'hidden') {
        // Chốt đúng bằng chứng đang có trước khi hệ điều hành có thể dừng WebView.
        if (rosarySession && rosarySession.acceptedCount > 0 && rhythmState.target === 0) {
          try { finishRosaryEvidence(); }
          catch (cause) { reportPracticeEvidenceFailure(cause); }
        }
        saveCurrentPracticePosition();
      }
      const observedAtMs = performance.now();
      if (scriptureEvidenceState) {
        updateScriptureEvidence(observedAtMs);
        scriptureEvidenceState.hidden = document.visibilityState === 'hidden' || screen !== 'practice' || Boolean(meditationSession);
      }
      if (meditationSession) {
        const generation = ++meditationVisibilityGeneration;
        const handle = meditationEvidenceHandle;
        const hidden = document.visibilityState === 'hidden';
        void (async () => {
          const native = audio?.hasNativeMeditation();
          if (native) {
            try { await audio?.refreshMeditation(); }
            catch { showPracticeFeedback(localeStore.t.practice.meditationMusicUnavailable); }
          }
          if (generation !== meditationVisibilityGeneration || handle !== meditationEvidenceHandle || !meditationSession) return;
          if (native) meditationSession = { ...meditationSession, hidden };
          else applyMeditationTransition(setMeditationVisibility(meditationSession, hidden, Date.now()));
          if (!hidden && ['preparing', 'active'].includes(meditationSession.phase)) {
            void wakeLock?.request();
            if (!native) {
              if (meditationSetup.musicTrack) void audio?.resumeMeditation().then(refreshAudioState);
              startMeditationTickers();
            }
          }
        })();
      }
      if (modelChantEvidenceState) {
        updateModelChantElapsed(observedAtMs);
      }
      recommendationClock = new Date();
    };
    let practiceScrollTicking = false;
    const updateReadingProgress = () => {
      if (practiceScrollTicking) return;
      practiceScrollTicking = true;
      requestAnimationFrame(() => {
        practiceScrollTicking = false;
        updateScriptureEvidence();
        saveCurrentPracticePosition(true, true);
      });
    };

    const beforeUnload = (event: BeforeUnloadEvent) => {
      saveCurrentPracticePosition();
      if (personalPanel?.preserveDraft() === false) {
        event.preventDefault();
        event.returnValue = '';
        return;
      }
      if (screen === 'rosary') {
        // Lưu checkpoint đồng bộ để tải lại vẫn tiếp tục được chuỗi chưa kết thúc.
        try { finishRosaryEvidence(); saveGuidedSettings(); } catch { /* Receipt giữ phần cần thử lại. */ }
        return;
      }
      if (screen !== 'practice' && !meditationSession) return;
      event.preventDefault();
      event.returnValue = '';
    };

    const popState = () => {
      toolNavigationGeneration += 1;
      if (ignoreNextHandledPopState) { ignoreNextHandledPopState = false; return; }
      const targetUrl = new URL(window.location.href);
      if (targetUrl.searchParams.has('communityPost')) {
        if (personalPanel?.preserveDraft() === false) {
          window.history.pushState(window.history.state, '', window.location.href);
          return;
        }
        if (applyCommunityNotificationUrl(targetUrl)) return;
      } else {
        communityPostId = null;
        communityReactionId = null;
      }
      const nextUpgradeTab = window.history.state?.tuTapUpgradeTab === 'personal' || window.history.state?.tuTapUpgradeTab === 'community' ? window.history.state.tuTapUpgradeTab as typeof upgradeTab : 'catalog';
      if (screen === 'catalog' && upgradeTab !== nextUpgradeTab) {
        if (upgradeTab !== 'catalog' && personalPanel?.preserveDraft() === false) {
          window.history.pushState({ ...window.history.state, tuTapUpgradeTab: upgradeTab }, '', window.location.href);
          return;
        }
        upgradeTab = nextUpgradeTab;
        if (nextUpgradeTab === 'catalog') void tick().then(() => window.scrollTo({ top: savedHubScrollY, behavior: 'instant' }));
        return;
      }
      const targetTool = toolFromUrl(targetUrl);
      if (rosaryEndStage) {
        if (rosaryEndStage === 'complete') closeRosary(true);
        else { rosaryEndStage = null; writeToolUrl('rosary', 'rosary', false, rosaryReturnScreen); }
        return;
      }
      if (confirmation !== null) {
        const wasRosaryStart = confirmation === 'start-rosary';
        confirmation = null;
        if (wasRosaryStart && targetTool !== 'rosary') return;
        if (screen === 'rosary') writeToolUrl('rosary', 'rosary', false, rosaryReturnScreen);
        else history.pushState(null, '', window.location.href);
        return;
      }
      if (meditationChooserOpen) {
        if (targetTool === 'meditation') return;
        closeMeditationChooser(true);
        return;
      }
      if (meditationSession) {
        if (targetTool === 'meditation') return;
        if (meditationSession.phase === 'completed' || meditationSession.phase === 'cancelled') {
          closeGuidedMeditation(true);
        } else {
          pauseGuidedMeditation();
          writeToolUrl('meditation', 'meditation');
        }
        return;
      }
      if (screen === 'thanh-tinh' && abstinenceReturnToPrecepts && targetTool !== 'thanh-tinh') {
        closeThanhTinh(true);
        return;
      }
      if (preceptsOpen && preceptMode === 'daily' && preceptScreen?.handleBack()) {
        writeToolUrl('giu-gioi', 'precepts', false, preceptReturnScreen);
        return;
      }
      if (screen === 'rosary') {
        leaveRosary(true);
        if (screen === 'rosary') writeToolUrl('rosary', 'rosary', false, rosaryReturnScreen);
        return;
      }
      if (targetTool) {
        if (screen === 'le-phat' && ['thoi-khoa', 'cong-phu', 'tiep-tuc-cong-phu'].includes(targetTool)) {
          // Back từ Lễ Phật phải lưu và dọn phiên trước khi khôi phục overlay của catalog.
          lePhatScreen?.finish(true);
          // finish giữ nguyên màn và số lần lạy nếu lưu trữ thất bại.
          if ((screen as PracticeScreen) === 'le-phat') return;
        }
        restoreTool(targetTool, window.history.state?.tuTapScreen);
        return;
      }
      if (preceptsOpen) {
        if (preceptScreen?.handleBack()) {
          writeToolUrl(preceptMode === 'eight' ? 'bat-quan-trai' : 'giu-gioi', 'precepts', false, preceptReturnScreen);
        } else closePrecepts(true);
        return;
      }
      if (screen === 'le-phat') {
        lePhatScreen?.finish(true);
        return;
      }
      if (screen === 'thanh-tinh') {
        closeThanhTinh(true);
        return;
      }
      if (screen === 'practice') {
        history.pushState({ ...window.history.state, practice: true }, '', window.location.href);
        requestExitPractice();
        return;
      }
      if (preferences.trackerOpen) setCatalogOverlay('cong-phu', false, false);
      recommendationsCollapsed = true;
      continueReadingCollapsed = true;
      if (screen === 'preview') {
        const target = new URL(window.location.href);
        const targetArticle = target.searchParams.get('article');
        const targetChapter = target.searchParams.get('chap');
        if (targetArticle === currentArticle?.id && targetChapter !== null && /^\d+$/.test(targetChapter)) {
          void loadChapter(Number(targetChapter), false);
          return;
        }
        if (targetArticle === currentArticle?.id) {
          ++chapterRequestSequence;
          currentChapterIndex = null;
          return;
        }
        pushedTuTapHistory = false;
        backToCatalog(true);
        return;
      }
      currentSection = sectionFromUrl(targetUrl);
      activeCategory = currentSection ?? 'all';
      const articleId = targetUrl.searchParams.get('article') || targetUrl.searchParams.get('book') || targetUrl.searchParams.get('id') || targetUrl.searchParams.get('sach');
      const article = articleId ? articles.find(item => item.id === articleId) : null;
      if (article) void openArticle(article, false, false);
    };

    const handleTabReset = (event: Event) => {
      const detail = (event as CustomEvent<{ path: string }>).detail;
      if (detail?.path === '/tu-tap') {
        if (meditationSession) {
          closeGuidedMeditation();
        }
        if (preceptsOpen) {
          closePrecepts();
        } else if (screen === 'practice') {
          requestExitPractice();
        } else if (screen === 'rosary') {
          leaveRosary();
        } else if (screen === 'le-phat') {
          lePhatScreen?.finish();
        } else if (screen === 'thanh-tinh') {
          closeThanhTinh();
        } else if (screen === 'preview') {
          backToCatalog();
        } else if (upgradeTab !== 'catalog') {
          void selectUpgradeTab('catalog');
        } else if (currentSection !== null) {
          handleBackToHub();
        }
      }
    };

    const handlePracticeWidgetOpen = (event: Event) => {
      const path = (event as CustomEvent<{ path?: unknown }>).detail?.path;
      if (typeof path !== 'string') return;
      let target: URL;
      try { target = new URL(path, window.location.origin); }
      catch { return; }
      if (target.href !== window.location.href || !isPracticeWidgetTarget(target)) return;
      // Chạm lại widget chỉ mở công cụ đã đóng, không khởi động lại phiên đang thực hành.
      if (screen !== 'catalog' || meditationSession || meditationChooserOpen || preceptsOpen || confirmation !== null) return;
      const action = toolFromUrl(target);
      const section = sectionFromUrl(target);
      if (!action && !section) return;
      checkedInitialUrl = true;
      toolNavigationGeneration += 1;
      if (action) {
        const stage = action === 'rosary' ? 'rosary-start' : action === 'meditation' ? 'meditation-chooser' : action;
        const existingToolEntry = window.history.state?.tuTapAction === action;
        if (!existingToolEntry) {
          const base = withoutToolUrl(new URL(target));
          window.history.replaceState({ ...window.history.state, tuTapAction: null, tuTapScreen: 'catalog' }, '', base.toString());
        }
        writeToolUrl(action, stage, existingToolEntry, 'catalog');
        restoreTool(action);
      } else if (section) {
        currentSection = section;
        activeCategory = section;
        query = '';
        window.history.replaceState({ ...window.history.state, section }, '', window.location.href);
      }
    };

    const retryPracticeSessions = () => {
      // Chỉ phát lại outbox đã có khi kết nối trở lại; owner giữ principal và chống gửi trùng.
      void sessionOutbox?.flush().catch(() => undefined);
      if (document.visibilityState === 'visible') void personalSync?.active();
    };

    window.addEventListener('quangtu:online', retryPracticeSessions);
    window.addEventListener(PRACTICE_WIDGET_OPEN_EVENT, handlePracticeWidgetOpen);
    window.addEventListener('quangtu:tab-reset', handleTabReset);
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', popState);
    window.addEventListener('scroll', updateReadingProgress, { passive: true });
    window.addEventListener(SESSION_CHANGE_EVENT, applySession);
    document.addEventListener('visibilitychange', updateVisibility);

    return () => {
      stopTrackerDayRefresh();
      stopRhythm();
      rhythm?.dispose();
      endRoutine();
      personalSync?.dispose();
      practiceSyncGeneration += 1;
      presenceMounted = false;
      practicePresenceActivity = null;
      setPracticePresence(null);
      window.clearTimeout(rosaryFeedbackTimer);
      saveCurrentPracticePosition();
      syncClient?.setSession(guestSession);
      readerProgress?.destroy();
      finishScriptureEvidence();
      try { finishRosaryEvidence(); }
      catch (cause) { reportPracticeEvidenceFailure(cause); }
      closeGuidedMeditation(true);
      cleanupPracticeResources();
      unsubscribeMeditationMotion?.();
      meditationMotion?.destroy();
      adminEditorController?.abort();
      adminEditorSequence += 1;
      audio?.destroy();
      autoScroll?.destroy();
      void wakeLock?.destroy();
      window.removeEventListener('quangtu:online', retryPracticeSessions);
      window.removeEventListener(PRACTICE_WIDGET_OPEN_EVENT, handlePracticeWidgetOpen);
      window.removeEventListener('quangtu:tab-reset', handleTabReset);
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', popState);
      window.removeEventListener('scroll', updateReadingProgress);
      window.removeEventListener(SESSION_CHANGE_EVENT, applySession);
      document.removeEventListener('visibilitychange', updateVisibility);
    };
  });
</script>

<svelte:head>
  <title>{isEn ? 'Practice — Cultivate with Quang Tu' : 'Tu Tập — Tu tập cùng Quang Từ'}</title>
  <meta name="description" content={isEn ? 'Buddhist practice portal with scripture catalog, daily liturgies, recitation tracker, and digital rosary.' : 'Chế độ tu tập với catalog kinh, nghi thức, tracker công phu và tràng hạt giả lập.'} />
</svelte:head>

{#snippet routineControls()}
  {#if activeRoutine}
    <DailyRoutineSession routine={activeRoutine} index={routineIndex} paused={routinePaused} countdown={routineCountdown} waiting={routineWaiting} controlsOnly={true} onPause={pauseRoutine} onNext={() => void advanceRoutine(true)} onExit={() => { endRoutine(); stopRhythm(); if (meditationSession) closeGuidedMeditation(); else if (screen === 'rosary') leaveRosary(); else if (screen === 'le-phat') lePhatScreen?.finish(true); }} />
  {/if}
{/snippet}
{#if rosaryDedication}
  <DailyRoutineSession routine={rosaryDedication} index={0} paused={false} countdown={0} waiting={false} showControls={false} onPause={() => {}} onNext={() => { rosaryDedication = null; }} onExit={() => { rosaryDedication = null; }} />
{/if}
{#if activeRoutine}
  <DailyRoutineSession routine={activeRoutine} index={routineIndex} paused={routinePaused} countdown={routineCountdown} waiting={routineWaiting} onPause={pauseRoutine} onNext={continueRoutineNow} onExit={endRoutine} />
{/if}

<div
  class:tt-page--practice={visibleScreenPractice}
  class:tt-page--preview={screen === 'preview'}
  class="tt-page"
>
      {#if communityPostId && communityTargetReady && screen !== 'catalog'}
        <MindfulCommunity principalId={sessionPrincipalId(syncSession)} active={true} targetOnly={true}
          targetPostId={communityPostId} targetReactionId={communityReactionId} targetIntent={communityPostIntent} targetVisible={communityPostVisible} onTargetClose={closeCommunityNotification} />
      {/if}
      {#if articleLoadError}
        <div class="tt-load-error" role="alert">
          <span>{articleLoadError}</span>
          <button type="button" onclick={() => {
            if (failedChapterIndex !== null) void loadChapter(failedChapterIndex);
            else if (lastRequestedArticle) void openArticle(lastRequestedArticle);
          }}>{localeStore.current === 'en' ? 'Retry' : 'Thử lại'}</button>
        </div>
      {/if}
      {#if screen === 'catalog'}
        {#if upgradeTab === 'catalog'}
        <PracticeCatalog
          activeCategory={activeCategory}
          articles={filteredArticles}
          loadError={catalogLoadError}
          loading={catalogLoading}
          currentSection={currentSection}
          onSelectSection={handleSelectSection}
          onCreateArticle={(cat) => createAdminPracticeArticle(cat)}
          onCategoryChange={(value) => activeCategory = value}
          onOpen={openArticle}
          canManage={canManageContent}
          canDelete={canDeleteContent}
          onEdit={(article) => void openAdminEditor(article)}
          onDelete={(article) => void deleteAdminArticle(article)}
          onQueryChange={(value) => query = value}
          onMeditationOpen={() => void requestMeditation()}
          onRosaryOpen={() => {
            requestRosaryStart('catalog');
          }}
          onLePhatOpen={() => {
            openLePhat('catalog');
          }}
          onThanhTinhOpen={() => {
            openThanhTinh('catalog');
          }}
          onPreceptsOpen={() => openPrecepts('daily')}
          onEightPreceptsOpen={() => openPrecepts('eight')}
          onReflectionOpen={() => void selectUpgradeTab('personal')}
          {query}
        >
          {#snippet dharmaGivingPrompt()}
            <DharmaGivingGuidePrompt session={sessionStore.value} currentPath="/tu-tap" alwaysShow={true} />
          {/snippet}
          {#snippet continueReading()}
            <PracticeContinueReadingShelf
              articles={localizedArticles}
              session={sessionStore.value}
              onOpen={openArticle}
              bind:isBannerCollapsed={continueReadingCollapsed}
              onCollapsedChange={(collapsed) => setCatalogOverlay('tiep-tuc-cong-phu', !collapsed)}
            />
          {/snippet}
          {#snippet recommendations()}
            <PracticeRecommendations
              recommendations={practiceRecommendationSet}
              onAction={handleRecommendation}
              onPeriodChange={(period) => recommendationPeriod = period}
              bind:isCollapsed={recommendationsCollapsed}
              onCollapsedChange={(collapsed) => setCatalogOverlay('thoi-khoa', !collapsed)}
            >
              {#snippet routines()}
                {#if personalPracticeStorage}
                  <section aria-label={personalPracticeCopy[isEn ? 'en' : 'vi'].myRoutines}>
                    <h3>{personalPracticeCopy[isEn ? 'en' : 'vi'].myRoutines}</h3>
                    {#key personalPracticeStorage}<DailyRoutineEditor storage={personalPracticeStorage} onRun={runRoutine} {dedicationTemplates} />{/key}
                  </section>
                {/if}
              {/snippet}
            </PracticeRecommendations>
          {/snippet}
          {#snippet tracker()}
            <PracticeTracker
              routineSummaries={personalSummaries}
              activePeriod={activePeriod}
              currentDate={trackerNow}
              historyOpen={trackerHistoryOpen}
              {logs}
              recentLogs={recentLogs}
              stats={trackerStats}
              trackerOpen={preferences.trackerOpen}
              onHistoryToggle={() => trackerHistoryOpen = !trackerHistoryOpen}
              onNewLog={openManualLog}
              onDeleteLog={requestDeleteLog}
              onPeriodChange={(period) => activePeriod = period}
              onToggle={() => setCatalogOverlay('cong-phu', !preferences.trackerOpen)}
            />
          {/snippet}
        </PracticeCatalog>
        {:else if personalPracticeStorage}
          {#key personalPracticeStorage}
          <PersonalPracticePanel bind:this={personalPanel} storage={personalPracticeStorage} onShare={sessionPrincipalId(syncSession) ? shareReflection : undefined} onSignIn={() => window.dispatchEvent(new CustomEvent('quangtu:login-required'))} initialCommunity={upgradeTab === 'community'}>
            {#snippet community()}
              {#if !communityPostId || communityTargetReady}
              <MindfulCommunity principalId={sessionPrincipalId(syncSession)} nickname={personalPracticeStorage?.getNickname() ?? ''} active={true}
                targetPostId={communityPostId} targetReactionId={communityReactionId} targetIntent={communityPostIntent} targetVisible={communityPostVisible} onTargetClose={closeCommunityNotification} />
              {/if}
            {/snippet}
          </PersonalPracticePanel>
          {/key}
          {#if personalSyncNotice}<p role="status">{personalSyncNotice}</p>{/if}
          {#if personalSummaries.length}
          <section class="tt-personal-sync">
            <h2>{isEn ? 'Completed routines' : 'Thời khóa đã hoàn thành'}</h2>{#each personalSummaries.slice(-20).reverse() as summary (summary.id)}<p>{summary.date} · {summary.note}</p>{/each}
          </section>
          {/if}
        {/if}
      {/if}

      {#if adminNotice}<p class="tt-admin-notice" role="status">{adminNotice}</p>{/if}
      {#if showEnglishContentFallback && currentArticle}
        <p class="tt-en-fallback-notice" role="status">
          English version is in progress. Showing Vietnamese original below — bundled offline in the app.
        </p>
      {/if}
      {#if !showEnglishContentFallback && showEnglishDraftNotice && currentArticle}
        <p class="tt-en-fallback-notice tt-en-draft-notice" role="status">
          {ENGLISH_TRANSLATION_NOTICE}
        </p>
      {/if}

      {#if screen === 'preview' && currentArticle}
        <PracticePreview
          article={localizedCurrentArticle ?? currentArticle}
          chapterContent={currentChapterContent}
          {chapters}
          currentChapterIndex={currentChapterIndex}
          fontSize={preferences.fontSize}
          onBack={backToCatalog}
          onChapterOpen={loadChapter}
          onChapterClose={() => {
            if (typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('chap')) {
              window.history.back();
            } else {
              currentChapterIndex = null;
            }
          }}
          onStartPractice={requestStartPractice}
          onEnglishContentReady={handleEnglishContentReady}
          readBackground={theme.value === 'dark' ? 'dark' : preferences.readBackground === 'dark' ? 'cream' : preferences.readBackground}
          onFontSizeChange={(size) => preferences = storage?.savePreferences({ fontSize: size }) ?? preferences}
          onBackgroundChange={(bg) => preferences = storage?.savePreferences({ readBackground: bg }) ?? preferences}
          session={sessionStore.value}
        />
      {/if}

      {#if visibleScreenPractice && currentArticle}
        <PracticeSession
          article={localizedCurrentArticle ?? currentArticle}
          autoScrollActive={autoScrollActive}
          {autoScrollSpeed}
          currentChapterIndex={currentChapterIndex ?? 0}
          navigationReady={practicePositionReady}
          {fabPosition}
          fontSize={preferences.fontSize}
          moActive={audioState.moActive}
          meditationMusicActive={audioState.meditationActive}
          selectedMeditationTrack={audioState.selectedTrack}
          modelChantActive={modelChantActive || modelChantLoading}
          {panelOpen}
          practiceBackground={theme.value === 'dark' && preferences.practiceBackground === 'cream' ? 'dark' : preferences.practiceBackground}
          practiceBold={preferences.practiceBold}
          {practiceCount}
          {practiceHtml}
          practiceTitle={currentChapterContent ? (localeStore.current === 'en' ? getLocalizedChapterTitle(currentChapterContent.title) : currentChapterContent.title) : (localizedCurrentArticle?.title ?? currentArticle.title)}
          showChapterNavigation={chapters.length > 1}
          totalChapters={chapters.length}
          onAutoScrollToggle={toggleAutoScroll}
          onAutoScrollSpeedChange={changeAutoScrollSpeed}
          onBackgroundChange={updatePracticeBackground}
          onCountChange={bumpCount}
          onExit={requestExitPractice}
          onFabPositionSave={(position) => {
            fabPosition = position;
            storage?.saveFabPosition(position);
          }}
          onFontSizeChange={adjustFontSize}
          onNextChapter={() => currentChapterIndex !== null && void switchPracticeChapter(Math.min(chapters.length - 1, currentChapterIndex + 1))}
          onPanelToggle={() => panelOpen = !panelOpen}
          onPreviousChapter={() => currentChapterIndex !== null && void switchPracticeChapter(Math.max(0, currentChapterIndex - 1))}
          onSelectMeditationTrack={handleSelectMeditationTrack}
          onStopMeditationMusic={handleStopMeditationMusic}
          onModelChantToggle={toggleModelChant}
          onToggleBold={togglePracticeBold}
          onToggleMo={toggleMo}
        />
      {/if}

      <RosaryScreen routineControls={activeRoutine ? routineControls : undefined}
        count={preferences.rosaryCount}
        dailyGoal={rosaryDailyGoal}
        direction={preferences.rosaryDirection}
        open={screen === 'rosary'}
        phrase={rosaryPhrase}
        progress={rosaryProgress}
        sessionCount={rosarySession?.acceptedCount ?? 0}
        size={rosarySize}
        soundEnabled={preferences.rosarySoundEnabled}
        autoState={rhythmState}
        autoBusy={rhythmBusy}
        routinePaused={routinePaused}
        onAutoStart={input => void startRosaryRhythm(input)}
        onAutoPause={() => rhythm?.pause()}
        onAutoResume={intervalMs => void resumeRosaryRhythm(intervalMs)}
        onAutoStop={() => void stopRosaryRhythm()}
        onDailyGoalChange={updateRosaryDailyGoal}
        onExitRequest={requestRosaryExit}
        onBack={() => leaveRosary()}
        onDelta={bumpRosary}
        onDirectionChange={(value) => preferences = storage?.savePreferences({ rosaryDirection: value }) ?? preferences}
        onPhraseChange={updateRosaryPhrase}
        customPhrases={customRosaryPhrases}
        customText={rosaryCustomText}
        customType={rosaryCustomType}
        onAddCustomPhrase={handleAddCustomPhrase}
        onDeleteCustomPhrase={handleDeleteCustomPhrase}
        onCustomTextChange={updateRosaryCustomText}
        onCustomTypeChange={updateRosaryCustomType}
        onResetRequest={() => confirmation = 'reset-rosary'}
        onSizeChange={updateRosarySize}
        onSoundToggle={(value) => preferences = storage?.savePreferences({ rosarySoundEnabled: value }) ?? preferences}
      />

      <LePhatScreen routineControls={activeRoutine ? routineControls : undefined}
        bind:this={lePhatScreen}
        principal={sessionPrincipalId(syncSession)}
        open={screen === 'le-phat'}
        routineSetup={routineBowingSetup}
        routinePaused={routinePaused}
        onRoutineComplete={(count, buddha) => { closeLePhat(count, buddha, false, true); void advanceRoutine(false); }}
        onExitRequest={(count, buddha, fromHistory) => closeLePhat(count, buddha, fromHistory)}
      />

      {#if preceptsOpen}
        <PreceptPracticeScreen bind:this={preceptScreen} open={preceptsOpen} mode={preceptMode} resumeReflection={preceptResumeReflection}
          resumeTestingPrincipal={preceptTestingPrincipal} testingConductConfirmed={preceptTestingConductConfirmed}
          testingConductAnswer={preceptTestingConductAnswer}
          onClose={() => closePrecepts()} onOpenAbstinence={openAbstinenceFromPrecepts}
          onOpenActivity={(target) => { void openPreceptActivity(target); }} />
      {/if}

      {#if screen === 'thanh-tinh'}
        <ThanhTinhScreen
          open={screen === 'thanh-tinh'}
          onClose={() => closeThanhTinh()}
          onConductRecorded={returnAfterPreceptConduct}
          onNavigateToTriChu={async () => {
            // Thay màn hiện tại, tránh popstate từ Back đóng bài chú vừa mở.
            closeThanhTinh(true);
            const langNghiemArticle = articles.find((a) =>
              a.category === 'TRÌ CHÚ' &&
              (isChuLangNghiem(a) || /(?:shurangama|surangama)/i.test(a.title))
            );
            if (langNghiemArticle) {
              await openArticle(langNghiemArticle, true, false);
            } else {
              handleSelectSection('TRÌ CHÚ');
              query = 'Lăng Nghiêm';
            }
          }}
        />
      {/if}

      {#if rosaryFeedback}
        <p class="tt-rosary-feedback" role="status" aria-live="polite">{rosaryFeedback}</p>
      {/if}

      {#if rosaryEndStage && !rosaryDedication}
        <RosaryEndDialog
          count={rosaryVisitCount}
          phrase={rosaryVisitPhrases.length === 1 ? rosaryVisitPhrases[0] : ''}
          completed={rosaryEndStage === 'complete'}
          error={rosaryEndError}
          onCancel={() => { rosaryEndStage = null; rosaryEndError = ''; }}
          onConfirm={() => closeRosary(false, true)}
          onClose={() => closeRosary()}
        />
      {/if}

      {#if confirmationCopy}
        <PracticeConfirmDialog
          practiceTheme={confirmation?.includes('rosary') ? 'rosary' : confirmation === 'delete-log' ? 'tracker' : currentArticle?.category ?? 'KINH PHẬT'}
          cancelLabel={confirmationCopy.cancelLabel}
          confirmLabel={confirmationCopy.confirmLabel}
          description={confirmationCopy.description}
          icon={confirmationCopy.icon}
          open={Boolean(confirmation)}
          title={confirmationCopy.title}
          busy={confirmation === 'delete-log' && deletingLogGroup}
          onCancel={() => {
            if (confirmation === 'start-rosary') closeToolUrl('rosary');
            confirmation = null;
            pendingDeleteLogId = null;
            pendingDeleteLogIds = [];
          }}
          onConfirm={confirmActiveDialog}
        />
      {/if}

      <MeditationChooser
        initial={meditationSetup}
        initialBackgroundArtwork={meditationBackgroundArtwork}
        open={meditationChooserOpen}
        options={MEDITATION_TRACK_OPTIONS}
        onCancel={() => closeMeditationChooser()}
        onStart={(setup, artwork) => {
          meditationBackgroundArtwork = artwork ?? null;
          void startGuidedMeditation(setup);
        }}
      />

      {#if manualLogDraft}
        <PracticeLogModal
          authenticated={syncSession.authenticated}
          campaigns={communityCampaigns}
          log={manualLogDraft}
          open={manualLogModalOpen}
          onCancel={() => manualLogModalOpen = false}
          onSave={(entry) => void saveManualLog(entry)}
        />
      {/if}
</div>

{#if meditationSession}
  <MeditationScreen routineControls={activeRoutine ? routineControls : undefined}
    motion={meditationMotionSnapshot}
    session={meditationSession}
    setup={meditationSetup}
    initialBackgroundArtwork={meditationBackgroundArtwork}
    onClose={() => closeGuidedMeditation()}
    onEnd={endGuidedMeditation}
    onPause={pauseGuidedMeditation}
    onResume={resumeGuidedMeditation}
  />
{/if}

{#if editingArticle && (clientRole === 'admin' || clientRole === 'ctv')}
  {#await import('$lib/components/admin/articles/ArticleAdminModal.svelte') then { default: ArticleAdminModal }}
    <ArticleAdminModal
      article={editingArticle}
      role={clientRole}
      onClose={() => editingArticle = null}
      onSaved={() => finishAdminChange()}
      onDeleted={() => finishAdminChange('Đã xóa bài viết.')}
    />
  {/await}
{/if}

<style>
  .tt-personal-sync{padding:var(--space-page);background:var(--card);border:1px solid var(--border2);border-radius:var(--radius-card);margin-block:var(--space-page)}

  .tt-en-fallback-notice{position:sticky;top:var(--nav-h,56px);z-index:120;margin:8px 16px 0;padding:10px 14px;border:1px solid var(--border2);border-radius:12px;background:var(--bg2);color:var(--text2);font-size:var(--font-size-body);line-height:1.5;text-align:center}
  .tt-admin-notice{position:fixed;z-index:960;left:50%;bottom:max(84px,calc(env(safe-area-inset-bottom,0px) + 76px));max-width:min(480px,calc(100% - 32px));margin:0;padding:12px 18px;transform:translateX(-50%);border-radius:999px;background:#3a2a19;color:#fff;box-shadow:0 12px 36px rgba(0,0,0,.24);font-size:var(--font-size-label);font-weight:700;text-align:center}
  .tt-load-error{display:flex;width:min(700px,calc(100% - 32px));align-items:center;justify-content:space-between;gap:12px;margin:16px auto;padding:12px 14px;border:1px solid color-mix(in srgb,var(--red) 45%,var(--border));border-radius:12px;background:color-mix(in srgb,var(--red) 8%,var(--white));color:var(--text2);font-size:var(--font-size-body)}.tt-load-error button{min-height:44px;flex-shrink:0;padding:0 14px;border:0;border-radius:18px;background:var(--gold);color:var(--on-gold);font-family:inherit;font-size:var(--font-size-label);font-weight:700}
  .tt-rosary-feedback{position:fixed;z-index:960;left:50%;bottom:max(84px,calc(env(safe-area-inset-bottom,0px) + 76px));max-width:min(420px,calc(100% - 32px));margin:0;padding:12px 18px;transform:translateX(-50%);border:1px solid rgba(255,255,255,.18);border-radius:999px;background:#3a2a19;color:#fff;box-shadow:0 12px 36px rgba(0,0,0,.28);font-size:var(--font-size-label);font-weight:700;text-align:center;animation:tt-feedback-in .18s ease-out}
  .tt-page{width:100%;margin:0 auto;padding:calc(var(--practice-topbar-height,calc(64px + var(--app-safe-top,env(safe-area-inset-top,0px)))) + 16px) 0 var(--space-page)}
  .tt-page--preview{padding:0}
  .tt-page--practice{padding:0}
  @keyframes tt-feedback-in{from{opacity:0;transform:translate(-50%,8px)}to{opacity:1;transform:translate(-50%,0)}}
  @media (prefers-reduced-motion:reduce){.tt-rosary-feedback{animation:none}}
</style>
