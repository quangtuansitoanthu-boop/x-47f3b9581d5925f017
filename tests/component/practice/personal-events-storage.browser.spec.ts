// @vitest-environment jsdom
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import PersonalEventsModal from '../../../src/lib/components/practice/reminder/PersonalEventsModal.svelte';
import PersonalReminderTiming from '../../../src/lib/components/practice/reminder/PersonalReminderTiming.svelte';
import DeletePersonalEventDialog from '../../../src/lib/components/practice/reminder/DeletePersonalEventDialog.svelte';
import HomeDailyReminders from '../../../src/lib/components/home/HomeDailyReminders.svelte';
import * as sessions from '../../../src/lib/stores/session.svelte';

const mocks = vi.hoisted(() => ({ add: vi.fn(), remove: vi.fn(), native: false, masterEnabled: true, sync: vi.fn(), alert: vi.fn() }));
vi.mock('$lib/browser/app-dialog', () => ({ alertInApp: mocks.alert }));
vi.mock('$lib/browser/modal-dialog', () => ({ modalDialog: () => ({ destroy() {} }) }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => mocks.native }));
vi.mock('$lib/browser/practice-reminder-service', () => ({
  loadReminderSettings: () => ({ masterEnabled: mocks.masterEnabled }),
  syncRemindersWithSystem: mocks.sync,
}));
vi.mock('$lib/browser/personal-lunar-events', async importOriginal => {
  const original = await importOriginal<typeof import('../../../src/lib/browser/personal-lunar-events')>();
  return {
    ...original,
    loadPersonalLunarEvents: () => [{
      id: 'storage-failure-event', title: 'Ngày lễ đã lưu', type: 'gia-dinh',
      lunarDay: 15, lunarMonth: 7, frequency: 'yearly', createdAt: '2026-01-01T00:00:00Z',
    }],
    addPersonalLunarEvent: mocks.add,
    deletePersonalLunarEvent: mocks.remove,
  };
});

let instance: ReturnType<typeof PersonalEventsModal> | undefined;
let unhandled: unknown[];
function captureError(event: ErrorEvent) {
  unhandled.push(event.error);
  event.preventDefault();
}
const settle = async () => { for (let index = 0; index < 4; index++) { await Promise.resolve(); flushSync(); } };

it('keeps timing edits local until save and cancels back to the saved configuration', async () => {
  const onsave = vi.fn().mockResolvedValue(true);
  const view = mount(PersonalReminderTiming, { target: document.body, props: {
    config: { beforeEnabled: true, dayEnabled: true, daysBefore: 1, beforeTime: '19:30', dayTime: '06:00' }, onsave,
  } });
  try {
    flushSync();
    const leadTime = document.querySelector<HTMLSelectElement>('.personal-timing select')!;
    leadTime.value = 'custom'; leadTime.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
    let days = document.querySelector<HTMLInputElement>('.personal-timing input[type="number"]')!;
    days.value = '100'; days.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    expect(days.checkValidity()).toBe(true);
    expect(onsave).not.toHaveBeenCalled();
    const cancel = document.querySelector<HTMLButtonElement>('.timing-actions button[type="button"]')!;
    cancel.click(); flushSync();
    expect(leadTime.value).toBe('1');
    expect(document.querySelector('.personal-timing input[type="number"]')).toBeNull();
    expect(onsave).not.toHaveBeenCalled();
    leadTime.value = 'custom'; leadTime.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
    days = document.querySelector<HTMLInputElement>('.personal-timing input[type="number"]')!;
    days.value = '100'; days.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    const times = document.querySelectorAll<HTMLInputElement>('.personal-timing input[type="time"]');
    times[0].value = '21:45'; times[0].dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    document.querySelector('form.personal-timing')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(onsave).toHaveBeenCalledExactlyOnceWith({ beforeEnabled: true, dayEnabled: true, daysBefore: 100, beforeTime: '21:45', dayTime: '06:00' });
    days.value = '101'; days.dispatchEvent(new Event('input', { bubbles: true })); flushSync();
    expect(days.checkValidity()).toBe(false);
    document.querySelector('form.personal-timing')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(onsave).toHaveBeenCalledTimes(1);
  } finally { await unmount(view); }
});

