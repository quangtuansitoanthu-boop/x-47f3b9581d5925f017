import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { PersonalLunarEvent } from '../../src/lib/browser/personal-lunar-events';

const mocks = vi.hoisted(() => ({
  setOwner: vi.fn(), replace: vi.fn(), read: vi.fn(), stopDay: vi.fn(),
  session: { authenticated: true, user: { id: 'alice' } } as { authenticated: boolean; user: { id: string } | null },
  today: new Date(2026, 10, 2),
}));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => true, isPluginAvailable: () => true },
  registerPlugin: () => ({ setPersonalOwner: mocks.setOwner, replaceTimeline: mocks.replace }),
}));
vi.mock('$lib/stores/session.svelte', () => ({
  getBrowserSessionSnapshot: () => mocks.session, SESSION_CHANGE_EVENT: 'quangtu:session-changed',
}));
vi.mock('../../src/lib/browser/personal-lunar-events', async (original) => ({
  ...await original<typeof import('../../src/lib/browser/personal-lunar-events')>(),
  loadPersonalLunarEvents: mocks.read,
}));
vi.mock('../../src/lib/components/lunar/lunar-week', () => ({ getVietnamNow: () => new Date(mocks.today) }));
vi.mock('../../src/lib/browser/calendar-day-rollover', () => ({ watchCalendarDay: () => mocks.stopDay }));
import { startBuddhistCalendarWidgetSync } from '../../src/lib/browser/buddhist-calendar-widget';
import * as calendarData from '../../src/lib/browser/buddhist-calendar-widget-data';

let windowEvents: EventTarget;
let documentEvents: EventTarget & { visibilityState: string };
let stop: (() => void) | undefined;
const event = (title: string): PersonalLunarEvent => ({ id: 'family', title, lunarDay: 24, lunarMonth: 9,
  calendarMode: 'solar', solarDay: 2, solarMonth: 11, type: 'gia-dinh', createdAt: '2026-01-01' });
