import {
  requestUnifiedNotificationPermission,
  showUnifiedNotification,
} from './native-notifications';

export function notify(message: string, options?: NotificationOptions): void {
  void showUnifiedNotification(message, options?.body || '');
}

export async function requestNotificationPermission(): Promise<NotificationPermission | 'unsupported'> {
  const perm = await requestUnifiedNotificationPermission();
  if (perm === 'granted' || perm === 'denied') return perm;
  return 'unsupported';
}
