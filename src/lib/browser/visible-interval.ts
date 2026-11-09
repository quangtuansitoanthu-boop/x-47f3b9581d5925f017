export const ADMIN_REFRESH_INTERVAL_MS = 5 * 60_000;

/**
 * Runs `task` every `intervalMs` only while the tab is visible. A hidden tab
 * stays idle; when it becomes visible again an overdue refresh runs at once.
 * Returns a stop function.
 */
export function startVisibleInterval(task: () => void, intervalMs: number, now: () => number = Date.now): () => void {
  let lastRunAt = now();
  let timer: ReturnType<typeof setInterval> | null = null;
  const run = () => {
    lastRunAt = now();
    task();
  };
  const start = () => {
    if (timer === null) timer = setInterval(run, intervalMs);
  };
  const stop = () => {
    if (timer !== null) clearInterval(timer);
    timer = null;
  };
  const onVisibilityChange = () => {
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') {
      stop();
      return;
    }
    if (now() - lastRunAt >= intervalMs) run();
    start();
  };
  if (typeof document !== 'undefined' && document.visibilityState !== 'hidden') start();
  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', onVisibilityChange);
  }
  return () => {
    stop();
    if (typeof document !== 'undefined') {
      document.removeEventListener('visibilitychange', onVisibilityChange);
    }
  };
}
