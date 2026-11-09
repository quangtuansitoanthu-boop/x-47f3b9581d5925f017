import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const native = vi.hoisted(() => ({
  isNative: vi.fn(() => true),
  platform: vi.fn(() => 'android'),
  available: vi.fn(() => true),
  stop: vi.fn(async () => undefined),
  select: vi.fn(async (_options: { principalKey: string }) => undefined),
  syncPrincipal: vi.fn(),
}));

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: native.isNative,
    getPlatform: native.platform,
    isPluginAvailable: native.available,
  },
  registerPlugin: vi.fn(() => ({ stop: native.stop, selectPrincipal: native.select })),
}));
vi.mock('$lib/browser/audio-sync', () => ({ selectAudioSyncPrincipal: native.syncPrincipal }));

const session = (id: string | null, csrfToken = 'csrf') => ({
  authenticated: id !== null,
  csrfToken: id ? csrfToken : null,
  user: id ? { id } : null,
});

describe('native widget audio principal cleanup before player initialization', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
    native.isNative.mockReturnValue(true);
    native.platform.mockReturnValue('android');
    native.available.mockReturnValue(true);
    native.stop.mockResolvedValue(undefined);
    native.select.mockResolvedValue(undefined);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('preserves current playback during first session hydration and same-owner csrf refresh', async () => {
    const { selectAudioPlayerSession } = await import('$lib/stores/audio-player.svelte');
    selectAudioPlayerSession(session('user-a'));
    selectAudioPlayerSession(session('user-a', 'next-csrf'));
    expect(native.stop).not.toHaveBeenCalled();
    expect(native.select).toHaveBeenNthCalledWith(1, { principalKey: '["user-a","user"]' });
    expect(native.select).toHaveBeenNthCalledWith(2, { principalKey: '["user-a","user"]' });
  });

  it('selects a distinct native owner when the same account loses its role', async () => {
    const { selectAudioPlayerSession } = await import('$lib/stores/audio-player.svelte');
    selectAudioPlayerSession({ ...session('user-a'), user: { id: 'user-a', role: 'admin' } });
    selectAudioPlayerSession({ ...session('user-a'), user: { id: 'user-a', role: 'user' } });
    expect(native.select).toHaveBeenNthCalledWith(1, { principalKey: '["user-a","admin"]' });
    expect(native.select).toHaveBeenNthCalledWith(2, { principalKey: '["user-a","user"]' });
    expect(native.stop).toHaveBeenCalledOnce();
  });

  it('selects anonymous explicitly on guest hydration', async () => {
    const { selectAudioPlayerSession } = await import('$lib/stores/audio-player.svelte');
    selectAudioPlayerSession(session(null));
    expect(native.select).toHaveBeenCalledWith({ principalKey: 'anonymous' });
    expect(native.stop).not.toHaveBeenCalled();
  });

  it('waits for the latest native principal selection before recovery may continue', async () => {
    let completeA: () => void = () => undefined;
    let completeB: () => void = () => undefined;
    native.select.mockImplementationOnce(() => new Promise<void>((resolve) => { completeA = resolve; }));
    native.select.mockImplementationOnce(() => new Promise<void>((resolve) => { completeB = resolve; }));
    const { selectAudioPlayerSession } = await import('$lib/stores/audio-player.svelte');
    const { waitForNativeAudioPrincipal } = await import('$lib/browser/native-audio-principal');
    selectAudioPlayerSession(session('user-a'));
    const recovered = vi.fn();
    const recovery = waitForNativeAudioPrincipal().then(recovered);
    selectAudioPlayerSession(session('user-b'));
    completeA();
    await Promise.resolve();
    expect(recovered).not.toHaveBeenCalled();
    completeB();
    await recovery;
    expect(recovered).toHaveBeenCalledOnce();
  });

  it.each([null, 'user-b'])('stops and clears native queue on user-a -> %s without creating a player', async (next) => {
    const createAudio = vi.fn();
    vi.stubGlobal('Audio', createAudio);
    const { selectAudioPlayerSession } = await import('$lib/stores/audio-player.svelte');
    selectAudioPlayerSession(session('user-a'));
    selectAudioPlayerSession(session(next));
    expect(native.stop).toHaveBeenCalledOnce();
    expect(native.syncPrincipal).toHaveBeenLastCalledWith(next);
    expect(createAudio).not.toHaveBeenCalled();
  });

  it('dispatches stop before changing the JS principal, without deferred dynamic import or retry', async () => {
    const calls: string[] = [];
    native.stop.mockImplementation(async () => { calls.push('native-stop'); });
    native.syncPrincipal.mockImplementation((id: string | null) => { calls.push(`select:${id}`); });
    const { selectAudioPlayerSession } = await import('$lib/stores/audio-player.svelte');
    selectAudioPlayerSession(session('user-a'));
    calls.length = 0;
    selectAudioPlayerSession(session('user-b'));
    expect(calls).toEqual(['native-stop', 'select:user-b']);
    await Promise.resolve();
    expect(native.stop).toHaveBeenCalledOnce();
  });

  it.each(['web', 'unavailable'])('does not call native stop for %s', async (kind) => {
    if (kind === 'web') native.isNative.mockReturnValue(false);
    else native.available.mockReturnValue(false);
    const { selectAudioPlayerSession } = await import('$lib/stores/audio-player.svelte');
    selectAudioPlayerSession(session('user-a'));
    selectAudioPlayerSession(session(null));
    expect(native.stop).not.toHaveBeenCalled();
    expect(native.syncPrincipal).toHaveBeenLastCalledWith(null);
  });

  it('does not block logout or retry stale cleanup after a native error', async () => {
    native.stop.mockRejectedValueOnce(new Error('Plugin unavailable'));
    const { selectAudioPlayerSession } = await import('$lib/stores/audio-player.svelte');
    selectAudioPlayerSession(session('user-a'));
    expect(() => selectAudioPlayerSession(session(null))).not.toThrow();
    await Promise.resolve();
    selectAudioPlayerSession(session(null));
    expect(native.stop).toHaveBeenCalledOnce();
    expect(native.syncPrincipal).toHaveBeenLastCalledWith(null);
  });

  it('blocks recovery on real native principal persistence errors', async () => {
    native.select.mockRejectedValueOnce(new Error('Could not persist owner'));
    const { selectAudioPlayerSession } = await import('$lib/stores/audio-player.svelte');
    const { waitForNativeAudioPrincipal } = await import('$lib/browser/native-audio-principal');
    selectAudioPlayerSession(session('user-a'));
    await expect(waitForNativeAudioPrincipal()).rejects.toThrow('Could not persist owner');
  });

  it('allows an old plugin only after fallback stop succeeds', async () => {
    native.select.mockRejectedValueOnce(Object.assign(new Error('Not implemented'), { code: 'UNIMPLEMENTED' }));
    let completeStop: () => void = () => undefined;
    native.stop.mockReturnValueOnce(new Promise<void>((resolve) => { completeStop = resolve; }));
    const { selectAudioPlayerSession } = await import('$lib/stores/audio-player.svelte');
    const { waitForNativeAudioPrincipal } = await import('$lib/browser/native-audio-principal');
    selectAudioPlayerSession(session('user-a'));
    const ready = vi.fn();
    const pending = waitForNativeAudioPrincipal().then(ready);
    await vi.waitFor(() => expect(native.stop).toHaveBeenCalledOnce());
    expect(ready).not.toHaveBeenCalled();
    completeStop();
    await pending;
    expect(ready).toHaveBeenCalledOnce();
  });

  it('does not allow recovery when the legacy fallback stop fails', async () => {
    native.select.mockRejectedValueOnce(Object.assign(new Error('Not implemented'), { code: 'UNIMPLEMENTED' }));
    native.stop.mockRejectedValueOnce(new Error('Could not stop old owner'));
    const { selectAudioPlayerSession } = await import('$lib/stores/audio-player.svelte');
    const { waitForNativeAudioPrincipal } = await import('$lib/browser/native-audio-principal');
    selectAudioPlayerSession(session('user-a'));
    await expect(waitForNativeAudioPrincipal()).rejects.toThrow('Could not stop old owner');
  });

  it('never sends a delayed legacy cleanup after a newer owner has been validated', async () => {
    let rejectOld: (reason: Error & { code: string }) => void = () => undefined;
    native.select.mockReturnValueOnce(new Promise<void>((_resolve, reject) => { rejectOld = reject; }));
    const { selectAudioPlayerSession } = await import('$lib/stores/audio-player.svelte');
    const { waitForNativeAudioPrincipal } = await import('$lib/browser/native-audio-principal');
    selectAudioPlayerSession(session('user-a'));
    selectAudioPlayerSession(session('user-b'));
    await waitForNativeAudioPrincipal();
    expect(native.stop).toHaveBeenCalledOnce();
    rejectOld(Object.assign(new Error('Old method unavailable'), { code: 'UNIMPLEMENTED' }));
    await Promise.resolve();
    await Promise.resolve();
    expect(native.stop).toHaveBeenCalledOnce();
  });

  it('propagates synchronous native bridge errors through the recovery barrier', async () => {
    native.select.mockImplementationOnce(() => { throw new Error('Synchronous bridge failure'); });
    const { selectAudioPlayerSession } = await import('$lib/stores/audio-player.svelte');
    const { waitForNativeAudioPrincipal } = await import('$lib/browser/native-audio-principal');
    expect(() => selectAudioPlayerSession(session('user-a'))).not.toThrow();
    await expect(waitForNativeAudioPrincipal()).rejects.toThrow('Synchronous bridge failure');
    expect(native.stop).not.toHaveBeenCalled();
  });
});
