import { Capacitor, registerPlugin } from '@capacitor/core';
import { isNativeApp, nativePlatform } from './native-platform';

interface PracticeSoundsPlugin {
  practiceSound(options: { channel: 'ambient' | 'cue'; source?: string; cue?: 'bell' | 'bowl' | 'khánh' | 'wooden-fish'; volume?: number; delayMs?: number; stop?: boolean }): Promise<void>;
}

const plugin = registerPlugin<PracticeSoundsPlugin>('DharmaAudio');

export function hasNativePracticeSounds(): boolean {
  return isNativeApp() && nativePlatform() === 'android' && Capacitor.isPluginAvailable('DharmaAudio');
}

// Không fallback sang WebView khi bridge lỗi: sẽ lại giành audio focus của nhạc thiền.
export function playNativePracticeSound(options: Parameters<PracticeSoundsPlugin['practiceSound']>[0]): void {
  void plugin.practiceSound(options).catch(cause => console.warn('[practice-sound] Native sound unavailable', cause instanceof Error ? cause.message : 'bridge error'));
}
