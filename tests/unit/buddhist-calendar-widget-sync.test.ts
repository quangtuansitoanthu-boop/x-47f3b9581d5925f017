import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  native: vi.fn(() => true),
  available: vi.fn(() => true),
  replace: vi.fn(),
  setOwner: vi.fn(),
  watch: vi.fn(),
  stopDay: vi.fn(),
  today: new Date(2026, 10, 1, 18, 42),
  dayChanged: undefined as (() => void) | undefined,
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: mocks.native, isPluginAvailable: mocks.available },
  registerPlugin: vi.fn(() => ({ replaceTimeline: mocks.replace, setPersonalOwner: mocks.setOwner })),
}));
vi.mock('$lib/stores/session.svelte', () => ({
  getBrowserSessionSnapshot: () => ({ authenticated: false, user: null }), SESSION_CHANGE_EVENT: 'quangtu:session-changed',
}));
vi.mock('../../src/lib/browser/personal-lunar-events', async (original) => ({
  ...await original<typeof import('../../src/lib/browser/personal-lunar-events')>(), loadPersonalLunarEvents: () => [],
}));
vi.mock('../../src/lib/components/lunar/lunar-week', () => ({ getVietnamNow: () => new Date(mocks.today) }));
vi.mock('../../src/lib/browser/calendar-day-rollover', () => ({
  watchCalendarDay: mocks.watch,
}));

import { startBuddhistCalendarWidgetSync } from '../../src/lib/browser/buddhist-calendar-widget';

let documentEvents: EventTarget & { visibilityState: string };
let stop: (() => void) | undefined;

async function settled() {
  for (let i = 0; i < 16; i++) await Promise.resolve();
}

function visible(visibilityState = 'visible') {
  documentEvents.visibilityState = visibilityState;
  documentEvents.dispatchEvent(new Event('visibilitychange'));
}

beforeEach(() => {
  vi.clearAllMocks();
  mocks.native.mockReturnValue(true);
  mocks.available.mockReturnValue(true);
  mocks.replace.mockReset().mockResolvedValue(undefined);
  mocks.setOwner.mockReset().mockResolvedValue(undefined);
  mocks.today = new Date(2026, 10, 1, 18, 42);
  mocks.dayChanged = undefined;
  mocks.watch.mockImplementation((callback: () => void) => {
    mocks.dayChanged = callback;
    return mocks.stopDay;
  });
  documentEvents = Object.assign(new EventTarget(), { visibilityState: 'visible' });
  vi.stubGlobal('document', documentEvents);
  vi.stubGlobal('window', new EventTarget());
  vi.stubGlobal('fetch', vi.fn(() => { throw new Error('Widget sync must not request network data'); }));
});

afterEach(async () => {
  stop?.();
  stop = undefined;
  await settled();
  vi.unstubAllGlobals();
});

describe('native Buddhist calendar widget synchronization', () => {
  it('does not publish or install lifecycle observers on web', async () => {
    mocks.native.mockReturnValue(false);
    stop = startBuddhistCalendarWidgetSync();
    visible();
    await settled();

    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.watch).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('tolerates an older native installation where the widget plugin is unavailable', async () => {
    mocks.available.mockReturnValue(false);
    stop = startBuddhistCalendarWidgetSync();
    visible();
    await settled();

    expect(mocks.available).toHaveBeenCalledWith('BuddhistCalendarWidget');
    expect(mocks.replace).not.toHaveBeenCalled();
    expect(mocks.watch).not.toHaveBeenCalled();
  });

  it('publishes one 400-day local timeline and deduplicates same-day foreground events', async () => {
    stop = startBuddhistCalendarWidgetSync();
    await settled();
    visible();
    visible();
    mocks.dayChanged?.();
    await settled();

    expect(mocks.replace).toHaveBeenCalledOnce();
    const timeline = mocks.replace.mock.calls[0][0];
    expect(timeline.days).toHaveLength(400);
    expect(timeline.days[0]).toMatchObject({ date: '2026-11-01', solarDateShort: '01/11/2026' });
    expect(timeline.days.every((day: Record<string, unknown>) => !('personalNote' in day))).toBe(true);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('refreshes on the next calendar day and ignores background visibility events', async () => {
    stop = startBuddhistCalendarWidgetSync();
    await settled();
    mocks.today = new Date(2026, 10, 2, 0, 1);
    visible('hidden');
    expect(mocks.replace).toHaveBeenCalledOnce();
    mocks.dayChanged?.();
    await settled();

    expect(mocks.replace).toHaveBeenCalledTimes(2);
    expect(mocks.replace.mock.calls[1][0].days[0].date).toBe('2026-11-02');
    visible();
    await settled();
    expect(mocks.replace).toHaveBeenCalledTimes(2);
  });

  it('coalesces pending publication and retries only on a later lifecycle event after failure', async () => {
    let reject!: (reason: Error) => void;
    mocks.replace.mockImplementationOnce(() => new Promise<void>((_resolve, fail) => { reject = fail; }));
    stop = startBuddhistCalendarWidgetSync();
    visible();
    mocks.dayChanged?.();
    await settled();
    expect(mocks.replace).toHaveBeenCalledOnce();
    reject(new Error('Native storage unavailable'));
    await settled();
    expect(mocks.replace).toHaveBeenCalledOnce();

    visible();
    await settled();
    expect(mocks.replace).toHaveBeenCalledTimes(2);
    visible();
    await settled();
    expect(mocks.replace).toHaveBeenCalledTimes(2);
    expect(fetch).not.toHaveBeenCalled();
  });

  it('cleans lifecycle observers and ignores a late bridge completion or stale day callback', async () => {
    let resolve!: () => void;
    mocks.replace.mockImplementationOnce(() => new Promise<void>(done => { resolve = done; }));
    stop = startBuddhistCalendarWidgetSync();
    await settled();
    const staleDayCallback = mocks.dayChanged;
    const dispose = stop;
    stop = undefined;
    dispose();
    expect(mocks.stopDay).toHaveBeenCalledOnce();
    resolve();
    await settled();
    mocks.today = new Date(2026, 10, 2);
    staleDayCallback?.();
    visible();
    await settled();

    expect(mocks.replace).toHaveBeenCalledTimes(2);
    expect(mocks.replace.mock.calls[1][0].days[0]).not.toHaveProperty('personalEvents');
    expect(fetch).not.toHaveBeenCalled();
  });
});
