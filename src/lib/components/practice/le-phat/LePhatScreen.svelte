<script lang="ts">
  import { onMount, onDestroy, untrack, type Snippet } from 'svelte';
  import { createAudioTapStop } from '$lib/browser/practice-audio-timing';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  import { Info } from '@lucide/svelte';
  import { getBuddhaProfileUi } from '$lib/i18n/buddha-profile-ui';
  import BuddhaProfileDialog from './BuddhaProfileDialog.svelte';
  import {
    MEDITATION_TRACK_OPTIONS,
    type MeditationTrack
  } from '$lib/browser/practice-audio';
  import {
    AMBIENT_SOUND_OPTIONS,
    createAmbientSoundController,
    getAmbientSoundLabel,
    type AmbientSoundType
  } from '$lib/browser/ambient-sound';
  import { createWakeLockController } from '$lib/browser/wake-lock';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import buddhasData from '$lib/data/buddhas.json';

  export interface BuddhaInfo {
    id: string;
    name: string;
    danhHieu: string;
    moTa: string;
    image: string;
  }

  interface Props {
    open: boolean;
    principal?: string | null;
    routineSetup?: { id: string; phrase: string; count: number };
    routinePaused?: boolean;
    routineControls?: Snippet;
    onRoutineComplete?: (count: number, buddha: BuddhaInfo) => void;
    onExitRequest: (count: number, buddha: BuddhaInfo, fromHistory?: boolean) => void;
  }

  let { open, principal = null, routineSetup, routinePaused = false, routineControls, onRoutineComplete, onExitRequest }: Props = $props();

  const localeStore = getLocaleContext();
  const localizeUi = createInterfaceTranslator();
  const t = $derived(localeStore.t.practice);
  const isEn = $derived(localeStore.current === 'en');
  const profileUi = $derived(getBuddhaProfileUi(isEn));

  const BUDDHAS: BuddhaInfo[] = buddhasData;
  const GOALS = [0, 3, 7, 12, 21, 49, 108];

  const BUDDHA_NAMES_EN: Record<string, { name: string; danhHieu: string }> = {
    'thich-ca-mau-ni': { name: 'Shakyamuni Buddha', danhHieu: 'Namo Shakyamuni Buddha' },
    'ty-lo-gia-na': { name: 'Vairocana Buddha', danhHieu: 'Namo Vairocana Buddha' },
    'a-di-da': { name: 'Amitabha Buddha', danhHieu: 'Namo Amitabha Buddha' },
    'duoc-su': { name: 'Medicine Buddha (Bhaisajyaguru)', danhHieu: 'Namo Bhaisajyaguru Buddha' },
    'quan-the-am': { name: 'Avalokiteshvara Bodhisattva', danhHieu: 'Namo Avalokiteshvara Bodhisattva' },
    'dai-the-chi': { name: 'Mahasthamaprapta Bodhisattva', danhHieu: 'Namo Mahasthamaprapta Bodhisattva' },
    'dia-tang-vuong': { name: 'Ksitigarbha Bodhisattva', danhHieu: 'Namo Ksitigarbha Bodhisattva' },
    'van-thu-su-loi': { name: 'Manjushri Bodhisattva', danhHieu: 'Namo Manjushri Bodhisattva' },
    'pho-hien': { name: 'Samantabhadra Bodhisattva', danhHieu: 'Namo Samantabhadra Bodhisattva' },
    'di-lac': { name: 'Maitreya Buddha', danhHieu: 'Namo Maitreya Buddha' },
    'duoc-vuong': { name: 'Bhaisajyaraja (Medicine King) Bodhisattva', danhHieu: 'Namo Bhaisajyaraja Bodhisattva' },
    'hu-khong-tang': { name: 'Akasagarbha Bodhisattva', danhHieu: 'Namo Akasagarbha Bodhisattva' },
    'nhat-quang': { name: 'Suryaprabha (Sunlight) Bodhisattva', danhHieu: 'Namo Suryaprabha Bodhisattva' },
    'nguyet-quang': { name: 'Candraprabha (Moonlight) Bodhisattva', danhHieu: 'Namo Candraprabha Bodhisattva' },
  };

  const goalLabels = $derived<Record<number, string>>({
    0: t.goalFree,
    3: t.goal3,
    7: t.goal7,
    12: t.goal12,
    21: t.goal21,
    49: t.goal49,
    108: t.goal108,
  });

  // State
  let isPracticing = $state(false);
  let selectedIdx = $state(0);
  let count = $state(0);
  let goal = $state(21);
  let bellType = $state<'bell' | 'mo' | 'none'>('bell');
  let musicTrack = $state<MeditationTrack | 'none'>('none');
  let ambientSound = $state<AmbientSoundType>('none');
  let moLoop = $state(false);
  let imgLoaded = $state(false);
  let imgError = $state(false);
  let profileBuddha = $state<BuddhaInfo | null>(null);

  // Modal xác nhận số lần lạy khi kết thúc
  let showConfirmModal = $state(false);
  let confirmCount = $state(0);
  let finishError = $state(false);
  let counterOwner = $state(untrack(() => principal));
  let appliedRoutineId = $state<string | null>(null);
  let completedRoutineId = $state<string | null>(null);
  let mounted = $state(false);
  let routineControlsHeight = $state(0);
  let audioPausedByRoutine = false;
  const unfinishedCounters = new Map<string | null, { count: number; selectedIdx: number; isPracticing: boolean }>();

  $effect(() => {
    if (principal === counterOwner) return;
    // Lỗi lưu không được mang số lạy của A sang B; giữ riêng trong phiên để A thử lại.
    if (count > 0) unfinishedCounters.set(counterOwner, { count, selectedIdx, isPracticing });
    else unfinishedCounters.delete(counterOwner);
    const restored = unfinishedCounters.get(principal);
    unfinishedCounters.delete(principal);
    stopAllAudio();
    wakeLockWanted = false;
    void wakeLock?.release();
    count = restored?.count ?? 0;
    selectedIdx = restored?.selectedIdx ?? 0;
    isPracticing = restored?.isPracticing ?? false;
    showConfirmModal = false;
    finishError = false;
    profileBuddha = null;
    imgLoaded = false;
    imgError = false;
    counterOwner = principal;
  });

  // Audio elements
  let musicEl: HTMLAudioElement | null = null;
  let moLoopEl: HTMLAudioElement | null = null;
  let moTapEl: HTMLAudioElement | null = null;
  const moTapStop = createAudioTapStop();
  const ambientCtrl = createAmbientSoundController();
  const wakeLock = typeof window === 'undefined' ? null : createWakeLockController();
  let wakeLockWanted = false;

  // Touch swipe support
  let touchStartX = 0;
  let touchStartY = 0;

  const rawBuddha = $derived(BUDDHAS[selectedIdx]);
  const buddha = $derived(
    localeStore.current === 'en' && BUDDHA_NAMES_EN[rawBuddha.id]
      ? { ...rawBuddha, ...BUDDHA_NAMES_EN[rawBuddha.id] }
      : rawBuddha
  );

  onMount(() => {
    musicEl = new Audio();
    musicEl.loop = true;
    musicEl.preload = 'none';
    moLoopEl = new Audio();
    moLoopEl.loop = true;
    moLoopEl.preload = 'none';
    moLoopEl.src = '/assets/audio/tieng-mo.m4a';
    moTapEl = new Audio();
    moTapEl.preload = 'none';
    moTapEl.src = '/assets/audio/tieng-mo.m4a';
    mounted = true;

    function handleVisibilityChange() {
      if (document.visibilityState === 'visible' && wakeLockWanted && open && isPracticing) {
        void wakeLock?.request();
      }
    }

    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  });

  let bellAudioCtx: AudioContext | null = null;

  onDestroy(() => {
    void wakeLock?.destroy();
    stopAllAudio();
    ambientCtrl.destroy();
    if (bellAudioCtx && bellAudioCtx.state !== 'closed') {
      void bellAudioCtx.close().catch(() => {});
      bellAudioCtx = null;
    }
  });

  $effect(() => {
    if (open && isPracticing && !(routineSetup && routinePaused)) {
      wakeLockWanted = true;
      void wakeLock?.request();
    } else {
      wakeLockWanted = false;
      void wakeLock?.release();
    }
  });

  $effect(() => {
    if (!open) profileBuddha = null;
  });

  function openProfile() {
    profileBuddha = { ...buddha };
  }

  function startSelectedAudio() {
    if (musicTrack !== 'none' && musicEl) {
      musicEl.src = musicTrack;
      musicEl.currentTime = 0;
      void musicEl.play().catch(() => {});
    }
    if (moLoop && moLoopEl) {
      moLoopEl.currentTime = 0;
      void moLoopEl.play().catch(() => {});
    }
    if (ambientSound !== 'none') {
      ambientCtrl.start(ambientSound);
    }
  }

  function stopAllAudio() {
    moTapStop.cancel();
    if (musicEl) {
      musicEl.pause();
      musicEl.currentTime = 0;
    }
    if (moLoopEl) {
      moLoopEl.pause();
      moLoopEl.currentTime = 0;
    }
    if (moTapEl) {
      moTapEl.pause();
      moTapEl.currentTime = 0;
    }
    ambientCtrl.stop();
  }

  function playBell() {
    try {
      const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctx) return;
      if (!bellAudioCtx || bellAudioCtx.state === 'closed') {
        bellAudioCtx = new Ctx();
      }
      const ctx = bellAudioCtx;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }
      const t = ctx.currentTime;
      const partials = [
        { f: 528, p: 0.35, d: 2.5 },
        { f: 1056, p: 0.12, d: 1.8 },
        { f: 1584, p: 0.06, d: 1.1 },
      ];
      partials.forEach(({ f, p, d }) => {
        const osc = ctx.createOscillator();
        const g = ctx.createGain();
        osc.type = 'sine';
        osc.frequency.setValueAtTime(f, t);
        osc.frequency.exponentialRampToValueAtTime(f * 0.98, t + d);
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(p, t + 0.015);
        g.gain.exponentialRampToValueAtTime(0.0001, t + d);
        osc.connect(g);
        g.connect(ctx.destination);
        osc.start(t);
        osc.stop(t + d);
      });
    } catch {}
  }

  function playMoTap() {
    if (!moTapEl) return;
    moTapEl.currentTime = 0;
    void moTapEl.play().catch(() => {});
    moTapStop.schedule(moTapEl, 400);
  }

  function handleStartPractice() {
    isPracticing = true;
    if (!(routineSetup && routinePaused)) startSelectedAudio();
  }

  $effect(() => {
    const paused = Boolean(routineSetup && routinePaused);
    if (!mounted || !open || !isPracticing) {
      audioPausedByRoutine = false;
      return;
    }
    if (paused) {
      stopAllAudio();
      audioPausedByRoutine = true;
    } else if (audioPausedByRoutine) {
      audioPausedByRoutine = false;
      startSelectedAudio();
    }
  });

  $effect(() => {
    const setup = routineSetup;
    if (!mounted || !open || !setup || setup.id === appliedRoutineId) return;
    untrack(() => {
      stopAllAudio();
      const phrase = setup.phrase.trim().toLocaleLowerCase('vi');
      const index = BUDDHAS.findIndex(item => [item.id, item.name, item.danhHieu]
        .some(value => value.trim().toLocaleLowerCase('vi') === phrase));
      handleSelectBuddha(index >= 0 ? index : 0);
      goal = Math.max(1, Math.floor(Number(setup.count) || 1));
      count = 0;
      showConfirmModal = false;
      profileBuddha = null;
      finishError = false;
      appliedRoutineId = setup.id;
      completedRoutineId = null;
      handleStartPractice();
    });
  });

  function completeRoutine() {
    if (!routineSetup || !onRoutineComplete || routineSetup.id !== appliedRoutineId
      || completedRoutineId === routineSetup.id || count < goal) return;
    completedRoutineId = routineSetup.id;
    isPracticing = false;
    wakeLockWanted = false;
    void wakeLock?.release();
    stopAllAudio();
    try {
      onRoutineComplete(count, buddha);
    } catch {
      // Giữ số lạy để luồng lưu công phu hiện có cho phép thử lại, không gọi callback lần hai.
      finishError = true;
      confirmCount = count;
      showConfirmModal = true;
    }
  }

  function handleProstrate() {
    if (!open || !isPracticing || showConfirmModal || profileBuddha || (routineSetup && routinePaused)) return;
    count += 1;
    if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
      try { navigator.vibrate(55); } catch {}
    }
    if (bellType === 'bell') playBell();
    else if (bellType === 'mo') playMoTap();
    completeRoutine();
  }

  function handleSelectBuddha(idx: number) {
    if (idx === selectedIdx) return;
    selectedIdx = idx;
    imgLoaded = false;
    imgError = false;
  }

  function handlePrevBuddha() {
    handleSelectBuddha((selectedIdx - 1 + BUDDHAS.length) % BUDDHAS.length);
  }

  function handleNextBuddha() {
    handleSelectBuddha((selectedIdx + 1) % BUDDHAS.length);
  }

  function handleTouchStart(e: TouchEvent) {
    if (e.touches.length === 1) {
      touchStartX = e.touches[0].clientX;
      touchStartY = e.touches[0].clientY;
    }
  }

  function handleTouchEnd(e: TouchEvent) {
    if (e.changedTouches.length === 1) {
      const deltaX = e.changedTouches[0].clientX - touchStartX;
      const deltaY = e.changedTouches[0].clientY - touchStartY;
      if (Math.abs(deltaX) > 45 && Math.abs(deltaX) > Math.abs(deltaY) * 1.5) {
        if (deltaX > 0) {
          handlePrevBuddha();
        } else {
          handleNextBuddha();
        }
      }
    }
  }

  // Quay về màn hình chuẩn bị (không lưu, không thoát)
  function handleReturnToSetup() {
    wakeLockWanted = false;
    void wakeLock?.release();
    stopAllAudio();
    isPracticing = false;
  }

  // Mở modal xác nhận số lần lạy
  function handleRequestFinish() {
    finishError = false;
    confirmCount = count;
    showConfirmModal = true;
  }

  export function finish(fromHistory = false) {
    if (!open) return true;
    profileBuddha = null;
    const finalCount = count;
    try {
      onExitRequest(finalCount, buddha, fromHistory);
    } catch {
      finishError = true;
      confirmCount = finalCount;
      showConfirmModal = true;
      return false;
    }
    finishError = false;
    count = 0;
    showConfirmModal = false;
    wakeLockWanted = false;
    void wakeLock?.release();
    stopAllAudio();
    isPracticing = false;
    return true;
  }

  // Xác nhận lưu công phu từ modal
  function handleConfirmSave() {
    count = Math.max(0, Math.floor(Number(confirmCount) || 0));
    finish();
  }

  // Thoát ngay không lưu
  function handleExitWithoutSave() {
    count = 0;
    finish();
  }

  // Đóng modal quay lại màn hình
  function handleCancelConfirm() {
    showConfirmModal = false;
  }

  function handleKey(e: KeyboardEvent) {
    if (!open || e.repeat || profileBuddha) return;
    if (showConfirmModal) {
      if (e.key === 'Escape') handleCancelConfirm();
      // Enter trên nút phải giữ hành động của nút đang được chọn.
      if (e.key === 'Enter' && !(e.target instanceof Element && e.target.closest('button'))) {
        e.preventDefault();
        handleConfirmSave();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      handleRequestFinish();
      return;
    }

    if (e.repeat && (e.key === ' ' || e.key === 'Enter')) { e.preventDefault(); return; }
    const tag = (e.target as HTMLElement)?.tagName;
    if (['SELECT', 'BUTTON', 'INPUT', 'TEXTAREA'].includes(tag)) return;

    if (e.repeat) return;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (isPracticing) handleProstrate();
      else handleStartPractice();
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      handleNextBuddha();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      handlePrevBuddha();
    }
  }
