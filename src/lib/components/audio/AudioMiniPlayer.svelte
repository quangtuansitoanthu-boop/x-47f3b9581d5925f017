<script lang="ts">
  import RosarySelect from '$lib/components/practice/rosary/RosarySelect.svelte';
  import { sessionCover } from '$lib/browser/session-cover';
  import { swipeRightDismiss } from '$lib/browser/swipe-right-dismiss';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  const localeStore = getLocaleContext();
  const label = (vi: string, en: string) => localeStore.current === 'en' ? en : vi;
  import { afterNavigate, goto } from '$app/navigation';
  import { onMount, tick } from 'svelte';
  import { parseAudioArtwork } from '$lib/domain/audio-artwork';
  import { audioPlayer, getAudioPlayer } from '$lib/stores/audio-player.svelte';
  import { hasNativeTalkAudio, nativeTalkPlugin } from '$lib/browser/native-talk-audio';
  let backgroundRestricted = $state(false);
  onMount(() => {
    let alive = true;
    const check = () => {
      if (hasNativeTalkAudio()) void nativeTalkPlugin.backgroundStatus().then(status => {
        if (alive) backgroundRestricted = status.restricted;
      }).catch(() => {});
    };
    check();
    document.addEventListener('visibilitychange', check);
    return () => { alive = false; document.removeEventListener('visibilitychange', check); };
  });

  let timerMenuOpen = $state(false);
  let timerWrap = $state<HTMLElement | null>(null);
  let mobileTimerWrap = $state<HTMLElement | null>(null);
  let mobileSpeedWrap = $state<HTMLElement | null>(null);
  let failedArtwork = $state('');
  let errorToastVisible = $state(false);

  // Mobile Expanded Player state
  let mobileExpanded = $state(false);
  let activeTab = $state<'player' | 'tracks'>('player');
  let speedSheetOpen = $state(false);

  function closeSpeedMenu(returnFocus = false): void {
    speedSheetOpen = false;
    if (returnFocus) mobileSpeedWrap?.querySelector('button')?.focus({ preventScroll: true });
  }

  function closeTimerMenu(returnFocus = false): void {
    timerMenuOpen = false;
    if (returnFocus) (mobileExpanded ? mobileTimerWrap : timerWrap)?.querySelector('button')?.focus({ preventScroll: true });
  }

  function dismissUtilityMenu(): boolean {
    if (speedSheetOpen) { closeSpeedMenu(true); return true; }
    if (timerMenuOpen) { closeTimerMenu(true); return true; }
    return false;
  }

  function toggleSpeedMenu(): void {
    closeTimerMenu();
    speedSheetOpen = !speedSheetOpen;
  }

  function toggleTimerMenu(): void {
    closeSpeedMenu();
    timerMenuOpen = !timerMenuOpen;
  }

  // Expand Hint Banner & Pointer state
  let expandHintVisible = $state(false);
  let expandHintDismissed = $state(false);
  let expandHintTimer: ReturnType<typeof setTimeout> | null = null;
  let hasTriggeredHint = false;

  const artwork = $derived(parseAudioArtwork($audioPlayer.album?.artwork));

  const checkAndShowHint = () => {
    if (mobileExpanded || expandHintDismissed || hasTriggeredHint) return;
    try {
      const dismissedUntil = localStorage.getItem('tutam_audio_expand_hint_dismissed_until');
      if (dismissedUntil && Number(dismissedUntil) > Date.now()) {
        expandHintDismissed = true;
        return;
      }
      if (sessionStorage.getItem('tutam_audio_expand_hint_shown_session') === '1') {
        expandHintDismissed = true;
        return;
      }
    } catch {
      // ignore
    }
    hasTriggeredHint = true;
    try {
      sessionStorage.setItem('tutam_audio_expand_hint_shown_session', '1');
    } catch {
      // ignore
    }
    setTimeout(() => {
      if (!mobileExpanded && !expandHintDismissed) {
        expandHintVisible = true;
        expandHintTimer = setTimeout(() => {
          expandHintVisible = false;
        }, 9_000);
      }
    }, 600);
  };

  const openExpanded = async () => {
    miniBarMinimized = false;
    closeSpeedMenu();
    closeTimerMenu();
    dismissExpandHint();
    const album = $audioPlayer.album;
    if (album?.tracks[$audioPlayer.trackIndex]?.media_type === 'video') {
      mobileExpanded = false;
      await goto('/phap-thoai?album=' + encodeURIComponent(album.id));
      window.dispatchEvent(new CustomEvent('quangtu:open-video-album', { detail: { albumId: album.id } }));
      return;
    }
    mobileExpanded = true;
  };

  // Mini Bar Minimized (hidden) state
  let miniBarMinimized = $state(false);
  // Include floating-player offsets; body already reserves bottom-navigation space.
  function reservePlayerSpace(node: HTMLElement) {
    const shell = node.closest<HTMLElement>('.qts-shell');
    const update = () => {
      const style = getComputedStyle(node);
      const bottom = parseFloat(style.bottom) || 0;
      // The restore pill animates scale: reserve its stable layout height, not a smaller intermediate frame.
      const height = Math.max(node.offsetHeight, parseFloat(style.height) || 0);
      const existingSpace = parseFloat(getComputedStyle(document.body).paddingBottom) || 0;
      const clearance = Math.max(0, Math.ceil(height + bottom - existingSpace));
      shell?.style.setProperty('--audio-player-height', `${clearance}px`);
      document.documentElement.style.setProperty('--audio-player-top', `${Math.ceil(height + bottom)}px`);
    };
    const observer = new ResizeObserver(update);
    observer.observe(node);
    window.addEventListener('resize', update);
    update();
    return { destroy() { observer.disconnect(); window.removeEventListener('resize', update); shell?.style.removeProperty('--audio-player-height'); document.documentElement.style.removeProperty('--audio-player-top'); } };
  }
  let audioBannerHidden = $state(false);
  const hideAudioBanner = () => {
    audioBannerHidden = true;
    timerMenuOpen = false;
    dismissExpandHint();
  };
  let previousAlbumId = $state<string | null>(null);
  let minimizeTrigger = $state<HTMLButtonElement>();
  let restoreTrigger = $state<HTMLButtonElement>();

  const minimizeBar = async () => {
    miniBarMinimized = true;
    timerMenuOpen = false;
    dismissExpandHint();
    await tick();
    restoreTrigger?.focus({ preventScroll: true });
  };

  const restoreBar = async () => {
    miniBarMinimized = false;
    await tick();
    minimizeTrigger?.focus({ preventScroll: true });
  };

  $effect(() => {
    const currentAlbumId = $audioPlayer.album?.id ?? null;
    if (currentAlbumId !== previousAlbumId) {
      previousAlbumId = currentAlbumId;
      miniBarMinimized = false;
      audioBannerHidden = false;
    }
    if (currentAlbumId === null) {
      mobileExpanded = false;
      timerMenuOpen = false;
      speedSheetOpen = false;
    }
  });

  const dismissExpandHint = (event?: Event) => {
    event?.stopPropagation();
    expandHintVisible = false;
    expandHintDismissed = true;
    if (expandHintTimer) {
      clearTimeout(expandHintTimer);
      expandHintTimer = null;
    }
    try {
      localStorage.setItem('tutam_audio_expand_hint_dismissed_until', String(Date.now() + 7 * 86_400_000));
      sessionStorage.setItem('tutam_audio_expand_hint_shown_session', '1');
    } catch {
      // ignore
    }
  };

  $effect(() => {
    if ($audioPlayer.album && !expandHintDismissed && !hasTriggeredHint) {
      checkAndShowHint();
    }
  });

  $effect(() => {
    const message = $audioPlayer.error;
    if (!message) {
      errorToastVisible = false;
      return;
    }
    errorToastVisible = true;
    const timer = setTimeout(() => (errorToastVisible = false), 2_800);
    return () => clearTimeout(timer);
  });

  afterNavigate(({ to }) => {
    if (to?.url.pathname.startsWith('/phap-thoai')) audioBannerHidden = false;
    timerMenuOpen = false;
    speedSheetOpen = false;
    mobileExpanded = false;
  });

  onMount(() => {
    const outsidePointer = (event: PointerEvent) => {
      if (speedSheetOpen && !mobileSpeedWrap?.contains(event.target as Node)) closeSpeedMenu();
      if (
        timerMenuOpen &&
        (!timerWrap || !timerWrap.contains(event.target as Node)) &&
        (!mobileTimerWrap || !mobileTimerWrap.contains(event.target as Node))
      ) {
        closeTimerMenu();
      }
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (mobileExpanded) event.preventDefault();
        if (dismissUtilityMenu()) event.preventDefault();
        else if (mobileExpanded) mobileExpanded = false;
      }
    };
    document.addEventListener('pointerdown', outsidePointer);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('pointerdown', outsidePointer);
      document.removeEventListener('keydown', escape);
      if (expandHintTimer) {
        clearTimeout(expandHintTimer);
        expandHintTimer = null;
      }
    };
  });

  const progressPercent = $derived(
    $audioPlayer.duration > 0
      ? Math.min(100, Math.max(0, ($audioPlayer.currentTime / $audioPlayer.duration) * 100))
      : 0,
  );

  const formatTime = (seconds: number) => {
    if (!Number.isFinite(seconds)) return '0:00';
    const value = Math.max(0, Math.floor(seconds));
    return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, '0')}`;
  };

  const formatCountdown = (milliseconds: number) => {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return '0:00';
    const totalSeconds = Math.ceil(milliseconds / 1_000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    return hours > 0
      ? `${hours}:${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`
      : `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
  };

  const formatTimer = (milliseconds: number) => {
    if (!Number.isFinite(milliseconds) || milliseconds <= 0) return label("Tắt hẹn giờ", "Turn off timer");
    return `💤 ${formatCountdown(milliseconds)}`;
  };

  const seek = async (event: Event) => {
    const input = event.currentTarget as HTMLInputElement;
    (await getAudioPlayer()).seek(Number(input.value));
  };

  const setTimer = async (minutes: number) => {
    try {
      const player = await getAudioPlayer();
      if (minutes <= 0) player.clearSleepTimer();
      else player.setSleepTimer(minutes);
    } finally {
      closeTimerMenu(true);
    }
  };

  const setTimerEndOfTrack = async () => {
    try {
      const player = await getAudioPlayer();
      player.setSleepTimerEndOfTrack();
    } finally {
      closeTimerMenu(true);
    }
  };

  const setVolume = async (event: Event) => {
    (await getAudioPlayer()).setVolume(Number((event.currentTarget as HTMLInputElement).value));
  };

  const selectSpeed = async (speed: number) => {
    const player = await getAudioPlayer();
    player.setSpeed(speed);
    closeSpeedMenu(true);
  };

  const playTrack = async (index: number) => {
    const player = await getAudioPlayer();
    if ($audioPlayer.album) {
      await player.playTrack($audioPlayer.album, index);
    }
  };

  const repeatIcon = $derived(
    $audioPlayer.repeat === 1 ? '🔂' : $audioPlayer.repeat === 2 ? '🔁' : '➡️'
  );

  const repeatText = $derived(
    $audioPlayer.repeat === 1 ? label("Lặp 1 bài", "Repeat track") : $audioPlayer.repeat === 2 ? label("Lặp album", "Repeat album") : label("Không lặp", "Repeat off")
  );
