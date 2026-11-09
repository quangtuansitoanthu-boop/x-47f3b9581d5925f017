<script lang="ts">
  import { recordPracticeParticipation } from '$lib/browser/practice-participation';
  import { tick } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import { getPreceptPracticeCopy, getDailyPreceptPracticeCopy, getPreceptCompletionCopy } from '$lib/i18n/precept-practice-ui';
  import { FIVE_PRECEPTS, TEN_PRECEPTS } from '$lib/content/precept-practice-content';
  import type { DailySession, DayAnswers } from '$lib/domain/practice/precept-companion';
  import { saveDailySession, getDailySessionConduct, getDailySessionTestingConduct } from '$lib/browser/precept-companion-storage';
  import { createBrowserId } from '$lib/browser/random-id';
  import PracticeConfirmDialog from '../dialog/PracticeConfirmDialog.svelte';
  import PreceptCompletion from './PreceptCompletion.svelte';

  let { group, session, ready, loadError, now, onReload, onContinue, onOpenAbstinence, resumeReflection = false, resumeTestingPrincipal = null, testingConductConfirmed = false }: {
    group: 'combined'; session: DailySession | null;
    ready: boolean; loadError: boolean; now: number; resumeReflection?: boolean; resumeTestingPrincipal?: string | null; testingConductConfirmed?: boolean; testingConductAnswer?: 'kept' | 'review';
    onReload: () => void; onContinue: () => void; onOpenAbstinence: (options: { sessionId: string; principal: string | null }) => void;
  } = $props();
  const groups = [{ id: 'five', items: FIVE_PRECEPTS }, { id: 'ten', items: TEN_PRECEPTS }] as const;
  const locale = getLocaleContext();
  const identity = getSessionContext();
  const ix = $derived(locale.current === 'en' ? 1 : 0);
  const c = $derived(getPreceptPracticeCopy(ix === 1));
  const name = $derived(c.combinedSectionTitle);
  const text = $derived(getDailyPreceptPracticeCopy(ix === 1, name));
  const completion = $derived(getPreceptCompletionCopy(ix === 1));
  const uniqueItems = [...new Map([...FIVE_PRECEPTS, ...TEN_PRECEPTS].map(item => [item.id, item])).values()];
  const requiredItems = uniqueItems.filter(item => item.id !== 'conduct');
  let showMissing = $state(false);
  let completedResult = $state<{ id: string; conduct: 'kept' | 'review' } | null>(null);
  let draft = $state<DayAnswers>({});
  let reflecting = $state(false);
  let preparingNext = $state(false);
  let pledged = $state(false);
  let confirming = $state<'start' | 'finish' | 'test' | null>(null);
  let conductPromptOpen = $state(false);
  let conductSourceError = $state(false);
  let adminReleasePrincipal = $state<string | null>(null);
  let saveError = $state(false);
  let loadedId = $state('');
  const answers = $derived({ ...session?.answers, ...draft });
  const conduct = $derived(readConduct(now));
  const active = $derived(session?.status === 'active');
  const elapsed = $derived(!!session && now >= Date.parse(session.endsAt));
  const adminPrincipal = $derived(getAdminPrincipal(now));
  const adminTesting = $derived(adminReleasePrincipal !== null && adminReleasePrincipal === adminPrincipal);
  const missing = $derived(requiredItems.filter(item => !answers[item.id]));
  const effectiveConduct = $derived(conduct.answer);
  const resultConduct = $derived(completedResult?.id === session?.id ? completedResult?.conduct : conduct.answer);
  const unmet = $derived(uniqueItems.filter(item => (item.id === 'conduct' ? resultConduct : answers[item.id]) !== 'kept'));
  const resultComplete = $derived(unmet.length === 0);
  const canReflect = $derived(elapsed || adminTesting);
  const remaining = $derived(session ? Math.max(0, Math.ceil((Date.parse(session.endsAt) - now) / 1000)) : 0);
  const countdown = $derived([Math.floor(remaining / 3600), Math.floor(remaining / 60) % 60, remaining % 60].map(value => String(value).padStart(2, '0')).join(':'));
  const progress = $derived(session ? Math.max(0, Math.min(100, (now - Date.parse(session.startsAt)) / 86_400_000 * 100)) : 0);
  const stage = $derived(active ? (reflecting && canReflect ? 'reflection' : 'tracking') : session?.status === 'ended' && !preparingNext ? 'completed' : session?.status === 'cancelled' && !preparingNext ? 'testing-ended' : 'prepare');
  $effect(() => {
    if ((session?.id ?? '') !== loadedId) {
      const initialSession = loadedId === '';
      loadedId = session?.id ?? ''; draft = {}; showMissing = false; preparingNext = false; pledged = false; confirming = null; conductPromptOpen = false; conductSourceError = false;
      const validResume = initialSession && resumeTestingPrincipal !== null && resumeTestingPrincipal === getAdminPrincipal(Date.now()) && !!session && session.status === 'active' && Date.now() < Date.parse(session.endsAt);
      adminReleasePrincipal = validResume ? resumeTestingPrincipal : null;
      reflecting = initialSession && resumeReflection && !!session && (now >= Date.parse(session.endsAt) || validResume);
    }
  });
  $effect(() => {
    if (adminReleasePrincipal !== null && (adminReleasePrincipal !== adminPrincipal || elapsed)) revokeTesting();
  });
  $effect(() => {
    if (conductPromptOpen && (!ready || loadError || !active || !reflecting || !canReflect)) conductPromptOpen = false;
  });
  export function handleBack(): boolean {
    if (conductPromptOpen) { conductPromptOpen = false; return true; }
    if (confirming !== null) { confirming = null; return true; }
    return false;
  }
  function getAdminPrincipal(at: number): string | null {
    const current = identity.value;
    const expiry = Date.parse(current.expiresAt ?? '');
    return current.authenticated && current.user?.role === 'admin' && current.user.id && Number.isFinite(expiry) && expiry > at ? current.user.id : null;
  }
  function revokeTesting() { adminReleasePrincipal = null; reflecting = false; confirming = null; conductPromptOpen = false; }
  function releaseForTesting() {
    const principal = getAdminPrincipal(Date.now());
    if (!principal || !ready || loadError || !session || !active || Date.now() >= Date.parse(session.endsAt)) return;
    adminReleasePrincipal = principal; reflecting = true; saveError = false;
  }
  function requestFinish() {
    if (!ready || loadError || !session || !active || !reflecting) return;
    if (!validateReflection()) return;
    if (adminReleasePrincipal !== null) {
      if (adminReleasePrincipal !== getAdminPrincipal(Date.now()) || Date.now() >= Date.parse(session.endsAt)) { revokeTesting(); return; }
      confirming = 'test';
    } else if (Date.now() >= Date.parse(session.endsAt)) confirming = 'finish';
  }
  function start() {
    if (confirming !== 'start' || !pledged || !ready || loadError || active) return;
    confirming = null;
    try {
      const starts = Date.now();
      const candidate: DailySession = { id: createBrowserId(), group, startsAt: new Date(starts).toISOString(), endsAt: new Date(starts + 86_400_000).toISOString(), status: 'active', answers: {} };
      if (!saveDailySession(candidate)) { saveError = true; return; }
      if (group === 'combined') {
        recordPracticeParticipation('five','started'); recordPracticeParticipation('ten','started');
      } else recordPracticeParticipation(group,'started');
      draft = {}; reflecting = false; preparingNext = false; saveError = false; onReload();
    } catch { saveError = true; }
  }
  function finish() {
    const testing = confirming === 'test';
    if ((!testing && confirming !== 'finish') || !ready || !session || !active || loadError) { confirming = null; return; }
    if (testing && (!adminReleasePrincipal || adminReleasePrincipal !== getAdminPrincipal(Date.now()) || Date.now() >= Date.parse(session.endsAt))) { revokeTesting(); return; }
    if (!testing && Date.now() < Date.parse(session.endsAt)) { confirming = null; return; }
    confirming = null;
    if (!validateReflection()) return;
    const completedConduct = readConduct(Date.now()).answer;
    if (!saveDailySession({ ...session, status: testing ? 'cancelled' : 'ended', answers: { ...answers } })) { saveError = true; return; }
    if (!testing) {
      if (group === 'combined') { recordPracticeParticipation('five','completed'); recordPracticeParticipation('ten','completed'); }
      else recordPracticeParticipation(group,'completed');
    }
    completedResult = completedConduct ? { id: session.id, conduct: completedConduct } : null;
    saveError = false; draft = {}; reflecting = false; adminReleasePrincipal = null; onReload();
  }
  function release() { if (session && active && Date.now() >= Date.parse(session.endsAt)) { adminReleasePrincipal = null; reflecting = true; } }
  function readConduct(at: number) {
    if (!session) return { answer: undefined, confirmed: false, error: false };
    const earlyTesting = at < Date.parse(session.endsAt) && adminReleasePrincipal !== null && adminReleasePrincipal === getAdminPrincipal(at);
    return earlyTesting && testingConductConfirmed ? getDailySessionTestingConduct(session) : getDailySessionConduct(session);
  }
  function validateReflection() {
    showMissing = missing.length > 0;
    conductSourceError = false;
    if (showMissing) { confirming = null; return false; }
    const currentConduct = readConduct(Date.now());
    if (currentConduct.error) { confirming = null; conductPromptOpen = false; conductSourceError = true; return false; }
    if (!currentConduct.confirmed || !currentConduct.answer) { confirming = null; conductPromptOpen = true; return false; }
    return true;
  }
  function confirmConductNavigation() {
    if (!conductPromptOpen) return;
    conductPromptOpen = false;
    openConduct();
  }
  function openConduct() {
    if (!ready || loadError || !session || !active) return;
    const testing = Date.now() < Date.parse(session.endsAt);
    if (testing && (!adminReleasePrincipal || adminReleasePrincipal !== getAdminPrincipal(Date.now()))) { revokeTesting(); return; }
    if (!saveDailySession({ ...session, answers: { ...answers } })) { saveError = true; return; }
    saveError = false; onOpenAbstinence({ sessionId: session.id, principal: testing ? adminReleasePrincipal : null });
  }
  function formatDate(value: string) { return new Intl.DateTimeFormat(ix === 1 ? 'en-GB' : 'vi-VN', { dateStyle: 'short', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)); }
  function focusStage(node: HTMLDivElement, initial: string) {
    let previous = initial; let disposed = false;
    return {
      async update(next: string) {
        if (next === previous) return;
        previous = next; await tick();
        if (!disposed) node.querySelector<HTMLElement>('h2,h3')?.focus();
      },
      destroy() { disposed = true; },
    };
  }
