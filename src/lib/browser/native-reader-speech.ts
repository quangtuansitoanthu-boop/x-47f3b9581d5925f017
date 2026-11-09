import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core';
import { isNativeApp, nativePlatform } from './native-platform';

export interface NativeReaderSpeech {
  prepare(): Promise<void>;
  openSettings(): Promise<void>;
  speak(options: { id: string; text: string; language: string; rate: number; voice: string }): Promise<{ canceled?: boolean }>;
  stop(options?: { id: string }): Promise<void>;
  addListener(event: 'speechStart', callback: (event: { id: string }) => void): Promise<PluginListenerHandle>;
}

const plugin = registerPlugin<NativeReaderSpeech>('ReaderSpeech');

/** Android WebView has no Web Speech synthesis; use the installed Android engine. */
export function getNativeReaderSpeech(): NativeReaderSpeech | null {
  return isNativeApp() && (nativePlatform() === 'android'
    || (nativePlatform() === 'ios' && Capacitor.isPluginAvailable('ReaderSpeech'))) ? plugin : null;
}
