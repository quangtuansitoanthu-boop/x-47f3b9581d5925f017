export interface WakeLockController {
  destroy(): Promise<void>;
  release(): Promise<void>;
  request(): Promise<boolean>;
}

export function createWakeLockController(): WakeLockController {
  let sentinel: WakeLockSentinel | null = null;
  let destroyed = false;
  let generation = 0;
  let pending: Promise<boolean> | null = null;

  async function release(): Promise<void> {
    generation += 1;
    pending = null;
    const current = sentinel;
    sentinel = null;
    if (!current) return;
    try {
      await current.release();
    } catch {
      // Ignore stale or unsupported releases.
    }
  }

  async function request(): Promise<boolean> {
    if (destroyed || typeof navigator === 'undefined' || !('wakeLock' in navigator)) return false;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return false;
    if (sentinel && !sentinel.released) return true;
    if (pending) return pending;
    const requestedGeneration = generation;
    const acquisition = (async () => {
      try {
        const nextSentinel = await navigator.wakeLock.request('screen');
        if (destroyed || generation !== requestedGeneration ||
            (typeof document !== 'undefined' && document.visibilityState === 'hidden')) {
          try { await nextSentinel.release(); } catch { /* Already released by the platform. */ }
          return false;
        }
        sentinel = nextSentinel;
        nextSentinel.addEventListener('release', () => {
          if (sentinel === nextSentinel) sentinel = null;
        });
        return true;
      } catch {
        return false;
      }
    })();
    pending = acquisition;
    try { return await acquisition; }
    finally { if (pending === acquisition) pending = null; }
  }

  function onVisibilityChange(): void {
    if (document.visibilityState === 'hidden') {
      void release();
    }
  }

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }

  return {
    async destroy() {
      destroyed = true;
      if (typeof document !== 'undefined') {
        document.removeEventListener('visibilitychange', onVisibilityChange);
      }
      await release();
    },
    release,
    request
  };
}
