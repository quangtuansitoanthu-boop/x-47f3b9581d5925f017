<script lang="ts">
  import { isNativeApp } from '$lib/browser/native-platform';
  import { Clock3 } from '@lucide/svelte';
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  import { meditationTabCopy } from '$lib/i18n/ui-copy';
  const localizeUi = createInterfaceTranslator();
  const locale = getLocaleContext();
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { DAILY_CALENDAR_ARTWORKS } from '$lib/components/lunar/calendar-artwork';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import {
    isAudioDownloaded,
    downloadAudioTrack,
    deleteAudioTrack,
    getAudioTrackMeta
  } from '$lib/browser/practice-audio-cache';
  import { AMBIENT_SOUND_OPTIONS, AMBIENT_SOUND_TRACKS, getAmbientSoundLabel, type AmbientSoundType } from '$lib/browser/ambient-sound';
  import type { MeditationTrackOption } from '$lib/browser/practice-audio';
  import { DEFAULT_MEDITATION_SETUP, type MeditationSetup } from '$lib/browser/practice-meditation';
  import {
    MEDITATION_DURATION_PRESETS_MINUTES,
    WOODEN_FISH_TEMPO_PRESETS,
    resolveWoodenFishBpm,
    type WoodenFishTempoPreset,
  } from '$lib/domain/practice/guided-sessions';

  interface Props {
    initial?: MeditationSetup;
    initialBackgroundArtwork?: string | null;
    open: boolean;
    options: readonly MeditationTrackOption[];
    onCancel: () => void;
    onStart: (setup: MeditationSetup, backgroundArtwork?: string | null) => void;
  }

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.practice);

  let { initial = DEFAULT_MEDITATION_SETUP, initialBackgroundArtwork = null, open, options, onCancel, onStart }: Props = $props();
  let durationMinutes = $state(15);
  let customDuration = $state(20);
  let customSelected = $state(false);
  let fullscreenVisual = $state(true);
  let motionEnabled = $state(false);
  let musicTrack = $state<MeditationSetup['musicTrack']>(null);
  let ambientSound = $state<AmbientSoundType>('none');
  let woodenFishBpm = $state(45);
  let woodenFishEnabled = $state(false);
  let woodenFishPreset = $state<WoodenFishTempoPreset>('slow');
  const tabKeys = ['time', 'music', 'ambient', 'background'] as const;
  type MeditationTab = (typeof tabKeys)[number];
  let activeTab = $state<MeditationTab>('time');
  let tabButtons = $state<HTMLButtonElement[]>([]);
  let startButton = $state<HTMLButtonElement>();
  let cancelButton = $state<HTMLButtonElement>();
  let selectedBackground = $state<string | null>(null);
  let failedBackgrounds = $state<string[]>([]);
  const chooserId = $props.id();
  const backgroundChoices = [0, 1, 2, 3, 4, 8, 7, 9, 5, 6].map(index => ({ artwork: DAILY_CALENDAR_ARTWORKS[index], labelIndex: index }));

  function tabLabel(tab: MeditationTab): string {
    return meditationTabCopy[locale.current === 'en' ? 'en' : 'vi'][tab];
  }

  function handleTabKey(event: KeyboardEvent, index: number): void {
    if (event.key === 'Tab' && event.shiftKey) {
      event.preventDefault();
      event.stopPropagation();
      (startButton && !startButton.disabled ? startButton : cancelButton)?.focus();
      return;
    }
    let next: number;
    if (event.key === 'ArrowRight') next = (index + 1) % tabKeys.length;
    else if (event.key === 'ArrowLeft') next = (index + tabKeys.length - 1) % tabKeys.length;
    else if (event.key === 'Home') next = 0;
    else if (event.key === 'End') next = tabKeys.length - 1;
    else return;
    event.preventDefault();
    activeTab = tabKeys[next];
    tabButtons[next]?.focus();
  }

  let downloadedTracks = $state<Record<string, boolean>>({});
  let downloadingTracks = $state<Record<string, number>>({});

  function formatMb(bytes?: number): string {
    if (!bytes) return '0.0';
    return (bytes / (1024 * 1024)).toFixed(1);
  }

  async function checkAudioStatus(path: string): Promise<void> {
    if (isNativeApp() && path.startsWith('/assets/audio/ambient/')) return;
    const downloaded = await isAudioDownloaded(path);
    downloadedTracks[path] = downloaded;
  }

  async function handleDownloadAudio(e: MouseEvent, path: string): Promise<void> {
    e.stopPropagation();
    if (downloadingTracks[path] !== undefined) return;
    downloadingTracks[path] = 10;
    try {
      await downloadAudioTrack(path, (p) => {
        downloadingTracks[path] = p;
      });
      downloadedTracks[path] = true;
    } catch {
      // ignore
    } finally {
      delete downloadingTracks[path];
      downloadingTracks = { ...downloadingTracks };
    }
  }

  async function handleDeleteAudio(e: MouseEvent, path: string): Promise<void> {
    e.stopPropagation();
    try {
      await deleteAudioTrack(path);
      downloadedTracks[path] = false;
      downloadedTracks = { ...downloadedTracks };
    } catch {}
  }

  function ambientLabel(type: AmbientSoundType): string {
    return type === 'none' ? localizeUi('Không phát') : getAmbientSoundLabel(type, locale.current === 'en');
  }

  $effect(() => {
    if (!open) {
      activeTab = 'time';
      return;
    }
    selectedBackground = initialBackgroundArtwork && DAILY_CALENDAR_ARTWORKS.includes(initialBackgroundArtwork) ? initialBackgroundArtwork : null;
    durationMinutes = initial.durationMinutes;
    customDuration = initial.durationMinutes;
    customSelected = !MEDITATION_DURATION_PRESETS_MINUTES.includes(initial.durationMinutes as never);
    fullscreenVisual = initial.fullscreenVisual;
    motionEnabled = initial.motionEnabled;
    musicTrack = initial.musicTrack;
    ambientSound = initial.ambientSound || 'none';
    woodenFishEnabled = initial.woodenFishEnabled;
    woodenFishPreset = initial.woodenFishPreset;
    woodenFishBpm = resolveWoodenFishBpm(initial.woodenFishPreset, initial.woodenFishBpm);
    for (const opt of options) {
      void checkAudioStatus(opt.track);
    }
    for (const opt of AMBIENT_SOUND_OPTIONS) {
      const track = AMBIENT_SOUND_TRACKS[opt.id];
      if (track) void checkAudioStatus(track);
    }
  });

  const activeDuration = $derived(customSelected ? customDuration : durationMinutes);
  const tempoRange = $derived(WOODEN_FISH_TEMPO_PRESETS[woodenFishPreset]);

  function selectPreset(preset: WoodenFishTempoPreset): void {
    woodenFishPreset = preset;
    woodenFishBpm = resolveWoodenFishBpm(preset);
  }

  function submit(): void {
    if (!Number.isFinite(activeDuration) || activeDuration < 1 || activeDuration > 1_440) return;
    onStart({
      durationMinutes: Math.round(activeDuration),
      fullscreenVisual,
      motionEnabled,
      musicTrack,
      ambientSound,
      woodenFishBpm: resolveWoodenFishBpm(woodenFishPreset, woodenFishBpm),
      woodenFishEnabled,
      woodenFishPreset,
    }, selectedBackground && DAILY_CALENDAR_ARTWORKS.includes(selectedBackground) && !failedBackgrounds.includes(selectedBackground) ? selectedBackground : null);
  }
