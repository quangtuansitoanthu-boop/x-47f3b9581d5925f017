<script lang="ts">
  import type { Snippet } from 'svelte';
  import { RotateCcw } from '@lucide/svelte';
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  import { catalogOptionsLabel, rosaryValidationCopy, rosaryPickerCopy } from '$lib/i18n/ui-copy';
  import RosarySelect from './RosarySelect.svelte';
  import { rosaryAutoCopy } from '$lib/i18n/rosary-auto-copy';
  import { ROSARY_TARGET_COUNTS } from '$lib/domain/practice/rosary-rhythm';
  const localizeUi = createInterfaceTranslator();
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { createRosaryBeadController } from '$lib/browser/rosary-bead-controller';
  import { createRosaryWater } from '$lib/browser/rosary-water';
  import { uiMotion } from '$lib/browser/ui-motion';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import {
    ROSARY_DAILY_GOALS,
    ROSARY_PHRASES,
    ROSARY_SIZES,
    displayRosaryPhrase,
    resolveRosarySelection,
    type RosaryDailyGoal,
    type RosaryPhrase,
    type RosarySize,
    type CustomRosaryPhraseItem,
  } from '$lib/domain/practice/guided-sessions';

  interface Props {
    routineControls?: Snippet;
    count: number;
    customPhrases?: CustomRosaryPhraseItem[];
    customText?: string;
    customType?: 'Niệm danh hiệu' | 'Trì chú';
    onAddCustomPhrase?: (item: { text: string; type: 'Niệm danh hiệu' | 'Trì chú' }) => void;
    onDeleteCustomPhrase?: (id: string) => void;
    onCustomTextChange?: (value: string) => void;
    onCustomTypeChange?: (value: 'Niệm danh hiệu' | 'Trì chú') => void;
    dailyGoal: RosaryDailyGoal;
    direction: 'up' | 'down';
    open: boolean;
    phrase: RosaryPhrase;
    progress: number;
    sessionCount: number;
    size: RosarySize;
    soundEnabled: boolean;
    onDailyGoalChange: (value: RosaryDailyGoal) => void;
    onDirectionChange: (value: 'up' | 'down') => void;
    onDelta: (delta: number) => boolean | void;
    onExitRequest: () => void;
    onBack?: () => void;
    onPhraseChange: (value: RosaryPhrase) => void | boolean;
    onResetRequest: () => void;
    onSizeChange: (value: RosarySize) => void;
    onSoundToggle: (value: boolean) => void;
    autoState?: { count: number; target: number; playing: boolean; completed: boolean; error: string; intervalMs?: number };
    autoBusy?: boolean;
    routinePaused?: boolean;
    onAutoStart?: (options: { intervalMs: number; target: number }) => void;
    onAutoPause?: () => void;
    onAutoResume?: (intervalMs: number) => void;
    onAutoStop?: () => void;
  }

  let {
    routineControls,
    count,
    customPhrases = [],
    customText = '',
    customType = 'Niệm danh hiệu',
    onAddCustomPhrase,
    onDeleteCustomPhrase,
    onCustomTextChange,
    onCustomTypeChange,
    dailyGoal,
    direction,
    open,
    phrase,
    progress,
    sessionCount,
    size,
    soundEnabled,
    onDailyGoalChange,
    onDirectionChange,
    onDelta,
    onExitRequest,
    onBack = onExitRequest,
    onPhraseChange,
    onResetRequest,
    onSizeChange,
    onSoundToggle,
    autoState,
    autoBusy = false,
    routinePaused = false,
    onAutoStart,
    onAutoPause,
    onAutoResume,
    onAutoStop,
  }: Props = $props();

  const localeStore = getLocaleContext();
  const validationCopy = $derived(rosaryValidationCopy[localeStore.current === 'en' ? 'en' : 'vi']);
  const pickerCopy = $derived(rosaryPickerCopy[localeStore.current === 'en' ? 'en' : 'vi']);
  const autoCopy = $derived(rosaryAutoCopy[localeStore.current === 'en' ? 'en' : 'vi']);
  const canCount = $derived(Boolean(resolveRosarySelection(phrase, customPhrases)));
  let automaticMode = $state(false);
  let autoInterval = $state(1000);
  let autoTarget = $state(108);
  const autoInProgress = $derived(autoBusy || Boolean(autoState && autoState.target > 0 && !autoState.completed));
  const observedAutoInterval = $derived(autoState?.intervalMs);
  $effect(() => { if (observedAutoInterval) autoInterval = observedAutoInterval; });
  const showAutomatic = $derived(automaticMode || autoInProgress);
  const manualCounting = $derived(canCount && !showAutomatic && !routinePaused);
  const autoStatus = $derived(autoBusy ? autoCopy.preparing : autoState?.error
    ? autoState.error === 'rosary_session_too_long' ? autoCopy.tooLong
      : autoState.error.startsWith('qa:') ? `${autoCopy.failed} (${autoState.error.slice(3)})` : autoCopy.failed
    : autoState?.completed ? autoCopy.complete : autoState?.playing ? autoCopy.playing
    : autoInProgress ? autoCopy.paused : autoCopy.ready);
  const phraseOptions = $derived([
    ...ROSARY_PHRASES.filter(option => option !== 'Tùy chọn').map(option => ({
      value: option, label: displayRosaryPhrase(option, localeStore.current).split(' — ')[0],
      group: localizeUi('Danh hiệu truyền thống'),
    })),
    ...customPhrases.map(item => ({ value: `custom:${item.id}`, label: `[${displayRosaryPhrase('Tùy chọn', localeStore.current)}] ${item.text}`, group: localizeUi('Danh hiệu của bạn') })),
  ]);

  let optionsOpen = $state(false);
  let swipeArea = $state<HTMLElement | null>(null);
  let beadOffset = $state(0);
  let beadAnimated = $state(false);
  let beadController = $state<ReturnType<typeof createRosaryBeadController> | null>(null);
  let waterCanvas = $state<HTMLCanvasElement | null>(null);
  let water = $state<ReturnType<typeof createRosaryWater> | null>(null);

  $effect(() => {
    if (!open || !swipeArea || !waterCanvas) return;
    const renderer = createRosaryWater(swipeArea, waterCanvas, { maxFrameRate: 30 });
    water = renderer;
    return () => { renderer.destroy(); water = null; };
  });
  $effect(() => { water?.setEnabled($uiMotion.effective); });

  $effect(() => {
    if (!open || !swipeArea) return;
    const controller = createRosaryBeadController(swipeArea, {
      getDirection: () => direction,
      canStartPointer: (event) => {
        if (!manualCounting) return false;
        const bounds = swipeArea!.getBoundingClientRect();
        return Math.abs(event.clientX - (bounds.left + bounds.width / 2)) <= 70;
      },
      onDelta: (delta) => {
        const accepted = manualCounting ? onDelta(delta) : false;
        if (accepted !== false) water?.pulse();
        return accepted;
      },
      onRender(offset, animated) {
        beadOffset = offset;
        beadAnimated = animated;
        water?.invalidate();
      },
    });
    beadController = controller;
    return () => {
      controller.destroy();
      beadController = null;
    };
  });

  // The playback owner owns the count. Animate only its accepted updates here.
  $effect(() => {
    const acceptedCount = autoState?.count ?? 0;
    if (open && showAutomatic && acceptedCount > 0) {
      water?.pulse();
      water?.invalidate();
    }
  });

  // Số hạt trong ngày đã được lưu; phiên bằng chứng mới không làm mất chuỗi đang lần dở.
  const cycleCount = $derived(Math.floor(count / size));
  const cyclePosition = $derived(count % size);
  const progressOffset = $derived(289 - 289 * Math.max(0, Math.min(1, progress)));

  const BEAD_STEP = 96;

  function beadStyle(index: number): string {
    const automaticPosition = ((index - (autoState?.count ?? 0) % 7 + 10) % 7) - 3;
    const y = (showAutomatic ? automaticPosition : index) * BEAD_STEP + (showAutomatic ? 0 : beadOffset);
    const distance = Math.abs(y);
    const scale = Math.max(0.68, 1 - Math.pow(distance / 420, 1.15));
    const opacity = Math.max(0, 1 - Math.max(0, distance - 110) / 160);
    const rotateDeg = (y / BEAD_STEP) * 16;
    const zIndex = Math.round(100 - distance);
    return `transform:translateY(${y}px) scale(${scale}) rotate(${rotateDeg}deg);opacity:${opacity};z-index:${zIndex};`;
  }
