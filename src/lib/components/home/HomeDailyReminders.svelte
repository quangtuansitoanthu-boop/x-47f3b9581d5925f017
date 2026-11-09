<script lang="ts">
  import DeletePersonalEventDialog from '$lib/components/practice/reminder/DeletePersonalEventDialog.svelte';
  let pendingDelete = $state<PersonalLunarEvent | null>(null);
  import { onMount } from 'svelte';
  import { alertInApp } from '$lib/browser/app-dialog';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { personalEventsUi } from '$lib/i18n/personal-events-ui';
  import {
    solarToLunar,
    type LunarDay,
  } from '$lib/components/lunar/lunar-calendar';
  import { getLunarEvent } from '$lib/components/lunar/lunar-events';
  import {
    loadPersonalLunarEvents,
    deletePersonalLunarEvent,
    getPersonalEventsForDate,
    findNextPersonalEvent,
    getPersonalEventTypeIcon,
    getPersonalEventTypeName,
    formatPersonalEventDateText,
    type PersonalLunarEvent,
  } from '$lib/browser/personal-lunar-events';
  import ThapTraiBannerMessage from '$lib/components/lunar/ThapTraiBannerMessage.svelte';
  import PersonalEventsModal from '$lib/components/practice/reminder/PersonalEventsModal.svelte';
  import { triggerHaptic } from '$lib/utils/haptics';
  import { getVietnamNow } from '$lib/components/lunar/lunar-week';
  import { sameCalendarDay } from '$lib/browser/calendar-day-rollover';

  interface Props {
    selectedDate?: Date;
  }

  let { selectedDate = new Date() }: Props = $props();

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');
  const selectedIsToday = $derived(sameCalendarDay(selectedDate, getVietnamNow()));

  let personalModalOpen = $state(false);
  let allPersonalEvents = $state<PersonalLunarEvent[]>(loadPersonalLunarEvents());

  onMount(() => {
    const handleEventsChanged = () => {
      allPersonalEvents = loadPersonalLunarEvents();
    };
    window.addEventListener('quangtu:personal-events-changed', handleEventsChanged);
    return () => {
      window.removeEventListener('quangtu:personal-events-changed', handleEventsChanged);
    };
  });

  const lunar = $derived(
    solarToLunar(selectedDate.getDate(), selectedDate.getMonth() + 1, selectedDate.getFullYear())
  );
  const eventInfo = $derived(getLunarEvent(selectedDate, localeStore.current));
  const todayPersonalEvents = $derived(
    getPersonalEventsForDate(selectedDate, allPersonalEvents)
  );

  const upcomingPersonalEvent = $derived(findNextPersonalEvent(selectedDate, allPersonalEvents));

  function handleDeleteEvent(id: string): void {
    pendingDelete = allPersonalEvents.find((item) => item.id === id) ?? null;
  }

  function confirmPersonalDelete(): void {
    if (!pendingDelete) return;
    triggerHaptic('light');
    try {
      deletePersonalLunarEvent(pendingDelete.id);
    } catch {
      pendingDelete = null;
      void alertInApp(personalEventsUi[isEn ? 'en' : 'vi'].storageError);
      return;
    }
    pendingDelete = null;
    allPersonalEvents = loadPersonalLunarEvents();
  }

  function openModal(): void {
    triggerHaptic('light');
    personalModalOpen = true;
  }
</script>

