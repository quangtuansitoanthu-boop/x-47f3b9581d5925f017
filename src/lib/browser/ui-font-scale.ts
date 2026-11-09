import { writable } from 'svelte/store';

export const UI_FONT_SCALE_STORAGE_KEY = 'tutam_ui_font_scale';
export const UI_FONT_SCALE_MIN = 0.9;
export const UI_FONT_SCALE_MAX = 1.2;
export const UI_FONT_SCALE_STEP = 0.1;
const state = writable(1);
export const uiFontScale = { subscribe: state.subscribe };
let activeHost: Window | null = null;
let cleanupCurrent: (() => void) | null = null;
let current = 1;

export function normalizeUiFontScale(value: unknown): number {
  const numeric = typeof value === 'number' ? value
    : typeof value === 'string' && value.trim() ? Number(value) : NaN;
  if (!Number.isFinite(numeric)) return 1;
  return Math.round(Math.min(UI_FONT_SCALE_MAX, Math.max(UI_FONT_SCALE_MIN, numeric)) * 10) / 10;
}

function apply(value: unknown): number {
  const scale = normalizeUiFontScale(value);
  current = scale;
  activeHost?.document.documentElement.style.setProperty('--ui-font-scale', String(scale));
  state.set(scale);
  return scale;
}

/** Một owner ở root; không đổi cỡ chữ đọc riêng, session hoặc dữ liệu server. */
export function initializeUiFontScale(host: Window = window): () => void {
  cleanupCurrent?.();
  activeHost = host;
  let saved: string | null = null;
  try { saved = host.localStorage.getItem(UI_FONT_SCALE_STORAGE_KEY); } catch { /* Giữ mức mặc định khi storage bị chặn. */ }
  apply(saved);
  const changed = (event: StorageEvent) => {
    if (event.key !== UI_FONT_SCALE_STORAGE_KEY && event.key !== null) return;
    try { if (event.storageArea && event.storageArea !== host.localStorage) return; } catch { return; }
    apply(event.key === null ? null : event.newValue);
  };
  host.addEventListener('storage', changed);
  const cleanup = () => {
    host.removeEventListener('storage', changed);
    if (cleanupCurrent === cleanup) { activeHost = null; cleanupCurrent = null; }
  };
  cleanupCurrent = cleanup;
  return cleanup;
}

export function setUiFontScale(value: number): void {
  const scale = normalizeUiFontScale(value);
  if (scale === current) return;
  apply(scale);
  try { activeHost?.localStorage.setItem(UI_FONT_SCALE_STORAGE_KEY, String(scale)); } catch { /* Vẫn áp dụng trong phiên khi không lưu được. */ }
}
