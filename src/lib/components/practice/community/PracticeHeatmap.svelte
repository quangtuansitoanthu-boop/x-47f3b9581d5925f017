<script lang="ts">
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import type { PracticeHeatmapDay } from '$lib/domain/practice/progress-achievements';

  interface Props {
    days: PracticeHeatmapDay[];
    timeZone: string;
  }

  let { days, timeZone }: Props = $props();

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');
  const t = $derived(localeStore.t.calendar);

  const cells = $derived.by(() => {
    const first = days[0]?.date;
    const offset = first ? new Date(`${first}T00:00:00Z`).getUTCDay() : 0;
    return [
      ...Array.from({ length: offset }, () => null),
      ...days,
    ];
  });
  const activeDays = $derived(days.filter((day) => day.active).length);
  const numberFormat = $derived(new Intl.NumberFormat(isEn ? 'en-US' : 'vi-VN'));

  const weekdays = $derived(
    isEn
      ? ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']
      : ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7']
  );

  function cellLevel(day: PracticeHeatmapDay): number {
    if (!day.active) return 0;
    const activity = Math.max(day.sessionCount, Math.ceil(day.acceptedDurationSeconds / 900));
    if (activity >= 4) return 4;
    if (activity >= 3) return 3;
    if (activity >= 2) return 2;
    return 1;
  }

  function cellLabel(day: PracticeHeatmapDay): string {
    const sessionLabel = `${numberFormat.format(day.sessionCount)} ${t.unitSessions}`;
    const countLabel = day.acceptedCount > 0 ? `, ${numberFormat.format(day.acceptedCount)} ${t.unitChants}` : '';
    const durationLabel = day.acceptedDurationSeconds > 0
      ? `, ${numberFormat.format(Math.floor(day.acceptedDurationSeconds / 60))} ${t.unitMinutes}`
      : '';
    return `${formatDate(day.date)}: ${day.active ? `${sessionLabel}${countLabel}${durationLabel}` : t.journalNoSession}`;
  }

  function formatDate(value: string): string {
    const [year, month, day] = value.split('-');
    return isEn ? `${month}/${day}/${year}` : `${day}/${month}/${year}`;
  }
</script>

