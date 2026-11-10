<script lang="ts">
  import SettingsSection from '$lib/components/shared/SettingsSection.svelte';
  import { settingsHubCopy } from '$lib/i18n/settings-hub';
  import { personalEventsUi } from '$lib/i18n/personal-events-ui';
  import { Check, CircleAlert } from '@lucide/svelte';
  let { activeSection = $bindable('') }: { activeSection?: string } = $props();
  import PersonalEventsSyncStatus from './PersonalEventsSyncStatus.svelte';
  import PersonalReminderTiming from './PersonalReminderTiming.svelte';
  import DeletePersonalEventDialog from './DeletePersonalEventDialog.svelte';
  let pendingDelete = $state<PersonalLunarEvent | null>(null);
  import { onMount, tick } from 'svelte';
  import { alertInApp } from '$lib/browser/app-dialog';
  import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
  import { defaultPersonalEventDate, lunarDateForSolarDay, personalEventFormIssue, solarDateForLunarDay } from '$lib/domain/personal-event-form';
  import { nativePlatform } from '$lib/browser/native-platform';
  import { reminderPlatformText } from '$lib/i18n/reminder-platform';
  import { reminderSyncStatusText } from '$lib/i18n/reminder-sync-status';
  import { getLocaleContext } from '$lib/stores/locale.svelte';
  import { triggerHaptic } from '$lib/utils/haptics';
  import {
    getUnifiedNotificationPermission,
    requestUnifiedNotificationPermission,
    getExactReminderPermission,
    requestExactReminderPermission,
  } from '$lib/browser/native-notifications';
  import {
    loadReminderSettings,
    saveReminderSettings,
    syncRemindersWithSystem,
    subscribeReminderSyncStatus,
    sendTestNotification,
    resolvePersonalReminderConfig,
    type PersonalReminderConfig,
    type PracticeReminderSettings,
    type DailyScheduleItem,
    type ReminderSyncResult,
  } from '$lib/browser/practice-reminder-service';
  import {
    loadPersonalLunarEvents,
    addPersonalLunarEvent,
    updatePersonalLunarEvent,
    deletePersonalLunarEvent,
    isPersonalEventsNotificationEnabled,
    setPersonalEventsNotificationEnabled,
    PERSONAL_EVENT_TYPES,
    getPersonalEventTypeIcon,
    getPersonalEventTypeName,
    formatPersonalEventDateText,
    type PersonalLunarEvent,
    type PersonalEventType,
    type PersonalEventFrequency,
  } from '$lib/browser/personal-lunar-events';

  const localeStore = getLocaleContext();
  const t = $derived(localeStore.t.settings.reminders);
  const hub = $derived(settingsHubCopy[localeStore.current === 'en' ? 'en' : 'vi']);
  const isEn = $derived(localeStore.current === 'en');
  const platformText = $derived(reminderPlatformText[isEn ? 'en' : 'vi']);
  let platform = $state<'android' | 'ios' | 'web' | null>(null);

  let settings = $state<PracticeReminderSettings>(loadReminderSettings());
  const dailySummary = $derived(settings.dailySchedules.filter(slot => slot.enabled).map(slot => `${slot.id === 'morning' ? t.morningSlot : slot.id === 'evening' ? t.eveningSlot : slot.label} ${slot.time}`).join(' · ') || hub.dailyEmpty);
  let permissionStatus = $state<'granted' | 'denied' | 'prompt' | 'unsupported'>('prompt');
  let permissionChecked = $state(false);
  let iosPermissionAttempted = $state(false);
  let exactPermission = $state<'granted' | 'denied' | 'unsupported'>('unsupported');
  let feedbackMessage = $state('');
  let feedbackPersonal = $state(false);
  let lastSyncResult = $state<ReminderSyncResult | null>(null);
  let feedbackGeneration = 0;
  let feedbackAlive = true;
  let feedbackIsError = $state(false);
  let feedbackTimer: ReturnType<typeof setTimeout> | null = null;
  let testing = $state(false);
  let syncing = $state(false);
  let personalEventsList = $state<PersonalLunarEvent[]>(loadPersonalLunarEvents());
  let personalNotifyEnabled = $state(isPersonalEventsNotificationEnabled());
  let editingPersonalEventId = $state<string | null>(null);

  let currentYear = $state(new Date().getFullYear());
  let personalDraft = $state<PersonalLunarEvent | null>(null);
  let personalDraftBase = $state<PersonalLunarEvent | null>(null);
  let personalDraftOwner = '';
  let personalDraftYearlyLunarMonth = 1;
  let personalDraftInvalidField = $state('');
  const visiblePersonalEvents = $derived(personalDraft
    ? personalDraftBase && personalEventsList.some(event => event.id === personalDraft!.id) ? personalEventsList.map(event => event.id === personalDraft!.id ? personalDraft! : event)
      : [...personalEventsList, personalDraft]
    : personalEventsList);

  function personalOwner(): string {
    const session = getBrowserSessionSnapshot();
    return session.authenticated ? session.user?.id ?? 'anonymous' : 'anonymous';
  }

  function clearPersonalDraft(): void {
    personalDraft = null;
    personalDraftBase = null;
    personalDraftInvalidField = '';
    editingPersonalEventId = null;
    personalDraftYearlyLunarMonth = 1;
  }

  function effectivePersonalFrequency(event: PersonalLunarEvent): PersonalEventFrequency {
    return event.frequency ?? (Number(event.lunarMonth) === 0 ? 'monthly' : 'yearly');
  }

  function beginPersonalEdit(event: PersonalLunarEvent): void {
    if (editingPersonalEventId === event.id) {
      if (personalDraftBase && JSON.stringify(personalDraft) === JSON.stringify({ ...personalDraftBase, frequency: effectivePersonalFrequency(personalDraftBase) })) {
        clearPersonalDraft();
        return;
      }
      editingPersonalEventId = null;
      return;
    }
    if (personalDraft && personalDraft.id !== event.id) {
      void alertInApp(personalEventsUi[isEn ? 'en' : 'vi'].finishCurrentDraft);
      editingPersonalEventId = personalDraft.id;
      return;
    }
    if (!personalDraft) {
      personalDraftBase = { ...event };
      personalDraft = { ...event, frequency: effectivePersonalFrequency(event) };
      personalDraftYearlyLunarMonth = event.lunarMonth || 1;
      personalDraftOwner = personalOwner();
    }
    currentYear = new Date().getFullYear();
    editingPersonalEventId = event.id;
  }

  function pad(n: number): string { return String(n).padStart(2, '0'); }
  function getEventMode(event: PersonalLunarEvent): 'lunar' | 'solar' { return event.calendarMode || 'lunar'; }
  function selectedPersonalEvent(id: string): PersonalLunarEvent | undefined {
    return personalDraft?.id === id ? personalDraft : personalEventsList.find(event => event.id === id);
  }
  function equivalentSolar(event: PersonalLunarEvent) {
    const today = defaultPersonalEventDate(new Date());
    return solarDateForLunarDay(Number(event.lunarDay), Number(event.lunarMonth || today.lunarMonth), currentYear,
      { day: Number(event.solarDay || today.solarDay), month: Number(event.solarMonth || today.solarMonth) });
  }
  function equivalentLunar(event: PersonalLunarEvent) {
    return lunarDateForSolarDay(Number(event.solarDay || 1), Number(event.solarMonth || new Date().getMonth() + 1), currentYear);
  }
  function getEquivalentSolarText(event: PersonalLunarEvent): string {
    const date = equivalentSolar(event);
    return date ? `${pad(date.day)}/${pad(date.month)}/${date.year}` : personalEventsUi[isEn ? 'en' : 'vi'].unavailableDate;
  }
  function getEquivalentLunarText(event: PersonalLunarEvent): string {
    const lunar = equivalentLunar(event);
    return lunar ? isEn ? `Day ${lunar.day} Month ${lunar.month} Lunar` : `Ngày ${lunar.day} Tháng ${lunar.month} Âm lịch`
      : personalEventsUi[isEn ? 'en' : 'vi'].unavailableDate;
  }
  function updateEventField(id: string, patch: Partial<Omit<PersonalLunarEvent, 'id' | 'createdAt'>>) {
    if (personalDraft?.id !== id) return;
    personalDraft = { ...personalDraft, ...patch };
    if (effectivePersonalFrequency(personalDraft) === 'yearly' && personalDraft.lunarMonth >= 1 && personalDraft.lunarMonth <= 12) {
      personalDraftYearlyLunarMonth = personalDraft.lunarMonth;
    }
    personalDraftInvalidField = '';
  }
  function changePersonalFrequency(id: string, frequency: PersonalEventFrequency): void {
    if (personalDraft?.id !== id || effectivePersonalFrequency(personalDraft) === frequency) return;
    if (frequency === 'monthly' && personalDraft.lunarMonth >= 1 && personalDraft.lunarMonth <= 12) {
      personalDraftYearlyLunarMonth = personalDraft.lunarMonth;
    }
    updateEventField(id, { frequency, lunarMonth: frequency === 'monthly' ? 0 : personalDraftYearlyLunarMonth });
  }
  function switchEventCalendarMode(id: string, mode: 'lunar' | 'solar') {
    const event = selectedPersonalEvent(id);
    if (!event || mode === getEventMode(event)) return;
    if (mode === 'solar') {
      const solar = equivalentSolar(event);
      if (!solar) { void alertInApp(personalEventsUi[isEn ? 'en' : 'vi'].noEquivalentDate); return; }
      updateEventField(id, { calendarMode: mode, solarDay: solar.day, solarMonth: solar.month });
    } else {
      const lunar = equivalentLunar(event);
      if (!lunar) { void alertInApp(personalEventsUi[isEn ? 'en' : 'vi'].noEquivalentDate); return; }
      updateEventField(id, { calendarMode: mode, lunarDay: lunar.day, lunarMonth: effectivePersonalFrequency(event) === 'monthly' ? 0 : lunar.month });
    }
    triggerHaptic('selection');
  }
  function handleSolarDayChange(id: string, day: number) {
    const event = selectedPersonalEvent(id);
    if (!event) return;
    const lunar = lunarDateForSolarDay(day, Number(event.solarMonth || 1), currentYear);
    updateEventField(id, { solarDay: day, ...(lunar ? { lunarDay: lunar.day, lunarMonth: effectivePersonalFrequency(event) === 'monthly' ? 0 : lunar.month } : {}), calendarMode: 'solar' });
  }
  function handleSolarMonthChange(id: string, month: number) {
    const event = selectedPersonalEvent(id);
    if (!event) return;
    const lunar = lunarDateForSolarDay(Number(event.solarDay || 1), month, currentYear);
    updateEventField(id, { solarMonth: month, ...(lunar ? { lunarDay: lunar.day, lunarMonth: effectivePersonalFrequency(event) === 'monthly' ? 0 : lunar.month } : {}), calendarMode: 'solar' });
  }
  function handleLunarDayChange(id: string, day: number) {
    const event = selectedPersonalEvent(id);
    if (!event) return;
    const solar = equivalentSolar({ ...event, lunarDay: day });
    updateEventField(id, { lunarDay: day, ...(solar ? { solarDay: solar.day, solarMonth: solar.month } : {}), calendarMode: 'lunar' });
  }
  function handleLunarMonthChange(id: string, month: number) {
    const event = selectedPersonalEvent(id);
    if (!event) return;
    const solar = equivalentSolar({ ...event, lunarMonth: month });
    updateEventField(id, { lunarMonth: month, ...(solar ? { solarDay: solar.day, solarMonth: solar.month } : {}), calendarMode: 'lunar' });
  }
  function togglePersonalNotify() {
    triggerHaptic('light');
    const enabled = !personalNotifyEnabled;
    if (!setPersonalEventsNotificationEnabled(enabled)) {
      showFeedback(personalEventsUi[isEn ? 'en' : 'vi'].storageError, true);
      return;
    }
    personalNotifyEnabled = enabled;
  }

  function addInlinePersonalEvent() {
    if (personalDraft) {
      editingPersonalEventId = personalDraft.id;
      return;
    }
    const now = new Date(), date = defaultPersonalEventDate(now);
    currentYear = date.year;
    personalDraft = { id: 'personal-event-draft', createdAt: now.toISOString(), title: '', type: 'gio-chap', frequency: 'yearly',
      calendarMode: 'lunar', lunarDay: date.lunarDay, lunarMonth: date.lunarMonth, solarDay: date.solarDay, solarMonth: date.solarMonth, note: '' };
    personalDraftBase = null;
    personalDraftYearlyLunarMonth = date.lunarMonth;
    personalDraftOwner = personalOwner();
    personalDraftInvalidField = '';
    editingPersonalEventId = personalDraft.id;
    triggerHaptic('light');
  }

  async function savePersonalDraft(): Promise<void> {
    let draft = personalDraft;
    if (!draft || personalDraftOwner !== personalOwner()) return;
    const copy = personalEventsUi[isEn ? 'en' : 'vi'];
    if (personalDraftBase) {
      const current = loadPersonalLunarEvents().find(event => event.id === draft!.id);
      if (!current) { showFeedback(copy.storageError, true, true); return; }
      // Giữ các trường thiết bị khác đã sửa; bản nháp chỉ ghi phần người dùng đổi.
      const patch = personalDraftPatch(draft, personalDraftBase);
      personalDraftBase = { ...current };
      personalDraft = { ...current, ...patch, frequency: patch.frequency ?? effectivePersonalFrequency(current) };
      draft = personalDraft;
    }
    const issue = personalEventFormIssue(draft, PERSONAL_EVENT_TYPES.map(item => item.type));
    if (issue) {
      const field = { missingTitle: 'name', missingFrequency: 'frequency', missingType: 'type', invalidLunarDay: 'lunar-day',
        invalidLunarMonth: 'lunar-month', invalidSolarDay: 'solar-day', invalidSolarMonth: 'solar-month', invalidSolarDate: 'solar-day' }[issue];
      const id = `personal-${field}-${draft.id}`;
      personalDraftInvalidField = id;
      await alertInApp(copy[issue], { title: issue.startsWith('missing') ? copy.missingInformationTitle : copy.invalidDateTitle, presentation: 'personal-event' });
      await tick();
      if (personalDraft?.id === draft.id && personalDraftOwner === personalOwner()) document.getElementById(id)?.focus();
      return;
    }
    try {
      if (personalDraftBase) {
        const current = loadPersonalLunarEvents().find(event => event.id === draft.id);
        if (!current) throw new Error('personal_event_no_longer_exists');
        updatePersonalLunarEvent(draft.id, personalDraftPatch(draft, personalDraftBase));
      } else {
        const { id: _id, createdAt: _created, ...input } = draft;
        addPersonalLunarEvent({ ...input, title: input.title.trim() });
      }
      clearPersonalDraft();
      personalEventsList = loadPersonalLunarEvents();
      showFeedback(copy.eventSaved, false, true);
    } catch {
      showFeedback(copy.storageError, true, true);
    }
  }

  function personalDraftPatch(draft: PersonalLunarEvent, base: PersonalLunarEvent): Partial<Omit<PersonalLunarEvent, 'id' | 'createdAt'>> {
    const patch: Partial<Omit<PersonalLunarEvent, 'id' | 'createdAt'>> = {};
    const fields = ['title', 'type', 'frequency', 'calendarMode', 'lunarDay', 'lunarMonth', 'solarDay', 'solarMonth', 'note'] as const;
    for (const field of fields) {
      if (field === 'frequency' && effectivePersonalFrequency(draft) === effectivePersonalFrequency(base)) continue;
      if (draft[field] !== base[field]) Object.assign(patch, { [field]: field === 'title' ? draft.title.trim() : draft[field] });
    }
    return patch;
  }
  function removePersonalEvent(id: string) {
    if (personalDraft?.id === id && (!personalDraftBase || !personalEventsList.some(event => event.id === id))) { clearPersonalDraft(); return; }
    pendingDelete = personalEventsList.find((item) => item.id === id) ?? null;
  }

  function confirmPersonalDelete() {
    if (!pendingDelete) return;
    triggerHaptic('light');
    try {
      deletePersonalLunarEvent(pendingDelete.id);
      if (personalDraft?.id === pendingDelete.id) clearPersonalDraft();
      else if (editingPersonalEventId === pendingDelete.id) editingPersonalEventId = null;
      pendingDelete = null;
      personalEventsList = loadPersonalLunarEvents();
      showFeedback(isEn ? 'Anniversary removed' : 'Đã xóa ngày lễ', false, true);
    } catch {
      pendingDelete = null;
      showFeedback(personalEventsUi[isEn ? 'en' : 'vi'].storageError, true, true);
    }
  }

  async function checkPermission() {
    const permission = await getUnifiedNotificationPermission();
    if (!feedbackAlive) return;
    permissionStatus = permission;
    permissionChecked = true;
    exactPermission = await getExactReminderPermission();
  }

  // Opening a reminder section is the user's first use of notifications, even
  // when the master switch was already enabled by the default settings.
  $effect(() => {
    if (platform !== 'ios' || !permissionChecked || permissionStatus !== 'prompt'
      || !settings.masterEnabled || !['lunar', 'personal', 'daily'].includes(activeSection)
      || iosPermissionAttempted) return;
    iosPermissionAttempted = true;
    void handleRequestPermission();
  });

  async function enableExactReminders() {
    try {
      await requestExactReminderPermission();
      await checkPermission();
      await triggerSync();
    } catch {
      showFeedback(isEn ? 'Could not open alarm settings. Please try again.' : 'Chưa mở được quyền báo thức. Vui lòng thử lại.', true);
    }
  }

  async function handleRequestPermission() {
    triggerHaptic('light');
    const result = await requestUnifiedNotificationPermission();
    if (!feedbackAlive) return;
    permissionStatus = result;
    if (result === 'granted') {
      showFeedback(t.permissionGranted);
      await triggerSync();
    } else if (platform === 'ios') {
      showFeedback(result === 'unsupported' ? platformText.iosUnavailable : platformText.iosHelp, true);
    }
  }

  function showFeedback(msg: string, isError = false, personal = false) {
    feedbackMessage = msg;
    feedbackPersonal = personal;
    feedbackIsError = isError;
    if (feedbackTimer) clearTimeout(feedbackTimer);
    feedbackTimer = setTimeout(() => {
      feedbackMessage = '';
    }, 2800);
  }

  async function triggerSync(nextSettings = settings, personalFeedback = false): Promise<boolean> {
    if (!saveReminderSettings(nextSettings)) {
      showFeedback(isEn ? 'Could not save on this device. Check available storage and try again.' : 'Không thể lưu trên máy. Hãy kiểm tra bộ nhớ và thử lại.', true, personalFeedback);
      return false;
    }
    settings = nextSettings;
    const generation = ++feedbackGeneration;
    const owner = personalOwner();
    syncing = true;
    try {
      const result = await syncRemindersWithSystem(settings, localeStore.current);
      if (!feedbackAlive || generation !== feedbackGeneration || owner !== personalOwner()) return true;
      lastSyncResult = result;
      showFeedback(result.success ? (isEn ? 'Saved successfully' : 'Đã lưu thành công') : reminderSyncStatusText(result, localeStore.current), !result.success, personalFeedback);
    } catch {
      if (!feedbackAlive || generation !== feedbackGeneration || owner !== personalOwner()) return true;
      lastSyncResult = null;
      showFeedback(isEn ? 'Saved on this device; reminders could not be scheduled. Please try again.' : 'Đã lưu trên máy; chưa thể đặt lịch nhắc. Vui lòng thử lại.', true, personalFeedback);
    } finally {
      if (generation === feedbackGeneration) syncing = false;
    }
    return true;
  }

  const personalTiming = $derived(resolvePersonalReminderConfig(settings));
  const savePersonalTiming = (personal: PersonalReminderConfig) => triggerSync({ ...settings, personal }, true);

  async function toggleMaster() {
    triggerHaptic('medium');
    const enabled = !settings.masterEnabled;
    const saved = await triggerSync({ ...settings, masterEnabled: enabled });
    if (saved && enabled) permissionStatus = await getUnifiedNotificationPermission();
  }

  function toggleThoKhang() {
    triggerHaptic('light');
    settings.lunar.thoKhangBaoGiam = !settings.lunar.thoKhangBaoGiam;
    void triggerSync();
  }

  function toggleThapTrai() {
    triggerHaptic('light');
    settings.lunar.thapTrai = !settings.lunar.thapTrai;
    void triggerSync();
  }

  function toggleViaPhat() {
    triggerHaptic('light');
    settings.lunar.viaPhat = !settings.lunar.viaPhat;
    void triggerSync();
  }

  function toggleEveBefore() {
    triggerHaptic('light');
    settings.lunar.notifyEveBefore = !settings.lunar.notifyEveBefore;
    void triggerSync();
  }

  function toggleMorningOf() {
    triggerHaptic('light');
    settings.lunar.notifyMorningOf = !settings.lunar.notifyMorningOf;
    void triggerSync();
  }

  function toggleDailySlot(index: number) {
    triggerHaptic('light');
    settings.dailySchedules[index].enabled = !settings.dailySchedules[index].enabled;
    void triggerSync();
  }

  function updateSlotTime(index: number, timeVal: string) {
    if (!timeVal) return;
    settings.dailySchedules[index].time = timeVal;
    void triggerSync();
  }

  function updateSlotPractice(index: number, practiceVal: string) {
    settings.dailySchedules[index].practice = practiceVal;
    void triggerSync();
  }

  function toggleSlotDay(index: number, dayNum: number) {
    triggerHaptic('light');
    const days = settings.dailySchedules[index].days;
    const exists = days.includes(dayNum);
    if (exists) {
      if (days.length > 1) {
        settings.dailySchedules[index].days = days.filter((d) => d !== dayNum);
      }
    } else {
      settings.dailySchedules[index].days = [...days, dayNum].sort();
    }
    void triggerSync();
  }

  function addCustomSlot() {
    triggerHaptic('light');
    const newId = `custom_${Date.now()}`;
    const newSlot: DailyScheduleItem = {
      id: newId,
      label: isEn ? 'Custom Slot' : 'Thời khóa thêm',
      practice: isEn ? 'Noon Meditation' : 'Thiền trưa & Trì chú',
      time: '12:00',
      enabled: true,
      days: [0, 1, 2, 3, 4, 5, 6],
    };
    settings.dailySchedules = [...settings.dailySchedules, newSlot];
    void triggerSync();
  }

  function removeCustomSlot(index: number) {
    triggerHaptic('light');
    settings.dailySchedules = settings.dailySchedules.filter((_, i) => i !== index);
    void triggerSync();
  }

  function toggleSound() {
    triggerHaptic('light');
    settings.soundEnabled = !settings.soundEnabled;
    void triggerSync();
  }

  function toggleVibrate() {
    triggerHaptic('light');
    settings.vibrateEnabled = !settings.vibrateEnabled;
    void triggerSync();
  }

  async function handleTest() {
    testing = true;
    try {
      const ok = await sendTestNotification(localeStore.current);
      if (ok) {
        showFeedback(t.testSuccess);
      } else {
        await handleRequestPermission();
      }
    } catch {
      showFeedback(isEn ? 'Could not send the test notification. Please try again.' : 'Chưa gửi được thông báo kiểm tra. Vui lòng thử lại.', true);
    } finally {
      testing = false;
    }
  }

  const daysLabels = $derived([
    { num: 1, label: t.dayMon },
    { num: 2, label: t.dayTue },
    { num: 3, label: t.dayWed },
    { num: 4, label: t.dayThu },
    { num: 5, label: t.dayFri },
    { num: 6, label: t.daySat },
    { num: 0, label: t.daySun },
  ]);

  onMount(() => {
    platform = nativePlatform();
    settings = loadReminderSettings();
    void checkPermission();
    const refreshEvents = () => { personalEventsList = loadPersonalLunarEvents(); };
    const stopSyncStatus = subscribeReminderSyncStatus(result => { lastSyncResult = result; });
    const sessionChanged = () => {
      feedbackGeneration += 1;
      lastSyncResult = null;
      feedbackMessage = '';
      syncing = false;
      if (personalDraft && personalDraftOwner !== personalOwner()) clearPersonalDraft();
      refreshEvents();
    };
    refreshEvents();
    window.addEventListener('quangtu:personal-events-changed', refreshEvents);
    window.addEventListener(SESSION_CHANGE_EVENT, sessionChanged);
    const refreshPermission = () => { if (document.visibilityState === 'visible') void checkPermission(); };
    document.addEventListener('visibilitychange', refreshPermission);
    return () => {
      feedbackAlive = false;
      feedbackGeneration += 1;
      stopSyncStatus();
      window.removeEventListener('quangtu:personal-events-changed', refreshEvents);
      window.removeEventListener(SESSION_CHANGE_EVENT, sessionChanged);
      document.removeEventListener('visibilitychange', refreshPermission);
      if (feedbackTimer) clearTimeout(feedbackTimer);
    };
  });
