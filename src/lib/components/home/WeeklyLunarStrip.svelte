<script lang="ts">
  import { createInterfaceTranslator } from '$lib/i18n/interface';
  import { calendarLunarLabel } from '$lib/i18n/ui-copy';
  const localizeUi = createInterfaceTranslator();

  import { onMount, tick, untrack } from 'svelte';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import {
    buildWeekCalendar,
    buildMonthCalendar,
    getVietnamNow,
  } from '$lib/components/lunar/lunar-week';
  import type { CalendarDayItem } from '$lib/components/lunar/lunar-calendar';
  import {
    getPersonalEventsForDate,
    loadPersonalLunarEvents,
  } from '$lib/browser/personal-lunar-events';
  import { triggerHaptic } from '$lib/utils/haptics';

  interface Props {
    selectedDate?: Date;
    onSelectDate?: (date: Date, item: CalendarDayItem) => void;
  }

  let { selectedDate = $bindable(getVietnamNow()), onSelectDate }: Props = $props();

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');

  let currentRefDate = $state(new Date(selectedDate.getTime()));
  let personalEvents = $state(loadPersonalLunarEvents());
  let isMonthExpanded = $state(false);
  $effect(() => {
    const selected = selectedDate;
    // Ngày được chọn từ widget phải hiện trong tuần/tháng; không theo dõi bước duyệt lịch nội bộ.
    untrack(() => { if (!isSameDay(currentRefDate, selected)) currentRefDate = new Date(selected.getTime()); });
  });

  onMount(() => {
    const handleEventsChanged = () => {
      personalEvents = loadPersonalLunarEvents();
    };
    window.addEventListener('quangtu:personal-events-changed', handleEventsChanged);
    return () => {
      window.removeEventListener('quangtu:personal-events-changed', handleEventsChanged);
    };
  });

  const weekData = $derived(buildWeekCalendar(currentRefDate, getVietnamNow(), localeStore.current));
  const monthData = $derived(buildMonthCalendar(currentRefDate, getVietnamNow(), localeStore.current));
  const selectedDayIsInWeek = $derived(weekData.days.some(item => isSameDay(item.date, selectedDate)));
  const selectedDayIsInMonth = $derived(monthData.days.some(item => isSameDay(item.date, selectedDate)));

  function isSameDay(d1: Date, d2: Date): boolean {
    return (
      d1.getFullYear() === d2.getFullYear() &&
      d1.getMonth() === d2.getMonth() &&
      d1.getDate() === d2.getDate()
    );
  }

  function handleSelect(item: CalendarDayItem): void {
    triggerHaptic('selection');
    selectedDate = new Date(item.date.getTime());
    currentRefDate = new Date(item.date.getTime());
    onSelectDate?.(selectedDate, item);
  }

  async function handleDayKeydown(event: KeyboardEvent, item: CalendarDayItem): Promise<void> {
    const days = isMonthExpanded ? monthData.days : weekData.days;
    const index = days.findIndex(day => day.dateKey === item.dateKey);
    const next = event.key === 'ArrowRight' ? (index + 1) % days.length
      : event.key === 'ArrowLeft' ? (index + days.length - 1) % days.length
      : event.key === 'Home' ? 0
      : event.key === 'End' ? days.length - 1
      : -1;
    if (index < 0 || next < 0) return;
    event.preventDefault();
    const grid = (event.currentTarget as HTMLButtonElement).parentElement;
    handleSelect(days[next]);
    await tick();
    // Ô tháng có thể đổi sau khi chọn ngày giáp tháng; chỉ chuyển focus vào phần lịch còn gắn.
    if (grid?.isConnected) grid.querySelector<HTMLButtonElement>('[role="tab"][aria-selected="true"]')?.focus();
  }

  function prevStep(): void {
    triggerHaptic('light');
    const next = new Date(currentRefDate.getTime());
    if (isMonthExpanded) {
      next.setDate(1);
      next.setMonth(next.getMonth() - 1);
    } else {
      next.setDate(next.getDate() - 7);
    }
    currentRefDate = next;
  }

  function nextStep(): void {
    triggerHaptic('light');
    const next = new Date(currentRefDate.getTime());
    if (isMonthExpanded) {
      next.setDate(1);
      next.setMonth(next.getMonth() + 1);
    } else {
      next.setDate(next.getDate() + 7);
    }
    currentRefDate = next;
  }

  function resetToday(): void {
    triggerHaptic('selection');
    const now = getVietnamNow();
    currentRefDate = now;
    selectedDate = now;
    const todayItem = weekData.days.find((d: CalendarDayItem) => d.isToday);
    if (todayItem) {
      onSelectDate?.(now, todayItem);
    }
  }

  function toggleExpandMonth(): void {
    triggerHaptic('medium');
    isMonthExpanded = !isMonthExpanded;
  }

  const isCurrentPeriodToday = $derived.by(() => {
    const days = isMonthExpanded ? monthData.days : weekData.days;
    return days.some((d: CalendarDayItem) => isSameDay(d.date, getVietnamNow()));
  });

  const headerTitle = $derived(isMonthExpanded ? monthData.monthTitle : weekData.weekTitle);
  const headerLunarTitle = $derived((isMonthExpanded ? monthData.lunarMonthTitle : weekData.lunarMonthTitle)
    .replace(calendarLunarLabel.abbreviation, calendarLunarLabel.full));
