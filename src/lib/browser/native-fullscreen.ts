import { browser } from '$app/environment';
import { isNativeApp } from './native-platform';
import { setNativeSystemBarsFullscreen } from './native-system-bars';

/**
 * Activates or deactivates immersive fullscreen mode across platforms:
 * - Native Android & iOS: Toggles native OS Status Bar (hide/show) for complete distraction-free meditation.
 * - Web & Desktop: Requests or exits the browser Fullscreen API with automatic UI fallback if unsupported or rejected.
 */
export async function setImmersiveFullscreen(
  enable: boolean,
  targetElement?: HTMLElement | null,
): Promise<boolean> {
  if (!browser) return enable;

  if (isNativeApp()) {
    await setNativeSystemBarsFullscreen(enable);
    return enable;
  }

  // Web / Browser platform
  if (enable) {
    try {
      if (targetElement && typeof targetElement.requestFullscreen === 'function') {
        await targetElement.requestFullscreen();
      } else if (typeof document !== 'undefined' && typeof document.documentElement?.requestFullscreen === 'function') {
        await document.documentElement.requestFullscreen();
      }
    } catch {
      // Browser Fullscreen API rejected or unavailable (e.g. mobile Safari / iframe);
      // fallback to pure CSS/UI fullscreen.
    }
    return true;
  }

  try {
    if (typeof document !== 'undefined' && document.fullscreenElement && typeof document.exitFullscreen === 'function') {
      await document.exitFullscreen();
    }
  } catch {
    // Ignore exit failure
  }
  return false;
}

export function isImmersiveFullscreen(): boolean {
  if (!browser) return false;
  return Boolean(document.fullscreenElement);
}
