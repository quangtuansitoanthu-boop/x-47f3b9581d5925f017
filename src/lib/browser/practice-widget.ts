import { Capacitor, registerPlugin } from '@capacitor/core';
import type { QueryClient } from '@tanstack/svelte-query';
import { getVietnamIsoDate } from '$lib/domain/practice/stats';
import { practiceWidgetItems } from '$lib/i18n/practice-widget';
import type { PracticeProgressData } from './practice-community';
import { serverStateKeys } from './server-state';
import { watchCalendarDay } from './calendar-day-rollover';

export interface PracticeWidgetItem {
  id: string;
  icon: string;
  title: string;
  subtitle: string;
  path: string;
  progress: number | null;
  isCompleted: boolean;
  hasData: boolean;
}

export interface PracticeWidgetData {
  locale?: 'vi' | 'en';
  date: string;
  generatedAt: string;
  hasData: boolean;
  completionPercent: number | null;
  completedCount: number | null;
  totalCount: number | null;
  streakDays: number | null;
  items: PracticeWidgetItem[];
}

interface PracticeWidgetSession {
  authenticated: boolean;
  user: { id: string } | null;
}

const plugin = registerPlugin<{
  replaceSnapshot(snapshot: PracticeWidgetData): Promise<void>;
}>('PracticeWidget');

export function buildPracticeWidgetSnapshot(
  progress: PracticeProgressData | undefined,
  now = new Date(),
  locale = 'vi',
): PracticeWidgetData {
  const date = getVietnamIsoDate(now);
  const currentStreak = progress?.today === date && progress.profile.timeZone === 'Asia/Ho_Chi_Minh'
    ? progress.streaks.current
    : null;
  // Tổng công phu và breakdown hiện tại là toàn thời gian, không phải bốn mục tiêu hôm nay.
  // Không biến dữ liệu thiếu mục tiêu thành 0% hoặc lấy các số minh họa làm tiến độ thật.
  return {
    locale: locale === 'en' ? 'en' : 'vi',
    date,
    generatedAt: now.toISOString(),
    hasData: false,
    completionPercent: null,
    completedCount: null,
    totalCount: null,
    streakDays: currentStreak !== null && Number.isSafeInteger(currentStreak) && currentStreak >= 0
      ? currentStreak
      : null,
    items: practiceWidgetItems(locale).map(item => ({ ...item, progress: null, isCompleted: false, hasData: false })),
  };
}

export function startPracticeWidgetSync(
  queryClient: QueryClient,
  getSession: () => PracticeWidgetSession,
  getLocale: () => string = () => 'vi',
): () => void {
  if (typeof window === 'undefined' || typeof document === 'undefined'
    || !Capacitor.isNativePlatform() || !Capacitor.isPluginAvailable('PracticeWidget')) return () => {};

  let disposed = false;
  let running = false;
  let pending: { snapshot: PracticeWidgetData; signature: string; owner: string | null; cleanup?: boolean } | null = null;
  let appliedSignature = '';
  let writingSignature = '';
  const principal = () => {
    const session = getSession();
    return session.authenticated ? session.user?.id ?? null : null;
  };
  let observedOwner = principal();
  let appliedOwner: string | null | undefined;
  let ownerChanged = false;

  async function drain() {
    if (running || (disposed && !pending?.cleanup)) return;
    running = true;
    try {
      while (pending && (!disposed || pending.cleanup)) {
        const next = pending;
        pending = null;
        writingSignature = next.signature;
        try {
          await plugin.replaceSnapshot(next.snapshot);
          appliedSignature = next.signature;
          appliedOwner = next.owner;
          if (appliedOwner === observedOwner) ownerChanged = false;
        } catch {
          // Giữ dữ liệu cũ khi bridge lỗi; lần cập nhật/foreground sau sẽ thử lại.
        } finally {
          writingSignature = '';
        }
      }
    } finally {
      running = false;
    }
  }

  function refresh() {
    if (disposed) return;
    const owner = principal();
    if (owner !== observedOwner) {
      observedOwner = owner;
      ownerChanged = true;
    }
    const query = owner
      ? queryClient.getQueryState<PracticeProgressData>(serverStateKeys.practiceCommunity.progress(owner))
      : undefined;
    // Không xuất bản số dự phòng hoặc dữ liệu đã invalidate như tiến độ mới được xác nhận.
    const progress = query && query.dataUpdatedAt > 0 && !query.isInvalidated ? query.data : undefined;
    const snapshot = buildPracticeWidgetSnapshot(progress, new Date(), getLocale());
    const { generatedAt: _generatedAt, ...content } = snapshot;
    const signature = `${owner ?? 'anonymous'}:${JSON.stringify(content)}`;
    if (signature === writingSignature) {
      pending = null;
      return;
    }
    if (signature === pending?.signature || (!pending && signature === appliedSignature)) return;
    // Chỉ giữ yêu cầu mới nhất trong khi bridge đang ghi, kể cả đổi tài khoản.
    pending = { snapshot, signature, owner };
    void drain();
  }

  const unsubscribe = queryClient.getQueryCache().subscribe(event => {
    if (!['added', 'updated', 'removed'].includes(event.type)) return;
    const owner = principal();
    const key = event.query.queryKey;
    if (owner && key.length === 3 && key[0] === 'practice-community' && key[1] === 'progress' && key[2] === owner) refresh();
  });
  const visible = () => { if (document.visibilityState === 'visible') refresh(); };
  window.addEventListener('quangtu:session-changed', refresh);
  window.addEventListener('quangtu:locale-changed', refresh);
  document.addEventListener('visibilitychange', visible);
  const stopDayWatch = watchCalendarDay(refresh);
  refresh();
  return () => {
    disposed = true;
    // Chuyển tài khoản có thể điều hướng ngay; vẫn xóa metric cũ sau bridge write đang chạy.
    // Chỉ cho phép bản rỗng này chạy sau unmount, không xuất bản dữ liệu riêng của owner mới.
    pending = ownerChanged && appliedOwner !== observedOwner
      ? { snapshot: buildPracticeWidgetSnapshot(undefined, new Date(), getLocale()), signature: 'disposed:clear', owner: null, cleanup: true }
      : null;
    void drain();
    stopDayWatch();
    unsubscribe();
    window.removeEventListener('quangtu:session-changed', refresh);
    window.removeEventListener('quangtu:locale-changed', refresh);
    document.removeEventListener('visibilitychange', visible);
  };
}
