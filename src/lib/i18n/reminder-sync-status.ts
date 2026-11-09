import type { ReminderSyncResult } from '$lib/browser/practice-reminder-service';

const copy = {
  vi: {
    saved: 'Đã lưu trên thiết bị.', disabled: 'Đã tắt lịch nhắc. Cài đặt vẫn được lưu trên thiết bị.',
    rules: (count: number) => `Đã lưu ${count} quy tắc nhắc trên thiết bị.`,
    scheduled: (count: number) => `Đã lên lịch ${count} thông báo trong phạm vi 45 ngày tới.`,
    capacity: 'Một số nhắc nhở chưa được lên lịch do giới hạn thông báo của hệ thống. Ứng dụng sẽ cập nhật khi bạn mở lại.',
    permission: 'Chưa có quyền thông báo. Cài đặt vẫn được lưu trên thiết bị.',
    web: 'Nhắc theo lịch khi đóng trình duyệt cần ứng dụng Android/iOS. Cài đặt vẫn được lưu trên thiết bị.',
    failed: 'Đã lưu trên thiết bị; chưa thể đặt lịch nhắc. Vui lòng thử lại.',
    inexact: 'Hệ thống có thể nhắc trễ.',
    through: (value: string) => `Thông báo không lặp trong đợt này được lên lịch đến ${value} (giờ thiết bị).`,
  },
  en: {
    saved: 'Saved on this device.', disabled: 'Reminders are off. Your settings remain saved on this device.',
    rules: (count: number) => `Saved ${count} reminder rules on this device.`,
    scheduled: (count: number) => `Scheduled ${count} notifications within the next 45 days.`,
    capacity: 'Some reminders could not be scheduled because of the system notification limit. The app will update them when you reopen it.',
    permission: 'Notification permission is unavailable. Your settings remain saved on this device.',
    web: 'Scheduled reminders while the browser is closed require the Android/iOS app. Your settings remain saved on this device.',
    failed: 'Saved on this device; reminders could not be scheduled. Please try again.',
    inexact: 'System delivery may be delayed.',
    through: (value: string) => `One-off notifications in this batch are scheduled through ${value} (device time).`,
  },
};

export function reminderSyncStatusText(result: ReminderSyncResult, locale: string): string {
  const text = copy[locale === 'en' ? 'en' : 'vi'];
  const details = result.details;
  if (!details) return result.success ? text.saved : text.failed;
  if (details.mode === 'disabled') return text.disabled;
  if (details.mode === 'web-unsupported') return text.web;
  if (details.reason === 'permission-denied' || details.reason === 'permission-required' || details.reason === 'unsupported') return text.permission;
  if (!result.success) return details.reason === 'capacity' ? text.capacity : text.failed;
  const message = details.mode === 'android-durable'
    ? details.ruleCount === undefined ? text.saved : text.rules(details.ruleCount)
    : text.scheduled(result.scheduledCount);
  const through = details.actualOneOffThrough ? new Date(details.actualOneOffThrough) : null;
  const horizon = details.limited && through && Number.isFinite(through.getTime())
    ? text.through(through.toLocaleString(locale === 'en' ? 'en-GB' : 'vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })) : '';
  return [message, details.limited ? text.capacity : '', horizon, details.alarmMode === 'inexact' ? text.inexact : ''].filter(Boolean).join(' ');
}
