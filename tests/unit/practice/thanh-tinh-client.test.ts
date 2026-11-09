import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  fetchCommunityThanhTinhStats,
  submitThanhTinhPledge,
  syncDailyThanhTinhProgress
} from '../../../src/lib/browser/thanh-tinh-client';
import { FALLBACK_COMMUNITY_STATS } from '../../../src/lib/domain/practice/thanh-tinh';
import { fetchNativeJsonMutation } from '$lib/browser/native-api';

vi.mock('$lib/browser/native-api', async (importOriginal) => ({
  ...await importOriginal<typeof import('$lib/browser/native-api')>(),
  fetchNativeJsonMutation: vi.fn().mockResolvedValue(null),
}));

const { mockGetBrowserSession, mockRequireBrowserCsrf } = vi.hoisted(() => ({
  mockGetBrowserSession: vi.fn(),
  mockRequireBrowserCsrf: vi.fn(),
}));

vi.mock('$lib/browser/session-csrf', () => ({
  getBrowserSession: mockGetBrowserSession,
  requireBrowserCsrf: mockRequireBrowserCsrf,
  hasUsableBrowserCsrf: (token: unknown) => typeof token === 'string' && token.length > 0 && token !== 'mobile-session-token',
}));

describe('thanh-tinh browser client', () => {
  const originalFetch = globalThis.fetch;
  const store = new Map<string, string>();
  const mockStorage = {
    getItem: (key: string) => store.get(key) ?? null,
    setItem: (key: string, value: string) => { store.set(key, String(value)); },
    removeItem: (key: string) => { store.delete(key); },
    clear: () => { store.clear(); }
  };

  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(fetchNativeJsonMutation).mockResolvedValue(null);
    store.clear();
    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: mockStorage
    });
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it.each(['pledge', 'sync'] as const)('uses native origin-aware transport for %s without duplicate fetch', async (operation) => {
    mockGetBrowserSession.mockResolvedValue({ authenticated: true, csrfToken: 'member-csrf' });
    vi.mocked(fetchNativeJsonMutation).mockResolvedValue(new Response(JSON.stringify(FALLBACK_COMMUNITY_STATS)));
    globalThis.fetch = vi.fn().mockRejectedValue(new Error('must not fall back'));
    if (operation === 'pledge') await submitThanhTinhPledge();
    else await syncDailyThanhTinhProgress(3, 1);
    expect(fetchNativeJsonMutation).toHaveBeenCalledWith(`/api/thanh-tinh/${operation}`, expect.objectContaining({
      method: 'POST', headers: expect.objectContaining({ 'x-csrf-token': 'member-csrf' }),
    }));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('does not replay a failed native mutation through web fetch', async () => {
    mockGetBrowserSession.mockResolvedValue({ authenticated: false });
    vi.mocked(fetchNativeJsonMutation).mockRejectedValue(new Error('native timeout'));
    globalThis.fetch = vi.fn();
    await syncDailyThanhTinhProgress(3, 1);
    expect(fetchNativeJsonMutation).toHaveBeenCalledTimes(1);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it.each(['pledge', 'sync'] as const)('does not downgrade a remembered member to public csrf for %s', async (operation) => {
    mockGetBrowserSession.mockResolvedValue({ authenticated: true, csrfToken: null });
    mockRequireBrowserCsrf.mockRejectedValue(new Error('Connection unavailable'));
    globalThis.fetch = vi.fn();
    if (operation === 'pledge') await submitThanhTinhPledge();
    else await syncDailyThanhTinhProgress(3, 1);
    expect(mockRequireBrowserCsrf).toHaveBeenCalledTimes(1);
    expect(fetchNativeJsonMutation).not.toHaveBeenCalled();
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('uses the verified memory credential when a remembered member submits a pledge', async () => {
    mockGetBrowserSession.mockResolvedValue({ authenticated: true, csrfToken: null });
    mockRequireBrowserCsrf.mockResolvedValue('verified-member-csrf');
    vi.mocked(fetchNativeJsonMutation).mockResolvedValue(new Response(JSON.stringify(FALLBACK_COMMUNITY_STATS)));
    await submitThanhTinhPledge();
    expect(fetchNativeJsonMutation).toHaveBeenCalledWith('/api/thanh-tinh/pledge', expect.objectContaining({
      headers: expect.objectContaining({ 'x-csrf-token': 'verified-member-csrf' }),
    }));
  });

  it('fetches community stats correctly and falls back on error', async () => {
    const mockStats = { participantCount: 2000, totalUrgesResisted: 10000, totalDaysClean: 50000 };
    globalThis.fetch = vi.fn().mockResolvedValueOnce(
      new Response(JSON.stringify(mockStats), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const stats = await fetchCommunityThanhTinhStats(true);
    expect(stats.participantCount).toBe(2000);
    expect(globalThis.fetch).toHaveBeenCalled();

    // Fallback on network failure when cache is empty
    store.clear();
    globalThis.fetch = vi.fn().mockRejectedValueOnce(new Error('Network error'));
    const fallback = await fetchCommunityThanhTinhStats(true);
    expect(fallback).toEqual(FALLBACK_COMMUNITY_STATS);
  });

  it('submits pledge with public csrf token for guest', async () => {
    mockGetBrowserSession.mockResolvedValueOnce({ authenticated: false, csrfToken: null });
    const mockStats = { participantCount: 1500, totalUrgesResisted: 9000, totalDaysClean: 35000 };
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn().mockImplementationOnce(async (url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify(mockStats), { status: 200, headers: { 'Content-Type': 'application/json' } });
    });

    const res = await submitThanhTinhPledge({ displayName: 'Huệ Tâm' });
    expect(res.participantCount).toBe(1500);
    expect(capturedHeaders['x-csrf-token']).toBe('public');
    expect(capturedHeaders['Content-Type']).toBe('application/json');
  });

  it('submits pledge with user csrf token for authenticated member', async () => {
    mockGetBrowserSession.mockResolvedValueOnce({ authenticated: true, csrfToken: 'user-secret-csrf' });
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn().mockImplementationOnce(async (url, init) => {
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify(FALLBACK_COMMUNITY_STATS), { status: 200 });
    });

    await submitThanhTinhPledge();
    expect(capturedHeaders['x-csrf-token']).toBe('user-secret-csrf');
  });

  it('syncs daily progress with correct payload and csrf header', async () => {
    mockGetBrowserSession.mockResolvedValueOnce({ authenticated: true, csrfToken: 'member-csrf' });
    let capturedBody = '';
    let capturedHeaders: Record<string, string> = {};

    globalThis.fetch = vi.fn().mockImplementationOnce(async (url, init) => {
      capturedBody = String(init?.body || '');
      capturedHeaders = init?.headers as Record<string, string>;
      return new Response(JSON.stringify({ ...FALLBACK_COMMUNITY_STATS, totalDaysClean: 33451 }), { status: 200 });
    });

    const result = await syncDailyThanhTinhProgress(14, 3);
    expect(result.totalDaysClean).toBe(33451);
    expect(capturedHeaders['x-csrf-token']).toBe('member-csrf');
    const parsed = JSON.parse(capturedBody);
    expect(parsed.streakDays).toBe(14);
    expect(parsed.resistedDelta).toBe(3);
    expect(typeof parsed.clientId).toBe('string');
  });

  it('uses 2-day client cache to minimize server requests', async () => {
    // First call fetches from server and caches
    const mockStats = { participantCount: 1600, totalUrgesResisted: 9500, totalDaysClean: 36000 };
    globalThis.fetch = vi.fn().mockResolvedValue(
      new Response(JSON.stringify(mockStats), { status: 200, headers: { 'Content-Type': 'application/json' } })
    );

    const stats1 = await fetchCommunityThanhTinhStats(true);
    expect(stats1.participantCount).toBe(1600);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);

    // Second call without forceRefresh uses cache, ZERO fetch calls made!
    const stats2 = await fetchCommunityThanhTinhStats(false);
    expect(stats2.participantCount).toBe(1600);
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });
});
