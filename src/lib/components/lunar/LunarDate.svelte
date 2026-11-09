<script lang="ts">
  import { onMount } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import {
    buildDayDetail,
    buildWeekCalendar,
    getVietnamNow,
    type DayDetailInfo,
  } from './lunar-week';
  import type { CalendarDayItem } from './lunar-calendar';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t);

  let mounted = $state(false);

  interface Props {
    solarDate?: string;
    lunarDate?: string;
    loading?: boolean;
  }

  let { solarDate = '', lunarDate = '', loading = false }: Props = $props();

  function parseDateFromProp(str: string): Date | null {
    const match = str.match(/(\d{1,2})\/(\d{1,2})\/(\d{4})/);
    if (match) {
      const d = parseInt(match[1], 10);
      const m = parseInt(match[2], 10) - 1;
      const y = parseInt(match[3], 10);
      return new Date(y, m, d);
    }
    return null;
  }

  const pad = (v: number) => String(v).padStart(2, '0');
  const actualToday = getVietnamNow();
  const todayKey = `${actualToday.getFullYear()}-${pad(actualToday.getMonth() + 1)}-${pad(actualToday.getDate())}`;

  const parsedPropDate = $derived(solarDate ? parseDateFromProp(solarDate) : null);
  let customAnchor = $state<Date | null>(null);
  let customSelectedKey = $state<string | null>(null);
  let userInteracted = $state<boolean>(false);

  const currentAnchor = $derived(customAnchor ?? parsedPropDate ?? actualToday);
  const weekData = $derived(buildWeekCalendar(currentAnchor, actualToday, localeStore.current));

  const effectiveSelectedKey = $derived(
    customSelectedKey ??
    (parsedPropDate
      ? `${parsedPropDate.getFullYear()}-${pad(parsedPropDate.getMonth() + 1)}-${pad(parsedPropDate.getDate())}`
      : todayKey)
  );

  const selectedDay = $derived<CalendarDayItem>(
    weekData.days.find((d) => d.dateKey === effectiveSelectedKey) ??
    weekData.days.find((d) => d.isToday) ??
    weekData.days[0]
  );
  const selectedDetail = $derived<DayDetailInfo>(buildDayDetail(selectedDay, localeStore.current));

  const displaySolarWeekday = $derived(selectedDetail.solarWeekday);
  const displaySolarRemainder = $derived(selectedDetail.solarRemainder);
  const displayLunarDate = $derived(selectedDetail.lunarDateTitle);

  const isCurrentWeek = $derived(weekData.days.some((d) => d.dateKey === todayKey));

  function selectDay(day: CalendarDayItem) {
    customSelectedKey = day.dateKey;
    userInteracted = true;
  }

  function prevWeek() {
    const d = new Date(currentAnchor);
    d.setDate(d.getDate() - 7);
    customAnchor = d;
    userInteracted = true;
    customSelectedKey = null;
  }

  function nextWeek() {
    const d = new Date(currentAnchor);
    d.setDate(d.getDate() + 7);
    customAnchor = d;
    userInteracted = true;
    customSelectedKey = null;
  }

  function goToday() {
    customAnchor = getVietnamNow();
    customSelectedKey = todayKey;
    userInteracted = false;
  }

  onMount(() => {
    mounted = true;
  });
</script>

