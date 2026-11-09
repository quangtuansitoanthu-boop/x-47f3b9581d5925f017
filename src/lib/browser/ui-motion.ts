import { writable } from 'svelte/store';

export const UI_MOTION_STORAGE_KEY = 'tutam_ui_motion';
export interface UiMotionState { enabled: boolean; reduced: boolean; effective: boolean }
const state = writable<UiMotionState>({ enabled: true, reduced: false, effective: true });
export const uiMotion = { subscribe: state.subscribe };
let current: UiMotionState = { enabled: true, reduced: false, effective: true };
let activeHost: Window | null = null;
let cleanupCurrent: (() => void) | null = null;

function apply(enabled: boolean, reduced: boolean): void {
  current = { enabled, reduced, effective: enabled && !reduced };
  if (activeHost) activeHost.document.documentElement.dataset.uiMotion = current.effective ? 'on' : 'off';
  state.set(current);
}

/** Root-owned initialization. No session, network, native sensor or playback state. */
export function initializeUiMotion(host: Window = window): () => void {
  cleanupCurrent?.();
  activeHost = host;
  const media = host.matchMedia?.('(prefers-reduced-motion: reduce)');
  let enabled = true;
  try { enabled = host.localStorage.getItem(UI_MOTION_STORAGE_KEY) !== '0'; } catch { /* In-memory preference still works. */ }
  apply(enabled, media?.matches ?? false);
  const systemChanged = () => apply(current.enabled, media?.matches ?? false);
  const storageChanged = (event: StorageEvent) => {
    if (event.key === UI_MOTION_STORAGE_KEY || event.key === null) apply(event.newValue !== '0', media?.matches ?? false);
  };
  media?.addEventListener?.('change', systemChanged);
  host.addEventListener('storage', storageChanged);
  const cleanup = () => {
    media?.removeEventListener?.('change', systemChanged);
    host.removeEventListener('storage', storageChanged);
    if (cleanupCurrent === cleanup) {
      activeHost = null;
      cleanupCurrent = null;
    }
  };
  cleanupCurrent = cleanup;
  return cleanup;
}

export function setUiMotion(enabled: boolean): void {
  apply(enabled, current.reduced);
  try { activeHost?.localStorage.setItem(UI_MOTION_STORAGE_KEY, enabled ? '1' : '0'); } catch { /* Keep the live setting when storage is unavailable. */ }
}

export function uiMotionEnabled(): boolean {
  if (typeof window === 'undefined') return true;
  return current.enabled && !window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

export function uiScrollBehavior(): ScrollBehavior { return uiMotionEnabled() ? 'smooth' : 'auto'; }
