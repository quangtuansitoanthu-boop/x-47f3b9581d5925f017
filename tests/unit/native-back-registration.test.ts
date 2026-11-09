import { afterEach, beforeEach, expect, it, vi } from 'vitest';

const app = vi.hoisted(() => ({ addListener: vi.fn(), exitApp: vi.fn() }));
vi.mock('$app/environment', () => ({ browser: true }));
vi.mock('$lib/browser/native-platform', () => ({ isNativeApp: () => true }));
vi.mock('@capacitor/app', () => ({ App: app }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  app.addListener.mockResolvedValue({ remove: vi.fn() });
  vi.stubGlobal('window', {});
});
afterEach(() => vi.unstubAllGlobals());

it('registers Android Back without relying on a pre-existing global App plugin', async () => {
  const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
  await initializeNativeBackButton();
  expect(app.addListener).toHaveBeenCalledWith('backButton', expect.any(Function));
});

it('coalesces concurrent setup and installs one listener', async () => {
  const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
  await Promise.all([initializeNativeBackButton(), initializeNativeBackButton()]);
  await initializeNativeBackButton();
  expect(app.addListener).toHaveBeenCalledOnce();
});

it('allows retry after registration fails instead of permanently disabling Back', async () => {
  const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  app.addListener.mockRejectedValueOnce(new Error('Bridge not ready'));
  const { initializeNativeBackButton } = await import('$lib/browser/native-back-button');
  await initializeNativeBackButton();
  await initializeNativeBackButton();
  expect(app.addListener).toHaveBeenCalledTimes(2);
  warning.mockRestore();
});