it('retains the timing draft on storage failure and disables controls for inactive reminders', async () => {
  const onsave = vi.fn().mockResolvedValue(false);
  const view = mount(PersonalReminderTiming, { target: document.body, props: {
    config: { beforeEnabled: true, dayEnabled: true, daysBefore: 1, beforeTime: '19:30', dayTime: '06:00' }, onsave,
  } });
  try {
    flushSync();
    const leadTime = document.querySelector<HTMLSelectElement>('.personal-timing select')!;
    leadTime.value = 'custom'; leadTime.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
    const toggles = document.querySelectorAll<HTMLInputElement>('.personal-timing input[type="checkbox"]');
    toggles[0].click(); flushSync();
    expect(document.querySelector<HTMLInputElement>('.personal-timing input[type="number"]')!.disabled).toBe(true);
    expect(document.querySelector<HTMLInputElement>('.personal-timing input[type="time"]')!.disabled).toBe(true);
    document.querySelector('form.personal-timing')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
    await settle();
    expect(document.querySelector('.timing-error')!.textContent).toContain('Không thể lưu');
    expect(toggles[0].checked).toBe(false);
  } finally { await unmount(view); }
});
beforeEach(() => {
  mocks.alert.mockReset().mockResolvedValue(undefined);
  localStorage.clear();
  unhandled = [];
  window.addEventListener('error', captureError);
  mocks.add.mockReset().mockImplementation(() => { throw new DOMException('Storage is full', 'QuotaExceededError'); });
  mocks.remove.mockReset().mockImplementation(() => { throw new DOMException('Storage is full', 'QuotaExceededError'); });
  mocks.native = false;
  mocks.masterEnabled = true;
  mocks.sync.mockReset().mockResolvedValue({ success: true, scheduledCount: 1 });
});
afterEach(async () => {
  if (instance) await unmount(instance);
  instance = undefined;
  window.removeEventListener('error', captureError);
  localStorage.clear();
  document.body.replaceChildren();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function open() {
  instance = mount(PersonalEventsModal, { target: document.body, props: { open: true, onClose() {} } });
  flushSync();
}
function submitAnniversary(titleText = 'Ngày lễ mới') {
  const title = document.querySelector<HTMLInputElement>('#pem-input-title')!;
  title.value = titleText;
  title.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  title.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
}

it('defaults both calendars to the device date and does not persist until saving', () => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(2026, 10, 6, 10));
  open();
  expect(document.querySelector<HTMLSelectElement>('#pem-select-day')!.value).toBe('28');
  expect(document.querySelector<HTMLSelectElement>('#pem-select-month')!.value).toBe('9');
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(button => button.textContent?.includes('Nhập theo Dương lịch'))!.click();
  flushSync();
  expect(document.querySelector<HTMLSelectElement>('#pem-solar-day')!.value).toBe('6');
  expect(document.querySelector<HTMLSelectElement>('#pem-solar-month')!.value).toBe('11');
  expect(mocks.add).not.toHaveBeenCalled();
});

it('blocks a blank title, reports its field, and focuses it after the alert', async () => {
  open();
  submitAnniversary('   ');
  await settle();
  expect(mocks.alert).toHaveBeenCalledWith(expect.stringContaining('Tên ngày lễ / Sự kiện'));
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(document.activeElement?.id).toBe('pem-input-title');
  expect(document.activeElement?.getAttribute('aria-invalid')).toBe('true');
});

