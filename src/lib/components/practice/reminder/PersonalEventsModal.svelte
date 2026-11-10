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
      data-dialog-glass
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

          <!-- Bộ Chuyển Đổi Tab: Âm Lịch ⇄ Dương Lịch -->
          <div class="pem-mode-switch-wrap">
            <div class="pem-mode-tabs" role="tablist">
              <button
                type="button"
                role="tab"
                class="mode-tab-btn"
                class:mode-tab-btn--active={inputMode === 'lunar'}
                onclick={() => setMode('lunar')}
              >
                🌙 {isEn ? 'Lunar Input' : 'Nhập theo Âm lịch'}
              </button>
              <button
                type="button"
                role="tab"
                class="mode-tab-btn"
                class:mode-tab-btn--active={inputMode === 'solar'}
                onclick={() => setMode('solar')}
              >
                ☀️ {isEn ? 'Solar Input' : 'Nhập theo Dương lịch'}
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
                <select id="pem-select-month" aria-invalid={invalidField === 'pem-select-month' || undefined} aria-describedby={invalidField === 'pem-select-month' ? 'pem-validation-error' : undefined} class="pem-select" bind:value={newMonth} disabled={newFrequency === 'monthly'}>
                  {#each Array.from({ length: 12 }, (_, i) => i + 1) as month}
                    <option value={month}>
                      {isEn ? `Month ${pad(month)}` : `Tháng ${pad(month)}`}
                    </option>
                  {/each}
                </select>
              </div>

              <div class="pem-field">
                <label for="pem-select-freq" class="pem-label">
                  {isEn ? 'Frequency' : 'Chu kỳ nhắc'}
                </label>
                <select id="pem-select-freq" aria-invalid={invalidField === 'pem-select-freq' || undefined} aria-describedby={invalidField === 'pem-select-freq' ? 'pem-validation-error' : undefined} class="pem-select" bind:value={newFrequency}>
                  <option value="yearly">{isEn ? 'Yearly' : 'Hàng năm'}</option>
                  <option value="monthly">{isEn ? 'Monthly' : 'Hàng tháng'}</option>
                </select>
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
                <select id="pem-solar-month" aria-invalid={invalidField === 'pem-solar-month' || undefined} aria-describedby={invalidField === 'pem-solar-month' ? 'pem-validation-error' : undefined} class="pem-select" bind:value={newSolarMonth} onchange={handleSolarChange}>
                  {#each Array.from({ length: 12 }, (_, i) => i + 1) as month}
                    <option value={month}>{isEn ? `Month ${pad(month)}` : `Tháng ${pad(month)}`}</option>
                  {/each}
                </select>
              </div>

              <div class="pem-field">
                <label for="pem-solar-freq" class="pem-label">
                  {isEn ? 'Frequency' : 'Chu kỳ nhắc'}
                </label>
                <select id="pem-solar-freq" aria-invalid={invalidField === 'pem-solar-freq' || undefined} aria-describedby={invalidField === 'pem-solar-freq' ? 'pem-validation-error' : undefined} class="pem-select" bind:value={newFrequency}>
                  <option value="yearly">{isEn ? 'Yearly' : 'Hàng năm'}</option>
                  <option value="monthly">{isEn ? 'Monthly' : 'Hàng tháng'}</option>
                </select>
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
            {isEn ? '+ Save Personal Anniversary' : '+ Lưu Ngày Lễ Cá Nhân'}
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
  .pem-dialog::backdrop {
    background: rgba(0, 0, 0, 0.65);
  }

  .pem-dialog {
    width: min(580px, calc(100% - 24px));
    max-width: none;
    max-height: min(90vh, 90dvh);
    padding: 0;
    margin: auto;
    border-radius: 22px;
    background: var(--dialog-surface-background,var(--card));
    color: var(--text);
    border: 1.5px solid var(--dialog-surface-border,var(--border));
    box-shadow: var(--dialog-surface-shadow,var(--shadow-xl));
    display: flex;
    flex-direction: column;
    overflow: hidden;
    animation: pem-fade-in var(--motion-enter) var(--ease-standard);
  }

  /* Header */
  .pem-header {
    display: flex;
    align-items: flex-start;
    justify-content: space-between;
    gap: 12px;
    padding: 16px 20px 14px;
    border-bottom: 1px solid var(--border2);
    background: var(--bg2);
  }

  .pem-title-box {
    display: flex;
    align-items: flex-start;
    gap: 10px;
  }

  .pem-icon {
    font-size: 24px;
    line-height: 1;
    transform: translateY(2px);
  }

  .pem-title {
    margin: 0;
    font-size: 17.5px;
    font-weight: 800;
    color: var(--text);
    line-height: 1.25;
  }

  .pem-subtitle {
    margin: 4px 0 0;
    font-size: 12px;
    color: var(--muted);
  }

  .pem-close-btn {
    width: 44px;
    height: 44px;
    border-radius: 50%;
    border: 1px solid var(--border2);
    background: var(--card);
    color: var(--text);
    font-size: 15px;
    display: grid;
    place-items: center;
    cursor: pointer;
    flex-shrink: 0;
  }

  /* Body */
  .pem-body {
    padding: 16px 20px;
    overflow-y: auto;
    display: flex;
    flex-direction: column;
    gap: 16px;
  }

  /* Thông Báo Switch Card */
  .pem-notify-toggle-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
    padding: 12px 14px;
    border-radius: 16px;
    background: color-mix(in srgb, var(--gold) 10%, var(--card));
    border: 1.5px solid color-mix(in srgb, var(--gold) 35%, var(--border));
  }

  .notify-card-info {
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .notify-icon {
    font-size: 20px;
  }

  .notify-text-box {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .notify-title {
    font-size: 13.5px;
    font-weight: 750;
    color: var(--text);
  }

  .notify-desc {
    margin: 0;
    font-size: 11.5px;
    color: var(--muted);
  }

  .pem-switch {
    position: relative;
    display: inline-block;
    width: 44px;
    height: 24px;
    flex-shrink: 0;
  }

  .pem-switch input {
    opacity: 0;
    width: 0;
    height: 0;
  }

  .pem-slider {
    position: absolute;
    cursor: pointer;
    inset: 0;
    background-color: var(--border2, #ccc);
    transition: 0.25s;
    border-radius: 24px;
  }

  .pem-slider:before {
    position: absolute;
    content: '';
    height: 18px;
    width: 18px;
    left: 3px;
    bottom: 3px;
    background-color: white;
    transition: 0.25s;
    border-radius: 50%;
  }

  .pem-switch input:checked + .pem-slider {
    background-color: var(--gold, #c8963e);
  }

  .pem-switch input:checked + .pem-slider:before {
    transform: translateX(20px);
  }

  /* Form */
  .pem-form {
    display: flex;
    flex-direction: column;
    gap: 12px;
    padding: 14px 16px;
    border-radius: 18px;
    background: var(--card);
    border: 1.5px solid var(--border);
  }

  .pem-form-title {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14px;
    font-weight: 800;
    color: var(--gold);
  }

  .pem-mode-switch-wrap {
    display: flex;
    width: 100%;
  }

  .pem-mode-tabs {
    display: flex;
    width: 100%;
    gap: 6px;
    background: var(--bg2);
    padding: 4px;
    border-radius: 10px;
    border: 1px solid var(--border2);
  }

  .mode-tab-btn {
    flex: 1;
    min-height: 32px;
    border-radius: 8px;
    border: none;
    background: transparent;
    color: var(--muted);
    font-size: 12px;
    font-weight: 700;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .mode-tab-btn--active {
    background: var(--card);
    color: var(--gold);
    box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
  }

  .conversion-pill {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 8px 12px;
    border-radius: 10px;
    background: color-mix(in srgb, var(--gold) 12%, var(--bg2));
    border: 1px dashed var(--gold);
    font-size: 12px;
    color: var(--text);
  }

  .conv-icon {
    font-size: 15px;
  }

  .pem-error {
    padding: 8px 12px;
    border-radius: 10px;
    background: rgba(229, 57, 53, 0.12);
    border: 1px solid rgba(229, 57, 53, 0.3);
    color: #e53935;
    font-size: 12.5px;
    font-weight: 700;
  }

  .pem-field {
    display: flex;
    flex-direction: column;
    gap: 4px;
    flex: 1;
  }

  .pem-label {
    font-size: 12px;
    font-weight: 700;
    color: var(--text);
  }

  .pem-input,
  .pem-select {
    width: 100%;
    min-height: 38px;
    padding: 0 12px;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg);
    color: var(--text);
    font: inherit;
    font-size: 13.5px;
    box-sizing: border-box;
    outline: none;
  }

  .pem-input:focus,
  .pem-select:focus {
    border-color: var(--gold);
  }

  .pem-row-3 {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 8px;
  }

  .pem-submit-btn {
    min-height: 44px;
    border-radius: 12px;
    border: none;
    background: linear-gradient(135deg, var(--gold) 0%, #996d24 100%);
    color: #fff;
    font-size: 14px;
    font-weight: 750;
    cursor: pointer;
    box-shadow: 0 4px 12px rgba(200, 150, 62, 0.3);
    transition: transform 0.12s ease;
    margin-top: 4px;
  }

  .pem-submit-btn:active {
    transform: scale(0.98);
  }

  /* List */
  .pem-list-section {
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  .pem-list-heading {
    margin: 0;
    font-size: 14.5px;
    font-weight: 800;
    color: var(--text);
  }

  .pem-empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 24px 16px;
    border-radius: 16px;
    background: var(--bg2);
    border: 1.5px dashed var(--border2);
    text-align: center;
    color: var(--muted);
    font-size: 12.5px;
    gap: 4px;
  }

  .pem-empty-icon {
    font-size: 28px;
    margin-bottom: 2px;
  }

  .pem-list {
    list-style: none;
    margin: 0;
    padding: 0;
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  .pem-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 10px;
    padding: 10px 14px;
    border-radius: 14px;
    background: var(--card);
    border: 1px solid var(--border);
  }

  .pem-item-left {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    flex: 1;
    min-width: 0;
  }

  .pem-item-badge-icon {
    font-size: 22px;
    line-height: 1;
    transform: translateY(2px);
  }

  .pem-item-info {
    display: flex;
    flex-direction: column;
    gap: 2px;
    flex: 1;
    min-width: 0;
  }

  .pem-item-title-row {
    display: flex;
    align-items: center;
    gap: 6px;
    flex-wrap: wrap;
  }

  .pem-item-title {
    font-size: 13.5px;
    color: var(--text);
  }

  .pem-item-type-tag {
    font-size: 10.5px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 6px;
    background: var(--bg2);
    color: var(--muted);
  }

  .pem-freq-tag {
    font-size: 10.5px;
    font-weight: 700;
    padding: 1px 6px;
    border-radius: 6px;
    background: color-mix(in srgb, #ab47bc 15%, var(--card));
    color: #ab47bc;
  }

  .pem-item-date {
    font-size: 11.5px;
    color: var(--gold);
    font-weight: 700;
  }

  .pem-item-note {
    margin: 2px 0 0;
    font-size: 11.5px;
    color: var(--muted);
    font-style: italic;
  }

  .pem-delete-btn {
    width: 32px;
    height: 32px;
    border-radius: 8px;
    border: 1px solid var(--border2);
    background: transparent;
    font-size: 14px;
    display: grid;
    place-items: center;
    cursor: pointer;
    transition: background 0.12s ease;
  }

  .pem-delete-btn:hover {
    background: rgba(229, 57, 53, 0.15);
    border-color: #e53935;
  }

  /* Footer */
  .pem-footer {
    display: flex;
    justify-content: flex-end;
    padding: 12px 20px;
    border-top: 1px solid var(--border2);
    background: var(--bg2);
  }

  .pem-done-btn {
    min-height: 44px;
    padding: 0 20px;
    border-radius: 10px;
    border: 1px solid var(--border2);
    background: var(--card);
    color: var(--text);
    font-weight: 700;
    font-size: 13.5px;
    cursor: pointer;
  }

  @keyframes pem-fade-in {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }

  @media (max-width: 480px) {
    .pem-row-3 {
      grid-template-columns: 1fr;
    }
  }
</style>