</script>

{#if $audioPlayer.album}
  {#if !audioBannerHidden}
  {#if !miniBarMinimized}
    <!-- Mini Bar Player (Docked) -->
    <section use:reservePlayerSpace use:swipeRightDismiss={hideAudioBanner} class="pt-mini-player visible" aria-label={label("Trình phát Pháp Thoại", "Dharma audio player")}>
    <!-- Expand Hint Banner / Arrow Guide -->
    {#if expandHintVisible && !mobileExpanded && !expandHintDismissed}
      <div class="pt-mp-expand-hint" role="tooltip" aria-label={label("Hướng dẫn mở rộng trình phát", "Expand player help")}>
        <button
          type="button"
          class="pt-mp-hint-content"
          onclick={openExpanded}
          aria-label={label("Bấm vào đây để mở giao diện phát nhạc mở rộng", "Tap here to expand the audio player")}
        >
          <span class="pt-mp-hint-badge" aria-hidden="true">
            <svg width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.6" viewBox="0 0 24 24">
              <path stroke-linecap="round" stroke-linejoin="round" d="m18 15-6-6-6 6" />
            </svg>
          </span>
          <span class="pt-mp-hint-text">
            <span class="pt-mp-hint-text-full">{label("Bấm vào đây để mở giao diện phát nhạc mở rộng", "Tap here to expand the audio player")}</span>
            <span class="pt-mp-hint-text-short">{label("Chạm để mở rộng trình phát", "Tap to expand player")}</span>
          </span>
          <span class="pt-mp-hint-hand" aria-hidden="true">👆</span>
        </button>
        <button
          type="button"
          class="pt-mp-hint-close"
          onclick={dismissExpandHint}
          aria-label={label("Đóng hướng dẫn", "Dismiss help")}
          title={label("Đóng", "Close")}
        >
          ✕
        </button>
        <div class="pt-mp-hint-pointer" aria-hidden="true"></div>
      </div>
    {/if}

    <span class="pt-mp-sr-only" role="status" aria-live="polite">
      {$audioPlayer.muted ? label("Âm thanh đang tắt", "Sound muted") : label("Âm thanh đang bật", "Sound on")}
    </span>

    <div class="pt-mp-progress-bar">
      <div class="pt-mp-progress-fill" style:width={`${progressPercent}%`}></div>
      <input
        class="pt-mp-progress-input"
        type="range"
        min="0"
        max={$audioPlayer.duration || 0}
        value={$audioPlayer.currentTime}
        oninput={seek}
        aria-label={label("Vị trí phát", "Playback position")}
      />
    </div>

    <div class="pt-mp-body">
      <!-- Clickable artwork & title on mobile expands to full player -->
      <button
        type="button"
        class="pt-mp-info-touch"
        onclick={openExpanded}
        aria-label={label("Mở rộng trình phát Pháp Thoại", "Expand Dharma audio player")}
      >
        <div class:playing={$audioPlayer.playing} class="pt-mp-thumb">
          <span aria-hidden="true">🎵</span>
          {#if artwork.src && failedArtwork !== artwork.src}
            <img
              class="pt-mp-art-img"
              use:sessionCover={artwork.src}
              style:object-position={artwork.position}
              alt=""
              onerror={() => (failedArtwork = artwork.src)}
            />
          {/if}
          <i class="pt-mp-spin-ring" aria-hidden="true"></i>
        </div>

        <div class="pt-mp-info">
          <strong class="pt-mp-track-name">{$audioPlayer.album.tracks[$audioPlayer.trackIndex]?.title}</strong>
          <div class="pt-mp-album-name">{$audioPlayer.album.title}</div>
          <div class="pt-mp-time">
            {formatTime($audioPlayer.currentTime)} / {formatTime($audioPlayer.duration)}
            {#if $audioPlayer.sleepTimerRemainingMs > 0 || $audioPlayer.sleepTimerEndOfTrack}
              <b class="pt-mp-sleep-badge" title={$audioPlayer.playing ? label("Hẹn giờ tắt", "Sleep timer") : label("Hẹn giờ (tạm dừng)", "Timer (paused)")}>
                💤 {formatCountdown($audioPlayer.sleepTimerRemainingMs)}{$audioPlayer.sleepTimerEndOfTrack ? label(" (hết bài)", " (end of track)") : ''}{!$audioPlayer.playing ? label(" (dừng)", " (paused)") : ''}
              </b>
            {/if}
          </div>
        </div>
      </button>

      <div class="pt-mp-controls">
        <button
          class="pt-mp-btn speed"
          type="button"
          onclick={async () => (await getAudioPlayer()).cycleSpeed()}
          aria-label={label("Đổi tốc độ", "Change speed")}
        >
          {$audioPlayer.speed}×
        </button>

        <button
          class="pt-mp-btn prev-btn"
          type="button"
          onclick={async () => (await getAudioPlayer()).previous()}
          aria-label={label("Bài trước", "Previous track")}
        >
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
          </svg>
        </button>

        <button
          class="pt-mp-btn seek"
          type="button"
          onclick={async () => (await getAudioPlayer()).seekBy(-10)}
          aria-label={label("Lùi 10 giây", "Rewind 10 seconds")}
        >
          <span aria-hidden="true">−10</span>
        </button>

        <button
          type="button"
          class="pt-mp-btn play-pause"
          onclick={async () => {
            const player = await getAudioPlayer();
            if ($audioPlayer.playing) player.pause();
            else await player.play();
          }}
          aria-label={$audioPlayer.playing ? label("Tạm dừng", "Pause") : label("Phát", "Play")}
        >
          {#if $audioPlayer.playing}
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
            </svg>
          {:else}
            <svg width="20" height="20" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
              <path d="M8 5v14l11-7z" />
            </svg>
          {/if}
        </button>

        <button
          class="pt-mp-btn seek"
          type="button"
          onclick={async () => (await getAudioPlayer()).seekBy(30)}
          aria-label={label("Tua tới 30 giây", "Forward 30 seconds")}
        >
          <span aria-hidden="true">+30</span>
        </button>

        <button
          class="pt-mp-btn next-btn"
          type="button"
          onclick={async () => (await getAudioPlayer()).next()}
          aria-label={label("Bài tiếp theo", "Next track")}
        >
          <svg width="18" height="18" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 4V8l-5.5 4zm7.5 6h2V6h-2v12z" />
          </svg>
        </button>

        <!-- Sleep timer wrap -->
        <div class="timer-wrap" bind:this={timerWrap}>
          <button
            class="pt-mp-btn timer-button"
            class:active={$audioPlayer.sleepTimerRemainingMs > 0 || $audioPlayer.sleepTimerEndOfTrack}
            class:is-paused={($audioPlayer.sleepTimerRemainingMs > 0 || $audioPlayer.sleepTimerEndOfTrack) && !$audioPlayer.playing}
            type="button"
            onclick={toggleTimerMenu}
            aria-expanded={timerMenuOpen}
            aria-label={$audioPlayer.sleepTimerRemainingMs > 0
              ? `${label('Hẹn giờ tắt:', 'Sleep timer:')} ${formatCountdown($audioPlayer.sleepTimerRemainingMs)}${!$audioPlayer.playing ? label(" (tạm dừng)", " (paused)") : ''}`
              : label("Hẹn giờ tắt", "Sleep timer")}
            title={$audioPlayer.sleepTimerRemainingMs > 0
              ? `${label('Hẹn giờ tắt:', 'Sleep timer:')} ${formatCountdown($audioPlayer.sleepTimerRemainingMs)}${$audioPlayer.sleepTimerEndOfTrack ? label(" (hết bài)", " (end of track)") : ''}${!$audioPlayer.playing ? label(" (tạm dừng)", " (paused)") : ''}`
              : label("Hẹn giờ tắt", "Sleep timer")}
          >
            {#if $audioPlayer.sleepTimerRemainingMs > 0}
              <small class="timer-countdown">{formatCountdown($audioPlayer.sleepTimerRemainingMs)}</small>
            {:else}
              <small>{label("HẸN GIỜ", "TIMER")}</small>
            {/if}
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
              <circle cx="12" cy="12" r="10" />
              <path d="M12 6v6l4 2" />
            </svg>
          </button>
          {#if timerMenuOpen && !mobileExpanded}
            <RosarySelect anchor={timerWrap ?? undefined} bind:open={timerMenuOpen} label={label('Hẹn giờ', 'Sleep timer')} accessibleLabel={label('Hẹn giờ', 'Sleep timer')} value="" options={[]} onChange={() => {}}>
            <div class="timer-menu" role="menu" aria-label={label("Hẹn giờ tắt nhạc", "Sleep timer")}>
              <strong>
                {#if $audioPlayer.sleepTimerRemainingMs > 0 || $audioPlayer.sleepTimerEndOfTrack}
                  {label('Đếm ngược:', 'Time remaining:')} {formatCountdown($audioPlayer.sleepTimerRemainingMs)}{$audioPlayer.sleepTimerEndOfTrack ? label(" (hết bài)", " (end of track)") : ''}{!$audioPlayer.playing ? label(" (dừng)", " (paused)") : ''}
                {:else}
                  Tắt âm trong:
                {/if}
              </strong>
              {#each [15, 30, 45, 60, 90, 120] as minutes}
                <button
                  type="button"
                  role="menuitem"
                  class:active={!$audioPlayer.sleepTimerEndOfTrack && $audioPlayer.sleepTimerRemainingMs > (minutes - 1) * 60_000 && $audioPlayer.sleepTimerRemainingMs <= minutes * 60_000}
                  onclick={() => setTimer(minutes)}
                >
                  {minutes < 60 ? `${minutes} ${label('phút', 'minutes')}` : minutes === 60 ? label("1 giờ", "1 hour") : minutes === 90 ? label("1 giờ 30 phút", "1 hour 30 minutes") : label("2 giờ", "2 hours")}
                </button>
              {/each}
              <button
                type="button"
                role="menuitem"
                class="end-of-track-btn"
                class:active={$audioPlayer.sleepTimerEndOfTrack}
                onclick={() => setTimerEndOfTrack()}
              >
                {label("Hết bài hiện tại", "End of current track")}
              </button>
              {#if $audioPlayer.sleepTimerRemainingMs > 0 || $audioPlayer.sleepTimerEndOfTrack}
                <button type="button" role="menuitem" class="clear" onclick={() => setTimer(0)}>
                  {label("Tắt hẹn giờ", "Turn off timer")}
                </button>
              {/if}
            </div>
            </RosarySelect>
          {/if}
        </div>

        <!-- Nhóm 2 nút mũi tên Lên & Xuống to hơn & bo tròn ngoài -->
        <div class="pt-mp-arrow-group" role="group" aria-label={label("Điều khiển hiển thị trình phát", "Player display controls")}>
          <!-- Nút Mũi tên Lên: Mở rộng trình phát toàn màn hình -->
          <button
            class="pt-mp-circle-action-btn expand"
            class:has-hint={expandHintVisible}
            type="button"
            onclick={openExpanded}
            aria-label={label("Phóng to giao diện nghe Pháp Thoại", "Expand audio player")}
            title={label("Mở rộng toàn màn hình", "Expand to full screen")}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="m18 15-6-6-6 6" />
            </svg>
          </button>

          <!-- Nút Mũi tên Xuống: Ẩn khung phát âm thanh -->
          <button
            bind:this={minimizeTrigger}
            class="pt-mp-circle-action-btn minimize"
            type="button"
            onclick={minimizeBar}
            aria-label={label("Ẩn khung phát âm thanh", "Hide audio player")}
            title={label("Ẩn thanh phát", "Hide player")}
          >
            <svg width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.6" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="m6 9 6 6 6-6" />
            </svg>
          </button>
        </div>
      </div>

      <div class="pt-mp-vol">
        <button
          class="pt-mp-mute"
          type="button"
          onclick={async () => (await getAudioPlayer()).toggleMute()}
          aria-label={$audioPlayer.muted ? label("Bật âm", "Unmute") : label("Tắt âm", "Mute")}
          aria-pressed={$audioPlayer.muted}
        >
          <svg width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M11 5L6 9H2v6h4l5 4V5zM19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07" />
          </svg>
        </button>
        <input
          aria-label={label("Âm lượng", "Volume")}
          class="pt-mp-vol-slider"
          type="range"
          min="0"
          max="1"
          step="0.05"
          value={$audioPlayer.volume}
          oninput={setVolume}
        />
      </div>
    </div>

    <p class="pt-mp-swipe-hint">{label('Vuốt phải để ẩn · Audio vẫn tiếp tục phát', 'Swipe right to hide · Audio keeps playing')}</p>
    {#if $audioPlayer.error}
      <p class:show={errorToastVisible} class="pt-mp-error-toast" role="status">{$audioPlayer.error}</p>
    {/if}
  </section>
  {:else}
    <!-- Floating Restore Pill khi thanh phát bị ẩn -->
    <aside use:reservePlayerSpace use:swipeRightDismiss={hideAudioBanner} class="pt-mp-restore-float" aria-label={label("Khôi phục thanh phát Pháp Thoại", "Restore Dharma audio player")}>
      <div class="pt-mp-restore-card">
        <!-- Chạm vào để khôi phục thanh phát -->
        <button
          type="button"
          bind:this={restoreTrigger}
          class="pt-restore-main-touch"
          onclick={restoreBar}
          aria-label={label("Mở lại thanh phát Pháp Thoại", "Restore Dharma audio player")}
          title={label("Chạm để mở lại thanh phát", "Tap to restore player")}
        >
          <div class="pt-restore-disc" class:playing={$audioPlayer.playing}>
            <span aria-hidden="true">🎵</span>
            {#if artwork.src && failedArtwork !== artwork.src}
              <img
                use:sessionCover={artwork.src}
                alt=""
                class="pt-restore-art"
                onerror={() => (failedArtwork = artwork.src)}
              />
            {/if}
            <i class="pt-mp-spin-ring" aria-hidden="true"></i>
          </div>
          <div class="pt-restore-info">
            <span class="pt-restore-track-name">
              {$audioPlayer.album.tracks[$audioPlayer.trackIndex]?.title || $audioPlayer.album.title}
            </span>
            <span class="pt-restore-status">
              <span class="pt-mp-sr-only">{$audioPlayer.playing ? label('Đang phát. ', 'Playing. ') : label('Tạm dừng. ', 'Paused. ')}</span>{label('Vuốt phải để ẩn →', 'Swipe right to hide →')}
            </span>
          </div>
        </button>

        <div class="pt-restore-actions">
          <!-- Nút Play/Pause nhanh ngay trên pill -->
          <button
            type="button"
            class="pt-restore-ctrl-btn play"
            onclick={async () => {
              const player = await getAudioPlayer();
              if ($audioPlayer.playing) player.pause();
              else await player.play();
            }}
            aria-label={$audioPlayer.playing ? label("Tạm dừng", "Pause") : label("Phát", "Play")}
            title={$audioPlayer.playing ? label("Tạm dừng", "Pause") : label("Phát", "Play")}
          >
            {#if $audioPlayer.playing}
              <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 5h4v14H6zm8 0h4v14h-4z" />
              </svg>
            {:else}
              <svg width="15" height="15" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M8 5v14l11-7z" />
              </svg>
            {/if}
          </button>

          <!-- Nút Mũi tên Lên to tròn để mở lại thanh phát -->
          <button
            type="button"
            class="pt-restore-ctrl-btn restore-arrow"
            onclick={restoreBar}
            aria-label={label("Hiện lại thanh phát", "Show player")}
            title={label("Hiện lại thanh phát", "Show player")}
          >
            <svg width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.6" viewBox="0 0 24 24" aria-hidden="true">
              <path stroke-linecap="round" stroke-linejoin="round" d="m18 15-6-6-6 6" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  {/if}

  {/if}
  <!-- Mobile Fullsheet / Modal Player (State of the art mobile listening experience) -->
  {#if mobileExpanded}
    <dialog
      class="pt-fp-sheet"
      data-dialog-glass
      use:modalDialog
      aria-modal="true"
      aria-label={label("Chi tiết trình phát Pháp Thoại", "Dharma audio player details")}
      oncancel={(event) => {
        event.preventDefault();
        if (!dismissUtilityMenu()) mobileExpanded = false;
      }}
      onclick={(event) => { if (event.target === event.currentTarget) mobileExpanded = false; }}
    >
      <!-- Sheet Top Drag Handle -->
      <div class="pt-fp-drag-handle" aria-hidden="true"></div>

      <!-- Sheet Top Bar with Drag Handle / Collapse -->
      <div class="pt-fp-header">
        <button
          type="button"
          class="pt-fp-collapse-btn"
          onclick={() => (mobileExpanded = false)}
          aria-label={label("Thu nhỏ trình phát", "Minimize player")}
          title={label("Thu nhỏ", "Minimize")}
        >
          <svg width="22" height="22" fill="none" stroke="currentColor" stroke-width="2.5" viewBox="0 0 24 24" aria-hidden="true">
            <path stroke-linecap="round" stroke-linejoin="round" d="m19 9-7 7-7-7" />
          </svg>
        </button>

        <div class="pt-fp-header-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'player'}
            class="pt-fp-tab"
            class:active={activeTab === 'player'}
            onclick={() => (activeTab = 'player')}
          >
            {label("Đang phát", "Now playing")}
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'tracks'}
            class="pt-fp-tab"
            class:active={activeTab === 'tracks'}
            onclick={() => (activeTab = 'tracks')}
          >
            {label('Danh sách', 'Tracks')} ({$audioPlayer.album.tracks.length})
          </button>
        </div>

        <button
          type="button"
          class="pt-fp-close-btn"
          onclick={() => (mobileExpanded = false)}
          aria-label={label("Đóng", "Close")}
          title={label("Đóng", "Close")}
        >
          ✕
        </button>
      </div>

      <div class="pt-fp-content">
        {#if activeTab === 'player'}
          <!-- Artwork Presentation -->
          <div class="pt-fp-artwork-wrap">
            <div class="pt-fp-artwork-box" class:playing={$audioPlayer.playing}>
              {#if artwork.src && failedArtwork !== artwork.src}
                <img
                  class="pt-fp-artwork-img"
                  use:sessionCover={artwork.src}
                  style:object-position={artwork.position}
                  alt={$audioPlayer.album.title}
                  onerror={() => (failedArtwork = artwork.src)}
                />
              {:else}
                <div class="pt-fp-artwork-placeholder">
                  <span class="pt-fp-art-icon" aria-hidden="true">📿</span>
                </div>
              {/if}
              <div class="pt-fp-artwork-glow"></div>
            </div>
          </div>

          <!-- Track & Album Metadata -->
          <div class="pt-fp-meta">
            <h2 class="pt-fp-title">{$audioPlayer.album.tracks[$audioPlayer.trackIndex]?.title || label("Không có tiêu đề", "Untitled")}</h2>
            <div class="pt-fp-subtitle">
              <span class="pt-fp-album-tag">{$audioPlayer.album.title}</span>
              {#if $audioPlayer.album.description}
                <span class="pt-fp-desc-bullet">•</span>
                <span class="pt-fp-desc">{$audioPlayer.album.description}</span>
              {/if}
            </div>
          </div>

          <!-- Touch-friendly Progress Bar -->
          {#if backgroundRestricted}
            <button class="pt-background-settings" type="button" onclick={() => { void nativeTalkPlugin.openBackgroundSettings().catch(() => {}); }}>
              {label('Máy đang hạn chế phát nền. Mở cài đặt ứng dụng → Pin và cho phép hoạt động nền.', 'Background playback is restricted. Open app settings → Battery and allow background activity.')}
            </button>
          {/if}
          <div class="pt-fp-scrubber">
            <div class="pt-fp-track-bar">
              <div class="pt-fp-track-fill" style:width={`${progressPercent}%`}></div>
              <input
                class="pt-fp-track-slider"
                type="range"
                min="0"
                max={$audioPlayer.duration || 0}
                value={$audioPlayer.currentTime}
                oninput={seek}
                aria-label={label("Tua nhanh âm thanh", "Seek audio")}
              />
            </div>
            <div class="pt-fp-times">
              <span>{formatTime($audioPlayer.currentTime)}</span>
              <span>-{formatTime(Math.max(0, $audioPlayer.duration - $audioPlayer.currentTime))}</span>
            </div>
          </div>

          <!-- Primary Controls Row (Symmetrical 5 buttons with Play in exact center) -->
          <div class="pt-fp-controls-row">
            <!-- Previous track -->
            <button
              type="button"
              class="pt-fp-ctrl-btn"
              onclick={async () => (await getAudioPlayer()).previous()}
              aria-label={label("Bài trước", "Previous track")}
            >
              <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
              </svg>
            </button>

            <!-- Seek -10s -->
            <button
              type="button"
              class="pt-fp-ctrl-btn seek-jump"
              onclick={async () => (await getAudioPlayer()).seekBy(-10)}
              aria-label={label("Lùi 10 giây", "Rewind 10 seconds")}
            >
              <span class="jump-label">−10s</span>
            </button>

            <!-- Big Play/Pause Button (Centered) -->
            <button
              type="button"
              class="pt-fp-play-btn"
              class:playing={$audioPlayer.playing}
              onclick={async () => {
                const player = await getAudioPlayer();
                if ($audioPlayer.playing) player.pause();
                else await player.play();
              }}
              aria-label={$audioPlayer.playing ? label("Tạm dừng", "Pause") : label("Phát", "Play")}
            >
              {#if $audioPlayer.playing}
                <svg width="32" height="32" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                </svg>
              {:else}
                <svg width="32" height="32" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M8 5v14l11-7z" />
                </svg>
              {/if}
            </button>

            <!-- Seek +30s -->
            <button
              type="button"
              class="pt-fp-ctrl-btn seek-jump"
              onclick={async () => (await getAudioPlayer()).seekBy(30)}
              aria-label={label("Tua tới 30 giây", "Forward 30 seconds")}
            >
              <span class="jump-label">+30s</span>
            </button>

            <!-- Next track -->
            <button
              type="button"
              class="pt-fp-ctrl-btn"
              onclick={async () => (await getAudioPlayer()).next()}
              aria-label={label("Bài tiếp theo", "Next track")}
            >
              <svg width="24" height="24" fill="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 4V8l-5.5 4zm7.5 6h2V6h-2v12z" />
              </svg>
            </button>
          </div>

          <!-- Bottom Utility Options: Repeat Mode, Speed, Sleep Timer -->
          <div class="pt-fp-utilities">
            <!-- Repeat Pill -->
            <button
              type="button"
              class="pt-fp-pill-btn repeat-pill"
              class:active={$audioPlayer.repeat > 0}
              onclick={async () => (await getAudioPlayer()).cycleRepeat()}
              aria-label={repeatText}
              title={repeatText}
            >
              {#if $audioPlayer.repeat === 1}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>
                  <path d="M11 10h1v4"/>
                </svg>
                <span>{label("Lặp 1 bài", "Repeat track")}</span>
              {:else if $audioPlayer.repeat === 2}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>
                </svg>
                <span>{label("Lặp album", "Repeat album")}</span>
              {:else}
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                  <path d="m17 2 4 4-4 4"/><path d="M3 11v-1a4 4 0 0 1 4-4h14"/><path d="m7 22-4-4 4-4"/><path d="M21 13v1a4 4 0 0 1-4 4H3"/>
                </svg>
                <span>{label("Tự chuyển", "Play next")}</span>
              {/if}
            </button>
            <!-- Speed Button with Quick Menu -->
            <div class="pt-fp-util-item" bind:this={mobileSpeedWrap}>
              <button
                type="button"
                class="pt-fp-pill-btn"
                onclick={toggleSpeedMenu}
                aria-label={label("Chọn tốc độ phát", "Choose playback speed")}
                aria-expanded={speedSheetOpen}
                aria-haspopup="dialog"
              >
                <span>{label("⚡ Tốc độ:", "⚡ Speed:")}</span>
                <strong>{$audioPlayer.speed}×</strong>
              </button>

              {#if speedSheetOpen}
                <RosarySelect anchor={mobileSpeedWrap ?? undefined} bind:open={speedSheetOpen} label={label('Tốc độ phát', 'Playback speed')} accessibleLabel={label('Tốc độ phát', 'Playback speed')} value="" options={[]} onChange={() => {}}>
                <div class="pt-fp-dropdown" role="menu">
                  {#each [0.75, 1, 1.25, 1.5, 2] as s}
                    <button
                      type="button"
                      class="pt-fp-dropdown-opt"
                      class:active={$audioPlayer.speed === s}
                      onclick={() => selectSpeed(s)}
                    >
                      {s}× {s === 1 ? label("(Mặc định)", "(Default)") : ''}
                    </button>
                  {/each}
                </div>
                </RosarySelect>
              {/if}
            </div>

            <!-- Sleep Timer Pill -->
            <div class="pt-fp-util-item" bind:this={mobileTimerWrap}>
              <button
                type="button"
                class="pt-fp-pill-btn"
                class:active={$audioPlayer.sleepTimerRemainingMs > 0 || $audioPlayer.sleepTimerEndOfTrack}
                onclick={toggleTimerMenu}
                aria-label={label("Hẹn giờ tắt nghe Pháp", "Dharma audio sleep timer")}
                aria-expanded={timerMenuOpen}
                aria-haspopup="dialog"
              >
                <span>💤</span>
                <strong>
                  {$audioPlayer.sleepTimerRemainingMs > 0 || $audioPlayer.sleepTimerEndOfTrack
                    ? `${formatCountdown($audioPlayer.sleepTimerRemainingMs)}${$audioPlayer.sleepTimerEndOfTrack ? label(" (hết bài)", " (end of track)") : ''}${!$audioPlayer.playing ? label(" (dừng)", " (paused)") : ''}`
                    : label("Hẹn giờ", "Sleep timer")}
                </strong>
              </button>

              {#if timerMenuOpen}
                <RosarySelect anchor={mobileTimerWrap ?? undefined} bind:open={timerMenuOpen} label={label('Hẹn giờ', 'Sleep timer')} accessibleLabel={label('Hẹn giờ', 'Sleep timer')} value="" options={[]} onChange={() => {}}>
                <div class="pt-fp-dropdown timer" role="menu">
                  <div class="pt-fp-dropdown-header">
                    {#if $audioPlayer.sleepTimerRemainingMs > 0 || $audioPlayer.sleepTimerEndOfTrack}
                      {label('Đếm ngược:', 'Time remaining:')} {formatCountdown($audioPlayer.sleepTimerRemainingMs)}{$audioPlayer.sleepTimerEndOfTrack ? label(" (hết bài)", " (end of track)") : ''}{!$audioPlayer.playing ? label(" (dừng)", " (paused)") : ''}
                    {:else}
                      {label('Hẹn giờ tắt nhạc:', 'Sleep timer:')}
                    {/if}
                  </div>
                  {#each [15, 30, 45, 60, 90, 120] as minutes}
                    <button
                      type="button"
                      class="pt-fp-dropdown-opt"
                      class:active={!$audioPlayer.sleepTimerEndOfTrack && $audioPlayer.sleepTimerRemainingMs > (minutes - 1) * 60_000 && $audioPlayer.sleepTimerRemainingMs <= minutes * 60_000}
                      onclick={() => setTimer(minutes)}
                    >
                      {minutes < 60 ? `${minutes} ${label('phút', 'minutes')}` : minutes === 60 ? label("1 giờ", "1 hour") : minutes === 90 ? label("1 giờ 30 phút", "1 hour 30 minutes") : label("2 giờ", "2 hours")}
                    </button>
                  {/each}
                  <button
                    type="button"
                    class="pt-fp-dropdown-opt"
                    class:active={$audioPlayer.sleepTimerEndOfTrack}
                    onclick={() => setTimerEndOfTrack()}
                  >
                    {label("Hết bài hiện tại", "End of current track")}
                  </button>
                  {#if $audioPlayer.sleepTimerRemainingMs > 0 || $audioPlayer.sleepTimerEndOfTrack}
                    <button
                      type="button"
                      class="pt-fp-dropdown-opt clear"
                      onclick={() => setTimer(0)}
                    >
                      {label("Tắt hẹn giờ", "Turn off timer")}
                    </button>
                  {/if}
                </div>
                </RosarySelect>
              {/if}
            </div>
          </div>
        {:else}
          <!-- Tracklist View -->
          <div class="pt-fp-tracklist">
            <div class="pt-fp-tracklist-header">
              <h3>{label("Các bài trong album", "Album tracks")}</h3>
              <span>{$audioPlayer.album.tracks.length} {label('bài', 'tracks')}</span>
            </div>

            <div class="pt-fp-tracks-scroll">
              {#each $audioPlayer.album.tracks as track, index}
                <button
                  type="button"
                  class="pt-fp-track-item"
                  class:active={$audioPlayer.trackIndex === index}
                  onclick={() => playTrack(index)}
                >
                  <div class="pt-fp-track-num">
                    {#if $audioPlayer.trackIndex === index && $audioPlayer.playing}
                      <span class="playing-bars" aria-label={label("Đang phát", "Now playing")}>
                        <i></i><i></i><i></i>
                      </span>
                    {:else}
                      <span>{index + 1}</span>
                    {/if}
                  </div>
                  <div class="pt-fp-track-details">
                    <div class="pt-fp-track-title">{track.title}</div>
                    {#if $audioPlayer.trackIndex === index}
                      <div class="pt-fp-track-status">{label("Đang phát ngay bây giờ", "Playing now")}</div>
                    {/if}
                  </div>
                </button>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    </dialog>
  {/if}
{/if}

<style>
  .pt-background-settings{display:block;width:100%;padding:12px 16px;border:1px solid var(--gold);border-radius:12px;background:var(--gold-muted);color:var(--text);font:inherit;font-size:var(--font-size-label);line-height:1.5;text-align:left;cursor:pointer}
  .pt-mini-player,.pt-mp-restore-float { touch-action: pan-y; }
  .pt-mp-swipe-hint { margin: 0; padding: 0 12px 5px; color: var(--muted); font-size:var(--font-size-meta); text-align: center; }
  /* ==========================================================================
     Mini Player (Docked Bottom Bar)
     ========================================================================== */
  .pt-mini-player {
    position: fixed;
    z-index: 500;
    right: 0;
    bottom: 0;
    left: 0;
    padding-bottom: env(safe-area-inset-bottom, 0);
    border-top: 1px solid var(--border);
    background: rgba(250, 248, 240, 0.97);
    box-shadow: 0 -4px 24px rgba(60, 40, 10, 0.1);
    backdrop-filter: none;
  }

  .pt-mp-sr-only {
    position: absolute;
    width: 1px;
    height: 1px;
    overflow: hidden;
    margin: -1px;
    padding: 0;
    border: 0;
    clip: rect(0, 0, 0, 0);
    white-space: nowrap;
  }

  :global([data-theme="dark"]) .pt-mini-player {
    background: rgba(21, 18, 13, 0.96);
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.4);
  }

  .pt-mp-progress-bar {
    position: relative;
    height: 4px;
    background: var(--border2);
  }

  .pt-mp-progress-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 0;
    background: linear-gradient(90deg, var(--gold), var(--gold2));
    pointer-events: none;
  }

  .pt-mp-progress-input {
    position: absolute;
    inset: -10px 0;
    width: 100%;
    height: 24px;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .pt-mp-body {
    display: flex;
    max-width: 920px;
    margin: 0 auto;
    align-items: center;
    gap: 12px;
    padding: 8px 16px;
  }

  /* Info block touch target */
  .pt-mp-info-touch {
    display: flex;
    align-items: center;
    gap: 12px;
    flex: 1;
    min-width: 0;
    padding: 2px 4px;
    border: 0;
    border-radius: 8px;
    background: none;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s ease;
  }

  .pt-mp-info-touch:hover {
    background: rgba(200, 150, 62, 0.06);
  }

  .pt-mp-thumb {
    position: relative;
    display: flex;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    overflow: hidden;
    align-items: center;
    justify-content: center;
    border-radius: 8px;
    background: linear-gradient(135deg, var(--gold-muted), #e8d0a0);
    font-size: 20px;
    box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
  }

  .pt-mp-art-img {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    border-radius: 8px;
  }

  :global([data-theme="dark"]) .pt-mp-thumb {
    background: linear-gradient(135deg, #2a2318, #352a18);
  }

  .pt-mp-spin-ring {
    position: absolute;
    inset: 0;
    display: none;
    border: 2px solid transparent;
    border-top-color: var(--gold);
    border-radius: 8px;
  }

  .pt-mp-thumb.playing .pt-mp-spin-ring {
    display: block;
    animation: mp-spin 2.5s linear infinite;
  }

  @keyframes mp-spin {
    to {
      transform: rotate(360deg);
    }
  }

  .pt-mp-info {
    min-width: 0;
    flex: 1;
  }

  .pt-mp-track-name,
  .pt-mp-album-name {
    display: block;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pt-mp-track-name {
    color: var(--text);
    font-size:var(--font-size-body);
    font-weight: 600;
    line-height: 1.3;
  }

  .pt-mp-album-name {
    margin-top: 2px;
    color: var(--muted);
    font-size:var(--font-size-meta);
  }

  .pt-mp-time {
    margin-top: 1px;
    color: var(--muted);
    font-size: 10.5px;
    font-variant-numeric: tabular-nums;
  }

  .pt-mp-time b {
    margin-left: 8px;
    color: var(--gold);
  }

  .pt-mp-controls {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 4px;
  }

  .pt-mp-btn {
    display: flex;
    width: 48px;
    height: 48px;
    align-items: center;
    justify-content: center;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--text2);
    cursor: pointer;
    transition: background 0.15s, color 0.15s, transform 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .pt-mp-btn:hover {
    background: var(--bg3);
    color: var(--brown);
  }

  .pt-mp-btn:active {
    transform: scale(0.92);
  }

  .pt-mp-btn.speed {
    font-family: inherit;
    font-size: 12px;
    font-weight: 700;
  }

  .pt-mp-btn.seek {
    font-family: inherit;
    font-size: 10.5px;
    font-weight: 700;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .pt-mp-btn.play-pause {
    width: 48px;
    height: 48px;
    background: var(--gold);
    color: var(--on-gold);
    box-shadow: 0 2px 10px rgba(200, 150, 62, 0.35);
  }

  .pt-mp-btn.play-pause:hover {
    background: var(--brown2);
    box-shadow: 0 4px 14px rgba(107, 76, 42, 0.4);
  }

  /* Arrow button group: Expand Up and Minimize Down (To hơn & Bo tròn ngoài) */
  .pt-mp-arrow-group {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .pt-mp-circle-action-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    border: 1.5px solid color-mix(in srgb, var(--gold) 48%, var(--border));
    background: color-mix(in srgb, var(--gold) 10%, var(--card));
    color: var(--gold);
    cursor: pointer;
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.05);
    transition: background 0.18s ease, color 0.18s ease, transform 0.18s cubic-bezier(0.2, 0.8, 0.2, 1), border-color 0.18s ease, box-shadow 0.18s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .pt-mp-circle-action-btn:hover {
    background: color-mix(in srgb, var(--gold) 22%, var(--card));
    border-color: var(--gold);
    color: var(--gold2);
    transform: scale(1.08);
    box-shadow: 0 4px 12px rgba(200, 150, 62, 0.3);
  }

  .pt-mp-circle-action-btn:active {
    transform: scale(0.92);
  }

  .pt-mp-circle-action-btn.expand.has-hint {
    animation: expand-btn-glow 1.8s ease-in-out infinite;
    border-color: var(--gold2);
    background: color-mix(in srgb, var(--gold) 28%, var(--card));
  }

  :global([data-theme="dark"]) .pt-mp-circle-action-btn {
    background: rgba(42, 35, 24, 0.7);
    border-color: color-mix(in srgb, var(--gold) 40%, #3a3226);
    color: var(--gold2);
  }

  :global([data-theme="dark"]) .pt-mp-circle-action-btn:hover {
    background: rgba(58, 48, 32, 0.9);
    border-color: var(--gold);
  }

  /* ==========================================================================
     Floating Restore Pill (Khi thanh phát bị ẩn)
     ========================================================================== */
  .pt-mp-restore-float {
    position: fixed;
    z-index: 550;
    right: 14px;
    bottom: calc(72px + env(safe-area-inset-bottom, 0));
    max-width: 360px;
    animation: pt-restore-fade-in 0.25s cubic-bezier(0.16, 1, 0.3, 1);
  }

  @media (max-width: 480px) {
    .pt-mp-restore-float {
      right: 10px;
      left: 10px;
      max-width: none;
    }
  }

  @media (min-width: 769px) {
    .pt-mp-restore-float {
      bottom: 24px;
      right: 24px;
    }
  }

  .pt-mp-restore-card {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 6px 10px 6px 6px;
    border-radius: 999px;
    background: var(--card);
    border: 1.5px solid color-mix(in srgb, var(--gold) 45%, var(--border));
    box-shadow: var(--shadow-lg);
    backdrop-filter: blur(12px);
    -webkit-backdrop-filter: blur(12px);
  }

  :global([data-theme="dark"]) .pt-mp-restore-card {
    background: var(--card);
    border-color: color-mix(in srgb, var(--gold) 45%, var(--border));
    box-shadow: var(--shadow-lg);
  }

  .pt-restore-main-touch {
    display: flex;
    align-items: center;
    gap: 10px;
    background: transparent;
    border: 0;
    cursor: pointer;
    padding: 0;
    text-align: left;
    flex: 1;
    min-width: 0;
    -webkit-tap-highlight-color: transparent;
  }

  .pt-restore-disc {
    position: relative;
    width: 38px;
    height: 38px;
    border-radius: 50%;
    overflow: hidden;
    background: var(--bg2);
    border: 1.5px solid var(--gold);
    display: flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
  }

  .pt-restore-disc.playing .pt-restore-art {
    animation: pt-disc-spin 14s linear infinite;
  }

  @keyframes pt-disc-spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .pt-restore-art {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pt-restore-info {
    display: flex;
    flex-direction: column;
    gap: 1px;
    min-width: 0;
  }

  .pt-restore-track-name {
    font-size:var(--font-size-body);
    font-weight: 700;
    color: var(--text);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
    line-height: 1.25;
  }

  .pt-restore-status {
    font-size:var(--font-size-meta);
    color: var(--gold);
    font-weight: 600;
    line-height: 1.2;
  }

  .pt-restore-actions {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-shrink: 0;
  }

  .pt-restore-ctrl-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 0;
    cursor: pointer;
    transition: transform 0.15s ease, background 0.15s ease;
    -webkit-tap-highlight-color: transparent;
  }

  .pt-restore-ctrl-btn.play {
    background: var(--gold);
    color: var(--on-gold);
    box-shadow: var(--shadow);
  }

  .pt-restore-ctrl-btn.play:hover {
    background: var(--brown2);
  }

  .pt-restore-ctrl-btn.restore-arrow {
    background: color-mix(in srgb, var(--gold) 15%, var(--card));
    color: var(--gold);
    border: 1.5px solid color-mix(in srgb, var(--gold) 48%, var(--border));
  }

  .pt-restore-ctrl-btn.restore-arrow:hover {
    background: color-mix(in srgb, var(--gold) 28%, var(--card));
    border-color: var(--gold);
  }

  .pt-restore-ctrl-btn:active {
    transform: scale(0.92);
  }

  @keyframes pt-restore-fade-in {
    from {
      opacity: 0;
      transform: translateY(14px) scale(0.96);
    }
    to {
      opacity: 1;
      transform: translateY(0) scale(1);
    }
  }

  /* Expand Hint Banner & Pointer */
  .pt-mp-expand-hint {
    position: absolute;
    bottom: calc(100% + 10px);
    left: 50%;
    transform: translateX(-50%);
    z-index: 650;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    padding: 5px 8px 5px 12px;
    background: linear-gradient(135deg, #2c2014 0%, #1a140d 100%);
    border: 1.5px solid var(--gold);
    border-radius: 999px;
    box-shadow: 0 6px 22px rgba(40, 25, 10, 0.35), 0 0 14px rgba(200, 150, 62, 0.3);
    color: #fff;
    cursor: pointer;
    white-space: nowrap;
    animation: hint-slide-bounce 0.45s cubic-bezier(0.175, 0.885, 0.32, 1.275), hint-float 2.5s ease-in-out infinite 0.45s;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  :global([data-theme="dark"]) .pt-mp-expand-hint {
    background: linear-gradient(135deg, #241c13 0%, #16120b 100%);
    border-color: var(--gold2);
    box-shadow: 0 6px 24px rgba(0, 0, 0, 0.6), 0 0 14px rgba(218, 165, 32, 0.25);
  }

  .pt-mp-hint-content {
    display: inline-flex;
    align-items: center;
    gap: 7px;
    margin: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font-family: inherit;
    cursor: pointer;
    -webkit-tap-highlight-color: transparent;
  }

  .pt-mp-hint-badge {
    display: inline-flex;
    width: 20px;
    height: 20px;
    align-items: center;
    justify-content: center;
    border-radius: 50%;
    background: var(--gold);
    color: #fff;
    flex-shrink: 0;
    animation: chevron-up-down 1.2s ease-in-out infinite;
  }

  .pt-mp-hint-text {
    color: #fdfaf3;
    font-size:var(--font-size-meta);
    font-weight: 600;
    letter-spacing: 0.1px;
    line-height: 1.2;
  }

  .pt-mp-hint-text-short {
    display: none;
  }

  .pt-mp-hint-hand {
    font-size: 13px;
    display: inline-block;
    animation: hand-tap 1.4s ease-in-out infinite;
  }

  .pt-mp-hint-close {
    display: inline-flex;
    width: 20px;
    height: 20px;
    align-items: center;
    justify-content: center;
    margin-left: 2px;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: rgba(255, 255, 255, 0.14);
    color: rgba(255, 255, 255, 0.8);
    font-family: inherit;
    font-size: 11px;
    font-weight: 700;
    line-height: 1;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
    -webkit-tap-highlight-color: transparent;
  }

  .pt-mp-hint-close:hover {
    background: rgba(255, 255, 255, 0.3);
    color: #fff;
  }

  .pt-mp-hint-pointer {
    position: absolute;
    bottom: -6px;
    left: 50%;
    transform: translateX(-50%);
    width: 0;
    height: 0;
    border-left: 6px solid transparent;
    border-right: 6px solid transparent;
    border-top: 6px solid var(--gold);
  }

  :global([data-theme="dark"]) .pt-mp-hint-pointer {
    border-top-color: var(--gold2);
  }

  @keyframes hint-slide-bounce {
    0% {
      opacity: 0;
      transform: translate(-50%, 12px) scale(0.92);
    }
    60% {
      opacity: 1;
      transform: translate(-50%, -3px) scale(1.02);
    }
    100% {
      opacity: 1;
      transform: translate(-50%, 0) scale(1);
    }
  }

  @keyframes hint-float {
    0%, 100% {
      transform: translate(-50%, 0);
    }
    50% {
      transform: translate(-50%, -4px);
    }
  }

  @keyframes chevron-up-down {
    0%, 100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-2.5px);
    }
  }

  @keyframes hand-tap {
    0%, 100% {
      transform: translateY(0) rotate(0deg);
    }
    30% {
      transform: translateY(-3px) rotate(-8deg);
    }
    60% {
      transform: translateY(1px) rotate(4deg);
    }
  }

  @keyframes expand-btn-glow {
    0%, 100% {
      transform: scale(1);
      box-shadow: 0 0 0 0 rgba(200, 150, 62, 0.45);
    }
    50% {
      transform: scale(1.15);
      box-shadow: 0 0 0 7px rgba(200, 150, 62, 0);
      background: rgba(200, 150, 62, 0.18);
    }
  }

  @media (max-width: 420px) {
    .pt-mp-hint-text-full {
      display: none;
    }
    .pt-mp-hint-text-short {
      display: inline;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .pt-mp-expand-hint,
    .pt-mp-hint-badge,
    .pt-mp-hint-hand,
    .pt-mp-circle-action-btn.expand.has-hint {
      animation: none !important;
    }
  }

  .timer-wrap {
    position: relative;
  }

  .timer-button {
    height: auto;
    border-radius: 8px;
    padding: 4px 6px;
    flex-direction: column;
    gap: 2px;
  }

  .timer-button small {
    font-size: 9px;
    font-weight: 700;
    line-height: 1;
  }

  .timer-button.active {
    border-color: var(--gold);
    background: var(--gold-light, rgba(200, 140, 40, 0.15));
    color: var(--brown, #6b4c2a);
  }

  .timer-button.active.is-paused {
    opacity: 0.82;
  }

  .timer-countdown {
    font-size: 9.5px;
    font-weight: 700;
    line-height: 1;
    color: var(--gold);
  }

  .timer-button.active.is-paused .timer-countdown {
    color: var(--muted);
  }

  .timer-menu {
    position: absolute;
    right: 0;
    bottom: 55px;
    z-index: 100;
    display: flex;
    min-width: 140px;
    flex-direction: column;
    gap: 2px;
    padding: 6px;
    border: 1px solid var(--border);
    border-radius: 12px;
    background: var(--white);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.15);
  }

  .timer-menu > strong {
    margin-bottom: 4px;
    padding: 4px 8px;
    border-bottom: 1px solid var(--border2);
    color: var(--muted);
    font-size:var(--font-size-meta);
    text-align: center;
  }

  .timer-menu button {
    width: 100%;
    padding: 8px 12px;
    border: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--text);
    cursor: pointer;
    font-family: inherit;
    font-size:var(--font-size-label);
    font-weight: 600;
    transition: background 0.15s;
  }

  .timer-menu button:hover,
  .timer-menu button.active {
    background: var(--bg);
    color: var(--gold);
  }

  .timer-menu .clear {
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--border2);
    color: var(--red);
  }

  .pt-mp-vol {
    display: flex;
    flex-shrink: 0;
    align-items: center;
    gap: 6px;
  }

  .pt-mp-mute {
    display: grid;
    width: 28px;
    height: 28px;
    place-items: center;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--text2);
    cursor: pointer;
  }

  .pt-mp-mute:hover {
    background: var(--bg3);
    color: var(--brown);
  }

  .pt-mp-vol-slider {
    width: 72px;
    height: 4px;
    accent-color: var(--gold);
    cursor: pointer;
  }

  .pt-mp-error-toast {
    position: fixed;
    z-index: 9999;
    bottom: 90px;
    left: 50%;
    max-width: calc(100vw - 32px);
    overflow: hidden;
    margin: 0;
    padding: 9px 18px;
    border-radius: 20px;
    background: var(--brown-dark);
    color: #fff;
    font-size:var(--font-size-body);
    font-weight: 600;
    opacity: 0;
    pointer-events: none;
    text-overflow: ellipsis;
    transform: translate(-50%, 20px);
    transition: opacity 0.25s, transform 0.25s;
    white-space: nowrap;
  }

  .pt-mp-error-toast.show {
    opacity: 1;
    transform: translate(-50%, 0);
  }

  :global([data-theme="dark"]) .pt-mp-error-toast {
    background: var(--gold);
  }

  /* ==========================================================================
     Mobile Fullsheet Modal Player (Modern, Immersive Audio Experience)
     ========================================================================== */
  .pt-fp-sheet::backdrop {
    background: var(--practice-dialog-backdrop);
    backdrop-filter: blur(8px);
    animation: fp-fade 0.25s ease-out;
  }

  @keyframes fp-fade {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  .pt-fp-sheet {
    position: fixed;
    inset: auto 0 0;
    margin: 0;
    padding: 0;
    border: 0;
    box-sizing: border-box;
    width: 100%;
    max-width: none;
    max-height: calc(100dvh - max(var(--app-safe-top, env(safe-area-inset-top, 0px)), 12px));
    height: 92dvh;
    display: flex;
    flex-direction: column;
    border-top-left-radius: var(--radius-feature);
    border-top-right-radius: var(--radius-feature);
    background: var(--dialog-surface-background, var(--card));
    box-shadow: var(--dialog-surface-shadow, var(--shadow-xl));
    overflow: hidden;
    animation: fp-slide-up 0.3s cubic-bezier(0.16, 1, 0.3, 1);
  }

  :global([data-theme="dark"]) .pt-fp-sheet {
    background: var(--dialog-surface-background, var(--card));
    border-top: 1px solid var(--dialog-surface-border, var(--border));
  }

  .pt-fp-drag-handle {
    width: 38px;
    height: 4px;
    border-radius: 2px;
    background: var(--border);
    margin: 8px auto 2px;
    flex-shrink: 0;
    opacity: 0.8;
  }

  @keyframes fp-slide-up {
    from {
      transform: translateY(100%);
    }
    to {
      transform: translateY(0);
    }
  }

  .pt-fp-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 6px 14px 10px;
    border-bottom: 1px solid var(--border2);
    flex-shrink: 0;
    gap: 8px;
  }

  .pt-fp-collapse-btn,
  .pt-fp-close-btn {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border: 0;
    border-radius: 50%;
    background: var(--bg);
    color: var(--text2);
    cursor: pointer;
    transition: background 0.15s, transform 0.15s;
  }

  .pt-fp-collapse-btn:active,
  .pt-fp-close-btn:active {
    transform: scale(0.9);
  }

  .pt-fp-header-tabs {
    display: flex;
    background: var(--bg2, var(--bg));
    padding: 3px;
    border-radius: 20px;
    gap: 4px;
    flex-shrink: 0;
    max-width: calc(100% - 96px);
  }

  .pt-fp-tab {
    min-height: 44px;
    padding: 6px 12px;
    border: 0;
    border-radius: 16px;
    background: none;
    color: var(--muted);
    font-family: inherit;
    font-size:var(--font-size-label);
    font-weight: 600;
    cursor: pointer;
    white-space: nowrap;
    transition: all 0.2s ease;
  }

  .pt-fp-tab.active {
    background: var(--white);
    color: var(--gold);
    box-shadow: 0 2px 6px rgba(0, 0, 0, 0.08);
  }

  :global([data-theme="dark"]) .pt-fp-tab.active {
    background: #2b2318;
  }

  .pt-fp-content {
    flex: 1;
    min-height: 0;
    overflow-y: auto;
    padding: 16px 20px calc(24px + env(safe-area-inset-bottom, 0));
    display: flex;
    flex-direction: column;
    align-items: center;
    overscroll-behavior: contain;
  }

  .pt-fp-content > :global(*) {
    flex-shrink: 0;
  }

  /* Artwork */
  .pt-fp-artwork-wrap {
    width: 100%;
    max-width: clamp(96px, calc(100dvh - 520px), 280px);
    margin: 6px auto 16px;
  }

  .pt-fp-artwork-box {
    position: relative;
    width: 100%;
    aspect-ratio: 1;
    border-radius: 20px;
    overflow: hidden;
    background: linear-gradient(135deg, var(--gold-muted), #e4d2ae);
    box-shadow: 0 12px 32px rgba(60, 40, 10, 0.18);
    display: flex;
    align-items: center;
    justify-content: center;
  }

  :global([data-theme="dark"]) .pt-fp-artwork-box {
    background: linear-gradient(135deg, #2b2216, #3d301f);
    box-shadow: 0 12px 32px rgba(0, 0, 0, 0.55);
  }

  .pt-fp-artwork-img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  .pt-fp-artwork-placeholder {
    font-size: 64px;
  }

  .pt-fp-artwork-glow {
    position: absolute;
    inset: 0;
    box-shadow: inset 0 0 40px rgba(0, 0, 0, 0.15);
    pointer-events: none;
  }

  /* Meta */
  .pt-fp-meta {
    width: 100%;
    text-align: center;
    margin-bottom: 20px;
    padding: 0 8px;
    box-sizing: border-box;
  }

  .pt-fp-title {
    margin: 0 0 6px;
    font-size: 18px;
    font-weight: 700;
    color: var(--text);
    line-height: 1.35;
    text-align: center;
    width: 100%;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  .pt-fp-subtitle {
    display: flex;
    align-items: center;
    justify-content: center;
    text-align: center;
    flex-wrap: wrap;
    gap: 4px 6px;
    font-size:var(--font-size-meta);
    color: var(--gold);
    font-weight: 600;
    line-height: 1.4;
  }

  .pt-fp-desc {
    color: var(--muted);
    font-weight: 400;
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
    overflow-wrap: anywhere;
  }

  /* Scrubber */
  .pt-fp-scrubber {
    width: 100%;
    max-width: 360px;
    margin-bottom: 20px;
  }

  .pt-fp-track-bar {
    position: relative;
    height: 6px;
    border-radius: 4px;
    background: var(--border2);
    overflow: visible;
  }

  .pt-fp-track-fill {
    position: absolute;
    inset: 0 auto 0 0;
    border-radius: 4px;
    background: linear-gradient(90deg, var(--gold), #d8a047);
    pointer-events: none;
  }

  .pt-fp-track-slider {
    position: absolute;
    inset: -12px 0;
    width: 100%;
    height: 30px;
    margin: 0;
    opacity: 0;
    cursor: pointer;
  }

  .pt-fp-times {
    display: flex;
    justify-content: space-between;
    margin-top: 8px;
    font-size: 12px;
    color: var(--muted);
    font-variant-numeric: tabular-nums;
    font-weight: 500;
  }

  /* Control buttons */
  .pt-fp-controls-row {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0;
    width: 100%;
    /* Tính theo 4 nút 44px và nút phát 64px, không phụ thuộc khoảng lề trang. */
    max-width: calc(4 * 44px + 64px + 4 * var(--radius-sm) * 2);
    margin: 0 auto 24px;
  }

  .pt-fp-ctrl-btn {
    display: grid;
    place-items: center;
    width: 44px;
    height: 44px;
    flex-shrink: 0;
    border: 0;
    border-radius: 50%;
    background: var(--bg);
    color: var(--text);
    cursor: pointer;
    transition: transform 0.15s, background 0.15s;
  }

  .pt-fp-ctrl-btn:active {
    transform: scale(0.92);
  }

  .pt-fp-ctrl-btn.seek-jump {
    font-size: 12px;
    font-weight: 700;
    color: var(--text2);
  }

  .pt-fp-play-btn {
    display: grid;
    place-items: center;
    width: 64px;
    height: 64px;
    flex-shrink: 0;
    border: 0;
    border-radius: 50%;
    background: linear-gradient(135deg, var(--gold), var(--gold2));
    color: var(--on-gold);
    box-shadow: 0 4px 18px rgba(200, 150, 62, 0.45);
    cursor: pointer;
    transition: transform 0.15s, box-shadow 0.15s;
  }

  .pt-fp-play-btn:active {
    transform: scale(0.94);
    box-shadow: 0 2px 10px rgba(200, 150, 62, 0.3);
  }

  /* Bottom utilities */
  .pt-fp-utilities {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    align-items: stretch;
    justify-content: center;
    gap: 8px;
    width: 100%;
    max-width: 360px;
  }

  .pt-fp-util-item {
    position: relative;
    display: flex;
    align-items: stretch;
    min-width: 0;
  }

  .pt-fp-pill-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-wrap: wrap;
    min-width: 0;
    width: 100%;
    min-height: 44px;
    gap: 5px;
    padding: 7px 8px;
    border: 1px solid var(--border2);
    border-radius: 20px;
    background: var(--bg);
    color: var(--text2);
    font-family: inherit;
    font-size:var(--font-size-label);
    cursor: pointer;
    white-space: normal;
    transition: background 0.15s, border-color 0.15s, color 0.15s;
  }

  .pt-fp-pill-btn.active {
    border-color: var(--gold);
    color: var(--gold);
    background: rgba(200, 150, 62, 0.08);
  }

  .pt-fp-dropdown {
    position: absolute;
    bottom: calc(100% + 8px);
    left: 50%;
    transform: translateX(-50%);
    background: var(--white);
    border: 1px solid var(--border);
    border-radius: 14px;
    box-shadow: 0 8px 24px rgba(0, 0, 0, 0.18);
    padding: 6px;
    display: flex;
    flex-direction: column;
    width: calc(var(--space-page) * 9);
    min-width: 0;
    max-width: calc(100vw - 2 * var(--space-page));
    max-height: min(360px, calc(100dvh - 180px));
    overflow-y: auto;
    overscroll-behavior: contain;
    z-index: 100;
  }

  .pt-fp-dropdown.timer {
    left: auto;
    right: 0;
    transform: none;
  }

  :global([data-theme="dark"]) .pt-fp-dropdown {
    background: #241d14;
    border-color: rgba(200, 150, 62, 0.25);
  }

  .pt-fp-dropdown-header {
    padding: 6px 10px;
    font-size:var(--font-size-meta);
    font-weight: 700;
    color: var(--muted);
    border-bottom: 1px solid var(--border2);
    text-align: center;
  }

  .pt-fp-dropdown-opt {
    min-height: 44px;
    padding: 8px 12px;
    border: 0;
    border-radius: 8px;
    background: none;
    color: var(--text);
    font-family: inherit;
    font-size:var(--font-size-label);
    font-weight: 500;
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }

  .pt-fp-dropdown-opt:hover,
  .pt-fp-dropdown-opt.active {
    background: var(--bg);
    color: var(--gold);
    font-weight: 700;
  }

  .pt-fp-dropdown-opt.clear {
    margin-top: 4px;
    padding-top: 8px;
    border-top: 1px solid var(--border2);
    color: var(--red);
  }

  /* Tracklist */
  .pt-fp-tracklist {
    width: 100%;
    display: flex;
    flex-direction: column;
  }

  .pt-fp-tracklist-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
    padding-bottom: 8px;
    border-bottom: 1px solid var(--border2);
  }

  .pt-fp-tracklist-header h3 {
    margin: 0;
    font-size:var(--font-size-card-title);
    color: var(--text);
  }

  .pt-fp-tracklist-header span {
    font-size:var(--font-size-meta);
    color: var(--muted);
  }

  .pt-fp-tracks-scroll {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .pt-fp-track-item {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 10px 12px;
    border: 0;
    border-radius: 10px;
    background: var(--bg);
    color: var(--text);
    text-align: left;
    cursor: pointer;
    transition: background 0.15s;
  }

  .pt-fp-track-item.active {
    background: rgba(200, 150, 62, 0.12);
    border: 1px solid rgba(200, 150, 62, 0.3);
  }

  .pt-fp-track-num {
    width: 28px;
    height: 28px;
    display: grid;
    place-items: center;
    border-radius: 50%;
    background: var(--bg2, rgba(0, 0, 0, 0.05));
    font-size: 12px;
    font-weight: 700;
    color: var(--muted);
    flex-shrink: 0;
  }

  .pt-fp-track-item.active .pt-fp-track-num {
    background: var(--gold);
    color: #fff;
  }

  .pt-fp-track-details {
    flex: 1;
    min-width: 0;
  }

  .pt-fp-track-title {
    font-size:var(--font-size-body);
    font-weight: 600;
    color: var(--text);
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .pt-fp-track-item.active .pt-fp-track-title {
    color: var(--gold);
  }

  .pt-fp-track-status {
    font-size:var(--font-size-meta);
    color: var(--gold);
    margin-top: 2px;
  }

  /* Equalizer wave icon */
  .playing-bars {
    display: flex;
    align-items: flex-end;
    gap: 2px;
    height: 12px;
  }

  .playing-bars i {
    width: 2px;
    background: #fff;
    border-radius: 1px;
    animation: bar-wave 1s ease-in-out infinite;
  }

  .playing-bars i:nth-child(1) {
    height: 6px;
    animation-delay: 0s;
  }
  .playing-bars i:nth-child(2) {
    height: 12px;
    animation-delay: 0.2s;
  }
  .playing-bars i:nth-child(3) {
    height: 8px;
    animation-delay: 0.4s;
  }

  @keyframes bar-wave {
    0%,
    100% {
      height: 4px;
    }
    50% {
      height: 12px;
    }
  }

  /* Responsive layout adjustments */
  @media (max-width: 768px) {
    .pt-mini-player {
      bottom: calc(var(--nav-base-h) + env(safe-area-inset-bottom, 0px));
      padding-bottom: 0;
      z-index: 600;
    }
    .pt-mp-body {
      flex-wrap: wrap;
      gap: calc(var(--space-page) * .2);
      padding: 6px 12px;
    }
    .pt-mp-arrow-group {
      display: flex;
    }
    .pt-mp-btn,
    .pt-mp-btn.play-pause,
    .pt-mp-mute,
    .pt-mp-hint-close,
    .pt-fp-collapse-btn,
    .pt-fp-close-btn {
      width: 44px;
      height: 44px;
      min-width: 44px;
      min-height: 44px;
    }
    .pt-fp-tab,
    .timer-menu button {
      min-height: 44px;
    }
    .pt-fp-header-tabs {
      flex: 1;
      flex-shrink: 1;
      min-width: 0;
      max-width: none;
    }
    .pt-fp-tab {
      flex: 1;
      min-width: 0;
      padding-inline: calc(var(--space-page) * .3);
      white-space: normal;
    }
    .pt-fp-sheet {
      height: 92dvh;
      max-height: calc(100dvh - max(env(safe-area-inset-top, 0px), calc(var(--space-page) * .6)));
    }
    .pt-fp-artwork-wrap {
      max-width: min(280px, 28dvh);
    }
  }

  @media (max-width: 580px) {
    .pt-mp-body {
      flex-wrap: wrap;
      gap: calc(var(--space-page) * .2);
      padding: calc(var(--space-page) * .3) calc(var(--space-page) * .6);
    }
    .pt-mp-info-touch {
      flex-basis: 100%;
    }
    .pt-mp-controls {
      width: 100%;
      justify-content: flex-end;
    }
    .pt-mp-vol {
      display: none;
    }
    .pt-mp-btn.speed,
    .timer-wrap,
    .pt-mp-btn.seek {
      display: none;
    }
    .pt-mp-arrow-group {
      display: flex;
    }
  }
  .pt-mp-restore-float{right:var(--radius-control);bottom:calc(var(--nav-base-h) + env(safe-area-inset-bottom,0px) + var(--radius-control));max-width:min(360px,calc(100% - var(--radius-control)*2))}
  .pt-mp-restore-card{color:var(--text);border-color:var(--gold)}
  .pt-restore-main-touch{min-height:44px;color:var(--text)}
  .pt-restore-ctrl-btn{min-width:44px;min-height:44px}
  @media(max-width:480px){.pt-mp-restore-float{left:var(--radius);right:var(--radius);max-width:none}}
  @media(min-width:769px){.pt-mp-restore-float{bottom:var(--radius-feature);right:var(--radius-feature)}}
  .pt-mp-restore-float button:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
  @media(prefers-reduced-motion:reduce){.pt-mp-restore-float,.pt-mp-restore-float .pt-mp-spin-ring,.pt-restore-disc.playing .pt-restore-art{animation:none}.pt-restore-ctrl-btn,.pt-restore-main-touch{transition:none}}
</style>
