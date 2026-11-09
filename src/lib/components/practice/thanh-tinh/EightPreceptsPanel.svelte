<script lang="ts">
  import { recordPracticeParticipation } from '$lib/browser/practice-participation';
  import { onMount, tick } from 'svelte';
  import { ArrowRight, BookOpen, Flower2, Headphones } from '@lucide/svelte';
  import { getSessionContext } from '$lib/stores/session.svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { getPreceptPracticeCopy, getDailyPreceptPracticeCopy, getPreceptCompletionCopy } from '$lib/i18n/precept-practice-ui';
  import { EIGHT_PRECEPTS } from '$lib/content/precept-practice-content';
  import { EIGHT_PRECEPT_PREPARATION } from '$lib/content/eight-precept-benefits';
  import { EIGHT_PRECEPT_GUIDE_SECTIONS } from '$lib/content/eight-precept-guide';
  import { EIGHT_RECEIVING_RITE, EIGHT_RELINQUISHING_RITE } from '$lib/content/eight-precept-rite';
  import EightPreceptRite from './EightPreceptRite.svelte';
  import PracticeConfirmDialog from '../dialog/PracticeConfirmDialog.svelte';
  import PreceptCompletion from './PreceptCompletion.svelte';
  import { loadPreceptCompanion, saveEightSession } from '$lib/browser/precept-companion-storage';
  import { createBrowserId } from '$lib/browser/random-id';
  import type { EightSession, DayAnswers, Answer } from '$lib/domain/practice/precept-companion';
  let { view = $bindable<'prepare' | 'rite' | 'active' | 'reflection' | 'ended'>('prepare'), onOpenActivity, onReturnToPractice }: {
    view?: 'prepare' | 'rite' | 'active' | 'reflection' | 'ended';
    onOpenActivity?: (target: 'books' | 'talks' | 'practice') => void;
    onReturnToPractice?: () => void;
  } = $props();
  const locale = getLocaleContext();
  const identity = getSessionContext();
  const ix = $derived(locale.current === 'en' ? 1 : 0);
  const c = $derived(getPreceptPracticeCopy(locale.current === 'en'));
  const testingCopy = $derived(getDailyPreceptPracticeCopy(locale.current === 'en', c.tabEight));
  const completionCopy = $derived(getPreceptCompletionCopy(locale.current === 'en'));
  const reflectionLabels: Record<string, string> = $derived({
    life: c.eightLife,
    property: c.eightProperty,
    celibacy: c.eightCelibacy,
    speech: c.eightSpeech,
    sobriety: c.eightSobriety,
    meal: c.eightMeal,
    entertainment: c.eightEntertainment,
    bed: c.eightBed,
  });
  const guideGroups = $derived([
    { id: 'understanding', title: c.eightPreceptsTitle, sections: EIGHT_PRECEPT_GUIDE_SECTIONS.filter(section => ['meaning', 'eight-precepts', 'five-and-eight'].includes(section.id)) },
    { id: 'practice', title: c.eightPracticalTitle, sections: EIGHT_PRECEPT_GUIDE_SECTIONS.filter(section => ['observance-days', 'receiving-ceremony', 'clothing', 'duration-and-renewal', 'temple-sample', 'faq-food', 'faq-medicine', 'faq-meal-reason', 'faq-bathing', 'faq-phone'].includes(section.id)) },
    { id: 'merits', title: c.eightMeritsTitle, sections: EIGHT_PRECEPT_GUIDE_SECTIONS.filter(section => ['great-aspiration', 'merits', 'story-tree-spirit', 'story-king-udayana'].includes(section.id)) },
  ]);
  let session = $state<EightSession | null>(null);
  let answers = $state<DayAnswers>({});
  let acknowledged = $state(false);
  let guidanceAcknowledged = $state(false);
  let relinquishmentAcknowledged = $state(false);
  let ready = $state(false);
  let confirmingStart = $state(false);
  let confirmingFinish = $state(false);
  let confirmingCancel = $state(false);
  let testingCompleted = $state(false);
  let attemptedFinish = $state(false);
  const missingPrecepts = $derived(EIGHT_PRECEPTS.filter(item => answers[item.id] !== 'kept' && answers[item.id] !== 'review'));
  const reviewedPrecepts = $derived(EIGHT_PRECEPTS.filter(item => answers[item.id] === 'review'));
  const keptAll = $derived(missingPrecepts.length === 0 && reviewedPrecepts.length === 0);
  let loadError = $state(false);
  let saveError = $state(false);
  let savedMessage = $state(false);
  let now = $state(Date.now());
  let visible = $state(false);
  let adminReleasePrincipal = $state<string | null>(null);
  const elapsed = $derived(session !== null && now >= Date.parse(session.endsAt));
  const remainingSeconds = $derived(session ? Math.max(0, Math.ceil((Date.parse(session.endsAt) - now) / 1000)) : 0);
  const countdown = $derived([Math.floor(remainingSeconds / 3600), Math.floor(remainingSeconds / 60) % 60, remainingSeconds % 60].map(value => String(value).padStart(2, '0')).join(':'));
  const progress = $derived(session ? Math.min(100, Math.max(0, (now - Date.parse(session.startsAt)) / 86_400_000 * 100)) : 0);
  const adminPrincipal = $derived(getAdminPrincipal(now));
  const adminTesting = $derived(adminReleasePrincipal !== null && adminReleasePrincipal === adminPrincipal);
  const canRelinquish = $derived(elapsed || adminTesting);
  function getAdminPrincipal(at: number): string | null {
    const current = identity.value;
    const expiry = Date.parse(current.expiresAt ?? '');
    return current.authenticated && current.user?.role === 'admin' && current.user.id && (!Number.isFinite(expiry) || expiry > at) ? current.user.id : null;
  }
  $effect(() => {
    // Quyền thử chỉ thuộc tài khoản vừa bấm; không giữ lại sau khi mất quyền.
    if (adminReleasePrincipal !== null && adminReleasePrincipal !== adminPrincipal) {
      adminReleasePrincipal = null;
      relinquishmentAcknowledged = false;
      confirmingFinish = false;
    }
  });
  $effect(() => { if (view !== 'rite') confirmingStart = false; });
  $effect(() => { if (view !== 'reflection') confirmingFinish = false; });
  function releaseForTesting() {
    const principal = getAdminPrincipal(Date.now());
    if (!principal || !session || session.status !== 'active') return;
    adminReleasePrincipal = principal;
    relinquishmentAcknowledged = false;
    now = Date.now(); saveError = false; view = 'reflection';
  }
  function load() {
    const result = loadPreceptCompanion();
    loadError = result.error;
    ready = true;
    if (result.error) return;
    const active = result.state.sessions.find(item => item.status === 'active');
    if (active) { session = active; answers = { ...active.answers }; adminReleasePrincipal = null; view = 'active'; }
  }
  onMount(() => {
    load();
    const updateTime = () => { visible = document.visibilityState === 'visible'; now = Date.now(); };
    updateTime();
    window.addEventListener('focus', updateTime);
    document.addEventListener('visibilitychange', updateTime);
    return () => { window.removeEventListener('focus', updateTime); document.removeEventListener('visibilitychange', updateTime); };
  });
  $effect(() => {
    if (!visible || !session || session.status !== 'active') return;
    const remaining = Date.parse(session.endsAt) - now;
    if (remaining <= 0) return;
    const authExpiry = adminReleasePrincipal ? Date.parse(identity.value.expiresAt ?? '') : NaN;
    const nextBoundary = Number.isFinite(authExpiry) && authExpiry > now ? Math.min(remaining, authExpiry - now) : remaining;
    // Tính từ mốc đã lưu để không lệch khi vào nền; chỉ màn hình đồng hồ cập nhật mỗi giây.
    const timer = setTimeout(() => { now = Date.now(); }, view === 'active' ? Math.min(1000, nextBoundary) : nextBoundary);
    return () => clearTimeout(timer);
  });
  function start() {
    if (!confirmingStart || !ready || loadError || !guidanceAcknowledged || !acknowledged || session?.status === 'active') return;
    confirmingStart = false;
    try {
      const startTime = Date.now();
      const candidate: EightSession = { id: createBrowserId(), startsAt: new Date(startTime).toISOString(), endsAt: new Date(startTime + 86_400_000).toISOString(), status: 'active', answers: {}, templateId: 'bqt-home-guide-v1' };
      if (!saveEightSession(candidate)) { saveError = true; return; }
      recordPracticeParticipation('eight','started');
      session = candidate; answers = {}; adminReleasePrincipal = null; relinquishmentAcknowledged = false; now = startTime; saveError = false; view = 'active';
    } catch { saveError = true; }
  }
  function openReflection() {
    now = Date.now();
    if (!session || session.status !== 'active' || now < Date.parse(session.endsAt)) return;
    saveError = false; savedMessage = false; view = 'reflection';
  }
  function saveActiveReflection() {
    if (!ready || loadError || view !== 'reflection' || !session || session.status !== 'active') return;
    const candidate: EightSession = { ...session, answers: { ...answers }, status: 'active' };
    if (!saveEightSession(candidate)) { saveError = true; savedMessage = false; return; }
    recordPracticeParticipation('eight','recorded');
    session = candidate; saveError = false; savedMessage = true; view = 'active';
  }
  function requestFinish() {
    now = Date.now();
    const testingAllowed = adminReleasePrincipal !== null && adminReleasePrincipal === getAdminPrincipal(now);
    if (!session || session.status !== 'active' || (!testingAllowed && now < Date.parse(session.endsAt)) || !relinquishmentAcknowledged) return;
    attemptedFinish = true;
    if (missingPrecepts.length > 0) return;
    confirmingFinish = true;
  }
  function finish(early = false) {
    if (!session || session.status !== 'active') return;
    if (early ? !confirmingCancel : !confirmingFinish) return;
    confirmingFinish = false; confirmingCancel = false;
    const finishedAt = Date.now();
    now = finishedAt;
    const pastEnd = finishedAt >= Date.parse(session.endsAt);
    const testingAllowed = adminReleasePrincipal !== null && adminReleasePrincipal === getAdminPrincipal(finishedAt);
    // Kiểm tra lại giờ thực tại lúc bấm, không chỉ dựa vào trạng thái của nút.
    if (!early && ((!pastEnd && !testingAllowed) || !relinquishmentAcknowledged)) return;
    if (!early) {
      attemptedFinish = true;
      if (missingPrecepts.length > 0) return;
    }
    const candidate: EightSession = { ...session, status: early || !pastEnd ? 'cancelled' : 'ended', answers: { ...answers } };
    if (!saveEightSession(candidate)) { saveError = true; return; }
    recordPracticeParticipation('eight',candidate.status === 'ended' ? 'completed' : 'recorded');
    testingCompleted = !early && !pastEnd && testingAllowed;
    session = candidate; adminReleasePrincipal = null; saveError = false; view = 'ended';
  }
  function formatDate(value: string) { return new Intl.DateTimeFormat(locale.current === 'en' ? 'en-GB' : 'vi-VN', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Ho_Chi_Minh' }).format(new Date(value)); }
  function choose(id: string, answer: Answer) { answers = { ...answers, [id]: answer }; }
  function next() { if (ready && !loadError && guidanceAcknowledged) { saveError = false; view = 'rite'; } }
  function fresh() { session = null; answers = {}; adminReleasePrincipal = null; testingCompleted = false; attemptedFinish = false; acknowledged = false; guidanceAcknowledged = false; relinquishmentAcknowledged = false; saveError = false; savedMessage = false; view = 'prepare'; }
  function focusStage(node: HTMLDivElement, initial: string) {
    let previous = initial;
    let disposed = false;
    return {
      async update(stage: string) {
        if (stage === previous) return;
        previous = stage;
        await tick();
        if (disposed) return;
        // Mỗi bước dài cần bắt đầu từ đầu và chuyển focus khỏi nút vừa bị tháo.
        node.querySelector<HTMLHeadingElement>('h2')?.focus({ preventScroll: true });
        node.closest('dialog')?.scrollTo({ top: 0 });
      },
      destroy() { disposed = true; },
    };
  }
</script>

<div class="eight-panel" class:eight-observing={view === 'active'} data-testid={'eight-' + view} use:focusStage={view}>
  {#if view === 'prepare' || view === 'rite'}
  <ol class="eight-stages" aria-label={c.eightStages}>
    <li aria-current={view === 'prepare' ? 'step' : undefined}>{c.eightGuidanceStep}</li>
    <li aria-current={view === 'rite' ? 'step' : undefined}>{c.eightRiteStep}</li>
    <li aria-current={view !== 'prepare' && view !== 'rite' ? 'step' : undefined}>{c.eightObservanceStep}</li>
  </ol>
  {/if}
  {#if loadError}<p role="alert">{c.loadError}</p><button onclick={load}>{c.tryAgain}</button>{/if}
  {#if saveError}<p role="alert">{c.saveError}</p>{/if}
  {#if savedMessage && !saveError}<p role="status">{c.saveSuccess}</p>{/if}
  {#if view === 'prepare'}
    <h2 tabindex="-1">{c.eightPrepareTitle}</h2>
    <div class="eight-reading-sheet eight-benefits">
      {#each EIGHT_PRECEPT_PREPARATION as paragraph, index (index)}<p>{paragraph[ix]}</p>{/each}
    </div>
    {#each guideGroups as group (group.id)}
      <details class="eight-guide-group">
        <summary><span class="eight-guide-label">{group.title}</span></summary>
        <div class="eight-group-content eight-guide-sections">
          {#each group.sections as section (section.id)}
            <details>
              <summary><span class="eight-guide-label">{section.title[ix]}</span></summary>
              <EightPreceptRite blocks={section.blocks} language={ix} />
            </details>
          {/each}
        </div>
      </details>
    {/each}
    <p class="note">{c.eightRecordingNote}</p>
    <div class="eight-actions">
    <label class="confirmation"><input type="checkbox" bind:checked={guidanceAcknowledged} /> <span>{c.eightGuidanceConfirmation}</span></label>
    <button class="primary" disabled={!ready || loadError || !guidanceAcknowledged} onclick={next}>{c.next}</button>
    </div>
  {:else if view === 'rite'}
    <h2 tabindex="-1">{c.eightRiteTitle}</h2>
    <div class="eight-reading-sheet">
      <p class="note eight-rite-introduction">{c.eightRiteSummary}</p>
      <EightPreceptRite blocks={EIGHT_RECEIVING_RITE} language={ix} />
    </div>
    <div class="eight-actions">
    <label class="confirmation"><input type="checkbox" bind:checked={acknowledged} /> <span>{c.voluntaryConfirmation}</span></label>
    <p class="note">{c.eightRecordingNote}</p>
    <button class="primary" disabled={!ready || loadError || !guidanceAcknowledged || !acknowledged} onclick={() => { confirmingStart = true; }}>{c.eightStartRecord}</button>
    </div>
  {:else if session}
    {#if view === 'active'}
      <div class="eight-countdown-heading">
        <p class="eight-eyebrow">{c.eightCountdownEyebrow}</p>
        <h2 tabindex="-1">{c.eightCountdownTitle}</h2>
        <p class="eight-countdown-status"><span aria-hidden="true"></span>{elapsed ? c.eightCountdownExpired : c.eightCountdownActive}</p>
      </div>
      <div class="eight-countdown-dial" style:--eight-progress={`${progress}%`}>
        <div class="eight-countdown-ring" aria-hidden="true"></div>
        <div class="eight-countdown-face">
          <strong class="eight-countdown-time" data-testid="eight-countdown" role="timer" aria-live="off" aria-label={c.eightCountdownRemaining}>{countdown}</strong>
          <div class="eight-countdown-units" aria-hidden="true"><span>{c.eightHours}</span><span>{c.eightMinutes}</span><span>{c.eightSeconds}</span></div>
          <span class="eight-countdown-caption">{elapsed ? c.eightCountdownElapsed : c.eightCountdownRemaining}</span>
        </div>
      </div>
      <dl class="eight-countdown-dates"><div><dt>{c.startedAt}</dt><dd>{formatDate(session.startsAt)}</dd></div><div><dt>{c.endsAt}</dt><dd>{formatDate(session.endsAt)}</dd></div></dl>
      <p class="eight-countdown-message">{elapsed ? c.eightElapsedNote : c.eightCountdownMessage}</p>
      {#if elapsed}<button class="primary eight-countdown-review" onclick={openReflection}>{c.eightReviewAction}<ArrowRight size={16} aria-hidden="true" /></button>{/if}
      {#if onOpenActivity}<div class="activities eight-countdown-activities"><button onclick={() => onOpenActivity?.('books')}><BookOpen size={18} aria-hidden="true" />{c.openBooks}</button><button onclick={() => onOpenActivity?.('talks')}><Headphones size={18} aria-hidden="true" />{c.openTalks}</button><button onclick={() => onOpenActivity?.('practice')}><Flower2 size={18} aria-hidden="true" />{c.openPractice}</button></div>{/if}
      {#if adminPrincipal && !elapsed}<div class="eight-admin-release"><button onclick={releaseForTesting}>{c.eightAdminRelease}</button><p>{c.eightAdminReleaseNote}</p></div>{/if}
      {#if !elapsed}<button onclick={() => { confirmingCancel = true; }}>{c.eightCancelTracking}</button>{/if}
    {:else}
    {#if !testingCompleted && (view === 'reflection' || session.status !== 'ended' || !elapsed)}
      <h2 tabindex="-1">{view === 'reflection' ? c.eightReflectionTitle : c.eightEndedTitle}</h2>
      <dl><dt>{c.startedAt}</dt><dd>{formatDate(session.startsAt)}</dd><dt>{c.endsAt}</dt><dd>{formatDate(session.endsAt)}</dd></dl>
    {/if}
    {#if view === 'reflection'}
      {#if adminTesting && !elapsed}<aside role="status">{c.eightAdminTesting}<p>{c.eightAdminReleaseNote}</p></aside>{/if}
      <p>{c.recordHonestly}</p>
      {#each EIGHT_PRECEPTS as item (item.id)}
        <fieldset><legend>{reflectionLabels[item.id]}</legend><div class="answers">{#each ['kept', 'review'] as answer (answer)}<label class:selected={answers[item.id] === answer}><input type="radio" name={'eight-' + item.id} checked={answers[item.id] === answer} onchange={() => choose(item.id, answer as Answer)} /><span>{answer === 'kept' ? c.kept : c.review}</span></label>{/each}</div></fieldset>
      {/each}

      <button class="primary" onclick={saveActiveReflection}>{c.saveChanges}</button>
      {#if attemptedFinish && missingPrecepts.length > 0}
        <aside role="alert" data-testid="eight-missing-answers"><p>{completionCopy.missingPrefix}</p><ul>{#each missingPrecepts as item (item.id)}<li>{reflectionLabels[item.id]}</li>{/each}</ul></aside>
      {/if}

      {#if canRelinquish}
        <details open data-testid="eight-relinquishment">
          <summary>{c.eightRelinquishingTitle}</summary>
          <p class="note eight-rite-introduction">{c.eightRelinquishingRequired}</p>
          <EightPreceptRite blocks={EIGHT_RELINQUISHING_RITE} language={ix} />
          <div class="eight-actions">
            <label class="confirmation"><input type="checkbox" bind:checked={relinquishmentAcknowledged} /><span>{c.eightRelinquishingConfirmation}</span></label>
          </div>
        </details>
      {/if}
      {#if !canRelinquish}<aside>{c.eightWaitToFinish}</aside>{/if}
      <button class="primary" disabled={!canRelinquish || !relinquishmentAcknowledged} onclick={requestFinish}>{c.eightFinish}</button>
      {#if !elapsed}
        <aside>{c.eightCancelConfirm}</aside>
        <button onclick={() => { confirmingCancel = true; }}>{c.eightCancelTracking}</button>
      {/if}
    {:else}
      {#if (session.status === 'ended' && elapsed) || testingCompleted}
        <section data-testid={keptAll ? testingCompleted ? 'eight-testing-completed' : 'eight-completed' : 'eight-incomplete'}>
          <PreceptCompletion complete={keptAll} title={keptAll ? completionCopy.title : completionCopy.incompleteTitle} message={keptAll ? testingCompleted ? completionCopy.testCongratulations : c.eightCompletedNote : completionCopy.incompleteMessage} praiseLabel={completionCopy.praise} dedicationLabel={completionCopy.dedicationTitle} note={testingCompleted ? completionCopy.testNote : undefined} dedication={c.eightDedication} continueLabel={onReturnToPractice ? c.eightReturnToPractice : c.eightNewSession} onContinue={onReturnToPractice ?? fresh} />
          {#if !keptAll}<ul data-testid="eight-reviewed-precepts">{#each reviewedPrecepts as item (item.id)}<li>{reflectionLabels[item.id]}</li>{/each}</ul>{/if}
        </section>
      {/if}
      <p>{c.noAttainmentNote}</p>
      <button class="primary" onclick={fresh}>{c.eightNewSession}</button>
    {/if}
    {/if}
  {/if}
  <p class="note" class:eight-countdown-storage={view === 'active'}>{c.localDeviceNote}</p>
</div>

<div class="precept-confirmation">
{#if confirmingStart && view === 'rite'}
  <PracticeConfirmDialog open={confirmingStart} title={c.eightStartConfirmTitle} description={c.eightStartConfirmBody} cancelLabel={c.eightStartCancel} confirmLabel={c.eightStartConfirmAction} onCancel={() => { confirmingStart = false; }} onConfirm={start} />
{/if}
{#if confirmingFinish && view === 'reflection'}
  <PracticeConfirmDialog open={confirmingFinish} title={adminTesting && !elapsed ? testingCopy.testConfirm : c.eightFinishConfirmTitle} description={adminTesting && !elapsed ? testingCopy.testQuestion : c.eightFinishConfirmBody} cancelLabel={c.back} confirmLabel={adminTesting && !elapsed ? testingCopy.testAction : c.eightFinishConfirmAction} onCancel={() => { confirmingFinish = false; }} onConfirm={() => finish()} />
{/if}
{#if confirmingCancel && session?.status === 'active'}
  <PracticeConfirmDialog open={confirmingCancel} title={c.eightCancelTracking} description={c.eightCancelConfirm} cancelLabel={c.back} confirmLabel={c.eightFinishConfirmAction} onCancel={() => { confirmingCancel = false; }} onConfirm={() => finish(true)} />
{/if}
</div>

<style>
  .precept-confirmation :global(.practice-confirm__dialog p) { color: var(--text2); font-size: 1em; text-align: justify; }
  .eight-panel { display: grid; gap: var(--radius-card); }
  .eight-observing { max-width: calc(var(--space-page) * 23); margin-inline: auto; padding-top: var(--radius-card); gap: var(--space-page); }
  .eight-countdown-heading { display: grid; gap: var(--radius-sm); text-align: center; }
  .eight-countdown-heading h2 { font-size: clamp(1.25rem, 5vw, 1.6rem); font-weight: 600; letter-spacing: -.025em; }
  .eight-countdown-heading h2:focus { outline: none; }
  .eight-eyebrow { text-align: center; text-transform: uppercase; letter-spacing: .15em; font-size:var(--font-size-meta); color: var(--text2); }
  .eight-countdown-status { display: flex; align-items: center; justify-content: center; gap: var(--radius-sm); color: var(--text2); font-size:var(--font-size-meta); }
  .eight-countdown-status span { width: var(--radius-sm); height: var(--radius-sm); border-radius: 50%; background: var(--gold); }
  .eight-countdown-dial { position: relative; width: min(100%, calc(var(--space-page) * 14.2)); aspect-ratio: 1; margin: var(--radius-sm) auto; display: grid; place-items: center; border-radius: 50%; background: radial-gradient(circle, var(--gold-light), transparent 70%); }
  .eight-countdown-ring { position: absolute; inset: 0; border-radius: 50%; background: conic-gradient(from -90deg, var(--gold) var(--eight-progress), var(--border2) 0); mask: radial-gradient(farthest-side, transparent calc(100% - 3px), #000 calc(100% - 2px)); }
  .eight-countdown-face { display: grid; justify-items: center; width: 100%; padding: var(--radius-control); }
  .eight-countdown-time { font-size: clamp(2.25rem, 12vw, 3rem); font-weight: 400; line-height: 1.2; letter-spacing: -.045em; font-variant-numeric: tabular-nums; }
  .eight-countdown-units { display: grid; grid-template-columns: repeat(3, 1fr); width: min(100%, calc(var(--space-page) * 11)); margin-top: var(--radius-sm); font-size:var(--font-size-meta); color: var(--text2); text-align: center; }
  .eight-countdown-caption { margin-top: var(--space-page); color: var(--text2); text-transform: uppercase; letter-spacing: .12em; font-size:var(--font-size-meta); }
  dl.eight-countdown-dates { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 0; border: 0; border-radius: 0; padding: 0; background: transparent; text-align: center; font-size:var(--font-size-meta); }
  .eight-countdown-dates > div { display: grid; align-content: start; gap: var(--radius-sm); padding-inline: var(--radius-sm); }
  .eight-countdown-dates > div + div { border-left: 1px solid var(--border); }
  .eight-countdown-dates dt { font-size:var(--font-size-meta); color: var(--text2); }
  .eight-countdown-message { max-width: calc(var(--space-page) * 17); margin-inline: auto; text-align: center; font-family: var(--font-reader); font-style: italic; font-size: .9375rem; font-weight: 400; color: var(--text2); }
  button.eight-countdown-review { display: flex; align-items: center; justify-content: center; gap: var(--radius-sm); font-size:var(--font-size-label); }
  .activities.eight-countdown-activities { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--radius-sm); }
  .eight-countdown-activities button { display: flex; flex-direction: column; align-items: center; justify-content: center; gap: var(--radius-sm); min-width: 0; padding: var(--radius-sm); border: 0; background: transparent; color: var(--text2); font-size:var(--font-size-label); }
  .eight-admin-release { display: grid; gap: var(--radius-sm); border-top: 1px solid var(--border); padding-top: var(--radius-control); }
  .eight-admin-release button { justify-self: start; padding: var(--radius-sm) var(--radius-control); background: transparent; font-size:var(--font-size-label); }
  .eight-admin-release p, .eight-countdown-storage { color: var(--text2); font-size:var(--font-size-meta); line-height: 1.6; }
  .note.eight-countdown-storage { text-align: center; font-size:var(--font-size-meta); }
  .eight-stages { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: var(--radius-sm); margin: 0; padding: 0 0 var(--radius-control); list-style: none; counter-reset: stage; border-bottom: 1px solid var(--border); color: var(--muted); font-size: .875em; line-height: 1.7; }
  .eight-stages li { display: grid; justify-items: center; align-content: start; gap: var(--radius-sm); text-align: center; counter-increment: stage; }
  .eight-stages li::before { content: counter(stage); display: grid; place-items: center; width: calc(var(--radius-card) * 2); height: calc(var(--radius-card) * 2); border-radius: 50%; background: var(--bg2); color: var(--text2); font-weight: 700; }
  .eight-stages [aria-current='step']::before { background: var(--gold); color: var(--on-gold); }
  .eight-stages [aria-current='step'] { color: var(--text); font-weight: 700; }
  .eight-benefits { display: grid; gap: var(--radius-card); font-family: var(--font-reader); }
  .eight-reading-sheet { min-width: 0; padding: var(--radius-control); border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--card); }
  .eight-guide-group { padding: 0; overflow: hidden; }
  .eight-guide-group > summary { padding: var(--radius-control) var(--space-page); background: var(--gold-light); color: var(--brown-dark); font-weight: 700; }
  .eight-guide-group[open] > summary { border-bottom: 1px solid var(--border); color: var(--brown-dark); }
  .eight-group-content { margin-inline-start: var(--space-page); padding: calc(var(--space-page) / 2) var(--radius-control); border-inline-start: 2px solid var(--border); }
  .eight-guide-sections { display: grid; gap: var(--radius-control); font-family: var(--font-reader); }
  .eight-guide-sections > details { padding: 0; border: 0; border-radius: 0; background: transparent; }
  .eight-guide-sections > details + details { border-top: 1px solid var(--border); padding-top: var(--radius-sm); }
  .eight-guide-sections > details > summary { margin-bottom: var(--radius-sm); }
  .eight-guide-group > summary, .eight-guide-sections > details > summary { display: grid; grid-template-columns: 1em minmax(0, 1fr); align-items: center; gap: var(--radius-sm); list-style: none; }
  .eight-guide-group > summary::-webkit-details-marker, .eight-guide-sections > details > summary::-webkit-details-marker { display: none; }
  .eight-guide-group > summary::before, .eight-guide-sections > details > summary::before { content: ''; width: .5em; height: .5em; border-right: 2px solid currentColor; border-bottom: 2px solid currentColor; transform: rotate(-45deg); }
  .eight-guide-group[open] > summary::before, .eight-guide-sections > details[open] > summary::before { transform: rotate(45deg); }
  .eight-guide-group > summary { grid-template-columns: minmax(0, 1fr) 1em; }
  .eight-guide-group > summary::before { grid-column: 2; grid-row: 1; }
  .eight-guide-group > summary > .eight-guide-label { grid-column: 1; grid-row: 1; }
  .eight-guide-group > summary:focus-visible { outline-offset: -2px; }
  .eight-guide-label { min-width: 0; overflow-wrap: anywhere; }
  .eight-actions { display: grid; gap: var(--radius-control); padding: var(--radius-control); border: 1px solid var(--gold-muted); border-radius: var(--radius-card); background: var(--gold-light); }
  .eight-actions .confirmation { align-items: flex-start; gap: var(--radius-control); line-height: 1.7; }
  .eight-actions input { margin-top: var(--radius-sm); width: var(--space-page); height: var(--space-page); }
  .eight-rite-introduction { padding-bottom: var(--space-page); margin-bottom: var(--space-page); border-bottom: 1px solid var(--border); }
  h2 { text-align: center; margin: 0; font-weight: 700; overflow-wrap: anywhere; font-size: 1.2em; }
  p { margin: 0; text-align: justify; line-height: 1.7; }
  aside, details, fieldset, dl { margin: 0; border: 1px solid var(--border); border-radius: var(--radius-control); padding: var(--radius-control); background: var(--card); }
  aside, .note { color: var(--text2); line-height: 1.7; text-align: justify; } .note { font-size: .875em; }
  summary { min-height: 44px; display: list-item; align-content: center; cursor: pointer; font-weight: 600; }
  button { min-height: 44px; border: 1px solid var(--border2); border-radius: var(--radius-control); padding: var(--radius-control); background: var(--card); color: var(--text); font: inherit; cursor: pointer; }
  button.primary { background: var(--gold); color: var(--on-gold); font-weight: 700; border-color: var(--gold); }
  button:disabled { opacity: .5; cursor: default; }
  button:focus-visible, input:focus-visible, summary:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
  label { display: flex; align-items: center; gap: var(--radius-sm); min-height: 44px; cursor: pointer; }
  input { accent-color: var(--gold); flex-shrink: 0; }
  .activities, .answers { display: flex; flex-wrap: wrap; gap: var(--radius-control); }
  .activities button { flex: 1; }
  .answers { margin-top: var(--radius-sm); }
  .answers label { flex: 1; min-width: max-content; padding: var(--radius-sm) var(--radius-control); border: 1px solid var(--border); border-radius: var(--radius-control); }
  .answers label.selected { border-color: var(--gold); background: var(--gold-light); }
  legend { font-weight: 600; max-width: 100%; }
  dl { display: grid; grid-template-columns: auto 1fr; gap: var(--radius-sm); }
  dt { color: var(--text2); } dd { margin: 0; overflow-wrap: anywhere; }
</style>




