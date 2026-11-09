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
  let busy = $state(false);
  let error = $state('');
  const summary = $derived([
    ...(draft.beforeEnabled ? [copy.timingBefore(draft.daysBefore, draft.beforeTime)] : []),
    ...(draft.dayEnabled ? [copy.timingOnDay(draft.dayTime)] : []),
  ].join('; ') || copy.timingOff);

  function cancel() {
    draft = { ...config };
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
  <div class="timing-card">
    <strong>{copy.timingTitle}</strong>
    <div class="timing-row">
      <label class="timing-toggle"><input type="checkbox" bind:checked={draft.beforeEnabled} disabled={busy} />{copy.beforeLabel}</label>
      <div class="timing-fields">
        <label>{copy.beforeDays}<input aria-label={copy.beforeDays} type="number" min="1" max="100" step="1" bind:value={draft.daysBefore} disabled={busy || !draft.beforeEnabled} required />{copy.daysUnit}</label>
        <label>{copy.timeLabel}<input aria-label={copy.beforeLabel + ' — ' + copy.timeLabel} type="time" bind:value={draft.beforeTime} onclick={openClock} disabled={busy || !draft.beforeEnabled} required /></label>
      </div>
      <p class="help">{copy.beforeHelp}</p>
    </div>
    <div class="timing-row">
      <label class="timing-toggle"><input type="checkbox" bind:checked={draft.dayEnabled} disabled={busy} />{copy.dayLabel}</label>
      <div class="timing-fields"><label>{copy.timeLabel}<input aria-label={copy.dayLabel + ' — ' + copy.timeLabel} type="time" bind:value={draft.dayTime} onclick={openClock} disabled={busy || !draft.dayEnabled} required /></label></div>
      <p class="help">{copy.dayHelp}</p>
    </div>
  </div>
  <p class="timing-summary">{summary}</p>
  <p class="timing-scope">{copy.timingScope}</p>
  {#if error}<p class="timing-error" role="alert">{error}</p>{/if}
  <div class="timing-actions">
    <button type="button" onclick={cancel} disabled={busy}>{copy.cancel}</button>
    <button type="submit" class="primary" disabled={busy}>{busy ? copy.saving : copy.save}</button>
  </div>
</form>

<style>
  .personal-timing { margin-top: var(--dialog-action-space); color: var(--text); font-size: var(--font-size-body); }
  .timing-card { border: 1px solid var(--border); background: var(--bg2); border-radius: var(--radius-card); padding: var(--dialog-action-space); }
  .timing-row + .timing-row { border-top: 1px solid var(--border); margin-top: var(--dialog-action-space); padding-top: var(--dialog-action-space); }
  .timing-toggle { display: flex; gap: var(--dialog-action-gap); align-items: center; min-height: 44px; font-weight: 600; }
  .timing-toggle input { width: var(--space-page); height: var(--space-page); accent-color: var(--gold); flex-shrink: 0; }
  .timing-fields { display: flex; flex-wrap: wrap; gap: var(--dialog-action-gap); margin: var(--dialog-action-gap) 0 var(--dialog-action-gap) calc(var(--space-page) + var(--dialog-action-gap)); }
  .timing-fields label { display: flex; align-items: center; gap: var(--dialog-action-gap); color: var(--text2); min-height: 44px; }
  .timing-fields input { box-sizing: border-box; min-height: 48px; border: 1px solid var(--border); border-radius: var(--radius); background: var(--card); color: var(--text); padding: var(--dialog-action-gap); font: inherit; font-size: var(--font-size-input); min-width: 0; }
  input[type='number'] { width: calc(3ch + var(--dialog-action-space) * 2); }
  input[type='time'] { width: calc(10ch + var(--dialog-action-space) * 2); }
  .help { margin: 0 0 0 calc(var(--space-page) + var(--dialog-action-gap)); color: var(--muted); font-size: var(--font-size-label); line-height: 1.6; }
  .timing-summary { background: var(--gold-light); border-radius: var(--radius); padding: var(--dialog-action-space); color: var(--text2); }
  .timing-scope { color: var(--muted); line-height: 1.6; }
  .timing-error { color: var(--danger-text); }
  .timing-actions { display: flex; justify-content: flex-end; gap: var(--dialog-action-gap); margin-top: var(--dialog-action-space); }
  button { min-height: 48px; border: 1px solid var(--border); border-radius: var(--radius); padding: var(--dialog-action-gap) var(--dialog-action-space); background: var(--card); color: var(--text); font: inherit; }
  .primary { background: var(--gold); color: var(--on-gold); font-weight: 600; }
  :disabled { opacity: .5; }
</style>