it.each([
  ['pem-select-day', 'Ngày Âm'], ['pem-select-month', 'Tháng Âm'],
  ['pem-select-freq', 'Chu kỳ nhắc'], ['pem-select-type', 'Phân loại sự kiện'],
])('blocks missing %s without saving and identifies the field', async (id, label) => {
  open();
  const select = document.getElementById(id) as HTMLSelectElement;
  const empty = document.createElement('option');
  empty.value = ''; select.append(empty);
  select.value = ''; select.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
  submitAnniversary('Ngày lễ chưa đầy đủ');
  await settle();
  expect(mocks.alert).toHaveBeenCalledWith(expect.stringContaining(label));
  expect(document.activeElement?.id).toBe(id);
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
});

function solarDate(day: number, month: number, frequency: 'yearly' | 'monthly') {
  Array.from(document.querySelectorAll<HTMLButtonElement>('[role="tab"]')).find(button => button.textContent?.includes('Nhập theo Dương lịch'))!.click();
  flushSync();
  for (const [id, value] of [['pem-solar-day', String(day)], ['pem-solar-month', String(month)], ['pem-solar-freq', frequency]]) {
    const select = document.getElementById(id) as HTMLSelectElement;
    select.value = value; select.dispatchEvent(new Event('change', { bubbles: true })); flushSync();
  }
}

it.each([2, 4])('rejects a yearly solar day 31 in month %i without writing or scheduling and retains the form', async month => {
  mocks.native = true;
  mocks.add.mockReturnValue({ id: 'must-not-save' });
  open(); solarDate(31, month, 'yearly');
  expect(document.querySelector('.conversion-pill')?.textContent).toContain('Ngày không hợp lệ');
  const writes = vi.spyOn(Storage.prototype, 'setItem');
  const requests = vi.spyOn(globalThis, 'fetch');
  submitAnniversary('Ngày không tồn tại');
  await settle();
  expect(mocks.add).not.toHaveBeenCalled();
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(writes).not.toHaveBeenCalled();
  expect(requests).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toMatch(/ngày.*không hợp lệ/iu);
  expect(document.querySelector<HTMLInputElement>('#pem-input-title')!.value).toBe('Ngày không tồn tại');
  expect(unhandled).toEqual([]);
});

it.each([
  { day: 29, month: 2, frequency: 'yearly' as const },
  { day: 31, month: 2, frequency: 'monthly' as const },
])('preserves supported solar recurrence $day/$month $frequency', async ({ day, month, frequency }) => {
  mocks.native = true;
  mocks.add.mockReturnValue({ id: 'valid-solar-event' });
  open(); solarDate(day, month, frequency);
  submitAnniversary('Ngày hợp lệ');
  await settle();
  expect(mocks.add).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    title: 'Ngày hợp lệ', calendarMode: 'solar', solarDay: day, solarMonth: month, frequency,
  }));
  expect(mocks.sync).toHaveBeenCalledOnce();
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(document.querySelector<HTMLInputElement>('#pem-input-title')!.value).toBe('');
  expect(unhandled).toEqual([]);
});

it('keeps the modal personal reminder switch on and reports a failed preference write', async () => {
  const key = 'tutam_personal_events_notify_enabled';
  localStorage.setItem(key, '1');
  const original = Storage.prototype.setItem;
  vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, name, value) {
    if (name === key) throw new DOMException('Storage is full', 'QuotaExceededError');
    return original.call(this, name, value);
  });
  open();
  const changed = vi.fn();
  window.addEventListener('quangtu:personal-events-notify-toggled', changed);
  try {
    const toggle = document.querySelector<HTMLInputElement>('.pem-switch input')!;
    expect(toggle.checked).toBe(true);
    toggle.click();
    await settle();
    expect(toggle.checked).toBe(true);
    expect(localStorage.getItem(key)).toBe('1');
    expect(document.querySelector('[role="alert"]')?.textContent).toContain('Không thể lưu');
    expect(changed).not.toHaveBeenCalled();
    expect(mocks.sync).not.toHaveBeenCalled();
    expect(unhandled).toEqual([]);
  } finally {
    window.removeEventListener('quangtu:personal-events-notify-toggled', changed);
  }
});

