<script lang="ts">
  import { recordPracticeParticipation } from '$lib/browser/practice-participation';
  import { onMount, onDestroy } from 'svelte';
  import { alertInApp } from '$lib/browser/app-dialog';
  import { createPracticeAudioCountdown } from '$lib/browser/practice-audio-timing';
  import PracticeIcon from '../PracticeIcon.svelte';
  import { Play, Pause, Repeat2, Volume2, Settings } from '@lucide/svelte';
  import { PRECEPT_UI } from '$lib/i18n/precept-interface';
  import { isNativeApp } from '$lib/browser/native-platform';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getThemeContext } from '$lib/stores/theme.svelte';
  import { thanhTinhTranslations } from '$lib/i18n/thanh-tinh-translations';
  import {
    calculateThanhTinhStats,
    applyDailyThanhTinhCheckIn,
    checkAndApplyMissedCheckIns,
    getDefaultThanhTinhState,
    getThanhTinhAbstinenceInfo,
    loadThanhTinhState,
    saveThanhTinhState,
    type ThanhTinhState,
    FALLBACK_COMMUNITY_STATS,
    type CommunityThanhTinhStats,
    loadCachedCommunityStats,
    saveCachedCommunityStats
  } from '$lib/domain/practice/thanh-tinh';
  import {
    fetchCommunityThanhTinhStats,
    submitThanhTinhPledge,
    syncDailyThanhTinhProgress
  } from '$lib/browser/thanh-tinh-client';
  import { createWakeLockController } from '$lib/browser/wake-lock';
  import { getVietnamIsoDate } from '$lib/domain/practice/stats';
  import { formatVietnamDate } from '$lib/utils/vietnam-date-format';
  import { recordAbstinenceConduct } from '$lib/browser/precept-companion-storage';

  interface Props {
    open: boolean;
    onClose: () => void;
    onNavigateToTriChu?: () => void;
    onConductRecorded?: () => void;
  }

  let { open, onClose, onNavigateToTriChu = () => {}, onConductRecorded }: Props = $props();

  const localeStore = getLocaleContext();
  const themeStore = getThemeContext();
  const isEn = $derived(localeStore.current === 'en');
  const tt = $derived(isEn ? thanhTinhTranslations.en : thanhTinhTranslations.vi);

  // Active Milestones


  // Active Tab
  type ActiveTab = 'overview' | 'progress' | 'sos' | 'audio' | 'diet' | 'repentance';
  let activeTab: ActiveTab = $state('overview');
  let claritySettingsOpen = $state(false);
  let storageError = $state(false);
  let conductLinkError = $state(false);
  let mounted = $state(false);
  let openGeneration = 0;
  function resetViewScroll(node: HTMLElement, view: string) {
    return { update(next: string) {
      if (next !== view) { node.scrollTop = 0; view = next; }
    } };
  }
  let abstinenceInitialized = false;
  async function openAbstinence() {
    activeTab = 'overview';
    const loadStats = !abstinenceInitialized;
    if (!abstinenceInitialized) {
      practiceState = loadThanhTinhState();
      communityStats = loadCachedCommunityStats() || FALLBACK_COMMUNITY_STATS;
      abstinenceInitialized = true;
    }
    refreshCheckInClock(new Date(), true);
    if (!loadStats) return;
    const generation = openGeneration;
    const result = await fetchCommunityThanhTinhStats(false);
    if (open && generation === openGeneration) communityStats = result;
  }

  // Practice State
  let practiceState: ThanhTinhState = $state(getDefaultThanhTinhState());
  let communityStats: CommunityThanhTinhStats = $state(FALLBACK_COMMUNITY_STATS);
  let now: Date = $state(new Date());
  let timerInterval: ReturnType<typeof setInterval> | null = null;

  function persistPracticeState(nextState: ThanhTinhState): boolean {
    if (!saveThanhTinhState(nextState)) { storageError = true; return false; }
    storageError = false;
    practiceState = nextState;
    return true;
  }

  function reconcileCheckInGap(at: Date): boolean {
    if (!abstinenceInitialized) return true;
    const result = checkAndApplyMissedCheckIns(practiceState, at, isEn);
    return !result.missed || persistPracticeState(result.state);
  }

  function refreshCheckInClock(at: Date, reconcile = false): boolean {
    const changedDay = getVietnamIsoDate(at) !== getVietnamIsoDate(now);
    now = at;
    if (!reconcile && !changedDay) return true;
    return reconcileCheckInGap(at);
  }

  // Vow Pledge Modal
  let showPledgeModal = $state(false);
  let showRelapseModal = $state(false);
  let relapseReason = $state('Xem mạng xã hội / xem phim có hình ảnh gợi dục');
  let relapseNote = $state('');

  // Adjust Custom Start Date Modal
  let showAdjustDateModal = $state(false);
  let adjustDateInput = $state('');

  // SOS Siren Alarm (Web Audio API)
  let sosAudioCtx: AudioContext | null = null;
  let sosOscillator: OscillatorNode | null = null;
  let sosLfo: OscillatorNode | null = null;
  let sosGainNode: GainNode | null = null;
  let sosAlarmInterval: ReturnType<typeof setInterval> | null = null;
  let sosAlarmSecondsLeft = $state(120);
  let isSosAlarmPlaying = $state(false);

  // Check-in Solemn Confirmation Modal
  let showCheckInModal = $state(false);

  // Audio Player for Chú Lăng Nghiêm (Primary & Fallback Sources)
  const AUDIO_SOURCES = import.meta.env.VITE_CONTENT_PLATFORM === 'ios'
    ? ['/assets/audio/chu-lang-nghiem.mp3'] : [
    '/assets/audio/chu-lang-nghiem-dieu-am-tinh-tuan-20261023.mp3?v=trim9-20261025',
    'https://quangtu.vn/assets/audio/chu-lang-nghiem-dieu-am-tinh-tuan-20261023.mp3'
  ];
  let currentAudioSourceIndex = 0;
  let audioEl: HTMLAudioElement | null = null;
  let localAudioBlobUrl: string | null = null;
  let localAudioPreparation: Promise<void> | null = null;
  let audioDisposed = false;
  let audioPlayIntent = false;
  let audioSeekGeneration = 0;
  let audioPlaybackError = $state('');
  let isPlaying = $state(false);
  let isLooping = $state(true);
  let currentTime = $state(0);
  let duration = $state(0);
  let volume = $state(0.9);
  let timerTargetMinutes: number = $state(15); // default 15 mins recommended
  let timerSecondsLeft: number = $state(15 * 60);
  let isTimerActive = $state(false);
  const audioCountdown = createPracticeAudioCountdown(
    (seconds) => { timerSecondsLeft = seconds; },
    async () => {
      isTimerActive = false;
      playAwakeningBell();
      await alertInApp(tt.sos.completionAlert);
    },
  );

  // SOS Squat counter
  let squatCount = $state(0);
  let squatGoal = 100;

  // Web Audio wake lock
  let wakeLock: ReturnType<typeof createWakeLockController> | null = null;
  let wakeLockActive = false;

  async function holdWakeLock() {
    if (wakeLockActive || !open) return;
    const owner = wakeLock ??= createWakeLockController();
    wakeLockActive = true;
    const acquired = await owner.request();
    if (owner !== wakeLock || !open) { await owner.release(); return; }
    wakeLockActive = acquired;
  }

  function releaseWakeLock() {
    const owner = wakeLock;
    wakeLock = null;
    wakeLockActive = false;
    void owner?.destroy();
  }

  // Calculated stats derived from current practiceState
  const stats = $derived(calculateThanhTinhStats(practiceState, now, isEn));

  // Thọ Khang Bảo Giám and Buddhist calendar abstinence info
  const abstinence = $derived(getThanhTinhAbstinenceInfo(now, isEn));

  // Today check-in status
  const todayStr = $derived(getVietnamIsoDate(now));
  const isCheckedInToday = $derived(practiceState.lastCheckInDate === todayStr);

  function initAudioElement(): HTMLAudioElement | null {
    if (typeof window === 'undefined') return null;
    if (!audioEl) {
      audioEl = new Audio(AUDIO_SOURCES[currentAudioSourceIndex]);
      audioEl.loop = isLooping;
      audioEl.volume = volume;
      audioEl.preload = 'auto';

      audioEl.addEventListener('play', () => {
        isPlaying = true;
        void holdWakeLock();
      });

      audioEl.addEventListener('pause', () => {
        isPlaying = false;
        if (!isSosAlarmPlaying) releaseWakeLock();
      });

      audioEl.addEventListener('ended', () => {
        audioPlayIntent = false;
        isPlaying = false;
        stopCountdownTimer();
        if (!isSosAlarmPlaying) releaseWakeLock();
      });

      audioEl.addEventListener('timeupdate', () => {
        if (audioEl) {
          currentTime = audioEl.currentTime;
          if (audioEl.duration && !isNaN(audioEl.duration)) {
            duration = audioEl.duration;
          }
        }
      });

      audioEl.addEventListener('loadedmetadata', () => {
        if (audioEl && audioEl.duration && !isNaN(audioEl.duration)) {
          duration = audioEl.duration;
        }
      });

      audioEl.addEventListener('error', () => {
        if (currentAudioSourceIndex < AUDIO_SOURCES.length - 1) {
          currentAudioSourceIndex += 1;
          console.warn(`Audio source failed, switching to fallback [${currentAudioSourceIndex}]:`, AUDIO_SOURCES[currentAudioSourceIndex]);
          if (audioEl) {
            audioEl.src = AUDIO_SOURCES[currentAudioSourceIndex];
            audioEl.load();
            if (isPlaying) {
              void audioEl.play().catch(() => {});
            }
          }
        }
      });
    }
    return audioEl;
  }

  onMount(() => {
    mounted = true;
    const foreground = () => {
      if (open && document.visibilityState !== 'hidden') {
        refreshCheckInClock(new Date(), true);
        audioCountdown.refresh();
      }
    };
    window.addEventListener('focus', foreground);
    document.addEventListener('visibilitychange', foreground);
    return () => {
      window.removeEventListener('focus', foreground);
      document.removeEventListener('visibilitychange', foreground);
    };
  });

  onDestroy(() => {
    audioDisposed = true;
    openGeneration++;
    if (timerInterval) clearInterval(timerInterval);
    audioCountdown.stop();
    stopAudio();
    if (localAudioBlobUrl) {
      URL.revokeObjectURL(localAudioBlobUrl);
      localAudioBlobUrl = null;
    }
    stopSosAlarm();
    stopTibetanSingingBowl();
    releaseWakeLock();
  });

  // Tiếng chuông bát Tây Tạng trong thiền (3 tiếng chuông ngân cảnh tỉnh)
  let bowlAudioCtx: AudioContext | null = null;
  let bowlTimeout: ReturnType<typeof setTimeout> | null = null;

  function stopTibetanSingingBowl() {
    if (bowlTimeout) {
      clearTimeout(bowlTimeout);
      bowlTimeout = null;
    }
    if (bowlAudioCtx) {
      try {
        void bowlAudioCtx.close();
      } catch {
        // ignore
      }
      bowlAudioCtx = null;
    }
  }

  function playTibetanSingingBowl(strikes = 3) {
    stopTibetanSingingBowl();
    try {
      const browser = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const Context = globalThis.AudioContext ?? browser.webkitAudioContext;
      if (!Context) return;
      const ctx = new Context();
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      bowlAudioCtx = ctx;

      const masterGain = ctx.createGain();
      masterGain.gain.setValueAtTime(0.75, ctx.currentTime);
      masterGain.connect(ctx.destination);

      const baseFreq = 216; // Tần số thiền định chuông bát Tây Tạng
      const harmonics = [
        { freq: baseFreq, gain: 0.45, decay: 9.0 },
        { freq: baseFreq * 2.76, gain: 0.22, decay: 6.5 },
        { freq: baseFreq * 5.4, gain: 0.12, decay: 4.8 },
        { freq: baseFreq * 8.9, gain: 0.05, decay: 3.5 }
      ];

      // Slow pulsation (sóng theta 3.5Hz ngân vang nhịp nhàng)
      const lfo = ctx.createOscillator();
      lfo.type = 'sine';
      lfo.frequency.setValueAtTime(3.5, ctx.currentTime);
      const lfoGain = ctx.createGain();
      lfoGain.gain.setValueAtTime(0.08, ctx.currentTime);
      lfo.connect(lfoGain.gain);

      function strikeOnce(strikeTime: number) {
        const strikeMaster = ctx.createGain();
        strikeMaster.connect(masterGain);

        for (const h of harmonics) {
          const osc = ctx.createOscillator();
          const gain = ctx.createGain();

          osc.type = 'sine';
          osc.frequency.setValueAtTime(h.freq, strikeTime);

          gain.gain.setValueAtTime(0.0001, strikeTime);
          gain.gain.linearRampToValueAtTime(h.gain, strikeTime + 0.08);
          gain.gain.exponentialRampToValueAtTime(0.0001, strikeTime + h.decay);

          osc.connect(gain);
          gain.connect(strikeMaster);

          osc.start(strikeTime);
          osc.stop(strikeTime + h.decay);

          osc.onended = () => {
            try {
              osc.disconnect();
              gain.disconnect();
            } catch {
              // ignore
            }
          };
        }
      }

      const strikeInterval = 3.8; // Giãn cách 3.8 giây mỗi tiếng chuông ngân vang
      for (let i = 0; i < strikes; i++) {
        strikeOnce(ctx.currentTime + i * strikeInterval);
      }

      lfo.start(ctx.currentTime);
      const totalDuration = (strikes - 1) * strikeInterval + 10;
      lfo.stop(ctx.currentTime + totalDuration);

      bowlTimeout = setTimeout(() => {
        try {
          void ctx.close();
          if (bowlAudioCtx === ctx) bowlAudioCtx = null;
        } catch {
          // ignore
        }
      }, (totalDuration + 1) * 1000);
    } catch {
      // AudioContext fallback
    }
  }

  function playAwakeningBell() {
    playTibetanSingingBowl(3);
  }

  // Audio Playback Controls
  async function prepareLocalAudio(el: HTMLAudioElement, force = false): Promise<void> {
    if (currentAudioSourceIndex !== 0 || localAudioBlobUrl) return;
    if (!force && !isNativeApp() && !localAudioPreparation) return;
    // Native assets and some web servers return 200 without seekable byte ranges.
    // Web keeps streaming until a seek needs this one reusable local Blob.
    if (!localAudioPreparation) {
      localAudioPreparation = (async () => {
        const response = await fetch(AUDIO_SOURCES[0]);
        if (!response.ok) throw new Error('Bundled practice audio could not be loaded');
        const blob = await response.blob();
        if (!blob.size) throw new Error('Bundled practice audio is empty');
        if (audioDisposed) return;
        localAudioBlobUrl = URL.createObjectURL(blob);
        el.src = localAudioBlobUrl;
      })().catch((error) => {
        localAudioPreparation = null;
        throw error;
      });
    }
    await localAudioPreparation;
  }

  async function playAudio() {
    if (!open || audioDisposed) return;
    const el = initAudioElement();
    if (!el) return;
    audioPlayIntent = true;
    audioPlaybackError = '';
    try {
      await prepareLocalAudio(el);
      if (audioDisposed || !audioPlayIntent) return;
      el.loop = isLooping;
      el.volume = volume;
      await el.play();
      if (audioDisposed || !audioPlayIntent || !open) { el.pause(); return; }
      isPlaying = true;
      if (timerTargetMinutes > 0 && !isTimerActive) {
        startCountdownTimer();
      }
    } catch (err) {
      if (audioDisposed || !audioPlayIntent) return;
      console.warn('Initial play attempt failed, trying fallback source:', err);
      if (currentAudioSourceIndex < AUDIO_SOURCES.length - 1) {
        currentAudioSourceIndex += 1;
        el.src = AUDIO_SOURCES[currentAudioSourceIndex];
        el.load();
        try {
          await el.play();
          if (audioDisposed || !audioPlayIntent || !open) { el.pause(); return; }
          isPlaying = true;
          if (timerTargetMinutes > 0 && !isTimerActive) {
            startCountdownTimer();
          }
        } catch (fallbackErr) {
          console.warn('Fallback play attempt failed:', fallbackErr);
        }
      }
    }
  }

  async function toggleAudio() {
    if (audioPlayIntent || isPlaying) {
      audioPlayIntent = false;
      audioEl?.pause();
      isPlaying = false;
      stopCountdownTimer();
    } else {
      await playAudio();
    }
  }

  function stopAudio() {
    audioPlayIntent = false;
    audioSeekGeneration++;
    if (audioEl) {
      audioEl.pause();
      audioEl.currentTime = 0;
    }
    isPlaying = false;
    stopCountdownTimer();
  }

  async function seekAudio(value: number) {
    const el = audioEl;
    if (!el || !Number.isFinite(value)) return;
    const target = Math.max(0, Math.min(value, Number.isFinite(el.duration) ? el.duration : value));
    const generation = ++audioSeekGeneration;
    audioPlaybackError = '';
    const canSeek = Array.from({ length: el.seekable.length }, (_, i) => i)
      .some(i => el.seekable.end(i) > 0 && target >= el.seekable.start(i) && target <= el.seekable.end(i));
    try {
      if (!canSeek && !localAudioBlobUrl) await prepareLocalAudio(el, true);
      if (audioDisposed || generation !== audioSeekGeneration) return;
      el.currentTime = target;
      currentTime = target;
      if (audioPlayIntent && el.paused) await playAudio();
    } catch {
      if (audioDisposed || generation !== audioSeekGeneration) return;
      currentTime = el.currentTime;
      audioPlaybackError = isEn ? 'Unable to seek. Check your connection and try again.' : 'Chưa thể tua âm thanh. Hãy kiểm tra kết nối và thử lại.';
    }
  }

  function toggleLoop() {
    isLooping = !isLooping;
    if (audioEl) audioEl.loop = isLooping;
  }

  function handleVolumeChange(e: Event) {
    const val = Number((e.target as HTMLInputElement).value);
    volume = val;
    if (audioEl) audioEl.volume = val;
  }

  function startCountdownTimer() {
    isTimerActive = true;
    audioCountdown.start(timerTargetMinutes * 60);
  }

  function stopCountdownTimer() {
    audioCountdown.stop();
    isTimerActive = false;
  }

  function formatTime(sec: number): string {
    const m = Math.floor(sec / 60);
    const s = Math.floor(sec % 60);
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  }

  // Community Pledge
  async function handleConfirmPledge() {
    const nextState: ThanhTinhState = {
      ...practiceState,
      joined: true,
      joinedAt: new Date().toISOString(),
      checkInRunStartedAt: null
    };
    if (!persistPracticeState(nextState)) return;
    showPledgeModal = false;

    // Cap nhat lac quan: tang so ban dong tu ngay tren app (+1) de nguoi dung thay so tang ngay
    communityStats = {
      ...communityStats,
      participantCount: communityStats.participantCount + 1
    };
    saveCachedCommunityStats(communityStats);

    // Send anonymous pledge to server
    const res = await submitThanhTinhPledge();
    communityStats = res;
    playAwakeningBell();
  }

  // Join program for new users (khởi động bộ đếm từ thời khắc bấm có)
  async function handleConfirmJoinProgram() {
    const nowIso = new Date().toISOString();
    const nextState: ThanhTinhState = {
      ...practiceState,
      joined: true,
      joinedAt: nowIso,
      cleanSince: nowIso,
      lastCheckInDate: null,
      checkInRunStartedAt: null,
      consecutiveCheckInsSinceRelapse: 2,
      hasRecentRelapse: false
    };
    if (!persistPracticeState(nextState)) return;

    // Cap nhat lac quan: tang so ban dong tu ngay tren app (+1) de nguoi dung thay so tang ngay
    communityStats = {
      ...communityStats,
      participantCount: communityStats.participantCount + 1
    };
    saveCachedCommunityStats(communityStats);

    void submitThanhTinhPledge().then((res) => {
      communityStats = res;
    });

    playAwakeningBell();
  }

  // Adjust Custom Start Date Handlers
  function openAdjustDateModal() {
    adjustDateInput = getVietnamIsoDate(new Date(practiceState.cleanSince));
    showAdjustDateModal = true;
  }

  function handleSaveAdjustDate() {
    if (!adjustDateInput) return;
    const chosenDate = new Date(`${adjustDateInput}T00:00:00`);
    if (isNaN(chosenDate.getTime())) return;
    const nextCleanSince = chosenDate.toISOString();
    const cleanMs = chosenDate.getTime();
    const nowMs = now.getTime();
    const diffDays = Math.max(0, Math.floor((nowMs - cleanMs) / (1000 * 60 * 60 * 24)));
    const nextLongest = Math.max(practiceState.longestStreakDays, diffDays);

    const nextState: ThanhTinhState = {
      ...practiceState,
      cleanSince: nextCleanSince,
      longestStreakDays: nextLongest
    };
    if (!persistPracticeState(nextState)) return;
    showAdjustDateModal = false;
    playAwakeningBell();
  }

  // Close Screen & Stop Audio
  function handleClose() {
    openGeneration++;
    if (timerInterval) clearInterval(timerInterval);
    timerInterval = null;
    stopSosAlarm();
    stopTibetanSingingBowl();
    stopAudio();
    releaseWakeLock();
    onClose();
  }

  // Switch Tab & Handle SOS Siren & Awakening Bell & Audio Playback
  function switchTab(tab: ActiveTab) {
    if (activeTab === 'sos' && tab !== 'sos') {
      stopSosAlarm();
    }
    activeTab = tab;
    if (tab === 'sos') {
      stopAudio();
      startSosAlarm();
      playTibetanSingingBowl(3);
    } else if (tab === 'audio') {
      void playAudio();
    }
  }

  // Reactive effect when screen opens or closes
  let previousOpen = false;
  $effect(() => {
    if (!mounted) return;
    if (open && !previousOpen) {
      previousOpen = true;
      openGeneration++;
      now = new Date();
      void openAbstinence();
      timerInterval = setInterval(() => { refreshCheckInClock(new Date()); }, 1000);
    } else if (!open && previousOpen) {
      previousOpen = false;
      openGeneration++;
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;
      stopSosAlarm();
      stopTibetanSingingBowl();
      stopAudio();
      releaseWakeLock();
    }
  });

  // Listen to Escape key to exit cleanly
  $effect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  });

  // SOS Siren Alarm Web Audio Synthesizer (~2 minutes)
  function startSosAlarm() {
    stopSosAlarm();
    try {
      const browser = globalThis as typeof globalThis & { webkitAudioContext?: typeof AudioContext };
      const Context = globalThis.AudioContext ?? browser.webkitAudioContext;
      if (!Context) return;
      const ctx = new Context();
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      sosAudioCtx = ctx;

      const osc = ctx.createOscillator();
      const lfo = ctx.createOscillator();
      const lfoGain = ctx.createGain();
      const mainGain = ctx.createGain();

      osc.type = 'triangle';
      osc.frequency.setValueAtTime(750, ctx.currentTime);

      lfo.type = 'triangle';
      lfo.frequency.setValueAtTime(1.0, ctx.currentTime); // 1 Hz sweep
      lfoGain.gain.setValueAtTime(200, ctx.currentTime); // 550Hz - 950Hz siren tone

      lfo.connect(lfoGain);
      lfoGain.connect(osc.frequency);

      mainGain.gain.setValueAtTime(0.001, ctx.currentTime);
      mainGain.gain.linearRampToValueAtTime(0.22, ctx.currentTime + 0.3);

      osc.connect(mainGain);
      mainGain.connect(ctx.destination);

      osc.start();
      lfo.start();

      sosOscillator = osc;
      sosLfo = lfo;
      sosGainNode = mainGain;
      isSosAlarmPlaying = true;
      sosAlarmSecondsLeft = 120; // 2 minutes

      void holdWakeLock();

      if (sosAlarmInterval) clearInterval(sosAlarmInterval);
      sosAlarmInterval = setInterval(() => {
        if (sosAlarmSecondsLeft > 0) {
          sosAlarmSecondsLeft -= 1;
        } else {
          stopSosAlarm();
        }
      }, 1000);
    } catch {
      // AudioContext might fail on browsers requiring user gesture
    }
  }

  function stopSosAlarm() {
    stopTibetanSingingBowl();
    if (sosAlarmInterval) {
      clearInterval(sosAlarmInterval);
      sosAlarmInterval = null;
    }
    isSosAlarmPlaying = false;
    if (!isPlaying) releaseWakeLock();
    if (sosGainNode && sosAudioCtx) {
      try {
        sosGainNode.gain.linearRampToValueAtTime(0.001, sosAudioCtx.currentTime + 0.15);
      } catch {
        // ignore
      }
    }
    const oldCtx = sosAudioCtx;
    const oldOsc = sosOscillator;
    const oldLfo = sosLfo;
    sosAudioCtx = null;
    sosOscillator = null;
    sosLfo = null;
    sosGainNode = null;

    if (!oldCtx && !oldOsc && !oldLfo) return;
    setTimeout(() => {
      try { oldOsc?.stop(); } catch { /* ignore */ }
      try { oldOsc?.disconnect(); } catch { /* ignore */ }
      try { oldLfo?.stop(); } catch { /* ignore */ }
      try { oldLfo?.disconnect(); } catch { /* ignore */ }
      try { void oldCtx?.close(); } catch { /* ignore */ }
    }, 200);
  }

  // Check-in Trigger & Confirmation
  function linkTodayConduct(at = new Date()) {
    conductLinkError = !recordAbstinenceConduct(getVietnamIsoDate(at));
    if (!conductLinkError) onConductRecorded?.();
  }

  function handleRequestCheckIn() {
    const at = new Date();
    if (!refreshCheckInClock(at, true)) return;
    if (practiceState.lastCheckInDate === getVietnamIsoDate(at)) { linkTodayConduct(at); return; }
    showCheckInModal = true;
  }

  async function confirmDailyCheckIn() {
    showCheckInModal = false;
    const at = new Date();
    if (!refreshCheckInClock(at, true)) return;
    if (practiceState.lastCheckInDate === getVietnamIsoDate(at)) { linkTodayConduct(at); return; }
    const delta = practiceState.pendingResistedCount;
    let nextHasRecentRelapse = practiceState.hasRecentRelapse;
    let nextConsecutive = practiceState.consecutiveCheckInsSinceRelapse;

    if (practiceState.hasRecentRelapse) {
      nextConsecutive += 1;
      if (nextConsecutive >= 2) {
        nextHasRecentRelapse = false;
        nextConsecutive = 2;
      }
    }

    const nextState: ThanhTinhState = {
      ...applyDailyThanhTinhCheckIn(practiceState, at),
      pendingResistedCount: 0,
      hasRecentRelapse: nextHasRecentRelapse,
      consecutiveCheckInsSinceRelapse: nextConsecutive
    };
    if (!persistPracticeState(nextState)) return;
    recordPracticeParticipation('purity','recorded');
    linkTodayConduct(at);
    playAwakeningBell();

    // Single request to server at end of day
    const res = await syncDailyThanhTinhProgress(calculateThanhTinhStats(nextState, at, isEn).totalDays, delta);
    communityStats = res;
  }

  // SOS Urge Resisted (saved instantly on device, zero server spam)
  async function handleUrgeResistedSuccess() {
    const nextState: ThanhTinhState = {
      ...practiceState,
      resistedUrgesCount: practiceState.resistedUrgesCount + 1,
      pendingResistedCount: practiceState.pendingResistedCount + 1
    };
    if (!persistPracticeState(nextState)) return;

    // Cap nhat lac quan ngay tren thiet bi
    communityStats = {
      ...communityStats,
      totalUrgesResisted: communityStats.totalUrgesResisted + 1
    };
    saveCachedCommunityStats(communityStats);

    stopSosAlarm();
    playAwakeningBell();
    await alertInApp(tt.sos.resistedSuccessAlert);
    switchTab('overview');
  }

  // Relapse & Reset
  function handleConfirmRelapse() {
    const currentDiffDays = stats.totalDays;
    const nextLongest = Math.max(practiceState.longestStreakDays, currentDiffDays);
    const nextState: ThanhTinhState = {
      ...practiceState,
      cleanSince: new Date().toISOString(),
      checkInRunStartedAt: null,
      longestStreakDays: nextLongest,
      lastCheckInDate: null,
      hasRecentRelapse: true,
      consecutiveCheckInsSinceRelapse: 0,
      relapseHistory: [
        ...practiceState.relapseHistory,
        {
          date: new Date().toISOString(),
          reason: relapseReason,
          note: relapseNote
        }
      ]
    };
    if (!persistPracticeState(nextState)) return;
    showRelapseModal = false;
    relapseNote = '';
    stopSosAlarm();
    switchTab('repentance');
  }
