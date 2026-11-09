<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { modalDialog } from '$lib/browser/modal-dialog';
  import type { DailyRoutine } from '$lib/domain/practice/personal-practice';
  let { routine, index, paused, countdown, waiting, controlsOnly = false, showControls = true, onPause, onNext, onExit }: {
    routine: DailyRoutine; index: number; paused: boolean; countdown: number; waiting: boolean;
    controlsOnly?: boolean;
    showControls?: boolean;
    onPause: () => void; onNext: () => void; onExit: () => void;
  } = $props();
  const locale = getLocaleContext();
  const en = $derived(locale.current === 'en');
  const step = $derived(routine.steps[index]);
</script>

{#snippet controls()}
<aside class="routine-session" aria-label={en ? 'Current routine' : 'Thời khóa đang hành trì'}>
  <div><strong>{routine.name}</strong><span>{en ? 'Step' : 'Bước'} {index + 1}/{routine.steps.length}</span></div>
  <div class="routine-session__actions">
    <button type="button" onclick={onPause}>{paused ? (en ? 'Resume' : 'Tiếp tục') : (en ? 'Pause' : 'Tạm dừng')}</button>
    <button type="button" onclick={onNext}>{en ? 'Next step' : 'Chuyển bước'}</button>
    <button type="button" onclick={onExit}>{en ? 'End routine' : 'Kết thúc'}</button>
  </div>
  {#if countdown > 0}<p role="status">{en ? 'Next step in' : 'Chuyển bước sau'} {countdown}s</p>{/if}
</aside>
{/snippet}
{#if controlsOnly}{@render controls()}{/if}
{#if !controlsOnly && (step?.kind === 'dedication' || waiting)}
  <dialog use:modalDialog class="routine-reading" aria-label={en ? 'Routine practice' : 'Hành trì thời khóa'} oncancel={event => { event.preventDefault(); if (showControls) onPause(); else onExit(); }}>
    <div class="routine-reading__body">
      {#if showControls}{@render controls()}{/if}
      {#if step?.kind !== 'dedication'}<h2>{routine.name}</h2>{/if}
      {#if step?.kind === 'dedication'}
        <div class="routine-reading__verse">
          {#each step.text.split('\n') as line, lineIndex (lineIndex)}
            <p class:heading={line.trim() === line.trim().toLocaleUpperCase('vi') && /[\p{L}]/u.test(line)}>{#each line.split(/(\([^)]*\))/u) as part, partIndex (partIndex)}{#if part.startsWith('(') && part.endsWith(')')}<i>{part}</i>{:else}{part}{/if}{/each}</p>
          {/each}
        </div>
      {:else}<p>{paused ? (en ? 'Paused' : 'Đã tạm dừng') : (en ? 'Preparing the next step…' : 'Đang chuẩn bị bước tiếp theo…')}</p>{/if}
      <button type="button" onclick={onNext}>{step?.kind === 'dedication' ? (en ? 'Finished reading' : 'Đã đọc xong') : (en ? 'Continue now' : 'Tiếp tục ngay')}</button>
    </div>
  </dialog>
{/if}

<style>
  .routine-session{position:relative;flex-shrink:0;padding:calc(var(--space-page)*.4) calc(var(--space-page)*.6);background:var(--card);border-bottom:1px solid var(--border);box-shadow:var(--shadow);font:var(--font-size-label) var(--font-app);color:var(--text)}
  .routine-session>div:first-child{display:flex;justify-content:space-between;gap:calc(var(--space-page)*.5)}
  .routine-session__actions{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:calc(var(--space-page)*.3);margin-top:calc(var(--space-page)*.3)}
  button{font:inherit;min-height:44px;min-width:44px;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--gold-light);color:var(--text);padding:calc(var(--space-page)*.3);cursor:pointer}
  button:focus-visible{outline:2px solid var(--gold);outline-offset:2px}
  .routine-session p{margin:calc(var(--space-page)*.2) 0}
  .routine-reading{position:fixed;inset:0;margin:0;padding:calc(var(--space-page) + env(safe-area-inset-top)) var(--space-page) calc(var(--space-page) + env(safe-area-inset-bottom));width:100%;height:100%;max-width:none;max-height:none;background:var(--bg);border:0;color:var(--text);font-family:var(--font-reader);overflow:auto}
  .routine-reading__body{max-width:680px;margin:auto}.routine-reading h2{text-align:center;font-size:var(--font-size-section-title)}
  .routine-reading__verse{text-align:justify;line-height:1.9;overflow-wrap:anywhere}.routine-reading__verse p{min-height:1em;margin:0 0 calc(var(--space-page)*.5)}.routine-reading__verse .heading{text-align:center;font-weight:700}.routine-reading__body>button{display:block;width:100%;margin-top:var(--space-page)}
</style>