const flush = async () => { for (let i = 0; i < 16; i++) await Promise.resolve(); };
beforeEach(() => {
  mocks.session = { authenticated: true, user: { id: 'alice' } };
  mocks.setOwner.mockReset().mockResolvedValue(undefined);
  mocks.replace.mockReset().mockResolvedValue(undefined);
  mocks.read.mockReset().mockReturnValue([event('Giỗ gia đình')]);
  mocks.stopDay.mockReset();
  windowEvents = new EventTarget();
  documentEvents = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('window', windowEvents);
  vi.stubGlobal('document', documentEvents);
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Widget must not fetch'); }));
});
afterEach(async () => { stop?.(); stop = undefined; await flush(); vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it('sets native ownership before publishing local personal records without a request', async () => {
  stop = startBuddhistCalendarWidgetSync(); await flush();
  expect(mocks.setOwner).toHaveBeenCalledWith({ owner: 'user:alice' });
  expect(mocks.setOwner.mock.invocationCallOrder[0]).toBeLessThan(mocks.replace.mock.invocationCallOrder[0]);
  expect(mocks.replace.mock.calls[0][0]).toMatchObject({ personalOwner: 'user:alice', days: [
    expect.objectContaining({ personalEventCount: 1, personalEvents: [expect.objectContaining({ title: 'Giỗ gia đình' })] }),
    ...Array.from({ length: 399 }, () => expect.anything()),
  ] });
  documentEvents.dispatchEvent(new Event('visibilitychange')); await flush();
  expect(mocks.replace).toHaveBeenCalledOnce();
  expect(fetch).not.toHaveBeenCalled();
});

it('does not rebuild the 400-day projection on an unchanged foreground or duplicate data event', async () => {
  const build = vi.spyOn(calendarData, 'buildBuddhistCalendarTimeline');
  stop = startBuddhistCalendarWidgetSync(); await flush();
  expect(build).toHaveBeenCalledOnce();
  documentEvents.dispatchEvent(new Event('visibilitychange'));
  windowEvents.dispatchEvent(new Event('quangtu:personal-events-changed')); await flush();
  expect(build).toHaveBeenCalledOnce();
});

it('updates and removes same-day personal records from the existing change event, then cleans observers', async () => {
  stop = startBuddhistCalendarWidgetSync(); await flush();
  mocks.read.mockReturnValue([event('Ngày quy y')]);
  windowEvents.dispatchEvent(new Event('quangtu:personal-events-changed')); await flush();
  expect(mocks.replace.mock.calls.at(-1)?.[0].days[0].personalEvents[0].title).toBe('Ngày quy y');
  mocks.read.mockReturnValue([]);
  windowEvents.dispatchEvent(new Event('quangtu:personal-events-changed')); await flush();
  expect(mocks.replace.mock.calls.at(-1)?.[0].days[0].personalEventCount).toBe(0);
  expect(mocks.replace).toHaveBeenCalledTimes(3);
  stop(); stop = undefined;
  windowEvents.dispatchEvent(new Event('quangtu:personal-events-changed')); await flush();
  expect(mocks.replace).toHaveBeenCalledTimes(3);
});

it('moves the native barrier immediately and drains only the latest account after an old write', async () => {
  let finish!: () => void;
  mocks.replace.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  stop = startBuddhistCalendarWidgetSync(); await flush();
  mocks.session = { authenticated: true, user: { id: 'bob' } };
  mocks.read.mockReturnValue([event('Kỷ niệm của Bob')]);
  windowEvents.dispatchEvent(new Event('quangtu:session-changed')); await flush();
  expect(mocks.setOwner).toHaveBeenLastCalledWith({ owner: 'user:bob' });
  finish(); await flush();
  expect(mocks.replace.mock.calls.at(-1)?.[0].personalOwner).toBe('user:bob');
  expect(JSON.stringify(mocks.replace.mock.calls.at(-1)?.[0])).not.toContain('Giỗ gia đình');
});

it('clears private fields on a failed local read without inventing zero personal events', async () => {
  mocks.read.mockImplementation(() => { throw new Error('Invalid local storage'); });
  stop = startBuddhistCalendarWidgetSync(); await flush();
  expect(mocks.replace.mock.calls.at(-1)?.[0].days[0]).not.toHaveProperty('personalEventCount');
  expect(mocks.replace.mock.calls.at(-1)?.[0].days[0]).not.toHaveProperty('personalEvents');
  expect(fetch).not.toHaveBeenCalled();
});

it('publishes public-only data when an old bridge lacks the owner method, then retries on foreground', async () => {
  mocks.setOwner.mockRejectedValueOnce(new Error('UNIMPLEMENTED'));
  stop = startBuddhistCalendarWidgetSync(); await flush();
  expect(mocks.replace.mock.calls[0][0]).not.toHaveProperty('personalOwner');
  expect(mocks.replace.mock.calls[0][0].days[0]).not.toHaveProperty('personalEvents');
  documentEvents.dispatchEvent(new Event('visibilitychange')); await flush();
  expect(mocks.replace.mock.calls.at(-1)?.[0].personalOwner).toBe('user:alice');
});

it('does not republish private data after disposal interrupts a change of account', async () => {
  let finish!: () => void;
  mocks.replace.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  stop = startBuddhistCalendarWidgetSync(); await flush();
  mocks.session = { authenticated: false, user: null };
  mocks.read.mockReturnValue([]);
  windowEvents.dispatchEvent(new Event('quangtu:session-changed')); await flush();
  stop(); stop = undefined;
  finish(); await flush();
  expect(mocks.setOwner).toHaveBeenLastCalledWith({ owner: 'guest' });
  expect(mocks.replace.mock.calls.at(-1)?.[0].days[0]).not.toHaveProperty('personalEvents');
  expect(JSON.stringify(mocks.replace.mock.calls.at(-1)?.[0])).not.toContain('Giỗ gia đình');
});

it('restores the first account after an intervening owner barrier, even when content equals the old in-flight write', async () => {
  let finish!: () => void;
  mocks.replace.mockImplementationOnce(() => new Promise<void>(resolve => { finish = resolve; }));
  stop = startBuddhistCalendarWidgetSync(); await flush();
  mocks.session = { authenticated: true, user: { id: 'bob' } };
  windowEvents.dispatchEvent(new Event('quangtu:session-changed')); await flush();
  mocks.session = { authenticated: true, user: { id: 'alice' } };
  windowEvents.dispatchEvent(new Event('quangtu:session-changed')); await flush();
  finish(); await flush();
  expect(mocks.replace).toHaveBeenCalledTimes(2);
  expect(mocks.replace.mock.calls[1][0].personalOwner).toBe('user:alice');
});
