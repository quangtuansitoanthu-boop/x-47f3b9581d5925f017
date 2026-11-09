import type { PracticeSessionOutboxStatus } from '$lib/browser/practice-session-outbox';

export function practiceSyncStatusText(status: PracticeSessionOutboxStatus | null, legacyPending: boolean, english: boolean): string {
  if (status?.failure === 'storage') return english
    ? 'Cannot access the practice sync queue on this device. Existing data has been kept unchanged.'
    : 'Không thể truy cập hàng đợi đồng bộ công phu trên thiết bị. Dữ liệu hiện có được giữ nguyên.';
  if (!status?.pendingOperations) return legacyPending
    ? english ? 'Your practice is saved on this device and is waiting to sync with the community.' : 'Công phu đã lưu trên máy; đang chờ đồng bộ với cộng đồng.'
    : '';
  const count = status.pendingOperations;
  if (status.failure === 'authentication') return english
    ? 'Saved on this device. Sign in again to sync your practice.'
    : 'Đã lưu trên thiết bị. Đăng nhập lại để đồng bộ công phu.';
  if (status.phase === 'syncing') return english ? `Syncing ${count} operations…` : `Đang đồng bộ ${count} thao tác…`;
  if (legacyPending) return english
    ? 'Your practice and practice log are saved on this device and are waiting to sync.'
    : 'Công phu và nhật ký đã lưu trên thiết bị, đang chờ đồng bộ.';
  if (status.failure === 'rejected') return english
    ? `Saved on this device. ${count} operations could not be accepted. Contact support to check them.`
    : `Đã lưu trên thiết bị. ${count} thao tác chưa được chấp nhận. Vui lòng liên hệ hỗ trợ để kiểm tra.`;
  return english ? `Saved on this device · ${count} operations waiting to sync.` : `Đã lưu trên thiết bị · Còn ${count} thao tác chờ đồng bộ.`;
}