{#if !mounted}
  <!-- SSR / pre-hydration: hiện dạng text đơn giản để không có blank card -->
  <div class="hero-date lunar-date lunar-date--ssr" aria-live="polite" id="heroDateText">
    <span class="hero-date-icon lunar-date__icon" aria-hidden="true">📅</span>
    <span class="lunar-date__text">
      {#if solarDate}
        {@const ci = solarDate.indexOf(',')}
        <span class="date-line date-solar lunar-date__line"><strong>{ci >= 0 ? solarDate.slice(0, ci) : solarDate}</strong>{ci >= 0 ? solarDate.slice(ci) : ''}</span><span class="date-sep lunar-date__separator" aria-hidden="true">·</span><span class="date-line date-lunar lunar-date__line">{t.calendar.lunarPrefix}<span class="lunar">{lunarDate}</span></span>
      {:else}
        <span>{t.calendar.loadingDate}</span>
      {/if}
    </span>
  </div>
{:else}
<div class="lunar-calendar-card" aria-label={t.calendar.weeklyCalendar} aria-live="polite" aria-busy={loading}>
  <div class="calendar-header">
    <div class="header-titles">
      <span class="solar-month-title">{weekData.weekTitle}</span>
      <span class="lunar-month-badge">{weekData.lunarMonthTitle}</span>
    </div>

    <div class="header-controls">
      {#if !isCurrentWeek}
        <button type="button" class="btn-today" onclick={goToday} aria-label={t.calendar.today}>
          {t.calendar.today}
        </button>
      {/if}
      <button type="button" class="btn-nav" onclick={prevWeek} aria-label={t.calendar.prevWeek}>
        ‹
      </button>
      <button type="button" class="btn-nav" onclick={nextWeek} aria-label={t.calendar.nextWeek}>
        ›
      </button>
    </div>
  </div>

  <div class="week-strip" role="grid" aria-label={t.calendar.weeklyCalendar}>
    <div class="week-grid-row weekdays-header" role="row">
      {#each weekData.days as day}
        <div class="weekday-col" class:is-sunday={day.isSunday} role="columnheader">
          {day.dayOfWeekName}
        </div>
      {/each}
    </div>

    <div class="week-grid-row dates-row" role="row">
      {#each weekData.days as day (day.dateKey)}
        {@const isSelected = day.dateKey === selectedDay.dateKey}
        <div class="date-col" role="gridcell">
          <button
            type="button"
            class="day-pill"
            class:is-selected={isSelected}
            class:is-sunday={day.isSunday}
            class:is-today={day.isToday}
            onclick={() => selectDay(day)}
            aria-pressed={isSelected}
            aria-label="{day.solarFullTitle} - {t.calendar.lunarPrefix}{day.lunarFullStr}"
          >
            <div class="solar-wrap">
              <span class="solar-num">{day.solarDay}</span>
              {#if day.hasOrangeDot || day.hasGreenDot}
                <div class="indicator-dots" aria-hidden="true">
                  {#if day.hasOrangeDot}
                    <span class="dot dot-orange" title={t.calendar.vegDayTooltip}></span>
                  {/if}
                  {#if day.hasGreenDot}
                    <span class="dot dot-green" title={t.calendar.auspiciousDay}></span>
                  {/if}
                </div>
              {/if}
            </div>
            <span class="lunar-num">{day.lunarDayStr}</span>
          </button>
        </div>
      {/each}
    </div>
  </div>

  <div class="hero-date lunar-date day-details-bar" id="heroDateText">
    {#if loading}
      <span class="loading-label">{t.calendar.loadingDate}</span>
    {:else}
      <div class="details-summary-line">
        <span class="hero-date-icon lunar-date__icon" aria-hidden="true">📅</span>
        <span class="lunar-date__text">
          <span class="date-line date-solar lunar-date__line"><strong>{displaySolarWeekday}</strong>{displaySolarRemainder}</span><span class="date-sep lunar-date__separator" aria-hidden="true">·</span><span class="date-line date-lunar lunar-date__line">{t.calendar.lunarPrefix}<span class="lunar">{displayLunarDate}</span></span>
        </span>
      </div>

      {#if selectedDetail.badges.length > 0 || selectedDetail.dayCanChiName}
        <div class="details-badges-row">
          <span class="can-chi-badge" title={t.calendar.canChiDay}>{t.calendar.canChiDay} {selectedDetail.dayCanChiName}</span>
          {#each selectedDetail.badges as badge}
            <span class="event-badge badge-{badge.type}">
              {badge.text}
            </span>
          {/each}
        </div>
      {/if}
    {/if}
  </div>
</div>
{/if}

<style>
  .lunar-calendar-card {
    display: flex;
    flex-direction: column;
    width: 100%;
    background: var(--card);
    border: 1.5px solid var(--border);
    border-radius: 18px;
    padding: 14px 16px 12px;
    box-shadow: var(--shadow);
    font-family: var(--font-app);
    user-select: none;
    box-sizing: border-box;
    transition: box-shadow 0.25s ease, border-color 0.25s ease;
  }

  .lunar-calendar-card:hover {
    border-color: var(--gold);
    box-shadow: var(--shadow-lg);
  }

  /* Header */
  .calendar-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 12px;
  }

  .header-titles {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
    overflow: hidden;
  }

  .solar-month-title {
    font-size: var(--font-size-card-title);
    font-weight: 700;
    color: var(--text);
    letter-spacing: -0.2px;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .lunar-month-badge {
    font-size: var(--font-size-meta);
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 10px;
    background: var(--gold-light);
    color: var(--brown);
    border: 1px solid var(--gold-muted);
    white-space: nowrap;
    flex-shrink: 0;
  }

  :root[data-theme='dark'] .lunar-month-badge {
    background: rgba(212, 168, 75, 0.15);
    color: var(--gold2);
    border-color: rgba(212, 168, 75, 0.3);
  }

  .header-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  .btn-today {
    background: transparent;
    border: 1px solid var(--border);
    border-radius: 12px;
    padding: 2px 8px;
    font-size: var(--font-size-meta);
    font-weight: 600;
    color: var(--gold);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-today:hover {
    background: var(--hover);
    border-color: var(--gold);
  }

  .btn-nav {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 26px;
    height: 26px;
    border-radius: 8px;
    border: 1px solid var(--border2);
    background: var(--bg);
    color: var(--text);
    font-size: 16px;
    line-height: 1;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .btn-nav:hover {
    background: var(--hover);
    border-color: var(--gold);
    color: var(--gold);
  }

  /* Week Strip */
  .week-strip {
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .week-grid-row {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    align-items: center;
  }

  .weekdays-header {
    margin-bottom: 2px;
  }

  .weekday-col {
    text-align: center;
    font-size: var(--font-size-meta);
    font-weight: 600;
    color: var(--muted);
  }

  .weekday-col.is-sunday {
    color: var(--red);
  }

  /* Day Pills */
  .date-col {
    display: flex;
    justify-content: center;
  }

  .day-pill {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    width: 100%;
    min-width: 38px;
    max-width: 52px;
    height: 62px;
    padding: 4px 2px;
    border-radius: 13px;
    border: 1.5px solid transparent;
    background: transparent;
    cursor: pointer;
    transition: all 0.2s cubic-bezier(0.4, 0, 0.2, 1);
    position: relative;
    box-sizing: border-box;
  }

  .day-pill:hover:not(.is-selected) {
    background: var(--hover);
    border-color: var(--border2);
  }

  .day-pill.is-today:not(.is-selected) {
    border-color: var(--gold);
    background: rgba(200, 150, 62, 0.08);
  }

  .solar-wrap {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    position: relative;
    width: 100%;
  }

  .solar-num {
    font-size: 18px;
    font-weight: 700;
    line-height: 1.2;
    color: var(--text);
  }

  .day-pill.is-sunday:not(.is-selected) .solar-num {
    color: var(--red);
  }

  .lunar-num {
    font-size: var(--font-size-meta);
    font-weight: 500;
    color: var(--muted);
    margin-top: 2px;
    line-height: 1;
  }

  /* Indicator dots stacked vertically to the right */
  .indicator-dots {
    display: flex;
    flex-direction: column;
    gap: 2.5px;
    margin-left: 2px;
    position: absolute;
    right: 2px;
    top: 50%;
    transform: translateY(-50%);
  }

  .dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
    flex-shrink: 0;
  }

  .dot-orange {
    background-color: #f97316;
  }

  .dot-green {
    background-color: #10b981;
  }

  /* Selected day badge - warm amber-brown pill exactly like the screenshot */
  .day-pill.is-selected {
    background: linear-gradient(180deg, #8a5924 0%, #633c14 100%);
    box-shadow: 0 4px 14px rgba(99, 60, 20, 0.32);
    border-color: transparent;
    transform: scale(1.02);
  }

  :root[data-theme='dark'] .day-pill.is-selected {
    background: linear-gradient(180deg, #99642a 0%, #704418 100%);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.45);
  }

  .day-pill.is-selected .solar-num {
    color: #ffffff !important;
  }

  .day-pill.is-selected .lunar-num {
    color: rgba(255, 255, 255, 0.9) !important;
    font-weight: 600;
  }

  /* Details row below */
  .day-details-bar {
    display: flex;
    flex-direction: column;
    gap: 6px;
    margin-top: 10px;
    padding-top: 10px;
    border-top: 1px solid var(--border2);
  }

  .details-summary-line {
    display: flex;
    align-items: center;
    flex-wrap: wrap;
    gap: 6px;
    font-size: var(--font-size-label);
    font-weight: 600;
    color: var(--text2);
    line-height: 1.4;
    min-width: 0;
    max-width: 100%;
  }

  .lunar-date__icon {
    font-size: 15px;
    line-height: 1;
    flex: 0 0 auto;
  }

  .lunar-date__text {
    display: inline;
    min-width: 0;
  }

  .lunar-date__line {
    white-space: nowrap;
  }

  .lunar-date__separator {
    color: var(--muted);
    margin: 0 2px;
  }

  .date-solar strong {
    color: var(--text);
    font-weight: 700;
  }

  .lunar {
    color: var(--gold);
    font-weight: 700;
  }

  .details-badges-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 6px;
  }

  .can-chi-badge {
    font-size: var(--font-size-meta);
    font-weight: 600;
    padding: 2px 7px;
    border-radius: 8px;
    background: var(--bg2);
    color: var(--muted);
    border: 1px solid var(--border2);
  }

  .event-badge {
    font-size: var(--font-size-meta);
    font-weight: 600;
    padding: 2px 8px;
    border-radius: 8px;
    line-height: 1.3;
  }

  .badge-chay,
  .badge-ram,
  .badge-mung1 {
    background: rgba(249, 115, 22, 0.12);
    color: #ea580c;
    border: 1px solid rgba(249, 115, 22, 0.25);
  }

  .badge-via {
    background: var(--gold-light);
    color: var(--brown);
    border: 1px solid var(--gold-muted);
  }

  .badge-hoangdao {
    background: rgba(16, 185, 129, 0.12);
    color: #059669;
    border: 1px solid rgba(16, 185, 129, 0.25);
  }

  @media (max-width: 480px) {
    .lunar-calendar-card {
      padding: 10px 10px 10px;
      border-radius: 14px;
      overflow: hidden;
    }

    .calendar-header {
      gap: 6px;
    }

    .header-titles {
      flex: 1;
      min-width: 0;
    }

    .solar-month-title {
      font-size: var(--font-size-card-title);
    }

    .lunar-month-badge {
      font-size: var(--font-size-meta);
      padding: 2px 5px;
    }

    .solar-num {
      font-size: 16px;
    }

    .lunar-num {
      font-size: var(--font-size-meta);
    }

    .day-pill {
      height: 56px;
      border-radius: 11px;
    }

    .details-summary-line {
      font-size: var(--font-size-label);
    }

    .lunar-date__line {
      white-space: normal;
      word-break: break-word;
    }

    .details-badges-row {
      overflow-x: auto;
      scrollbar-width: none;
      -webkit-overflow-scrolling: touch;
    }

    .details-badges-row::-webkit-scrollbar {
      display: none;
    }

    .can-chi-badge,
    .event-badge {
      white-space: nowrap;
      flex-shrink: 0;
    }
  }

  /* SSR / pre-hydration fallback - text dòng đơn, không có blank card */
  .lunar-date--ssr {
    display: inline-flex;
    align-items: center;
    gap: 10px;
    margin-top: 14px;
    color: var(--text2);
    font-family: var(--font-app);
    font-size: var(--font-size-label);
    font-weight: 600;
    flex-wrap: wrap;
    max-width: 100%;
  }

  .lunar-date--ssr .lunar-date__text {
    display: inline;
    min-width: 0;
  }

  .lunar-date--ssr .lunar-date__line {
    white-space: nowrap;
  }

  @media (max-width: 480px) {
    .lunar-date--ssr .lunar-date__line {
      white-space: normal;
      word-break: break-word;
    }
  }

  .lunar-date--ssr .lunar-date__separator {
    color: var(--muted);
    margin: 0 3px;
  }

  .lunar-date--ssr .date-solar strong {
    color: var(--text);
    font-weight: 700;
  }

  .lunar-date--ssr .lunar {
    color: var(--gold);
    font-weight: 700;
  }

  .lunar-date--ssr .lunar-date__icon {
    font-size: 16px;
    line-height: 1;
    flex: 0 0 auto;
  }
</style>