it('sets up native reminders from an explicit valid save while retaining the saved anniversary', async () => {
  mocks.native = true;
  mocks.add.mockReturnValue({ id: 'new-event' });
  open();
  expect(mocks.sync).not.toHaveBeenCalled();
  submitAnniversary();
  await settle();
  expect(mocks.add).toHaveBeenCalledOnce();
  expect(mocks.sync).toHaveBeenCalledExactlyOnceWith({ masterEnabled: true }, 'vi');
  expect(document.querySelector<HTMLInputElement>('#pem-input-title')!.value).toBe('');
  expect(document.querySelector('[role="alert"]')).toBeNull();
  expect(unhandled).toEqual([]);
});

it.each(['denied', 'scheduler-error'] as const)('retains a saved native anniversary and distinguishes %s from a storage failure', async failure => {
  mocks.native = true;
  mocks.add.mockReturnValue({ id: 'new-event' });
  if (failure === 'denied') mocks.sync.mockResolvedValue({ success: false, scheduledCount: 0 });
  else mocks.sync.mockRejectedValue(new Error('OS unavailable'));
  open();
  submitAnniversary();
  await settle();
  expect(mocks.add).toHaveBeenCalledOnce();
  expect(mocks.sync).toHaveBeenCalledOnce();
  expect(document.querySelector<HTMLInputElement>('#pem-input-title')!.value).toBe('');
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Đã lưu ngày lễ');
  expect(document.querySelector('[role="alert"]')?.textContent).not.toContain('Không thể lưu thay đổi');
  expect(unhandled).toEqual([]);
});

it('keeps the native master switch off and reports it after saving an anniversary', async () => {
  mocks.native = true;
  mocks.masterEnabled = false;
  mocks.add.mockReturnValue({ id: 'new-event' });
  open();
  submitAnniversary();
  await settle();
  expect(mocks.add).toHaveBeenCalledOnce();
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(mocks.masterEnabled).toBe(false);
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('nhắc nhở chung đang tắt');
});

it('sets up native reminders only when the personal notification switch is explicitly enabled', async () => {
  mocks.native = true;
  localStorage.setItem('tutam_personal_events_notify_enabled', '0');
  open();
  expect(mocks.sync).not.toHaveBeenCalled();
  document.querySelector<HTMLInputElement>('.pem-switch input')!.click();
  await settle();
  expect(mocks.sync).toHaveBeenCalledExactlyOnceWith({ masterEnabled: true }, 'vi');
  document.querySelector<HTMLInputElement>('.pem-switch input')!.click();
  await settle();
  expect(mocks.sync).toHaveBeenCalledOnce();
});

it.each(['web', 'personal-off', 'invalid', 'storage-error'] as const)('does not set up native reminders for %s', async scenario => {
  mocks.native = scenario !== 'web';
  if (scenario === 'personal-off') localStorage.setItem('tutam_personal_events_notify_enabled', '0');
  if (scenario !== 'storage-error') mocks.add.mockReturnValue({ id: 'new-event' });
  open();
  submitAnniversary(scenario === 'invalid' ? '' : 'Ngày lễ mới');
  await settle();
  expect(mocks.sync).not.toHaveBeenCalled();
  expect(unhandled).toEqual([]);
});

