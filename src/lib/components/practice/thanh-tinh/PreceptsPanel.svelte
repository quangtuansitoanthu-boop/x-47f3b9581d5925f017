<script lang="ts">
  import { onMount, untrack } from 'svelte';
  import { ChevronDown } from '@lucide/svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { FIVE_PRECEPTS, TEN_PRECEPTS, FIVE_PRECEPT_GUIDE } from '$lib/content/precept-practice-content';
  import { getPreceptPracticeCopy } from '$lib/i18n/precept-practice-ui';
  import { getCompanionDay, loadPreceptCompanion } from '$lib/browser/precept-companion-storage';
  import { loadPreceptRecords } from '$lib/browser/precept-storage';
  import { FIVE_IDS, type CompanionDay, type CompanionGroup, type DailySession } from '$lib/domain/practice/precept-companion';
  import { getVietnamIsoDate } from '$lib/domain/practice/stats';
  import DailyPreceptObservance from './DailyPreceptObservance.svelte';

  let {
    onOpenAbstinence,
    onOpenAudio,
    view = $bindable<'overview' | 'precepts' | 'progress' | 'reflection'>('overview'),
    returnView = $bindable<'overview' | 'precepts' | 'progress'>('overview'),
    onReturnToPractice,
    resumeReflection = false,
    resumeTestingPrincipal = null,
    testingConductConfirmed = false,
    testingConductAnswer,
  }: {
    onOpenAbstinence: (options: { sessionId: string; principal: string | null }) => void;
    onOpenAudio?: () => void;
    view?: 'overview' | 'precepts' | 'progress' | 'reflection';
    returnView?: 'overview' | 'precepts' | 'progress';
    onReturnToPractice?: () => void;
    resumeReflection?: boolean;
    resumeTestingPrincipal?: string | null;
    testingConductConfirmed?: boolean;
    testingConductAnswer?: 'kept' | 'review';
  } = $props();
  const locale = getLocaleContext();
  const ix = $derived(locale.current === 'en' ? 1 : 0);
  const copy = $derived(getPreceptPracticeCopy(locale.current === 'en'));
  const groups = [{ id: 'five', items: FIVE_PRECEPTS }, { id: 'ten', items: TEN_PRECEPTS }] as const;
  let today = $state(getVietnamIsoDate(new Date()));
  let session = $state<DailySession | null>(null);
  let legacySessions = $state<DailySession[]>([]);
  let history = $state<Record<CompanionGroup, CompanionDay[]>>({ five: [], ten: [] });
  let derivedConduct = $state({ five: false, ten: false });
  let loadErrors = $state({ five: false, ten: false });
  let activeTab = $state<'guidance' | 'observance'>(untrack(() => resumeReflection) ? 'observance' : 'guidance');
  let expanded = $state({ five: true, ten: false });
  let ready = $state(false);
  let now = $state(Date.now());
  const displayDate = $derived(getVietnamIsoDate(new Date(now)));
  let visible = $state(false);
  let dailyObservance = $state<{ handleBack: () => boolean }>();
  export function handleBack(): boolean { return activeTab === 'observance' && (dailyObservance?.handleBack() ?? false); }

  function navigateTabs(event: KeyboardEvent) {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault();
    activeTab = event.key === 'Home' ? 'guidance' : event.key === 'End' ? 'observance'
      : activeTab === 'guidance' ? 'observance' : 'guidance';
    now = Date.now();
    const button = event.currentTarget as HTMLButtonElement;
    button.parentElement?.querySelector<HTMLButtonElement>(`#precepts-${activeTab}-tab`)?.focus();
  }

  function load() {
    now = Date.now(); today = getVietnamIsoDate(new Date(now));
    const result = loadPreceptCompanion();
    const previous = loadPreceptRecords();
    if (!result.error) {
      const rows = result.state.dailySessions?.filter(item => item.group === 'combined') ?? [];
      session = rows.find(item => item.status === 'active') ?? rows[rows.length - 1] ?? null;
      legacySessions = result.state.dailySessions?.filter(item => item.group !== 'combined') ?? [];
    }
    for (const group of groups) {
      loadErrors[group.id] = result.error || (group.id === 'five' && previous.error);
      if (result.error) continue;
      const days = new Map<string, CompanionDay>();
      if (group.id === 'five') for (const day of previous.records) {
        days.set(day.date, { group: 'five', date: day.date, answers: Object.fromEntries(FIVE_IDS.map((id, index) => [id, day.answers[index]])) });
      }
      for (const day of result.state.days.filter(item => item.group === group.id)) days.set(day.date, { ...day, answers: { ...days.get(day.date)?.answers, ...day.answers } });
      const current = getCompanionDay(group.id, today);
      derivedConduct[group.id] = current.derivedConduct;
      if (!current.error && Object.keys(current.answers).length) days.set(today, { group: group.id, date: today, answers: current.answers });
      history[group.id] = [...days.values()].sort((a, b) => b.date.localeCompare(a.date));
    }
    ready = true;
  }
  onMount(() => {
    visible = document.visibilityState === 'visible'; load();
    const onVisible = () => { visible = document.visibilityState === 'visible'; if (visible) load(); };
    window.addEventListener('focus', load);
    window.addEventListener('storage', load);
    window.addEventListener('tutam:thanh-tinh-saved', load);
    window.addEventListener('tutam:precept-companion-saved', load);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', load);
      window.removeEventListener('storage', load);
      window.removeEventListener('tutam:thanh-tinh-saved', load);
      window.removeEventListener('tutam:precept-companion-saved', load);
      document.removeEventListener('visibilitychange', onVisible);
    };
  });
  $effect(() => {
    if (!ready || !visible || activeTab !== 'observance') return;
    if (session?.status !== 'active' || Date.parse(session.endsAt) <= now) return;
    const timer = setTimeout(() => now = Date.now(), Math.min(1000, Date.parse(session.endsAt) - now));
    return () => clearTimeout(timer);
  });
  function returnToPractice() { if (onReturnToPractice) onReturnToPractice(); else activeTab = 'guidance'; }
