import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { flushSync, mount, unmount } from 'svelte';
import { SvelteMap } from 'svelte/reactivity';
import PracticeReminderCard from '../../../src/lib/components/practice/reminder/PracticeReminderCard.svelte';

const mocks = vi.hoisted(() => ({ platform: 'ios' as 'ios' | 'android' | 'web', masterEnabled: true, check: vi.fn(), request: vi.fn(), sync: vi.fn(), save: vi.fn() }));
vi.mock('$lib/stores/locale.svelte', async () => {
  const { translations } = await import('../../../src/lib/i18n/translations');
  return { getLocaleContext: () => ({ current: 'vi', t: translations.vi }) };
});
vi.mock('$lib/browser/native-platform', () => ({ nativePlatform: () => mocks.platform, isNativeApp: () => mocks.platform !== 'web' }));
vi.mock('$lib/browser/native-notifications', () => ({
  getUnifiedNotificationPermission: mocks.check, requestUnifiedNotificationPermission: mocks.request,
  getExactReminderPermission: vi.fn(async () => 'unsupported'), requestExactReminderPermission: vi.fn(async () => 'unsupported'),
}));
vi.mock('$lib/browser/practice-reminder-service', () => ({
  loadReminderSettings: () => ({ masterEnabled: mocks.masterEnabled,
    lunar: { thoKhangBaoGiam: true, thapTrai: true, viaPhat: true, notifyEveBefore: true, notifyMorningOf: true },
    dailySchedules: [{ id: 'morning', label: 'Sáng', enabled: true, time: '06:00', days: [0, 1, 2, 3, 4, 5, 6] }], soundEnabled: true, vibrateEnabled: true }),
  saveReminderSettings: mocks.save, syncRemindersWithSystem: mocks.sync,
  subscribeReminderSyncStatus: () => () => {}, sendTestNotification: vi.fn(),
  resolvePersonalReminderConfig: () => ({ beforeEnabled: true, dayEnabled: true, daysBefore: 1, beforeTime: '19:30', dayTime: '06:00' }),
}));
vi.mock('$lib/browser/personal-lunar-events', async importOriginal => {
  const original = await importOriginal<typeof import('../../../src/lib/browser/personal-lunar-events')>();
  return { ...original, loadPersonalLunarEvents: () => [], isPersonalEventsNotificationEnabled: () => true };
});
vi.mock('$lib/utils/haptics', () => ({ triggerHaptic: vi.fn() }));
vi.mock('$lib/browser/app-dialog', () => ({ alertInApp: vi.fn() }));

let component: ReturnType<typeof PracticeReminderCard> | undefined;
const settle = async () => { for (let index = 0; index < 12; index++) { await Promise.resolve(); flushSync(); } };
function start(section = '') {
  const state = new SvelteMap([['section', section]]);
  component = mount(PracticeReminderCard, { target: document.body, props: { get activeSection() { return state.get('section') ?? ''; } } });
  flushSync(); return state;
}
beforeEach(() => {
  localStorage.clear(); mocks.platform = 'ios'; mocks.masterEnabled = true;
  mocks.check.mockReset().mockResolvedValue('prompt'); mocks.request.mockReset().mockResolvedValue('granted');
  mocks.sync.mockReset().mockResolvedValue({ success: true, scheduledCount: 2 }); mocks.save.mockReset().mockReturnValue(true);
});
afterEach(async () => {
  if (component) await unmount(component);
  component = undefined; document.body.replaceChildren(); localStorage.clear(); vi.restoreAllMocks();
});

it('does not ask just because the closed settings card mounted', async () => {
  start(); await settle(); expect(mocks.check).toHaveBeenCalled();
  expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
});
it.each(['lunar', 'personal', 'daily'])('asks iOS just in time for %s and schedules only after grant', async section => {
  const state = start(); await settle(); expect(mocks.request).not.toHaveBeenCalled();
  state.set('section', section); await settle(); expect(mocks.request).toHaveBeenCalledOnce(); expect(mocks.sync).toHaveBeenCalledOnce();
  expect(mocks.sync.mock.calls[0][0]).toMatchObject({ masterEnabled: true }); expect(mocks.sync.mock.calls[0][1]).toBe('vi');
});
it('treats an initially opened lunar settings section as contextual use', async () => {
  start('lunar'); await settle(); expect(mocks.request).toHaveBeenCalledOnce(); expect(mocks.sync).toHaveBeenCalledOnce();
});
it.each(['android', 'web'] as const)('does not auto-request permission on %s', async platform => {
  mocks.platform = platform; start('lunar'); await settle(); expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
});
it.each(['granted', 'denied', 'unsupported'])('does not prompt when existing permission is %s', async permission => {
  mocks.check.mockResolvedValue(permission); start('lunar'); await settle(); expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
});
it('does not ask when reminders are disabled or a non-reminder section is opened', async () => {
  mocks.masterEnabled = false; start('lunar'); await settle(); expect(mocks.request).not.toHaveBeenCalled();
  await unmount(component!); component = undefined; mocks.masterEnabled = true; start('sound'); await settle(); expect(mocks.request).not.toHaveBeenCalled();
});
it('requests once across repeated section changes even when the user declines', async () => {
  mocks.request.mockResolvedValue('denied'); const state = start('lunar'); await settle();
  for (const section of ['personal', '', 'daily', 'lunar']) { state.set('section', section); await settle(); }
  expect(mocks.request).toHaveBeenCalledOnce(); expect(mocks.sync).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Trên iOS');
});
it('keeps an unavailable iOS bridge retry action visible and schedules after explicit retry is granted', async () => {
  mocks.check.mockResolvedValue('unsupported'); start('lunar'); await settle();
  expect(mocks.request).not.toHaveBeenCalled();
  expect(document.querySelector('.reminder-perm-text')?.textContent).toContain('Chưa kết nối được tính năng thông báo iOS');
  const retry = document.querySelector<HTMLButtonElement>('.reminder-perm-btn');
  expect(retry?.textContent).toContain('Thử lại quyền thông báo');
  retry!.click(); await settle();
  expect(mocks.request).toHaveBeenCalledOnce(); expect(mocks.sync).toHaveBeenCalledOnce();
  expect(document.querySelector('.reminder-perm-btn')).toBeNull();
});
it('shows an error and never schedules if the iOS permission request reports unavailable', async () => {
  mocks.request.mockResolvedValue('unsupported'); start('lunar'); await settle();
  expect(mocks.request).toHaveBeenCalledOnce(); expect(mocks.sync).not.toHaveBeenCalled();
  expect(document.querySelector('[role="alert"]')?.textContent).toContain('Chưa kết nối được tính năng thông báo iOS');
  expect(document.querySelector('.reminder-perm-btn')?.textContent).toContain('Thử lại quyền thông báo');
});
it('does not request after unmount while the initial status check was pending', async () => {
  let resolve!: (permission: string) => void;
  mocks.check.mockImplementation(() => new Promise<string>(done => { resolve = done; }));
  start('lunar'); expect(mocks.check).toHaveBeenCalled(); expect(mocks.request).not.toHaveBeenCalled();
  await unmount(component!); component = undefined; resolve('prompt'); await settle();
  expect(mocks.request).not.toHaveBeenCalled(); expect(mocks.sync).not.toHaveBeenCalled();
});
