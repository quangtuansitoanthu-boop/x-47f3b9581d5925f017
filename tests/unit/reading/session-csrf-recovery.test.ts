import { beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ snapshot: vi.fn(), refresh: vi.fn() }));
vi.mock('$lib/stores/session.svelte', () => ({ getBrowserSessionSnapshot: mocks.snapshot, refreshBrowserSession: mocks.refresh, isSessionExpired: () => false }));
vi.mock('$lib/browser/offline-bundled-resolver', () => ({ resolveOfflineBundledResponse: vi.fn() }));
import { requireBrowserCsrf } from '$lib/browser/session-csrf';
beforeEach(() => vi.resetAllMocks());
describe('recovering CSRF for cached native sessions', () => {
  it.each([null, 'mobile-session-token'])('refreshes an unusable cached token %s before a mutation', async (csrfToken) => {
    mocks.snapshot.mockReturnValue({ authenticated: true, csrfToken });
    mocks.refresh.mockResolvedValue({ authenticated: true, csrfToken: 'server-token' });
    await expect(requireBrowserCsrf()).resolves.toBe('server-token');
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
  it('does not send a synthetic token when refresh cannot recover the server session', async () => {
    mocks.snapshot.mockReturnValue({ authenticated: true, csrfToken: 'mobile-session-token' });
    mocks.refresh.mockResolvedValue({ authenticated: true, csrfToken: null });
    await expect(requireBrowserCsrf()).rejects.toThrow('Vui lòng thử lại');
  });
});
