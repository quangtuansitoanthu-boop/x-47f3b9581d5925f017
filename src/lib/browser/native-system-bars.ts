import { registerPlugin } from '@capacitor/core';
import { isNativeApp, nativePlatform } from './native-platform';

const systemBars = registerPlugin<{
  setStyle(options: { dark: boolean; backgroundColor: string }): Promise<void>;
  setFullscreen(options: { enabled: boolean }): Promise<void>;
}>('AppSystemBars');

let fullscreenWork: Promise<void> = Promise.resolve();
type Appearance = { dark: boolean; backgroundColor: string };
let themeAppearance: Appearance | undefined;
const appearanceOverrides: Appearance[] = [];
let appearanceWork: Promise<void> = Promise.resolve();

export function setNativeSystemBarsFullscreen(enabled: boolean): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  const platform = nativePlatform();
  // Giữ thứ tự vào/thoát khi đóng màn thiền trước lúc bridge hoàn tất lệnh ẩn.
  fullscreenWork = fullscreenWork.then(async () => {
    if (platform === 'android') {
      await systemBars.setFullscreen({ enabled });
    } else if (platform === 'ios') {
      const { StatusBar } = await import('@capacitor/status-bar');
      if (enabled) await StatusBar.hide();
      else await StatusBar.show();
    }
  }).catch(() => {
    console.warn('[system-bars] Unable to update native fullscreen status.');
  });
  return fullscreenWork;
}

async function applyAppearance({ dark, backgroundColor }: Appearance): Promise<void> {
  if (!isNativeApp()) return;
  try {
    if (nativePlatform() === 'android') {
      await systemBars.setStyle({ dark, backgroundColor });
    } else if (nativePlatform() === 'ios') {
      const { StatusBar, Style } = await import('@capacitor/status-bar');
      await StatusBar.setStyle({ style: dark ? Style.Dark : Style.Light });
      await StatusBar.setBackgroundColor({ color: backgroundColor });
    }
  } catch {
    // Đổi theme vẫn tiếp tục khi bridge chưa sẵn sàng.
    console.warn('[system-bars] Unable to update native system bar appearance.');
  }
}

function queueAppearance(): Promise<void> {
  const appearance = appearanceOverrides[appearanceOverrides.length - 1] ?? themeAppearance;
  if (!appearance) return Promise.resolve();
  // Giữ thứ tự khi mở/đóng modal trước lúc bridge hoàn tất đổi theme.
  appearanceWork = appearanceWork.then(() => applyAppearance(appearance));
  return appearanceWork;
}

export function syncNativeSystemBars(dark: boolean, backgroundColor: string): Promise<void> {
  if (!isNativeApp()) return Promise.resolve();
  themeAppearance = { dark, backgroundColor };
  return queueAppearance();
}

export function overrideNativeSystemBars(dark: boolean, backgroundColor: string): () => void {
  if (!isNativeApp()) return () => {};
  const appearance = { dark, backgroundColor };
  appearanceOverrides.push(appearance);
  void queueAppearance();
  return () => {
    const index = appearanceOverrides.indexOf(appearance);
    if (index < 0) return;
    appearanceOverrides.splice(index, 1);
    void queueAppearance();
  };
}