</script>

{#if open}
  <div
    class="thanh-tinh-overlay practice-theme reference-view"
    use:resetViewScroll={activeTab}
    class:audio-view={practiceState.joined && activeTab === 'audio'}
    data-practice="clarity"
    class:sos-alarm-pulsing={activeTab === 'sos' && isSosAlarmPlaying}
    role="dialog"
    aria-modal="true"
    aria-labelledby="thanh-tinh-title"
  >
    <div class="thanh-tinh-container">
      <!-- HEADER -->
      <header class="tt-header">
        <button type="button" class="btn-back" onclick={handleClose} aria-label={tt.header.back}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <line x1="19" y1="12" x2="5" y2="12"></line>
            <polyline points="12 19 5 12 12 5"></polyline>
          </svg>
          <span>{tt.header.back}</span>
        </button>

        <div class="tt-title-box">
          <h1 id="thanh-tinh-title" class="tt-main-title">
            <span class="tt-title-icon">🛡️</span>
            {tt.header.title}
          </h1>
          <p class="tt-subtitle">
            {tt.header.subtitle}
          </p>
        </div>

            <details class="clarity-settings" bind:open={claritySettingsOpen}>
              <summary aria-label={isEn ? 'Settings' : PRECEPT_UI.Settings} onkeydown={e => { if(e.key === 'Escape') claritySettingsOpen = false; }}><Settings size={24}/></summary>
              <div><button type="button" onclick={() => themeStore.toggle()}>{localeStore.t.header.themeToggle}</button></div>
            </details>
      </header>

      {#if storageError}<p class="storage-error" role="alert">{tt.storageError}</p>{/if}
      {#if conductLinkError}<div class="storage-error" role="status"><p>{tt.conductLinkError}</p><button type="button" onclick={() => linkTodayConduct()}>{tt.retryConductLink}</button></div>{/if}
      {#if !practiceState.joined}
        <!-- ONBOARDING CHO NGƯỜI DÙNG MỚI -->
        <div class="tt-onboarding-pane">
          <div class="tt-onboarding-card">
            <div class="onboarding-badge-icon">{tt.onboarding.badge}</div>
            <h2 class="onboarding-heading">{tt.onboarding.heading}</h2>
            <p class="onboarding-question">
              {tt.onboarding.question}
            </p>
            <p class="onboarding-subtext">
              {tt.onboarding.subtext}
            </p>

            <div class="onboarding-actions">
              <button type="button" class="btn-onboarding-join" onclick={handleConfirmJoinProgram}>
                {tt.onboarding.joinBtn}
              </button>
              <button type="button" class="btn-onboarding-back" onclick={handleClose}>
                {tt.onboarding.backBtn}
              </button>
            </div>

            <div class="onboarding-privacy-footer">
              {tt.onboarding.privacy}
            </div>
          </div>
        </div>
      {:else}
        <!-- NAVIGATION TABS -->
        <nav class="tt-tabs-nav" aria-label={tt.header.title}>
          <button
            type="button"
            class="tt-tab-btn"
            class:active={activeTab === 'overview'}
            aria-pressed={activeTab === 'overview'}
            onclick={() => switchTab('overview')}
          >
            <PracticeIcon index={10} size={26} />
            <span class="tab-label">{tt.audio.tabOverview}</span>
          </button>

          <button
            type="button"
            class="tt-tab-btn"
            class:active={activeTab === 'progress'}
            aria-pressed={activeTab === 'progress'}
            onclick={() => switchTab('progress')}
          >
            <PracticeIcon index={24} size={26} />
            <span class="tab-label">{tt.audio.tabProgress}</span>
          </button>

          <button
            type="button"
            class="tt-tab-btn tt-tab-btn--sos"
            class:active={activeTab === 'sos'}
            aria-pressed={activeTab === 'sos'}
            onclick={() => switchTab('sos')}
          >
            <PracticeIcon index={18} size={26} />
            <span class="tab-label">{tt.audio.tabSos}</span>
          </button>

          <button
            type="button"
            class="tt-tab-btn"
            class:active={activeTab === 'audio'}
            aria-pressed={activeTab === 'audio'}
            onclick={() => switchTab('audio')}
          >
            <PracticeIcon index={17} size={26} />
            <span class="tab-label">{tt.audio.tabAudio}</span>
          </button>

          <button
            type="button"
            class="tt-tab-btn"
            class:active={activeTab === 'diet'}
            aria-pressed={activeTab === 'diet'}
            onclick={() => switchTab('diet')}
          >
            <PracticeIcon index={19} size={26} />
            <span class="tab-label">{tt.tabs.diet}</span>
          </button>

          <button
            type="button"
            class="tt-tab-btn"
            class:active={activeTab === 'repentance'}
            aria-pressed={activeTab === 'repentance'}
            onclick={() => switchTab('repentance')}
          >
            <PracticeIcon index={20} size={26} />
            <span class="tab-label">{tt.tabs.repentance}</span>
          </button>
        </nav>

      <!-- TAB 1: OVERVIEW -->
      {#if activeTab === 'overview'}
        <div class="tt-tab-pane">
          <!-- POST-RELAPSE ENCOURAGEMENT WARNING BANNER -->
          {#if practiceState.hasRecentRelapse && practiceState.consecutiveCheckInsSinceRelapse < 2}
            <div class="relapse-warning-banner" role="alert">
              <div class="relapse-warning-header">
                <span class="relapse-warning-icon">🕊️</span>
                <div class="relapse-warning-text">
                  <strong>{tt.overview.relapseWarningTitle}</strong>
                  <p>
                    {tt.overview.relapseWarningText}
                  </p>
                </div>
              </div>
              <div class="relapse-recovery-tracker">
                <div class="recovery-status-line">
                  <span>{tt.overview.recoveryProgressLabel}</span>
                  <strong>{tt.overview.recoveryStatus(practiceState.consecutiveCheckInsSinceRelapse)}</strong>
                </div>
                <div class="recovery-track-bar">
                  <div
                    class="recovery-track-fill"
                    style="width: {(practiceState.consecutiveCheckInsSinceRelapse / 2) * 100}%"
                  ></div>
                </div>
              </div>
            </div>
          {/if}

          <!-- THÔNG BÁO KIÊNG DÂM TỐI GIẢN (CHỈ HIỂN THỊ KHI GẶP NGÀY VÍA, THẬP TRAI HOẶC THỌ KHANG BẢO GIÁM) -->
          {#if abstinence.isAbstinenceDay}
            <div class="tt-abstinence-alert" role="alert">
              <span class="tt-abstinence-icon" aria-hidden="true">⚠️</span>
              <p class="tt-abstinence-text">
                {tt.overview.abstinenceAlert(abstinence.dayTitle, abstinence.harmSummary)}
              </p>
            </div>
          {/if}

          <!-- COMMUNITY CARD -->
          <div class="community-banner">
            <div class="comm-stats-row">
              <div class="comm-stat-item">
                <span class="comm-stat-icon">👥</span>
                <div>
                  <span class="comm-stat-num">{communityStats.participantCount.toLocaleString()}</span>
                  <span class="comm-stat-desc">{tt.overview.communityPractitioners}</span>
                </div>
              </div>
              <div class="comm-stat-item">
                <span class="comm-stat-icon">🛡️</span>
                <div>
                  <span class="comm-stat-num">{communityStats.totalUrgesResisted.toLocaleString()}</span>
                  <span class="comm-stat-desc">{tt.overview.communityUrgesResisted}</span>
                </div>
              </div>
            </div>

            <div class="comm-pledge-action">
              {#if !practiceState.joined}
                <button type="button" class="btn-pledge-cta" onclick={() => showPledgeModal = true}>
                  {tt.overview.pledgeCta}
                </button>
              {:else}
                <div class="pledge-status-badge">
                  <span class="check-icon">✓</span>
                  <span>{tt.overview.pledgeStatus}</span>
                </div>
              {/if}
            </div>

            <p class="comm-privacy-note">
              {tt.overview.privacyNote}
            </p>
          </div>

          <!-- STREAK CARD -->
          <div class="streak-card">
            <div class="streak-kicker">{tt.overview.streakKicker}</div>

            <div class="streak-circle-wrap">
              <div class="streak-main-counter">
                <span class="streak-days-number">{stats.checkInStreakDays}</span>
                <span class="streak-days-label">{tt.overview.daysLabel}</span>
              </div>
              <div class="streak-sub-clock">
                {stats.checkInHoursRemainder.toString().padStart(2, '0')} {tt.overview.hoursLabel} : {stats.checkInMinutesRemainder.toString().padStart(2, '0')} {tt.overview.minutesLabel} : {stats.checkInSecondsRemainder.toString().padStart(2, '0')} {tt.overview.secondsLabel}
              </div>
            </div>

            <!-- ACTION ROW -->
            <div class="streak-actions-row">
              <button
                type="button"
                class="btn-checkin"
                class:checked-in={isCheckedInToday}
                onclick={handleRequestCheckIn}
              >
                {isCheckedInToday ? tt.overview.checkInDone : tt.overview.checkInAction}
              </button>

              <button type="button" class="btn-sos-trigger" onclick={() => switchTab('sos')}>
                {tt.overview.emergencySosCta}
              </button>

              <button type="button" class="btn-relapse-trigger" onclick={() => showRelapseModal = true}>
                {tt.overview.relapseCta}
              </button>
            </div>

            <!-- QUY TẮC TỰ GIÁC ĐIỂM DANH (GIAO DIỆN CHÍNH) -->
            <div class="checkin-rule-note">
              <strong>{tt.overview.checkInRuleTitle}</strong> {tt.overview.checkInRuleText}
            </div>

            <div class="streak-footer-stats">
              <div class="stat-pill">
                <span>{tt.overview.longestStreakLabel}</span>
                <strong>{stats.checkInEffectiveLongestStreak} {tt.progress.daysUnit}</strong>
              </div>
              <div class="stat-pill">
                <span>{tt.overview.resistedCountLabel}</span>
                <strong>{practiceState.resistedUrgesCount}</strong>
              </div>
              <button
                type="button"
                class="stat-pill stat-pill--btn"
                onclick={openAdjustDateModal}
                title={tt.overview.adjustDateTitle}
              >
                <span>{tt.overview.startedFromLabel}</span>
                <strong>{formatVietnamDate(practiceState.cleanSince, localeStore.current)} {tt.overview.adjustDateAction}</strong>
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- TAB: TIẾN ĐỘ CỦA TÔI -->
      {#if activeTab === 'progress'}
        <div class="tt-tab-pane progress-pane">
          <!-- PROGRESS HERO BANNER -->
          <div class="progress-hero-card">
            <div class="progress-hero-header">
              <span class="progress-hero-icon">📈</span>
              <div>
                <h2>{tt.progress.heading}</h2>
                <p>{tt.progress.subheading}</p>
              </div>
            </div>

            <div class="progress-current-status-box">
              <div class="p-status-col">
                <span class="p-status-label">{tt.progress.currentStreak}</span>
                <strong class="p-status-val p-status-val--highlight">{stats.checkInStreakDays} {tt.progress.daysUnit}</strong>
              </div>
            </div>
            <p>{isEn ? 'Existing abstinence history is preserved. Five-precept badges are in the main overview.' : 'Lịch sử tiết dục được giữ nguyên. Huy hiệu giữ Ngũ giới nằm tại trang tổng quan.'}</p>
          </div>
        </div>
      {/if}

      <!-- TAB 2: CỨU NGUY KHẨN CẤP (SOS) -->
      {#if activeTab === 'sos'}
        <div class="tt-tab-pane sos-pane">
          <!-- SOS SIREN ALARM STATUS BAR -->
          {#if isSosAlarmPlaying}
            <div class="sos-alarm-strobe-banner" role="alert">
              <div class="alarm-siren-flashing">🚨</div>
              <div class="alarm-banner-text">
                <strong>{tt.sos.alarmTitle}</strong>
                <p>
                  {tt.sos.alarmDesc(Math.floor(sosAlarmSecondsLeft / 60).toString().padStart(2, '0'), (sosAlarmSecondsLeft % 60).toString().padStart(2, '0'))}
                </p>
              </div>
              <button type="button" class="btn-toggle-siren" onclick={stopSosAlarm} title={tt.sos.muteSiren}>
                {tt.sos.muteSiren}
              </button>
            </div>
          {:else}
            <div class="sos-alarm-stopped-bar">
              <span>{tt.sos.sirenStoppedNote}</span>
              <button type="button" class="btn-restart-siren" onclick={() => { startSosAlarm(); playTibetanSingingBowl(3); }}>
                {tt.sos.restartSiren}
              </button>
            </div>
          {/if}

          <!-- EMERGENCY ALERT HEADER -->
          <div class="sos-banner" class:alarm-active={isSosAlarmPlaying}>
            <div class="sos-banner-icon">🚨</div>
            <div class="sos-banner-content">
              <h2>{tt.sos.bannerTitle}</h2>
              <p>{tt.sos.bannerSubtitle}</p>
            </div>
            <button type="button" class="btn-bell-alarm" onclick={() => playTibetanSingingBowl(3)} title={tt.sos.strikeBowlBtn}>
              {tt.sos.strikeBowlBtn}
            </button>
          </div>

          <!-- 1. TÂM PHÁP CẢNH TỈNH -->
          <div class="sos-card">
            <div class="sos-card-header">
              <span class="step-num">{tt.sos.step1Num}</span>
              <div>
                <h3>{tt.sos.step1Title}</h3>
                <span class="step-desc" style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">{tt.sos.step1Desc}</span>
              </div>
            </div>

            <div class="witness-grid">
              <div class="witness-box witness-box--buddha">
                <div class="witness-icon">🪷</div>
                <h4>{tt.sos.witnessBuddhaTitle}</h4>
                <p style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">{tt.sos.witnessBuddhaDesc}</p>
              </div>

              <div class="witness-box witness-box--deva">
                <div class="witness-icon">⚔️</div>
                <h4>{tt.sos.witnessDevaTitle}</h4>
                <p style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">{tt.sos.witnessDevaDesc}</p>
              </div>

              <div class="witness-box witness-box--ancestors">
                <div class="witness-icon">🕯️</div>
                <h4>{tt.sos.witnessAncestorsTitle}</h4>
                <p style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">{tt.sos.witnessAncestorsDesc}</p>
              </div>

              <div class="witness-box witness-box--demons">
                <div class="witness-icon">👺</div>
                <h4>{tt.sos.witnessDemonsTitle}</h4>
                <p style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">{tt.sos.witnessDemonsDesc}</p>
              </div>
            </div>

            <!-- CHI TIẾT HẬU QUẢ & QUẢ BÁO: THỦ DÂM, TÀ DÂM, NGOẠI TÌNH -->
            <div class="sos-consequence-section">
              <div class="sos-consequence-header">
                <span class="sos-consequence-badge">{tt.sos.consequencesBadge}</span>
                <h3>{tt.sos.consequencesTitle}</h3>
                <p style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">
                  {tt.sos.consequencesIntro}
                </p>
              </div>

              <div class="consequence-cards-grid">
                <!-- CARD 1: THỦ DÂM -->
                <div class="consequence-card consequence-card--thudam">
                  <div class="c-card-top">
                    <span class="c-card-icon">🔴</span>
                    <div class="c-card-title-wrap">
                      <h4>{tt.sos.card1Title}</h4>
                      <span class="c-card-tag">{tt.sos.card1Tag}</span>
                    </div>
                  </div>
                  <ul class="c-card-list">
                    {#each tt.sos.card1Points as pt}
                      <li style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">{pt}</li>
                    {/each}
                  </ul>
                </div>

                <!-- CARD 2: TÀ DÂM -->
                <div class="consequence-card consequence-card--tadam">
                  <div class="c-card-top">
                    <span class="c-card-icon">🟠</span>
                    <div class="c-card-title-wrap">
                      <h4>{tt.sos.card2Title}</h4>
                      <span class="c-card-tag">{tt.sos.card2Tag}</span>
                    </div>
                  </div>
                  <ul class="c-card-list">
                    {#each tt.sos.card2Points as pt}
                      <li style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">{pt}</li>
                    {/each}
                  </ul>
                </div>

                <!-- CARD 3: NGOẠI TÌNH -->
                <div class="consequence-card consequence-card--ngoaitinh">
                  <div class="c-card-top">
                    <span class="c-card-icon">⛔</span>
                    <div class="c-card-title-wrap">
                      <h4>{tt.sos.card3Title}</h4>
                      <span class="c-card-tag">{tt.sos.card3Tag}</span>
                    </div>
                  </div>
                  <ul class="c-card-list">
                    {#each tt.sos.card3Points as pt}
                      <li style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">{pt}</li>
                    {/each}
                  </ul>
                </div>
              </div>

              <div class="consequence-bottom-callout" style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">
                {tt.sos.awakenCallout}
              </div>
            </div>
          </div>

          <!-- 2. THÂN PHÁP HẠ HỎA (VẬT LÝ) -->
          <div class="sos-card">
            <div class="sos-card-header">
              <span class="step-num">{tt.sos.step2Num}</span>
              <div>
                <h3>{tt.sos.step2Title}</h3>
                <span class="step-desc" style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">{tt.sos.step2Desc}</span>
              </div>
            </div>

            <div class="physical-actions-grid">
              <div class="phys-item">
                <div class="phys-header">
                  <span class="phys-icon">🧊</span>
                  <h4>{tt.sos.phys1Title}</h4>
                </div>
                <p style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">{tt.sos.phys1Desc}</p>
              </div>

              <div class="phys-item">
                <div class="phys-header">
                  <span class="phys-icon">🚿</span>
                  <h4>{tt.sos.phys2Title}</h4>
                </div>
                <p style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">{tt.sos.phys2Desc}</p>
              </div>

              <div class="phys-item">
                <div class="phys-header">
                  <span class="phys-icon">🚪</span>
                  <h4>{tt.sos.phys3Title}</h4>
                </div>
                <p style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">{tt.sos.phys3Desc}</p>
              </div>
            </div>

            <!-- INTERACTIVE SQUAT COUNTER -->
            <div class="squat-counter-box">
              <div class="squat-title">
                <span>🏋️</span>
                <div>
                  <strong>{tt.sos.squatCounterTitle}</strong>
                  <p style="text-align: justify !important; text-justify: inter-word !important; text-align-last: left !important;">{tt.sos.squatCounterDesc}</p>
                </div>
              </div>

              <div class="squat-counter-display">
                <div class="squat-number">{squatCount} <span class="squat-max">/ {squatGoal}</span></div>
                <div class="squat-controls">
                  <button type="button" class="btn-squat-add" onclick={() => squatCount = Math.min(squatGoal, squatCount + 5)}>
                    {tt.sos.squatAdd5}
                  </button>
                  <button type="button" class="btn-squat-add btn-squat-add--single" onclick={() => squatCount = Math.min(squatGoal, squatCount + 1)}>
                    {tt.sos.squatAdd1}
                  </button>
                  <button type="button" class="btn-squat-reset" onclick={() => squatCount = 0}>
                    {tt.sos.squatReset}
                  </button>
                </div>
              </div>
              <div class="squat-progress-bar">
                <div class="squat-progress-fill" style="width: {(squatCount / squatGoal) * 100}%"></div>
              </div>
            </div>
          </div>

          <!-- 3. KHẨU PHÁP TRÌ CHÚ -->
          <div class="sos-card">
            <div class="sos-card-header">
              <span class="step-num">{tt.sos.step3Num}</span>
              <div>
                <h3>{tt.sos.step3Title}</h3>
                <span class="step-desc">{tt.sos.step3Desc}</span>
              </div>
            </div>

            <div class="mantra-actions">
              <button type="button" class="btn-listen-now-cta" onclick={() => switchTab('audio')}>
                {tt.sos.listenAudioCta}
              </button>

              <div class="mantra-text-box">
                <div class="mantra-label">{tt.sos.heartMantraTitle}</div>
                <div class="mantra-content">
                  {tt.sos.heartMantraContent}
                </div>
              </div>
            </div>
          </div>

          <!-- SUCCESS BUTTON -->
          <div class="sos-finish-box">
            <button type="button" class="btn-resisted-success" onclick={handleUrgeResistedSuccess}>
              {tt.sos.resistedSuccessBtn}
            </button>
            <p>{tt.sos.resistedSuccessDesc}</p>
          </div>

          <!-- RELAPSE BUTTON & STRICT CHECK-IN RULE -->
          <div class="sos-relapse-action-box">
            <button
              type="button"
              class="btn-relapse-surrender"
              onclick={() => {
                relapseReason = isEn ? 'Relapsed, could not resist craving (Masturbation)' : 'Lỡ sa ngã, không kìm được cơn dục (Thủ dâm)';
                showRelapseModal = true;
              }}
            >
              {tt.sos.surrenderBtn}
            </button>
          </div>
        </div>
      {/if}

      <!-- TAB 3: NGHE CHÚ LĂNG NGHIÊM (AUDIO PLAYER) -->
      {#if activeTab === 'audio'}
        <div class="tt-tab-pane audio-pane">
          <div class="audio-hero-card">
            <figure class="audio-buddha-art">
              <img
                src="/images/le-phat/van-thu-su-loi.webp"
                alt={`${tt.audio.nameLine1} ${tt.audio.nameLine2}`}
                class="audio-buddha-img"
                onerror={(e) => {
                  const target = e.currentTarget as HTMLImageElement;
                  target.src = '/images/le-phat/quan-the-am-approved.webp';
                }}
              />
              <figcaption><span>{tt.audio.nameLine1}</span> <span>{tt.audio.nameLine2}</span></figcaption>
            </figure>

            <div class="audio-info">
              <h2 class="audio-title">{tt.audio.title}</h2>
              <p class="audio-desc">
                {tt.audio.desc}
              </p>

              <!-- TIMER COUNTDOWN -->
              <div class="audio-timer-badge">
                <span>{tt.audio.remainingLabel}</span>
                <strong class:unlimited={timerTargetMinutes === 0}>{timerTargetMinutes === 0 ? tt.audio.timerUnlimited : formatTime(isTimerActive ? timerSecondsLeft : timerTargetMinutes * 60)}</strong>
                <small>{timerTargetMinutes === 0 ? tt.audio.timerUnlimited : tt.audio.sessionLabel(timerTargetMinutes)}</small>
              </div>
            </div>

            <!-- AUDIO PLAYER CONTROLS -->
            <div class="player-controls-box">
              <div class="player-time-row">
                <span>{formatTime(currentTime)}</span>
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  class="progress-slider"
                  aria-label={tt.audio.seekAria}
                  oninput={(e) => {
                    const target = e.target as HTMLInputElement;
                    void seekAudio(Number(target.value));
                  }}
                />
                <span>{formatTime(duration)}</span>
              </div>

              {#if audioPlaybackError}<p role="alert">{audioPlaybackError}</p>{/if}

              <div class="player-buttons-row">
                <button type="button" class="btn-play-pause-main" onclick={toggleAudio}>
                  {#if isPlaying}<Pause size={24} aria-hidden="true" /><span>{tt.audio.pauseBtn}</span>
                  {:else}<Play size={24} aria-hidden="true" /><span>{tt.audio.playBtn}</span>{/if}
                </button>
                <button
                  type="button"
                  class="btn-loop"
                  class:active={isLooping}
                  role="switch"
                  aria-checked={isLooping}
                  onclick={toggleLoop}
                  title={isLooping ? tt.audio.loopActiveTitle : tt.audio.loopInactiveTitle}
                >
                  <Repeat2 size={22} aria-hidden="true" />
                  <span>{tt.audio.loopLabel}</span><span class="loop-state" aria-hidden="true"></span>
                </button>

                <div class="volume-control">
                  <Volume2 size={22} aria-hidden="true" />
                  <input
                    type="range"
                    min="0"
                    max="1"
                    step="0.05"
                    value={volume}
                    oninput={handleVolumeChange}
                    aria-label={tt.audio.volumeAria}
                  />
                </div>
              </div>

              <!-- TIMER SELECTOR -->
              <div class="timer-selector-row">
                <span class="label">{tt.audio.timerSelectorLabel}</span>
                {#each [15, 30, 45, 0] as mins (mins)}
                  <button
                    type="button"
                    class="btn-timer-chip"
                    class:selected={timerTargetMinutes === mins}
                    aria-pressed={timerTargetMinutes === mins}
                    onclick={() => {
                      timerTargetMinutes = mins;
                      if (isPlaying && mins > 0) startCountdownTimer();
                      if (mins === 0) stopCountdownTimer();
                    }}
                  >
                    {mins === 0 ? tt.audio.timerUnlimited : tt.audio.timerMins(mins)}
                  </button>
                {/each}
              </div>
            </div>
          </div>

          <!-- ORIGIN STORY & TEXT -->
          <div class="lang-nghiem-text-card">
            <h3>{tt.audio.storyTitle}</h3>
            <p>
              {tt.audio.storyP1}
            </p>
            <p>
              {tt.audio.storyP2}
            </p>

            <div class="scripture-read-link">
              <button type="button" class="btn-open-rich-text" onclick={onNavigateToTriChu}>
                {tt.audio.reciteScriptureBtn}
              </button>
            </div>
          </div>
        </div>
      {/if}

      <!-- TAB 4: ẨM THỰC DƯỠNG SINH TIẾT DỤC -->
      {#if activeTab === 'diet'}
        <div class="tt-tab-pane diet-pane">
          <div class="diet-header-card">
            <span class="diet-icon">🥗</span>
            <div>
              <h2>{tt.diet.title}</h2>
              <p>{tt.diet.subtitle}</p>
            </div>
          </div>

          <div class="diet-rules-grid">
            <!-- RULE 1 -->
            <div class="diet-rule-card diet-rule-card--meat">
              <div class="rule-badge">{tt.diet.badgeLimit}</div>
              <h3>{tt.diet.meatTitle}</h3>
              <p>{tt.diet.meatDesc}</p>
            </div>

            <!-- RULE 2 -->
            <div class="diet-rule-card diet-rule-card--vegan">
              <div class="rule-badge rule-badge--best">{tt.diet.badgeRecommend}</div>
              <h3>{tt.diet.veganTitle}</h3>
              <p>{tt.diet.veganDesc}</p>
            </div>

            <!-- RULE 3 -->
            <div class="diet-rule-card diet-rule-card--forbidden">
              <div class="rule-badge rule-badge--danger">{tt.diet.badgeForbidden}</div>
              <h3>{tt.diet.pungentTitle}</h3>
              <p>
                {tt.diet.pungentDesc}
              </p>
            </div>
          </div>

          <!-- LIFESTYLE TIPS -->
          <div class="lifestyle-card">
            <h3>{tt.diet.lifestyleTitle}</h3>
            <ul class="lifestyle-list">
              <li>
                <strong>{tt.diet.rule1Title}</strong> {tt.diet.rule1Desc}
              </li>
              <li>
                <strong>{tt.diet.rule2Title}</strong> {tt.diet.rule2Desc}
              </li>
              <li>
                <strong>{tt.diet.rule3Title}</strong> {tt.diet.rule3Desc}
              </li>
            </ul>
          </div>
        </div>
      {/if}

      <!-- TAB 5: SÁM HỐI & TÁI LẬP (REPENTANCE) -->
      {#if activeTab === 'repentance'}
        <div class="tt-tab-pane repentance-pane">
          <div class="repent-header-card">
            <span class="repent-icon">🕊️</span>
            <div>
              <h2>{tt.repentance.title}</h2>
              <p>{tt.repentance.subtitle}</p>
            </div>
          </div>

          <div class="repent-quote-box">
            <p>
              {tt.repentance.quote}
            </p>
          </div>

          <!-- REPENTANCE RITUAL -->
          <div class="repent-ritual-card">
            <h3>{tt.repentance.ritualTitle}</h3>
            <div class="repent-script">
              <div class="repent-invocations">
                {#each tt.repentance.invocations as inv}
                  <p><strong>{inv}</strong></p>
                {/each}
              </div>
              <p>
                {tt.repentance.ritualP1}
              </p>
              <p>
                {tt.repentance.ritualP2}
              </p>
              <p>
                {tt.repentance.ritualP3}
              </p>
              <p class="repent-closing">
                <strong>{tt.repentance.ritualClosing}</strong>
              </p>
            </div>
          </div>

          <!-- ACTIONABLE RECOVERY -->
          <div class="repent-recovery-actions">
            <h4>{tt.repentance.recoveryHeading}</h4>
            <div class="recovery-steps">
              <div class="rec-step">{tt.repentance.recStep1}</div>
              <div class="rec-step">{tt.repentance.recStep2}</div>
              <div class="rec-step">{tt.repentance.recStep3}</div>
            </div>

            <div class="reset-streak-box">
              <button type="button" class="btn-reset-streak-cta" onclick={() => showRelapseModal = true}>
                {tt.repentance.resetStreakCta}
              </button>
            </div>
          </div>
        </div>
      {/if}
    {/if}
    </div>
  </div>

  <!-- MODAL: PHÁT NGUYỆN THAM GIA CÙNG ĐẠI CHÚNG -->
  {#if showPledgeModal}
    <div
      class="modal-backdrop reference-view"
      onclick={() => showPledgeModal = false}
      onkeydown={(e) => { if (e.key === 'Escape') showPledgeModal = false; }}
      role="presentation"
    >
      <div
        class="modal-dialog"
        data-dialog-glass
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="pledge-modal-title"
        tabindex="-1"
      >
        <h3 id="pledge-modal-title">{tt.modals.pledgeTitle}</h3>
        <p class="pledge-intro">
          {tt.modals.pledgeIntro(communityStats.participantCount.toLocaleString())}
        </p>

        <div class="pledge-vow-box">
          <p>
            {tt.modals.pledgeVow}
          </p>
        </div>

        <div class="pledge-privacy-reassure">
          {tt.modals.pledgePrivacy}
        </div>

        <div class="modal-actions dialog-actions-balanced">
          <button type="button" class="btn-cancel" onclick={() => showPledgeModal = false}>
            {tt.modals.pledgeCancel}
          </button>
          <button type="button" class="btn-confirm-pledge" onclick={handleConfirmPledge}>
            {tt.modals.pledgeConfirm}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- MODAL: GHI NHẬN SA NGÃ & RESET CHUỖI -->
  {#if showRelapseModal}
    <div
      class="modal-backdrop reference-view"
      onclick={() => showRelapseModal = false}
      onkeydown={(e) => { if (e.key === 'Escape') showRelapseModal = false; }}
      role="presentation"
    >
      <div
        class="modal-dialog"
        data-dialog-glass
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="relapse-modal-title"
        tabindex="-1"
      >
        <h3 id="relapse-modal-title">{tt.modals.relapseTitle}</h3>
        <p class="relapse-intro">
          {tt.modals.relapseIntro}
        </p>

        <div class="form-group">
          <label for="relapse-reason-select">{tt.modals.relapseReasonLabel}</label>
          <select id="relapse-reason-select" bind:value={relapseReason} class="form-select">
            {#each tt.modals.relapseReasons as r}
              <option value={r.value}>{r.label}</option>
            {/each}
          </select>
        </div>

        <div class="form-group">
          <label for="relapse-note-input">{tt.modals.relapseNoteLabel}</label>
          <input
            id="relapse-note-input"
            type="text"
            placeholder={tt.modals.relapseNotePlaceholder}
            bind:value={relapseNote}
            class="form-input"
          />
        </div>

        <div class="modal-actions dialog-actions-balanced">
          <button type="button" class="btn-cancel" onclick={() => showRelapseModal = false}>
            {tt.modals.relapseCancel}
          </button>
          <button type="button" class="btn-confirm-relapse" onclick={handleConfirmRelapse}>
            {tt.modals.relapseConfirm}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- MODAL: XÁC NHẬN ĐIỂM DANH THANH TỊNH HÔM NAY -->
  {#if showCheckInModal}
    <div
      class="modal-backdrop reference-view"
      onclick={() => showCheckInModal = false}
      onkeydown={(e) => { if (e.key === 'Escape') showCheckInModal = false; }}
      role="presentation"
    >
      <div
        class="modal-dialog checkin-modal-dialog"
        data-dialog-glass
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="checkin-modal-title"
        tabindex="-1"
      >
        <div class="checkin-modal-icon">🙏</div>
        <h3 id="checkin-modal-title">{tt.modals.checkInTitle}</h3>

        <div class="checkin-question-box">
          <p class="checkin-question-text">
            {tt.modals.checkInQuestion}
          </p>
          <div class="checkin-solemn-warning">
            {tt.modals.checkInWarning}
          </div>
        </div>

        <div class="checkin-modal-actions dialog-actions-balanced">
          <button type="button" class="btn-confirm-checkin" onclick={confirmDailyCheckIn}>
            {tt.modals.checkInConfirm}
          </button>
          <button type="button" class="btn-cancel-checkin" onclick={() => showCheckInModal = false}>
            {tt.modals.checkInCancel}
          </button>
        </div>
      </div>
    </div>
  {/if}

  <!-- MODAL: ĐIỀU CHỈNH NGÀY BẮT ĐẦU THANH TỊNH -->
  {#if showAdjustDateModal}
    <div
      class="modal-backdrop reference-view"
      onclick={() => showAdjustDateModal = false}
      onkeydown={(e) => { if (e.key === 'Escape') showAdjustDateModal = false; }}
      role="presentation"
    >
      <div
        class="modal-dialog"
        data-dialog-glass
        onclick={(e) => e.stopPropagation()}
        onkeydown={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="adjust-date-modal-title"
        tabindex="-1"
      >
        <h3 id="adjust-date-modal-title">{tt.modals.adjustTitle}</h3>
        <p class="pledge-intro">
          {tt.modals.adjustIntro}
        </p>

        <div class="form-group">
          <label for="adjust-start-date-input">{tt.modals.adjustDateLabel}</label>
          <input
            id="adjust-start-date-input"
            type="date"
            lang={localeStore.current}
            max={todayStr}
            bind:value={adjustDateInput}
            class="form-input"
          />
        </div>

        <div class="pledge-privacy-reassure">
          {tt.modals.adjustPrivacy}
        </div>

        <div class="modal-actions dialog-actions-balanced">
          <button type="button" class="btn-cancel" onclick={() => showAdjustDateModal = false}>
            {tt.modals.adjustCancel}
          </button>
          <button type="button" class="btn-confirm-pledge" onclick={handleSaveAdjustDate}>
            {tt.modals.adjustConfirm}
          </button>
        </div>
      </div>
    </div>
  {/if}
{/if}

<style>
  .storage-error { color:var(--danger-text); margin:var(--radius-card); padding:var(--radius-control); border:1px solid var(--border); border-radius:var(--radius-control); }
  .storage-error p { margin:0; }
  .storage-error button { min-height:44px; padding:var(--radius-sm) var(--radius-control); margin-top:var(--radius-sm); border:1px solid var(--border); border-radius:var(--radius-control); background:var(--card); color:var(--text); font:inherit; cursor:pointer; }
  .thanh-tinh-overlay {
    position: fixed;
    inset: 0;
    z-index: 9999;
    background: #0f172a;
    color: #f1f5f9;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
    display: flex;
    flex-direction: column;
    font-family: system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    padding-top: var(--app-safe-top, env(safe-area-inset-top, 0px));
    padding-bottom: max(env(safe-area-inset-bottom, 0px), 16px);
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
  }

  .thanh-tinh-container {
    max-width: 960px;
    width: 100%;
    margin: 0 auto;
    padding: 14px 20px 60px;
    display: flex;
    flex-direction: column;
    gap: 20px;
    box-sizing: border-box;
  }

  /* HEADER */
  .tt-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid rgba(255, 255, 255, 0.1);
    position: relative;
    z-index: 20;
  }

  .btn-back {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    background: rgba(255, 255, 255, 0.12);
    border: 1px solid rgba(255, 255, 255, 0.22);
    color: #f1f5f9;
    padding: 8px 16px;
    min-height: 44px;
    min-width: 44px;
    border-radius: 999px;
    font-size: 14px;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    position: relative;
    z-index: 30;
    transition: all 0.15s ease;
  }

  .btn-back:hover {
    background: rgba(255, 255, 255, 0.22);
    transform: translateX(-2px);
  }

  .btn-back:active {
    background: rgba(255, 255, 255, 0.3);
    transform: scale(0.96);
  }

  .tt-title-box {
    text-align: center;
    flex: 1;
  }

  .tt-main-title {
    margin: 0;
    font-size: 22px;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: #14b8a6;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .tt-subtitle {
    margin: 2px 0 0;
    font-size: 13px;
    color: #94a3b8;
  }

  /* TABS NAV */
  .tt-tabs-nav {
    display: grid;
    grid-template-columns: repeat(6, 1fr);
    gap: 8px;
    width: 100%;
    padding-bottom: 4px;
  }

  .tt-tab-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 10px 10px;
    border-radius: 12px;
    background: rgba(255, 255, 255, 0.06);
    border: 1px solid rgba(255, 255, 255, 0.1);
    color: #cbd5e1;
    font-size: 13.5px;
    font-weight: 600;
    white-space: nowrap;
    cursor: pointer;
    transition: all 0.2s ease;
    text-align: center;
  }

  .tt-tab-btn:hover {
    background: rgba(255, 255, 255, 0.12);
  }

  .tt-tab-btn.active {
    background: #0d9488;
    color: #ffffff;
    border-color: #14b8a6;
    box-shadow: 0 4px 12px rgba(13, 148, 136, 0.35);
  }

  .tt-tab-btn--sos {
    color: #f87171;
    border-color: rgba(248, 113, 113, 0.3);
  }

  .tt-tab-btn--sos.active {
    background: #dc2626;
    color: #ffffff;
    border-color: #ef4444;
    box-shadow: 0 4px 14px rgba(220, 38, 38, 0.4);
  }

  /* PANE */
  .tt-tab-pane {
    display: flex;
    flex-direction: column;
    gap: 20px;
    animation: fadeIn 0.25s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(6px); }
    to { opacity: 1; transform: translateY(0); }
  }

  /* COMMUNITY BANNER */
  .community-banner {
    background: linear-gradient(135deg, rgba(13, 148, 136, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%);
    border: 1px solid rgba(20, 184, 166, 0.3);
    border-radius: 16px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 14px;
  }

  .comm-stats-row {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 16px;
  }

  .comm-stat-item {
    display: flex;
    align-items: center;
    gap: 12px;
  }

  .comm-stat-icon {
    font-size: 28px;
    width: 48px;
    height: 48px;
    display: grid;
    place-items: center;
    border-radius: 12px;
    background: rgba(20, 184, 166, 0.2);
  }

  .comm-stat-num {
    display: block;
    font-size: 22px;
    font-weight: 800;
    color: #5eead4;
  }

  .comm-stat-desc {
    display: block;
    font-size: 13px;
    color: #cbd5e1;
  }

  .btn-pledge-cta {
    width: 100%;
    padding: 12px 20px;
    border-radius: 12px;
    background: linear-gradient(135deg, #0d9488 0%, #0f766e 100%);
    color: #ffffff;
    border: none;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(13, 148, 136, 0.3);
    transition: transform 0.15s ease;
  }

  .btn-pledge-cta:hover {
    transform: translateY(-1px);
  }

  .pledge-status-badge {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 10px 16px;
    border-radius: 10px;
    background: rgba(16, 185, 129, 0.15);
    border: 1px solid rgba(16, 185, 129, 0.35);
    color: #6ee7b7;
    font-weight: 600;
    font-size: 14px;
  }

  .comm-privacy-note {
    margin: 0;
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.4;
  }

  /* STREAK CARD */
  .streak-card {
    background: rgba(30, 41, 59, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 20px;
    padding: 24px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 18px;
    text-align: center;
  }

  .streak-kicker {
    font-size: 13px;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: #14b8a6;
  }

  .streak-circle-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 200px;
    height: 200px;
    border-radius: 50%;
    background: radial-gradient(circle, rgba(13, 148, 136, 0.25) 0%, rgba(15, 23, 42, 0.9) 70%);
    border: 3px solid #14b8a6;
    box-shadow: 0 0 35px rgba(20, 184, 166, 0.25);
  }

  .streak-days-number {
    font-size: 64px;
    font-weight: 900;
    line-height: 1;
    color: #ffffff;
  }

  .streak-days-label {
    font-size: 14px;
    font-weight: 800;
    letter-spacing: 2px;
    color: #5eead4;
  }

  .streak-sub-clock {
    margin-top: 6px;
    font-size: 12px;
    color: #94a3b8;
    font-family: monospace;
  }

  /* MILESTONE BOX */





  .streak-actions-row {
    width: 100%;
    max-width: 580px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .btn-checkin {
    padding: 12px 18px;
    border-radius: 12px;
    background: #0284c7;
    color: #ffffff;
    border: none;
    font-size: 15px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-checkin.checked-in {
    background: rgba(16, 185, 129, 0.2);
    border: 1px solid #10b981;
    color: #6ee7b7;
    cursor: default;
  }

  .btn-sos-trigger {
    padding: 14px 20px;
    border-radius: 12px;
    background: linear-gradient(135deg, #dc2626 0%, #991b1b 100%);
    color: #ffffff;
    border: none;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.5px;
    cursor: pointer;
    box-shadow: 0 4px 18px rgba(220, 38, 38, 0.4);
    transition: transform 0.15s ease;
  }

  .btn-sos-trigger:hover {
    transform: translateY(-2px);
  }

  .streak-footer-stats {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 14px;
    flex-wrap: wrap;
    font-size: 13px;
    color: #94a3b8;
    padding-top: 8px;
  }

  .stat-pill {
    background: rgba(255, 255, 255, 0.06);
    padding: 4px 12px;
    border-radius: 999px;
  }

  .stat-pill strong {
    color: #f1f5f9;
  }

  .stat-pill--btn {
    border: 1px dashed rgba(255, 255, 255, 0.25);
    color: #cbd5e1;
    cursor: pointer;
    font-family: inherit;
    transition: all 0.15s ease;
  }

  .stat-pill--btn:hover {
    background: rgba(255, 255, 255, 0.12);
    border-color: #38bdf8;
    color: #38bdf8;
    transform: translateY(-1px);
  }

  .btn-relapse-trigger {
    padding: 13px 20px;
    border-radius: 12px;
    background: rgba(30, 41, 59, 0.85);
    border: 1px solid rgba(248, 113, 113, 0.4);
    color: #fca5a5;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
    transition: all 0.15s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 8px;
  }

  .btn-relapse-trigger:hover {
    background: rgba(220, 38, 38, 0.22);
    border-color: #ef4444;
    color: #ffffff;
    transform: translateY(-2px);
    box-shadow: 0 4px 14px rgba(220, 38, 38, 0.25);
  }

  /* MILESTONES SECTION */


  /* ONBOARDING */
  .tt-onboarding-pane {
    display: flex;
    justify-content: center;
    align-items: center;
    padding: 3rem 1rem;
    min-height: 480px;
  }

  .tt-onboarding-card {
    background: radial-gradient(circle at 50% 0%, rgba(59, 130, 246, 0.18) 0%, rgba(15, 23, 42, 0.95) 85%);
    border: 1px solid rgba(96, 165, 250, 0.35);
    box-shadow: 0 16px 48px rgba(0, 0, 0, 0.5), 0 0 30px rgba(59, 130, 246, 0.15);
    border-radius: 20px;
    padding: 2.5rem 2rem;
    max-width: 580px;
    width: 100%;
    text-align: center;
  }

  .onboarding-badge-icon {
    font-size: 3.5rem;
    margin-bottom: 0.75rem;
    animation: icon-float 2.5s infinite ease-in-out alternate;
  }

  @keyframes icon-float {
    0% { transform: translateY(0); }
    100% { transform: translateY(-6px); }
  }

  .onboarding-heading {
    font-size: 1.35rem;
    font-weight: 800;
    letter-spacing: 0.06em;
    color: #93c5fd;
    margin: 0 0 1rem 0;
  }

  .onboarding-question {
    font-size: 1.15rem;
    line-height: 1.5;
    font-weight: 700;
    color: #ffffff;
    margin: 0 0 1rem 0;
  }

  .onboarding-subtext {
    font-size: 0.92rem;
    line-height: 1.6;
    color: #94a3b8;
    margin: 0 0 1.75rem 0;
  }

  .onboarding-actions {
    display: flex;
    flex-direction: column;
    gap: 0.85rem;
    margin-bottom: 1.5rem;
  }

  .btn-onboarding-join {
    background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%);
    color: #ffffff;
    border: 1px solid rgba(147, 197, 253, 0.4);
    box-shadow: 0 6px 20px rgba(37, 99, 235, 0.4);
    border-radius: 12px;
    padding: 1rem 1.5rem;
    font-size: 1rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-onboarding-join:hover {
    background: linear-gradient(135deg, #1d4ed8 0%, #1e40af 100%);
    transform: translateY(-1px);
    box-shadow: 0 8px 24px rgba(37, 99, 235, 0.5);
  }

  .btn-onboarding-back {
    background: rgba(30, 41, 59, 0.7);
    color: #94a3b8;
    border: 1px solid rgba(148, 163, 184, 0.25);
    border-radius: 10px;
    padding: 0.75rem 1.25rem;
    min-height: 44px;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    transition: all 0.2s ease;
  }

  .btn-onboarding-back:hover {
    background: rgba(51, 65, 85, 0.8);
    color: #e2e8f0;
  }

  .onboarding-privacy-footer {
    font-size: 0.8rem;
    color: #64748b;
    line-height: 1.4;
  }

  /* PROGRESS TAB & HERO CARD */
  .progress-hero-card {
    background: radial-gradient(circle at 20% 0%, rgba(59, 130, 246, 0.12) 0%, rgba(30, 41, 59, 0.8) 100%);
    border: 1px solid rgba(96, 165, 250, 0.25);
    border-radius: 16px;
    padding: 1.25rem 1.5rem;
    margin-bottom: 1.25rem;
  }

  .progress-hero-header {
    display: flex;
    align-items: center;
    gap: 12px;
    margin-bottom: 1rem;
  }

  .progress-hero-icon {
    font-size: 28px;
  }

  .progress-hero-header h2 {
    font-size: 18px;
    font-weight: 800;
    color: #f1f5f9;
    margin: 0 0 2px 0;
  }

  .progress-hero-header p {
    font-size: 13px;
    color: #94a3b8;
    margin: 0;
  }

  .progress-current-status-box {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 12px;
    padding: 12px 14px;
    background: rgba(15, 23, 42, 0.6);
    border: 1px solid rgba(148, 163, 184, 0.15);
    border-radius: 12px;
    margin-bottom: 1rem;
  }

  .p-status-col {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }

  .p-status-label {
    font-size: 12px;
    color: #94a3b8;
    font-weight: 500;
  }

  .p-status-val {
    font-size: 14px;
    color: #e2e8f0;
    font-weight: 700;
    display: flex;
    align-items: center;
    gap: 6px;
  }


  .p-status-val--highlight {
    color: #38bdf8;
    font-size: 17px;
  }



  /* MILESTONES SECTION & CARDS */














  /* SOS ALARM PULSING & STATUS BANNER */
  .sos-alarm-pulsing {
    animation: sos-red-screen-pulse 1.2s infinite ease-in-out;
  }

  @keyframes sos-red-screen-pulse {
    0%, 100% {
      box-shadow: inset 0 0 0 0 rgba(239, 68, 68, 0);
      background-color: #0f172a;
    }
    50% {
      box-shadow: inset 0 0 120px 40px rgba(239, 68, 68, 0.45);
      background-color: #1e131d;
    }
  }

  .sos-alarm-strobe-banner {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: linear-gradient(135deg, rgba(220, 38, 38, 0.35) 0%, rgba(153, 27, 27, 0.5) 100%);
    border: 2px solid #ef4444;
    border-radius: 14px;
    margin-bottom: 1.25rem;
    animation: banner-strobe 1s infinite alternate;
  }

  @keyframes banner-strobe {
    0% { border-color: #ef4444; box-shadow: 0 0 20px rgba(239, 68, 68, 0.4); }
    100% { border-color: #fbbf24; box-shadow: 0 0 30px rgba(245, 158, 11, 0.6); }
  }

  .alarm-siren-flashing {
    font-size: 2rem;
    animation: siren-wiggle 0.5s infinite alternate ease-in-out;
  }

  @keyframes siren-wiggle {
    0% { transform: scale(1) rotate(-8deg); }
    100% { transform: scale(1.2) rotate(8deg); }
  }

  .alarm-banner-text {
    flex: 1;
    min-width: 0;
  }

  .alarm-banner-text strong {
    display: block;
    color: #fecaca;
    font-size: 0.95rem;
    font-weight: 800;
    letter-spacing: 0.03em;
    margin-bottom: 0.25rem;
  }

  .alarm-banner-text p {
    margin: 0;
    font-size: 0.85rem;
    color: #fca5a5;
    line-height: 1.4;
  }

  .btn-toggle-siren {
    padding: 0.55rem 0.9rem;
    background: #dc2626;
    color: #ffffff;
    border: 1px solid #f87171;
    border-radius: 8px;
    font-size: 0.82rem;
    font-weight: 700;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;
  }

  .btn-toggle-siren:hover {
    background: #b91c1c;
  }

  .sos-alarm-stopped-bar {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    padding: 0.75rem 1rem;
    background: rgba(30, 41, 59, 0.7);
    border: 1px dashed rgba(239, 68, 68, 0.4);
    border-radius: 10px;
    margin-bottom: 1.25rem;
    font-size: 0.85rem;
    color: #cbd5e1;
  }

  .btn-restart-siren {
    padding: 0.45rem 0.8rem;
    background: rgba(239, 68, 68, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.5);
    color: #fca5a5;
    border-radius: 6px;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
  }

  .btn-restart-siren:hover {
    background: rgba(239, 68, 68, 0.35);
    color: #ffffff;
  }

  .sos-banner.alarm-active {
    border-color: #ef4444;
    box-shadow: 0 0 25px rgba(239, 68, 68, 0.4);
  }

  /* TAB 2: SOS STYLES */
  .sos-banner {
    background: linear-gradient(135deg, #991b1b 0%, #450a0a 100%);
    border: 2px solid #ef4444;
    border-radius: 16px;
    padding: 18px 22px;
    display: flex;
    align-items: center;
    gap: 16px;
    box-shadow: 0 0 30px rgba(239, 68, 68, 0.35);
  }

  .sos-banner-icon {
    font-size: 40px;
  }

  .sos-banner-content {
    flex: 1;
  }

  .sos-banner-content h2 {
    margin: 0 0 4px;
    font-size: 20px;
    font-weight: 900;
    color: #fee2e2;
  }

  .sos-banner-content p {
    margin: 0;
    font-size: 13px;
    color: #fca5a5;
    line-height: 1.4;
    text-align: justify;
    text-justify: inter-word;
  }

  .btn-bell-alarm {
    background: rgba(255, 255, 255, 0.15);
    border: 1px solid rgba(255, 255, 255, 0.3);
    color: #ffffff;
    padding: 10px 16px;
    border-radius: 12px;
    font-weight: 700;
    font-size: 13px;
    cursor: pointer;
    white-space: nowrap;
  }

  .sos-card {
    background: rgba(30, 41, 59, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 16px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  .sos-card-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .step-num {
    display: grid;
    place-items: center;
    width: 34px;
    height: 34px;
    background: #0d9488;
    color: #ffffff;
    font-weight: 900;
    font-size: 16px;
    border-radius: 10px;
    flex-shrink: 0;
  }

  .sos-card-header h3 {
    margin: 0;
    font-size: 17.5px;
    font-weight: 800;
    color: #f1f5f9;
    line-height: 1.35;
  }

  /* JUSTIFY TEXT IN SOS CONTENT */
  .sos-pane p,
  .sos-pane li {
    text-align: justify !important;
    text-justify: inter-word !important;
    text-align-last: left !important;
    -webkit-text-align-last: left !important;
  }

  .step-desc {
    font-size: 14px;
    color: #cbd5e1;
    line-height: 1.45;
    display: block;
    width: 100%;
    text-align: justify !important;
    text-justify: inter-word !important;
    text-align-last: left !important;
    -webkit-text-align-last: left !important;
  }

  .witness-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
    gap: 14px;
  }

  .witness-box {
    background: rgba(15, 23, 42, 0.7);
    border-radius: 12px;
    padding: 16px;
    border: 1px solid rgba(255, 255, 255, 0.08);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .witness-icon {
    font-size: 28px;
    line-height: 1;
  }

  .witness-box h4 {
    margin: 0;
    font-size: 15.5px;
    font-weight: 800;
    letter-spacing: 0.3px;
    line-height: 1.35;
  }

  .witness-box p {
    margin: 0;
    width: 100%;
    display: block;
    font-size: 14.5px;
    color: #e2e8f0;
    line-height: 1.55;
    text-align: justify !important;
    text-justify: inter-word !important;
    text-align-last: left !important;
    -webkit-text-align-last: left !important;
    hyphens: auto;
    -webkit-hyphens: auto;
    word-break: break-word;
  }

  .witness-box--buddha h4 { color: #facc15; }
  .witness-box--deva h4 { color: #60a5fa; }
  .witness-box--ancestors h4 { color: #f472b6; }
  .witness-box--demons h4 { color: #f87171; }

  /* CONSEQUENCE BREAKDOWN IN SOS */
  .sos-consequence-section {
    background: rgba(15, 23, 42, 0.85);
    border: 1px solid rgba(239, 68, 68, 0.35);
    border-radius: 16px;
    padding: 1.25rem 1.5rem;
    display: flex;
    flex-direction: column;
    gap: 1.25rem;
  }

  .sos-consequence-header {
    display: flex;
    flex-direction: column;
    align-items: center;
    width: 100%;
  }

  .sos-consequence-badge {
    display: inline-block;
    background: rgba(220, 38, 38, 0.2);
    border: 1px solid rgba(239, 68, 68, 0.5);
    color: #fca5a5;
    font-size: 0.75rem;
    font-weight: 800;
    letter-spacing: 0.05em;
    padding: 0.25rem 0.75rem;
    border-radius: 999px;
    margin-bottom: 0.5rem;
  }

  .sos-consequence-header h3 {
    margin: 0 0 0.5rem 0;
    font-size: 1.15rem;
    font-weight: 900;
    color: #fee2e2;
    letter-spacing: 0.02em;
    text-align: center;
  }

  .sos-consequence-header p {
    margin: 0;
    width: 100%;
    display: block;
    font-size: 0.88rem;
    color: #cbd5e1;
    line-height: 1.5;
    text-align: justify !important;
    text-justify: inter-word !important;
    text-align-last: left !important;
    -webkit-text-align-last: left !important;
    hyphens: auto;
    -webkit-hyphens: auto;
    word-break: break-word;
  }

  .consequence-cards-grid {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .consequence-card {
    border-radius: 14px;
    padding: 1.15rem 1.25rem;
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    transition: all 0.2s ease;
  }

  .consequence-card--thudam {
    border-left: 4px solid #ef4444;
    background: radial-gradient(circle at 10% 10%, rgba(239, 68, 68, 0.08) 0%, rgba(30, 41, 59, 0.65) 100%);
  }

  .consequence-card--tadam {
    border-left: 4px solid #f97316;
    background: radial-gradient(circle at 10% 10%, rgba(249, 115, 22, 0.08) 0%, rgba(30, 41, 59, 0.65) 100%);
  }

  .consequence-card--ngoaitinh {
    border-left: 4px solid #dc2626;
    background: radial-gradient(circle at 10% 10%, rgba(220, 38, 38, 0.12) 0%, rgba(30, 41, 59, 0.75) 100%);
  }

  .c-card-top {
    display: flex;
    align-items: flex-start;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }

  .c-card-icon {
    font-size: 1.35rem;
    line-height: 1.2;
  }

  .c-card-title-wrap {
    flex: 1;
  }

  .c-card-title-wrap h4 {
    margin: 0 0 0.25rem 0;
    font-size: 15.5px;
    font-weight: 800;
    color: #ffffff;
    line-height: 1.35;
  }

  .consequence-card--thudam h4 { color: #fca5a5; }
  .consequence-card--tadam h4 { color: #fed7aa; }
  .consequence-card--ngoaitinh h4 { color: #fecaca; }

  .c-card-tag {
    font-size: 13.5px;
    color: #94a3b8;
    font-weight: 600;
    letter-spacing: 0.02em;
  }

  .c-card-list {
    margin: 0;
    padding-left: 1.25rem;
    display: flex;
    flex-direction: column;
    gap: 0.65rem;
    font-size: 14.5px;
    color: #e2e8f0;
    line-height: 1.55;
    text-align: justify !important;
    text-justify: inter-word !important;
    text-align-last: left !important;
  }

  .c-card-list li {
    text-align: justify !important;
    text-justify: inter-word !important;
    text-align-last: left !important;
    -webkit-text-align-last: left !important;
    hyphens: auto;
    -webkit-hyphens: auto;
    word-break: break-word;
  }


  .consequence-bottom-callout {
    padding: 0.85rem 1rem;
    background: rgba(13, 148, 136, 0.15);
    border: 1px solid rgba(20, 184, 166, 0.4);
    border-radius: 10px;
    font-size: 0.88rem;
    color: #5eead4;
    line-height: 1.5;
    text-align: justify !important;
    text-justify: inter-word !important;
    text-align-last: left !important;
    -webkit-text-align-last: left !important;
    hyphens: auto;
    -webkit-hyphens: auto;
    word-break: break-word;
  }

  .physical-actions-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(240px, 1fr));
    gap: 12px;
  }

  .phys-item {
    background: rgba(15, 23, 42, 0.7);
    border-radius: 12px;
    padding: 14px;
    border: 1px solid rgba(255, 255, 255, 0.08);
  }

  .phys-header {
    display: flex;
    align-items: center;
    gap: 10px;
    margin-bottom: 8px;
  }

  .phys-icon {
    font-size: 26px;
    line-height: 1;
    flex-shrink: 0;
  }

  .phys-item h4 {
    margin: 0;
    font-size: 15.5px;
    font-weight: 700;
    color: #38bdf8;
    line-height: 1.35;
  }

  .phys-item p {
    margin: 0;
    width: 100%;
    display: block;
    font-size: 14.5px;
    color: #e2e8f0;
    line-height: 1.55;
    text-align: justify !important;
    text-justify: inter-word !important;
    text-align-last: left !important;
    -webkit-text-align-last: left !important;
    hyphens: auto;
    -webkit-hyphens: auto;
    word-break: break-word;
  }

  .squat-counter-box {
    background: rgba(15, 23, 42, 0.9);
    border: 1px solid rgba(56, 189, 248, 0.3);
    border-radius: 14px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .squat-title {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .squat-title span {
    font-size: 26px;
  }

  .squat-title strong {
    font-size: 15.5px;
    color: #38bdf8;
    line-height: 1.35;
  }

  .squat-title p {
    margin: 4px 0 0;
    width: 100%;
    display: block;
    font-size: 14px;
    color: #cbd5e1;
    line-height: 1.45;
    text-align: justify !important;
    text-justify: inter-word !important;
    text-align-last: left !important;
    -webkit-text-align-last: left !important;
    hyphens: auto;
    -webkit-hyphens: auto;
    word-break: break-word;
  }

  .squat-counter-display {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 16px;
    flex-wrap: wrap;
  }

  .squat-number {
    font-size: 44px;
    font-weight: 900;
    color: #38bdf8;
    line-height: 1;
  }

  .squat-max {
    font-size: 18px;
    color: #64748b;
  }

  .squat-controls {
    display: flex;
    gap: 8px;
  }

  .btn-squat-add {
    padding: 10px 18px;
    border-radius: 10px;
    background: #0284c7;
    color: #ffffff;
    border: none;
    font-weight: 700;
    font-size: 14px;
    cursor: pointer;
  }

  .btn-squat-add--single {
    background: #0369a1;
  }

  .btn-squat-reset {
    padding: 10px 14px;
    border-radius: 10px;
    background: rgba(255, 255, 255, 0.1);
    color: #cbd5e1;
    border: none;
    font-size: 13px;
    cursor: pointer;
  }

  .squat-progress-bar {
    width: 100%;
    height: 6px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 999px;
    overflow: hidden;
  }

  .squat-progress-fill {
    height: 100%;
    background: #38bdf8;
    border-radius: 999px;
    transition: width 0.2s ease;
  }

  .mantra-actions {
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .btn-listen-now-cta {
    padding: 14px 20px;
    border-radius: 12px;
    background: linear-gradient(135deg, #0d9488 0%, #0369a1 100%);
    color: #ffffff;
    border: none;
    font-size: 15px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(13, 148, 136, 0.35);
  }

  .mantra-text-box {
    background: rgba(15, 23, 42, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 14px;
  }

  .mantra-label {
    font-size: 13.5px;
    font-weight: 700;
    color: #facc15;
    margin-bottom: 6px;
    letter-spacing: 0.3px;
  }

  .mantra-content {
    font-size: 15.5px;
    font-weight: 600;
    color: #f8fafc;
    line-height: 1.6;
  }

  .sos-finish-box {
    text-align: center;
    padding: 16px;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
  }

  .btn-resisted-success {
    padding: 16px 28px;
    border-radius: 14px;
    background: linear-gradient(135deg, #10b981 0%, #047857 100%);
    color: #ffffff;
    border: none;
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(16, 185, 129, 0.35);
    transition: transform 0.15s ease;
  }

  .btn-resisted-success:hover {
    transform: scale(1.02);
  }

  .sos-finish-box p {
    margin: 0;
    font-size: 13px;
    color: #94a3b8;
  }

  .sos-relapse-action-box {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 12px;
    text-align: center;
    margin-top: 10px;
    padding-top: 20px;
    border-top: 1px dashed rgba(255, 255, 255, 0.15);
  }

  .btn-relapse-surrender {
    width: 100%;
    max-width: 600px;
    padding: 16px 28px;
    border-radius: 14px;
    background: linear-gradient(135deg, rgba(220, 38, 38, 0.3) 0%, rgba(153, 27, 27, 0.6) 100%);
    border: 2px solid rgba(248, 113, 113, 0.6);
    color: #fecaca;
    font-size: 16px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 6px 20px rgba(185, 28, 28, 0.3);
    transition: transform 0.15s ease, background 0.15s ease, border-color 0.15s ease, color 0.15s ease;
  }

  .btn-relapse-surrender:hover {
    transform: scale(1.02);
    background: linear-gradient(135deg, rgba(220, 38, 38, 0.5) 0%, rgba(153, 27, 27, 0.8) 100%);
    border-color: #ef4444;
    color: #ffffff;
  }

  /* STRICT CHECK-IN RULE NOTE (MAIN SCREEN) */
  .checkin-rule-note {
    width: 100%;
    max-width: 580px;
    padding: 13px 18px;
    border-radius: 14px;
    background: rgba(15, 23, 42, 0.75);
    border: 1px solid rgba(245, 158, 11, 0.3);
    color: #fde68a;
    font-size: 13px;
    line-height: 1.6;
    text-align: left;
    box-shadow: 0 4px 14px rgba(0, 0, 0, 0.2);
  }

  .checkin-rule-note strong {
    color: #ffffff;
  }

  /* ABSTINENCE ALERT (MINIMALIST) */
  .tt-abstinence-alert {
    background: linear-gradient(135deg, rgba(239, 68, 68, 0.15) 0%, rgba(15, 23, 42, 0.85) 100%);
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-left: 4px solid #ef4444;
    border-radius: 14px;
    padding: 14px 18px;
    display: flex;
    align-items: center;
    gap: 12px;
    animation: fadeIn 0.25s ease;
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.25);
  }

  .tt-abstinence-icon {
    font-size: 24px;
    flex-shrink: 0;
  }

  .tt-abstinence-text {
    margin: 0;
    color: #fde68a;
    font-size: 13.5px;
    line-height: 1.55;
  }


  /* RELAPSE WARNING ENCOURAGEMENT BANNER */
  .relapse-warning-banner {
    background: linear-gradient(135deg, rgba(220, 38, 38, 0.2) 0%, rgba(30, 41, 59, 0.9) 100%);
    border: 1px solid rgba(248, 113, 113, 0.6);
    border-radius: 16px;
    padding: 18px 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
    animation: fadeIn 0.3s ease;
  }

  .relapse-warning-header {
    display: flex;
    align-items: flex-start;
    gap: 12px;
  }

  .relapse-warning-icon {
    font-size: 26px;
    flex: 0 0 auto;
  }

  .relapse-warning-text strong {
    display: block;
    color: #f87171;
    font-size: 14px;
    font-weight: 800;
    margin-bottom: 4px;
    letter-spacing: 0.3px;
  }

  .relapse-warning-text p {
    margin: 0;
    color: #f1f5f9;
    font-size: 13px;
    line-height: 1.6;
  }

  .relapse-recovery-tracker {
    display: flex;
    flex-direction: column;
    gap: 6px;
    padding-top: 10px;
    border-top: 1px solid rgba(248, 113, 113, 0.25);
  }

  .recovery-status-line {
    display: flex;
    justify-content: space-between;
    font-size: 12px;
    color: #cbd5e1;
  }

  .recovery-status-line strong {
    color: #38bdf8;
  }

  .recovery-track-bar {
    height: 8px;
    border-radius: 999px;
    background: rgba(255, 255, 255, 0.12);
    overflow: hidden;
  }

  .recovery-track-fill {
    height: 100%;
    border-radius: 999px;
    background: linear-gradient(90deg, #f59e0b 0%, #10b981 100%);
    transition: width 0.3s ease;
  }

  /* Giữ cùng palette với app; thay đổi chỉ áp dụng cho tab nghe chú. */
  .practice-theme.reference-view{width:100vw;background:var(--bg);color:var(--text);font-family:var(--font-app);scrollbar-width:none}
  .practice-theme.reference-view.sos-alarm-pulsing{background:var(--bg);animation:none}
  .reference-view .thanh-tinh-container{padding-top:0;gap:0}
  .reference-view .tt-tab-pane{padding-top:var(--radius-control)}
  .practice-theme.reference-view .tt-header{border:0;border-bottom:1px solid var(--border);border-radius:0;background:transparent;box-shadow:none;padding:var(--radius-sm) 0;gap:var(--radius-sm);flex-wrap:nowrap}
  .practice-theme.reference-view .tt-title-box{flex:1;order:0;min-width:0;text-align:center}
  .practice-theme.reference-view .tt-main-title{justify-content:center;letter-spacing:0}
  .reference-view .tt-main-title{font-size:1rem;color:var(--brown)}
  .reference-view .tt-title-icon,.reference-view .tt-subtitle{display:none}
  .reference-view .btn-back{background:transparent;border-color:transparent;color:var(--brown);padding:var(--radius-sm)}
  .reference-view .tt-tabs-nav{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));overflow:visible;border-bottom:1px solid var(--border);background:transparent;gap:var(--radius-sm);padding-block:var(--radius-control)}
  .practice-theme.reference-view .tt-tabs-nav .tt-tab-btn{width:100%;min-width:0;min-height:44px;padding:var(--radius-sm);white-space:normal;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--gold-light);color:var(--brown);box-shadow:none}
  .practice-theme.reference-view .tt-tabs-nav .tt-tab-btn.active{border-color:var(--gold);color:var(--on-gold);background:var(--gold)}
  @media(min-width:640px){.reference-view .tt-tabs-nav{grid-template-columns:repeat(3,minmax(0,1fr))}}
  @media(min-width:960px){.reference-view .tt-tabs-nav{grid-template-columns:repeat(6,minmax(0,1fr))}}
  .audio-hero-card{display:grid;grid-template-columns:minmax(0,1.65fr) minmax(0,1fr);gap:var(--radius-sm) var(--radius-control);width:100%;max-width:var(--practice-dialog-width);margin-inline:auto;color:var(--text)}
  .audio-buddha-art{margin:0;min-width:0;width:100%;justify-self:center;display:flex;flex-direction:column;gap:var(--radius-sm)}
  .audio-buddha-img{display:block;width:100%;height:auto;object-fit:contain;border-radius:var(--radius-card)}
  .audio-buddha-art figcaption{text-align:center;color:var(--brown);font-size:.8125rem;line-height:1.5;overflow-wrap:anywhere}
  .audio-buddha-art figcaption span{display:block}
  .audio-info{min-width:0;align-self:center;display:flex;flex-direction:column;gap:var(--radius-card)}
  .audio-title{margin:0;font-size:clamp(1.125rem,5vw,2rem);font-weight:800;line-height:1.3;color:var(--text);overflow-wrap:anywhere}
  .audio-desc{margin:0;font-size:.8125rem;color:var(--text2);line-height:1.6}
  .audio-timer-badge{display:flex;flex-direction:column;align-items:flex-start;gap:var(--radius-sm);padding-top:var(--radius-card);border-top:1px solid var(--border);color:var(--text2);font-size:.875rem}
  .audio-timer-badge strong{font-size:clamp(1.5rem,10.5vw,3.25rem);line-height:1.2;color:var(--gold);font-variant-numeric:tabular-nums;white-space:nowrap;max-width:100%}
  .audio-timer-badge strong.unlimited{font-size:1.25rem;white-space:normal;overflow-wrap:anywhere}
  .audio-timer-badge small{font-size:.8125rem;color:var(--muted)}
  .player-controls-box{grid-column:1/-1;display:flex;flex-direction:column;gap:var(--radius-control);min-width:0;width:100%}
  .player-time-row{display:grid;grid-template-columns:1fr 1fr;align-items:center;font-size:.875rem;color:var(--text2);font-variant-numeric:tabular-nums}
  .player-time-row span:last-child{text-align:right}
  .player-time-row span{grid-row:2}
  .progress-slider{grid-row:1;grid-column:1/-1;width:100%;min-width:0;height:44px;margin:0;accent-color:var(--gold);cursor:pointer}
  .player-buttons-row{display:grid;grid-template-columns:auto minmax(0,1fr);align-items:center;gap:var(--radius-control)}
  .btn-play-pause-main{grid-column:1/-1;display:flex;align-items:center;justify-content:center;gap:var(--radius-control);min-height:54px;padding:var(--radius-control) var(--radius-card);border:1px solid var(--gold);border-radius:calc(var(--radius-feature) * 2);background:var(--gold);color:var(--on-gold);font:700 1rem var(--font-app);cursor:pointer}
  .btn-loop{display:flex;align-items:center;gap:var(--radius-sm);min-height:44px;padding:var(--radius-sm);border:0;background:transparent;color:var(--text2);font:inherit;font-size:.875rem;cursor:pointer}
  .btn-loop.active{color:var(--brown)}
  .loop-state{display:inline-flex;align-items:center;width:2.25rem;height:1.375rem;padding:2px;border-radius:var(--radius-feature);background:var(--border)}
  .loop-state::after{content:'';width:1.125rem;height:1.125rem;border-radius:50%;background:var(--card)}
  .btn-loop.active .loop-state{justify-content:flex-end;background:var(--gold)}
  .volume-control{display:flex;align-items:center;gap:var(--radius-sm);min-width:0;color:var(--brown)}
  .volume-control input{min-width:0;width:100%;height:44px;accent-color:var(--gold)}
  .progress-slider,.volume-control input{appearance:none;background:transparent}
  .progress-slider::-webkit-slider-runnable-track,.volume-control input::-webkit-slider-runnable-track{height:var(--radius-sm);border-radius:var(--radius-sm);background:var(--border)}
  .progress-slider::-webkit-slider-thumb,.volume-control input::-webkit-slider-thumb{appearance:none;width:var(--radius-control);height:var(--radius-control);margin-top:calc((var(--radius-sm) - var(--radius-control)) / 2);border:0;border-radius:50%;background:var(--gold)}
  .progress-slider::-moz-range-track,.volume-control input::-moz-range-track{height:var(--radius-sm);border-radius:var(--radius-sm);background:var(--border)}
  .progress-slider::-moz-range-thumb,.volume-control input::-moz-range-thumb{width:var(--radius-control);height:var(--radius-control);border:0;border-radius:50%;background:var(--gold)}
  .volume-control{border-left:1px solid var(--border);padding-left:var(--radius-control)}
  .timer-selector-row{display:grid;grid-template-columns:repeat(3,minmax(0,1fr)) minmax(0,1.3fr);gap:var(--radius-sm);padding-top:var(--radius-card);border-top:1px solid var(--border);color:var(--text);font-size:.875rem}
  .timer-selector-row .label{grid-column:1/-1;margin-bottom:var(--radius-sm);font-weight:700;font-size:1rem}
  .btn-timer-chip{min-width:0;min-height:44px;padding:var(--radius-sm);border-radius:var(--radius-card);border:1px solid transparent;background:var(--gold-light);color:var(--text2);font:inherit;font-size:.8125rem;cursor:pointer;overflow-wrap:anywhere}
  .btn-timer-chip.selected{background:var(--gold);border-color:var(--gold);color:var(--on-gold)}
  .audio-pane button:focus-visible,.audio-pane input:focus-visible{outline:2px solid var(--gold);outline-offset:3px}

  .lang-nghiem-text-card{background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-card);padding:var(--radius-card);display:flex;flex-direction:column;gap:var(--radius-control);color:var(--text)}
  .lang-nghiem-text-card h3{margin:0;font-size:1.0625rem;color:var(--text)}
  .lang-nghiem-text-card p{margin:0;font-size:.875rem;color:var(--text2);line-height:1.7;text-align:justify}
  .scripture-read-link {
    margin-top: 6px;
    display: flex;
    justify-content: flex-start;
  }

  .btn-open-rich-text {
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 12px 20px;
    border-radius: 12px;
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.2) 0%, rgba(56, 189, 248, 0.1) 100%);
    border: 1px solid rgba(56, 189, 248, 0.4);
    color: #38bdf8;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.2s ease;
    box-shadow: 0 4px 12px rgba(14, 165, 233, 0.15);
  }

  .btn-open-rich-text:hover {
    background: linear-gradient(135deg, rgba(14, 165, 233, 0.3) 0%, rgba(56, 189, 248, 0.2) 100%);
    border-color: #38bdf8;
    transform: translateY(-1px);
    box-shadow: 0 6px 16px rgba(14, 165, 233, 0.25);
  }

  /* TAB 4: DIET STYLES */
  .diet-header-card {
    background: linear-gradient(135deg, rgba(34, 197, 94, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%);
    border: 1px solid rgba(34, 197, 94, 0.3);
    border-radius: 16px;
    padding: 18px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .diet-icon {
    font-size: 36px;
  }

  .diet-header-card h2 {
    margin: 0 0 4px;
    font-size: 20px;
    font-weight: 800;
    color: #86efac;
  }

  .diet-header-card p {
    margin: 0;
    font-size: 13px;
    color: #cbd5e1;
  }

  .diet-rules-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(260px, 1fr));
    gap: 14px;
  }

  .diet-rule-card {
    background: rgba(30, 41, 59, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    padding: 16px;
    display: flex;
    flex-direction: column;
    gap: 8px;
    position: relative;
  }

  .rule-badge {
    align-self: flex-start;
    font-size: 10px;
    font-weight: 800;
    letter-spacing: 0.5px;
    padding: 3px 8px;
    border-radius: 4px;
    background: rgba(239, 68, 68, 0.2);
    color: #f87171;
  }

  .rule-badge--best {
    background: rgba(34, 197, 94, 0.2);
    color: #4ade80;
  }

  .rule-badge--danger {
    background: rgba(220, 38, 38, 0.3);
    color: #ef4444;
  }

  .diet-rule-card h3 {
    margin: 0;
    font-size: 16px;
    font-weight: 700;
    color: #f1f5f9;
  }

  .diet-rule-card p {
    margin: 0;
    font-size: 13px;
    color: #94a3b8;
    line-height: 1.45;
  }

  .lifestyle-card {
    background: rgba(30, 41, 59, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    padding: 18px;
  }

  .lifestyle-card h3 {
    margin: 0 0 12px;
    font-size: 16px;
    font-weight: 700;
    color: #facc15;
  }

  .lifestyle-list {
    margin: 0;
    padding-left: 0;
    list-style: none;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .lifestyle-list li {
    font-size: 13px;
    color: #cbd5e1;
    line-height: 1.5;
  }

  /* TAB 5: REPENTANCE STYLES */
  .repent-header-card {
    background: linear-gradient(135deg, rgba(168, 85, 247, 0.15) 0%, rgba(15, 23, 42, 0.8) 100%);
    border: 1px solid rgba(168, 85, 247, 0.3);
    border-radius: 16px;
    padding: 18px 20px;
    display: flex;
    align-items: center;
    gap: 16px;
  }

  .repent-icon {
    font-size: 36px;
  }

  .repent-header-card h2 {
    margin: 0 0 4px;
    font-size: 20px;
    font-weight: 800;
    color: #d8b4fe;
  }

  .repent-header-card p {
    margin: 0;
    font-size: 13px;
    color: #cbd5e1;
  }

  .repent-quote-box {
    background: rgba(15, 23, 42, 0.6);
    border-left: 4px solid #a855f7;
    border-radius: 8px;
    padding: 14px 18px;
  }

  .repent-quote-box p {
    margin: 0;
    font-size: 13px;
    font-style: italic;
    color: #cbd5e1;
    line-height: 1.5;
  }

  .repent-ritual-card {
    background: rgba(30, 41, 59, 0.7);
    border: 1px solid rgba(255, 255, 255, 0.1);
    border-radius: 14px;
    padding: 20px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .repent-ritual-card h3 {
    margin: 0;
    font-size: 15px;
    font-weight: 800;
    letter-spacing: 0.5px;
    color: #facc15;
    text-align: center;
  }

  .repent-script {
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.08);
    border-radius: 12px;
    padding: 16px;
    font-size: 14px;
    color: #f1f5f9;
    line-height: 1.7;
    text-align: justify;
  }

  .repent-invocations {
    text-align: center;
    margin-bottom: 14px;
    padding-bottom: 12px;
    border-bottom: 1px dashed rgba(255, 255, 255, 0.15);
  }

  .repent-invocations p {
    margin: 4px 0;
    color: #fde047;
    font-size: 15px;
    font-weight: 700;
    letter-spacing: 0.3px;
  }

  .repent-closing {
    margin-top: 14px;
    text-align: center;
    color: #67e8f9;
    font-size: 15px;
  }

  .repent-recovery-actions {
    background: rgba(30, 41, 59, 0.6);
    border-radius: 14px;
    padding: 18px;
    display: flex;
    flex-direction: column;
    gap: 12px;
  }

  .repent-recovery-actions h4 {
    margin: 0;
    font-size: 15px;
    font-weight: 700;
    color: #e2e8f0;
  }

  .recovery-steps {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .rec-step {
    background: rgba(255, 255, 255, 0.05);
    padding: 10px 14px;
    border-radius: 8px;
    font-size: 13px;
    color: #cbd5e1;
  }

  .reset-streak-box {
    text-align: center;
    padding-top: 8px;
  }

  .btn-reset-streak-cta {
    padding: 14px 24px;
    border-radius: 12px;
    background: linear-gradient(135deg, #0284c7 0%, #0369a1 100%);
    color: #ffffff;
    border: none;
    font-size: 14px;
    font-weight: 800;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(2, 132, 199, 0.35);
  }

  /* MODALS */
  .modal-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10000;
    background: rgba(0, 0, 0, 0.75);
    backdrop-filter: blur(4px);
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 20px;
  }

  .modal-dialog {
    background: #1e293b;
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 18px;
    max-width: 480px;
    width: 100%;
    padding: 24px;
    display: flex;
    flex-direction: column;
    gap: 14px;
    box-shadow: 0 20px 40px rgba(0, 0, 0, 0.5);
  }

  .modal-dialog h3 {
    margin: 0;
    font-size: 18px;
    font-weight: 800;
    color: #14b8a6;
    text-align: center;
  }

  .pledge-intro, .relapse-intro {
    margin: 0;
    font-size: 13px;
    color: #cbd5e1;
    text-align: center;
    line-height: 1.4;
  }

  .pledge-vow-box {
    background: rgba(15, 23, 42, 0.8);
    border-left: 4px solid #14b8a6;
    padding: 14px 16px;
    border-radius: 8px;
    font-size: 14px;
    color: #f1f5f9;
    line-height: 1.6;
    font-style: italic;
  }

  .pledge-privacy-reassure {
    font-size: 12px;
    color: #94a3b8;
    line-height: 1.4;
  }

  .form-group {
    display: flex;
    flex-direction: column;
    gap: 6px;
    text-align: left;
  }

  .form-group label {
    font-size: 13px;
    font-weight: 600;
    color: #cbd5e1;
  }

  .form-select, .form-input {
    background: rgba(15, 23, 42, 0.8);
    border: 1px solid rgba(255, 255, 255, 0.15);
    border-radius: 8px;
    padding: 10px 12px;
    color: #f1f5f9;
    font-size: 13px;
    outline: none;
  }

  .form-select:focus, .form-input:focus {
    border-color: #14b8a6;
  }

  .modal-actions {
    display: flex;
    justify-content: flex-end;
    gap: 10px;
    padding-top: 8px;
  }

  .btn-cancel {
    padding: 10px 16px;
    border-radius: 8px;
    background: rgba(255, 255, 255, 0.1);
    color: #cbd5e1;
    border: none;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
  }

  .btn-confirm-pledge {
    padding: 10px 20px;
    border-radius: 8px;
    background: #0d9488;
    color: #ffffff;
    border: none;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }

  .btn-confirm-relapse {
    padding: 10px 20px;
    border-radius: 8px;
    background: #dc2626;
    color: #ffffff;
    border: none;
    font-size: 14px;
    font-weight: 700;
    cursor: pointer;
  }

  /* CHECK-IN CONFIRMATION MODAL */
  .checkin-modal-dialog {
    max-width: 440px;
    padding: 26px 22px;
    text-align: center;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 14px;
    border-radius: 20px;
  }

  .checkin-modal-icon {
    font-size: 2.75rem;
    line-height: 1;
    margin-bottom: 0.25rem;
  }

  .checkin-modal-dialog h3 {
    margin: 0;
    font-size: clamp(13px, 3.8vw, 17px);
    font-weight: 800;
    letter-spacing: 0.2px;
    color: #2dd4bf;
    white-space: nowrap;
    text-align: center;
    width: 100%;
  }

  .checkin-question-box {
    margin: 0.25rem 0 0.5rem;
    text-align: center;
    display: flex;
    flex-direction: column;
    gap: 12px;
    width: 100%;
  }

  .checkin-question-text {
    font-size: 1rem;
    font-weight: 700;
    line-height: 1.5;
    color: #ffffff;
    margin: 0;
    text-wrap: balance;
  }

  .checkin-solemn-warning {
    padding: 0.85rem 1rem;
    background: rgba(220, 38, 38, 0.15);
    border: 1px solid rgba(239, 68, 68, 0.4);
    border-radius: 12px;
    color: #fca5a5;
    font-size: 0.88rem;
    line-height: 1.5;
    text-wrap: balance;
  }

  .checkin-modal-actions {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    margin-top: 6px;
  }

  .btn-confirm-checkin {
    width: 100%;
    background: linear-gradient(135deg, #16a34a 0%, #15803d 100%);
    color: #ffffff;
    border: 1px solid #4ade80;
    border-radius: 12px;
    padding: 14px 18px;
    font-size: 0.95rem;
    font-weight: 700;
    cursor: pointer;
    box-shadow: 0 4px 14px rgba(22, 163, 74, 0.35);
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
  }

  .btn-confirm-checkin:hover {
    background: linear-gradient(135deg, #15803d 0%, #166534 100%);
    transform: translateY(-1px);
    box-shadow: 0 6px 18px rgba(22, 163, 74, 0.45);
  }

  .btn-cancel-checkin {
    width: 100%;
    background: rgba(51, 65, 85, 0.6);
    border: 1px solid rgba(255, 255, 255, 0.12);
    border-radius: 12px;
    padding: 12px 18px;
    color: #cbd5e1;
    font-size: 0.9rem;
    font-weight: 600;
    cursor: pointer;
    transition: all 0.2s ease;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  .btn-cancel-checkin:hover {
    background: rgba(71, 85, 105, 0.8);
    border-color: rgba(255, 255, 255, 0.25);
    color: #ffffff;
  }

  @media (max-width: 960px) {
    .tt-tabs-nav {
      grid-template-columns: repeat(3, 1fr);
    }
  }

  @media (max-width: 640px) {
    .thanh-tinh-container {
      padding: 12px 14px 40px;
    }

    .tt-tabs-nav {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 8px;
      width: 100%;
    }

    .tt-tabs-nav .tt-tab-btn {
      width: 100%;
      justify-content: center;
      padding: 10px 8px;
      font-size: 13px;
      white-space: normal;
      text-align: center;
    }

    .progress-current-status-box {
      grid-template-columns: 1fr;
      gap: 8px;
    }

    .sos-alarm-strobe-banner {
      flex-direction: column;
      text-align: center;
    }

    .btn-toggle-siren {
      width: 100%;
    }

    .btn-open-rich-text {
      width: 100%;
      justify-content: center;
      text-align: center;
    }

    .tt-main-title {
      font-size: 18px;
    }

    .streak-circle-wrap {
      width: 170px;
      height: 170px;
    }

    .streak-days-number {
      font-size: 52px;
    }

    .sos-banner {
      flex-direction: column;
      text-align: center;
    }

    .btn-bell-alarm {
      width: 100%;
    }



    .btn-play-pause-main {
      width: 100%;
    }
  }
  .audio-pane .btn-open-rich-text{min-height:44px;gap:var(--radius-sm);padding:var(--radius-control) var(--radius-card);border-radius:var(--radius-control);background:var(--gold-light);border-color:var(--border);color:var(--brown);box-shadow:none}
  .audio-pane .btn-open-rich-text:hover{background:var(--bg3);border-color:var(--gold);box-shadow:none;transform:none}
  /* Cùng hệ vàng–kem cho cả chương trình; các trạng thái nguy cơ vẫn có màu cảnh báo. */
  .reference-view :is(.tt-onboarding-card,.community-banner,.streak-card,.progress-hero-card,.sos-banner,.sos-card,.sos-consequence-section,.diet-header-card,.diet-rule-card,.lifestyle-card,.repent-header-card,.repent-ritual-card,.repent-recovery-actions,.modal-dialog){background:var(--card);border:1px solid var(--border);border-radius:var(--radius-card);box-shadow:var(--shadow);color:var(--text)}
  .reference-view .modal-dialog{background:var(--dialog-surface-background,var(--card));border-color:var(--dialog-surface-border,var(--border));box-shadow:var(--dialog-surface-shadow,var(--shadow-xl))}
  .reference-view .tt-onboarding-card{margin-top:var(--radius-card)}
  .reference-view :is(.progress-current-status-box,.witness-box,.consequence-card,.phys-item,.squat-counter-box,.mantra-text-box,.mantra-content,.repent-quote-box,.repent-script,.rec-step,.reset-streak-box,.pledge-vow-box,.pledge-privacy-reassure,.checkin-question-box,.recovery-track-bar){background:var(--gold-light);border-color:var(--border);color:var(--text2);box-shadow:none}
  .reference-view :is(.tt-tab-pane,.tt-onboarding-card,.modal-dialog) :is(h2,h3,h4,strong,.p-status-val,.phys-header,.squat-title){color:var(--text)}
  .reference-view :is(.tt-tab-pane,.tt-onboarding-card,.modal-dialog) :is(p,li,.streak-sub-clock,.comm-stat-desc,.p-status-label,.step-desc,.rec-step,.form-group label,.squat-max){color:var(--text2)}
  .reference-view :is(.comm-stat-num,.streak-days-number,.streak-days-label,.streak-kicker,.p-status-val--highlight,.squat-number,.onboarding-heading){color:var(--brown)}
  .reference-view :is(.comm-stat-icon,.rule-badge,.step-num,.sos-consequence-badge,.pledge-status-badge,.recovery-status-line){background:var(--gold-light);color:var(--brown);border-color:var(--border);box-shadow:none}
  .reference-view .streak-circle-wrap{background:var(--gold-light);border-color:var(--gold);box-shadow:none}
  .reference-view :is(.squat-progress-bar){background:var(--border)}
  .reference-view :is(.squat-progress-fill,.recovery-track-fill){background:var(--gold)}
  .reference-view :is(.btn-pledge-cta,.btn-onboarding-join,.btn-checkin,.btn-resisted-success,.btn-reset-streak-cta,.btn-confirm-pledge,.btn-confirm-checkin,.btn-squat-add,.btn-open-rich-text){min-height:44px;background:var(--gold);border-color:var(--gold);border-radius:var(--radius-control);color:var(--on-gold);box-shadow:none}
  .reference-view :is(.btn-cancel,.btn-cancel-checkin,.btn-onboarding-back,.btn-relapse-trigger,.btn-squat-reset,.stat-pill,.btn-bell-alarm,.btn-toggle-siren,.btn-restart-siren){min-height:44px;background:var(--gold-light);border-color:var(--border);color:var(--brown);box-shadow:none}
  .reference-view .btn-checkin.checked-in{background:var(--gold-light);color:var(--brown)}
  .reference-view :is(.sos-alarm-strobe-banner,.sos-alarm-stopped-bar,.sos-banner.alarm-active,.tt-abstinence-alert,.checkin-rule-note,.checkin-solemn-warning,.consequence-bottom-callout){background:var(--gold-light);border-color:var(--danger-text);color:var(--danger-text);box-shadow:none;animation:none}
  .reference-view :is(.sos-alarm-strobe-banner,.sos-banner,.tt-abstinence-alert,.checkin-rule-note) :is(p,strong,.tt-abstinence-text){color:var(--danger-text)}
  .reference-view :is(.btn-sos-trigger,.btn-confirm-relapse){min-height:44px;background:var(--danger-text);border-color:var(--danger-text);color:var(--card);box-shadow:none}
  .reference-view :is(.rule-badge--danger,.c-card-tag){color:var(--danger-text)}
  .reference-view :is(.form-select,.form-input){background:var(--bg);border-color:var(--border);color:var(--text)}
  .reference-view .tt-tab-pane .audio-timer-badge strong{color:var(--gold)}
  .reference-view :is(button,input,select):focus-visible{outline:2px solid var(--gold);outline-offset:3px}

  .clarity-settings{position:relative;flex-shrink:0}.clarity-settings summary{display:grid;place-items:center;min-width:44px;min-height:44px;cursor:pointer;color:var(--brown);list-style:none}.clarity-settings summary::-webkit-details-marker{display:none}.clarity-settings>div{position:absolute;right:0;top:100%;z-index:20;min-width:180px;padding:var(--radius-sm);background:var(--card);border:1px solid var(--border);border-radius:var(--radius-control);box-shadow:var(--shadow)}.clarity-settings button{font:inherit;min-height:44px;background:var(--card);color:var(--text);border:0;padding:.6em}
  .thanh-tinh-overlay {
    padding-top: var(--app-safe-top, env(safe-area-inset-top, 0px));
    padding-bottom: max(env(safe-area-inset-bottom, 0px), 16px);
    padding-left: env(safe-area-inset-left, 0px);
    padding-right: env(safe-area-inset-right, 0px);
  }
  button{min-height:44px}
  .reference-view .thanh-tinh-container{max-width:var(--practice-dialog-width);padding-inline:var(--space-page)}
  .practice-theme.reference-view .tt-header{position:sticky;top:0;z-index:30;background:var(--bg);min-height:60px}
  .reference-view .btn-back{min-width:44px;justify-content:center}
  .reference-view .btn-back span{display:none}
  .reference-view .tt-main-title{font-size:1.1rem}
  .practice-theme.reference-view .tt-tab-btn{gap:var(--radius-sm);font:inherit;font-size:.85rem;justify-content:flex-start;text-align:left}
  @media(min-width:640px){.reference-view .tt-tabs-nav{grid-template-columns:repeat(3,minmax(0,1fr))}}
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),select{min-height:44px}
</style>
