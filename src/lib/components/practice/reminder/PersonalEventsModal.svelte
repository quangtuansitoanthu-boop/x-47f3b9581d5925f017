<script lang="ts">
  import { onMount, tick, untrack } from 'svelte';
  import { alertInApp } from '$lib/browser/app-dialog';
  import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { defaultPersonalEventDate, lunarDateForSolarDay, personalEventFormIssue, solarDateForLunarDay } from '$lib/domain/personal-event-form';
  import PersonalEventsSyncStatus from './PersonalEventsSyncStatus.svelte';
  import DeletePersonalEventDialog from './DeletePersonalEventDialog.svelte';
  let pendingDelete = $state<PersonalLunarEvent | null>(null);
  import { modalDialog } from '$lib/browser/modal-dialog';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import {
    loadPersonalLunarEvents,
    addPersonalLunarEvent,
    deletePersonalLunarEvent,
    PERSONAL_EVENT_TYPES,
    type PersonalEventType,
    type PersonalLunarEvent,
    type PersonalEventFrequency,
    getPersonalEventTypeIcon,
    getPersonalEventTypeName,
    isPersonalEventsNotificationEnabled,
    setPersonalEventsNotificationEnabled,
    formatPersonalEventDateText,
  } from '$lib/browser/personal-lunar-events';
  import { triggerHaptic } from '$lib/utils/haptics';
  import { personalEventsUi } from '$lib/i18n/personal-events-ui';
  import { isNativeApp } from '$lib/browser/native-platform';
  import { loadReminderSettings, syncRemindersWithSystem } from '$lib/browser/practice-reminder-service';

  interface Props {
    open: boolean;
    onClose: () => void;
  }

  let { open, onClose }: Props = $props();

  const localeStore = getLocaleContext();
  const isEn = $derived(localeStore.current === 'en');

  let events = $state<PersonalLunarEvent[]>(loadPersonalLunarEvents());
  let notificationsEnabled = $state(isPersonalEventsNotificationEnabled());

  // Input Mode: 'lunar' | 'solar'
  let inputMode = $state<'lunar' | 'solar'>('lunar');

  // Form states
  let newTitle = $state('');
  let newDay = $state(15);
  let newMonth = $state(7);
  let newSolarDay = $state(1);
  let newSolarMonth = $state(8);
  let newFrequency = $state<PersonalEventFrequency>('yearly');
  let newType = $state<PersonalEventType>('gio-chap');
  let newNote = $state('');
  let formError = $state('');
  let invalidField = $state('');
  let formTouched = false;
  let reminderGeneration = 0;
  function personalOwner(): string | null {
    const session = getBrowserSessionSnapshot();
    return session.authenticated && session.user?.id ? String(session.user.id) : null;
  }
  let draftOwner = untrack(personalOwner);
  function ensureDraftOwner(): boolean {
    const owner = personalOwner();
    if (owner === draftOwner) return true;
    draftOwner = owner;
    reminderGeneration += 1;
    newTitle = '';
    newNote = '';
    inputMode = 'lunar';
    newFrequency = 'yearly';
    newType = 'gio-chap';
    formTouched = false;
    formError = '';
    invalidField = '';
    pendingDelete = null;
    resetDatesToToday();
    refreshList();
    return false;
  }
  $effect(() => {
    if (!open) reminderGeneration += 1;
    else untrack(() => {
      currentYear = new Date().getFullYear();
      if (!formTouched) resetDatesToToday();
    });
  });
  onMount(() => {
    const invalidateReminderSetup = () => { reminderGeneration += 1; ensureDraftOwner(); };
    refreshList();
    window.addEventListener('quangtu:personal-events-changed', refreshList);
    window.addEventListener(SESSION_CHANGE_EVENT, invalidateReminderSetup);
    return () => {
      reminderGeneration += 1;
      window.removeEventListener('quangtu:personal-events-changed', refreshList);
      window.removeEventListener(SESSION_CHANGE_EVENT, invalidateReminderSetup);
    };
  });

  let currentYear = $state(new Date().getFullYear());

  function resetDatesToToday(): void {
    const date = defaultPersonalEventDate(new Date());
    currentYear = date.year;
    newSolarDay = date.solarDay;
    newSolarMonth = date.solarMonth;
    newDay = date.lunarDay;
    newMonth = date.lunarMonth;
  }
  async function reportInvalid(message: string, field: string): Promise<void> {
    formError = message;
    invalidField = field;
    await alertInApp(message);
    await tick();
    if (open) document.getElementById(field)?.focus();
  }

  function clearFieldError(event: Event): void {
    formTouched = true;
    if (event.target instanceof HTMLElement && event.target.id === invalidField) {
      invalidField = '';
      formError = '';
    }
  }

  function pad(n: number): string {
    return String(n).padStart(2, '0');
  }

  // Format lunar day label according to Vietnamese custom:
  // 1-10: Mồng 1 - Mồng 10; 11-30: Ngày 11 - Ngày 30
  function formatLunarDayLabel(day: number, english: boolean): string {
    if (english) return `Day ${pad(day)}`;
    if (day <= 10) return `Mồng ${day}`;
    return `Ngày ${day}`;
  }

  // Bidirectional live conversions:
  // 1. If Lunar mode: calculate equivalent solar date for current year
  const convertedSolarDate = $derived.by(() => {
    try {
      const res = solarDateForLunarDay(Number(newDay), Number(newMonth), currentYear, { day: Number(newSolarDay), month: Number(newSolarMonth) });
      if (!res) return '';
      return `${pad(res.day)}/${pad(res.month)}/${res.year}`;
    } catch {
      return '';
    }
  });

  // 2. If Solar mode: calculate equivalent lunar date for current year
  const convertedLunar = $derived.by(() => {
    try {
      const day = Number(newSolarDay), month = Number(newSolarMonth);
      const res = lunarDateForSolarDay(day, month, currentYear);
      return res;
    } catch {
      return null;
    }
  });

  function handleSolarChange(): void {
    if (convertedLunar) {
      newDay = convertedLunar.day;
      newMonth = convertedLunar.month;
    }
  }

  function setMode(mode: 'lunar' | 'solar'): void {
    if (mode === inputMode) return;
    const copy = personalEventsUi[isEn ? 'en' : 'vi'];
    if (mode === 'solar') {
      const solar = solarDateForLunarDay(Number(newDay), Number(newMonth), currentYear, { day: Number(newSolarDay), month: Number(newSolarMonth) });
      if (!solar) { void alertInApp(copy.noEquivalentDate); return; }
      newSolarDay = solar.day;
      newSolarMonth = solar.month;
    } else {
      if (!convertedLunar) { void alertInApp(copy.noEquivalentDate); return; }
      newDay = convertedLunar.day;
      newMonth = convertedLunar.month;
    }
    formTouched = true;
    triggerHaptic('selection');
    inputMode = mode;
    formError = '';
    invalidField = '';
  }
  function toggleNotifications(event: MouseEvent): void {
    reminderGeneration += 1;
    formError = '';
    triggerHaptic('light');
    const enabled = !notificationsEnabled;
    if (!setPersonalEventsNotificationEnabled(enabled)) {
      event.preventDefault();
      formError = personalEventsUi[isEn ? 'en' : 'vi'].storageError;
      return;
    }
    notificationsEnabled = enabled;
    if (notificationsEnabled) void setupPersonalReminders(false);
  }

  function reminderDraftSignature(): string {
    return JSON.stringify([inputMode, newTitle, newDay, newMonth, newSolarDay, newSolarMonth, newFrequency, newType, newNote]);
  }

  async function setupPersonalReminders(savedEvent: boolean): Promise<void> {
    if (!isNativeApp() || !notificationsEnabled) return;
    const generation = ++reminderGeneration;
    const draft = reminderDraftSignature();
    const copy = personalEventsUi[isEn ? 'en' : 'vi'];
    const isCurrent = () => open && generation === reminderGeneration && draft === reminderDraftSignature();
    const settings = loadReminderSettings();
    if (!settings.masterEnabled) {
      formError = savedEvent ? copy.savedRemindersDisabled : copy.remindersDisabled;
      return;
    }
    try {
      // Cài đặt tường minh chỉ từ thao tác lưu/bật của người dùng; đồng bộ nền vẫn không xin quyền.
      const result = await syncRemindersWithSystem(settings, localeStore.current);
      if (!result.success && isCurrent()) formError = savedEvent ? copy.savedReminderError : copy.reminderError;
    } catch {
      if (isCurrent()) formError = savedEvent ? copy.savedReminderError : copy.reminderError;
    }
  }

  function refreshList(): void {
    events = loadPersonalLunarEvents();
  }

  function handleAddEvent(event: SubmitEvent): void {
    event.preventDefault();
    if (!ensureDraftOwner()) return;
    reminderGeneration += 1;
    const copy = personalEventsUi[isEn ? 'en' : 'vi'];
    const issue = personalEventFormIssue({ title: newTitle, frequency: newFrequency, type: newType, calendarMode: inputMode,
      lunarDay: Number(newDay), lunarMonth: Number(newMonth), solarDay: Number(newSolarDay), solarMonth: Number(newSolarMonth) }, PERSONAL_EVENT_TYPES.map(item => item.type));
    if (issue) {
      const fields = { missingTitle: 'pem-input-title', missingFrequency: inputMode === 'solar' ? 'pem-solar-freq' : 'pem-select-freq', missingType: 'pem-select-type',
        invalidLunarDay: 'pem-select-day', invalidLunarMonth: 'pem-select-month', invalidSolarDay: 'pem-solar-day', invalidSolarMonth: 'pem-solar-month', invalidSolarDate: 'pem-solar-day' };
      void reportInvalid(copy[issue], fields[issue]);
      return;
    }
    formError = '';
    invalidField = '';
    triggerHaptic('medium');

    const finalDay = inputMode === 'solar' && convertedLunar ? convertedLunar.day : Number(newDay);
    const finalMonth = inputMode === 'solar' && convertedLunar ? convertedLunar.month : Number(newMonth);

    try {
      addPersonalLunarEvent({
        title: newTitle.trim(),
        lunarDay: finalDay,
        lunarMonth: newFrequency === 'monthly' ? 0 : finalMonth,
        frequency: newFrequency,
        type: newType,
        note: newNote.trim() || undefined,
        calendarMode: inputMode,
        ...(inputMode === 'solar' ? { solarDay: Number(newSolarDay), solarMonth: Number(newSolarMonth) } : {}),
      });
    } catch {
      formError = personalEventsUi[isEn ? 'en' : 'vi'].storageError;
      return;
    }

    newTitle = '';
    newNote = '';
    formTouched = false;
    resetDatesToToday();
    refreshList();
    void setupPersonalReminders(true);
  }

  function handleDelete(id: string): void {
    reminderGeneration += 1;
    pendingDelete = events.find((item) => item.id === id) ?? null;
  }

  function confirmPersonalDelete(): void {
    if (!pendingDelete) return;
    triggerHaptic('light');
    formError = '';
    try {
      deletePersonalLunarEvent(pendingDelete.id);
    } catch {
      formError = personalEventsUi[isEn ? 'en' : 'vi'].storageError;
      // Đóng lớp xác nhận để người dùng đọc lỗi trong biểu mẫu phía dưới.
      pendingDelete = null;
      return;
    }
    pendingDelete = null;
    refreshList();
  }