<section class="home-daily-reminders" aria-label={selectedIsToday ? (isEn ? 'Daily Practice Reminders' : 'Nhắc nhở hành trì hôm nay') : localeStore.t.calendar.selectedRemindersAria}>
  <!-- Section Header Cân Đối 1 Hàng -->
  <div class="reminders-header">
    <div class="reminders-title-box">
      <span class="reminders-icon" aria-hidden="true">📅</span>
      <h2 class="reminders-heading">
        {isEn ? 'Daily Reminders' : 'Lịch Nhắc Nhở Trong Ngày'}
      </h2>
    </div>
  </div>

  <div class="reminders-content">
    <!-- 1. Thập Trai / Vía Phật / Lời dạy Thọ Khang Bảo Giám -->
    <div class="thaptrai-card">
      <div class="thaptrai-body">
        <ThapTraiBannerMessage {eventInfo} {lunar} {selectedDate} />
      </div>
    </div>

    <!-- 2. Khung Hiển Thị Toàn Bộ Danh Sách Ngày Lễ & Kỷ Niệm Cá Nhân Dưới Thập Trai -->
    <div class="personal-reminder-card" class:has-event={todayPersonalEvents.length > 0}>
      <div class="personal-card-header">
        <div class="personal-card-title-wrap">
          <span class="personal-card-icon" aria-hidden="true">🕯️</span>
          <h3 class="personal-card-heading">
            {isEn ? 'Personal' : 'Ngày Lễ & Kỷ Niệm'}{' '}
            <span class="personal-title-end">{isEn ? 'Anniversaries' : 'Cá Nhân'}
            {#if allPersonalEvents.length > 0}
              <span class="personal-count-pill">{allPersonalEvents.length}</span>
            {/if}
            </span>
          </h3>
        </div>
      </div>

      {#if allPersonalEvents.length > 0}
        <ul class="personal-full-list" role="list">
          {#each allPersonalEvents as item (item.id)}
            {@const isToday = todayPersonalEvents.some((t) => t.id === item.id)}
            <li class="personal-list-item" class:personal-item--today={isToday}>
              <div class="personal-item-left">
                <span class="personal-item-badge-icon" aria-hidden="true">
                  {getPersonalEventTypeIcon(item.type)}
                </span>
                <div class="personal-item-info">
                  <div class="personal-item-title-row">
                    <strong class="personal-item-title">{item.title.trim() || getPersonalEventTypeName(item.type, isEn)}</strong>
                    {#if item.frequency === 'monthly'}
                      <span class="personal-freq-tag">
                        {isEn ? 'Monthly' : 'Hàng tháng'}
                      </span>
                    {/if}
                    {#if isToday}
                      <span class="personal-today-tag">
                        {selectedIsToday ? (isEn ? 'Today ✨' : 'Hôm nay ✨') : localeStore.t.calendar.selectedDateTag}
                      </span>
                    {/if}
                  </div>
                  <div class="personal-item-date">
                    {formatPersonalEventDateText(item, isEn)}
                  </div>
                  {#if item.title.trim()}
                    <span class="personal-item-type-tag">
                      {getPersonalEventTypeName(item.type, isEn)}
                    </span>
                  {/if}
                  {#if item.note}
                    <p class="personal-item-note">"{item.note}"</p>
                  {/if}
                </div>
              </div>
              <button
                type="button"
                class="personal-delete-btn"
                onclick={() => handleDeleteEvent(item.id)}
                aria-label={isEn ? `Delete ${item.title}` : `Xóa ${item.title}`}
                title={isEn ? 'Delete' : 'Xóa'}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18M9 6V4h6v2M5 6l1 14h12l1-14M10 10v6M14 10v6" /></svg>
              </button>
            </li>
          {/each}
        </ul>
        <button type="button" class="personal-add-more-btn" onclick={openModal}>
          <span>+</span> {isEn ? 'Add Personal Anniversary' : 'Thêm ngày lễ cá nhân'}
        </button>
      {:else}
        <div class="personal-card-empty">
          <p class="personal-empty-text">
            {isEn
              ? 'No personal anniversaries added yet. Add family memorials, refuge or practice vows to be reminded automatically!'
              : 'Chưa có ngày kỷ niệm cá nhân nào. Hãy thêm ngày giỗ gia tiên, ngày quy y, phát nguyện... để được nhắc nhở chu đáo!'}
          </p>
          <button type="button" class="personal-add-first-btn" onclick={openModal}>
            <span>+</span> {isEn ? 'Add Personal Anniversary' : 'Thêm ngày lễ cá nhân'}
          </button>
        </div>
      {/if}
    </div>
  </div>
</section>

<!-- Modal Quản Lý Ngày Lễ Cá Nhân -->
<PersonalEventsModal
  open={personalModalOpen}
  onClose={() => personalModalOpen = false}
/>

<DeletePersonalEventDialog event={pendingDelete} {isEn} onCancel={() => pendingDelete = null} onConfirm={confirmPersonalDelete} />

<style>
  .home-daily-reminders {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }

  .reminders-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 8px;
    padding: 0 4px;
  }

  .reminders-title-box {
    display: flex;
    align-items: center;
    gap: 6px;
    min-width: 0;
  }

  .reminders-icon {
    font-size: 16px;
    line-height: 1;
    flex-shrink: 0;
  }

  .reminders-heading {
    margin: 0;
    font-size: var(--font-size-section-title);
    font-weight: 800;
    color: var(--text);
    letter-spacing: -0.01em;
    white-space: normal;
    line-height: 1.4;
  }

  .reminders-content {
    display: flex;
    flex-direction: column;
    gap: 10px;
    width: 100%;
  }

  /* Khung Hiển Thị Ngày Lễ Cá Nhân Dưới Thập Trai */
  .personal-reminder-card {
    display: flex;
    flex-direction: column;
    gap: 16px;
    padding: 16px;
    border-radius: 18px;
    background: var(--card);
    border: 1.5px solid var(--border);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
    transition: border-color 0.2s ease, box-shadow 0.2s ease, background 0.2s ease;
  }

  .personal-reminder-card.has-event {
    background: color-mix(in srgb, var(--gold) 9%, var(--card));
    border-color: color-mix(in srgb, var(--gold) 45%, var(--border));
    box-shadow: 0 4px 16px rgba(200, 150, 62, 0.12);
  }

  .personal-card-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding-bottom: 12px;
    border-bottom: 1px solid color-mix(in srgb, var(--border) 60%, transparent);
  }

  .personal-card-title-wrap {
    display: flex;
    align-items: center;
    gap: 8px;
    min-width: 0;
  }

  .personal-card-icon {
    font-size: 16px;
    line-height: 1;
    flex-shrink: 0;
  }

  .personal-card-heading {
    margin: 0;
    font-size: var(--font-size-card-title);
    font-weight: 700;
    color: var(--text);
    line-height: 1.45;
    overflow-wrap: anywhere;
  }

  .personal-title-end {
    white-space: nowrap;
  }

  .personal-count-pill {
    display: inline-grid;
    place-items: center;
    min-width: 20px;
    height: 20px;
    margin-left: 6px;
    padding: 0 5px;
    border: 0;
    border-radius: 999px;
    background: #dc2626;
    color: #fff;
    font-size: var(--font-size-meta);
    font-weight: 700;
    line-height: 1;
    vertical-align: middle;
    font-variant-numeric: tabular-nums;
    flex: 0 0 auto;
  }

  .personal-full-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .personal-list-item {
    display: grid;
    grid-template-columns: 28px minmax(0, 1fr) 44px;
    align-items: start;
    gap: 8px;
    padding: 12px 8px;
    background: var(--bg);
    border: 1px solid var(--border);
    border-radius: 12px;
  }

  .personal-item-left {
    display: contents;
  }

  .personal-item-badge-icon {
    display: grid;
    place-items: center;
    width: 28px;
    height: 44px;
    border-radius: 12px;
    background: var(--card);
    font-size: 22px;
    line-height: 1;
    flex-shrink: 0;
  }

  .personal-item-info {
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .personal-item-title-row {
    min-width: 0;
    display: flex;
    align-items: flex-start;
    flex-direction: row;
    gap: 6px;
    flex-wrap: wrap;
  }

  .personal-item-title {
    font-size: var(--font-size-card-title);
    line-height: 1.45;
    overflow-wrap: anywhere;
    font-weight: 700;
    color: var(--text);
  }

  .personal-item-type-tag {
    font-size: var(--font-size-meta);
    font-weight: 500;
    padding: 0;
    border-radius: 6px;
    background: transparent;
    color: var(--muted);
  }

  .personal-freq-tag {
    font-size: var(--font-size-meta);
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 6px;
    background: color-mix(in srgb, #ab47bc 15%, var(--card));
    color: #ab47bc;
  }

  .personal-today-tag {
    font-size: var(--font-size-meta);
    font-weight: 800;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--gold);
    color: #fff;
    box-shadow: 0 1px 4px rgba(200, 150, 62, 0.3);
  }

  .personal-item-date {
    font-size: var(--font-size-meta);
    color: var(--text);
    line-height: 1.6;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .personal-item-note {
    margin: 0;
    font-size: var(--font-size-body);
    line-height: 1.6;
    overflow-wrap: anywhere;
    color: var(--muted);
  }

  .personal-delete-btn {
    grid-column: 3;
    grid-row: 1;
    width: 44px;
    height: 44px;
    border-radius: 8px;
    border: 1px solid transparent;
    background: transparent;
    color: var(--muted);
    font-size: 18px;
    display: grid;
    place-items: center;
    cursor: pointer;
    flex-shrink: 0;
    transition: background 0.12s ease, border-color 0.12s ease, transform 0.1s ease;
  }

  .personal-delete-btn:hover {
    background: rgba(229, 57, 53, 0.15);
    border-color: #e53935;
  }

  .personal-delete-btn:focus-visible {
    outline: 2px solid var(--gold);
    outline-offset: 2px;
  }

  .personal-delete-btn:active {
    transform: scale(0.92);
  }

  .personal-add-more-btn {
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    width: 100%;
    padding: 12px 14px;
    min-height: 48px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--gold) 6%, transparent);
    border: 1px dashed color-mix(in srgb, var(--gold) 40%, var(--border));
    color: var(--gold);
    font-size: var(--font-size-label);
    font-weight: 700;
    cursor: pointer;
    transition: background 0.12s ease, border-color 0.12s ease;
  }

  .personal-add-more-btn:hover {
    background: color-mix(in srgb, var(--gold) 12%, transparent);
    border-color: var(--gold);
  }

  .personal-card-empty {
    display: flex;
    flex-direction: column;
    gap: 10px;
    padding: 6px 2px;
  }

  .personal-empty-text {
    margin: 0;
    font-size: var(--font-size-body);
    color: var(--muted);
    line-height: 1.65;
  }

  .personal-add-first-btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    gap: 6px;
    align-self: flex-start;
    padding: 12px 16px;
    min-height: 48px;
    border-radius: 10px;
    background: var(--gold);
    color: var(--on-gold);
    font-size: var(--font-size-label);
    font-weight: 700;
    border: none;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(200, 150, 62, 0.25);
    transition: opacity 0.12s ease, transform 0.1s ease;
  }

  .personal-add-first-btn:active {
    transform: scale(0.96);
  }

  /* Thập Trai Banner Card */
  .thaptrai-card {
    display: flex;
    align-items: center;
    gap: 12px;
    padding: 13px 15px;
    border-radius: 18px;
    background: var(--card);
    border: 1.5px solid var(--border);
    box-shadow: 0 2px 10px rgba(0, 0, 0, 0.04);
  }

  .thaptrai-body {
    flex: 1;
    min-width: 0;
    color: var(--text);
  }

  @media (max-width: 480px) {
    .reminders-heading {
      font-size: var(--font-size-section-title);
    }
  }
</style>
