import { createPracticeLog, normalizePracticeLog, type PracticeLog, type PracticeType } from '$lib/domain/practice/logs';
import { getPracticeStorage } from './practice-storage';
import type { StorageLike } from './storage-contract';
import { getRosaryPracticeType } from '$lib/domain/practice/guided-sessions';

export const ROSARY_COMPLETION_KEY = 'tt_rosary_completion_v1';
interface Receipt { date: string; accounted: number; pending: PracticeLog | null; resetPending: boolean; counterDate?: string }

/** Dùng bộ nhớ đã phân tách theo tài khoản, không dùng bộ nhớ chung của thiết bị. */
export function createRosaryCompletion(selectedStorage: StorageLike) {
  const practice = getPracticeStorage(selectedStorage);
  const read = (): Receipt | null => {
    const raw = selectedStorage.getItem(ROSARY_COMPLETION_KEY);
    if (!raw) return null;
    const value = JSON.parse(raw) as Receipt;
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(value.date) || !Number.isSafeInteger(value.accounted) || value.accounted < 0
      || typeof value.resetPending !== 'boolean' || (value.pending !== null && !normalizePracticeLog(value.pending))
      || (value.counterDate !== undefined && value.counterDate !== value.date)) {
      throw new Error('invalid_rosary_receipt');
    }
    return value;
  };
  const write = (value: Receipt) => selectedStorage.setItem(ROSARY_COMPLETION_KEY, JSON.stringify(value));
  const acknowledge = (value: Receipt): Receipt => {
    if (!value.pending) return value;
    // Tôn trọng việc xóa công phu; bản ghi chờ không được khôi phục mục đã xóa.
    if (!practice.getDeletedLogIds().has(String(value.pending.id))) practice.saveLog(value.pending);
    const next = { ...value, pending: null };
    write(next);
    return next;
  };
  return {
    getCounterDate(): string | null { return read()?.counterDate ?? null; },
    continueCounter(total: number, date: string): void {
      if (!Number.isSafeInteger(total) || total < 0 || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new Error('invalid_rosary_continuation');
      const previous = read();
      if (previous?.resetPending) throw new Error('rosary_reset_pending');
      const receipt = previous ? acknowledge(previous) : null;
      // Chỉ chuyển ngày sau khi số cũ đã được chốt; giữ bộ đếm mà không ghi lại công phu cũ.
      if (total > 0 && (!receipt || receipt.accounted !== total)) throw new Error('rosary_unsettled_counter');
      write({ date, accounted: total, pending: null, resetPending: false, counterDate: date });
    },
    initializeRestoredCount(total: number, date: string): void {
      if (read()) return;
      if (!Number.isSafeInteger(total) || total < 0 || !/^\d{4}-\d{2}-\d{2}$/u.test(date)) throw new Error('invalid_rosary_baseline');
      // Bản cũ chưa có receipt: giữ tổng hiển thị, không suy ra đó là công phu chưa ghi nhận.
      write({ date, accounted: total, pending: null, resetPending: false });
    },
    unaccountedCount(total: number, date: string): number {
      const receipt = read();
      return Math.max(0, total - (receipt?.date === date ? receipt.accounted : 0));
    },
    recoverReset(resetCount: () => void): void {
      const receipt = read();
      if (!receipt?.resetPending) return;
      const settled = acknowledge(receipt);
      resetCount();
      write({ ...settled, accounted: 0, resetPending: false, counterDate: undefined });
    },
    settle(total: number, newlyCounted: number, date: string, phrase: string, practiceType?: PracticeType): PracticeLog[] {
      let receipt = read();
      if (receipt) receipt = acknowledge(receipt);
      if (receipt?.resetPending) throw new Error('rosary_reset_pending');
      if (!receipt || receipt.date !== date) {
        receipt = { date, accounted: Math.max(0, total - newlyCounted), pending: null, resetPending: false };
      }
      const delta = Math.max(0, total - receipt.accounted);
      if (!delta) return practice.getLogs();
      const nextId = practice.getLogs().reduce((maximum, log) => Math.max(maximum, log.id + 1), Date.now());
      const resolvedType = practiceType ?? getRosaryPracticeType(phrase);
      const log = createPracticeLog({ id: nextId, date, count: delta, note: `Lần hạt: ${phrase}`,
        type: resolvedType });
      // Giữ nguyên dữ liệu và ID trước khi lưu để thử lại không cộng trùng công phu.
      const pending = { ...receipt, accounted: total, pending: log };
      write(pending);
      acknowledge(pending);
      return practice.getLogs();
    },
    resetCounter(date: string, resetCount: () => void): void {
      const previous = read();
      const receipt = previous ? acknowledge(previous) : { date, accounted: 0, pending: null, resetPending: false };
      // Chỉ xóa mốc đã ghi nhận sau khi đặt lại bộ đếm thành công; lỗi có thể tiếp tục thử lại.
      write({ ...receipt, resetPending: true });
      resetCount();
      write({ ...receipt, date, accounted: 0, resetPending: false, counterDate: undefined });
    },
  };
}