</script>

{#if open}
  <dialog use:modalDialog class="meditation-chooser" aria-labelledby="meditation-chooser-title" onclick={(event) => event.currentTarget === event.target && onCancel()} oncancel={(event) => { event.preventDefault(); onCancel(); }}>
    <div class="meditation-chooser__dialog" tabindex="-1" data-modal-focus data-dialog-glass>
      <header><span aria-hidden="true">🪷</span><div><h2 id="meditation-chooser-title">{localizeUi('Thiền có hướng dẫn')}</h2><p>{locale.t.practice.meditationSubtitle}</p></div></header>
      <div class="meditation-chooser__tabs" role="tablist" aria-label={localizeUi('Thiết lập thiền')}>
        {#each tabKeys as tab, index (tab)}
          <button bind:this={tabButtons[index]} id={`${chooserId}-${tab}-tab`} type="button" role="tab" aria-selected={activeTab === tab} aria-controls={`${chooserId}-${tab}-panel`} tabindex={activeTab === tab ? 0 : -1} onclick={() => activeTab = tab} onkeydown={(event) => handleTabKey(event, index)}>{tabLabel(tab)}</button>
        {/each}
      </div>
      <div class="meditation-chooser__panels">
        {#each tabKeys as tab (tab)}
          <div id={`${chooserId}-${tab}-panel`} role="tabpanel" aria-labelledby={`${chooserId}-${tab}-tab`} hidden={activeTab !== tab} tabindex="0">
            {#if tab === 'time'}
      <fieldset>
        <legend>{localizeUi("Thời lượng")}</legend>
        <div class="meditation-sound-picker__grid meditation-chooser__duration-grid">
          {#each MEDITATION_DURATION_PRESETS_MINUTES as minutes}

            <button type="button" class="meditation-sound-picker__tile" class:selected={!customSelected && durationMinutes === minutes}
 aria-pressed={!customSelected && durationMinutes === minutes}
 onclick={() => { durationMinutes = minutes; customSelected = false; }
}
><span class="meditation-sound-picker__icon" aria-hidden="true"><Clock3 size={32} /></span>
 <span>{minutes} {localizeUi("phút")}</span>
 {#if !customSelected && durationMinutes === minutes}<span class="meditation-sound-picker__selected" aria-hidden="true">✓</span>{/if}
 </button>
          {/each}

          <button type="button" class="meditation-sound-picker__tile" class:selected={customSelected}
 aria-pressed={customSelected}
 onclick={() => customSelected = true}
><span class="meditation-sound-picker__icon" aria-hidden="true"><Clock3 size={32} /></span>
 <span>{localizeUi("Tùy chọn")}</span>
 {#if customSelected}<span class="meditation-sound-picker__selected" aria-hidden="true">✓</span>{/if}
 </button>
        </div>
        {#if customSelected}

          <label class="meditation-chooser__custom">{localizeUi("Số phút")}
            <input type="number" min="1" max="1440" bind:value={customDuration}
 aria-describedby="custom-duration-hint" />
          </label>
          <small id="custom-duration-hint">{localizeUi("Từ 1 đến 1.440 phút.")}</small>
        {/if}

      </fieldset>
<fieldset><legend>{localizeUi("Tùy chọn")}</legend>
        <label class="meditation-chooser__check"><input type="checkbox" bind:checked={fullscreenVisual}
 /> <span>{localizeUi("Hiện hoa sen và nhịp thở toàn màn hình")}</span></label>
        <label class="meditation-chooser__check"><input type="checkbox" bind:checked={motionEnabled}
 aria-describedby="meditation-motion-hint" /> <span>{localizeUi("Dùng cảm biến chuyển động (tùy chọn)")}</span></label>
        <small id="meditation-motion-hint">{localizeUi("Có thể cần cấp quyền khi bắt đầu. Chỉ lưu số mẫu tổng hợp để hỗ trợ, không lưu dữ liệu chuyển động thô và không ảnh hưởng việc ghi nhận thời thiền.")}</small>
</fieldset>
            {:else if tab === 'music'}
              <p class="meditation-chooser__panel-note">{localizeUi('Âm thanh nền (không bắt buộc)')}</p>
              <div class="meditation-sound-picker__grid">
            <button class="meditation-sound-picker__tile" class:selected={musicTrack === null} type="button" aria-pressed={musicTrack === null} onclick={() => musicTrack = null}>
              <span class="meditation-sound-picker__icon" aria-hidden="true">{AMBIENT_SOUND_OPTIONS[0].icon}</span>
              <span>{localizeUi('Không phát nhạc')}</span>
              {#if musicTrack === null}<span class="meditation-sound-picker__selected" aria-hidden="true">✓</span>{/if}
            </button>
            {#each options as option (option.track)}
              {@const meta = getAudioTrackMeta(option.track)}
              {@const isDownloaded = downloadedTracks[option.track]}
              {@const progress = downloadingTracks[option.track]}
              <div class="meditation-sound-picker__tile meditation-audio-tile" class:selected={musicTrack === option.track}>
                <button class="meditation-audio-tile__select" type="button" aria-label={localizeUi(option.label)} aria-pressed={musicTrack === option.track} onclick={() => musicTrack = option.track}></button>
                <span class="meditation-sound-picker__icon meditation-choice-art" aria-hidden="true"><img src="/images/quote-cards/lotus-dawn.webp" alt="" loading="lazy" decoding="async" /><span>{locale.t.practice.musicSelectLabel.split(' ')[0]}</span></span>
                <span class="meditation-tile-info">
                  <span class="meditation-tile-title">{localizeUi(option.label)}</span>
                  <span class="meditation-tile-status">
                    {#if meta?.isDefault}
                      <span class="audio-badge-default">{localeStore.current === 'en' ? 'Built-in' : 'Có sẵn trong máy'}</span>
                    {:else if progress !== undefined}
                      <span class="audio-badge-busy">⏳ {progress}%</span>
                    {:else if isDownloaded}
                      <span class="audio-badge-saved">✓ {localeStore.current === 'en' ? 'Downloaded' : 'Đã tải'}</span>
                      <button
                        type="button"
                        class="audio-btn-delete"
                        title={localeStore.current === 'en' ? 'Delete to free space' : 'Xóa khỏi máy'}
                        onclick={(e) => void handleDeleteAudio(e, option.track)}
                      >
                        🗑️
                      </button>
                    {:else}
                      <button
                        type="button"
                        class="audio-btn-download"
                        onclick={(e) => void handleDownloadAudio(e, option.track)}
                      >
                        ⬇ {localeStore.current === 'en' ? 'Download' : 'Tải'} ({formatMb(meta?.bytes)} MB)
                      </button>
                    {/if}
                  </span>
                </span>
                {#if musicTrack === option.track}<span class="meditation-sound-picker__selected" aria-hidden="true">✓</span>{/if}
              </div>
            {/each}
              </div>
            {:else if tab === 'ambient'}
              <p class="meditation-chooser__panel-note">{localizeUi('Âm thanh nền (không bắt buộc)')} · {localizeUi('Âm thanh phụ trợ tự nhiên')}</p>
              <div class="meditation-sound-picker__grid">

            {#each AMBIENT_SOUND_OPTIONS as option (option.id)}
              {@const track = AMBIENT_SOUND_TRACKS[option.id]}
              {@const meta = track ? getAudioTrackMeta(track) : undefined}
              {@const isDownloaded = track ? downloadedTracks[track] : true}
              {@const progress = track ? downloadingTracks[track] : undefined}
              <div class="meditation-sound-picker__tile meditation-audio-tile" class:selected={ambientSound === option.id}>
                <button class="meditation-audio-tile__select" type="button" aria-label={ambientLabel(option.id)} aria-pressed={ambientSound === option.id} onclick={() => ambientSound = option.id}></button>
                <span class="meditation-sound-picker__icon meditation-choice-art" aria-hidden="true">{#if option.id !== 'none'}<img src={`/images/quote-cards/${option.id === 'bowl' ? 'lotus-moon' : option.id === 'stream' ? 'lotus-pink' : 'sky-clouds'}.webp`} alt="" loading="lazy" decoding="async" />{/if}<span>{option.icon}</span></span>
                <span class="meditation-tile-info">
                  <span class="meditation-tile-title">{option.id === 'none' ? ambientLabel(option.id) : ambientLabel(option.id).slice(option.icon.length).trim()}</span>
                  <span class="meditation-tile-status">
                    {#if option.id === 'none' || option.id === 'bowl' || (isNativeApp() && Boolean(track))}
                      <span class="audio-badge-default">{localeStore.current === 'en' ? 'Built-in' : 'Có sẵn'}</span>
                    {:else if progress !== undefined}
                      <span class="audio-badge-busy">⏳ {progress}%</span>
                    {:else if isDownloaded}
                      <span class="audio-badge-saved">✓ {localeStore.current === 'en' ? 'Downloaded' : 'Đã tải'}</span>
                      {#if track}
                        <button
                          type="button"
                          class="audio-btn-delete"
                          title={localeStore.current === 'en' ? 'Delete to free space' : 'Xóa khỏi máy'}
                          onclick={(e) => void handleDeleteAudio(e, track)}
                        >
                          🗑️
                        </button>
                      {/if}
                    {:else if track}
                      <button
                        type="button"
                        class="audio-btn-download"
                        onclick={(e) => void handleDownloadAudio(e, track)}
                      >
                        ⬇ {localeStore.current === 'en' ? 'Download' : 'Tải'} ({formatMb(meta?.bytes)} MB)
                      </button>
                    {/if}
                  </span>
                </span>
                {#if ambientSound === option.id}<span class="meditation-sound-picker__selected" aria-hidden="true">✓</span>{/if}
              </div>
            {/each}
              </div>
<fieldset><legend>{localizeUi('Nhịp mõ')}</legend>
        <label class="meditation-chooser__check"><input type="checkbox" bind:checked={woodenFishEnabled}
          /> <span>{localizeUi("Bật nhịp mõ đều")}</span></label>
        {#if woodenFishEnabled}

          <div class="meditation-chooser__tempo" role="group" aria-label={localizeUi("Nhịp mõ")}>
            {#each Object.keys(WOODEN_FISH_TEMPO_PRESETS) as preset}

              {@const key = preset as WoodenFishTempoPreset}

              <button type="button" class:active={woodenFishPreset === key}
 aria-pressed={woodenFishPreset === key}
 onclick={() => selectPreset(key)}
>
                {key === 'slow' ? localizeUi("Chậm 40–50") : key === 'medium' ? localizeUi("Vừa 60–70") : localizeUi("Nhanh 90–108")}
 BPM
              </button>
            {/each}

          </div>
          <label class="meditation-chooser__range">{localizeUi("Nhịp chính xác:")} <strong>{woodenFishBpm}
 BPM</strong>
            <input type="range" min={tempoRange.minimumBpm}
 max={tempoRange.maximumBpm}
 step="1" bind:value={woodenFishBpm}
 />
          </label>
        {/if}

</fieldset>
            {:else if tab === 'background'}
              <div class="meditation-sound-picker__grid meditation-chooser__backgrounds">
                <button class="meditation-sound-picker__tile" class:selected={selectedBackground === null} type="button" aria-pressed={selectedBackground === null} onclick={() => selectedBackground = null}>
                  <span class="meditation-chooser__default-background" aria-hidden="true"></span>
                  <span>{locale.t.practice.meditationBackgroundDefault}</span>
                  {#if selectedBackground === null}<span class="meditation-sound-picker__selected" aria-hidden="true">✓</span>{/if}
                </button>
                {#if activeTab === 'background'}
                  {#each backgroundChoices as { artwork, labelIndex } (artwork)}
                    <button class="meditation-sound-picker__tile" class:selected={selectedBackground === artwork} type="button" aria-pressed={selectedBackground === artwork} onclick={() => selectedBackground = failedBackgrounds.includes(artwork) ? null : artwork}>
                      {#if failedBackgrounds.includes(artwork)}<span class="meditation-chooser__default-background" aria-hidden="true"></span>
                      {:else}<img src={artwork} alt="" loading="lazy" decoding="async" onerror={() => { failedBackgrounds = [...failedBackgrounds, artwork]; if (selectedBackground === artwork) selectedBackground = null; }} />{/if}
                      <span>{locale.t.practice.meditationBackgroundArtworkNames[labelIndex]}</span>
                      {#if selectedBackground === artwork}<span class="meditation-sound-picker__selected" aria-hidden="true">✓</span>{/if}
                    </button>
                  {/each}
                {/if}
              </div>
            {/if}
          </div>
        {/each}
      </div>
      <div class="meditation-chooser__actions dialog-actions-balanced">
        <button bind:this={cancelButton} type="button" onclick={onCancel}>{localizeUi('Hủy')}</button>
        <button bind:this={startButton} type="button" class="primary" disabled={activeDuration < 1 || activeDuration > 1440} onclick={submit} onkeydown={(event) => {
          if (event.key === 'Tab' && !event.shiftKey) {
            event.preventDefault();
            event.stopPropagation();
            tabButtons[tabKeys.indexOf(activeTab)]?.focus();
          }
        }}>{localizeUi('Bắt đầu thiền')}</button>
      </div>
    </div>
  </dialog>
{/if}
<style>
  .meditation-chooser:not([open]){display:none}
.meditation-chooser{box-sizing:border-box;width:100%;height:100dvh;max-width:none;max-height:none;margin:0;border:0;position:fixed;z-index:10000;inset:0;display:grid;overflow-y:auto;place-items:center;padding:20px;background:rgba(20,16,28,.7);backdrop-filter:blur(8px);animation:chooser-fade .18s ease-out}
.meditation-chooser__dialog{box-sizing:border-box;width:min(620px,100%);max-height:calc(100dvh - 40px);overflow-y:auto;padding:24px;border:1px solid var(--border);border-radius:24px;background:var(--white);box-shadow:0 24px 70px rgba(32,22,12,.28);color:var(--text);animation:chooser-rise .22s cubic-bezier(.2,.8,.2,1)}
header{display:flex;align-items:center;gap:13px;margin-bottom:18px}
header>span{font-size:38px}
h2{margin:0;font-size:var(--font-size-section-title)}
header p{margin:3px 0 0;color:var(--muted);font-size:var(--font-size-meta);line-height:1.45}
fieldset{min-width:0;margin:0 0 14px;padding:14px;border:1px solid var(--border2);border-radius:16px}
legend{padding:0 6px;color:var(--text2);font-size:var(--font-size-label);font-weight:800}
.meditation-chooser__tempo{display:flex;flex-wrap:wrap;gap:7px}
.meditation-chooser__tempo button{min-height:38px;padding:0 12px;border:1px solid var(--border);border-radius:999px;background:var(--bg2);color:var(--text2);cursor:pointer;font-family:inherit;font-size:var(--font-size-label);font-weight:700;line-height:1}
.meditation-chooser__tempo button.active{border-color:#725ca9;background:#725ca9;color:#fff}
.meditation-chooser input[type='number']{box-sizing:border-box;width:100%;min-height:42px;padding:0 12px;border:1px solid var(--border);border-radius:11px;background:var(--bg2);color:var(--text);font:inherit}
.meditation-chooser__custom{display:grid;margin-top:10px;grid-template-columns:90px 1fr;align-items:center;color:var(--muted);font-size:var(--font-size-label)}
.meditation-chooser fieldset>small{display:block;margin-top:4px;color:var(--muted);font-size:var(--font-size-meta)}
.meditation-chooser__check{display:flex;align-items:center;gap:8px;margin-top:12px;color:var(--text2);font-size:var(--font-size-label)}
.meditation-chooser__check input{width:18px;height:18px;accent-color:#725ca9}
.meditation-chooser__tempo{margin-top:10px}
.meditation-chooser__range{display:block;margin-top:11px;color:var(--muted);font-size:var(--font-size-label)}
.meditation-chooser__range input{display:block;width:100%;margin-top:8px;accent-color:#725ca9}
.meditation-chooser__actions{display:flex;justify-content:flex-end;gap:9px}
.meditation-chooser__actions button{min-height:44px;padding:0 18px;border:1px solid var(--border);border-radius:999px;background:var(--bg2);color:var(--text2);cursor:pointer;font-family:inherit;font-size:var(--font-size-label);font-weight:700;line-height:1}
.meditation-chooser__actions .primary{border-color:#725ca9;background:#725ca9;color:#fff}
.meditation-chooser__actions button:disabled{cursor:not-allowed;opacity:.45}
button:focus-visible,input:focus-visible{outline:3px solid color-mix(in srgb,#725ca9 42%,transparent);outline-offset:2px}
@keyframes chooser-fade{from{opacity:0}
}
@keyframes chooser-rise{from{opacity:0;transform:translateY(10px) scale(.98)}
}
@media(max-width:520px){.meditation-chooser{padding:8px}
.meditation-chooser__dialog{max-height:calc(100dvh - 16px);padding:18px 14px}
.meditation-chooser__actions{display:grid;grid-template-columns:1fr 1fr}
.meditation-chooser__actions button{padding:0 10px}
}
@media(prefers-reduced-motion:reduce){.meditation-chooser,.meditation-chooser__dialog{animation:none}
}


.meditation-chooser{padding:max(20px,var(--app-safe-top,env(safe-area-inset-top,0px))) 20px max(20px,env(safe-area-inset-bottom,0px))}
.meditation-chooser__dialog{max-height:calc(100dvh - max(20px,var(--app-safe-top,env(safe-area-inset-top,0px))) - max(20px,env(safe-area-inset-bottom,0px)))}.meditation-chooser{padding:max(8px,var(--app-safe-top,env(safe-area-inset-top,0px))) 8px max(8px,env(safe-area-inset-bottom,0px))}
.meditation-chooser__dialog{max-height:calc(100dvh - max(8px,var(--app-safe-top,env(safe-area-inset-top,0px))) - max(8px,env(safe-area-inset-bottom,0px)))}
  button{min-height:44px}
  input:not([type="checkbox"]):not([type="radio"]):not([type="range"]){min-height:44px}
  .meditation-chooser__check{min-height:44px}
  .meditation-sound-picker__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));grid-auto-rows:max-content;align-content:start;gap:var(--radius-sm);overflow-y:auto;overscroll-behavior:contain;padding:var(--radius-sm)}
  .meditation-sound-picker__tile{position:relative;display:flex;min-width:0;min-height:44px;align-items:center;flex-direction:column;gap:var(--radius-sm);padding:var(--radius-control) var(--radius-sm);border:2px solid var(--border);border-radius:var(--radius-control);background:var(--bg2);color:inherit;cursor:pointer;font:inherit;font-size:var(--font-size-label);line-height:1.5;text-align:center;overflow-wrap:anywhere}
  .meditation-sound-picker__tile.selected{border-color:var(--gold)}
  .meditation-sound-picker__icon{display:grid;min-height:44px;place-items:center;font-size:2rem}
  .meditation-sound-picker__selected{position:absolute;top:var(--radius-sm);right:var(--radius-sm);padding:0 var(--radius-sm);border-radius:var(--radius-sm);background:var(--gold);color:var(--on-gold);font-weight:700}
  .meditation-chooser{overflow:hidden}
  .meditation-chooser__dialog{display:grid;grid-template-rows:auto auto minmax(0,1fr) auto;height:min(760px,100%);min-height:0;overflow:hidden;background:var(--dialog-surface-background,var(--card));color:var(--text);border-color:var(--dialog-surface-border,var(--border));box-shadow:var(--dialog-surface-shadow,var(--shadow-xl))}
  .meditation-chooser .meditation-chooser__dialog > header{padding:0;border-radius:0;background:transparent}
  .meditation-chooser .meditation-chooser__dialog > header h2,.meditation-chooser .meditation-chooser__dialog > header p{color:inherit}
  header p,legend,.meditation-chooser fieldset>small,.meditation-chooser__custom,.meditation-chooser__check,.meditation-chooser__range{color:inherit}
  fieldset{border-color:var(--border2)}
  .meditation-chooser__tabs{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:var(--radius-sm);padding-bottom:var(--radius-control)}
  .meditation-chooser__tabs button{min-width:0;min-height:44px;padding:var(--radius-sm);border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:inherit;font:inherit;font-size:var(--font-size-meta);line-height:1.5;white-space:normal;overflow-wrap:break-word}
  .meditation-chooser__tabs button[aria-selected='true']{border-bottom-color:var(--gold);color:var(--gold);font-weight:700}
  .meditation-chooser__panels{min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:var(--radius-sm)}
  .meditation-chooser__panels .meditation-sound-picker__grid{overflow:visible;overscroll-behavior:auto}
  .meditation-chooser__panel-note{margin:0 0 var(--radius-control);font-size:.75rem;line-height:1.5}
  [role='tabpanel'][hidden]{display:none}
  .meditation-chooser__tempo button,.meditation-chooser input[type='number'],.meditation-chooser__actions button{border-color:var(--border);background:var(--bg2);color:inherit}
  .meditation-chooser__tempo button.active,.meditation-chooser__actions .primary{border-color:var(--gold);background:var(--gold);color:var(--on-gold)}
  .meditation-chooser__tempo button{min-height:44px}
  .meditation-chooser__actions{padding-top:var(--radius-control)}
  .meditation-chooser__backgrounds{grid-template-columns:repeat(3,minmax(0,1fr))}
  .meditation-chooser__backgrounds .meditation-sound-picker__tile{padding:var(--radius-sm)}
  .meditation-chooser__backgrounds img,.meditation-chooser__default-background{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;border-radius:var(--radius-sm)}
  .meditation-chooser__default-background{background:radial-gradient(circle at 50% 35%,#44365f 0%,#241d35 46%,#171320 100%)}
  button:focus-visible,input:focus-visible,[role='tabpanel']:focus-visible{outline:3px solid var(--gold);outline-offset:2px}
  .meditation-choice-art { position:relative; isolation:isolate; display:grid; place-items:center; width:44px; height:44px; flex-shrink:0; overflow:hidden; border-radius:var(--radius-sm); background:var(--practice-meditation-tint); }
  .meditation-choice-art img { position:absolute; inset:0; width:100%; height:100%; object-fit:cover; z-index:-1; }
  .meditation-choice-art span { text-shadow:0 1px 2px var(--card); }
  .meditation-sound-picker__tile:has(.meditation-choice-art) { flex-direction:row; text-align:left; padding-right:calc(var(--space-page)*1.2); }
  .meditation-tile-info { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; flex: 1; min-width: 0; }
  .meditation-tile-title { font-size: 13px; font-weight: 600; color: var(--text); }
  .meditation-tile-status { display: flex; align-items: center; gap: 6px; flex-wrap: wrap; }
  .meditation-audio-tile > span { pointer-events: none; }
  .meditation-audio-tile__select { position: absolute; inset: 0; width: 100%; border: 0; border-radius: inherit; background: transparent; cursor: pointer; }
  .meditation-tile-status button { position: relative; pointer-events: auto; min-width: 44px; min-height: 44px; }
  .audio-badge-default { font-size: 11px; color: var(--muted); }
  .audio-badge-saved { font-size: 11px; color: #059669; font-weight: 600; }
  .audio-badge-busy { font-size: 11px; color: var(--gold); font-weight: 700; }
  .audio-btn-download { padding: 3px 8px; border-radius: 8px; border: 1px solid var(--gold); background: var(--gold-light); color: var(--brown); font-size: 11px; font-weight: 700; cursor: pointer; min-height: 28px; display: inline-flex; align-items: center; gap: 4px; transition: 0.15s; }
  .audio-btn-download:hover { background: var(--gold); color: #fff; }
  .audio-btn-delete { padding: 2px 6px; border-radius: 6px; border: 1px solid var(--border); background: transparent; cursor: pointer; font-size: 11px; min-height: 26px; display: inline-flex; align-items: center; transition: 0.15s; }
  .audio-btn-delete:hover { background: #fee2e2; border-color: #ef4444; }
</style>
