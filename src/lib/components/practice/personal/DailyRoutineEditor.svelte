<script module lang="ts">
  export interface DedicationTemplate { id: string; title: string; text: string }
</script>
<script lang="ts">
  import { createBrowserId } from '$lib/browser/random-id';
  import RosarySelect from '../rosary/RosarySelect.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { personalPracticeCopy } from '$lib/i18n/personal-practice-copy';
  import buddhas from '$lib/data/buddhas.json';
  import { ROSARY_PHRASES, normalizeCustomRosaryPhrases } from '$lib/domain/practice/guided-sessions';
  import type { createPersonalPracticeStorage } from '$lib/browser/personal-practice-storage';
  import { cloneDailyRoutine, isDailyRoutine, moveRoutineStep, type DailyRoutine, type RoutineStep } from '$lib/domain/practice/personal-practice';
  interface Props {
    storage: ReturnType<typeof createPersonalPracticeStorage>;
    dedicationTemplates?: DedicationTemplate[];
    onRun?: (routine: DailyRoutine) => void | Promise<void>;
  }
  let { storage, dedicationTemplates = [], onRun }: Props = $props();
  const locale = getLocaleContext();
  const copy = $derived(personalPracticeCopy[locale.current === 'en' ? 'en' : 'vi']);
  let routines = $state<DailyRoutine[]>([]);
  let draft = $state<DailyRoutine | null>(null);
  let status = $state('');
  let failed = $state(false);
  let busy = $state(false);
  let revision = 0;
  const selectedRoutineId = $derived(routines.find(item => item.id === draft?.id)?.id ?? '');
  const kinds: RoutineStep['kind'][] = ['prostration', 'meditation', 'rosary', 'dedication'];
  const kindOptions = $derived(kinds.map(kind => ({ value: kind, label: copy[kind] })));
  const buddhaOptions = buddhas.map(buddha => ({ value: buddha.danhHieu, label: buddha.name }));
  const bellOptions = $derived([{ value: 'bell', label: copy.bell }, { value: 'bowl', label: copy.bowl }, { value: 'khánh', label: copy.khanh }]);
  const templateOptions = $derived([{ value: '', label: copy.custom }, ...dedicationTemplates.map(template => ({ value: template.id, label: template.title.toLocaleUpperCase(locale.current === 'en' ? 'en' : 'vi') }))]);
  $effect(() => {
    const owner = storage;
    revision += 1; draft = null; busy = false; status = ''; failed = false;
    try { routines = owner.getRoutines(); }
    catch { routines = []; failed = true; status = copy.notReady; }
  });
  function step(kind: RoutineStep['kind']): RoutineStep {
    const id = createBrowserId();
    if (kind === 'prostration') return { id, kind, phrase: 'Nam Mô A Di Đà Phật', count: 3 };
    if (kind === 'meditation') return { id, kind, minutes: 15, cue: 'bell' };
    if (kind === 'rosary') return { id, kind, phrase: 'Nam Mô A Di Đà Phật', count: 108, automatic: false, bpm: 60 };
    const template = dedicationTemplates[0];
    return { id, kind, text: template?.text ?? '', ...(template ? { sourceId: template.id } : {}) };
  }
  function create(): void {
    draft = { id: createBrowserId(), name: copy.defaultRoutine, steps: kinds.map(step), updatedAt: new Date().toISOString() };
    status = ''; failed = false;
  }
  function select(id: string): void { const routine = routines.find(item => item.id === id); if (routine) { draft = cloneDailyRoutine($state.snapshot(routine)); status = ''; failed = false; } }
  function replace(index: number, kind: RoutineStep['kind']): void { if (draft) draft.steps[index] = step(kind); }
  function move(index: number, offset: number): void { if (draft) draft = moveRoutineStep(draft, index, index + offset); }
  function useTemplate(index: number, id: string): void {
    const selected = dedicationTemplates.find(template => template.id === id);
    if (!draft || draft.steps[index]?.kind !== 'dedication') return;
    const previous = draft.steps[index] as Extract<RoutineStep, { kind: 'dedication' }>;
    draft.steps[index] = { ...previous, text: selected?.text ?? previous.text, sourceId: selected?.id };
  }
  function save(): DailyRoutine | null {
    if (!draft) return null;
    if (!draft.name.trim()) { failed = true; status = copy.requiredName; return null; }
    if (!draft.steps.length) { failed = true; status = copy.noSteps; return null; }
    const saved = { ...cloneDailyRoutine($state.snapshot(draft)), name: draft.name.trim(), updatedAt: new Date().toISOString() };
    if (!isDailyRoutine(saved)) { failed = true; status = copy.invalidRoutine; return null; }
    for (const step of saved.steps) {
      if (step.kind !== 'rosary') continue;
      const phrase = step.phrase.trim();
      const existing = ROSARY_PHRASES.find(item => item !== 'Tùy chọn' && item.toLocaleLowerCase('vi') === phrase.toLocaleLowerCase('vi'));
      if (!existing && !normalizeCustomRosaryPhrases([{ id: 'cp_1000000000000_routine', text: phrase, type: 'Niệm danh hiệu' }]).length) {
        failed = true; status = copy.rosaryPhraseInvalid; return null;
      }
      step.phrase = existing ?? phrase;
    }
    try { routines = storage.saveRoutine(saved); draft = saved; failed = false; status = copy.routineSaved; return saved; }
    catch { failed = true; status = copy.saveError; return null; }
  }
  async function run(): Promise<void> {
    if (!onRun || busy) return;
    const routine = save(); if (!routine) return;
    const currentRevision = revision;
    busy = true;
    try { await onRun(routine); }
    catch { if (revision === currentRevision) { failed = true; status = copy.runError; } }
    finally { if (revision === currentRevision) busy = false; }
  }
