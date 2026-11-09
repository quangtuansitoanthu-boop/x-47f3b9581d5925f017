import { Capacitor, registerPlugin } from '@capacitor/core';
import { getVietnamNow } from '$lib/components/lunar/lunar-week';
import { watchCalendarDay } from './calendar-day-rollover';
import { buildBuddhistCalendarTimeline } from './buddhist-calendar-widget-data';
import { loadPersonalLunarEvents } from './personal-lunar-events';
import { getBrowserSessionSnapshot, SESSION_CHANGE_EVENT } from '$lib/stores/session.svelte';

const plugin = registerPlugin<{
  setPersonalOwner(input: { owner: string }): Promise<void>;
  replaceTimeline(timeline: ReturnType<typeof buildBuddhistCalendarTimeline>): Promise<void>;
}>('BuddhistCalendarWidget');

export function startBuddhistCalendarWidgetSync(getLocale: () => string = () => 'vi'): () => void {
  if (!Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('BuddhistCalendarWidget')) return () => {};
  let disposed = false;
  let running = false;
  let observedOwner: string | undefined;
  let appliedOwner: string | undefined;
  let generation = 0;
  let ownerReady = false;
  let barrierRunning = false;
  let barrier = Promise.resolve(false);
  let appliedSignature = '';
  let writingSignature = '';
  let appliedInput = '';
  let writingInput = '';
  type Timeline = ReturnType<typeof buildBuddhistCalendarTimeline>;
  type Publication = { snapshot: Timeline; signature: string; input: string; generation: number; barrier: Promise<boolean>; cleanup?: boolean };
  let pending: Publication | null = null;

  function ownerKey(): string {
    const session = getBrowserSessionSnapshot();
    if (!session.authenticated) return 'guest';
    const id = session.user?.id;
    const owner = typeof id === 'string' && id.trim() ? `user:${id}` : '';
    return /[\u0000-\u001f\u007f]/u.test(owner) || new TextEncoder().encode(owner).byteLength > 256 ? '' : owner;
  }

  function ensureOwner(owner: string): void {
    if (owner === observedOwner && (barrierRunning || ownerReady)) return;
    observedOwner = owner;
    ownerReady = false;
    barrierRunning = true;
    const token = ++generation;
    // Rào native chạy ngay cả khi bản ghi của tài khoản cũ còn đang trả promise.
    barrier = Promise.resolve().then(() => plugin.setPersonalOwner({ owner })).then(() => {
      if (token !== generation) return false;
      ownerReady = true;
      barrierRunning = false;
      return true;
    }, () => {
      if (token === generation) barrierRunning = false;
      return false;
    });
  }

  function publicOnly(snapshot: Timeline): Timeline {
    return { locale: snapshot.locale, generatedAt: snapshot.generatedAt, days: snapshot.days.map(({ personalEvents: _events, personalEventCount: _count, ...day }) => day) };
  }

  async function drain(): Promise<void> {
    if (running) return;
    running = true;
    try {
      while (pending && (!disposed || pending.cleanup)) {
        const next = pending;
        pending = null;
        writingSignature = next.signature;
        writingInput = next.input;
        try {
          const ready = await next.barrier;
          if (next.generation !== generation || (disposed && !next.cleanup)) continue;
          // Native cũ không có rào owner: chỉ giữ lịch công khai, tuyệt đối không gửi tên cá nhân.
          await plugin.replaceTimeline(ready ? next.snapshot : publicOnly(next.snapshot));
          if (ready && next.generation === generation) {
            appliedSignature = next.signature;
            appliedInput = next.input;
            appliedOwner = observedOwner;
          }
        } catch {
          // Không fetch hay polling khi native lỗi; sự kiện dữ liệu/foreground sau sẽ thử lại.
        } finally { writingSignature = ''; writingInput = ''; }
      }
    } finally { running = false; }
  }

  function refresh(): void {
    if (disposed) return;
    const owner = ownerKey();
    ensureOwner(owner);
    const today = getVietnamNow();
    const locale = getLocale() === 'en' ? 'en' : 'vi';
    let events: ReturnType<typeof loadPersonalLunarEvents> | undefined;
    let source = 'unavailable';
    try {
      events = owner ? loadPersonalLunarEvents(true) : undefined;
      source = JSON.stringify(events ?? null);
    } catch { events = undefined; }
    const input = `${generation}:${locale}:${today.getFullYear()}-${today.getMonth()}-${today.getDate()}:${source}`;
    // Cache hit không dựng lại 400 ngày chỉ vì foreground hoặc owner phát trùng sự kiện.
    if (input === writingInput) { pending = null; return; }
    if (input === pending?.input || (!pending && input === appliedInput)) return;
    let snapshot: Timeline;
    try {
      snapshot = owner && events ? buildBuddhistCalendarTimeline(today, 400, { owner, events }, locale)
        : { ...buildBuddhistCalendarTimeline(today, 400, undefined, locale), personalOwner: owner };
    } catch {
      // Không coi storage hỏng/chưa đọc được là không có sự kiện; chỉ xuất bản phần công khai.
      snapshot = { ...buildBuddhistCalendarTimeline(today, 400, undefined, locale), personalOwner: owner };
    }
    const { generatedAt: _at, ...content } = snapshot;
    const signature = `${generation}:${JSON.stringify(content)}`;
    if (signature === writingSignature) { pending = null; return; }
    if (signature === pending?.signature) { pending.input = input; return; }
    if (!pending && signature === appliedSignature) { appliedInput = input; return; }
    pending = { snapshot, signature, input, generation, barrier };
    void drain();
  }

  const visible = () => { if (document.visibilityState === 'visible') refresh(); };
  const stopDay = watchCalendarDay(refresh);
  window.addEventListener('quangtu:personal-events-changed', refresh);
  window.addEventListener(SESSION_CHANGE_EVENT, refresh);
  window.addEventListener('quangtu:locale-changed', refresh);
  document.addEventListener('visibilitychange', visible);
  refresh();
  return () => {
    disposed = true;
    pending = appliedOwner !== observedOwner
      ? { snapshot: { ...buildBuddhistCalendarTimeline(getVietnamNow(), 400, undefined, getLocale()), personalOwner: observedOwner },
        signature: `disposed:${generation}`, input: `disposed:${generation}`, generation, barrier, cleanup: true }
      : null;
    void drain();
    stopDay();
    window.removeEventListener('quangtu:personal-events-changed', refresh);
    window.removeEventListener(SESSION_CHANGE_EVENT, refresh);
    window.removeEventListener('quangtu:locale-changed', refresh);
    document.removeEventListener('visibilitychange', visible);
  };
}
