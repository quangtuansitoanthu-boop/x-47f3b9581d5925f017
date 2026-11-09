import { afterEach, expect, it, vi } from 'vitest';
vi.mock('$app/environment', () => ({ dev: false, version: 'test' }));
vi.mock('../../src/lib/browser/native-platform', () => ({ isNativeApp: () => true }));
import { registerPwa } from '../../src/lib/browser/pwa-registration';
import { OFFLINE_ILLUSTRATION_CACHE } from '../../src/lib/contracts/book-illustrations';
afterEach(() => vi.unstubAllGlobals());

it('keeps complete packages and offline images when native startup removes service workers', async () => {
  const remove = vi.fn(async () => true);
  const unregister = vi.fn(async () => true);
  vi.stubGlobal('navigator', { serviceWorker: { getRegistrations: async () => [{ unregister }] } });
  vi.stubGlobal('caches', { keys: async () => ['tutam-content-packages-v1', 'tutam-public-covers-v1', OFFLINE_ILLUSTRATION_CACHE, 'stale-shell'], delete: remove });
  expect(await registerPwa()).toBeNull();
  expect(unregister).toHaveBeenCalledOnce();
  expect(remove.mock.calls.map(([name]) => name)).toEqual(['stale-shell']);
});
