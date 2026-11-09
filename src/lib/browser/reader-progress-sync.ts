/** Local progress stays frequent; server synchronization is coalesced until close or 30s. */
export function createReaderProgressSync(delayMs = 30_000) {
  let timer: ReturnType<typeof setTimeout> | null = null;
  let latest: (() => void) | null = null;
  function cancel() {
    if (timer !== null) clearTimeout(timer);
    timer = null; latest = null;
  }
  function flush() {
    const task = latest;
    cancel();
    task?.();
  }
  return {
    schedule(task: () => void) {
      latest = task;
      if (timer === null) timer = setTimeout(flush, delayMs);
    },
    flush,
    cancel,
  };
}
