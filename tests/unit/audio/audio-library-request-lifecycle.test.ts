import { describe, expect, it, vi } from 'vitest';
import { createAudioLibraryRequestLifecycle } from '$lib/browser/audio-library-request-lifecycle';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((accept, fail) => {
    resolve = accept;
    reject = fail;
  });
  return { promise, reject, resolve };
}

describe('audio library request principal lifecycle', () => {
  it('aborts and ignores a deferred A success after selecting B', async () => {
    const lifecycle = createAudioLibraryRequestLifecycle('user-a');
    const request = lifecycle.begin('user-a');
    const response = deferred<{ owner: string }>();
    const apply = vi.fn();
    const rollback = vi.fn();
    expect(request).not.toBeNull();

    const result = lifecycle.run(request!, () => response.promise, apply, rollback);
    lifecycle.transition('user-b');
    response.resolve({ owner: 'user-a' });

    await expect(result).resolves.toBe('stale');
    expect(request!.controller.signal.aborted).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
  });

  it('ignores a deferred A failure instead of rolling A state into B', async () => {
    const lifecycle = createAudioLibraryRequestLifecycle('user-a');
    const request = lifecycle.begin('user-a');
    const response = deferred<never>();
    const apply = vi.fn();
    const rollback = vi.fn();
    expect(request).not.toBeNull();

    const result = lifecycle.run(request!, () => response.promise, apply, rollback);
    lifecycle.transition('user-b');
    response.reject(new Error('late A failure'));

    await expect(result).resolves.toBe('stale');
    expect(apply).not.toHaveBeenCalled();
    expect(rollback).not.toHaveBeenCalled();
  });

  it('rolls back a current-principal failure exactly once', async () => {
    const lifecycle = createAudioLibraryRequestLifecycle('user-a');
    const request = lifecycle.begin('user-a');
    const rollback = vi.fn();

    await expect(lifecycle.run(
      request!,
      async () => { throw new Error('sync failed'); },
      vi.fn(),
      rollback,
    )).resolves.toBe('rolled_back');
    expect(rollback).toHaveBeenCalledOnce();
  });

  it('serializes complete optimistic mutations so an earlier rollback cannot erase a later success', async () => {
    const lifecycle = createAudioLibraryRequestLifecycle('user-a');
    const firstRequest = deferred<void>();
    let library: string[] = [];
    const first = lifecycle.schedule(async () => {
      const previous = [...library];
      library = ['favorite-a', ...library];
      await firstRequest.promise;
      library = previous;
    });
    const second = lifecycle.schedule(async () => {
      library = ['favorite-b', ...library];
    });

    await Promise.resolve();
    expect(library).toEqual(['favorite-a']);
    firstRequest.resolve();
    await Promise.all([first, second]);

    expect(library).toEqual(['favorite-b']);
  });

  it('does not let account A clear account B busy state for the same collection key', async () => {
    const lifecycle = createAudioLibraryRequestLifecycle('user-a');
    const accountAResponse = deferred<void>();
    const accountBResponse = deferred<void>();
    const key = 'favorite:album-1';
    let busyKeys: string[] = [];

    const runMutation = async (response: Promise<void>) => {
      const busyGeneration = lifecycle.captureGeneration();
      busyKeys = [...busyKeys, key];
      try {
        await lifecycle.schedule(() => response);
      } finally {
        if (lifecycle.isGenerationCurrent(busyGeneration)) {
          busyKeys = busyKeys.filter((value) => value !== key);
        }
      }
    };

    const accountAMutation = runMutation(accountAResponse.promise);
    await Promise.resolve();
    lifecycle.transition('user-b');
    busyKeys = [];
    const accountBMutation = runMutation(accountBResponse.promise);

    accountAResponse.resolve();
    await accountAMutation;
    expect(busyKeys).toEqual([key]);

    accountBResponse.resolve();
    await accountBMutation;
    expect(busyKeys).toEqual([]);
  });

  it('aborts pending work and rejects new work after teardown', async () => {
    const lifecycle = createAudioLibraryRequestLifecycle('user-a');
    const request = lifecycle.begin('user-a');
    const response = deferred<{ owner: string }>();
    const apply = vi.fn();
    expect(request).not.toBeNull();

    const result = lifecycle.run(request!, () => response.promise, apply, vi.fn());
    lifecycle.destroy();
    response.resolve({ owner: 'user-a' });

    await expect(result).resolves.toBe('stale');
    expect(request!.controller.signal.aborted).toBe(true);
    expect(apply).not.toHaveBeenCalled();
    expect(lifecycle.begin('user-a')).toBeNull();
    expect(lifecycle.transition('user-b')).toBe(false);
  });
});