</script>

{#if open}
  <dialog class="tt-rosary-modal" use:modalDialog aria-label={localizeUi("Lần tràng hạt")} oncancel={(event) => { event.preventDefault(); onBack(); }}>
  <section class="tt-rosary" class:compact={!optionsOpen} aria-label={localizeUi("Chế độ lần chuỗi")}>
    <header class="tt-rosary__header">
      <div class="tt-rosary__header-left">
        <button class="tt-rosary__back tt-rosary__back-btn" type="button" aria-label={localizeUi("Quay lại tu tập")} onclick={onBack}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" aria-hidden="true"><path d="m15 19-7-7 7-7" stroke-linecap="round" stroke-linejoin="round" /></svg>
        </button>
        <span class="tt-rosary__header-icon" aria-hidden="true">📿</span>
        <div class="tt-rosary__title-box"><span class="tt-rosary__title">{localizeUi("Chuỗi hạt niệm Phật")}</span><span class="tt-rosary__bead-desc">{localizeUi("Hạt Kim Cang Bồ Đề")}</span></div>
      </div>
      <div class="tt-rosary__header-actions">
        <button class="tt-rosary__reset" type="button" disabled={autoInProgress} onclick={onResetRequest} title={localizeUi("Đặt lại")}><RotateCcw class="tt-rosary__reset-icon" size={20} aria-hidden="true" /><span class="tt-rosary__reset-label">{localizeUi("🔄 Đặt lại")}</span></button>
        <button type="button" onclick={onExitRequest}>{localizeUi("Kết thúc phiên")}</button>
      </div>
    </header>
    {@render routineControls?.()}

    <div class="tt-rosary__body">
    <div class="tt-rosary__options-bar">
      <p>{localizeUi("Chuỗi")} {size} {localizeUi("hạt")} · {localizeUi("Mục tiêu")} {dailyGoal.toLocaleString(localizeUi.locale())}</p>
      <button type="button" aria-expanded={optionsOpen} aria-controls="tt-rosary-options" onclick={() => optionsOpen = !optionsOpen}>{optionsOpen ? localizeUi("Thu gọn") : localeStore.current === 'en' ? catalogOptionsLabel.en : catalogOptionsLabel.vi}</button>
    </div>
    <div id="tt-rosary-options" class="tt-rosary__options" hidden={!optionsOpen}>
    <div inert={autoInProgress}>
    <div class="tt-rosary__settings">
      <RosarySelect label={localizeUi('Chuỗi')} accessibleLabel={localizeUi('Số hạt trong chuỗi')}
        value={String(size)} options={ROSARY_SIZES.map(option => ({ value: String(option), label: `${option} ${localizeUi('hạt')}` }))}
        onChange={value => onSizeChange(Number(value) as RosarySize)} />
      <RosarySelect label={localizeUi('Mục tiêu')} accessibleLabel={localizeUi('Mục tiêu niệm')}
        value={String(dailyGoal)} options={ROSARY_DAILY_GOALS.map(option => ({ value: String(option), label: option.toLocaleString(localizeUi.locale()) }))}
        onChange={value => onDailyGoalChange(Number(value) as RosaryDailyGoal)} />
      <RosarySelect label={localizeUi('Danh hiệu')} accessibleLabel={localizeUi('Danh hiệu trì niệm')}
        value={phrase} options={phraseOptions} recitation bold addLabel={pickerCopy.add}
        onChange={value => onPhraseChange(value as RosaryPhrase)} onAdd={() => onPhraseChange('Tùy chọn')} />
    </div>
    {#if phrase === 'Tùy chọn'}
      <div class="tt-rosary__custom-config">
        <label class="tt-rosary__custom-text-label">
          <span>{localizeUi("Nhập danh hiệu hoặc câu chú mới")}</span>
          <input
            type="text"
            aria-label={localizeUi("Danh hiệu hoặc câu chú tùy chọn")}
            placeholder={localizeUi("Ví dụ: Nam mô Tiêu Tai Diên Thọ Dược Sư Phật, Om Tare...")}
            value={customText}
            maxlength="120"
            oninput={(event) => onCustomTextChange?.((event.currentTarget as HTMLInputElement).value)}
          />
        </label>
        <div class="tt-rosary__custom-type-group">
          <span>{localizeUi("Ghi nhận loại công phu:")}</span>
          <div class="tt-rosary__custom-types">
            <label>
              <input
                type="radio"
                name="rosaryNewCustomTypeOption"
                checked={customType === 'Niệm danh hiệu'}
                onchange={() => onCustomTypeChange?.('Niệm danh hiệu')}
              />
              <span>{localizeUi("Niệm danh hiệu")}</span>
            </label>
            <label>
              <input
                type="radio"
                name="rosaryNewCustomTypeOption"
                checked={customType === 'Trì chú'}
                onchange={() => onCustomTypeChange?.('Trì chú')}
              />
              <span>{localizeUi("Trì chú")}</span>
            </label>
          </div>
        </div>
        <button
          type="button"
          class="tt-rosary__custom-add-btn"
          disabled={!customText.trim()}
          onclick={() => {
            if (!customText.trim()) return;
            onAddCustomPhrase?.({ text: customText.trim(), type: customType });
          }}
        >
          ➕ {localizeUi("Lưu vào danh sách lựa chọn")}
        </button>
      </div>
    {:else if phrase.startsWith('custom:')}
      {@const activeCustom = customPhrases.find(cp => `custom:${cp.id}` === phrase)}
      {#if activeCustom}
        <div class="tt-rosary__custom-active-bar">
          <span class="tt-rosary__custom-badge">🏷️ {localizeUi(activeCustom.type)}</span>
          <button
            type="button"
            class="tt-rosary__custom-del-btn"
            title={localizeUi("Xóa khỏi danh sách")}
            onclick={() => onDeleteCustomPhrase?.(activeCustom.id)}
          >
            🗑️ {localizeUi("Xóa khỏi danh sách")}
          </button>
        </div>
      {/if}
    {/if}

    <div class="tt-rosary__preferences">
      <label><input aria-label={localizeUi("Vuốt xuống để tăng")} type="radio" checked={direction === 'down'} name="rsDirection" onchange={() => onDirectionChange('down')} /><span>{localizeUi("⬇️ Vuốt xuống")}</span></label>
      <label><input aria-label={localizeUi("Vuốt lên để tăng")} type="radio" checked={direction === 'up'} name="rsDirection" onchange={() => onDirectionChange('up')} /><span>{localizeUi("⬆️ Vuốt lên")}</span></label>
      <label><input aria-label={localizeUi("Bật âm thanh khi đếm")} type="checkbox" checked={soundEnabled} onchange={(event) => onSoundToggle((event.currentTarget as HTMLInputElement).checked)} /><span>{localizeUi("🪘 Âm thanh")}</span></label>
    </div>
    </div>

    {#if onAutoStart}
      <div class="tt-rosary__modes" role="group" aria-label={autoCopy.mode}>
        <button type="button" aria-pressed={!showAutomatic} disabled={autoInProgress} onclick={() => automaticMode = false}>{autoCopy.manual}</button>
        <button type="button" aria-pressed={showAutomatic} disabled={autoInProgress} onclick={() => automaticMode = true}>{autoCopy.automatic}</button>
      </div>
      {#if showAutomatic}
        <div class="tt-rosary__auto">
          <div class="tt-rosary__auto-settings">
            <div class="tt-rosary__auto-tempo" inert={autoBusy || Boolean(autoState?.playing)}>
            <RosarySelect label={autoCopy.speed} accessibleLabel={autoCopy.speed} value={String(autoInterval)}
              options={[2000, 1500, 1000, 750].map((value, index) => ({ value: String(value), label: autoCopy.tempos[index] }))}
              onChange={value => { if (!autoBusy && !autoState?.playing) autoInterval = Number(value); }} />
            </div>
            <div class="tt-rosary__auto-target" inert={autoInProgress}>
            <RosarySelect label={autoCopy.target} accessibleLabel={autoCopy.target} value={String(autoInProgress ? autoState?.target || autoTarget : autoTarget)}
              options={ROSARY_TARGET_COUNTS.map(value => ({ value: String(value), label: `${value.toLocaleString(localeStore.current === 'en' ? 'en-US' : 'vi-VN')} ${autoCopy.beads}` }))}
              onChange={value => { if (!autoInProgress) autoTarget = Number(value); }} />
            </div>
          </div>
          <p class="tt-rosary__auto-encouragement"><i>{autoCopy.encouragement}</i></p>
          <p class="tt-rosary__auto-status" class:tt-rosary__auto-error={Boolean(autoState?.error)} role="status">{autoStatus}{#if autoState && autoState.target > 0} · {autoState.count}/{autoState.target}{/if}</p>
        </div>
      {/if}
    {/if}

    </div>
    <div class="tt-rosary__meta">
      <div class="tt-rosary__progress" aria-label={localizeUi("Tiến độ mục tiêu {0} phần trăm", Math.round(progress * 100))}>
        <svg viewBox="0 0 104 104" aria-hidden="true"><circle cx="52" cy="52" r="46"></circle><circle class="value" cx="52" cy="52" r="46" style:stroke-dashoffset={progressOffset}></circle></svg>
        <span>{Math.round(progress * 100)}%</span>
      </div>
      <div><strong aria-live="polite">{count}</strong><span>{localizeUi("Đang lần /")} {dailyGoal.toLocaleString(localizeUi.locale())}</span></div>
      <div class="tt-rosary__cycle"><strong>{cyclePosition}/{size}</strong><span>{cycleCount} {localizeUi("chuỗi hoàn tất")}</span></div>
    </div>

    <p id="tt-rosary-phrase" class="tt-rosary__phrase" aria-live="polite">{canCount ? displayRosaryPhrase(phrase, localeStore.current, customPhrases) : validationCopy.required}</p>

    <div bind:this={swipeArea} class:animating={beadAnimated || showAutomatic} class="tt-rosary__swipe" role="button" tabindex={manualCounting ? 0 : -1} aria-disabled={!manualCounting} aria-describedby={!canCount ? 'tt-rosary-phrase' : undefined} aria-label={localizeUi("Vuốt, chạm chuỗi hạt hoặc dùng phím mũi tên để đếm hạt")}>
      <div class="tt-rosary__bead-track" aria-hidden="true">
        {#each [-3, -2, -1, 0, 1, 2, 3] as beadIndex}<div class="tt-rosary__bead" style={beadStyle(beadIndex)}><img class="tt-rosary__bead-img" src="/images/rosary/hat-kim-cang-bo-de-clean-20261023.webp" alt="" draggable="false" /></div>{/each}
      </div>
      <canvas bind:this={waterCanvas} class="tt-rosary__water" aria-hidden="true"></canvas>
      <p class="tt-rosary__hint">{#if showAutomatic}{autoCopy.automaticHint}{:else if canCount}{direction === 'down' ? localizeUi("Vuốt xuống") : localizeUi("Vuốt lên")} {localizeUi("hoặc chạm chuỗi hạt")} <span>{localizeUi("(phím")} {direction === 'down' ? '↓' : '↑'})</span>{:else}{validationCopy.blocked}{/if}</p>
    </div>
    </div>
    {#if showAutomatic && onAutoStart}
      <div class="tt-rosary__auto-actions">
        <button class="tt-rosary__count-button" type="button" disabled={autoBusy || routinePaused || !canCount} onclick={() => {
          if (autoState?.playing) onAutoPause?.();
          else if (autoInProgress) onAutoResume?.(autoInterval);
          else {
            optionsOpen = false;
            onAutoStart?.({ intervalMs: autoInterval, target: autoTarget });
          }
        }}>{autoBusy ? autoCopy.preparing : autoState?.playing ? autoCopy.pause : autoInProgress ? autoCopy.resume : autoCopy.start}</button>
        {#if autoInProgress}<button class="tt-rosary__auto-stop" type="button" disabled={autoBusy} onclick={onAutoStop}>{autoCopy.stop}</button>{/if}
      </div>
    {:else}
      <button class="tt-rosary__count-button" type="button" disabled={!manualCounting} aria-describedby={!canCount ? 'tt-rosary-phrase' : undefined} onclick={() => { if (!manualCounting) return; if (beadController) beadController.roll(1); else onDelta(1); }}>{localizeUi("Niệm một hạt")}</button>
    {/if}
  </section>
  </dialog>
{/if}


<style>
  .tt-rosary__modes{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(var(--space-page)*.4);padding:calc(var(--space-page)*.6) calc(var(--space-page)*.8)}
  .tt-rosary__modes button,.tt-rosary__auto-stop{min-width:44px;min-height:44px;border:1px solid var(--border);border-radius:var(--radius-control);padding:calc(var(--space-page)*.4);background:var(--card);color:var(--text2);font:inherit;font-size:var(--font-size-label);font-weight:700;cursor:pointer}
  .tt-rosary__modes button[aria-pressed=true]{background:var(--gold-light);border-color:var(--gold);color:var(--brown)}
  .tt-rosary button:disabled{opacity:.55;cursor:not-allowed}
  .tt-rosary__auto{padding:0 calc(var(--space-page)*.8)}
  .tt-rosary__auto-settings{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(var(--space-page)*.5)}
  .tt-rosary__auto-encouragement{margin:calc(var(--space-page)*.5) 0;color:var(--text2);font-size:var(--font-size-meta);line-height:1.65;text-align:justify}
  .tt-rosary__auto-status{margin:calc(var(--space-page)*.4) 0;color:var(--brown);font-size:var(--font-size-label);text-align:center}
  .tt-rosary__auto-error{color:var(--danger-text)}
  .tt-rosary__auto-actions{display:flex;justify-content:center;align-items:center;gap:calc(var(--space-page)*.5);padding-inline:var(--space-page);flex-shrink:0}
  .tt-rosary__auto-actions .tt-rosary__count-button{margin:calc(var(--space-page)*.4) 0}
  @media(max-width:430px){.tt-rosary__auto-settings{grid-template-columns:minmax(0,1fr)}}
  .tt-rosary__water{position:absolute;inset:0;width:100%;height:100%;z-index:101;pointer-events:none}
  .tt-rosary__hint{z-index:102!important}
  .tt-rosary__options-bar{display:grid;grid-template-columns:minmax(0,1fr) auto;align-items:center;gap:calc(var(--space-page)*.5);padding:calc(var(--space-page)*.5) calc(var(--space-page)*.8);border-bottom:1px solid var(--border2)}
  .tt-rosary__options-bar p{min-width:0;margin:0;color:var(--text2);font-size:var(--font-size-body);line-height:1.6;overflow-wrap:anywhere}
  .tt-rosary__options-bar button{min-width:44px;min-height:44px;padding:calc(var(--space-page)*.4) calc(var(--space-page)*.6);border:1px solid var(--border);border-radius:var(--radius-control);background:var(--gold-light);color:var(--brown);font:inherit;font-size:var(--font-size-label);font-weight:700;cursor:pointer}
  .tt-rosary__options[hidden]{display:none}
  .tt-rosary.compact .tt-rosary__swipe{min-height:clamp(180px,32dvh,320px)}
  .tt-rosary{position:fixed;z-index:10600;inset:0;display:flex;overflow-y:auto;min-height:100dvh;flex-direction:column;background:var(--bg);color:var(--text);font-family:var(--font-app);animation:tt-rosary-fade-in .25s ease}.tt-rosary__header{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:12px 16px;border-bottom:1px solid var(--border2);background:var(--bg2)}.tt-rosary__back{display:flex;min-width:0;align-items:center;gap:7px;padding:0;border:0;background:transparent;color:var(--text);cursor:pointer;font:inherit}.tt-rosary__title{overflow:hidden;font-size:17px;font-weight:800;text-overflow:ellipsis;white-space:nowrap}.tt-rosary__header-actions{display:flex;gap:7px}.tt-rosary__header-actions button{min-height:38px;padding:0 12px;border:1px solid var(--gold);border-radius:999px;background:var(--gold);color:#fff;cursor:pointer;font:700 12px/1 inherit;white-space:nowrap}.tt-rosary__header-actions .tt-rosary__reset{border-color:var(--border);background:transparent;color:var(--text2)}.tt-rosary__settings{display:grid;padding:10px 16px 4px;grid-template-columns:140px 160px minmax(220px,1fr);gap:8px}.tt-rosary__preferences{display:flex;flex-wrap:wrap;justify-content:center;gap:12px;padding:7px 12px 0;font-size:var(--font-size-meta)}.tt-rosary__preferences label{display:flex;align-items:center;gap:4px}.tt-rosary__meta{display:grid;align-items:center;justify-content:center;padding:12px 20px 4px;grid-template-columns:92px minmax(140px,220px) 130px;gap:20px;text-align:center}.tt-rosary__meta>div>strong{display:block;color:var(--gold);font-size:52px;line-height:1}.tt-rosary__meta>div>span{display:block;margin-top:5px;color:var(--muted);font-size:var(--font-size-meta);font-weight:700}.tt-rosary__progress{position:relative;width:82px;height:82px}.tt-rosary__progress svg{width:100%;height:100%;transform:rotate(-90deg)}.tt-rosary__progress circle{fill:none;stroke:var(--border2);stroke-width:7}.tt-rosary__progress circle.value{stroke:var(--gold);stroke-dasharray:289;stroke-linecap:round;transition:stroke-dashoffset .25s ease}.tt-rosary__progress>span{position:absolute;inset:0;display:grid;place-items:center;color:var(--gold);font-size:14px;font-weight:800}.tt-rosary__cycle strong{font-size:20px!important}.tt-rosary__phrase{margin:5px 16px 0;color:var(--brown);font-size:clamp(16px,3vw,23px);font-weight:800;text-align:center}.tt-rosary__swipe{position:relative;display:flex;overflow:hidden;min-height:210px;flex:1;justify-content:center;outline:none;touch-action:none;cursor:grab}.tt-rosary__bead-track{position:relative;display:flex;width:140px;height:100%;align-items:center;justify-content:center}.tt-rosary__bead{position:absolute;z-index:2;top:50%;left:50%;width:110px;height:110px;margin-top:-55px;margin-left:-55px;border:1.5px solid #3e2723;border-radius:50%;background:radial-gradient(circle at 30% 30%,#a67c52,#5c3a21);box-shadow:inset -8px -8px 20px rgba(0,0,0,.5),inset 8px 8px 20px rgba(255,255,255,.2),0 15px 25px rgba(0,0,0,.3);will-change:transform,opacity}.tt-rosary__swipe.animating .tt-rosary__bead{transition:transform .15s ease-out,opacity .15s}.tt-rosary__hint{position:absolute;z-index:0;right:0;bottom:14px;left:0;margin:0;color:var(--muted);font-size:var(--font-size-meta);text-align:center;pointer-events:none}.tt-rosary__count-button{align-self:center;min-width:170px;min-height:44px;margin:8px auto 18px;padding:0 18px;border:0;border-radius:999px;background:var(--gold);color:var(--on-gold);cursor:pointer;font:800 13px/1 inherit}button:focus-visible{outline:3px solid color-mix(in srgb,var(--gold) 45%,transparent);outline-offset:2px}@keyframes tt-rosary-fade-in{from{opacity:0}}@media(max-width:680px){.tt-rosary__settings{grid-template-columns:1fr 1fr}.tt-rosary__settings :global(.rosary-select-field:last-child){grid-column:1/-1}.tt-rosary__meta{grid-template-columns:72px 1fr 100px;gap:8px}.tt-rosary__meta>div>strong{font-size:44px}.tt-rosary__progress{width:68px;height:68px}}@media(max-width:430px){.tt-rosary__header{padding:8px}.tt-rosary__title{font-size:14px}.tt-rosary__header-actions button{padding:0 8px;font-size:11px}.tt-rosary__preferences{gap:6px;font-size:var(--font-size-meta)}.tt-rosary__meta{padding-inline:8px}.tt-rosary__phrase{font-size:15px}.tt-rosary__swipe{min-height:180px}}@media(prefers-reduced-motion:reduce){.tt-rosary{animation:none}.tt-rosary__swipe.animating .tt-rosary__bead,.tt-rosary__progress circle.value{transition:none}}
  .tt-rosary__bead{border:0;background:transparent;box-shadow:none;display:grid;place-items:center;filter:drop-shadow(0 10px 18px #0004) drop-shadow(0 2px 4px #0002)}
  .tt-rosary__bead-img{width:100%;height:100%;object-fit:contain;user-select:none;pointer-events:none;-webkit-user-drag:none}
  .tt-rosary{background:linear-gradient(color-mix(in srgb,#f9ad60 8%,var(--bg)),var(--bg) 55%)}
  .tt-rosary__header{background:linear-gradient(120deg,#f9ad60,#ffdaaa);color:#713d20;border-bottom:0;gap:10px;padding:14px 16px 12px}
  .tt-rosary__header-left{display:flex;align-items:center;gap:10px;min-width:0}
  .tt-rosary__back{display:grid;place-items:center;width:44px;height:44px;flex-shrink:0;border:1.5px solid #ffffff65;border-radius:50%;background:#ffffff20;color:inherit;padding:0}
  .tt-rosary__header-icon{font-size:22px;flex-shrink:0}
  .tt-rosary__title-box{display:flex;flex-direction:column;min-width:0;gap:2px}
  .tt-rosary__title{font-size:16px;line-height:1.3}
  .tt-rosary__bead-desc{font-size:var(--font-size-meta);font-weight:600;line-height:1.4}
  .tt-rosary__header-actions button,.tt-rosary__header-actions .tt-rosary__reset{border-color:#ffffff65;background:#ffffff20;color:inherit;min-height:44px;font-weight:500}
  .tt-rosary__swipe{min-height:clamp(320px,50dvh,520px)}
  .tt-rosary__bead{width:118px;height:118px;margin-top:-59px;margin-left:-59px}
  @media(max-width:430px){.tt-rosary__header{padding:12px 10px;gap:8px}.tt-rosary__header-left{gap:8px}.tt-rosary__title{font-size:14px}.tt-rosary__header-icon{font-size:20px}.tt-rosary__header-actions button{padding:0 10px}.tt-rosary__swipe{min-height:clamp(320px,50dvh,520px)}}

  .tt-rosary-modal{border:0;padding:0;margin:0;max-width:none;max-height:none;width:100%;height:100%;background:transparent;color:inherit}
  .tt-rosary__header{padding-top:calc(16px + var(--app-safe-top,env(safe-area-inset-top,0px)));padding-left:max(16px,env(safe-area-inset-left,0px));padding-right:max(16px,env(safe-area-inset-right,0px))}
  .tt-rosary{padding-bottom:calc(24px + env(safe-area-inset-bottom,0px))}
  .tt-rosary button{min-height:44px}
  .tt-rosary__back{min-width:44px}
  .tt-rosary__preferences label{min-height:44px}
  .tt-rosary__reset :global(.tt-rosary__reset-icon){display:none}
  @media(max-width:430px){
    .tt-rosary__header{padding-left:max(10px,env(safe-area-inset-left,0px));padding-right:max(10px,env(safe-area-inset-right,0px))}
    .tt-rosary__header-left{flex:1}
    .tt-rosary__header-actions{flex-shrink:0}
    .tt-rosary__header-actions button.tt-rosary__reset{display:grid;place-items:center;width:44px;min-width:44px;height:44px;min-height:44px;padding:0;border-radius:50%}
    .tt-rosary__reset :global(.tt-rosary__reset-icon){display:block}
    .tt-rosary__reset-label{position:absolute;width:1px;height:1px;padding:0;margin:-1px;overflow:hidden;clip-path:inset(50%);white-space:nowrap}
  }
  /* Nội dung cuộn riêng để hạt/chú dài không đẩy hoặc che nút đếm. */
  .tt-rosary{height:100dvh;min-height:0;overflow:hidden;box-sizing:border-box}
  .tt-rosary__body{display:flex;flex:1 1 auto;min-height:0;min-width:0;flex-direction:column;overflow-y:auto;scroll-padding-block:var(--space-page)}
  .tt-rosary__header,.tt-rosary__count-button{flex-shrink:0}

  .tt-rosary__custom-config{display:grid;gap:10px;padding:12px 14px;background:color-mix(in srgb,var(--card) 60%,transparent);border-radius:var(--radius-card);margin:6px 16px 8px;border:1px dashed var(--border2)}
  .tt-rosary__custom-text-label{display:grid;gap:6px;color:var(--muted);font-size:var(--font-size-label);font-weight:700;text-transform:uppercase;letter-spacing:.04em}
  .tt-rosary__custom-text-label input{min-height:44px;padding:0 12px;border:1px solid var(--border);border-radius:10px;background:var(--bg2);color:var(--text);font:inherit;font-size:14px}
  .tt-rosary__custom-type-group{display:flex;flex-wrap:wrap;align-items:center;gap:12px;color:var(--muted);font-size:var(--font-size-label);font-weight:700}
  .tt-rosary__custom-types{display:flex;gap:16px;align-items:center}
  .tt-rosary__custom-types label{display:flex;align-items:center;gap:6px;min-height:44px;cursor:pointer;color:var(--text);font-size:var(--font-size-label);font-weight:600}
  .tt-rosary__custom-types input[type="radio"]{width:20px;height:20px;accent-color:var(--gold)}

  .tt-rosary__custom-add-btn{min-height:44px;padding:0 16px;border:0;border-radius:var(--radius-control);background:var(--gold);color:var(--on-gold,#fff);font-size:var(--font-size-label);font-weight:700;cursor:pointer;justify-self:start}
  .tt-rosary__custom-add-btn:disabled{opacity:.5;cursor:not-allowed}
  .tt-rosary__custom-active-bar{display:flex;align-items:center;justify-content:space-between;padding:6px 16px;background:color-mix(in srgb,var(--card) 40%,transparent);border-bottom:1px solid var(--border2);font-size:var(--font-size-meta)}
  .tt-rosary__custom-badge{color:var(--gold2);font-weight:700}
  .tt-rosary__custom-del-btn{min-height:44px;padding:0 10px;border:1px solid var(--border);border-radius:var(--radius-control);background:transparent;color:var(--text2);font:inherit;font-size:var(--font-size-label);font-weight:600;cursor:pointer}
</style>