it.each(['new-draft', 'account-change', 'unmount'] as const)('ignores a late native reminder failure after %s', async scenario => {
  mocks.native = true;
  mocks.add.mockReturnValue({ id: 'new-event' });
  let finish!: (result: { success: boolean; scheduledCount: number }) => void;
  mocks.sync.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  open();
  submitAnniversary();
  await settle();
  expect(mocks.sync).toHaveBeenCalledOnce();
  if (scenario === 'new-draft') {
    const title = document.querySelector<HTMLInputElement>('#pem-input-title')!;
    title.value = 'Bản nháp tiếp theo';
    title.dispatchEvent(new Event('input', { bubbles: true }));
    flushSync();
  } else if (scenario === 'account-change') {
    window.dispatchEvent(new CustomEvent('quangtu:session-changed'));
  } else {
    await unmount(instance!);
    instance = undefined;
  }
  finish({ success: false, scheduledCount: 0 });
  await settle();
  expect(document.querySelector('[role="alert"]')).toBeNull();
  if (scenario === 'new-draft') expect(document.querySelector<HTMLInputElement>('#pem-input-title')!.value).toBe('Bản nháp tiếp theo');
  expect(unhandled).toEqual([]);
});

it('keeps a new anniversary draft and reports a local storage failure without an uncaught error', async () => {
  open();
  const title = document.querySelector<HTMLInputElement>('#pem-input-title')!;
  title.value = 'Ngày lễ chưa lưu';
  title.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  title.closest('form')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
  await settle();
  expect(mocks.add).toHaveBeenCalledOnce();
  expect(title.value).toBe('Ngày lễ chưa lưu');
  expect(document.querySelector('[role="alert"]')?.textContent?.trim()).toBeTruthy();
  expect(unhandled).toEqual([]);
});

it('keeps an existing anniversary and reports a failed local deletion without an uncaught error', async () => {
  open();
  document.querySelector<HTMLButtonElement>('.pem-delete-btn')!.click();
  await settle();
  document.querySelector<HTMLButtonElement>('.anniversary-delete-dialog button.delete')!.click();
  await settle();
  expect(mocks.remove).toHaveBeenCalledWith('storage-failure-event');
  expect(document.querySelector('.pem-item-title')?.textContent).toContain('Ngày lễ đã lưu');
  expect(document.querySelector('[role="alert"]')?.textContent?.trim()).toBeTruthy();
  expect(unhandled).toEqual([]);
});

it.each([['a', 'b'], ['a', null], [null, 'b']] as const)('clears an unsaved anniversary draft when principal changes from %s to %s', async (initial, next) => {
  let principal: string | null = initial;
  vi.spyOn(sessions, 'getBrowserSessionSnapshot').mockImplementation(() => ({
    authenticated: principal !== null,
    user: principal === null ? null : { id: principal, displayName: principal, role: 'user', email: '' },
    csrfToken: null, expiresAt: null,
  }));
  open();
  const title = document.querySelector<HTMLInputElement>('#pem-input-title')!;
  const note = document.querySelector<HTMLInputElement>('#pem-input-note')!;
  title.value = 'Bản nháp riêng'; title.dispatchEvent(new Event('input', { bubbles: true }));
  note.value = 'Ghi chú riêng'; note.dispatchEvent(new Event('input', { bubbles: true }));
  flushSync();
  window.dispatchEvent(new CustomEvent(sessions.SESSION_CHANGE_EVENT));
  await settle();
  expect(title.value).toBe('Bản nháp riêng');
  expect(note.value).toBe('Ghi chú riêng');
  principal = next;
  window.dispatchEvent(new CustomEvent(sessions.SESSION_CHANGE_EVENT));
  await settle();
  expect(title.value).toBe('');
  expect(note.value).toBe('');
  expect(mocks.add).not.toHaveBeenCalled();
});

it('blocks saving the previous principal draft before the session event arrives', async () => {
  let principal = 'a';
  vi.spyOn(sessions, 'getBrowserSessionSnapshot').mockImplementation(() => ({
    authenticated: true, user: { id: principal, displayName: principal, role: 'user', email: '' },
    csrfToken: null, expiresAt: null,
  }));
  open();
  principal = 'b';
  submitAnniversary('Bản nháp tài khoản cũ');
  await settle();
  expect(mocks.add).not.toHaveBeenCalled();
  expect(document.querySelector<HTMLInputElement>('#pem-input-title')!.value).toBe('');
});

