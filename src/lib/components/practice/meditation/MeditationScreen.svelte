<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onDestroy, tick } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import type { MeditationSessionState } from '$lib/domain/practice/guided-sessions';
  import type { MeditationSetup } from '$lib/browser/practice-meditation';
  import { formatPracticeTime } from '$lib/browser/practice-meditation';
  import type { MeditationMotionSnapshot } from '$lib/browser/practice-motion';
  import { createAmbientSoundController, getAmbientSoundLabel } from '$lib/browser/ambient-sound';
  import { DAILY_CALENDAR_ARTWORKS } from '$lib/components/lunar/calendar-artwork';
  import { createMeditationWater } from '$lib/browser/meditation-water';
  import { uiMotion } from '$lib/browser/ui-motion';
  import { setImmersiveFullscreen } from '$lib/browser/native-fullscreen';
  import { isNativeApp } from '$lib/browser/native-platform';

  interface Props {
    routineControls?: Snippet;
    session: MeditationSessionState;
    setup: MeditationSetup;
    initialBackgroundArtwork?: string | null;
    motion: MeditationMotionSnapshot;
    onClose: () => void;
    onEnd: () => void;
    onPause: () => void;
    onResume: () => void;
  }

  let { session, setup, initialBackgroundArtwork = null, motion, onClose, onEnd, onPause, onResume, routineControls }: Props = $props();
  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.practice);
  const isEn = $derived(localeStore.current === 'en');

  let screen = $state<HTMLElement>();
  let waterCanvas = $state<HTMLCanvasElement>();
  let water = $state<ReturnType<typeof createMeditationWater> | null>(null);
  let contentScrollable = $state(true);

  $effect(() => {
    if (!screen) return;
    const main = screen.querySelector('main');
    const content = screen.querySelector('.meditation-screen__content');
    if (!main || !content) return;
    // Giữ cuộn dọc khi chữ lớn/màn thấp; vùng vừa màn nhận đủ đường vuốt nước.
    const observer = new ResizeObserver(() => { contentScrollable = main.scrollHeight > main.clientHeight; });
    observer.observe(main);
    observer.observe(content);
    return () => observer.disconnect();
  });

  $effect(() => {
    if (!screen || !waterCanvas) return;
    const renderer = createMeditationWater(screen, waterCanvas);
    water = renderer;
    return () => { renderer.destroy(); water = null; };
  });
  $effect(() => {
    water?.setEnabled($uiMotion.effective && !backgroundPickerOpen && session.phase !== 'completed' && session.phase !== 'cancelled');
  });
  $effect(() => {
    selectedBackground;
    water?.invalidate();
  });
  let fullscreen = $state(false);
  let backgroundPickerOpen = $state(false);
  let selectedBackground = $state<string | null>(null);
  let failedBackgrounds = $state<string[]>([]);
  let backgroundTrigger = $state<HTMLButtonElement>();
  let backgroundPanel = $state<HTMLElement>();
  const backgroundPickerId = $props.id();
  const backgroundChoices = [0, 1, 2, 3, 4, 8, 7, 9, 5, 6].map(index => ({
    artwork: DAILY_CALENDAR_ARTWORKS[index],
    labelIndex: index,
  }));

  $effect(() => {
    selectedBackground = initialBackgroundArtwork && DAILY_CALENDAR_ARTWORKS.includes(initialBackgroundArtwork)
      ? initialBackgroundArtwork : null;
  });

  $effect(() => {
    if (backgroundPickerOpen) backgroundPanel?.focus();
  });

  async function closeBackgroundPicker(): Promise<void> {
    backgroundPickerOpen = false;
    await tick();
    backgroundTrigger?.focus();
  }

  function selectBackground(background: string | null): void {
    selectedBackground = background && failedBackgrounds.includes(background) ? null : background;
  }

  const ambientController = createAmbientSoundController(() => Boolean(setup.musicTrack));

  $effect(() => {
    const phase = session.phase;
    const sound = setup.ambientSound || 'none';
    if ((phase === 'preparing' || phase === 'active') && sound !== 'none') {
      ambientController.start(sound);
    } else {
      ambientController.stop();
    }
  });

  onDestroy(() => {
    ambientController.destroy();
    if (fullscreen) {
      void setImmersiveFullscreen(false, screen);
    }
  });

  const preparationRemaining = $derived(Math.max(0, session.preparationSeconds - session.preparationElapsedMs / 1_000));
  const activeRemaining = $derived(Math.max(0, session.targetSeconds - session.activeElapsedMs / 1_000));
  const phaseLabel = $derived(
    session.phase === 'preparing'
      ? t.phasePreparing
      : session.phase === 'paused'
        ? t.phasePaused
        : session.phase === 'completed'
          ? t.phaseCompleted
          : session.phase === 'cancelled'
            ? t.phaseCancelled
          : t.phaseActive,
  );
  const timeLabel = $derived(
    session.phase === 'preparing' ? preparationRemaining
      : session.phase === 'cancelled' ? session.activeElapsedMs / 1_000
        : activeRemaining,
  );
  const timeAriaLabel = $derived(session.phase === 'cancelled'
    ? (isEn ? `${formatPracticeTime(timeLabel)} elapsed` : `Đã thiền ${formatPracticeTime(timeLabel)}`)
    : (isEn ? `${formatPracticeTime(timeLabel)} remaining` : `Còn ${formatPracticeTime(timeLabel)}`));
  const motionCapabilityLabel = $derived(
    motion.status === 'disabled'
      ? (isEn ? 'Motion sensor is disabled.' : 'Cảm biến chuyển động không được bật.')
      : motion.status === 'requesting'
        ? (isEn ? 'Awaiting motion sensor permissions.' : 'Đang chờ quyền truy cập cảm biến chuyển động.')
        : motion.status === 'unsupported'
          ? (isEn ? 'This browser does not support motion sensors.' : 'Trình duyệt này không hỗ trợ cảm biến chuyển động.')
          : motion.status === 'denied'
            ? (isEn ? 'Motion sensor permission was denied.' : 'Quyền cảm biến chuyển động chưa được cấp.')
            : motion.status === 'error'
              ? (isEn ? 'Cannot read motion sensor.' : 'Không thể đọc cảm biến chuyển động.')
              : (isEn ? 'Motion sensor is enabled.' : 'Cảm biến chuyển động đã bật.'),
  );
  const motionLabel = $derived(
    motion.status === 'disabled'
      ? (isEn ? 'Motion sensor is disabled. Meditation session is tracked by active duration.' : 'Cảm biến chuyển động không được bật. Thời thiền vẫn được ghi nhận bằng thời gian hoạt động.')
      : motion.status === 'requesting'
        ? (isEn ? 'Awaiting motion sensor permissions…' : 'Đang chờ quyền truy cập cảm biến chuyển động…')
        : motion.status === 'unsupported'
          ? (isEn ? 'This browser does not support motion sensors. Meditation session functions normally.' : 'Trình duyệt này không hỗ trợ cảm biến chuyển động. Thời thiền vẫn hoạt động bình thường.')
          : motion.status === 'denied'
            ? (isEn ? 'Motion sensor permission was denied. Meditation session functions normally.' : 'Quyền cảm biến chuyển động chưa được cấp. Thời thiền vẫn hoạt động bình thường.')
            : motion.status === 'error'
              ? (isEn ? 'Cannot read motion sensor. Meditation session functions normally.' : 'Không thể đọc cảm biến chuyển động. Thời thiền vẫn hoạt động bình thường.')
              : motion.sampleCount < 1
                ? (isEn ? 'Motion sensor is enabled; no valid samples received yet.' : 'Cảm biến chuyển động đã bật; chưa nhận được mẫu hợp lệ.')
                : (isEn ? `Sensor support: ${motion.sampleCount} samples, ${motion.stillnessPercent ?? 0}% low-motion stillness${motion.sampleLimitReached ? ' (target reached)' : ''}.` : `Cảm biến hỗ trợ: ${motion.sampleCount} mẫu, ${motion.stillnessPercent ?? 0}% ở mức chuyển động thấp${motion.sampleLimitReached ? ' (đã đủ số mẫu)' : ''}.`),
  );

  function handleCancel(event: Event): void {
    event.preventDefault();
    if (backgroundPickerOpen) {
      closeBackgroundPicker();
      return;
    }
    if (session.phase === 'completed' || session.phase === 'cancelled') onClose();
    else if (session.phase !== 'paused') onPause();
  }

  async function toggleFullscreen(): Promise<void> {
    const nextState = !fullscreen;
    fullscreen = nextState;
    await setImmersiveFullscreen(nextState, screen);
  }
