import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWakeLockController } from '../../src/lib/browser/wake-lock';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

function sentinel() {
  const target = new EventTarget();
  return Object.assign(target, {
    released: false,
    type: 'screen' as const,
    onrelease: null,
    release: vi.fn(async () => {
      target.dispatchEvent(new Event('release'));
    })
  });
}

describe('wake lock lifecycle', () => {
  let doc: EventTarget & { visibilityState: string };
  let acquire: ReturnType<typeof vi.fn<() => Promise<WakeLockSentinel>>>;

  beforeEach(() => {
    doc = Object.assign(new EventTarget(), { visibilityState: 'visible' });
    acquire = vi.fn<() => Promise<WakeLockSentinel>>();
    vi.stubGlobal('document', doc);
    vi.stubGlobal('navigator', { wakeLock: { request: acquire } });
  });

  afterEach(() => vi.unstubAllGlobals());

  for (const action of ['release', 'destroy', 'hidden'] as const) {
    it(`releases a late grant after ${action} instead of keeping the screen awake`, async () => {
      const pending = deferred<WakeLockSentinel>();
      acquire.mockReturnValueOnce(pending.promise);
      const controller = createWakeLockController();
      const result = controller.request();

      if (action === 'hidden') {
        doc.visibilityState = 'hidden';
        doc.dispatchEvent(new Event('visibilitychange'));
      } else {
        await controller[action]();
      }
      const grant = sentinel();
      pending.resolve(grant);

      expect(await result).toBe(false);
      expect(grant.release).toHaveBeenCalledTimes(1);
      await controller.destroy();
      expect(grant.release).toHaveBeenCalledTimes(1);
    });
  }

  it('shares concurrent requests and reuses the active grant', async () => {
    const pending = deferred<WakeLockSentinel>();
    acquire.mockReturnValue(pending.promise);
    const controller = createWakeLockController();
    const first = controller.request();
    const second = controller.request();
    expect(acquire).toHaveBeenCalledTimes(1);

    const grant = sentinel();
    pending.resolve(grant);
    expect(await first).toBe(true);
    expect(await second).toBe(true);
    expect(await controller.request()).toBe(true);
    expect(acquire).toHaveBeenCalledTimes(1);
    await controller.release();
    await controller.release();
    expect(grant.release).toHaveBeenCalledTimes(1);
    await controller.destroy();
  });

  it('does not let an obsolete rejection clear a newer active grant', async () => {
    const old = deferred<WakeLockSentinel>();
    const grant = sentinel();
    acquire.mockReturnValueOnce(old.promise).mockResolvedValueOnce(grant);
    const controller = createWakeLockController();
    const first = controller.request();
    await controller.release();
    expect(await controller.request()).toBe(true);

    old.reject(new Error('obsolete request rejected'));
    expect(await first).toBe(false);
    await controller.release();
    expect(grant.release).toHaveBeenCalledTimes(1);
    await controller.destroy();
  });

  it('keeps unsupported environments and repeated cleanup safe', async () => {
    vi.stubGlobal('navigator', {});
    const controller = createWakeLockController();
    expect(await controller.request()).toBe(false);
    await controller.release();
    await controller.destroy();
    await controller.destroy();
    expect(await controller.request()).toBe(false);
    expect(acquire).not.toHaveBeenCalled();
  });
});