it.each([['a', 'b'], ['a', null], [null, 'b']] as const)('cancels a pending anniversary deletion when principal changes from %s to %s', async (initial, next) => {
  let principal: string | null = initial;
  vi.spyOn(sessions, 'getBrowserSessionSnapshot').mockImplementation(() => ({
    authenticated: principal !== null,
    user: principal === null ? null : { id: principal, displayName: principal, role: 'user', email: '' },
    csrfToken: null, expiresAt: null,
  }));
  const onCancel = vi.fn(), onConfirm = vi.fn();
  const view = mount(DeletePersonalEventDialog, { target: document.body, props: {
    event: { id: 'same-id', title: 'Ngày lễ tài khoản cũ', type: 'gia-dinh', lunarDay: 1, lunarMonth: 1, createdAt: '2026-01-01' },
    isEn: false, onCancel, onConfirm,
  } });
  try {
    flushSync();
    // Cùng tài khoản refresh phiên không được làm mất xác nhận đang mở.
    window.dispatchEvent(new CustomEvent(sessions.SESSION_CHANGE_EVENT));
    await settle();
    expect(onCancel).not.toHaveBeenCalled();
    principal = next;
    window.dispatchEvent(new CustomEvent(sessions.SESSION_CHANGE_EVENT));
    await settle();
    expect(onCancel).toHaveBeenCalledOnce();
    document.querySelector<HTMLButtonElement>('.anniversary-delete-dialog button.delete')?.click();
    expect(onConfirm).not.toHaveBeenCalled();
  } finally { await unmount(view); }
});

it('rechecks the anniversary deletion principal even before the session event is delivered', async () => {
  let principal = 'a';
  vi.spyOn(sessions, 'getBrowserSessionSnapshot').mockImplementation(() => ({
    authenticated: true, user: { id: principal, displayName: principal, role: 'user', email: '' },
    csrfToken: null, expiresAt: null,
  }));
  const onCancel = vi.fn(), onConfirm = vi.fn();
  const view = mount(DeletePersonalEventDialog, { target: document.body, props: {
    event: { id: 'same-id', title: 'Ngày lễ tài khoản cũ', type: 'gia-dinh', lunarDay: 1, lunarMonth: 1, createdAt: '2026-01-01' },
    isEn: false, onCancel, onConfirm,
  } });
  try {
    flushSync();
    principal = 'b';
    document.querySelector<HTMLButtonElement>('.anniversary-delete-dialog button.delete')!.click();
    expect(onCancel).toHaveBeenCalledOnce();
    expect(onConfirm).not.toHaveBeenCalled();
  } finally { await unmount(view); }
});

it('retains the home anniversary and reports a failed deletion without an unhandled storage error', async () => {
  const view = mount(HomeDailyReminders, { target: document.body, props: { selectedDate: new Date(2026, 10, 7, 12) } });
  try {
    flushSync();
    expect(document.querySelector('.personal-item-title')?.textContent).toContain('Ngày lễ đã lưu');
    document.querySelector<HTMLButtonElement>('.personal-delete-btn')!.click();
    flushSync();
    document.querySelector<HTMLButtonElement>('.anniversary-delete-dialog button.delete')!.click();
    await settle();

    expect(mocks.remove).toHaveBeenCalledExactlyOnceWith('storage-failure-event');
    expect(mocks.alert).toHaveBeenCalledExactlyOnceWith(expect.stringContaining('Không thể lưu'));
    expect(document.querySelector('.personal-item-title')?.textContent).toContain('Ngày lễ đã lưu');
    expect(document.querySelector('.anniversary-delete-dialog')).toBeNull();
    expect(unhandled).toEqual([]);
    expect(mocks.sync).not.toHaveBeenCalled();
  } finally { await unmount(view); }
});
