/** iOS 15.0–15.3 chưa có AbortSignal.throwIfAborted(). */
export function throwIfAborted(signal?: AbortSignal | null): void {
  if (!signal?.aborted) return;
  throw signal.reason === undefined ? new DOMException('Aborted', 'AbortError') : signal.reason;
}
