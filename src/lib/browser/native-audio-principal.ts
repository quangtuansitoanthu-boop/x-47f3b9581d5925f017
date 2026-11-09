import { Capacitor, registerPlugin } from '@capacitor/core';
import type { NativeTalkPlugin } from './native-talk-audio';

export const nativeAudioPlugin = registerPlugin<NativeTalkPlugin>('DharmaAudio');

let selection: Promise<void> = Promise.resolve();
let selectedKey: string | undefined;
let revision = 0;
let selectionAttempt = 0;

function nativeAudioAvailable(): boolean {
  return Capacitor.isNativePlatform()
    && ['android', 'ios'].includes(Capacitor.getPlatform())
    && Capacitor.isPluginAvailable('DharmaAudio');
}

export function nativeAudioPrincipalKey(user: { id: string; role?: string } | null): string {
  return user ? JSON.stringify([user.id, user.role || 'user']) : 'anonymous';
}

export function selectNativeAudioPrincipal(principalKey: string): void {
  if (principalKey !== selectedKey) {
    selectedKey = principalKey;
    revision += 1;
  }
  const attempt = ++selectionAttempt;
  try {
    if (!nativeAudioAvailable()) return;
    // Native giữ owner bền vững để kiểm tra cả lần mở app mới, trước khi khôi phục queue.
    selection = nativeAudioPlugin.selectPrincipal({ principalKey }).catch(error => handleSelectionFailure(error, attempt));
  } catch (error) {
    selection = handleSelectionFailure(error, attempt);
  }
  // Đăng xuất không chờ bridge, nhưng lệnh phát/khôi phục phải nhận lỗi qua barrier bên dưới.
  void selection.catch(() => undefined);
}

async function handleSelectionFailure(error: unknown, attempt: number): Promise<void> {
  const unimplemented = typeof error === 'object' && error !== null
    && 'code' in error && error.code === 'UNIMPLEMENTED';
  if (!unimplemented) throw error;
  // Chỉ tương thích plugin cũ khi đã dừng queue cũ; không chạy cleanup trễ lên owner mới.
  if (attempt === selectionAttempt) await nativeAudioPlugin.stop();
}

export function nativeAudioPrincipalRevision(): number {
  return revision;
}

export async function waitForNativeAudioPrincipal(): Promise<void> {
  let pending: Promise<void>;
  do {
    pending = selection;
    try {
      await pending;
    } catch (error) {
      if (pending === selection) throw error;
    }
  } while (pending !== selection);
}

export function clearNativeAudioForPrincipalChange(): void {
  try {
    if (!nativeAudioAvailable()) return;
    // Gửi lệnh ngay trước khi chuyển owner; không import/retry trễ làm dừng bài của owner mới.
    void nativeAudioPlugin.stop().catch(() => undefined);
  } catch {
    // Đăng xuất vẫn phải hoàn tất khi bridge native không còn khả dụng.
  }
}