</script>

<section class="routine-editor" inert={busy} aria-busy={busy}>
  <div class="routine-header">
    {#if routines.length}<RosarySelect label={copy.chooseRoutine} accessibleLabel={copy.chooseRoutine} value={selectedRoutineId} options={[{ value: '', label: copy.chooseRoutine, disabled: true }, ...routines.map(item => ({ value: item.id, label: item.name }))]} onChange={select} />{:else}<p>{copy.savedRoutinesEmpty}</p>{/if}
    <button onclick={create} disabled={busy}>{copy.newRoutine}</button>
  </div>
  {#if draft}
    <label>{copy.routineName}<input bind:value={draft.name} maxlength="120" disabled={busy} /></label>
    <h3>{copy.steps}</h3>
    {#each draft.steps as current, index (current.id)}
      <div class="step-card">
        <div class="step-header"><strong>{index + 1}. {copy[current.kind]}</strong><div class="step-actions"><button aria-label={copy.moveUp} disabled={index === 0 || busy} onclick={() => move(index, -1)}>↑</button><button aria-label={copy.moveDown} disabled={index === draft.steps.length - 1 || busy} onclick={() => move(index, 1)}>↓</button><button aria-label={copy.remove} disabled={busy} onclick={() => { if (draft) draft.steps = draft.steps.filter(item => item.id !== current.id); }}>×</button></div></div>
        <RosarySelect label={copy.stepType} accessibleLabel={copy.stepType} value={current.kind} options={kindOptions} onChange={value => replace(index, value as RoutineStep['kind'])} />
        {#if current.kind === 'prostration'}
          <RosarySelect label={copy.buddha} accessibleLabel={copy.buddha} value={current.phrase}
            options={buddhaOptions.some(option => option.value === current.phrase) ? buddhaOptions : [{ value: current.phrase, label: current.phrase }, ...buddhaOptions]}
            onChange={value => { current.phrase = value; }} />
          <RosarySelect label={copy.prostrationCount} accessibleLabel={copy.prostrationCount} value={String(current.count)}
            options={[...new Set([3, 12, 21, current.count])].sort((a, b) => a - b).map(count => ({ value: String(count), label: `${count} ${copy.prostrations}` }))}
            onChange={value => { current.count = Number(value); }} />
        {:else if current.kind === 'rosary'}
          <label>{copy.phrase}<input bind:value={current.phrase} maxlength="500" disabled={busy} /></label>
          <label>{copy.target}<input type="number" min="1" max="100000" step="1" bind:value={current.count} disabled={busy} /></label>
          <label class="checkbox"><input type="checkbox" bind:checked={current.automatic} disabled={busy} />{copy.automatic}</label>
          {#if current.automatic}<RosarySelect label={copy.speed} accessibleLabel={copy.speed} value={String(current.bpm)} options={[30,40,60,80].map(bpm => ({ value: String(bpm), label: `${bpm} ${copy.bpm}` }))} onChange={value => { current.bpm = Number(value) as 30 | 40 | 60 | 80; }} />{/if}
        {:else if current.kind === 'meditation'}
          <RosarySelect label={copy.minutes} accessibleLabel={copy.minutes} value={String(current.minutes)} options={[10,15,30].map(minutes => ({ value: String(minutes), label: `${minutes}` }))} onChange={value => { current.minutes = Number(value); }} />
          <RosarySelect label={copy.transitionBell} accessibleLabel={copy.transitionBell} value={current.cue ?? 'bell'} options={bellOptions}
            onChange={value => { current.cue = value as 'bell' | 'bowl' | 'khánh'; }} />
        {:else}
          <RosarySelect label={copy.source} accessibleLabel={copy.source} value={current.sourceId ?? ''} options={templateOptions} onChange={value => useTemplate(index, value)} />
          <label>{copy.dedicationText}<textarea class="reader" bind:value={current.text} maxlength="20000" disabled={busy}></textarea></label>
          <small>{copy.dedicationHint}</small>
        {/if}
      </div>
    {/each}
    <button onclick={() => { if (draft && draft.steps.length < 20) draft.steps.push(step('meditation')); }} disabled={busy || draft.steps.length >= 20}>{copy.addStep}</button>
    <div class="bottom-actions"><button onclick={save} disabled={busy}>{copy.saveRoutine}</button><button class="primary" onclick={() => { void run(); }} disabled={!onRun || busy}>{copy.start}</button></div>
    {#if !onRun}<p>{copy.startUnavailable}</p>{/if}
  {/if}
  <p class:error={failed} role="status">{status}</p>
</section>

<style>
  .routine-editor{min-width:0}.routine-header{display:grid;gap:calc(var(--space-page)*.5);margin-bottom:var(--space-page)}.step-card{padding:var(--space-page);margin-bottom:var(--space-page);border:1px solid var(--border2);border-radius:var(--radius-card);background:var(--dialog-glass-background,var(--card))}.step-header{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--space-page)*.5);margin-bottom:calc(var(--space-page)*.6)}.step-header strong{min-width:0;font-size:var(--font-size-card-title)}.step-actions{display:flex;flex-shrink:0;gap:calc(var(--space-page)*.2)}label{display:grid;gap:calc(var(--space-page)*.3);font-weight:700;font-size:var(--font-size-label);margin-block:calc(var(--space-page)*.6)}input,textarea,button{box-sizing:border-box;min-height:44px;min-width:44px;font:inherit;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--card);color:var(--text);padding:calc(var(--space-page)*.5)}input,textarea{width:100%;min-width:0;font-size:var(--font-size-input)}textarea{min-height:calc(var(--space-page)*8);resize:vertical}.reader{font-family:var(--font-reader)}.checkbox{display:flex;align-items:center;gap:calc(var(--space-page)*.5)}.checkbox input{width:20px;min-width:20px;height:20px;min-height:20px;accent-color:var(--gold)}button{cursor:pointer;box-shadow:var(--glass-button-shadow)}button:disabled{opacity:.55;cursor:default}button:focus-visible,input:focus-visible,textarea:focus-visible{outline:3px solid var(--gold);outline-offset:2px}.bottom-actions{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(var(--space-page)*.5);margin-top:var(--space-page)}.primary{background:var(--gold);color:var(--on-gold)}p,small{line-height:1.7;color:var(--text2)}.error{color:var(--danger-text)}
</style>
