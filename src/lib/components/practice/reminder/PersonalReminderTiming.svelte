<script lang="ts">
  import { untrack } from 'svelte';
  import { personalEventsUi } from '$lib/i18n/personal-events-ui';
  import type { PersonalReminderConfig } from '$lib/browser/practice-reminder-service';

  let { config, isEn = false, onsave }: {
    config: PersonalReminderConfig;
    isEn?: boolean;
    onsave: (config: PersonalReminderConfig) => Promise<boolean>;
  } = $props();
  const copy = $derived(personalEventsUi[isEn ? 'en' : 'vi']);
  let draft = $state(untrack(() => ({ ...config })));
  const leadTimes: readonly number[] = [1, 2, 3, 5, 7, 9, 14];
  let customDays = $state(untrack(() => !leadTimes.includes(config.daysBefore)));
  let busy = $state(false);
  let error = $state('');
  const summary = $derived([
    ...(draft.beforeEnabled ? [copy.timingBefore(draft.daysBefore, draft.beforeTime)] : []),
    ...(draft.dayEnabled ? [copy.timingOnDay(draft.dayTime)] : []),
  ].join('; ') || copy.timingOff);

  function cancel() {
    draft = { ...config };
    customDays = !leadTimes.includes(config.daysBefore);
    error = '';
  }
  function openClock(event: MouseEvent) {
    const input = event.currentTarget as HTMLInputElement;
    try { input.showPicker?.(); } catch { /* Bộ chọn mặc định vẫn mở trên WebView hỗ trợ input time. */ }
  }
  async function save(event: SubmitEvent) {
    event.preventDefault();
    if (busy) return;
    const validTime = (value: string) => /^([01]\d|2[0-3]):[0-5]\d$/.test(value);
    if ((draft.beforeEnabled && (!Number.isInteger(draft.daysBefore) || draft.daysBefore < 1 || draft.daysBefore > 100 || !validTime(draft.beforeTime))) ||
        (draft.dayEnabled && !validTime(draft.dayTime))) {
      error = copy.invalidTiming;
      return;
    }
    error = '';
    busy = true;
    try {
      if (!await onsave({ ...draft })) error = copy.storageError;
    } catch { error = copy.reminderError; }
    finally { busy = false; }
  }
</script>

