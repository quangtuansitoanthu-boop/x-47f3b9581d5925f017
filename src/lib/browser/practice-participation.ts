import { CLIENT_PARTICIPATION_MODULES, PARTICIPATION_EVENTS, type ParticipationItem, type ParticipationModule, type ParticipationEvent } from '$lib/contracts/practice-participation';
import type { PageSessionDTO } from '$lib/server/auth/types';
import type { StorageLike } from './storage-contract';
import { createPrincipalStorage } from './principal-storage';
import { fetchWithSessionRefresh } from './session-csrf';
import { SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';
export const PARTICIPATION_QUEUE_KEY = 'tt_participation_pending_v1';
let recorder: ((module: ParticipationModule, event: ParticipationEvent, expectedOwner?: string | null) => void) | null = null;

/** Chỉ metadata của thao tác mới; không đọc nội dung hay hồi tố state cục bộ dùng chung. */
export function recordPracticeParticipation(module: ParticipationModule, event: ParticipationEvent, expectedOwner?: string | null): void {
  recorder?.(module, event, expectedOwner);
}
export function createParticipationSync(options: {
  storage: StorageLike; getSession: () => PageSessionDTO;
  fetcher: (url: string, init: RequestInit) => Promise<Response>;
}) {
  let principal = owner(); let generation = 0; let disposed = false; let unavailable = false;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let controller: AbortController | null = null;
  let running: Promise<void> | null = null;
  function owner() { const session = options.getSession(); return session.authenticated ? session.user?.id ?? null : null; }
  const scoped = (id: string) => createPrincipalStorage(options.storage, id);
  function read(id: string): ParticipationItem[] {
    const raw = scoped(id).getItem(PARTICIPATION_QUEUE_KEY);
    if (!raw) return [];
    const items: unknown = JSON.parse(raw);
    if (!Array.isArray(items) || items.length > 15 || !items.every(item => item && typeof item === 'object'
      && CLIENT_PARTICIPATION_MODULES.includes(item.module) && PARTICIPATION_EVENTS.includes(item.event)
      && typeof item.at === 'string' && Number.isFinite(Date.parse(item.at))
      && Object.keys(item).every(key => ['module','event','at'].includes(key)))) throw new Error('invalid_participation_queue');
    return items;
  }
  function write(id: string, items: ParticipationItem[]) { scoped(id).setItem(PARTICIPATION_QUEUE_KEY, JSON.stringify(items)); }
  function sessionChanged() {
    const next = owner();
    if (next === principal) return;
    generation++; controller?.abort(); running = null; unavailable = false;
    if (timer) clearTimeout(timer); timer = null;
    if (principal) { try { scoped(principal).removeItem?.(PARTICIPATION_QUEUE_KEY); } catch { /* Chỉ hủy hàng đợi metadata mới, không đụng dữ liệu gốc. */ } }
    principal = next;
  }
  function schedule() {
    if (disposed || unavailable || !principal || timer) return;
    timer = setTimeout(() => { timer = null; void flush(); }, 750);
  }
  function record(module: ParticipationModule, event: ParticipationEvent, expectedOwner?: string | null) {
    if (disposed) return;
    sessionChanged();
    if (!principal || (expectedOwner !== undefined && expectedOwner !== principal) || !CLIENT_PARTICIPATION_MODULES.includes(module)) return;
    try {
      const items = read(principal).filter(item => item.module !== module);
      items.push({ module, event, at: new Date().toISOString() }); write(principal,items); schedule();
    } catch { /* Lỗi metadata không được biến thao tác lưu riêng thành thất bại. */ }
  }
  function flush(): Promise<void> {
    if (disposed) return Promise.resolve();
    sessionChanged();
    if (running) return running;
    const session = options.getSession();
    if (!principal || unavailable || !session.csrfToken || (typeof navigator !== 'undefined' && !navigator.onLine)
      || (typeof document !== 'undefined' && document.hidden)) return Promise.resolve();
    const id = principal, epoch = generation;
    let items: ParticipationItem[];
    try { items = read(id); } catch { return Promise.resolve(); }
    if (!items.length) return Promise.resolve();
    const abort = new AbortController(); controller = abort;
    const current = () => !disposed && epoch === generation && id === owner();
    const task = (async () => {
      let success = false;
      try {
        const response = await options.fetcher('/api/practice/participation', { method:'POST', credentials:'include', signal:abort.signal,
          headers:{'content-type':'application/json','x-csrf-token':session.csrfToken!}, body:JSON.stringify({ownerId:id,items}) });
        if (!current()) return;
        if ([400,401,403,404,503].includes(response.status) || /text\/html/iu.test(response.headers.get('content-type') || '')) unavailable = true;
        if (!response.ok || unavailable) return;
        const acknowledgement: unknown = await response.json();
        if (!current() || !acknowledgement || typeof acknowledgement !== 'object' || (acknowledgement as {recorded?: unknown}).recorded !== items.length) return;
        write(id,read(id).filter(item => !items.some(sent => item.module===sent.module && item.at===sent.at && item.event===sent.event)));
        success = true;
      } catch { /* Pending metadata remains scoped to this account until the next action/resume. */ }
      finally {
        if (current()) {
          running = null; if (controller === abort) controller = null;
          if (success) { try { if (read(id).length) schedule(); } catch { /* Giữ hàng đợi lỗi để không ghi đè. */ } }
        }
      }
    })();
    running = task; return task;
  }
  function resume() { sessionChanged(); unavailable = false; void flush(); }
  function dispose() { disposed = true; generation++; if(timer) clearTimeout(timer); controller?.abort(); }
  return { record, flush, resume, sessionChanged, dispose };
}
/** Root đăng ký một owner, không polling và không tải dữ liệu riêng khi mở công cụ. */
export function startParticipationSync(storage: StorageLike, getSession: () => PageSessionDTO): () => void {
  const client = createParticipationSync({storage,getSession,fetcher:fetchWithSessionRefresh});
  recorder = client.record;
  const resume = () => { if (!document.hidden) client.resume(); };
  window.addEventListener(SESSION_CHANGE_EVENT,client.sessionChanged);
  window.addEventListener('online',resume); document.addEventListener('visibilitychange',resume);
  void client.flush();
  return () => {
    if (recorder === client.record) recorder = null;
    client.dispose(); window.removeEventListener(SESSION_CHANGE_EVENT,client.sessionChanged);
    window.removeEventListener('online',resume); document.removeEventListener('visibilitychange',resume);
  };
}
