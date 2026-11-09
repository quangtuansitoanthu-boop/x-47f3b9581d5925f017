import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ native: vi.fn(), web: vi.fn(), refresh: vi.fn() }));
vi.mock('../../../src/lib/browser/native-api', () => ({ fetchNativeJsonMutation: mocks.native }));
vi.mock('../../../src/lib/browser/session-csrf', () => ({ fetchWithSessionRefresh: mocks.web }));
vi.mock('$lib/stores/session.svelte', () => ({ refreshBrowserSession: mocks.refresh }));
import { sendCopyingSnapshot } from '../../../src/lib/browser/scripture-copying-api';
const payload = { runId: 'run', sutraId: 'dia-tang', chapter: 1, sourceVersion: 'v1', texts: ['Nam mô'], revision: 0, mutationId: 'mutation' };
const auth = { userId: 'a', csrfToken: 'csrf' };
const ack = { revision: 1, savedAt: '2026-10-23T00:00:00Z' };
beforeEach(() => { vi.resetAllMocks(); mocks.native.mockResolvedValue(null); mocks.web.mockResolvedValue(Response.json(ack)); mocks.refresh.mockResolvedValue(undefined); });
afterEach(() => vi.restoreAllMocks());
describe('explicit copying mutation transport', () => {
  it('uses the existing native JSON transport once, keeps CSRF and skips web fallback', async () => {
    mocks.native.mockResolvedValue(Response.json(ack));
    expect(await sendCopyingSnapshot(payload, auth, new AbortController().signal)).toEqual(ack);
    expect(mocks.native).toHaveBeenCalledWith('/api/practice/copying', expect.objectContaining({ method: 'PUT', headers: expect.objectContaining({ 'x-csrf-token': 'csrf' }), body: JSON.stringify(payload) }));
    expect(mocks.web).not.toHaveBeenCalled();
  });
  it('uses one web mutation with cookies when native transport is inapplicable', async () => {
    await sendCopyingSnapshot(payload, auth, new AbortController().signal);
    expect(mocks.web).toHaveBeenCalledTimes(1);
    expect(mocks.web).toHaveBeenCalledWith('/api/practice/copying', expect.objectContaining({ credentials: 'include', method: 'PUT' }));
  });
  it('does not replay a native write or use web fallback on network failure, 401 or 5xx', async () => {
    mocks.native.mockRejectedValueOnce(new Error('timeout'));
    await expect(sendCopyingSnapshot(payload, auth, new AbortController().signal)).rejects.toThrow('timeout');
    for (const status of [401, 500]) {
      mocks.native.mockResolvedValueOnce(Response.json({ error: { message: 'Không thể lưu' } }, { status }));
      await expect(sendCopyingSnapshot(payload, auth, new AbortController().signal)).rejects.toThrow('Không thể lưu');
    }
    expect(mocks.native).toHaveBeenCalledTimes(3);
    expect(mocks.web).not.toHaveBeenCalled(); expect(mocks.refresh).toHaveBeenCalledTimes(1);
  });
  it('never starts a canceled mutation', async () => {
    const controller = new AbortController(); controller.abort();
    await expect(sendCopyingSnapshot(payload, auth, controller.signal)).rejects.toThrow('principal_changed');
    expect(mocks.native).not.toHaveBeenCalled(); expect(mocks.web).not.toHaveBeenCalled();
  });
});
