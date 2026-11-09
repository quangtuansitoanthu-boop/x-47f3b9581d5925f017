import { isNativeApp } from './native-platform';

let active = false;
let revision = 0;
const settledCallbacks = new Set<() => void>();

/** Giữ cookie và phiên local trong cùng một thao tác, kể cả sau khi HTTP đã trả về. */
export function beginNativeAuthMutation(): (() => void) | null {
  if (!isNativeApp()) return () => {};
  if (active) return null;
  active = true;
  revision++;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    active = false;
    const callbacks = [...settledCallbacks];
    settledCallbacks.clear();
    for (const callback of callbacks) queueMicrotask(callback);
  };
}

export function isNativeAuthMutationActive(): boolean { return isNativeApp() && active; }
export function nativeAuthMutationRevision(): number { return isNativeApp() ? revision : 0; }

export function afterNativeAuthMutation(callback: () => void): void {
  if (isNativeAuthMutationActive()) settledCallbacks.add(callback);
  else queueMicrotask(callback);
}