</script>

<svelte:window onkeydown={handleKey} />

{#if open}
  <!-- ════════════════════════════════════════════════════════════════ -->
  <!-- 1. KHI VÀO CHẾ ĐỘ LỄ LẠY: FULL MÀN HÌNH ẢNH PHẬT + NÚT HOÀN TẤT -->
  <!-- ════════════════════════════════════════════════════════════════ -->
  {#if isPracticing}
    <div
      class="lp-fullscreen-screen"
      class:lp-fullscreen-screen--routine={Boolean(routineControls)}
      style:--routine-controls-height={`${routineControlsHeight}px`}
      role="region"
      aria-label={isEn ? 'Fullscreen Prostration Space' : 'Không gian lễ lạy toàn màn hình'}
      ontouchstart={handleTouchStart}
      ontouchend={handleTouchEnd}
    >
      {#if routineControls}
        <div class="lp-routine-controls" bind:clientHeight={routineControlsHeight}>
          {@render routineControls()}
        </div>
      {/if}
      <!-- Nút quay về màn hình chuẩn bị ở góc trái -->
      <button
        type="button"
        class="lp-fullscreen-back-btn"
        onclick={handleReturnToSetup}
        aria-label={isEn ? 'Return to setup screen' : 'Quay về màn hình chuẩn bị'}
      >
        ← {t.back}
      </button>

      <!-- Nút Hoàn tất ở góc phải → mở modal lưu công phu -->
      <button
        type="button"
        class="lp-fullscreen-finish-btn"
        onclick={handleRequestFinish}
        aria-label={t.finish}
      >
        {t.finish}
      </button>

      <!-- Tôn tượng Phật Bồ Tát trang nghiêm toàn màn hình -->
      <button type="button" class="lp-fullscreen-portrait-wrap" onclick={handleProstrate} aria-label={t.tapToBow}>
        <img class="lp-fullscreen-backdrop" src={buddha.image} alt="" aria-hidden="true" />
        <span class="lp-fullscreen-portrait">
          {#if !imgError}
            <img
              class="lp-fullscreen-img"
              class:loaded={imgLoaded}
              src={buddha.image}
              alt={buddha.name}
              loading="eager"
              onload={() => { imgLoaded = true; }}
              onerror={() => { imgError = true; imgLoaded = true; }}
            />
          {:else}
            <span class="lp__img-fallback" aria-label={buddha.name}>🙏</span>
          {/if}
        </span>
      </button>

      <!-- Thanh thông tin dưới cùng: danh hiệu + hướng dẫn đảnh lễ -->
      <div class="lp-fullscreen-info-bar">
        <span class="lp-fullscreen-danh-hieu">{buddha.danhHieu}</span>
        <div class="lp-fullscreen-name-row">
          <span class="lp-fullscreen-buddha-name">{buddha.name}</span>
          <button type="button" class="lp__profile-button lp__profile-button--fullscreen" onclick={openProfile}
            aria-label={profileUi.triggerFor.replace('{name}', buddha.name)} aria-haspopup="dialog">
            <Info size={14} aria-hidden="true" /> {profileUi.trigger}
          </button>
        </div>
        <p class="lp-fullscreen-respect-note">
          {localeStore.current === 'en'
            ? 'Please place the device in a clean, elevated position and practice prostrations as before a sacred statue'
            : 'Kính thỉnh quý đạo hữu an trí thiết bị nơi trang nghiêm, cao ráo và cung kính đảnh lễ như trước tôn tượng'}
        </p>
        <button type="button" class="lp-fullscreen-counter" onclick={handleProstrate} aria-label={t.tapToBow}>
          <span aria-live="polite" aria-atomic="true">{count} {t.bowsUnit}</span>
          <span class="lp-fullscreen-counter-hint">{t.tapToBow}</span>
        </button>
      </div>
    </div>

  <!-- ════════════════════════════════════════════════════════════════ -->
  <!-- 2. MÀN HÌNH CHUẨN BỊ (CHỌN PHẬT & DROPDOWN ÂM THANH GỌN GÀNG)    -->
  <!-- ════════════════════════════════════════════════════════════════ -->
  {:else}
    <section class="lp practice-theme" data-practice="bowing" aria-label={t.bowingTitle}>

      <!-- HEADER -->
      <header class="lp__header">
        <div class="lp__header-left">
          <button
            type="button"
            class="lp__hbtn"
            onclick={handleRequestFinish}
            title={t.exit}
          >
            <span aria-hidden="true">←</span> {t.exit}
          </button>

          <div class="lp__title-wrap">
            <span class="lp__lotus" aria-hidden="true">🪷</span>
            <strong class="lp__header-title">{t.bowingTitle}</strong>
          </div>
        </div>

        <div class="lp__header-actions">
          <button
            type="button"
            class="lp__hbtn lp__hbtn--primary"
            onclick={handleRequestFinish}
            title={t.finish}
          >
            {t.finish}
          </button>
        </div>
      </header>

      <!-- MAIN BODY -->
      <main class="lp__main">
        <div class="lp__setup-stage">

          <!-- Khung ảnh Phật và mũi tên 2 bên -->
          <div
            class="lp__carousel"
            role="region"
            aria-label={isEn ? 'Buddha Statue & Selection' : 'Tôn tượng và chuyển đổi vị Phật'}
            ontouchstart={handleTouchStart}
            ontouchend={handleTouchEnd}
          >
            <button
              type="button"
              class="lp__arrow-btn lp__arrow-btn--prev"
              onclick={handlePrevBuddha}
              aria-label={isEn ? 'Previous Buddha' : 'Vị Phật trước'}
              title={isEn ? 'Previous' : 'Vị trước'}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="15 18 9 12 15 6"></polyline>
              </svg>
            </button>

            <div class="lp__portrait-box">
              <div class="lp__halo" aria-hidden="true"></div>

              {#if !imgError}
                <img
                  class="lp__img"
                  class:loaded={imgLoaded}
                  src={buddha.image}
                  alt={buddha.name}
                  loading="eager"
                  onload={() => { imgLoaded = true; }}
                  onerror={() => { imgError = true; imgLoaded = true; }}
                />
              {:else}
                <div class="lp__img-fallback" aria-label={buddha.name}>🙏</div>
              {/if}
            </div>

            <button
              type="button"
              class="lp__arrow-btn lp__arrow-btn--next"
              onclick={handleNextBuddha}
              aria-label={isEn ? 'Next Buddha' : 'Vị Phật tiếp theo'}
              title={isEn ? 'Next' : 'Vị tiếp theo'}
            >
              <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="9 18 15 12 9 6"></polyline>
              </svg>
            </button>
          </div>

          <!-- Đại danh hiệu & Tên -->
          <div class="lp__setup-meta">
            <div class="lp__badge" role="status">
              <span class="lp__pulse-dot" aria-hidden="true"></span>
              <span>{buddha.danhHieu}</span>
            </div>
            <div class="lp__name-row">
              <p class="lp__buddha-name">{buddha.name} ({selectedIdx + 1}/{BUDDHAS.length})</p>
              <button type="button" class="lp__profile-button" onclick={openProfile}
                aria-label={profileUi.triggerFor.replace('{name}', buddha.name)} aria-haspopup="dialog">
                <Info size={14} aria-hidden="true" /> {profileUi.trigger}
              </button>
            </div>
          </div>

          <!-- BẢNG DROPDOWN TÙY CHỌN GỌN GÀNG -->
          <div class="lp__dropdowns-panel" role="region" aria-label={isEn ? 'Practice session settings' : 'Tùy chọn thời khóa'}>

            <!-- 1. Mục tiêu -->
            <div class="lp__field">
              <label class="lp__field-label" for="lp-goal-select">
                {t.goalSelectLabel}
              </label>
              <select
                id="lp-goal-select"
                class="lp__select"
                value={String(goal)}
                onchange={(e) => (goal = Number((e.currentTarget as HTMLSelectElement).value))}
              >
                {#each GOALS as g}
                  <option value={String(g)}>{goalLabels[g]}</option>
                {/each}
              </select>
            </div>

            <!-- 2. Tiếng khi lạy -->
            <div class="lp__field">
              <label class="lp__field-label" for="lp-bell-select">
                {t.bellSelectLabel}
              </label>
              <select
                id="lp-bell-select"
                class="lp__select"
                value={bellType}
                onchange={(e) => {
                  bellType = (e.currentTarget as HTMLSelectElement).value as 'bell' | 'mo' | 'none';
                  if (bellType === 'bell') playBell();
                  else if (bellType === 'mo') playMoTap();
                }}
              >
                <option value="bell">{t.bellOptionBell}</option>
                <option value="mo">{t.bellOptionMo}</option>
                <option value="none">{t.bellOptionNone}</option>
              </select>
            </div>

            <!-- 3. Nhạc thiền -->
            <div class="lp__field">
              <label class="lp__field-label" for="lp-music-select">
                {t.musicSelectLabel}
              </label>
              <select
                id="lp-music-select"
                class="lp__select"
                value={musicTrack}
                onchange={(e) => (musicTrack = (e.currentTarget as HTMLSelectElement).value as MeditationTrack | 'none')}
              >
                <option value="none">{t.noMeditationMusic}</option>
                {#each MEDITATION_TRACK_OPTIONS as opt}
                  <option value={opt.track}>{localizeUi(opt.label)}</option>
                {/each}
              </select>
            </div>

            <!-- 4. Mõ tụng liên tục -->
            <div class="lp__field">
              <label class="lp__field-label" for="lp-moloop-select">
                {t.moLoopSelectLabel}
              </label>
              <select
                id="lp-moloop-select"
                class="lp__select"
                value={moLoop ? 'on' : 'off'}
                onchange={(e) => (moLoop = (e.currentTarget as HTMLSelectElement).value === 'on')}
              >
                <option value="off">{t.moLoopOff}</option>
                <option value="on">{t.moLoopOn}</option>
              </select>
            </div>

            <!-- 5. Âm thanh thiên nhiên -->
            <div class="lp__field lp__field--full">
              <label class="lp__field-label" for="lp-ambient-select">
                {t.ambientSelectLabel}
              </label>
              <select
                id="lp-ambient-select"
                class="lp__select"
                value={ambientSound}
                onchange={(e) => (ambientSound = (e.currentTarget as HTMLSelectElement).value as AmbientSoundType)}
              >
                <option value="none">{t.noAmbientNature}</option>
                {#each AMBIENT_SOUND_OPTIONS as opt}
                  {#if opt.id !== 'none'}
                    <option value={opt.id}>{getAmbientSoundLabel(opt.id, isEn)}</option>
                  {/if}
                {/each}
              </select>
            </div>

          </div>

        </div>
      </main>

      <!-- FOOTER -->
      <footer class="lp__footer">
        <button
          type="button"
          class="lp__action-btn lp__action-btn--start"
          onclick={handleStartPractice}
          aria-label={t.startBowing}
        >
          {t.startBowing}
        </button>
        <p class="lp__hint">
          {t.bowingHint}
        </p>
      </footer>
    </section>
  {/if}

  {#if profileBuddha}
    <BuddhaProfileDialog buddhaId={profileBuddha.id} buddhaName={profileBuddha.name} onClose={() => profileBuddha = null} />
  {/if}

  <!-- ════════════════════════════════════════════════════════════════ -->
  <!-- 3. MODAL XÁC NHẬN SỐ LẦN LẠY (BẢO TOÀN CÔNG PHU TU HỌC)          -->
  <!-- ════════════════════════════════════════════════════════════════ -->
  {#if showConfirmModal}
    <dialog
      class="lp__dialog-backdrop"
      use:modalDialog
      aria-labelledby="lp-dialog-title"
      oncancel={(e) => { e.preventDefault(); handleCancelConfirm(); }}
      onclick={(e) => { if (e.target === e.currentTarget) handleCancelConfirm(); }}
    >
      <div
        class="lp__dialog"
        data-dialog-glass
        role="document"
      >
        <div class="lp__dialog-icon" aria-hidden="true">🪷</div>

        <h3 id="lp-dialog-title" class="lp__dialog-title">
          {t.confirmBowingTitle}
        </h3>

        <p class="lp__dialog-question">
          {localeStore.current === 'en' ? 'How many prostrations did you offer to ' : 'Bạn đã đảnh lễ '}
          <strong>{buddha.name}</strong>
          {localeStore.current === 'en' ? '?' : ' bao nhiêu lần?'}
        </p>

        <!-- Ô nhập số lần lạy -->
        <div class="lp__dialog-input-wrap">
          <button
            type="button"
            class="lp__dialog-adj-btn"
            onclick={() => { confirmCount = Math.max(0, confirmCount - 1); }}
            title={isEn ? 'Decrease by 1' : 'Giảm 1'}
          >
            −
          </button>

          <input
            type="number"
            class="lp__dialog-input"
            min="0"
            max="10000"
            bind:value={confirmCount}
            aria-label={isEn ? 'Number of prostrations' : 'Số lần đảnh lễ'}
          />

          <button
            type="button"
            class="lp__dialog-adj-btn"
            onclick={() => { confirmCount = confirmCount + 1; }}
            title={isEn ? 'Increase by 1' : 'Tăng 1'}
          >
            +
          </button>
        </div>

        <!-- Các nút tăng nhanh -->
        <div class="lp__dialog-quick-chips">
          <button type="button" onclick={() => { confirmCount = confirmCount + 3; }}>+3 {t.bowsUnit}</button>
          <button type="button" onclick={() => { confirmCount = confirmCount + 7; }}>+7 {t.bowsUnit}</button>
          <button type="button" onclick={() => { confirmCount = confirmCount + 21; }}>+21 {t.bowsUnit}</button>
          <button type="button" onclick={() => { confirmCount = 108; }}>108 {t.bowsUnit}</button>
        </div>

        <!-- Kệ hồi hướng công đức -->
        <div class="lp__dialog-dedication" aria-label={isEn ? 'Dedication of Merit' : 'Kệ hồi hướng công đức'}>
          <p class="lp__dedication-title">{isEn ? '— Dedication of Merit —' : '— Kệ Hồi Hướng Công Đức —'}</p>
          <p class="lp__dedication-line">{isEn ? 'May the merit of this practice' : 'Nguyện đem công đức này'}</p>
          <p class="lp__dedication-line">{isEn ? 'Be shared with all beings' : 'Hướng về khắp tất cả'}</p>
          <p class="lp__dedication-line">{isEn ? 'May we and all living beings' : 'Đệ tử và chúng sinh'}</p>
          <p class="lp__dedication-line">{isEn ? 'Together realize the Buddha Way.' : 'Đều trọn thành Phật đạo.'}</p>
        </div>

        <!-- Nút hành động modal -->
        {#if finishError}<p role="alert">{profileUi.prostrationSaveError}</p>{/if}
        <div class="lp__dialog-actions">
          <button
            type="button"
            class="lp__dialog-btn lp__dialog-btn--ok"
            onclick={handleConfirmSave}
          >
            {t.recordBows.replace('{count}', String(confirmCount))}
          </button>

          <div class="lp__dialog-subactions dialog-actions-balanced">
            <button
              type="button"
              class="lp__dialog-btn lp__dialog-btn--cancel"
              onclick={handleCancelConfirm}
            >
              {t.continueBowing}
            </button>

            <button
              type="button"
              class="lp__dialog-btn lp__dialog-btn--dismiss"
              onclick={handleExitWithoutSave}
            >
              {t.exitWithoutSave}
            </button>
          </div>
        </div>

      </div>
    </dialog>
  {/if}
{/if}

<style>
  /* Giữ vùng đếm và tôn tượng tĩnh khi chạm, vẫn giữ focus bàn phím. */
  .lp-fullscreen-counter {
    -webkit-tap-highlight-color: transparent;
  }

  /* ══════════════════════════════════════════════════════════════════ */
  /* 1. CHẾ ĐỘ FULL MÀN HÌNH PURE TÔN TƯỢNG + NÚT HOÀN TẤT GÓC PHẢI     */
  /* ══════════════════════════════════════════════════════════════════ */
  .lp-fullscreen-screen {
    position: fixed; inset: 0; z-index: 10600;
    width: 100vw; height: 100dvh;
    background: #000;
    display: flex; align-items: center; justify-content: center;
    overflow: hidden;
    cursor: pointer;
    touch-action: manipulation;
    user-select: none;
    animation: lp-fadein .25s ease-out;
  }

  .lp-routine-controls {
    position: absolute;
    inset: 0 0 auto;
    z-index: 60;
    max-height: 50dvh;
    overflow-y: auto;
    cursor: auto;
    user-select: auto;
  }
  .lp-fullscreen-screen--routine .lp-fullscreen-back-btn,
  .lp-fullscreen-screen--routine .lp-fullscreen-finish-btn {
    top: calc(var(--routine-controls-height) + var(--space-page));
  }

  /* Nút Quay lại ở góc trái trên cùng */
  .lp-fullscreen-back-btn {
    position: absolute;
    top: calc(16px + env(safe-area-inset-top, 0px));
    left: calc(16px + env(safe-area-inset-left, 0px));
    z-index: 50;
    min-height: 40px;
    padding: 0 18px;
    border-radius: 999px;
    border: 1px solid rgba(255, 255, 255, 0.25);
    background: rgba(0, 0, 0, 0.55);
    color: rgba(255, 255, 255, 0.88);
    font: 600 13px/1 var(--font-app, system-ui, sans-serif);
    letter-spacing: .02em;
    cursor: pointer;
    backdrop-filter: blur(10px);
    transition: transform .15s, background .15s;
  }
  .lp-fullscreen-back-btn:hover {
    background: rgba(0, 0, 0, 0.75);
    transform: scale(1.04);
  }
  .lp-fullscreen-back-btn:active {
    transform: scale(.94);
  }

  /* Nút hoàn tất và lưu công phu */
  .lp-fullscreen-finish-btn {
    position: absolute;
    top: calc(16px + env(safe-area-inset-top, 0px));
    right: calc(16px + env(safe-area-inset-right, 0px));
    z-index: 50;
    min-height: 40px;
    padding: 0 20px;
    border-radius: 999px;
    border: 1px solid #ffd700;
    background: linear-gradient(135deg, #d4af37, #a07c10);
    color: #1a0f05;
    font: 700 14px/1 var(--font-app, system-ui, sans-serif);
    letter-spacing: .02em;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.7), 0 0 16px rgba(212, 175, 55, 0.4);
    backdrop-filter: blur(8px);
    transition: transform .15s, box-shadow .15s;
  }
  .lp-fullscreen-finish-btn:hover {
    transform: scale(1.06);
    background: linear-gradient(135deg, #e4bf47, #b08c20);
    box-shadow: 0 6px 24px rgba(212, 175, 55, 0.6);
  }
  .lp-fullscreen-finish-btn:active {
    transform: scale(.94);
  }

  /* Vùng chạm toàn màn hình */

  /* Khung ảnh toàn màn hình */
  .lp-fullscreen-portrait {
    position: absolute; inset: 0;
    width: 100%; height: 100%;
    display: flex; align-items: center; justify-content: center;
  }

  /* Ảnh Phật phóng đại toàn giao diện */
  .lp-fullscreen-img {
    width: 100%; height: 100%;
    max-width: 100vw; max-height: 100dvh;
    object-fit: cover;
    object-position: center top;
    pointer-events: none;
    user-select: none;
    -webkit-user-select: none;
    opacity: 0;
    transition: opacity .32s ease;
    will-change: opacity;
    -webkit-tap-highlight-color: transparent !important;
  }
  .lp-fullscreen-img.loaded {
    opacity: 1;
  }

  @media (min-aspect-ratio: 1/1) {
    .lp-fullscreen-img {
      object-fit: contain;
      object-position: center center;
    }
  }

  /* Thanh thông tin dưới cùng fullscreen: danh hiệu + tên + bộ đếm */
  .lp-fullscreen-info-bar {
    position: absolute;
    bottom: 0; left: 0; right: 0;
    z-index: 40;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 2px;
    padding: 18px 24px calc(20px + env(safe-area-inset-bottom, 0px));
    background: linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.55) 60%, transparent 100%);
    pointer-events: none;
    text-align: center;
  }
  .lp-fullscreen-danh-hieu {
    display: inline-block;
    padding: 5px 16px 6px;
    border-radius: 999px;
    background: rgba(10, 6, 2, 0.72);
    border: 1px solid rgba(255, 210, 60, 0.55);
    box-shadow: 0 0 12px rgba(255, 200, 0, 0.18), inset 0 0 8px rgba(255, 200, 0, 0.07);
    backdrop-filter: blur(8px);
    font-size: clamp(12px, 3vw, 16px);
    font-weight: 500;
    color: rgba(255, 220, 80, 0.95);
    letter-spacing: 0.05em;
    text-shadow: 0 1px 6px rgba(0,0,0,0.8);
    line-height: 1.4;
  }
  .lp-fullscreen-buddha-name {
    font-size: clamp(15px, 4.5vw, 22px);
    font-weight: 700;
    color: #fff;
    letter-spacing: 0.03em;
    text-shadow: 0 2px 12px rgba(0,0,0,0.8), 0 0 24px rgba(255,215,0,0.3);
    line-height: 1.2;
  }
  .lp-fullscreen-counter {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 6px;
    pointer-events: auto;
    min-width: 160px;
    min-height: 52px;
    padding: 10px 20px;
    border: 1px solid rgba(255, 220, 120, .6);
    border-radius: 8px;
    background: #17140e;
    cursor: pointer;
    touch-action: manipulation;
    font-family: inherit;
    font-variant-numeric: tabular-nums;
    margin-top: 4px;
    font-size: clamp(12px, 3vw, 16px);
    font-weight: 600;
    color: rgba(255, 220, 120, 0.9);
    letter-spacing: 0.06em;
    text-shadow: 0 1px 6px rgba(0,0,0,0.6);
  }
  .lp-fullscreen-counter-hint {
    max-width: 100%;
    padding: 4px 8px;
    border-radius: 4px;
    background: rgba(255, 220, 120, 0.08);
    color: rgba(255, 220, 120, 0.75);
    font-size: 12px;
    font-weight: 400;
    line-height: 1.4;
    letter-spacing: 0;
    text-align: center;
  }

  /* ══════════════════════════════════════════════════════════════════ */
  /* 2. GIAO DIỆN CHUẨN BỊ (SETUP TRƯỚC KHI VÀO ĐẢNH LỄ)               */
  /* ══════════════════════════════════════════════════════════════════ */
  .lp {
    box-sizing: border-box;
    position: fixed; z-index: 10600; inset: 0;
    display: grid;
    grid-template-rows: auto 1fr auto;
    width: 100%; height: 100dvh;
    background: radial-gradient(circle at 50% 25%, #3e2a18 0%, #1c1005 50%, #0d0702 100%);
    color: #fff;
    font-family: var(--font-app, system-ui, sans-serif);
    isolation: isolate;
    overflow: hidden;
    animation: lp-fadein .24s ease-out;
  }
  .lp::before {
    position: absolute; z-index: -1; inset: 0;
    background-image:
      radial-gradient(circle at 20% 20%, rgba(255,210,100,.08) 0 1px, transparent 1.5px),
      radial-gradient(circle at 80% 70%, rgba(255,180,50,.07) 0 1px, transparent 1.5px);
    background-size: 46px 46px, 64px 64px;
    content: '';
    pointer-events: none;
  }

  /* HEADER CHUẨN BỊ */
  .lp__header {
    display: flex; align-items: center; justify-content: space-between;
    padding: calc(12px + env(safe-area-inset-top, 0px))
             max(16px, env(safe-area-inset-right, 0px))
             10px
             max(16px, env(safe-area-inset-left, 0px));
    border-bottom: 1px solid rgba(212,175,55,.14);
    background: rgba(18, 11, 4, 0.75);
    backdrop-filter: blur(12px);
    z-index: 10;
  }
  .lp__header-left {
    display: flex; align-items: center; gap: 10px;
  }
  .lp__title-wrap {
    display: flex; align-items: center; gap: 6px;
  }
  .lp__lotus { font-size: 20px; }
  .lp__header-title {
    font: 700 15px/1.2 inherit; color: #f5e0b5;
  }
  .lp__header-actions {
    display: flex; align-items: center; gap: 8px;
  }

  .lp__hbtn {
    min-height: 36px; padding: 0 14px;
    border: 1px solid rgba(255,255,255,.24); border-radius: 999px;
    background: rgba(255,255,255,.07); color: #f0e4c8;
    cursor: pointer; font: 700 12px/1 inherit;
    display: inline-flex; align-items: center; gap: 6px;
    transition: background .18s, border-color .18s, transform .12s;
    white-space: nowrap;
  }
  .lp__hbtn:hover {
    background: rgba(255,255,255,.15);
    border-color: rgba(255,255,255,.45);
  }
  .lp__hbtn--primary {
    border-color: #d4af37; background: #c9973f; color: #1a0e04;
    box-shadow: 0 4px 16px rgba(201,151,63,.32);
  }
  .lp__hbtn--primary:hover { background: #e0ac48; }

  /* MAIN CHUẨN BỊ */
  .lp__main {
    display: flex; align-items: center; justify-content: center;
    min-height: 0; overflow-y: auto; overscroll-behavior: contain;
    padding: 8px 14px;
  }
  .lp__setup-stage {
    display: flex; flex-direction: column; align-items: center;
    width: 100%; max-width: 540px; text-align: center;
    margin: auto 0;
  }

  /* Carousel */
  .lp__carousel {
    display: flex; align-items: center; justify-content: center;
    gap: 12px; width: 100%; max-width: 440px;
    margin-bottom: 4px;
    user-select: none;
    touch-action: pan-y;
  }
  .lp__arrow-btn {
    width: 44px; height: 44px; border-radius: 50%;
    flex-shrink: 0;
    display: grid; place-items: center;
    border: 1px solid rgba(212,175,55,.45);
    background: rgba(38, 23, 10, 0.8);
    color: #ffd700;
    cursor: pointer;
    box-shadow: 0 4px 16px rgba(0,0,0,.4), 0 0 10px rgba(212,175,55,.18);
    backdrop-filter: blur(8px);
    transition: transform .18s cubic-bezier(.34,1.56,.64,1), background .18s, border-color .18s;
  }
  .lp__arrow-btn:hover {
    transform: scale(1.1);
    background: rgba(60, 36, 16, 0.95);
    border-color: #ffd700;
    color: #fff4bd;
  }
  .lp__arrow-btn:active { transform: scale(.92); }

  .lp__portrait-box {
    position: relative;
    display: flex; align-items: center; justify-content: center;
    width: min(38vw, 140px); aspect-ratio: 9/16;
  }
  .lp__halo {
    position: absolute; inset: -24px; border-radius: 50%;
    background: radial-gradient(circle, rgba(255,215,0,.28) 0%, transparent 68%);
    filter: blur(20px); pointer-events: none;
    animation: halo-breathe 5s ease-in-out infinite alternate;
  }
  .lp__img {
    position: relative; z-index: 2; border-radius: var(--radius-card);
    max-width: 100%; max-height: 100%; object-fit: contain;
    box-shadow: 0 12px 34px rgba(0,0,0,.6), 0 0 24px rgba(212,175,55,.2);
    opacity: 0; transition: opacity .32s ease;
  }
  .lp__img.loaded { opacity: 1; }
  .lp__img-fallback { font-size: 64px; }

  .lp__setup-meta {
    display: flex; flex-direction: column; align-items: center;
    gap: 3px; margin: 4px 0 6px;
  }
  .lp__buddha-name {
    margin: 0; font-size: 11.5px; font-weight: 700;
    letter-spacing: .06em; text-transform: uppercase;
    color: #e8d9b0;
  }

  .lp__badge {
    display: inline-flex; align-items: center; gap: 7px;
    padding: 5px 14px;
    border-radius: 999px; font-size: 12.5px; font-weight: 700;
    letter-spacing: .02em;
    border: 1px solid rgba(212,175,55,.5);
    background: rgba(180,130,40,.24); color: #fedda2;
    box-shadow: 0 0 20px rgba(212,175,55,.16);
    backdrop-filter: blur(8px);
    max-width: 92%; text-align: center;
  }
  .lp__pulse-dot {
    width: 7px; height: 7px; border-radius: 50%; flex-shrink: 0;
    background: #fbbf24; box-shadow: 0 0 7px #fbbf24;
    animation: dot-pulse 1.9s ease-in-out infinite;
  }

  /* DROPDOWNS PANEL */
  .lp__dropdowns-panel {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 8px 10px;
    width: 100%; max-width: 500px;
    padding: 10px 14px;
    background: rgba(22, 13, 5, 0.6);
    border: 1px solid rgba(212,175,55,.2);
    border-radius: 16px;
    backdrop-filter: blur(10px);
    margin-top: 2px;
    text-align: left;
  }
  .lp__field {
    display: flex; flex-direction: column; gap: 4px;
  }
  .lp__field--full {
    grid-column: 1 / -1;
  }
  .lp__field-label {
    font-size: 10.5px; font-weight: 700; letter-spacing: .04em;
    text-transform: uppercase; color: #bca47e;
  }
  .lp__select {
    width: 100%; height: 38px; padding: 0 10px;
    border-radius: 10px;
    border: 1px solid rgba(212,175,55,.32);
    background: rgba(35, 21, 9, 0.95);
    color: #f7ebc8; font: 600 12px/1 inherit;
    cursor: pointer;
    outline: none;
    transition: border-color .15s, background .15s;
  }
  .lp__select:focus {
    border-color: #ffd700;
    box-shadow: 0 0 0 2px rgba(212,175,55,.25);
  }
  .lp__select option {
    background: #241407;
    color: #f5e4bd;
    padding: 8px;
  }

  /* FOOTER CHUẨN BỊ */
  .lp__footer {
    display: flex; flex-direction: column; align-items: center; gap: 6px;
    padding: 10px max(16px, env(safe-area-inset-right, 0px))
             max(16px, env(safe-area-inset-bottom, 0px))
             max(16px, env(safe-area-inset-left, 0px));
    border-top: 1px solid rgba(212,175,55,.14);
    background: rgba(18, 11, 4, 0.75);
    backdrop-filter: blur(12px);
    z-index: 10;
  }
  .lp__action-btn {
    width: 100%; max-width: 320px; min-height: 54px;
    border-radius: 999px;
    font: 700 16px/1 inherit; letter-spacing: .04em;
    cursor: pointer; display: flex; align-items: center; justify-content: center; gap: 8px;
    transition: transform .12s, box-shadow .12s, background .15s;
    touch-action: manipulation;
  }
  .lp__action-btn--start {
    border: 1.5px solid #ffd700;
    background: linear-gradient(135deg, #d4af37 0%, #a27415 100%);
    color: #1a0e04;
    box-shadow: 0 8px 26px rgba(201,151,63,.4), inset 0 2px 4px rgba(255,255,255,.35);
  }
  .lp__action-btn--start:hover {
    background: linear-gradient(135deg, #e3be46 0%, #b2821b 100%);
  }
  .lp__hint {
    margin: 0; font-size: 11px; color: #8a7b67;
  }

  /* ══════════════════════════════════════════════════════════════════ */
  /* 3. MODAL XÁC NHẬN SỐ LẦN LẠY (BẢO TOÀN CÔNG PHU)                  */
  /* ══════════════════════════════════════════════════════════════════ */
  .lp__dialog-backdrop {
    position: fixed; inset: 0; z-index: 10800;
    width: 100%; height: 100dvh; max-width: none; max-height: none;
    margin: 0; border: 0; color: inherit; box-sizing: border-box;
    background: rgba(0, 0, 0, 0.78);
    backdrop-filter: blur(12px);
    display: flex; align-items: center; justify-content: center;
    padding: 16px;
    animation: lp-fadein .2s ease-out;
  }
  .lp__dialog-backdrop::backdrop { background: transparent; }
  .lp__dialog {
    width: 100%; max-width: 420px;
    background: var(--dialog-surface-background, var(--card));
    border: 1.5px solid var(--dialog-surface-border, var(--border));
    border-radius: 20px;
    padding: 22px 20px;
    text-align: center;
    box-shadow: var(--dialog-surface-shadow, var(--shadow-xl));
    display: flex; flex-direction: column; align-items: center;
    gap: 12px;
    animation: lp-popin .22s cubic-bezier(.34,1.56,.64,1);
  }
  .lp__dialog-icon { font-size: 36px; }
  .lp__dialog-title {
    margin: 0; font-size: 18px; font-weight: 700; color: #ffd700;
  }
  .lp__dialog-question {
    margin: 0; font-size: 14px; line-height: 1.5; color: #f0e2ca;
  }
  .lp__dialog-question strong { color: #ffe480; }

  .lp__dialog-input-wrap {
    display: flex; align-items: center; justify-content: center;
    gap: 8px; width: 100%; max-width: 260px;
    margin: 4px 0;
  }
  .lp__dialog-adj-btn {
    width: 44px; height: 44px; border-radius: 50%;
    border: 1px solid rgba(212,175,55,.4);
    background: rgba(255,255,255,.08); color: #ffd700;
    font-size: 22px; font-weight: 700; cursor: pointer;
    display: grid; place-items: center;
    transition: all .14s;
  }
  .lp__dialog-adj-btn:hover {
    background: rgba(212,175,55,.25); border-color: #ffd700;
  }
  .lp__dialog-input {
    flex: 1; height: 50px; text-align: center;
    font-size: 26px; font-weight: 800; color: #ffd700;
    background: rgba(10, 6, 2, 0.7);
    border: 1.5px solid #d4af37; border-radius: 12px;
    font-variant-numeric: tabular-nums;
    outline: none;
  }
  .lp__dialog-input:focus {
    box-shadow: 0 0 0 3px rgba(212,175,55,.3);
  }

  .lp__dialog-quick-chips {
    display: flex; flex-wrap: wrap; justify-content: center; gap: 6px;
  }
  .lp__dialog-quick-chips button {
    padding: 5px 11px; border-radius: 999px;
    border: 1px solid rgba(255,255,255,.14);
    background: rgba(255,255,255,.05); color: #ded0b8;
    font: 600 11px/1 inherit; cursor: pointer;
    transition: all .12s;
  }
  .lp__dialog-quick-chips button:hover {
    background: rgba(212,175,55,.2); border-color: #d4af37; color: #fff0a8;
  }

  .lp__dialog-actions {
    display: flex; flex-direction: column; gap: 8px;
    width: 100%; margin-top: 4px;
  }
  .lp__dialog-btn {
    width: 100%; min-height: 44px; border-radius: 12px;
    font: 700 14px/1 inherit; cursor: pointer;
    transition: all .15s;
  }
  .lp__dialog-btn--ok {
    border: 1.5px solid #ffd700;
    background: linear-gradient(135deg, #d4af37 0%, #a27415 100%);
    color: #170c03; font-size: 15px;
    box-shadow: 0 4px 18px rgba(201,151,63,.4);
  }
  .lp__dialog-btn--ok:hover {
    background: linear-gradient(135deg, #e3be46 0%, #b2821b 100%);
  }
  .lp__dialog-subactions {
    display: grid; grid-template-columns: 1fr 1fr; gap: 8px;
  }
  .lp__dialog-btn--cancel {
    border: 1px solid rgba(255,255,255,.2);
    background: rgba(255,255,255,.06); color: #e5d8be;
  }
  .lp__dialog-btn--cancel:hover {
    background: rgba(255,255,255,.12);
  }
  .lp__dialog-btn--dismiss {
    border: 1px solid rgba(255,100,100,.3);
    background: rgba(200,50,50,.1); color: #fca5a5;
  }
  .lp__dialog-btn--dismiss:hover {
    background: rgba(200,50,50,.2);
  }

  /* ── ANIMATIONS ── */
  @keyframes lp-fadein { from { opacity: 0; } to { opacity: 1; } }
  @keyframes lp-popin { from { opacity: 0; transform: scale(.93); } to { opacity: 1; transform: scale(1); } }
  @keyframes halo-breathe { from { transform: scale(.9); opacity: .55; } to { transform: scale(1.1); opacity: 1; } }
  @keyframes dot-pulse { 0%,100% { transform: scale(.85); opacity: .65; } 50% { transform: scale(1.25); opacity: 1; } }

  /* ── RESPONSIVE ── */
  @media (max-width: 520px) {
    .lp__dropdowns-panel { grid-template-columns: 1fr; gap: 6px; padding: 8px 10px; }
    .lp__field-label { font-size: 10px; }
    .lp__select { height: 36px; font-size: 11.5px; }
    .lp__arrow-btn { width: 44px; min-width: 44px; height: 38px; }
    .lp__portrait-box { width: min(44vw, 150px); }
    .lp__action-btn { min-height: 50px; font-size: 15px; }
    .lp-fullscreen-finish-btn { min-height: 36px; padding: 0 16px; font-size: 13px; }
    .lp-fullscreen-back-btn { min-height: 36px; padding: 0 14px; font-size: 12px; }
  }

  @media (max-height: 660px) {
    .lp__portrait-box { width: min(28vw, 120px); }
    .lp__setup-meta { margin: 2px 0 3px; }
    .lp__dropdowns-panel { padding: 6px 10px; gap: 4px 8px; }
    .lp__select { height: 32px; font-size: 11px; }
    .lp__action-btn { min-height: 44px; font-size: 14px; }
  }

  .lp-fullscreen-back-btn {
    top: calc(16px + env(safe-area-inset-top, 0px));
    left: calc(16px + env(safe-area-inset-left, 0px));
  }
  .lp-fullscreen-finish-btn {
    top: calc(16px + env(safe-area-inset-top, 0px));
    right: calc(16px + env(safe-area-inset-right, 0px));
  }
  .lp-fullscreen-info-bar {
    padding: 18px 24px calc(20px + env(safe-area-inset-bottom, 0px));
  }
  .lp__header {
    padding: calc(12px + env(safe-area-inset-top, 0px))
             max(16px, env(safe-area-inset-right, 0px))
             10px
             max(16px, env(safe-area-inset-left, 0px));
  }
  .lp__footer {
    padding: 10px max(16px, env(safe-area-inset-right, 0px))
             max(16px, env(safe-area-inset-bottom, 0px))
             max(16px, env(safe-area-inset-left, 0px));
  }
  button{min-height:44px}
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]),select{min-height:44px}

  .lp-fullscreen-portrait-wrap{position:absolute;inset:0;width:100%;height:100%;border:0;padding:0;margin:0;background:none;cursor:pointer;touch-action:manipulation}
  .lp-fullscreen-respect-note{max-width:var(--practice-dialog-width);margin:0;color:var(--video-ink);font-size:clamp(12px,3vw,16px);line-height:1.4}
  .lp,.lp-fullscreen-screen{user-select:none;-webkit-user-select:none}
  .lp-fullscreen-portrait-wrap,.lp-fullscreen-counter{-webkit-tap-highlight-color:transparent}
  .lp-fullscreen-back-btn,.lp-fullscreen-finish-btn{min-height:44px}
  .lp .lp__header button{min-width:44px;min-height:44px}
  .lp__name-row,.lp-fullscreen-name-row{display:flex;align-items:center;justify-content:center;gap:var(--radius-sm);max-width:100%}
  .lp__name-row .lp__buddha-name{min-width:0;margin:0}
  .lp__profile-button{display:inline-flex;align-items:center;justify-content:center;gap:var(--radius-sm);flex-shrink:0;min-width:44px;min-height:44px;padding:var(--radius-sm) var(--radius);border:1px solid var(--gold);border-radius:var(--radius-control);background:var(--gold-light);color:var(--brown-dark);font:600 12px var(--font-app);cursor:pointer}
  .lp__profile-button:focus-visible{outline:2px solid var(--gold2);outline-offset:2px}
  .lp-fullscreen-name-row{pointer-events:none}
  .lp__profile-button--fullscreen{pointer-events:auto;background:color-mix(in srgb,var(--video-surface) 80%,transparent);color:var(--gold2);border-color:var(--gold2)}
  .lp__dialog-dedication{margin:12px 0 8px;padding:8px 12px;border-radius:10px;background:var(--bg2);border:1px dashed var(--border2);text-align:center}
  .lp__dedication-title{margin:0 0 3px;font-size:10.5px;font-weight:700;color:var(--gold2);letter-spacing:.5px;text-transform:uppercase}
  .lp__dedication-line{margin:0;font-size:12.5px;line-height:1.5;font-style:italic;color:var(--text2)}

  /* Chỉ đổi vật liệu chuẩn bị/xác nhận ở giao diện sáng; giữ lớp phủ tôn tượng và giao diện tối. */
  :global(:root:not([data-theme='dark'])) .lp {
    background:var(--dialog-glass-background);color:var(--text);
    -webkit-backdrop-filter:var(--dialog-glass-filter);backdrop-filter:var(--dialog-glass-filter);
  }
  :global(:root:not([data-theme='dark'])) :is(.lp__header,.lp__footer,.lp__dropdowns-panel) {
    background:var(--dialog-glass-background);border-color:var(--dialog-glass-border);
    -webkit-backdrop-filter:var(--dialog-glass-filter);backdrop-filter:var(--dialog-glass-filter);
  }
  :global(:root:not([data-theme='dark'])) .lp__dropdowns-panel {box-shadow:var(--shadow-lg)}
  :global(:root:not([data-theme='dark'])) .lp__header-title {color:var(--text)}
  :global(:root:not([data-theme='dark'])) :is(.lp__buddha-name,.lp__field-label,.lp__hint) {color:var(--text2)}
  :global(:root:not([data-theme='dark'])) :is(.lp__hbtn:not(.lp__hbtn--primary),.lp__arrow-btn,.lp__badge),
  :global(:root:not([data-theme='dark'])) .lp .lp__profile-button {
    background:var(--dialog-glass-background);border-color:var(--dialog-glass-border);
    color:var(--brown-dark);box-shadow:var(--glass-button-shadow);
  }
  :global(:root:not([data-theme='dark'])) :is(.lp__hbtn:not(.lp__hbtn--primary),.lp__arrow-btn):hover {
    background:var(--hover);border-color:var(--gold);color:var(--brown-dark);
  }
  :global(:root:not([data-theme='dark'])) .lp__select {
    background:var(--dialog-glass-background);border-color:var(--dialog-glass-border);color:var(--text);
  }
  :global(:root:not([data-theme='dark'])) .lp__select option {background:var(--card);color:var(--text)}
  :global(:root:not([data-theme='dark'])) .lp__select:focus {
    border-color:var(--gold);box-shadow:0 0 0 2px color-mix(in srgb,var(--gold) 25%,transparent);
  }
  :global(:root:not([data-theme='dark'])) :is(.lp__hbtn--primary,.lp__action-btn--start,.lp__dialog-btn--ok) {
    background:linear-gradient(135deg,var(--gold2),var(--gold));border-color:var(--gold);
    color:var(--on-gold);box-shadow:var(--glass-button-shadow);
  }
  :global(:root:not([data-theme='dark'])) :is(.lp__hbtn--primary,.lp__action-btn--start,.lp__dialog-btn--ok):hover {background:var(--gold2)}
  :global(:root:not([data-theme='dark'])) .lp__dialog-backdrop {background:var(--practice-dialog-backdrop);color:var(--text)}
  :global(:root:not([data-theme='dark'])) .lp__dialog {
    color:var(--text);
  }
  :global(:root:not([data-theme='dark'])) :is(.lp__dialog-title,.lp__dialog-question strong,.lp__dedication-title) {color:var(--brown-dark)}
  :global(:root:not([data-theme='dark'])) .lp__dialog-question {color:var(--text2)}
  :global(:root:not([data-theme='dark'])) :is(.lp__dialog-adj-btn,.lp__dialog-input,.lp__dialog-quick-chips button,.lp__dialog-btn--cancel) {
    background:var(--dialog-glass-background);border-color:var(--border);color:var(--text);
  }
  :global(:root:not([data-theme='dark'])) :is(.lp__dialog-adj-btn,.lp__dialog-quick-chips button,.lp__dialog-btn--cancel):hover {
    background:var(--hover);border-color:var(--gold);color:var(--brown-dark);
  }
  :global(:root:not([data-theme='dark'])) .lp__dialog-input:focus {box-shadow:0 0 0 3px color-mix(in srgb,var(--gold) 30%,transparent)}
  :global(:root:not([data-theme='dark'])) .lp__dialog-dedication {background:color-mix(in srgb,var(--bg2) 75%,transparent)}
  :global(:root:not([data-theme='dark'])) .lp__dialog-btn--dismiss {
    background:color-mix(in srgb,var(--red) 10%,var(--card));
    border-color:color-mix(in srgb,var(--red) 30%,var(--border));color:var(--danger-text);
  }
  :global(:root:not([data-theme='dark'])) .lp__dialog-btn--dismiss:hover {background:color-mix(in srgb,var(--red) 18%,var(--card))}
</style>