</script>

<div class="daily-observance" data-testid={`daily-${group}`} use:focusStage={stage}>
  <h2 tabindex="-1">{name}</h2>
  <p class="duration">{c.dailyDuration}</p>
  {#if loadError}<p class="error" role="alert">{c.loadError}</p><button type="button" onclick={onReload}>{c.tryAgain}</button>{/if}
  {#if saveError}<p class="error" role="alert">{c.saveError}</p>{/if}
  {#if active && session}
    {#if !reflecting || !canReflect}
      <section class="tracking" data-testid={`daily-${group}-tracking`}>
        <h3 tabindex="-1">{elapsed ? text.elapsed : text.tracking}</h3>
        <div class="countdown" style:--daily-progress={`${progress}%`}><strong role="timer" aria-live="off">{countdown}</strong></div>
        <dl><div><dt>{c.startedAt}</dt><dd>{formatDate(session.startsAt)}</dd></div><div><dt>{c.endsAt}</dt><dd>{formatDate(session.endsAt)}</dd></div></dl>
        <p>{text.wait}</p>{#if elapsed}<button class="primary" type="button" disabled={!ready || loadError} onclick={release}>{text.conclude}</button>{/if}
        {#if adminPrincipal && !elapsed}<button class="admin-testing" type="button" disabled={!ready || loadError} onclick={releaseForTesting}>{text.adminRelease}</button>{/if}
      </section>
    {:else}
      <section data-testid={`daily-${group}-reflection`}>
        <h3 tabindex="-1">{text.reflection}</h3><p>{text.reflectionBody}</p>
        {#if adminTesting}<p class="testing-notice" role="status">{text.testing}</p>{/if}
        <p class="shared-note">{c.combinedSharedNote}</p>
        {#each groups as reflectionGroup (reflectionGroup.id)}
          <details class="reflection-group" open data-testid={`reflection-${reflectionGroup.id}`}>
            <summary>{reflectionGroup.id === 'five' ? c.fiveSectionTitle : c.tenSectionTitle}</summary>
            {#each reflectionGroup.items as item (item.id)}
              <article class="precept-item"><h4 id={`daily-${reflectionGroup.id}-${item.id}`}>{item.title[ix]}</h4>
                {#if item.id === 'conduct'}
                  <p>{c.conductSourceNote}</p>
                  <p class="conduct-status" role="status">{conduct.error ? c.conductSourceError : effectiveConduct === 'kept' ? c.kept : effectiveConduct === 'review' ? c.review : c.conductPending}</p>
                  {#if elapsed || adminTesting}<button type="button" disabled={!ready || loadError} onclick={openConduct}>{c.openAbstinence}</button>{/if}
                {:else}
                  <fieldset aria-labelledby={`daily-${reflectionGroup.id}-${item.id}`} disabled={!ready || loadError}>
                    <legend>{c.recordHonestly}</legend>
                    {#each ['kept', 'review'] as answer (answer)}
                      <label class:selected={answers[item.id] === answer}><input type="radio" name={`${reflectionGroup.id}-${item.id}`} checked={answers[item.id] === answer} onchange={() => { draft = { ...draft, [item.id]: answer === 'kept' ? 'kept' : 'review' }; saveError = false; }} /><span>{answer === 'kept' ? c.kept : c.review}</span></label>
                    {/each}
                  </fieldset>{#if !answers[item.id]}<small>{c.unanswered}</small>{/if}
                {/if}
              </article>
            {/each}
          </details>
        {/each}
        {#if showMissing && missing.length}<div class="error" role="alert" data-testid="daily-missing-answers"><p>{completion.missingPrefix}</p><ul>{#each missing as item (item.id)}<li>{item.title[ix]}</li>{/each}</ul></div>{/if}
        {#if conductSourceError}<div class="error" role="alert"><p>{c.conductSourceError}</p><button type="button" onclick={() => { conductSourceError = false; onReload(); }}>{c.tryAgain}</button></div>{/if}
        <button class="primary" type="button" disabled={!ready || loadError || !canReflect} onclick={requestFinish}>{adminTesting ? text.testConfirm : text.confirm}</button>
      </section>
    {/if}
  {:else if (session?.status === 'ended' || session?.status === 'cancelled') && !preparingNext}
    <div data-testid={session.status === 'ended' ? `daily-${group}-completed` : `daily-${group}-testing-ended`}>
      <PreceptCompletion complete={resultComplete} title={resultComplete ? completion.title : completion.incompleteTitle} message={resultComplete ? session.status === 'cancelled' ? completion.testCongratulations : text.completed : completion.incompleteMessage} praiseLabel={completion.praise} dedicationLabel={completion.dedicationTitle} dedication={text.dedication} note={session.status === 'cancelled' ? completion.testNote : undefined} continueLabel={text.continue} {onContinue} />
      {#if !resultComplete}<ul data-testid="daily-unmet-precepts">{#each unmet as item (item.id)}<li>{item.title[ix]}</li>{/each}</ul>{/if}
    </div>
    <button type="button" onclick={() => { preparingNext = true; pledged = false; saveError = false; }}>{text.next}</button>
  {:else}
    <h3 tabindex="-1">{text.vow}</h3>
    <label class="pledge"><input type="checkbox" bind:checked={pledged} disabled={!ready || loadError} /><span>{text.pledge}</span></label>
    <button class="primary" type="button" disabled={!ready || loadError || !pledged} onclick={() => confirming = 'start'}>{text.vow}</button>
  {/if}

</div>
{#if conductPromptOpen}
  <div class="daily-confirmation daily-conduct-confirmation">
    <PracticeConfirmDialog open title={c.conductMissingTitle} description={`${c.conductMissingBody}\n\n${c.conductAnswersPreserved}`} cancelLabel={c.back} confirmLabel={c.conductMissingAction} onCancel={() => conductPromptOpen = false} onConfirm={confirmConductNavigation} />
  </div>
{/if}
{#if confirming}
  <div class="daily-confirmation">
  <PracticeConfirmDialog open title={confirming === 'start' ? text.vow : confirming === 'test' ? text.testConfirm : text.confirmTitle} description={confirming === 'start' ? text.startQuestion : confirming === 'test' ? text.testQuestion : text.finishQuestion} cancelLabel={c.back} confirmLabel={confirming === 'start' ? text.startConfirm : confirming === 'test' ? text.testAction : text.finishConfirm} onCancel={() => confirming = null} onConfirm={confirming === 'start' ? start : finish} />
  </div>
{/if}

<style>
  .daily-confirmation :global(.practice-confirm__dialog p){color:var(--text2);font-size:1em;text-align:justify}
  .daily-conduct-confirmation :global(.practice-confirm__dialog h2){white-space:pre-line;text-align:center;font-weight:700}
  .daily-observance,.tracking{display:grid;gap:var(--space-page);min-width:0;padding-top:var(--space-page)}h2,h3,h4{margin:0;text-align:center;font-weight:700;line-height:1.6}h2{font-size:1.4em}h3{font-size:1.2em}h4{font-size:1em}p{margin:0;text-align:justify;line-height:1.7}.duration{text-align:center;color:var(--text2)}
  .countdown{position:relative;display:grid;place-items:center;width:min(100%,calc(var(--space-page)*13));aspect-ratio:1;margin-inline:auto;border-radius:50%;background:radial-gradient(circle,var(--gold-light),transparent 70%)}.countdown::before{content:'';position:absolute;inset:0;border-radius:50%;background:conic-gradient(from -90deg,var(--gold) var(--daily-progress),var(--border2) 0);mask:radial-gradient(farthest-side,transparent calc(100% - 3px),#000 calc(100% - 2px))}.countdown strong{font-size:clamp(2rem,10vw,3rem);font-weight:400;font-variant-numeric:tabular-nums}
  dl{display:grid;gap:var(--radius-sm);margin:0;min-width:0}dl>div{display:flex;justify-content:space-between;gap:var(--radius-sm);line-height:1.7}dt{color:var(--text2)}dd{margin:0;text-align:end;overflow-wrap:anywhere}fieldset{border:0;padding:0;margin:0;min-width:0}legend,small{color:var(--text2);font-size:.85em}legend{margin-bottom:calc(var(--space-page)/4)}.precept-item{padding-block:var(--space-page);border-top:1px solid var(--border)}.precept-item h4{margin-bottom:calc(var(--space-page)/4)}
  label{display:flex;align-items:center;gap:calc(var(--space-page)/2);min-height:44px;padding:calc(var(--space-page)/2);margin-top:calc(var(--space-page)/4);border:1px solid var(--border);border-radius:var(--radius-control);line-height:1.6;cursor:pointer}label.selected{background:var(--gold-light);border-color:var(--gold)}input{accent-color:var(--gold);flex-shrink:0}.pledge{align-items:flex-start}fieldset:disabled label{opacity:.6;cursor:default}
  button{font:inherit;min-height:44px;min-width:0;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--card);color:var(--text);padding:calc(var(--space-page)/2);line-height:1.6;cursor:pointer}.primary{width:100%;background:var(--gold);border-color:var(--gold);color:var(--on-gold);font-weight:700}button:disabled{opacity:.5;cursor:default}.error{color:var(--danger-text)}button:focus-visible,summary:focus-visible,label:has(input:focus-visible){outline:2px solid var(--gold);outline-offset:2px}
  .reflection-group{border:1px solid var(--border);border-radius:var(--radius-card);padding:calc(var(--space-page)/2);margin-block:var(--space-page)}.reflection-group summary{text-align:center;font-weight:700;color:var(--brown)}.shared-note,.conduct-status{color:var(--text2)}
  summary{min-height:44px;align-content:center;cursor:pointer}
  .testing-notice{color:var(--brown);background:var(--gold-light);border:1px solid var(--border);border-radius:var(--radius-control);padding:calc(var(--space-page)/2);text-align:start}.admin-testing{justify-self:start}
</style>