</script>

<section class="precepts-panel" aria-label={copy.tabDaily}>
  <div class="precept-tabs" role="tablist" aria-label={copy.featureTitle}>
    {#each ['guidance', 'observance'] as tab (tab)}
      <button type="button" role="tab" id={`precepts-${tab}-tab`} aria-controls={`precepts-${tab}-panel`} aria-selected={activeTab === tab} tabindex={activeTab === tab ? 0 : -1} onclick={() => { activeTab = tab === 'guidance' ? 'guidance' : 'observance'; now = Date.now(); }} onkeydown={navigateTabs}>{tab === 'guidance' ? copy.guidanceTab : copy.observanceTab}</button>
    {/each}
  </div>
  <div class="intro">{#if activeTab === 'observance'}<p class="date">{displayDate.split('-').reverse().join('/')}</p>{/if}<h2>{activeTab === 'guidance' ? copy.guidanceTab : copy.observanceTab}</h2><p>{activeTab === 'guidance' ? copy.guidanceIntro : copy.observanceIntro}</p></div>
  {#each ['guidance', 'observance'] as tab (tab)}
  <div id={`precepts-${tab}-panel`} role="tabpanel" aria-labelledby={`precepts-${tab}-tab`} hidden={activeTab !== tab}>
  {#if tab === 'guidance'}
  {#each groups as group (group.id)}
    <details class="precept-group" bind:open={expanded[group.id]}>
      <summary class="group-heading"><span class="group-title"><strong>{group.id === 'five' ? copy.fiveSectionTitle : copy.tenSectionTitle}</strong></span><ChevronDown class="chevron" size={20} aria-hidden="true" /></summary>
      <div class="group-content">
        <p>{group.id === 'five' ? copy.fiveDescription : copy.tenDescription}</p>
        {#if group.id === 'five'}
          <details class="guidance teaching">
            <summary><span>{copy.preceptFoundations}</span><ChevronDown size={16} aria-hidden="true" /></summary>
            {#each FIVE_PRECEPT_GUIDE as section (section.id)}
              <section class="teaching-section">
                <h3>{section.title[ix]}</h3>
                {#each section.paragraphs as paragraph (paragraph[0])}<p>{paragraph[ix]}</p>{/each}
              </section>
            {/each}
          </details>
        {/if}
        {#each group.items as item (item.id)}
          <article class="precept-item">
            <h3 id={`precept-${tab}-${group.id}-${item.id}`}>{item.title[ix]}</h3>
            <p class="item-summary">{item.summary[ix]}</p>
            <details class="guidance" open><summary>{copy.readGuidance}<ChevronDown size={16} aria-hidden="true" /></summary><ul>{#each item.tasks as task (task[0])}<li>{task[ix]}</li>{/each}</ul></details>
          </article>
        {/each}
      </div>
    </details>
  {/each}
  {:else}
    <DailyPreceptObservance bind:this={dailyObservance} group="combined" {session} {ready} loadError={loadErrors.five || loadErrors.ten} {now} {resumeReflection} {resumeTestingPrincipal} {testingConductConfirmed} {testingConductAnswer} {onOpenAbstinence} onReload={load} onContinue={returnToPractice} />
    {#if history.five.length || history.ten.length || legacySessions.length}
      <details class="legacy-records"><summary>{copy.legacySessionsTitle}</summary>
        {#each groups as group (group.id)}
          <details data-testid={`history-${group.id}`} open><summary>{group.id === 'five' ? copy.fiveSectionTitle : copy.tenSectionTitle}</summary>
            <div data-testid={`legacy-sessions-${group.id}`}>
            {#each legacySessions.filter(row => row.group === group.id) as row (row.id)}
              <article class="precept-item"><p>{row.startsAt} → {row.endsAt}</p><p>{row.status === 'active' ? copy.legacyActive : row.status === 'ended' ? copy.legacyEnded : copy.legacyCancelled}</p>
                <dl>{#each group.items as item (item.id)}<div><dt>{item.title[ix]}</dt><dd>{row.answers[item.id] === 'kept' ? copy.kept : row.answers[item.id] === 'review' ? copy.review : copy.unanswered}</dd></div>{/each}</dl>
              </article>
            {/each}
            </div>
            {#each history[group.id] as day (day.date)}
              <article class="precept-item"><h3>{day.date.split('-').reverse().join('/')}</h3><dl>{#each group.items as item (item.id)}<div><dt>{item.title[ix]}</dt><dd>{day.answers[item.id] === 'kept' ? copy.kept : day.answers[item.id] === 'review' ? copy.review : copy.unanswered}{#if item.id === 'conduct' && day.date === today && derivedConduct[group.id]}<small class="source-badge">{copy.autoConductBadge}</small>{/if}</dd></div>{/each}</dl></article>
            {/each}
          </details>
        {/each}
      </details>
    {/if}
  {/if}
  </div>
  {/each}
  {#if activeTab === 'observance'}
  <p class="footnote">{copy.historySeparateNote}</p><p class="footnote">{copy.noAttainmentNote} {copy.localOnly}</p>
  {/if}
</section>

<style>
  .precepts-panel{color:var(--text);font-family:var(--font-app);max-width:var(--practice-dialog-width);margin:auto;min-width:0}
  .group-content,.intro p,.footnote{font-family:var(--font-reader)}
  .intro{text-align:center;margin-bottom:var(--space-page)}.intro h2{color:var(--brown);margin:calc(var(--space-page)/2) 0;font-size:1.4em}
  h2,h3{font-weight:700;text-align:center}p,li{text-align:justify}p{line-height:1.7;margin:calc(var(--space-page)/2) 0}.date,.footnote,.item-summary{color:var(--text2)}.date,.footnote{font-size:.85em}.date{text-align:center}
  .precept-tabs{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:calc(var(--space-page)/4);padding:calc(var(--space-page)/4);background:var(--bg2);border:1px solid var(--border);border-radius:var(--radius-card)}
  .precept-tabs button{min-width:0;border-color:transparent;background:transparent;font-weight:600}.precept-tabs button[aria-selected="true"]{background:var(--gold-light);border-color:var(--gold);color:var(--brown)}
  .precept-group{border:1px solid var(--border);border-radius:var(--radius-card);background:var(--card);margin:var(--space-page) 0;overflow:hidden}
  summary{cursor:pointer;list-style:none;min-height:44px}summary::-webkit-details-marker{display:none}
  .group-heading{display:grid;grid-template-columns:20px minmax(0,1fr) 20px;align-items:center;gap:calc(var(--space-page)/2);padding:var(--space-page);background:var(--gold-light)}
  .group-title{display:flex;grid-column:2;min-width:0;flex-direction:column;gap:calc(var(--space-page)/4)}.group-title strong{font-size:1.1em;font-weight:700;text-align:center}.precept-group[open]>.group-heading :global(.chevron){transform:rotate(180deg)}
  .group-content{padding:0 var(--space-page) var(--space-page)}.precept-item{padding:var(--space-page) 0;border-top:1px solid var(--border)}h3{font-size:1em;line-height:1.6;margin:0}
  .item-summary{font-size:1em}
  .guidance summary{display:flex;align-items:center;justify-content:space-between;gap:calc(var(--space-page)/2);color:var(--brown);font-size:.9em}ul{padding-left:var(--space-page);margin:0 0 calc(var(--space-page)/2)}li{font-size:1em;line-height:1.7}li+li{margin-top:calc(var(--space-page)/2)}
  .teaching{border-top:1px solid var(--border);padding:calc(var(--space-page)/2) 0}.teaching p{font-family:var(--font-reader)}
  .teaching-section{padding:calc(var(--space-page)/2) 0}.teaching-section+.teaching-section{border-top:1px solid var(--border)}.teaching summary{display:grid;grid-template-columns:16px minmax(0,1fr) 16px}.teaching summary span{grid-column:2;font-weight:700;text-align:center}.teaching summary :global(svg){flex-shrink:0}.teaching[open]>summary :global(svg){transform:rotate(180deg)}
  button{font:inherit;min-height:44px;min-width:44px;border:1px solid var(--border);border-radius:var(--radius-control);background:var(--card);color:var(--text);padding:calc(var(--space-page)/2);cursor:pointer;line-height:1.6}
  .legacy-records{margin-top:var(--space-page);border-top:1px solid var(--border)}dl{display:grid;gap:var(--radius-sm);min-width:0}dl>div{display:flex;justify-content:space-between;gap:var(--radius-sm)}dd{margin:0;text-align:end;overflow-wrap:anywhere}dd small{display:block;color:var(--text2)}
  button:focus-visible,summary:focus-visible{outline:2px solid var(--gold);outline-offset:2px}.precepts-panel :global(svg){flex-shrink:0}
  @media(max-width:380px){.group-content{padding-inline:calc(var(--space-page)/2)}}
</style>
