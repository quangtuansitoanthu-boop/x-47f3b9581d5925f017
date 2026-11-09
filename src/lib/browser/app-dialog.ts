import { tick } from 'svelte';
import { readonly, writable } from 'svelte/store';

export interface AppDialogRequest {
  id: number;
  kind: 'confirm' | 'alert' | 'prompt';
  message: string;
  defaultValue?: string;
}

interface PendingDialog extends AppDialogRequest {
  resolve: (result: boolean | string | null) => void;
}

const state = writable<AppDialogRequest | null>(null);
export const appDialogState = readonly(state);
const queue: PendingDialog[] = [];
let active: PendingDialog | null = null;
let host: symbol | null = null;
let nextId = 0;

function showNext(): void {
  if (!host || active) return;
  active = queue.shift() ?? null;
  state.set(active ? { id: active.id, kind: active.kind, message: active.message, defaultValue: active.defaultValue } : null);
}

function cancelAll(): void {
  const pending = [...(active ? [active] : []), ...queue];
  active = null;
  queue.length = 0;
  state.set(null);
  for (const request of pending) request.resolve(request.kind === 'prompt' ? null : false);
}

export function cancelAppDialogs(): void { cancelAll(); }
export function isAppDialogOpen(): boolean { return active !== null; }

/** Root sở hữu một host; hủy host không được để thao tác chờ xác nhận bị treo. */
export function registerAppDialogHost(): () => void {
  if (host) cancelAll();
  const owner = Symbol();
  host = owner;
  return () => {
    if (host !== owner) return;
    host = null;
    cancelAll();
  };
}

function requestDialog(kind: AppDialogRequest['kind'], message: string, defaultValue?: string): Promise<boolean | string | null> {
  if (!host) return Promise.resolve(kind === 'prompt' ? null : false);
  return new Promise((resolve) => {
    queue.push({ id: ++nextId, kind, message, defaultValue, resolve });
    showNext();
  });
}

export async function confirmInApp(message: string): Promise<boolean> {
  return await requestDialog('confirm', message) === true;
}

export async function alertInApp(message: string): Promise<void> {
  await requestDialog('alert', message);
}

export async function promptInApp(message: string, defaultValue = ''): Promise<string | null> {
  const result = await requestDialog('prompt', message, defaultValue);
  return typeof result === 'string' ? result : null;
}

export function resolveAppDialog(id: number, accepted: boolean | string | null): void {
  if (!active || active.id !== id) return;
  const request = active;
  active = null;
  state.set(null);
  request.resolve(accepted);
  // Đóng lớp trước và trả focus xong rồi mới mở yêu cầu kế tiếp.
  void tick().then(showNext);
}
