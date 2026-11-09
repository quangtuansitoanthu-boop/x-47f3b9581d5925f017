import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  fetchWithSessionRefresh: vi.fn(),
  refreshBrowserSession: vi.fn(),
}));

vi.mock('$lib/browser/session-csrf', () => ({
  fetchWithSessionRefresh: mocks.fetchWithSessionRefresh,
}));
vi.mock('$lib/stores/session.svelte', () => ({
  refreshBrowserSession: mocks.refreshBrowserSession,
  SESSION_CHANGE_EVENT: 'quangtu:session-change',
}));

import { setPracticePresence, startPresence } from '$lib/browser/presence';

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    get length() { return values.size; },
    getItem: (key: string) => values.get(key) ?? null,
    key: (index: number) => [...values.keys()][index] ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe('presence principal lifecycle', () => {
  it('skips identical projections but immediately sends an actual opt-out', async () => {
    mocks.fetchWithSessionRefresh.mockImplementation(async () => Response.json({ enabled: true, activeCount: 1 }));
    const stop = startPresence(() => undefined);
    try {
      await vi.waitFor(() => expect(mocks.fetchWithSessionRefresh).toHaveBeenCalledTimes(1));
      setPracticePresence({ activity: 'meditation', startedAt: 123, visible: true });
      await vi.waitFor(() => expect(mocks.fetchWithSessionRefresh).toHaveBeenCalledTimes(2));
      for (let index = 0; index < 20; index++) {
        setPracticePresence({ activity: 'meditation', startedAt: 123, visible: true });
        await Promise.resolve();
      }
      expect(mocks.fetchWithSessionRefresh).toHaveBeenCalledTimes(2);
      setPracticePresence(null);
      await vi.waitFor(() => expect(mocks.fetchWithSessionRefresh).toHaveBeenCalledTimes(3));
      expect(JSON.parse(String(mocks.fetchWithSessionRefresh.mock.calls[2][1].body)).practiceVisible).toBe(false);
    } finally { stop(); }
  });
  afterEach(() => vi.useRealTimers());
  beforeEach(() => {
    mocks.fetchWithSessionRefresh.mockReset();
    mocks.refreshBrowserSession.mockReset();
    setPracticePresence(null);
    const windowTarget = new EventTarget();
    const documentTarget = new EventTarget();
    Object.defineProperty(documentTarget, 'visibilityState', { configurable: true, value: 'visible' });
    Object.defineProperty(documentTarget, 'referrer', { configurable: true, value: '' });
    Object.defineProperty(globalThis, 'window', { configurable: true, value: windowTarget });
    Object.defineProperty(globalThis, 'document', { configurable: true, value: documentTarget });
    Object.defineProperty(globalThis, 'location', {
      configurable: true,
      value: { href: 'https://quangtu.vn/tu-tap', origin: 'https://quangtu.vn', pathname: '/tu-tap' },
    });
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: memoryStorage() });
    Object.defineProperty(globalThis, 'sessionStorage', { configurable: true, value: memoryStorage() });
  });

  it('drops A queued practice data and sends a neutral heartbeat after switching to B', async () => {
    let releaseFirst!: (response: Response) => void;
    const firstResponse = new Promise<Response>((resolve) => { releaseFirst = resolve; });
    mocks.fetchWithSessionRefresh
      .mockImplementationOnce(() => firstResponse)
      .mockImplementation(async () => Response.json({
        enabled: true, activeCount: 1, heartbeatIntervalSeconds: 60,
      }));
    const sessionA = { authenticated: true, csrfToken: 'csrf-a', user: { id: 'user-a' } };
    const sessionB = { authenticated: true, csrfToken: 'csrf-b', user: { id: 'user-b' } };
    const stop = startPresence(() => undefined, sessionA as never);
    setPracticePresence({ activity: 'meditation', startedAt: 123, visible: true });

    window.dispatchEvent(new CustomEvent('quangtu:session-change', { detail: sessionB }));
    releaseFirst(Response.json({ enabled: true, activeCount: 1, heartbeatIntervalSeconds: 60 }));
    await vi.waitFor(() => expect(mocks.fetchWithSessionRefresh).toHaveBeenCalledTimes(2));

    const requests = mocks.fetchWithSessionRefresh.mock.calls.map((call) => ({
      body: JSON.parse(String(call[1]?.body)) as Record<string, unknown>,
      csrf: (call[1]?.headers as Record<string, string>)['x-csrf-token'],
    }));
    expect(requests[0]).toMatchObject({
      body: { practiceActivity: null, practiceStartedAt: null, practiceVisible: false },
      csrf: 'csrf-a',
    });
    expect(requests[1]).toMatchObject({
      body: { practiceActivity: null, practiceStartedAt: null, practiceVisible: false },
      csrf: 'csrf-b',
    });
    expect(requests).not.toContainEqual(expect.objectContaining({
      body: expect.objectContaining({ practiceActivity: 'meditation' }),
      csrf: 'csrf-b',
    }));
    stop();
  });

  it.each([429, 503])('keeps the ten-minute retry delay after HTTP %s', async status => {
    vi.useFakeTimers();
    mocks.fetchWithSessionRefresh.mockImplementation(async () => new Response(null, { status }));
    const stop = startPresence(() => undefined);
    try {
      await vi.advanceTimersByTimeAsync(599_999);
      expect(mocks.fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(mocks.fetchWithSessionRefresh).toHaveBeenCalledTimes(2);
    } finally { stop(); }
  });

  it('honors a longer server polling interval for a visitor who is not practicing', async () => {
    vi.useFakeTimers();
    mocks.fetchWithSessionRefresh.mockImplementation(async () => Response.json({
      enabled: true, activeCount: 1, heartbeatIntervalSeconds: 300,
    }));
    const stop = startPresence(() => undefined);
    try {
      await vi.advanceTimersByTimeAsync(299_999);
      expect(mocks.fetchWithSessionRefresh).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(1);
      expect(mocks.fetchWithSessionRefresh).toHaveBeenCalledTimes(2);
    } finally { stop(); }
  });

  it('does not recreate polling or notify after disposal while a request is pending', async () => {
    vi.useFakeTimers();
    let release!: (response: Response) => void;
    mocks.fetchWithSessionRefresh.mockImplementation(() => new Promise<Response>(resolve => { release = resolve; }));
    const listener = vi.fn();
    const stop = startPresence(listener);
    stop();
    release(Response.json({ enabled: true, activeCount: 1 }));
    await vi.advanceTimersByTimeAsync(0);
    expect(listener).not.toHaveBeenCalled();
    expect(vi.getTimerCount()).toBe(0);
  });
});