</script>

<div class="weekly-lunar-strip" aria-label={isEn ? 'Lunar-Solar Calendar Strip' : 'Dải lịch âm dương'}>
  <!-- Keep navigation beside the date; only the title may use two lines. -->
  <div class="strip-header">
    <div class="strip-title-box">
      <span class="strip-calendar-icon" aria-hidden="true">🗓️</span>
      <span class="strip-title">{headerTitle}</span>
      <span class="strip-divider">•</span>
      <span class="strip-lunar-title">{headerLunarTitle}</span>
    </div>

    <div class="strip-controls">
      {#if !isCurrentPeriodToday || !isSameDay(selectedDate, getVietnamNow())}
        <button type="button" class="strip-today-btn" onclick={resetToday}>
          {isEn ? 'Today' : 'Hôm nay'}
        </button>
      {/if}
      <button
        type="button"
        class="strip-arrow-btn"
        onclick={prevStep}
        aria-label={isMonthExpanded ? (isEn ? 'Previous month' : 'Tháng trước') : (isEn ? 'Previous week' : 'Tuần trước')}
      >
        ‹
      </button>
      <button
        type="button"
        class="strip-arrow-btn"
        onclick={nextStep}
        aria-label={isMonthExpanded ? (isEn ? 'Next month' : 'Tháng sau') : (isEn ? 'Next week' : 'Tuần sau')}
      >
        ›
      </button>
    </div>
  </div>

  {#if !isMonthExpanded}
    <!-- Chế Độ Dải Tuần 7 Ngày 3 Tầng -->
    <div class="strip-days-grid" role="tablist">
      {#each weekData.days as item, index (item.dateKey)}
        {@const isSelected = isSameDay(item.date, selectedDate)}
        {@const isPersonal = getPersonalEventsForDate(item.date, personalEvents).length > 0}
        <button
          type="button"
          role="tab"
          aria-selected={isSelected}
          tabindex={isSelected || (!selectedDayIsInWeek && index === 0) ? 0 : -1}
          class="day-col"
          class:is-selected={isSelected}
          class:is-today={item.isToday}
          class:is-sunday={item.isSunday}
          onclick={() => handleSelect(item)}
          onkeydown={(event) => handleDayKeydown(event, item)}
        >
          <!-- Tầng 1: Thứ (Hai, Ba, Tư...) -->
          <span class="day-weekday">{item.dayOfWeekName}</span>

          <!-- Tầng 2: Ngày Dương (Số to rõ) + Event Dots -->
          <div class="day-solar-wrap">
            <span class="day-solar-num">{item.solarDay}</span>
            <div class="day-dots" aria-hidden="true">
              {#if item.viaName}
                <span class="event-dot dot-gold" title={item.viaName}></span>
              {/if}
              {#if item.isThapTrai}
                <span class="event-dot dot-orange" title={isEn ? 'Fasting day' : 'Ngày ăn chay'}></span>
              {/if}
              {#if isPersonal}
                <span class="event-dot dot-purple" title={isEn ? 'Personal event' : 'Ngày lễ cá nhân'}></span>
              {/if}
              {#if item.hasThoKhangDot}
                <span class="event-dot dot-red" title={isEn ? 'Tho Khang Bao Giam' : 'Thọ Khang Bảo Giám'}></span>
              {/if}
            </div>
          </div>

          <!-- Tầng 3: Ngày Âm lịch (số âm lịch) -->
          <span class="day-lunar-num">
            {item.lunarDayStr}
          </span>
        </button>
      {/each}
    </div>
  {:else}
    <!-- Chế Độ Lịch Tháng Đầy Đủ -->
    <div class="month-calendar-view">
      <div class="month-weekday-header">
        {#each ['Hai', 'Ba', 'Tư', 'Năm', 'Sáu', 'Bảy', 'CN'] as d, i}
          <span class="month-weekday-col" class:is-sun={i === 6}>
            {isEn ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i] : d}
          </span>
        {/each}
      </div>

      <div class="month-days-grid" role="tablist">
        {#each monthData.days as item, index (item.dateKey)}
          {@const isSelected = isSameDay(item.date, selectedDate)}
          {@const isCurrentMonth = item.solarMonth === (currentRefDate.getMonth() + 1)}
          {@const isPersonal = getPersonalEventsForDate(item.date, personalEvents).length > 0}
          <button
            type="button"
            role="tab"
            aria-selected={isSelected}
            tabindex={isSelected || (!selectedDayIsInMonth && index === 0) ? 0 : -1}
            class="month-day-cell"
            class:is-selected={isSelected}
            class:is-today={item.isToday}
            class:is-other-month={!isCurrentMonth}
            class:is-sunday={item.isSunday}
            class:is-ram-mung1={item.isRam || item.isMung1}
            onclick={() => handleSelect(item)}
            onkeydown={(event) => handleDayKeydown(event, item)}
          >
            <div class="month-cell-solar">{item.solarDay}</div>
            <div class="month-cell-lunar">{item.lunarDayStr}</div>
            <div class="day-dots" aria-hidden="true">
              {#if item.viaName}
                <span class="event-dot dot-gold" title={item.viaName}></span>
              {/if}
              {#if item.isThapTrai}
                <span class="event-dot dot-orange" title={isEn ? 'Fasting' : 'Ăn chay'}></span>
              {/if}
              {#if isPersonal}
                <span class="event-dot dot-purple" title={isEn ? 'Personal event' : 'Lễ cá nhân'}></span>
              {/if}
              {#if item.hasThoKhangDot}
                <span class="event-dot dot-red" title={isEn ? 'Tho Khang Bao Giam' : 'Thọ Khang Bảo Giám'}></span>
              {/if}
            </div>
          </button>
        {/each}
      </div>
    </div>
  {/if}

  <!-- Nút Mũi Tên To Bung Lịch Tháng / Thu Gọn -->
  <div class="strip-toggle-row">
    <button
      type="button"
      class="strip-expand-btn"
      onclick={toggleExpandMonth}
      aria-expanded={isMonthExpanded}
    >
      <span class="expand-arrow" aria-hidden="true">{isMonthExpanded ? '▴' : '▾'}</span>
      <span class="expand-text">
        {isMonthExpanded
          ? (isEn ? 'Collapse ▴' : 'Thu gọn ▴')
          : (isEn ? 'View month ▾' : 'Xem lịch tháng ▾')}
      </span>
    </button>
  </div>

  <!-- Legend (Ghi chú chấm màu) -->
  <div class="strip-legend" aria-hidden="true">
    <div class="legend-item">
      <span class="event-dot dot-orange"></span>
      <span>{isEn ? 'Fasting' : 'Ăn chay / Thập trai'}</span>
    </div>
    <div class="legend-item">
      <span class="event-dot dot-gold"></span>
      <span>{isEn ? 'Feast day' : 'Ngày Vía'}</span>
    </div>
    <div class="legend-item">
      <span class="event-dot dot-purple"></span>
      <span>{isEn ? 'Personal event' : 'Ngày Lễ Cá Nhân'}</span>
    </div>
    <div class="legend-item">
      <span class="event-dot dot-red"></span>
      <span>{isEn ? 'Tho Khang Bao Giam' : 'Thọ Khang Bảo Giám'}</span>
    </div>
  </div>
</div>

<style>
  .weekly-lunar-strip {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
    padding: 12px 14px;
    border-radius: 20px;
    background: var(--card, #fff);
    border: 1.5px solid var(--border, #e7ddca);
    box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
    box-sizing: border-box;
  }

  /* Reserve space for navigation instead of wrapping it below the date. */
  .strip-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 6px;
    flex-wrap: nowrap;
  }

  .strip-title-box {
    display: flex;
    flex: 1;
    align-items: center;
    gap: 2px 5px;
    font-size: var(--font-size-label);
    font-weight: 700;
    color: var(--text, #2c2013);
    min-width: 0;
  }

  .strip-calendar-icon {
    font-size: 14px;
    line-height: 1;
    flex-shrink: 0;
  }

  .strip-title {
    min-width: 0;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .strip-divider {
    display: none;
  }

  .strip-lunar-title {
    grid-column: 2;
    min-width: 0;
    color: var(--gold, #c8963e);
    font-weight: 800;
    white-space: normal;
    overflow-wrap: anywhere;
  }

  .strip-controls {
    display: flex;
    align-items: center;
    gap: 4px;
    flex-shrink: 0;
  }

  @media (max-width: 600px) {
    .strip-title-box { display:grid;grid-template-columns:auto minmax(0,1fr);row-gap:0;font-size: var(--font-size-label);line-height:1.3; }
    .strip-calendar-icon { grid-row:span 2; }
    .strip-divider { display:none; }
    .strip-title,.strip-lunar-title { min-width:0;white-space:normal;overflow:visible;text-overflow:clip; }
  }

  .strip-today-btn {
    min-width: 44px;
    min-height: 44px;
    padding: 2px 6px;
    border-radius: 999px;
    border: 1px solid var(--gold, #c8963e);
    background: color-mix(in srgb, var(--gold, #c8963e) 15%, var(--card, #fff));
    color: var(--gold, #c8963e);
    font: 700 var(--font-size-meta)/1.2 var(--font-app);
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.12s ease;
  }

  .strip-today-btn:hover {
    background: var(--gold, #c8963e);
    color: #fff;
  }

  .strip-arrow-btn {
    width: 44px;
    height: 44px;
    padding: 0;
    flex-shrink: 0;
    border-radius: 50%;
    border: 1px solid var(--border, #e7ddca);
    background: var(--bg2, #fbf7ee);
    color: var(--text, #2c2013);
    display: grid;
    place-items: center;
    font-size: 16px;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease;
  }

  .strip-arrow-btn:hover {
    border-color: var(--gold, #c8963e);
    color: var(--gold, #c8963e);
  }

  .strip-arrow-btn:focus-visible,
  .strip-today-btn:focus-visible {
    outline: 2px solid var(--gold, #c8963e);
    outline-offset: 2px;
  }

  @media (max-width: 380px) {
    .strip-title-box {
      grid-template-columns: minmax(0, 1fr);
      font-size: var(--font-size-label);
    }
    .strip-calendar-icon {
      display: none;
    }
    .strip-lunar-title {
      grid-column: 1;
    }
  }

  /* 7 Ngày 3 Tầng */
  .strip-days-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 5px;
    width: 100%;
  }

  .day-col {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: space-between;
    padding: 8px 2px 6px;
    min-height: 72px;
    min-width: 44px;
    border-radius: 14px;
    border: 1.5px solid transparent;
    background: var(--bg2, #fbf7ee);
    color: var(--text, #2c2013);
    cursor: pointer;
    transition: all 0.15s ease;
    user-select: none;
    outline: none;
    box-sizing: border-box;
  }

  .day-col:hover {
    background: color-mix(in srgb, var(--gold, #c8963e) 12%, var(--bg2, #fbf7ee));
    transform: translateY(-1px);
  }

  .day-col.is-today {
    border-color: var(--gold, #c8963e);
    background: color-mix(in srgb, var(--gold, #c8963e) 15%, var(--card, #fff));
  }

  .day-col.is-selected {
    background: linear-gradient(135deg, var(--gold, #c8963e) 0%, #996d24 100%) !important;
    color: #ffffff !important;
    box-shadow: 0 4px 12px rgba(200, 150, 62, 0.35);
    border-color: #ffd700 !important;
    transform: none;
  }

  .day-col:focus-visible,
  .month-day-cell:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: -3px;
  }

  .day-col.is-selected:focus-visible,
  .month-day-cell.is-selected:focus-visible {
    outline-color: var(--text);
  }

  .day-weekday {
    font-size: var(--font-size-meta);
    font-weight: 700;
    color: var(--muted, #857460);
    text-transform: uppercase;
    letter-spacing: 0.02em;
  }

  .day-col.is-selected .day-weekday {
    color: #fff9eb;
  }

  .day-solar-wrap {
    display: flex;
    flex-direction: column;
    align-items: center;
    position: relative;
    margin: 2px 0;
  }

  .day-solar-num {
    font-size: 18px;
    font-weight: 900;
    line-height: 1;
    font-variant-numeric: tabular-nums;
  }

  .day-col.is-sunday .day-solar-num {
    color: #e53935;
  }

  .day-col.is-selected .day-solar-num {
    color: #ffffff !important;
  }

  .day-dots {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 3px;
    min-height: 6px;
    margin-top: 3px;
  }

  .event-dot {
    width: 5px;
    height: 5px;
    border-radius: 50%;
  }

  .dot-orange {
    background: #ff9800;
    box-shadow: 0 0 4px rgba(255, 152, 0, 0.6);
  }

  .dot-gold {
    background: #ffd700;
    box-shadow: 0 0 4px rgba(255, 215, 0, 0.6);
  }

  .dot-purple {
    background: #ab47bc;
    box-shadow: 0 0 4px rgba(171, 71, 188, 0.6);
  }

  .dot-red {
    background: var(--red);
  }

  .day-lunar-num {
    font-size: var(--font-size-meta);
    font-weight: 700;
    color: var(--muted, #857460);
    line-height: 1;
  }

  .day-col.is-selected .day-lunar-num {
    color: #ffe8b3;
    font-weight: 800;
  }

  /* Chế Độ Lịch Tháng */
  .month-calendar-view {
    display: flex;
    flex-direction: column;
    gap: 6px;
    width: 100%;
    animation: fadeIn 0.2s ease-in-out;
  }

  @keyframes fadeIn {
    from {
      opacity: 0;
      transform: translateY(-4px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .month-weekday-header {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    text-align: center;
    font-size: var(--font-size-meta);
    font-weight: 700;
    color: var(--muted, #857460);
    padding-bottom: 4px;
    border-bottom: 1px dashed var(--border, #e7ddca);
  }

  .month-weekday-col.is-sun {
    color: #e53935;
  }

  .month-days-grid {
    display: grid;
    grid-template-columns: repeat(7, 1fr);
    gap: 4px;
    width: 100%;
  }

  .month-day-cell {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 6px 2px;
    border-radius: 10px;
    border: 1px solid transparent;
    background: var(--bg2, #fbf7ee);
    color: var(--text, #2c2013);
    cursor: pointer;
    transition: all 0.15s ease;
    box-sizing: border-box;
    min-height: 48px;
    min-width: 44px;
  }

  .month-day-cell:hover {
    background: color-mix(in srgb, var(--gold, #c8963e) 15%, var(--bg2, #fbf7ee));
  }

  .month-day-cell.is-other-month {
    opacity: 0.35;
  }

  .month-day-cell.is-today {
    border-color: var(--gold, #c8963e);
  }

  .month-day-cell.is-sunday .month-cell-solar {
    color: #e53935;
  }

  .month-day-cell.is-ram-mung1 .month-cell-lunar {
    color: var(--gold, #c8963e);
    font-weight: 800;
  }

  .month-day-cell.is-selected {
    background: linear-gradient(135deg, var(--gold, #c8963e) 0%, #996d24 100%) !important;
    color: #fff !important;
    border-color: #ffd700 !important;
    box-shadow: 0 3px 10px rgba(200, 150, 62, 0.35);
  }

  .month-cell-solar {
    font-size: 13.5px;
    font-weight: 800;
    line-height: 1;
  }

  .month-cell-lunar {
    font-size: var(--font-size-meta);
    font-weight: 600;
    color: var(--muted, #857460);
    margin-top: 2px;
  }

  .month-day-cell.is-selected .month-cell-lunar {
    color: #ffe8b3;
  }

  /* Nút Mũi Tên To Bung Lịch Tháng / Thu Gọn */
  .strip-toggle-row {
    display: flex;
    justify-content: center;
    width: 100%;
    padding-top: 2px;
  }

  .strip-expand-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    padding: 6px 16px;
      min-height: 48px;
    border-radius: 999px;
    border: 1px solid color-mix(in srgb, var(--gold, #c8963e) 40%, var(--border, #e7ddca));
    background: color-mix(in srgb, var(--gold, #c8963e) 8%, var(--card, #fff));
    color: var(--text, #2c2013);
    font: inherit;
    font-size: var(--font-size-label);
    font-weight: 700;
    line-height: 1.4;
    cursor: pointer;
    box-shadow: 0 1px 6px rgba(0, 0, 0, 0.03);
    transition: all 0.18s ease;
  }

  .strip-expand-btn:hover {
    background: color-mix(in srgb, var(--gold, #c8963e) 16%, var(--card, #fff));
    border-color: var(--gold, #c8963e);
    color: var(--gold, #c8963e);
    transform: translateY(-1px);
  }

  .strip-expand-btn:active {
    transform: scale(0.97);
  }

  .expand-arrow {
    font-size: 15px;
    font-weight: 900;
    color: var(--gold, #c8963e);
    line-height: 1;
  }

  .expand-text {
    font-weight: 700;
  }

  /* Legend */
  .strip-legend {
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
    align-items: center;
    gap: var(--radius-control);
    padding-top: 4px;
    border-top: 1px dashed var(--border, #e7ddca);
    font-size: var(--font-size-meta);
    color: var(--muted, #857460);
  }

  .legend-item {
    display: flex;
    align-items: center;
    min-width: 0;
    gap: 5px;
  }

  .legend-item .event-dot {
    flex-shrink: 0;
  }

  /* Bảy vùng chạm 44px cần dùng đủ chiều ngang, kể cả cột lịch cạnh thẻ ở tablet. */
  @media (max-width: 900px) {
    .weekly-lunar-strip {
      padding-inline: 4px;
    }
    .strip-days-grid,
    .month-days-grid {
      gap: 0;
    }
  }

  @media (max-width: 360px) {
    .weekly-lunar-strip {
      width: calc(100% + 24px);
      margin-inline: -12px;
      padding-inline: 0;
    }
    .strip-header,
    .strip-legend {
      margin-inline: 8px;
    }
  }
</style>
