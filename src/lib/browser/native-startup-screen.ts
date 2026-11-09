import { registerPlugin } from '@capacitor/core';
import { isNativeApp, nativePlatform } from './native-platform';

const startup = registerPlugin<{ ready(): Promise<void> }>('StartupScreen');

export async function finishNativeStartup(): Promise<void> {
  if (isNativeApp() && nativePlatform() === 'android') await startup.ready();
}