</script>

{#if open}
    <dialog
      use:modalDialog
      class="pem-dialog"
      aria-labelledby="pem-title"
      oncancel={(event) => { event.preventDefault(); onClose(); }}
    >
      <!-- Header -->
      <div class="pem-header">
        <div class="pem-title-box">
          <span class="pem-icon" aria-hidden="true">🕯️</span>
          <div>
            <h2 id="pem-title" class="pem-title" tabindex="-1" data-modal-focus>
              {isEn ? 'Personal Lunar Anniversaries' : 'Quản lý Ngày Lễ Cá Nhân'}
            </h2>
            <p class="pem-subtitle">
              {isEn
                ? 'Save ancestral memorials, refuge vows & family days'
                : 'Lưu ngày giỗ chạp, quy y, phát nguyện, phóng sinh theo lịch âm'}
            </p>
          </div>
        </div>

        <button
          type="button"
          class="pem-close-btn"
          onclick={onClose}
          aria-label={isEn ? 'Close dialog' : 'Đóng cửa sổ'}
        >
          ✕
        </button>
      </div>

      <!-- Main Body -->
      <div class="pem-body">
        <!-- Công tắc bật thông báo (Mặc định BẬT) -->
        <div class="pem-notify-toggle-card">
          <div class="notify-card-info">
            <span class="notify-icon" aria-hidden="true">🔔</span>
            <div class="notify-text-box">
              <strong class="notify-title">
                {isEn ? 'Personal Anniversary Reminders' : 'Thông Báo Ngày Lễ Cá Nhân'}
              </strong>
              <p class="notify-desc">
                {isEn ? 'Remind you on morning of personal anniversaries' : 'Nhắc nhở chu đáo vào buổi sáng của ngày lễ cá nhân'}
              </p>
            </div>
          </div>

          <label class="pem-switch" aria-label={isEn ? 'Toggle anniversary reminder' : 'Bật tắt nhắc nhở ngày lễ cá nhân'}>
            <input
              type="checkbox"
              checked={notificationsEnabled}
              onclick={toggleNotifications}
            />
            <span class="pem-slider"></span>
          </label>
        </div>

        <!-- Form Thêm Mới -->
        <form class="pem-form" onsubmit={handleAddEvent} oninput={clearFieldError} onchange={clearFieldError}>
          <div class="pem-form-title">
            <span>+</span>
            <strong>{isEn ? 'Add Personal Anniversary' : 'Thêm Ngày Lễ Cá Nhân Mới'}</strong>
          </div>

          {#if formError}
            <div id="pem-validation-error" class="pem-error" role="alert">{formError}</div>
          {/if}

          <!-- Tên Sự Kiện -->
          <div class="pem-field">
            <label for="pem-input-title" class="pem-label">
              {isEn ? 'Event Name / Title *' : 'Tên ngày lễ / Sự kiện *'}
            </label>
            <input
              id="pem-input-title"
              aria-invalid={invalidField === 'pem-input-title' || undefined}
              aria-describedby={invalidField === 'pem-input-title' ? 'pem-validation-error' : undefined}
              type="text"
              class="pem-input"
              bind:value={newTitle}
              placeholder={isEn ? 'e.g. Grandfather Memorial, Refuge Anniversary...' : 'Ví dụ: Giỗ ông nội, Kỷ niệm ngày Quy y...'}
              maxlength={80}
            />
          </div>

          <!-- Phân loại & Ghi chú -->
          <div class="pem-field">
            <label for="pem-select-type" class="pem-label">
              {isEn ? 'Event Type' : 'Phân loại sự kiện'}
            </label>
            <select id="pem-select-type" aria-invalid={invalidField === 'pem-select-type' || undefined} aria-describedby={invalidField === 'pem-select-type' ? 'pem-validation-error' : undefined} class="pem-select" bind:value={newType}>
              {#each PERSONAL_EVENT_TYPES as t}
                <option value={t.type}>
                  {t.icon} {isEn ? t.nameEn : t.nameVi}
                </option>
              {/each}
            </select>
          </div>

          <!-- Bộ Chuyển Đổi Tab: Âm Lịch ⇄ Dương Lịch -->
          <div class="pem-mode-switch-wrap">
            <div class="pem-mode-tabs" role="group" aria-label={isEn ? 'Calendar' : 'Lịch'}>
              <button
                type="button"
                class="mode-tab-btn"
                class:mode-tab-btn--active={inputMode === 'lunar'}
                aria-pressed={inputMode === 'lunar'}
                onclick={() => setMode('lunar')}
              >
                {isEn ? 'Lunar' : 'Âm lịch'}
              </button>
              <button
                type="button"
                class="mode-tab-btn"
                class:mode-tab-btn--active={inputMode === 'solar'}
                aria-pressed={inputMode === 'solar'}
                onclick={() => setMode('solar')}
              >
                {isEn ? 'Solar' : 'Dương lịch'}
              </button>
            </div>
          </div>

          <!-- Nhập theo Âm lịch -->
          {#if inputMode === 'lunar'}
            <div class="pem-row-3">
              <div class="pem-field">
                <label for="pem-select-day" class="pem-label">
                  {isEn ? 'Lunar Day' : 'Ngày Âm'}
                </label>
                <select id="pem-select-day" aria-invalid={invalidField === 'pem-select-day' || undefined} aria-describedby={invalidField === 'pem-select-day' ? 'pem-validation-error' : undefined} class="pem-select" bind:value={newDay}>
                  {#each Array.from({ length: 30 }, (_, i) => i + 1) as day}
                    <option value={day}>
                      {formatLunarDayLabel(day, isEn)}
                    </option>
                  {/each}
                </select>
              </div>

              <div class="pem-field">
                <label for="pem-select-month" class="pem-label">
                  {isEn ? 'Lunar Month' : 'Tháng Âm'}
                </label>
                <select id="pem-select-month" aria-invalid={invalidField === 'pem-select-month' || undefined} aria-describedby={invalidField === 'pem-select-month' ? 'pem-validation-error' : undefined} class="pem-select" value={newFrequency === 'monthly' ? 0 : newMonth} disabled={newFrequency === 'monthly'} onchange={(event) => { newMonth = Number(event.currentTarget.value);  }}>
                  {#if newFrequency === 'monthly'}<option value={0}>{isEn ? 'Every month' : 'Mỗi tháng'}</option>{:else}
                    {#each Array.from({ length: 12 }, (_, i) => i + 1) as month (month)}<option value={month}>{isEn ? `Month ${month}` : `Tháng ${month}`}</option>{/each}
                  {/if}
                </select>
              </div>


            </div>

          <div class="pem-field">
            <span class="pem-label" id="pem-frequency-label">{isEn ? 'Recurrence' : 'Lặp lại'}</span>
            <div id="pem-select-freq" class="pem-frequency" role="group" aria-labelledby="pem-frequency-label" tabindex="-1" data-invalid={invalidField === 'pem-select-freq' || invalidField === 'pem-solar-freq' || undefined}>
              {#each ['yearly', 'monthly'] as frequency (frequency)}
                <button type="button" aria-pressed={newFrequency === frequency} onclick={() => { newFrequency = frequency as PersonalEventFrequency; formTouched = true; invalidField = ''; formError = ''; }}>{frequency === 'yearly' ? (isEn ? 'Yearly' : 'Hàng năm') : (isEn ? 'Monthly' : 'Hàng tháng')}</button>
              {/each}
            </div>
          </div>
            <!-- Quy đổi Dương lịch tương ứng -->
            <div class="conversion-pill">
              <span class="conv-icon" aria-hidden="true">☀️</span>
              <span class="conv-text">
                {isEn ? 'Equivalent Solar Date in' : 'Dương lịch tương ứng năm'} {currentYear}: <strong>{convertedSolarDate}</strong>
              </span>
            </div>
          {:else}
            <!-- Nhập theo Dương lịch (Tự động đổi sang Âm lịch) -->
            <div class="pem-row-3">
              <div class="pem-field">
                <label for="pem-solar-day" class="pem-label">
                  {isEn ? 'Solar Day' : 'Ngày Dương'}
                </label>
                <select id="pem-solar-day" aria-invalid={invalidField === 'pem-solar-day' || undefined} aria-describedby={invalidField === 'pem-solar-day' ? 'pem-validation-error' : undefined} class="pem-select" bind:value={newSolarDay} onchange={handleSolarChange}>
                  {#each Array.from({ length: 31 }, (_, i) => i + 1) as day}
                    <option value={day}>{isEn ? `Day ${pad(day)}` : `Ngày ${pad(day)}`}</option>
                  {/each}
                </select>
              </div>

              <div class="pem-field">
                <label for="pem-solar-month" class="pem-label">
                  {isEn ? 'Solar Month' : 'Tháng Dương'}
                </label>
                <select id="pem-solar-month" aria-invalid={invalidField === 'pem-solar-month' || undefined} aria-describedby={invalidField === 'pem-solar-month' ? 'pem-validation-error' : undefined} class="pem-select" value={newFrequency === 'monthly' ? 0 : newSolarMonth} disabled={newFrequency === 'monthly'} onchange={(event) => { newSolarMonth = Number(event.currentTarget.value); handleSolarChange(); }}>
                  {#if newFrequency === 'monthly'}<option value={0}>{isEn ? 'Every month' : 'Mỗi tháng'}</option>{:else}
                    {#each Array.from({ length: 12 }, (_, i) => i + 1) as month (month)}<option value={month}>{isEn ? `Month ${month}` : `Tháng ${month}`}</option>{/each}
                  {/if}
                </select>
              </div>


            </div>

          <div class="pem-field">
            <span class="pem-label" id="pem-frequency-label">{isEn ? 'Recurrence' : 'Lặp lại'}</span>
            <div id="pem-solar-freq" class="pem-frequency" role="group" aria-labelledby="pem-frequency-label" tabindex="-1" data-invalid={invalidField === 'pem-select-freq' || invalidField === 'pem-solar-freq' || undefined}>
              {#each ['yearly', 'monthly'] as frequency (frequency)}
                <button type="button" aria-pressed={newFrequency === frequency} onclick={() => { newFrequency = frequency as PersonalEventFrequency; formTouched = true; invalidField = ''; formError = ''; }}>{frequency === 'yearly' ? (isEn ? 'Yearly' : 'Hàng năm') : (isEn ? 'Monthly' : 'Hàng tháng')}</button>
              {/each}
            </div>
          </div>
            <!-- Quy đổi Âm lịch tương ứng -->
            <div class="conversion-pill">
              <span class="conv-icon" aria-hidden="true">🌙</span>
              <span class="conv-text">
                {#if convertedLunar}
                  {isEn ? 'Equivalent Lunar Date:' : 'Âm lịch tự quy đổi:'} <strong>{formatLunarDayLabel(convertedLunar.day, isEn)} {isEn ? 'Month' : 'Tháng'} {pad(convertedLunar.month)}</strong>
                {:else}
                  {isEn ? 'Invalid date' : 'Ngày không hợp lệ'}
                {/if}
              </span>
            </div>
          {/if}

          <div class="pem-field">
            <label for="pem-input-note" class="pem-label">
              {isEn ? 'Notes (Optional)' : 'Ghi chú (Tùy chọn)'}
            </label>
            <input
              id="pem-input-note"
              type="text"
              class="pem-input"
              bind:value={newNote}
              placeholder={isEn ? 'e.g. Vegetarian feast & recite Ksitigarbha Sutra' : 'Ví dụ: Làm mâm cơm chay & tụng kinh Địa Tạng'}
              maxlength={120}
            />
          </div>

          <button type="submit" class="pem-submit-btn">
            {personalEventsUi[isEn ? 'en' : 'vi'].saveEvent}
          </button>
        </form>

        <!-- Danh sách hiện có -->
        <div class="pem-list-section">
          <PersonalEventsSyncStatus {isEn} />
          <h3 class="pem-list-heading">
            {isEn ? 'Saved Anniversaries' : 'Danh Sách Ngày Lễ Đã Lưu'} ({events.length})
          </h3>

          {#if events.length === 0}
            <div class="pem-empty">
              <span class="pem-empty-icon" aria-hidden="true">📿</span>
              <p>{isEn ? 'No personal anniversaries saved yet.' : 'Chưa có ngày lễ cá nhân nào được lưu.'}</p>
              <span>{isEn ? 'Add an anniversary above to receive lunar reminders!' : 'Hãy thêm ngày giỗ chạp hoặc ngày quy y ở trên để app nhắc nhở bạn!'}</span>
            </div>
          {:else}
            <ul class="pem-list" role="list">
              {#each events as item (item.id)}
                <li class="pem-item">
                  <div class="pem-item-left">
                    <span class="pem-item-badge-icon" aria-hidden="true">
                      {getPersonalEventTypeIcon(item.type)}
                    </span>
                    <div class="pem-item-info">
                      <div class="pem-item-title-row">
                        <strong class="pem-item-title">{item.title}</strong>
                        <span class="pem-item-type-tag">
                          {getPersonalEventTypeName(item.type, isEn)}
                        </span>
                        {#if item.frequency === 'monthly' || (item.calendarMode !== 'solar' && Number(item.lunarMonth) === 0)}
                          <span class="pem-freq-tag">
                            {isEn ? 'Monthly' : 'Hàng tháng'}
                          </span>
                        {/if}
                      </div>
                      <div class="pem-item-date">
                        {formatPersonalEventDateText(item, isEn)}
                      </div>
                      {#if item.note}
                        <p class="pem-item-note">"{item.note}"</p>
                      {/if}
                    </div>
                  </div>

                  <button
                    type="button"
                    class="pem-delete-btn"
                    onclick={() => handleDelete(item.id)}
                    title={isEn ? 'Delete anniversary' : 'Xóa ngày lễ này'}
                    aria-label={isEn ? `Delete ${item.title}` : `Xóa ${item.title}`}
                  >
                    🗑️
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </div>

      <!-- Footer -->
      <div class="pem-footer">
        <button type="button" class="pem-done-btn" onclick={onClose}>
          {isEn ? 'Done' : 'Hoàn tất'}
        </button>
      </div>
    </dialog>
{/if}

<DeletePersonalEventDialog event={pendingDelete} {isEn} onCancel={() => pendingDelete = null} onConfirm={confirmPersonalDelete} />

<style>
  .pem-dialog::backdrop { background: var(--practice-dialog-backdrop); }
  .pem-dialog { box-sizing: border-box; width: min(var(--practice-dialog-width), calc(100% - var(--space-page))); max-width: none; max-height: var(--practice-dialog-height); margin: auto; padding: 0; border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--bg); color: var(--text); display: flex; flex-direction: column; overflow: hidden; font: inherit; font-size: var(--font-size-body); }
  .pem-header, .pem-footer { display: flex; justify-content: space-between; gap: var(--dialog-action-gap); padding: var(--space-page); border-bottom: 1px solid var(--border); }
  .pem-header { align-items: flex-start; }
  .pem-title-box, .notify-card-info, .pem-item-left { display: flex; align-items: flex-start; gap: var(--dialog-action-gap); min-width: 0; }
  .pem-title { margin: 0; font-size: var(--font-size-section-title); line-height: 1.5; }
  .pem-subtitle, .notify-desc { margin: var(--dialog-action-gap) 0 0; color: var(--text2); font-size: var(--font-size-label); line-height: 1.6; }
  .pem-icon, .notify-icon, .pem-empty-icon, .pem-item-badge-icon { font-size: var(--font-size-section-title); }
  button { box-sizing: border-box; min-width: var(--touch-target-size); min-height: var(--touch-target-size); padding: var(--dialog-action-gap) var(--dialog-action-space); border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--card); color: var(--text); font: inherit; cursor: pointer; }
  .pem-close-btn, .pem-delete-btn { flex-shrink: 0; padding: var(--dialog-action-gap); }
  .pem-body { padding: var(--space-page); min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: var(--space-page); }
  .pem-notify-toggle-card { display: flex; justify-content: space-between; align-items: center; gap: var(--dialog-action-gap); padding-bottom: var(--dialog-action-space); border-bottom: 1px solid var(--border); }
  .notify-title { font-size: var(--font-size-card-title); }
  .pem-switch { position: relative; width: calc(var(--touch-target-size) + var(--dialog-action-gap)); height: var(--touch-target-size); flex-shrink: 0; }
  .pem-switch input { position: absolute; margin: 0; inset: 0; width: 100%; height: 100%; opacity: 0; cursor: pointer; }
  .pem-slider { pointer-events: none; position: absolute; inset: var(--dialog-action-gap) 0; border: 1px solid var(--border); border-radius: var(--radius-card); background: var(--bg3); }
  .pem-slider::before { content: ''; position: absolute; width: var(--space-page); height: var(--space-page); top: 50%; left: calc(var(--dialog-action-gap) / 2); transform: translateY(-50%); border-radius: 50%; background: var(--card); }
  .pem-switch input:checked + .pem-slider { background: var(--gold); border-color: var(--gold); }
  .pem-switch input:checked + .pem-slider::before { left: auto; right: calc(var(--dialog-action-gap) / 2); background: var(--white); }
  .pem-switch input:focus-visible + .pem-slider { outline: 2px solid var(--gold); outline-offset: 2px; }
  .pem-form { display: flex; flex-direction: column; gap: var(--dialog-action-space); min-width: 0; }
  .pem-form-title { display: flex; gap: var(--dialog-action-gap); font-size: var(--font-size-section-title); }
  .pem-field { display: flex; flex-direction: column; gap: var(--dialog-action-gap); min-width: 0; }
  .pem-label { color: var(--text2); line-height: 1.6; }
  .pem-input, .pem-select { box-sizing: border-box; width: 100%; min-width: 0; min-height: calc(var(--touch-target-size) + var(--dialog-action-gap) / 2); padding: var(--dialog-action-gap); border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--card); color: var(--text); font: inherit; font-size: var(--font-size-input); }
  .pem-select:disabled { background: var(--bg3); color: var(--text2); cursor: not-allowed; }
  .pem-mode-tabs, .pem-frequency { display: flex; padding: calc(var(--dialog-action-gap) / 2); gap: calc(var(--dialog-action-gap) / 2); border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--card); }
  .pem-mode-switch-wrap { min-width: 0; }
  .pem-mode-tabs button, .pem-frequency button { flex: 1; min-width: 0; padding: var(--dialog-action-gap); border: 0; border-radius: var(--radius); background: transparent; font-weight: 600; }
  .pem-mode-tabs button[aria-pressed='true'] { background: var(--gold); color: var(--on-gold); }
  .pem-frequency button[aria-pressed='true'] { background: var(--gold-light); }
  .pem-row-3 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--dialog-action-space); }
  .conversion-pill { color: var(--text2); line-height: 1.6; overflow-wrap: anywhere; }
  .conv-icon { display: none; }
  .conversion-pill strong { color: var(--brown); font-weight: 600; }
  :global([data-theme='dark']) .conversion-pill strong { color: var(--gold2); }
  .pem-error { color: var(--danger-text); line-height: 1.6; }
  [aria-invalid='true'], [data-invalid='true'] { border-color: var(--danger-text); }
  .pem-submit-btn { min-height: calc(var(--touch-target-size) + var(--dialog-action-gap) / 2); background: var(--gold); color: var(--on-gold); font-weight: 600; }
  :is(button, input, select, [tabindex]):focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
  .pem-list-section { display: flex; flex-direction: column; gap: var(--dialog-action-space); padding-top: var(--dialog-action-space); border-top: 1px solid var(--border); }
  .pem-list-heading { margin: 0; font-size: var(--font-size-section-title); }
  .pem-empty { color: var(--text2); line-height: 1.6; }
  .pem-empty p { margin: var(--dialog-action-gap) 0; }
  .pem-list { list-style: none; margin: 0; padding: 0; display: flex; flex-direction: column; gap: var(--dialog-action-space); }
  .pem-item { display: flex; align-items: center; justify-content: space-between; gap: var(--dialog-action-gap); padding-bottom: var(--dialog-action-space); border-bottom: 1px solid var(--border); }
  .pem-item-left, .pem-item-info { flex: 1; min-width: 0; }
  .pem-item-info { overflow-wrap: anywhere; }
  .pem-item-title-row { display: flex; flex-wrap: wrap; align-items: center; gap: var(--dialog-action-gap); }
  .pem-item-title { font-size: var(--font-size-card-title); }
  .pem-item-type-tag, .pem-freq-tag, .pem-item-date, .pem-item-note { color: var(--text2); font-size: var(--font-size-label); line-height: 1.6; }
  .pem-item-note { margin: var(--dialog-action-gap) 0 0; font-style: italic; }
  .pem-delete-btn { color: var(--danger-text); background: transparent; }
  .pem-footer { justify-content: flex-end; border-top: 1px solid var(--border); border-bottom: 0; padding-bottom: max(var(--space-page), env(safe-area-inset-bottom, 0px)); }
</style>
