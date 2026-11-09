import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({ native: true, request: vi.fn(), web: vi.fn(), refresh: vi.fn() }));
vi.mock('@capacitor/core', () => ({
  Capacitor: { isNativePlatform: () => mocks.native },
  CapacitorHttp: { request: mocks.request },
}));
vi.mock('$lib/browser/session-csrf', () => ({ fetchWithSessionRefresh: mocks.web }));
vi.mock('$lib/stores/session.svelte', () => ({ refreshBrowserSession: mocks.refresh }));
import { authorizeDownload } from '$lib/browser/audio-downloads';

beforeEach(() => {
  mocks.native = true;
  mocks.refresh.mockReset().mockResolvedValue({ authenticated: false });
  mocks.request.mockReset().mockResolvedValue({ status: 200, data: { allowed: true }, headers: { 'content-type': 'application/json' } });
  mocks.web.mockReset().mockResolvedValue(Response.json({ error: { code: 'invalid_origin' } }, { status: 403 }));
  vi.stubGlobal('window', { location: { origin: 'https://localhost' } });
  vi.stubGlobal('localStorage', { getItem: () => 'https://quangtu.vn' });
});
afterEach(() => vi.unstubAllGlobals());

it('authorizes native audio downloads with one raw JSON request retaining Origin and CSRF', async () => {
  await expect(authorizeDownload('test-csrf')).resolves.toBeUndefined();
  expect(mocks.request).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
    url: 'https://quangtu.vn/api/downloads/access', method: 'POST', data: {},
    headers: expect.objectContaining({ origin: 'https://quangtu.vn', 'x-csrf-token': 'test-csrf' }),
  }));
  expect(mocks.web).not.toHaveBeenCalled();
  expect(mocks.refresh).not.toHaveBeenCalled();
});

it('keeps web and caller-injected transport ownership unchanged', async () => {
  mocks.native = false;
  mocks.web.mockResolvedValue(Response.json({ allowed: true }));
  await authorizeDownload('web-csrf');
  expect(mocks.web).toHaveBeenCalledOnce();
  const injected = vi.fn().mockResolvedValue(Response.json({ allowed: true }));
  mocks.native = true;
  await authorizeDownload('injected-csrf', injected);
  expect(injected).toHaveBeenCalledOnce();
  expect(mocks.request).not.toHaveBeenCalled();
});

it('preserves native authorization failures without retrying a write', async () => {
  mocks.request.mockResolvedValue({ status: 401, data: {}, headers: {} });
  await expect(authorizeDownload('expired-csrf')).rejects.toThrow('authentication_required');
  expect(mocks.request).toHaveBeenCalledOnce();
  expect(mocks.web).not.toHaveBeenCalled();
  expect(mocks.refresh).toHaveBeenCalledOnce();
});