<form class="personal-timing" onsubmit={save}>
  <strong class="timing-title">{isEn ? 'Shared reminder times' : 'Giờ nhắc chung'}</strong>
  <p class="timing-scope">{copy.timingScope}</p>
  <div class="timing-card">
    <div class="timing-row">
      <label class="timing-toggle"><span>{copy.beforeLabel}</span><input type="checkbox" bind:checked={draft.beforeEnabled} disabled={busy} /></label>
      <div class="timing-fields">
        <div class="timing-lead-time">
          <label>{copy.beforeDays}<select aria-label={copy.beforeDays} value={customDays ? 'custom' : String(draft.daysBefore)} disabled={busy || !draft.beforeEnabled} onchange={(event) => {
            const value = event.currentTarget.value;
            customDays = value === 'custom';
            if (!customDays) draft.daysBefore = Number(value);
          }}>
            {#each leadTimes as days (days)}<option value={String(days)}>{days} {copy.daysUnit}</option>{/each}
            <option value="custom">{isEn ? 'Custom…' : 'Tùy chỉnh…'}</option>
          </select></label>
          {#if customDays}<label class="custom-days-label">{isEn ? 'Number of days' : 'Số ngày'}<input aria-label={copy.beforeDays} type="number" min="1" max="100" step="1" bind:value={draft.daysBefore} disabled={busy || !draft.beforeEnabled} required /></label>{/if}
        </div>
        <label>{copy.timeLabel}<input aria-label={copy.beforeLabel + ' — ' + copy.timeLabel} type="time" bind:value={draft.beforeTime} onclick={openClock} disabled={busy || !draft.beforeEnabled} required /></label>
      </div>
      <p class="help">{copy.beforeHelp}</p>
    </div>
    <div class="timing-row">
      <label class="timing-toggle"><span>{copy.dayLabel}</span><input type="checkbox" bind:checked={draft.dayEnabled} disabled={busy} /></label>
      <div class="timing-fields"><p class="help day-help">{copy.dayHelp}</p><label>{copy.timeLabel}<input aria-label={copy.dayLabel + ' — ' + copy.timeLabel} type="time" bind:value={draft.dayTime} onclick={openClock} disabled={busy || !draft.dayEnabled} required /></label></div>
    </div>
  </div>
  <p class="timing-summary">{summary}</p>
  {#if error}<p class="timing-error" role="alert">{error}</p>{/if}
  <div class="timing-actions">
    <button type="button" onclick={cancel} disabled={busy}>{copy.cancel}</button>
    <button type="submit" class="primary" disabled={busy}>{busy ? copy.saving : copy.save}</button>
  </div>
</form>

<style>
  .personal-timing { color: var(--text); font-size: var(--font-size-body); min-width: 0; }
  .timing-title { display: block; font-size: var(--font-size-section-title); }
  .timing-scope { margin: var(--dialog-action-gap) 0 var(--dialog-action-space); color: var(--text2); line-height: 1.6; }
  .timing-card { display: grid; grid-auto-rows: 1fr; gap: var(--dialog-action-space); }
  .timing-row { min-width: 0; padding: var(--dialog-action-space); border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--bg2); }
  .timing-toggle { display: flex; justify-content: space-between; gap: var(--dialog-action-gap); align-items: center; min-height: var(--touch-target-size); font-weight: 600; cursor: pointer; }
  .timing-toggle span { min-width: 0; }
  .timing-toggle input { appearance: none; position: relative; margin: 0; width: calc(var(--touch-target-size) + var(--dialog-action-gap)); height: var(--touch-target-size); border: 0; background: transparent; flex-shrink: 0; cursor: pointer; }
  .timing-toggle input::after { content: ''; position: absolute; inset: calc(var(--dialog-action-space) / 2) 0; border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--bg3); }
  .timing-toggle input::before { content: ''; position: absolute; z-index: 1; width: calc(var(--space-page) + var(--dialog-action-gap) / 2); height: calc(var(--space-page) + var(--dialog-action-gap) / 2); top: 50%; left: calc(var(--dialog-action-gap) / 4); transform: translateY(-50%); border-radius: 50%; background: var(--card); }
  .timing-toggle input:checked::after { background: var(--gold); border-color: var(--gold); }
  .timing-toggle input:checked::before { left: auto; right: calc(var(--dialog-action-gap) / 4); background: var(--white); }
  .timing-fields { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; gap: var(--dialog-action-space); margin-top: var(--dialog-action-gap); }
  .timing-fields label { display: flex; flex-direction: column; gap: var(--dialog-action-gap); color: var(--text2); min-width: 0; }
  .timing-fields input, .timing-fields select { box-sizing: border-box; width: 100%; min-height: calc(var(--touch-target-size) + var(--dialog-action-gap) / 2); border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--card); color: var(--text); padding: var(--dialog-action-gap); font: inherit; font-size: var(--font-size-input); min-width: 0; }
  .timing-lead-time { min-width: 0; }
  .custom-days-label { margin-top: var(--dialog-action-gap); }
  .help { margin: var(--dialog-action-gap) 0 0; color: var(--text2); font-size: var(--font-size-label); line-height: 1.6; }
  .day-help { align-self: center; margin: 0; }
  .timing-summary { margin: var(--dialog-action-space) 0; color: var(--text2); line-height: 1.6; }
  .timing-error { color: var(--danger-text); }
  .timing-actions { display: flex; flex-direction: column-reverse; gap: var(--dialog-action-gap); margin-top: var(--dialog-action-space); }
  button { min-height: 48px; border: 1px solid var(--border); border-radius: var(--radius); padding: var(--dialog-action-gap) var(--dialog-action-space); background: var(--card); color: var(--text); font: inherit; }
  .primary { background: var(--gold); color: var(--on-gold); font-weight: 600; }
  :is(button, input, select):focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
  :disabled { opacity: .5; }
</style>