</script>

{#snippet feedbackBadge()}
    <span class="reminder-feedback-badge personal-feedback" class:feedback-error={feedbackIsError} role={feedbackIsError ? 'alert' : 'status'}><span aria-hidden="true">{#if feedbackIsError}<CircleAlert size={20} />{:else}<Check size={20} />{/if}</span>{feedbackMessage}</span>
{/snippet}

<section class="cn-card cn-subpage-card reminder-card-container">
  {#if feedbackMessage && !feedbackPersonal}
    <span class="reminder-feedback-badge" role={feedbackIsError ? 'alert' : 'status'}>{feedbackMessage}</span>
  {:else if !feedbackMessage && lastSyncResult && !lastSyncResult.success}
    <span class="reminder-feedback-badge" role={lastSyncResult.success ? 'status' : 'alert'}>{reminderSyncStatusText(lastSyncResult, localeStore.current)}</span>
  {/if}

  <!-- Master Switch -->
  <div class="cn-setting-row reminder-master-row">
    <div class="cn-setting-label">
      <strong>{t.masterSwitch}</strong>
      <small>{t.masterSwitchSub}</small>
    </div>
    <button
      type="button"
      class="reminder-switch-btn"
      class:active={settings.masterEnabled}
      onclick={toggleMaster}
      aria-pressed={settings.masterEnabled}
      aria-label={t.masterSwitch}
    >
      <span class="reminder-switch-thumb"></span>
    </button>
  </div>

  {#if settings.masterEnabled}
    <!-- ========================================================================= -->
    <!-- PHẦN 1: ÂM LỊCH & GIỚI HẠNH (THỌ KHANG BẢO GIÁM, THẬP TRAI, VÍA PHẬT)       -->
    <!-- ========================================================================= -->
    <SettingsSection id="lunar" title={hub.lunar} description={hub.lunarSummary} bind:active={activeSection}>
  <!-- Permission Warning Banner if needed -->
  {#if settings.masterEnabled && permissionStatus !== 'granted' && (permissionStatus !== 'unsupported' || platform === 'ios')}
    <div class="reminder-perm-banner">
      <div class="reminder-perm-icon">⚠️</div>
      <div class="reminder-perm-info">
        <p class="reminder-perm-text">{permissionStatus === 'unsupported' ? platformText.iosUnavailable : t.permissionWarning}</p>
        <button type="button" class="reminder-perm-btn" onclick={handleRequestPermission}>
          {permissionStatus === 'unsupported' ? platformText.iosRetry : t.requestPermissionBtn}
        </button>
      </div>
    </div>
  {/if}

    {#if platform && (platform !== 'android' || exactPermission !== 'unsupported')}
      <div class="reminder-perm-banner">
        <div class="reminder-perm-icon">🔔</div>
        <div class="reminder-perm-info">
          <p class="reminder-perm-text">
            {platform === 'web' ? platformText.webSchedule : platformText.nativeSchedule}
          </p>
          {#if platform === 'android'}
          <p class="reminder-perm-text">
            {exactPermission === 'granted'
              ? platformText.androidGranted
              : platformText.androidDenied}
          </p>
          {#if exactPermission === 'denied'}
            <button type="button" class="reminder-perm-btn" onclick={enableExactReminders}>
              {platformText.androidButton}
            </button>
          {/if}
          {/if}
          <p class="reminder-perm-text">
            {platform === 'android' ? platformText.androidHelp : platform === 'ios' ? platformText.iosHelp : platformText.webHelp}
          </p>
        </div>
      </div>
    {/if}
      <!-- Item 1: Thọ Khang Bảo Giám (Kiêng phòng sự) -->
      <div class="cn-setting-row reminder-item-row highlight-thokhang">
        <div class="cn-setting-label">
          <strong class="reminder-item-strong">
            <span class="reminder-lotus">🌸</span> {t.thoKhangTitle}
          </strong>
          <small class="reminder-desc-small">{t.thoKhangSub}</small>
        </div>
        <button
          type="button"
          class="reminder-switch-btn"
          class:active={settings.lunar.thoKhangBaoGiam}
          onclick={toggleThoKhang}
          aria-pressed={settings.lunar.thoKhangBaoGiam}
          aria-label={t.thoKhangTitle}
        >
          <span class="reminder-switch-thumb"></span>
        </button>
      </div>

      <!-- Item 2: Thập Trai (10 ngày ăn chay âm lịch) -->
      <div class="cn-setting-row reminder-item-row">
        <div class="cn-setting-label">
          <strong class="reminder-item-strong">
            <span class="reminder-lotus">🌱</span> {t.thapTraiTitle}
          </strong>
          <small class="reminder-desc-small">{t.thapTraiSub}</small>
        </div>
        <button
          type="button"
          class="reminder-switch-btn"
          class:active={settings.lunar.thapTrai}
          onclick={toggleThapTrai}
          aria-pressed={settings.lunar.thapTrai}
          aria-label={t.thapTraiTitle}
        >
          <span class="reminder-switch-thumb"></span>
        </button>
      </div>

      <!-- Item 3: Vía Phật & Bồ Tát -->
      <div class="cn-setting-row reminder-item-row">
        <div class="cn-setting-label">
          <strong class="reminder-item-strong">
            <span class="reminder-lotus">🙏</span> {t.viaPhatTitle}
          </strong>
          <small class="reminder-desc-small">{t.viaPhatSub}</small>
        </div>
        <button
          type="button"
          class="reminder-switch-btn"
          class:active={settings.lunar.viaPhat}
          onclick={toggleViaPhat}
          aria-pressed={settings.lunar.viaPhat}
          aria-label={t.viaPhatTitle}
        >
          <span class="reminder-switch-thumb"></span>
        </button>
      </div>

      <!-- Timing Options for Lunar Reminders -->
      {#if settings.lunar.thoKhangBaoGiam || settings.lunar.thapTrai || settings.lunar.viaPhat}
        <div class="reminder-timing-card">
          <div class="reminder-timing-header">
            <strong>{t.timingOptionsTitle}</strong>
          </div>

          <label class="reminder-check-row">
            <input
              type="checkbox"
              checked={settings.lunar.notifyEveBefore}
              onchange={toggleEveBefore}
            />
            <div class="reminder-check-text">
              <span class="reminder-check-title">{t.notifyEveBefore}</span>
              <span class="reminder-check-sub">{t.notifyEveBeforeSub}</span>
            </div>
          </label>

          <label class="reminder-check-row">
            <input
              type="checkbox"
              checked={settings.lunar.notifyMorningOf}
              onchange={toggleMorningOf}
            />
            <div class="reminder-check-text">
              <span class="reminder-check-title">{t.notifyMorningOf}</span>
              <span class="reminder-check-sub">{t.notifyMorningOfSub}</span>
            </div>
          </label>
        </div>
      {/if}
    </SettingsSection>

    <SettingsSection id="personal" title={hub.personal} description={hub.personalSummary(personalEventsList.length)} bind:active={activeSection}>
      <!-- Item 4: Ngày Lễ Cá Nhân (Giỗ chạp, Quy y, Phát nguyện...) -->
      <div class="cn-setting-row reminder-item-row">
        <div class="cn-setting-label">
          <strong class="reminder-item-strong">
            <span class="reminder-lotus">🕯️</span> {isEn ? 'Personal Anniversaries' : 'Ngày Lễ Cá Nhân'}
          </strong>
          <small class="reminder-desc-small">
            {isEn ? 'Ancestral memorials, refuge & vows (Default ON)' : 'Nhắc nhở giỗ chạp, quy y, phát nguyện, phóng sinh (Mặc định BẬT)'}
          </small>
        </div>
        <button
          type="button"
          class="reminder-switch-btn"
          class:active={personalNotifyEnabled}
          onclick={togglePersonalNotify}
          aria-pressed={personalNotifyEnabled}
          aria-label={isEn ? 'Personal Anniversaries' : 'Ngày Lễ Cá Nhân'}
        >
          <span class="reminder-switch-thumb"></span>
        </button>
      </div>

      <!-- Khối Quản lý Ngày Lễ Cá Nhân Trực Tiếp (Inline) -->
      {#if personalNotifyEnabled}
        <div class="personal-settings-layout">
        <div class="personal-inline-container" id="personal-events-settings">
          <PersonalEventsSyncStatus {isEn} />
          {#if feedbackMessage && feedbackPersonal}{@render feedbackBadge()}{/if}
          <div class="personal-inline-header">
            <span class="personal-inline-title">
              {isEn ? 'Personal Anniversaries' : 'Ngày lễ cá nhân'} ({personalEventsList.length})
            </span>
          </div>

          {#if visiblePersonalEvents.length === 0}
            <div class="personal-inline-empty">
              <p>{isEn ? 'No personal events added yet. Tap below to add.' : 'Chưa có ngày lễ nào. Bấm nút dưới để thêm ngày giỗ gia tiên, quy y, hoặc phát nguyện tu học.'}</p>
            </div>
          {:else}
            <div class="personal-inline-cards">
              {#each visiblePersonalEvents as event (event.id)}
                <div class="personal-inline-card">
                  <div class="personal-inline-summary">
                    <span class="personal-summary-icon" aria-hidden="true">{getPersonalEventTypeIcon(event.type)}</span>
                    <div class="personal-summary-text">
                      <strong>{event.title.trim() || event.note?.trim() || getPersonalEventTypeName(event.type, isEn)}</strong>
                      <span>{formatPersonalEventDateText({ ...event, frequency: effectivePersonalFrequency(event) }, isEn)}</span>
                    </div>
                    <button
                      type="button"
                      class="personal-edit-btn"
                      aria-expanded={editingPersonalEventId === event.id}
                      aria-controls={`personal-editor-${event.id}`}
                      onclick={() => beginPersonalEdit(event)}
                    >{editingPersonalEventId === event.id ? (isEn ? 'Collapse' : 'Thu gọn') : (isEn ? 'Edit' : 'Sửa')}</button>
                  </div>
                  {#if editingPersonalEventId === event.id}
                  <div class="personal-inline-editor" id={`personal-editor-${event.id}`}>
                  <div class="personal-inline-row3">
                    <label class="personal-name-label" for={`personal-name-${event.id}`}>{personalEventsUi[isEn ? 'en' : 'vi'].eventNameLabel}</label>
                    <input
                      id={`personal-name-${event.id}`}
                      aria-invalid={personalDraftInvalidField === `personal-name-${event.id}` || undefined}
                      maxlength={80}
                      type="text"
                      class="personal-inline-title-input"
                      placeholder={isEn ? 'e.g. Grandfather memorial, Refuge vow...' : 'VD: Giỗ Ông Nội, Ngày Quy Y...'}
                      value={event.title}
                      oninput={(e) => updateEventField(event.id, { title: e.currentTarget.value })}
                    />
                  </div>
                  <!-- Dòng 1: Chọn loại + Nút Xóa (loại bỏ ô nhập tiêu đề bị chèn ép) -->
                  <div class="personal-inline-row1">
                    <label class="personal-name-label" for={`personal-type-${event.id}`}>{isEn ? 'Event category' : 'Loại ngày lễ'}</label>
                    <select
                      id={`personal-type-${event.id}`}
                      aria-invalid={personalDraftInvalidField === `personal-type-${event.id}` || undefined}
                      class="personal-type-select"
                      value={event.type}
                      onchange={(e) => updateEventField(event.id, { type: e.currentTarget.value as PersonalEventType })}
                      aria-label={isEn ? 'Event category' : 'Loại ngày lễ'}
                    >
                      {#each PERSONAL_EVENT_TYPES as pet}
                        <option value={pet.type}>{pet.icon} {isEn ? pet.nameEn : pet.nameVi}</option>
                      {/each}
                    </select>

                  </div>

                  <!-- Dòng Chuyển đổi Âm lịch / Dương lịch -->
                  <div class="personal-mode-segmented">
                    <button
                      type="button"
                      class="personal-mode-btn"
                      class:active={getEventMode(event) === 'lunar'}
                      aria-pressed={getEventMode(event) === 'lunar'}
                      onclick={() => switchEventCalendarMode(event.id, 'lunar')}
                    >
                      {isEn ? 'Lunar' : 'Âm lịch'}
                    </button>
                    <button
                      type="button"
                      class="personal-mode-btn"
                      class:active={getEventMode(event) === 'solar'}
                      aria-pressed={getEventMode(event) === 'solar'}
                      onclick={() => switchEventCalendarMode(event.id, 'solar')}
                    >
                      {isEn ? 'Solar' : 'Dương lịch'}
                    </button>
                  </div>

                  <!-- Dòng 2: Chu kỳ + Chọn ngày & tháng tùy theo Âm / Dương -->
                  <div class="personal-inline-row2">
                    {#if getEventMode(event) === 'solar'}
                      <!-- Ngày Dương -->
                      <div class="personal-pill-col">
                        <label class="personal-col-label" for={`personal-solar-day-${event.id}`}>{isEn ? 'Day (Solar)' : 'Ngày Dương'}:</label>
                        <select
                          id={`personal-solar-day-${event.id}`}
                          aria-invalid={personalDraftInvalidField === `personal-solar-day-${event.id}` || undefined}
                          class="personal-select-sm"
                          value={event.solarDay || 1}
                          onchange={(e) => handleSolarDayChange(event.id, Number(e.currentTarget.value))}
                        >
                          {#each Array.from({ length: 31 }, (_, i) => i + 1) as d}
                            <option value={d}>{d}</option>
                          {/each}
                        </select>
                      </div>

                      <!-- Tháng Dương -->
                      <div class="personal-pill-col" class:is-dimmed={effectivePersonalFrequency(event) === 'monthly'}>
                        <label class="personal-col-label" for={`personal-solar-month-${event.id}`}>{isEn ? 'Month (Solar)' : 'Tháng Dương'}:</label>
                        <select
                          id={`personal-solar-month-${event.id}`}
                          aria-invalid={personalDraftInvalidField === `personal-solar-month-${event.id}` || undefined}
                          class="personal-select-sm"
                          disabled={effectivePersonalFrequency(event) === 'monthly'}
                          value={effectivePersonalFrequency(event) === 'monthly' ? 0 : (event.solarMonth || 1)}
                          onchange={(e) => handleSolarMonthChange(event.id, Number(e.currentTarget.value))}
                        >
                          {#if effectivePersonalFrequency(event) === 'monthly'}
                            <option value={0}>{isEn ? 'Every month' : 'Mỗi tháng'}</option>
                          {:else}
                            {#each Array.from({ length: 12 }, (_, i) => i + 1) as m}
                              <option value={m}>{isEn ? `Month ${m}` : `Tháng ${m}`}</option>
                            {/each}
                          {/if}
                        </select>
                      </div>
                    {:else}
                      <!-- Ngày Âm -->
                      <div class="personal-pill-col">
                        <label class="personal-col-label" for={`personal-lunar-day-${event.id}`}>{isEn ? 'Day (Lunar)' : 'Ngày Âm lịch'}:</label>
                        <select
                          id={`personal-lunar-day-${event.id}`}
                          aria-invalid={personalDraftInvalidField === `personal-lunar-day-${event.id}` || undefined}
                          class="personal-select-sm"
                          value={event.lunarDay}
                          onchange={(e) => handleLunarDayChange(event.id, Number(e.currentTarget.value))}
                        >
                          {#each Array.from({ length: 30 }, (_, i) => i + 1) as d}
                            <option value={d}>{d}</option>
                          {/each}
                        </select>
                      </div>

                      <!-- Tháng Âm -->
                      <div class="personal-pill-col" class:is-dimmed={effectivePersonalFrequency(event) === 'monthly'}>
                        <label class="personal-col-label" for={`personal-lunar-month-${event.id}`}>{isEn ? 'Month (Lunar)' : 'Tháng Âm lịch'}:</label>
                        <select
                          id={`personal-lunar-month-${event.id}`}
                          aria-invalid={personalDraftInvalidField === `personal-lunar-month-${event.id}` || undefined}
                          class="personal-select-sm"
                          disabled={effectivePersonalFrequency(event) === 'monthly'}
                          value={effectivePersonalFrequency(event) === 'monthly' ? 0 : (event.lunarMonth || 1)}
                          onchange={(e) => handleLunarMonthChange(event.id, Number(e.currentTarget.value))}
                        >
                          {#if effectivePersonalFrequency(event) === 'monthly'}
                            <option value={0}>{isEn ? 'Every month' : 'Mỗi tháng'}</option>
                          {:else}
                            {#each Array.from({ length: 12 }, (_, i) => i + 1) as m}
                              <option value={m}>{isEn ? `Month ${m}` : `Tháng ${m}`}</option>
                            {/each}
                          {/if}
                        </select>
                      </div>
                    {/if}
                  </div>

                  <!-- Badge Tự Động Quy Đổi Âm ⇄ Dương -->
                  <div class="personal-inline-footer">
                  <div class="personal-conversion-badge" class:is-solar={getEventMode(event) === 'solar'}>
                    {#if getEventMode(event) === 'solar'}
                      <span>{isEn ? 'Lunar equivalent:' : 'Âm lịch tương ứng:'} <strong>{getEquivalentLunarText(event)}</strong></span>
                    {:else}
                      <span>{isEn ? 'Solar equivalent:' : 'Dương lịch tương ứng:'} <strong>{getEquivalentSolarText(event)}</strong></span>
                    {/if}
                  </div>
                  </div>

                  <div class="personal-frequency">
                    <span class="personal-col-label" id={`personal-frequency-label-${event.id}`}>{isEn ? 'Recurrence' : 'Lặp lại'}</span>
                    <div class="personal-frequency-segmented" id={`personal-frequency-${event.id}`} role="group" aria-labelledby={`personal-frequency-label-${event.id}`} data-invalid={personalDraftInvalidField === `personal-frequency-${event.id}` || undefined} tabindex="-1">
                      {#each ['yearly', 'monthly'] as frequency (frequency)}
                        <button type="button" class="personal-frequency-btn" aria-pressed={effectivePersonalFrequency(event) === frequency} onclick={() => changePersonalFrequency(event.id, frequency as PersonalEventFrequency)}>{frequency === 'yearly' ? (isEn ? 'Yearly' : 'Hàng năm') : (isEn ? 'Monthly' : 'Hàng tháng')}</button>
                      {/each}
                    </div>
                  </div>
                  <div class="personal-editor-actions">
                    <button type="button" class="personal-edit-btn personal-edit-done" onclick={() => void savePersonalDraft()}>{personalEventsUi[isEn ? 'en' : 'vi'].saveEvent}</button>
                    <button type="button" class="personal-edit-btn" onclick={clearPersonalDraft}>{personalEventsUi[isEn ? 'en' : 'vi'].cancel}</button>
                  </div>
                  {#if personalDraftBase}
                    <button type="button" class="personal-inline-del-btn" onclick={() => removePersonalEvent(event.id)}>{isEn ? 'Delete anniversary' : 'Xóa ngày lễ'}</button>
                  {/if}
                  </div>
                  {/if}
                </div>
              {/each}
            </div>
          {/if}

          <!-- Nút thêm trực tiếp (Inline) -->
          <button type="button" class="personal-inline-add-btn" onclick={addInlinePersonalEvent}>
            + {isEn ? 'Add Personal Anniversary' : 'Thêm ngày lễ kỷ niệm'}
          </button>
        </div>
        {#if platform !== null}
          <PersonalReminderTiming config={personalTiming} {isEn} onsave={savePersonalTiming} />
        {/if}
        </div>
      {/if}

    </SettingsSection>

    <!-- ========================================================================= -->
    <!-- PHẦN 2: THỜI KHÓA CÔNG PHU HÀNG NGÀY                                       -->
    <!-- ========================================================================= -->
    <SettingsSection id="daily" title={hub.daily} description={dailySummary} bind:active={activeSection}>
      <!-- Bản cũ có thể có ID trùng; thêm vị trí vào key UI, giữ nguyên dữ liệu đã lưu. -->
      {#each settings.dailySchedules as slot, idx (`${slot.id}:${idx}`)}
        <div class="reminder-slot-card" class:slot-disabled={!slot.enabled}>
          <div class="reminder-slot-header">
            <div class="reminder-slot-info">
              <span class="reminder-slot-name">
                {slot.id === 'morning'
                  ? t.morningSlot
                  : slot.id === 'evening'
                    ? t.eveningSlot
                    : slot.label}
              </span>
            </div>
            <div class="reminder-slot-actions">
              <button
                type="button"
                class="reminder-switch-btn reminder-switch-sm"
                class:active={slot.enabled}
                onclick={() => toggleDailySlot(idx)}
                aria-pressed={slot.enabled}
                aria-label={slot.label}
              >
                <span class="reminder-switch-thumb"></span>
              </button>
              {#if slot.id !== 'morning' && slot.id !== 'evening'}
                <button
                  type="button"
                  class="reminder-del-btn"
                  onclick={() => removeCustomSlot(idx)}
                  title={t.deleteSlot}
                  aria-label={t.deleteSlot}
                >
                  ✕
                </button>
              {/if}
            </div>
          </div>

          {#if slot.enabled}
            <!-- Ô nhập nội dung công phu -->
            <div class="reminder-practice-input-row">
              <label for={`slot-practice-${slot.id}`} class="reminder-field-label">
                {t.practiceContentLabel}:
              </label>
              <input
                id={`slot-practice-${slot.id}`}
                type="text"
                class="reminder-practice-input"
                placeholder={t.practiceContentPlaceholder}
                value={slot.practice ?? ''}
                oninput={(e) => updateSlotPractice(idx, e.currentTarget.value)}
              />
            </div>

            <!-- Time Input -->
            <div class="reminder-slot-time-row">
              <label for={`slot-time-${slot.id}`} class="reminder-time-label">
                {t.timeLabel}:
              </label>
              <input
                id={`slot-time-${slot.id}`}
                type="time"
                class="reminder-time-input"
                value={slot.time}
                onchange={(e) => updateSlotTime(idx, e.currentTarget.value)}
              />
            </div>

            <!-- Days of Week Pills -->
            <div class="reminder-days-group">
              <span class="reminder-days-label">{t.daysOfWeek}</span>
              <div class="reminder-days-pills">
                {#each daysLabels as day}
                  <button
                    type="button"
                    class="reminder-day-pill"
                    class:selected={slot.days.includes(day.num)}
                    onclick={() => toggleSlotDay(idx, day.num)}
                  >
                    {day.label}
                  </button>
                {/each}
              </div>
            </div>
          {/if}
        </div>
      {/each}

      <!-- Add Custom Slot Button -->
      <button type="button" class="reminder-add-slot-btn" onclick={addCustomSlot}>
        {t.addSlotBtn}
      </button>
    </SettingsSection>

    <!-- ========================================================================= -->
    <!-- PHẦN 3: TÙY CHỌN CHUÔNG & RUNG                                            -->
    <!-- ========================================================================= -->
    <SettingsSection id="sound" title={hub.sound} description={hub.soundSummary(settings.soundEnabled, settings.vibrateEnabled)} bind:active={activeSection}>
      <div class="cn-setting-row reminder-item-row">
        <div class="cn-setting-label">
          <strong>{t.soundTitle}</strong>
          <small>{t.soundSub}</small>
        </div>
        <button
          type="button"
          class="reminder-switch-btn"
          class:active={settings.soundEnabled}
          onclick={toggleSound}
          aria-pressed={settings.soundEnabled}
          aria-label={t.soundTitle}
        >
          <span class="reminder-switch-thumb"></span>
        </button>
      </div>

      <div class="cn-setting-row reminder-item-row">
        <div class="cn-setting-label">
          <strong>{t.vibrateTitle}</strong>
          <small>{t.vibrateSub}</small>
        </div>
        <button
          type="button"
          class="reminder-switch-btn"
          class:active={settings.vibrateEnabled}
          onclick={toggleVibrate}
          aria-pressed={settings.vibrateEnabled}
          aria-label={t.vibrateTitle}
        >
          <span class="reminder-switch-thumb"></span>
        </button>
      </div>


    <!-- Test Notification & Status -->
    <div class="reminder-footer-actions">
      <button
        type="button"
        class="reminder-test-btn"
        disabled={testing}
        onclick={handleTest}
      >
        {testing ? '...' : t.testBtn}
      </button>
      {#if syncing}
        <span class="reminder-sync-indicator">⏳ Đang đồng bộ...</span>
      {/if}
    </div>
    </SettingsSection>
  {:else}
    <p class="settings-hub-disabled">{hub.disabled}</p>
  {/if}
</section>

<DeletePersonalEventDialog event={pendingDelete} {isEn} onCancel={() => pendingDelete = null} onConfirm={confirmPersonalDelete} />

<style>
  button,.reminder-practice-input,.reminder-time-input { min-width:44px; min-height:44px; }
  .reminder-card-container {
    margin-bottom: 24px;
    padding: 20px;
    background: var(--card);
    border: 1px solid var(--border);
    border-radius: 18px;
    box-shadow: 0 4px 18px rgba(0, 0, 0, 0.04);
  }






  .reminder-feedback-badge {
    position: absolute;
    right: 0;
    top: 0;
    background: var(--gold);
    color: #fff;
    font-size: 11.5px;
    font-weight: 600;
    padding: 4px 10px;
    border-radius: 999px;
    animation: fadeIn 0.2s ease-out;
  }
  .reminder-card-container .personal-feedback {
    display: flex;
    align-items: center;
    gap: var(--dialog-action-gap);
    position: static;
    padding: var(--dialog-action-space);
    margin-bottom: var(--dialog-action-space);
    border: 1px solid var(--gold);
    border-radius: var(--radius-card);
    background: var(--gold-light);
    color: var(--text);
    font-size: var(--font-size-body);
    font-weight: 600;
    line-height: 1.6;
  }
  .personal-feedback > span { display: flex; flex-shrink: 0; color: var(--gold); }
  .reminder-card-container .personal-feedback.feedback-error { border-color: var(--danger-text); }
  .personal-feedback.feedback-error > span { color: var(--danger-text); }

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

  .reminder-master-row {
    padding: 16px 0;
    border-bottom: 1px solid var(--border);
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
  }

  /* Modern iOS-style Switch */
  .reminder-switch-btn {
    width: 52px;
    height: 44px;
    border-radius: 999px;
    background: transparent;
    border: 0;
    cursor: pointer;
    position: relative;
    padding: 0;
    flex-shrink: 0;
    transition: background-color 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  /* Vùng bấm đủ 44px, thanh gạt vẫn giữ kích thước gọn hiện có. */
  .reminder-switch-btn::before {
    content: '';
    position: absolute;
    inset: 7px 0;
    border-radius: inherit;
    background: var(--bg2);
  }

  .reminder-switch-btn.active::before {
    background: var(--gold);
  }

  .reminder-switch-thumb {
    width: 24px;
    height: 24px;
    border-radius: 50%;
    background: #ffffff;
    box-shadow: 0 2px 5px rgba(0, 0, 0, 0.25);
    position: absolute;
    top: calc(50% - 12px);
    left: 3px;
    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1);
  }

  .reminder-switch-btn.active .reminder-switch-thumb {
    transform: translateX(22px);
  }

  .reminder-switch-sm {
    width: 44px;
    height: 44px;
  }

  .reminder-switch-sm::before { inset-block:9px; }

  .reminder-switch-sm .reminder-switch-thumb {
    width: 20px;
    height: 20px;
    top: calc(50% - 10px);
  }

  .reminder-switch-sm.active .reminder-switch-thumb {
    transform: translateX(18px);
  }

  /* Permission banner */
  .reminder-perm-banner {
    display: flex;
    gap: 12px;
    align-items: flex-start;
    padding: 12px 14px;
    margin: 14px 0;
    background: rgba(220, 100, 30, 0.08);
    border: 1px solid rgba(220, 100, 30, 0.25);
    border-radius: 12px;
  }

  .reminder-perm-icon {
    font-size: 20px;
  }

  .reminder-perm-info {
    flex: 1;
  }

  .reminder-perm-text {
    margin: 0 0 8px;
    font-size: 13px;
    color: var(--text);
  }

  .reminder-perm-btn {
    padding: 6px 14px;
    font-size: 12.5px;
    font-weight: 600;
    border-radius: 8px;
    border: 0;
    background: var(--gold);
    color: var(--on-gold);
    cursor: pointer;
  }

  /* Section block */



  .reminder-item-row {
    padding: 12px 0;
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 16px;
    border-bottom: 1px solid var(--border);
  }

  .reminder-item-row:last-child {
    border-bottom: 0;
  }

  .highlight-thokhang {
    background: rgba(200, 150, 62, 0.05);
    border-radius: 12px;
    padding: 12px 14px;
    margin-bottom: 8px;
    border: 1px solid rgba(200, 150, 62, 0.2);
  }

  .reminder-item-strong {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 14.5px;
    color: var(--text);
  }

  .reminder-lotus {
    font-size: 16px;
  }

  .reminder-desc-small {
    display: block;
    margin-top: 3px;
    font-size: 12.5px;
    color: var(--muted);
    line-height: 1.4;
  }

  /* Timing sub-card */
  .reminder-timing-card {
    margin-top: 12px;
    padding: 14px;
    background: var(--bg2, rgba(0, 0, 0, 0.02));
    border: 1px solid var(--border);
    border-radius: 12px;
  }

  .reminder-timing-header {
    margin-bottom: 10px;
    font-size: 13px;
    color: var(--text);
  }

  .reminder-check-row {
    display: flex;
    align-items: flex-start;
    gap: 10px;
    margin-bottom: 10px;
    cursor: pointer;
  }

  .reminder-check-row:last-child {
    margin-bottom: 0;
  }

  .reminder-check-row input[type='checkbox'] {
    width: 18px;
    height: 18px;
    margin-top: 2px;
    accent-color: var(--gold);
    cursor: pointer;
  }

  .reminder-check-text {
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .reminder-check-title {
    font-size: 13.5px;
    font-weight: 600;
    color: var(--text);
  }

  .reminder-check-sub {
    font-size: 12px;
    color: var(--muted);
    line-height: 1.35;
  }

  /* Daily slot cards */
  .reminder-slot-card {
    padding: 12px 14px;
    background: var(--bg2, rgba(0, 0, 0, 0.02));
    border: 1px solid var(--border);
    border-radius: 12px;
    margin-bottom: 10px;
    transition: opacity 0.2s ease;
  }

  .reminder-slot-card.slot-disabled {
    opacity: 0.6;
  }

  .reminder-slot-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 10px;
  }

  .reminder-slot-info {
    display: flex;
    flex-direction: column;
  }

  .reminder-slot-name {
    font-size: 15px;
    font-weight: 700;
    color: var(--text);
  }

  .reminder-slot-actions {
    display: flex;
    align-items: center;
    gap: 8px;
  }

  .reminder-del-btn {
    border: 0;
    background: transparent;
    color: #e53935;
    font-size: 14px;
    cursor: pointer;
    padding: 4px 8px;
    border-radius: 6px;
  }

  .reminder-practice-input-row {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 5px;
  }

  .reminder-field-label {
    font-size: 12.5px;
    font-weight: 600;
    color: var(--text);
  }

  .reminder-practice-input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 12px;
    font-size: 14px;
    border-radius: 8px;
    border: 1.5px solid var(--border);
    background: var(--card);
    color: var(--text);
    outline: none;
    font-family: inherit;
    transition: border-color 0.15s ease;
  }

  .reminder-practice-input:focus {
    border-color: var(--gold);
    box-shadow: 0 0 0 2px rgba(200, 150, 62, 0.15);
  }

  .reminder-slot-time-row {
    margin-top: 10px;
    display: flex;
    align-items: center;
    gap: 10px;
  }

  .reminder-time-label {
    font-size: 13px;
    font-weight: 600;
    color: var(--text);
  }

  .reminder-time-input {
    padding: 6px 12px;
    font-size: 15px;
    font-weight: 700;
    border-radius: 8px;
    border: 1.5px solid var(--border);
    background: var(--card);
    color: var(--text);
    outline: none;
    font-family: inherit;
  }

  .reminder-time-input:focus {
    border-color: var(--gold);
  }

  .reminder-days-group {
    margin-top: 10px;
    display: flex;
    flex-direction: column;
    gap: 6px;
  }

  .reminder-days-label {
    font-size: 12px;
    color: var(--muted);
  }

  .reminder-days-pills {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(44px, 1fr));
    gap: var(--radius-sm);
  }

  @media(max-width:620px) {
    .reminder-days-pills { grid-template-columns: repeat(4, minmax(44px, 1fr)); }
  }

  .reminder-day-pill {
    padding: 4px 10px;
    font-size: 11.5px;
    font-weight: 600;
    border-radius: 8px;
    border: 1px solid var(--border);
    background: var(--card);
    color: var(--muted);
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .reminder-day-pill.selected {
    background: var(--gold);
    color: var(--on-gold);
    border-color: var(--gold);
    box-shadow: 0 2px 6px rgba(200, 150, 62, 0.25);
  }

  .reminder-add-slot-btn {
    width: 100%;
    padding: 10px;
    border: 1.5px dashed var(--gold);
    background: rgba(200, 150, 62, 0.04);
    color: var(--gold);
    font-size: 13.5px;
    font-weight: 700;
    border-radius: 10px;
    cursor: pointer;
    transition: background 0.15s ease;
    margin-top: 6px;
  }

  .reminder-add-slot-btn:hover {
    background: rgba(200, 150, 62, 0.1);
  }

  /* Footer Actions */
  .reminder-footer-actions {
    margin-top: 20px;
    padding-top: 16px;
    border-top: 1px solid var(--border);
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 12px;
  }

  .reminder-test-btn {
    padding: 9px 18px;
    font-size: 13.5px;
    font-weight: 600;
    border-radius: 10px;
    border: 1px solid var(--border);
    background: var(--bg2);
    color: var(--text);
    cursor: pointer;
    transition: transform 0.15s ease, background 0.15s ease;
  }

  .reminder-test-btn:hover {
    background: var(--card);
    border-color: var(--gold);
    color: var(--gold);
  }

  .reminder-test-btn:active {
    transform: scale(0.97);
  }

  .reminder-sync-indicator {
    font-size: 12.5px;
    color: var(--muted);
  }

  /* Personal anniversaries: the approved flat form, scoped to this owner. */
  .personal-settings-layout { display: grid; gap: var(--space-page); min-width: 0; }
  .personal-inline-container { display: flex; flex-direction: column; gap: var(--dialog-action-space); min-width: 0; }
  .personal-inline-header { display: flex; align-items: center; justify-content: space-between; }
  .personal-inline-container .personal-inline-title { font-size: var(--font-size-section-title); font-weight: 700; color: var(--text); }
  .personal-inline-empty { padding: var(--dialog-action-space) 0; color: var(--text2); line-height: 1.6; }
  .personal-inline-empty p { margin: 0; }
  .personal-inline-cards { display: flex; flex-direction: column; gap: var(--dialog-action-space); }
  .personal-inline-card { display: flex; flex-direction: column; gap: var(--dialog-action-space); min-width: 0; padding-bottom: var(--dialog-action-space); border-bottom: 1px solid var(--border); }
  .personal-inline-summary { display: flex; align-items: center; gap: var(--dialog-action-gap); min-width: 0; }
  .personal-summary-icon { flex-shrink: 0; font-size: var(--font-size-section-title); }
  .personal-summary-text { flex: 1; min-width: 0; display: flex; flex-direction: column; gap: calc(var(--dialog-action-gap) / 2); overflow-wrap: anywhere; }
  .personal-summary-text strong { color: var(--text); font-size: var(--font-size-card-title); }
  .personal-summary-text span { color: var(--text2); font-size: var(--font-size-label); line-height: 1.6; }
  .personal-edit-btn { min-width: var(--touch-target-size); min-height: calc(var(--touch-target-size) + var(--dialog-action-gap) / 2); padding: var(--dialog-action-gap) var(--dialog-action-space); border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--card); color: var(--text); font: inherit; font-size: var(--font-size-body); font-weight: 600; cursor: pointer; }
  .personal-editor-actions { display: flex; flex-direction: column; gap: var(--dialog-action-gap); }
  .personal-edit-done { background: var(--gold); border-color: var(--gold); color: var(--on-gold); }
  .personal-inline-editor { display: flex; flex-direction: column; gap: var(--dialog-action-space); min-width: 0; }
  .personal-inline-row1, .personal-inline-row3 { display: flex; flex-direction: column; min-width: 0; }
  .personal-mode-segmented, .personal-frequency-segmented { display: flex; padding: calc(var(--dialog-action-gap) / 2); gap: calc(var(--dialog-action-gap) / 2); border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--card); }
  .personal-mode-btn, .personal-frequency-btn { flex: 1; min-width: 0; min-height: var(--touch-target-size); padding: var(--dialog-action-gap); border: 0; border-radius: var(--radius); background: transparent; color: var(--text); font: inherit; font-size: var(--font-size-body); font-weight: 600; cursor: pointer; }
  .personal-mode-btn.active { background: var(--gold); color: var(--on-gold); }
  .personal-frequency { display: flex; flex-direction: column; gap: var(--dialog-action-gap); }
  .personal-frequency-btn[aria-pressed='true'] { background: var(--gold-light); color: var(--text); }
  .personal-inline-row2 { display: grid; grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); gap: var(--dialog-action-space); align-items: start; }
  .personal-pill-col { display: flex; flex-direction: column; gap: var(--dialog-action-gap); min-width: 0; }
  .personal-col-label, .personal-name-label { color: var(--text2); font-size: var(--font-size-body); line-height: 1.6; }
  .personal-name-label { margin-bottom: var(--dialog-action-gap); font-weight: 600; }
  .personal-select-sm, .personal-type-select, .personal-inline-title-input { box-sizing: border-box; width: 100%; min-width: 0; min-height: calc(var(--touch-target-size) + var(--dialog-action-gap) / 2); padding: var(--dialog-action-gap); border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--card); color: var(--text); font: inherit; font-size: var(--font-size-input); }
  .personal-select-sm:disabled { background: var(--bg3); color: var(--text2); cursor: not-allowed; }
  .personal-inline-footer { min-width: 0; }
  .personal-conversion-badge { color: var(--text2); font-size: var(--font-size-body); line-height: 1.6; overflow-wrap: anywhere; }
  .personal-conversion-badge strong { color: var(--brown); font-weight: 600; }
  :global([data-theme='dark']) .personal-conversion-badge strong { color: var(--gold2); }
  .personal-inline-del-btn { align-self: center; min-width: var(--touch-target-size); min-height: var(--touch-target-size); padding: var(--dialog-action-gap) var(--dialog-action-space); border: 0; border-radius: var(--radius-control); background: transparent; color: var(--danger-text); font: inherit; cursor: pointer; }
  .personal-inline-add-btn { width: 100%; min-height: calc(var(--touch-target-size) + var(--dialog-action-gap) / 2); padding: var(--dialog-action-gap) var(--dialog-action-space); border: 1px solid var(--border); border-radius: var(--radius-control); background: var(--gold-light); color: var(--text); font: inherit; font-weight: 600; cursor: pointer; }
  .personal-inline-editor :is(button, input, select):focus-visible, .personal-inline-add-btn:focus-visible, .personal-edit-btn:focus-visible { outline: 2px solid var(--gold); outline-offset: 2px; }
  .personal-inline-editor :is([aria-invalid='true'], [data-invalid='true']) { border-color: var(--danger-text); }
  @media (min-width: 1100px) {
    .personal-settings-layout { grid-template-columns: minmax(0, 1fr) minmax(0, 1fr); align-items: start; }
    .personal-settings-layout :global(.personal-timing) { padding-left: var(--space-page); border-left: 1px solid var(--border); }
  }
</style>