<section class="practice-panel practice-heatmap" aria-labelledby="practice-heatmap-title">
  <header>
    <div>
      <h2 id="practice-heatmap-title">{t.journalTitle}</h2>
      <p>{numberFormat.format(activeDays)} {t.journalSubtitle} {timeZone}.</p>
    </div>
    <span>{days.length} {t.journalDays}</span>
  </header>

  <!-- svelte-ignore a11y_no_noninteractive_tabindex (keyboard users need to reach the horizontal scroller) -->
  <div class="practice-heatmap__scroll" tabindex="0" role="region" aria-label={t.journalScrollAria}>
    <div class="practice-heatmap__weekdays" aria-hidden="true">
      {#each weekdays as wd}
        <span>{wd}</span>
      {/each}
    </div>
    <div class="practice-heatmap__cells" aria-hidden="true">
      {#each cells as day, index (day?.date ?? `empty-${index}`)}
        {#if day}
          <span
            class:active={day.active}
            class={`practice-heatmap__cell level-${cellLevel(day)}`}
            title={cellLabel(day)}
          ><span aria-hidden="true">{day.active ? '✓' : '·'}</span></span>
        {:else}
          <span class="practice-heatmap__spacer" aria-hidden="true"></span>
        {/if}
      {/each}
    </div>
  </div>

  <div class="practice-heatmap__legend" aria-label={t.journalLegend}>
    <span><i class="level-0" aria-hidden="true">·</i> {t.journalNoSession}</span>
    <span><i class="level-2" aria-hidden="true">✓</i> {t.journalPracticed}</span>
    <span><i class="level-4" aria-hidden="true">✓</i> {t.journalMoreSessions}</span>
  </div>

  <details class="practice-heatmap__details">
    <summary>{t.journalDailyDetails}</summary>
    <!-- svelte-ignore a11y_no_noninteractive_tabindex (the bounded detail table must support keyboard scrolling) -->
    <div class="practice-heatmap__table-wrap" tabindex="0" role="region" aria-label={t.journalTableAria || 'Chi tiết nhật lịch theo ngày'}>
      <table>
        <caption>{t.journalCaption} {timeZone}</caption>
        <thead><tr><th scope="col">{t.journalThDate}</th><th scope="col">{t.journalThSessions}</th><th scope="col">{t.journalThChants}</th><th scope="col">{t.journalThMinutes}</th><th scope="col">{t.journalThStatus}</th></tr></thead>
        <tbody>
          {#each days as day (day.date)}
            <tr>
              <th scope="row">{formatDate(day.date)}</th>
              <td>{numberFormat.format(day.sessionCount)}</td>
              <td>{numberFormat.format(day.acceptedCount)}</td>
              <td>{numberFormat.format(Math.floor(day.acceptedDurationSeconds / 60))}</td>
              <td>{day.active ? t.journalPracticed : t.journalNoSession}</td>
            </tr>
          {:else}
            <tr><td colspan="5">{t.journalEmpty}</td></tr>
          {/each}
        </tbody>
      </table>
    </div>
  </details>
</section>

<style>
  .practice-panel{min-width:0;border:1px solid var(--border2);border-radius:var(--pc-radius-lg);background:var(--card)}
  header{display:flex;align-items:flex-start;justify-content:space-between;gap:var(--pc-space-4);padding:var(--pc-space-5);border-bottom:1px solid var(--border2)}
  h2{margin:0;color:var(--text);font-size:var(--pc-type-3);line-height:1.2;text-wrap:balance}
  header p{overflow-wrap:anywhere;margin:var(--pc-space-2) 0 0;color:var(--muted);font-size:var(--pc-type-1);line-height:1.6;text-wrap:pretty}
  header>span{flex:0 0 auto;padding:var(--pc-space-1) var(--pc-space-3);border-radius:var(--pc-radius-pill);background:var(--gold-light);color:var(--brown);font-size:var(--pc-type-0);font-weight:700}
  .practice-heatmap__scroll{display:flex;overflow-x:auto;gap:var(--pc-space-2);padding:var(--pc-space-5);outline:none;scrollbar-gutter:stable}
  .practice-heatmap__scroll:focus-visible{box-shadow:inset 0 0 0 3px color-mix(in srgb,var(--gold) 48%,transparent)}
  .practice-heatmap__weekdays{display:grid;flex:0 0 calc(var(--font-size-meta) * 2.5);grid-template-rows:repeat(7,var(--pc-cell));gap:var(--pc-space-1);color:var(--muted);font-size:var(--font-size-meta);line-height:var(--pc-cell);text-align:left}
  .practice-heatmap__cells{display:grid;width:max-content;grid-auto-columns:var(--pc-cell);grid-auto-flow:column;grid-template-rows:repeat(7,var(--pc-cell));gap:var(--pc-space-1)}
  .practice-heatmap__cell,.practice-heatmap__spacer{display:grid;width:var(--pc-cell);height:var(--pc-cell);place-items:center;border-radius:var(--pc-radius-xs)}
  .practice-heatmap__cell{background:var(--bg3);color:var(--muted);font-size:8px;font-weight:800;line-height:1}
  .practice-heatmap__cell.level-1{background:color-mix(in srgb,var(--gold) 28%,var(--bg2));color:var(--brown)}
  .practice-heatmap__cell.level-2{background:color-mix(in srgb,var(--gold) 46%,var(--bg2));color:var(--brown-dark)}
  .practice-heatmap__cell.level-3{background:color-mix(in srgb,var(--gold) 68%,var(--bg2));color:var(--brown-dark)}
  .practice-heatmap__cell.level-4{background:var(--gold);color:var(--on-gold)}
  .practice-heatmap__legend{display:flex;flex-wrap:wrap;gap:var(--pc-space-4);padding:0 var(--pc-space-5) var(--pc-space-5);color:var(--muted);font-size:var(--font-size-meta)}
  .practice-heatmap__legend span{display:inline-flex;align-items:center;gap:var(--pc-space-2)}
  .practice-heatmap__legend i{display:grid;width:var(--pc-cell);height:var(--pc-cell);place-items:center;border-radius:var(--pc-radius-xs);background:var(--bg3);font-style:normal;font-size:8px;font-weight:800}
  .practice-heatmap__legend .level-2{background:color-mix(in srgb,var(--gold) 46%,var(--bg2));color:var(--brown-dark)}
  .practice-heatmap__legend .level-4{background:var(--gold);color:var(--on-gold)}
  .practice-heatmap__details{margin:0 var(--pc-space-5) var(--pc-space-5);border-top:1px solid var(--border2)}
  .practice-heatmap__details summary{display:list-item;width:fit-content;min-height:44px;padding:12px 0;color:var(--brown);cursor:pointer;font-size:var(--font-size-label);font-weight:700}
  .practice-heatmap__details summary:hover{color:var(--text)}
  .practice-heatmap__details summary:focus-visible,.practice-heatmap__table-wrap:focus-visible{outline:3px solid var(--gold);outline-offset:3px}
  .practice-heatmap__table-wrap{max-height:320px;overflow:auto;border:1px solid var(--border2);border-radius:var(--pc-radius);overscroll-behavior:contain}
  table{width:100%;border-collapse:collapse;color:var(--text2);font-size:var(--pc-type-0);font-variant-numeric:tabular-nums}
  caption{padding:10px 12px;text-align:left;font-weight:600;overflow-wrap:anywhere}
  th,td{padding:8px 12px;border-top:1px solid var(--border2);text-align:left;white-space:nowrap}
  thead th{background:var(--bg2);color:var(--text)}
  tbody th{color:var(--text);font-weight:600}
  th:last-child,td:last-child{min-width:150px;white-space:normal}
  @media(max-width:520px){header{align-items:flex-start;flex-direction:column}.practice-heatmap__scroll{padding-inline:var(--pc-space-4)}.practice-heatmap__legend{padding-inline:var(--pc-space-4)}.practice-heatmap__details{margin-inline:var(--pc-space-4)}}


</style>