</script>

<svelte:window onfullscreenchange={() => {
  if (document.fullscreenElement) {
    fullscreen = true;
  } else if (!isNativeApp()) {
    fullscreen = false;
  }
}} />

<dialog use:modalDialog class="meditation-modal" aria-label={isEn ? 'Meditation Session' : 'Phiên thiền'} oncancel={handleCancel}>
<section bind:this={screen} class="meditation-screen" class:is-fullscreen={fullscreen} class:breath-paused={session.phase !== 'active'} aria-label={t.meditationTitle} tabindex="-1" data-modal-focus>
  <canvas bind:this={waterCanvas} class="meditation-screen__water" aria-hidden="true"></canvas>
  {#if selectedBackground}
    <div class="meditation-screen__photo" aria-hidden="true">
      <img src={selectedBackground} alt="" onload={() => water?.invalidate()} onerror={() => selectedBackground = null} />
    </div>
  {/if}
  <header inert={backgroundPickerOpen}>
    <div><span aria-hidden="true">🪷</span><strong>{t.meditationTitle}</strong></div>
    <div class="meditation-screen__header-actions">
    <button bind:this={backgroundTrigger} type="button" aria-expanded={backgroundPickerOpen} aria-controls={backgroundPickerId} onclick={() => backgroundPickerOpen = !backgroundPickerOpen}>{t.changeMeditationBackground}</button>
    <button type="button" onclick={() => void toggleFullscreen()} aria-pressed={fullscreen}>
      {fullscreen ? t.exitFullscreen : t.fullscreen}
    </button>
    </div>
  </header>
  {@render routineControls?.()}

  {#if backgroundPickerOpen}
    <section bind:this={backgroundPanel} id={backgroundPickerId} class="meditation-background-picker" aria-labelledby={`${backgroundPickerId}-title`} tabindex="-1" data-dialog-glass>
      <div class="meditation-background-picker__heading">
        <h2 id={`${backgroundPickerId}-title`}>{t.meditationBackgroundTitle}</h2>
        <button type="button" aria-label={t.closeMeditationBackground} onclick={closeBackgroundPicker}>×</button>
      </div>
      <div class="meditation-background-picker__grid">
        <button class="meditation-background-picker__tile" class:selected={selectedBackground === null} type="button" aria-pressed={selectedBackground === null} onclick={() => selectBackground(null)}>
          <span class="meditation-background-picker__default" aria-hidden="true"></span>
          <span>{t.meditationBackgroundDefault}</span>
          {#if selectedBackground === null}<span class="meditation-background-picker__selected"><span aria-hidden="true">✓</span><span class="meditation-screen__sr-only">{t.meditationBackgroundSelected}</span></span>{/if}
        </button>
        {#each backgroundChoices as { artwork, labelIndex } (artwork)}
          <button class="meditation-background-picker__tile" class:selected={selectedBackground === artwork} type="button" aria-pressed={selectedBackground === artwork} onclick={() => selectBackground(artwork)}>
            {#if failedBackgrounds.includes(artwork)}
              <span class="meditation-background-picker__default" aria-hidden="true"></span>
            {:else}
              <img src={artwork} alt="" loading="lazy" decoding="async" onerror={() => { failedBackgrounds = [...failedBackgrounds, artwork]; if (selectedBackground === artwork) selectedBackground = null; }} />
            {/if}
            <span>{t.meditationBackgroundArtworkNames[labelIndex]}</span>
            {#if selectedBackground === artwork}<span class="meditation-background-picker__selected"><span aria-hidden="true">✓</span><span class="meditation-screen__sr-only">{t.meditationBackgroundSelected}</span></span>{/if}
          </button>
        {/each}
      </div>
      <div class="meditation-background-picker__footer">
        <button type="button" onclick={closeBackgroundPicker}>{t.doneMeditationBackground}</button>
      </div>
    </section>
  {/if}

  <main inert={backgroundPickerOpen} style:touch-action={contentScrollable ? 'pan-y' : 'none'}>
    <div class="meditation-screen__content">
      {#if setup.fullscreenVisual}
        <div class="meditation-screen__visual" aria-hidden="true">
          <div class="meditation-screen__breath"><span>🪷</span></div>
        </div>
        <div class="meditation-screen__breathing-cue" class:inactive={session.phase !== 'active' && session.phase !== 'paused'} aria-hidden="true">
          <span class="breathing-cue-in">{t.breatheIn}</span>
          <span class="breathing-cue-out">{t.breatheOut}</span>
        </div>
        <span class="meditation-screen__sr-only">{t.breathingGuide}</span>
      {:else}
        <div class="meditation-screen__still" aria-hidden="true">☸</div>
      {/if}

      {#if session.phase === 'preparing'}
        <div class="meditation-screen__badge meditation-screen__badge--prep" role="status">
          <span aria-hidden="true">⏳</span>
          <span>{t.prepCountdown} <strong>{Math.ceil(preparationRemaining)}s</strong></span>
        </div>
      {:else if session.phase === 'active'}
        <div class="meditation-screen__badge meditation-screen__badge--active" role="status">
          <span class="meditation-screen__pulse-dot" aria-hidden="true"></span>
          <span>{t.nowMeditating}</span>
        </div>
      {:else if session.phase === 'paused'}
        <div class="meditation-screen__badge meditation-screen__badge--paused" role="status">
          <span aria-hidden="true">⏸️</span>
          <span>{t.sessionPaused}</span>
        </div>
      {:else if session.phase === 'completed'}
        <div class="meditation-screen__badge meditation-screen__badge--completed" role="status">
          <span aria-hidden="true">🌸</span>
          <span>{t.sessionCompleted}</span>
        </div>
      {/if}

      <p class="meditation-screen__phase" aria-live="polite">{phaseLabel}</p>
      <strong class="meditation-screen__time" aria-label={timeAriaLabel}>{formatPracticeTime(timeLabel)}</strong>
      <div class="meditation-screen__instruction">
        {#if session.phase === 'preparing'}
          <p>{t.prepInstruction}</p>
        {:else if session.phase === 'active'}
          <div class="meditation-screen__guide-list">
            <div class="meditation-screen__guide-item">
              <strong>{t.calmMindTitle}</strong> – {t.calmMindDesc}
            </div>
            <div class="meditation-screen__guide-item">
              <strong>{t.mindfulnessTitle}</strong> – {t.mindfulnessDesc}
            </div>
            <div class="meditation-screen__guide-item">
              <strong>{t.contemplationTitle}</strong> – {t.contemplationDesc}
            </div>
          </div>
        {:else if session.phase === 'paused'}
          <p>{t.pausedInstruction}</p>
        {:else if session.phase === 'completed'}
          <p>{t.completedInstruction}</p>
        {:else}
          <p>{t.defaultInstruction}</p>
        {/if}
      </div>

      <div class="meditation-screen__layers" aria-label={isEn ? 'Active audio layers' : 'Âm thanh đang dùng'}>
        <span>{setup.musicTrack ? t.hasMusic : t.noMusicActive}</span>
        {#if setup.ambientSound && setup.ambientSound !== 'none'}
          <span>{getAmbientSoundLabel(setup.ambientSound, isEn)}</span>
        {/if}
        <span>{setup.woodenFishEnabled ? t.woodenFishActive.replace('{bpm}', String(setup.woodenFishBpm)) : t.noWoodenFishActive}</span>
      </div>
      <p class="meditation-screen__motion">{motionLabel}</p>
    </div>
    <span class="meditation-screen__sr-only" role="status" aria-live="polite">{motionCapabilityLabel}</span>
  </main>

  <footer inert={backgroundPickerOpen}>
    {#if session.phase === 'completed' || session.phase === 'cancelled'}
      <button class="primary" type="button" onclick={onClose}>{t.finish}</button>
    {:else}
      <button type="button" onclick={onEnd}>{t.endEarly}</button>
      {#if session.phase === 'paused'}
        <button class="primary" type="button" onclick={onResume}>{t.resume}</button>
      {:else}
        <button class="primary" type="button" onclick={onPause}>{t.pause}</button>
      {/if}
    {/if}
  </footer>
</section>
</dialog>

<style>
  .meditation-modal{inset:0;width:100%;height:100dvh;max-width:none;max-height:none;margin:0;padding:0;border:0;background:#171320;overflow:hidden}
  .meditation-modal::backdrop{background:#171320}
  .meditation-screen{box-sizing:border-box;position:fixed;z-index:11000;inset:0;display:grid;width:100%;height:100dvh;grid-template-rows:auto 1fr auto;background:radial-gradient(circle at 50% 35%,#44365f 0%,#241d35 46%,#171320 100%);color:#fff;font-family:var(--font-app);isolation:isolate}
  .meditation-screen::before{position:absolute;z-index:-1;inset:0;background-image:radial-gradient(circle at 20% 20%,rgba(229,195,255,.08) 0 1px,transparent 1.5px),radial-gradient(circle at 80% 70%,rgba(255,231,178,.08) 0 1px,transparent 1.5px);background-size:46px 46px,64px 64px;content:''}
  .meditation-screen__photo{position:absolute;z-index:-1;inset:0;pointer-events:none}
  .meditation-screen__water{position:absolute;inset:0;width:100%;height:100%;pointer-events:none;z-index:0}
  .meditation-screen header,.meditation-screen main,.meditation-screen footer{position:relative;z-index:1}
  .meditation-screen main{user-select:none;-webkit-user-select:none}
  .meditation-screen__photo img{width:100%;height:100%;object-fit:cover}
  .meditation-screen__photo::after{position:absolute;inset:0;background:color-mix(in srgb,var(--copy-paper-ink) 60%,transparent);content:''}
  .meditation-background-picker{box-sizing:border-box;position:absolute;z-index:2;bottom:0;left:50%;display:grid;grid-template-rows:auto minmax(0,1fr) auto;width:100%;max-width:520px;max-height:calc(100dvh - env(safe-area-inset-top,0px) - env(safe-area-inset-bottom,0px) - var(--space-page) * 2);overflow:hidden;transform:translateX(-50%);padding:var(--radius-control);padding-bottom:max(var(--radius-control),env(safe-area-inset-bottom,0px));border:1px solid var(--border);border-radius:var(--radius-card) var(--radius-card) 0 0;background:var(--dialog-surface-background,var(--card));color:var(--text);border-color:var(--dialog-surface-border,var(--border));box-shadow:var(--dialog-surface-shadow,var(--shadow-xl))}
  .meditation-background-picker__heading{display:flex;align-items:center;justify-content:space-between;gap:var(--radius-sm);margin-bottom:var(--radius-control)}
  .meditation-background-picker__heading h2{margin:0;font:700 1rem/1.5 var(--font-app);text-align:center}
  .meditation-background-picker__heading button{width:44px;height:44px;flex-shrink:0;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--bg2);color:inherit;font:inherit;font-size:1.5rem;cursor:pointer}
  .meditation-background-picker__grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));grid-auto-rows:max-content;align-content:start;gap:var(--radius-sm);overflow-y:auto;overscroll-behavior:contain;padding:var(--radius-sm)}
  .meditation-background-picker__tile{position:relative;display:flex;min-width:0;min-height:44px;flex-direction:column;gap:var(--radius-sm);padding:var(--radius-sm);border:2px solid var(--border);border-radius:var(--radius-control);background:rgba(255,255,255,.08);color:inherit;cursor:pointer;font:inherit;font-size:var(--font-size-label);line-height:1.5;text-align:center;overflow-wrap:anywhere}
  .meditation-background-picker__tile.selected{border-color:var(--gold)}
  .meditation-background-picker__tile img,.meditation-background-picker__default{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius-sm)}
  .meditation-background-picker__default{background:radial-gradient(circle at 50% 35%,#44365f 0%,#241d35 46%,#171320 100%)}
  .meditation-background-picker__selected{position:absolute;top:var(--radius-sm);right:var(--radius-sm);padding:0 var(--radius-sm);border-radius:var(--radius-sm);background:var(--gold);color:var(--on-gold);font-weight:700}
  .meditation-background-picker__footer{display:flex;justify-content:flex-end;padding-top:var(--radius-control)}
  .meditation-background-picker__footer button{width:100%;min-width:44px;min-height:44px;padding:0 var(--space-page);border:1px solid var(--gold);border-radius:var(--radius-control);background:var(--gold);color:var(--on-gold);font:700 1rem/1.5 var(--font-app);cursor:pointer}
  .meditation-screen header{display:flex;align-items:center;justify-content:space-between;padding:calc(18px + env(safe-area-inset-top,0px)) max(24px,env(safe-area-inset-right,0px)) 16px max(24px,env(safe-area-inset-left,0px))}
  .meditation-screen header div{display:flex;align-items:center;gap:9px}
  .meditation-screen header span{font-size:24px}
  .meditation-screen header button,.meditation-screen footer button{min-height:44px;padding:0 20px;border:1px solid rgba(255,255,255,.32);border-radius:999px;background:rgba(255,255,255,.08);color:#fff;cursor:pointer;font:700 13px/1 var(--font-app);transition:background .2s,border-color .2s,transform .15s}
  .meditation-screen header button:hover,.meditation-screen footer button:not(.primary):hover{background:rgba(255,255,255,.16);border-color:rgba(255,255,255,.45)}
  .meditation-screen main{display:flex;min-height:0;overflow-y:auto;overscroll-behavior:contain;align-items:center;justify-content:flex-start;flex-direction:column;padding:16px 24px;text-align:center}
  .meditation-screen__content{display:flex;flex-shrink:0;flex-direction:column;align-items:center;justify-content:center;margin:auto 0;width:100%;max-width:680px;text-align:center}
  .meditation-screen__visual{display:grid;width:min(38vw,240px);aspect-ratio:1;place-items:center}
  .meditation-screen__breath{display:grid;width:68%;aspect-ratio:1;place-items:center;border:1px solid rgba(239,220,255,.5);border-radius:50%;background:radial-gradient(circle,rgba(223,187,255,.34),rgba(165,126,211,.1) 62%,transparent 66%);box-shadow:0 0 80px rgba(186,143,225,.22);animation:guided-breath 10s ease-in-out infinite}
  .meditation-screen__breath span{font-size:clamp(50px,7.5vw,78px);filter:drop-shadow(0 0 18px rgba(250,226,255,.45))}
  .meditation-screen__still{display:grid;width:140px;height:140px;place-items:center;color:#dbc5ed;font-size:72px}
  
  .meditation-screen__badge{display:inline-flex;align-items:center;gap:8px;margin:14px 0 6px;padding:7px 18px;border-radius:999px;font-size:var(--font-size-label);font-weight:700;letter-spacing:.02em;animation:tt-badge-in .25s ease-out}
  .meditation-screen__badge strong{color:#fff;font-weight:800}
  .meditation-screen__badge--prep{border:1px solid rgba(245,210,140,.55);background:rgba(217,160,54,.2);color:#fedda2;box-shadow:0 0 24px rgba(217,160,54,.18)}
  .meditation-screen__badge--active{border:1px solid rgba(134,239,172,.55);background:rgba(34,197,94,.2);color:#bbf7d0;box-shadow:0 0 28px rgba(34,197,94,.22)}
  .meditation-screen__badge--paused{border:1px solid rgba(255,255,255,.28);background:rgba(255,255,255,.08);color:#e2e8f0}
  .meditation-screen__badge--completed{border:1px solid rgba(244,114,182,.45);background:rgba(236,72,153,.18);color:#fbcfe8}
  .meditation-screen__pulse-dot{width:8px;height:8px;border-radius:50%;background:#4ade80;box-shadow:0 0 8px #4ade80;animation:dot-pulse 1.8s ease-in-out infinite}
  @keyframes dot-pulse{0%,100%{transform:scale(.85);opacity:.65}50%{transform:scale(1.25);opacity:1}}
  @keyframes tt-badge-in{from{opacity:0;transform:translateY(-4px)}to{opacity:1;transform:translateY(0)}}

  .meditation-screen__phase{margin:4px 0 4px;color:#eadff2;font-size:var(--font-size-label);font-weight:700;letter-spacing:.06em;text-transform:uppercase}
  .meditation-screen__time{font-size:clamp(56px,11vw,108px);font-variant-numeric:tabular-nums;line-height:1;margin:4px 0}
  .meditation-screen__instruction{max-width:620px;margin:14px auto 0;color:#d2c8dc;font-size:var(--font-size-body);line-height:1.7}
  .meditation-screen__guide-list{display:flex;flex-direction:column;gap:8px;text-align:left;margin:0 auto;background:rgba(255,255,255,.05);border:1px solid rgba(239,220,255,.14);border-radius:12px;padding:12px 18px;backdrop-filter:blur(6px)}
  .meditation-screen__guide-item{font-size:var(--font-size-body);line-height:1.55;color:#e8def2}
  .meditation-screen__guide-item strong{color:#ffd98c;font-weight:700}
  .meditation-screen__layers{display:flex;flex-wrap:wrap;justify-content:center;gap:8px;margin-top:16px}
  .meditation-screen__layers span{padding:6px 12px;border:1px solid rgba(255,255,255,.16);border-radius:999px;background:rgba(255,255,255,.06);color:#d9d0e1;font-size:var(--font-size-meta)}
  .meditation-screen__motion{max-width:620px;margin:10px auto 0;color:#cfc2da;font-size:var(--font-size-meta);line-height:1.5}
  .meditation-screen__sr-only{position:absolute;width:1px;height:1px;overflow:hidden;margin:-1px;padding:0;border:0;clip:rect(0 0 0 0);white-space:nowrap}
  .meditation-screen footer{display:flex;justify-content:center;gap:10px;padding:16px max(24px,env(safe-area-inset-right,0px)) max(26px,env(safe-area-inset-bottom,0px)) max(24px,env(safe-area-inset-left,0px))}
  .meditation-screen footer .primary{border-color:#e0b766;background:#c9973f;color:var(--on-gold);box-shadow:0 8px 30px rgba(201,151,63,.28)}
  button:focus-visible{outline:3px solid #f2d495;outline-offset:3px}
  @keyframes guided-breath{0%,100%{transform:scale(.78);opacity:.72}45%,55%{transform:scale(1.2);opacity:1}}
  .meditation-screen__breathing-cue{display:grid;min-height:1.5em;margin:4px 0;color:inherit;font-size:20px;font-weight:700;line-height:1.5}
  .meditation-screen__breathing-cue.inactive{opacity:0}
  .meditation-screen__breathing-cue span{grid-area:1 / 1;animation:breathing-cue-in 10s steps(1,end) infinite}
  .meditation-screen__breathing-cue .breathing-cue-out{animation-name:breathing-cue-out}
  .breath-paused .meditation-screen__breath,.breath-paused .meditation-screen__breathing-cue span{animation-play-state:paused}
  @keyframes breathing-cue-in{0%{visibility:visible}55%,100%{visibility:hidden}}
  @keyframes breathing-cue-out{0%{visibility:hidden}55%,100%{visibility:visible}}
  @media(prefers-reduced-motion:reduce){.meditation-screen__breath{animation:none;transform:none}.meditation-screen::before{background-image:none}}
  @media(prefers-reduced-motion:reduce){.meditation-screen__breathing-cue{display:flex;flex-wrap:wrap;justify-content:center;gap:8px}.meditation-screen__breathing-cue span{animation:none;visibility:inherit}}

  /* Fullscreen centering & balance */
  .meditation-screen.is-fullscreen header{padding:calc(20px + env(safe-area-inset-top,0px)) max(24px,env(safe-area-inset-right,0px)) 18px max(24px,env(safe-area-inset-left,0px))}
  .meditation-screen.is-fullscreen footer{padding:18px max(24px,env(safe-area-inset-right,0px)) max(32px,calc(18px + env(safe-area-inset-bottom,0px))) max(24px,env(safe-area-inset-left,0px))}
  .meditation-screen.is-fullscreen .meditation-screen__content{max-width:720px}
  .meditation-screen.is-fullscreen .meditation-screen__visual{width:min(34vw,280px)}
  .meditation-screen.is-fullscreen .meditation-screen__time{font-size:clamp(68px,13vw,122px)}
  .meditation-screen.is-fullscreen .meditation-screen__badge{font-size:15px;padding:9px 22px}

  @media(max-width:520px){
    .meditation-screen header{flex-wrap:wrap;gap:8px;padding:calc(12px + env(safe-area-inset-top,0px)) 12px 12px}
    .meditation-screen__header-actions{flex-wrap:wrap;margin-left:auto}
    .meditation-screen header strong{font-size:13px}
    .meditation-screen__visual{width:54vw}
    .meditation-screen__guide-list{padding:10px 12px;gap:6px}
    .meditation-screen__guide-item{font-size:var(--font-size-body);line-height:1.45}
    .meditation-screen footer{display:grid;grid-template-columns:1fr 1fr}
    .meditation-screen footer button:only-child{grid-column:1/-1}
    .meditation-screen.is-fullscreen header{padding:calc(12px + env(safe-area-inset-top,0px)) 12px 12px}
    .meditation-screen.is-fullscreen .meditation-screen__visual{width:64vw}
    .meditation-screen.is-fullscreen .meditation-screen__time{font-size:clamp(64px,16vw,96px)}
  }

  @media(max-height:520px){
    .meditation-screen header{padding-block:8px}
    .meditation-screen main{padding:6px 16px}
    .meditation-screen__visual,.meditation-screen__still{width:64px;height:64px;font-size:40px}
    .meditation-screen__breath span{font-size:32px}
    .meditation-screen__badge{margin:4px 0 2px;padding:4px 12px;font-size:var(--font-size-label)}
    .meditation-screen__phase{margin:2px 0;font-size:var(--font-size-label)}
    .meditation-screen__time{font-size:44px}
    .meditation-screen__instruction,.meditation-screen__layers{margin-top:6px}
    .meditation-screen footer{padding-top:8px;padding-bottom:max(8px,env(safe-area-inset-bottom,0px))}
  }
</style>
