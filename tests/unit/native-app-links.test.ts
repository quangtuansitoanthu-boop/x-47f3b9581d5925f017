import { readFileSync } from 'node:fs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  native: vi.fn(() => true), appListener: vi.fn(), launch: vi.fn(), notificationListener: vi.fn(),
}));
vi.mock('../../src/lib/browser/native-platform', () => ({ isNativeApp: mocks.native }));
vi.mock('@capacitor/app', () => ({ App: { addListener: mocks.appListener, getLaunchUrl: mocks.launch } }));
vi.mock('../../src/lib/browser/native-notifications', () => ({ addNotificationActionListener: mocks.notificationListener }));
import { resolveNativeAppPath, startNativeAppLinks } from '../../src/lib/browser/native-app-links';
import { PRACTICE_WIDGET_ITEMS } from '../../src/lib/i18n/practice-widget';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.native.mockReturnValue(true);
  mocks.launch.mockResolvedValue(undefined);
  mocks.appListener.mockResolvedValue({ remove: vi.fn(async () => {}) });
  mocks.notificationListener.mockResolvedValue(vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

describe('native link targets', () => {
  it('registers calendar, audio, then practice widgets on both native platforms', () => {
    const swift = readFileSync('ios/App/CalendarWidget/BuddhistCalendarWidget.swift', 'utf8');
    const entries = [...swift.matchAll(/WidgetBundleBuilder\.buildBlock\(([\s\S]*?)\n\s*\)/gu)]
      .map(match => [...match[1].matchAll(/(\w+Widget)\(\)/gu)].map(entry => entry[1]));
    expect(entries).toEqual([
      ['BuddhistCalendarModernWidget', 'DharmaAudioModernWidget', 'PracticeModernHomeWidget'],
      ['BuddhistCalendarWidget', 'DharmaAudioWidget', 'PracticeHomeWidget'],
    ]);
    const manifest = readFileSync('android/app/src/main/AndroidManifest.xml', 'utf8');
    const providers = [...manifest.matchAll(/<receiver\b[\s\S]*?<\/receiver>/gu)]
      .flatMap(match => [...match[0].matchAll(/@xml\/((?:buddhist_calendar|dharma_audio_widget|practice_widget)_(?:small|medium|large)(?:_info)?)/gu)].map(entry => entry[1]));
    expect(providers).toEqual([
      'buddhist_calendar_small', 'buddhist_calendar_medium', 'buddhist_calendar_large',
      'dharma_audio_widget_small', 'dharma_audio_widget_medium', 'dharma_audio_widget_large',
      'practice_widget_small_info', 'practice_widget_medium_info', 'practice_widget_large_info',
    ]);
  });
  it('connects both native widget shortcut tables to the shared tool routes and practice home CTA', () => {
    const android = readFileSync('android/app/src/main/java/vn/quangtu/tutam/widgets/PracticeWidgetProvider.java', 'utf8');
    const iosItems = readFileSync('ios/App/CalendarShared/PracticeWidgetSnapshot.swift', 'utf8');
    const iosView = readFileSync('ios/App/CalendarWidget/PracticeWidget.swift', 'utf8');
    const strings = (name: string) => [...(android.match(new RegExp(`${name} = \\{([^}]+)\\}`))?.[1] ?? '').matchAll(/"([^"]+)"/g)].map(match => match[1]);
    const ids = strings('IDS');
    const paths = strings('PATHS');
    expect(ids).toEqual(PRACTICE_WIDGET_ITEMS.map(item => item.id));
    expect(paths).toEqual(PRACTICE_WIDGET_ITEMS.map(item => item.path));
    const iosRoutes = new Map([...iosItems.matchAll(/case "([^"]+)": route = "([^"]+)"/g)].map(match => [match[1], `/${match[2]}`]));
    for (const { id, path } of PRACTICE_WIDGET_ITEMS) expect(iosRoutes.get(id)).toBe(path);
    expect(android).toMatch(/setOnClickPendingIntent\(R\.id\.practice_widget_root, open\(context, "\/tu-tap"\)\)/);
    expect(android).toMatch(/setOnClickPendingIntent\(R\.id\.practice_widget_start, open\(context, "\/tu-tap"\)\)/);
    expect(iosView).toContain('.widgetURL(URL(string: "vn.quangtu.tutam://tu-tap"))');
  });
  it.each(PRACTICE_WIDGET_ITEMS)('keeps the widget shortcut for $id on its existing tool route', ({ path }) => {
    expect(resolveNativeAppPath(`vn.quangtu.tutam://${path}`)).toBe(path);
  });
  it.each([
    ['/tu-tap?mode=meditation#session', '/tu-tap?mode=meditation#session'],
    ['vn.quangtu.tutam://tu-tap?mode=meditation', '/tu-tap?mode=meditation'],
    ['vn.quangtu.tutam:///lich-am?day=1', '/lich-am?day=1'],
    ['https://quangtu.vn/?article=old-id', '/?article=old-id'],
    ['https://www.quangtu.vn/phap-thoai?album=1', '/phap-thoai?album=1'],
  ])('resolves %s without changing legacy query/hash', (input, expected) => {
    expect(resolveNativeAppPath(input)).toBe(expected);
  });

  it.each([
    null, 12, {}, '', '//evil.example/tu-tap', '/\\evil.example', 'https://evil.example/',
    'https://quangtu.vn.evil.example/', 'http://quangtu.vn/', 'javascript:alert(1)',
    'https://user:password@quangtu.vn/', 'https://quangtu.vn:1234/',
    '/api/session', 'vn.quangtu.tutam://api/session', '/auth/google', '/oauth/callback',
    '/%2f%2fevil.example', '/tu-tap\n',
  ])('rejects non-app or privileged target %j', (input) => {
    expect(resolveNativeAppPath(input)).toBeNull();
  });
});

describe('root-owned native link lifecycle', () => {
  it('opens the practice home CTA from cold and warm launches without fetching or inventing a practice action', async () => {
    mocks.launch.mockResolvedValue({ url: 'vn.quangtu.tutam:///tu-tap' });
    const windowEvents = Object.assign(new EventTarget(), {
      location: { pathname: '/', search: '', hash: '' },
    });
    vi.stubGlobal('window', windowEvents);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const reopen = vi.fn();
    windowEvents.addEventListener('quangtu:practice-widget-open', reopen);
    const navigate = vi.fn(async () => {});
    const stop = startNativeAppLinks(navigate);
    try {
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/tu-tap'));
      Object.assign(windowEvents.location, { pathname: '/ca-nhan', search: '', hash: '' });
      const onUrl = mocks.appListener.mock.calls[0][1] as (event: { url: string }) => void;
      onUrl({ url: 'vn.quangtu.tutam:///tu-tap' });
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(2));
      expect(navigate).toHaveBeenLastCalledWith('/tu-tap');
      expect(reopen).not.toHaveBeenCalled();
      expect(fetch).not.toHaveBeenCalled();
    } finally { stop(); }
  });
  it.each(['/tu-tap?action=rosary', '/tu-tap?action=meditation', '/tu-tap?muc=kinh'])
  ('reapplies a warm practice intent after navigating within the mounted route: %s', async (path) => {
    const windowEvents = Object.assign(new EventTarget(), {
      location: { pathname: '/tu-tap', search: '', hash: '' },
    });
    vi.stubGlobal('window', windowEvents);
    const reopen = vi.fn();
    windowEvents.addEventListener('quangtu:practice-widget-open', reopen);
    let finishNavigation: () => void = () => undefined;
    const navigate = vi.fn(() => new Promise<void>((resolve) => {
      finishNavigation = () => {
        const target = new URL(path, 'https://quangtu.vn');
        Object.assign(windowEvents.location, { pathname: target.pathname, search: target.search, hash: target.hash });
        resolve();
      };
    }));
    const stop = startNativeAppLinks(navigate);
    try {
      await vi.waitFor(() => expect(mocks.appListener).toHaveBeenCalledOnce());
      const onUrl = mocks.appListener.mock.calls[0][1] as (event: { url: string }) => void;
      onUrl({ url: `vn.quangtu.tutam://${path}` });
      expect(navigate).toHaveBeenCalledWith(path);
      expect(reopen).not.toHaveBeenCalled();
      finishNavigation();
      await vi.waitFor(() => expect(reopen).toHaveBeenCalledOnce());
      expect((reopen.mock.calls[0][0] as CustomEvent).detail).toEqual({ path });
    } finally { stop(); }
  });

  it('never reopens a stale warm practice target after newer navigation or disposal', async () => {
    const windowEvents = Object.assign(new EventTarget(), {
      location: { pathname: '/tu-tap', search: '', hash: '' },
    });
    vi.stubGlobal('window', windowEvents);
    const reopen = vi.fn();
    windowEvents.addEventListener('quangtu:practice-widget-open', reopen);
    const pending: Array<{ path: string; finish: () => void }> = [];
    const navigate = vi.fn((path: string) => new Promise<void>((resolve) => {
      pending.push({ path, finish: () => {
        const url = new URL(path, 'https://quangtu.vn');
        Object.assign(windowEvents.location, { pathname: url.pathname, search: url.search, hash: url.hash });
        resolve();
      } });
    }));
    const stop = startNativeAppLinks(navigate);
    await vi.waitFor(() => expect(mocks.appListener).toHaveBeenCalledOnce());
    const onUrl = mocks.appListener.mock.calls[0][1] as (event: { url: string }) => void;
    onUrl({ url: 'vn.quangtu.tutam:///tu-tap?action=rosary' });
    onUrl({ url: 'vn.quangtu.tutam:///tu-tap?action=meditation' });
    pending[1].finish();
    await vi.waitFor(() => expect(reopen).toHaveBeenCalledOnce());
    expect((reopen.mock.calls[0][0] as CustomEvent).detail.path).toBe('/tu-tap?action=meditation');
    pending[0].finish();
    await Promise.resolve();
    expect(reopen).toHaveBeenCalledOnce();
    onUrl({ url: 'vn.quangtu.tutam:///tu-tap?action=thoi-khoa' });
    stop();
    pending[2].finish();
    await Promise.resolve();
    expect(reopen).toHaveBeenCalledOnce();
  });

  it.each(['/tu-tap?action=rosary', '/tu-tap?action=meditation', '/tu-tap?muc=kinh', '/tu-tap?muc=tri-chu'])
  ('reapplies a same-URL practice target after its tool or section was closed: %s', async (path) => {
    const url = new URL(path, 'https://quangtu.vn');
    const windowEvents = Object.assign(new EventTarget(), {
      location: { pathname: url.pathname, search: url.search, hash: url.hash },
    });
    vi.stubGlobal('window', windowEvents);
    const reopen = vi.fn();
    windowEvents.addEventListener('quangtu:practice-widget-open', reopen);
    const navigate = vi.fn();
    const refreshMedia = vi.fn(async () => undefined);
    const stop = startNativeAppLinks(navigate, refreshMedia);
    try {
      await vi.waitFor(() => expect(mocks.appListener).toHaveBeenCalledOnce());
      const onUrl = mocks.appListener.mock.calls[0][1] as (event: { url: string }) => void;
      onUrl({ url: `vn.quangtu.tutam://${path}` });
      expect(reopen).toHaveBeenCalledOnce();
      expect((reopen.mock.calls[0][0] as CustomEvent).detail).toEqual({ path });
      expect(navigate).not.toHaveBeenCalled();
      expect(refreshMedia).not.toHaveBeenCalled();
    } finally { stop(); }
  });

  it.each(['/phap-thoai?album=1', '/tu-tap?action=unknown', '/tu-tap?muc=unknown', '/?action=rosary'])
  ('does not replay media or dispatch an unsupported same-URL practice target: %s', async (path) => {
    const url = new URL(path, 'https://quangtu.vn');
    const windowEvents = Object.assign(new EventTarget(), {
      location: { pathname: url.pathname, search: url.search, hash: url.hash },
    });
    vi.stubGlobal('window', windowEvents);
    const reopen = vi.fn();
    windowEvents.addEventListener('quangtu:practice-widget-open', reopen);
    const navigate = vi.fn();
    const stop = startNativeAppLinks(navigate);
    try {
      await vi.waitFor(() => expect(mocks.appListener).toHaveBeenCalledOnce());
      const onUrl = mocks.appListener.mock.calls[0][1] as (event: { url: string }) => void;
      onUrl({ url: `vn.quangtu.tutam://${path}` });
      expect(reopen).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    } finally { stop(); }
  });

  it('reapplies a valid calendar date when tapping the widget again on the same URL without navigation', async () => {
    const windowEvents = Object.assign(new EventTarget(), {
      location: { pathname: '/', search: '?calendarDate=2026-11-01', hash: '#home-calendar' },
    });
    vi.stubGlobal('window', windowEvents);
    const selected = vi.fn();
    windowEvents.addEventListener('quangtu:calendar-widget-date', selected);
    const navigate = vi.fn();
    const stop = startNativeAppLinks(navigate);
    try {
      await vi.waitFor(() => expect(mocks.appListener).toHaveBeenCalledOnce());
      const onUrl = mocks.appListener.mock.calls[0][1] as (event: { url: string }) => void;
      onUrl({ url: 'vn.quangtu.tutam:///?calendarDate=2026-11-01#home-calendar' });
      expect(selected).toHaveBeenCalledOnce();
      expect((selected.mock.calls[0][0] as CustomEvent).detail).toEqual({ date: '2026-11-01' });
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it.each(['/?calendarDate=2026-02-30#home-calendar', '/tu-tap?calendarDate=2026-11-01#home-calendar', '/?mode=meditation'])
  ('does not dispatch a calendar intent for an invalid date or unrelated same-page target: %s', async (path) => {
    const url = new URL(path, 'https://quangtu.vn');
    const windowEvents = Object.assign(new EventTarget(), {
      location: { pathname: url.pathname, search: url.search, hash: url.hash },
    });
    vi.stubGlobal('window', windowEvents);
    const selected = vi.fn();
    windowEvents.addEventListener('quangtu:calendar-widget-date', selected);
    const navigate = vi.fn();
    const stop = startNativeAppLinks(navigate);
    try {
      await vi.waitFor(() => expect(mocks.appListener).toHaveBeenCalledOnce());
      const onUrl = mocks.appListener.mock.calls[0][1] as (event: { url: string }) => void;
      onUrl({ url: `vn.quangtu.tutam://${path}` });
      expect(selected).not.toHaveBeenCalled();
      expect(navigate).not.toHaveBeenCalled();
    } finally {
      stop();
    }
  });

  it('does not import/register native listeners or fetch on web', async () => {
    mocks.native.mockReturnValue(false);
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const stop = startNativeAppLinks(vi.fn());
    await vi.waitFor(() => expect(mocks.appListener).not.toHaveBeenCalled());
    stop();
    expect(mocks.notificationListener).not.toHaveBeenCalled();
    expect(fetch).not.toHaveBeenCalled();
  });

  it('handles cold launch, warm launch and the existing notification listener with cleanup', async () => {
    mocks.launch.mockResolvedValue({ url: 'vn.quangtu.tutam://lich-am' });
    const removeApp = vi.fn(async () => {});
    const removeNotifications = vi.fn();
    mocks.appListener.mockResolvedValue({ remove: removeApp });
    mocks.notificationListener.mockResolvedValue(removeNotifications);
    const navigate = vi.fn(async () => {});
    const fetch = vi.fn();
    vi.stubGlobal('fetch', fetch);
    const stop = startNativeAppLinks(navigate);
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/lich-am'));
    const onUrl = mocks.appListener.mock.calls[0][1] as (event: { url: string }) => void;
    const onNotification = mocks.notificationListener.mock.calls[0][0] as (event: { notification: unknown }) => void;
    onUrl({ url: 'vn.quangtu.tutam://tu-tap?mode=meditation' });
    onNotification({ notification: { extra: { target: '/ca-nhan?tab=calendar' } } });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledTimes(3));
    expect(navigate).toHaveBeenLastCalledWith('/ca-nhan?tab=calendar');
    expect(fetch).not.toHaveBeenCalled();
    stop();
    expect(removeApp).toHaveBeenCalledOnce();
    expect(removeNotifications).toHaveBeenCalledOnce();
    onUrl({ url: 'vn.quangtu.tutam://another' });
    expect(navigate).toHaveBeenCalledTimes(3);
    expect(readFileSync('src/routes/+layout.svelte', 'utf8')).toContain('stopNativeAppLinks?.();');
  });

  it('ignores a stale cold-launch URL after a newer warm event and coalesces pending navigation', async () => {
    let launch!: (value: { url: string }) => void;
    mocks.launch.mockImplementation(() => new Promise(resolve => { launch = resolve; }));
    let finishNavigation!: () => void;
    const navigate = vi.fn(() => new Promise<void>(resolve => { finishNavigation = resolve; }));
    const stop = startNativeAppLinks(navigate);
    await vi.waitFor(() => expect(mocks.launch).toHaveBeenCalledOnce());
    const onUrl = mocks.appListener.mock.calls[0][1] as (event: { url: string }) => void;
    onUrl({ url: 'vn.quangtu.tutam://tu-tap' });
    onUrl({ url: 'vn.quangtu.tutam://tu-tap' });
    launch({ url: 'vn.quangtu.tutam://old' });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    expect(navigate).toHaveBeenCalledWith('/tu-tap');
    finishNavigation();
    stop();
  });

  it('keeps a newer notification target when the old cold-launch URL resolves later', async () => {
    let resolveLaunch!: (value: { url: string }) => void;
    mocks.launch.mockImplementation(() => new Promise(resolve => { resolveLaunch = resolve; }));
    const navigate = vi.fn(async () => {});
    const stop = startNativeAppLinks(navigate);
    try {
      await vi.waitFor(() => expect(mocks.launch).toHaveBeenCalledOnce());
      await vi.waitFor(() => expect(mocks.notificationListener).toHaveBeenCalledOnce());
      const notification = mocks.notificationListener.mock.calls[0][0] as (event: { notification: unknown }) => void;
      notification({ notification: { extra: { target: '/tu-tap?muc=kinh' } } });
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/tu-tap?muc=kinh'));
      resolveLaunch({ url: 'vn.quangtu.tutam:///phap-thoai' });
      await Promise.resolve();
      await Promise.resolve();
      expect(navigate).toHaveBeenCalledOnce();
      expect(navigate).toHaveBeenLastCalledWith('/tu-tap?muc=kinh');
    } finally { stop(); }
  });

  it('does not let an unsafe notification suppress a valid pending cold-launch URL', async () => {
    let resolveLaunch!: (value: { url: string }) => void;
    mocks.launch.mockImplementation(() => new Promise(resolve => { resolveLaunch = resolve; }));
    const navigate = vi.fn(async () => {});
    const stop = startNativeAppLinks(navigate);
    try {
      await vi.waitFor(() => expect(mocks.launch).toHaveBeenCalledOnce());
      await vi.waitFor(() => expect(mocks.notificationListener).toHaveBeenCalledOnce());
      const notification = mocks.notificationListener.mock.calls[0][0] as (event: { notification: unknown }) => void;
      notification({ notification: { extra: { target: 'https://untrusted.example/' } } });
      expect(navigate).not.toHaveBeenCalled();
      resolveLaunch({ url: 'vn.quangtu.tutam:///phap-thoai' });
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/phap-thoai'));
      expect(navigate).toHaveBeenCalledOnce();
    } finally { stop(); }
  });

  it.each(['https://untrusted.example/', 'vn.quangtu.tutam://auth/callback'])('does not let rejected warm link %s suppress a valid pending cold launch', async url => {
    let resolveLaunch!: (value: { url: string }) => void;
    mocks.launch.mockImplementation(() => new Promise(resolve => { resolveLaunch = resolve; }));
    const navigate = vi.fn(async () => {});
    const stop = startNativeAppLinks(navigate);
    try {
      await vi.waitFor(() => expect(mocks.launch).toHaveBeenCalledOnce());
      const onUrl = mocks.appListener.mock.calls[0][1] as (event: { url: string }) => void;
      onUrl({ url });
      expect(navigate).not.toHaveBeenCalled();
      resolveLaunch({ url: 'vn.quangtu.tutam:///phap-thoai' });
      await vi.waitFor(() => expect(navigate).toHaveBeenCalledExactlyOnceWith('/phap-thoai'));
    } finally { stop(); }
  });

  it('cleans listeners which resolve after disposal and ignores late launch results', async () => {
    let resolveListener!: (value: { remove: () => Promise<void> }) => void;
    mocks.appListener.mockImplementation(() => new Promise(resolve => { resolveListener = resolve; }));
    const remove = vi.fn(async () => {});
    const navigate = vi.fn();
    const stop = startNativeAppLinks(navigate);
    await vi.waitFor(() => expect(mocks.appListener).toHaveBeenCalledOnce());
    stop();
    resolveListener({ remove });
    await vi.waitFor(() => expect(remove).toHaveBeenCalledOnce());
    expect(navigate).not.toHaveBeenCalled();
    expect(mocks.launch).not.toHaveBeenCalled();
  });

  it('rejects unsafe notification targets without falling back to an unrelated route', async () => {
    const navigate = vi.fn(async () => {});
    const stop = startNativeAppLinks(navigate);
    await vi.waitFor(() => expect(mocks.notificationListener).toHaveBeenCalledOnce());
    const handler = mocks.notificationListener.mock.calls[0][0] as (event: { notification: unknown }) => void;
    handler({ notification: { extra: { target: 'https://evil.example/' } } });
    expect(navigate).not.toHaveBeenCalled();
    handler({ notification: {} });
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/tu-tap'));
    stop();
  });

  it('only navigates the latest target after an asynchronous native timer refresh', async () => {
    const pending: (() => void)[] = [];
    const prepare = vi.fn(() => new Promise<void>(resolve => pending.push(resolve)));
    const navigate = vi.fn(async () => {});
    const stop = startNativeAppLinks(navigate, prepare);
    await vi.waitFor(() => expect(mocks.appListener).toHaveBeenCalledOnce());
    const onUrl = mocks.appListener.mock.calls[0][1] as (event: { url: string }) => void;
    onUrl({ url: 'vn.quangtu.tutam://old-target' });
    onUrl({ url: 'vn.quangtu.tutam://new-target' });
    pending[1]();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledWith('/new-target'));
    pending[0]();
    await Promise.resolve();
    expect(navigate).toHaveBeenCalledOnce();
    stop();
  });

  it('keeps the latest A→B→A intent instead of discarding it as an old duplicate', async () => {
    let release!: () => void;
    const ready = new Promise<void>(resolve => { release = resolve; });
    const navigate = vi.fn(async () => {});
    const stop = startNativeAppLinks(navigate, () => ready);
    await vi.waitFor(() => expect(mocks.appListener).toHaveBeenCalledOnce());
    const onUrl = mocks.appListener.mock.calls[0][1] as (event: { url: string }) => void;
    for (const path of ['first', 'second', 'first']) onUrl({ url: `vn.quangtu.tutam://${path}` });
    release();
    await vi.waitFor(() => expect(navigate).toHaveBeenCalledOnce());
    expect(navigate).toHaveBeenCalledWith('/first');
    stop();
  });
});
