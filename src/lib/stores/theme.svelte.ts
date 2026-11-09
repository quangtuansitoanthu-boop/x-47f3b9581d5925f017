import { getContext, setContext } from 'svelte';
import { syncNativeSystemBars } from '$lib/browser/native-system-bars';
import { triggerHaptic } from '$lib/utils/haptics';

export type ThemeMode = 'auto' | 'light' | 'dark';
export type ThemeName = 'light' | 'dark';
const THEME_CONTEXT = Symbol('quangtu-theme');

export interface ThemeStore {
  readonly mode: ThemeMode;
  readonly value: ThemeName;
  apply(next: ThemeMode | ThemeName): void;
  toggle(): void;
}

function getSystemPrefersDark(): boolean {
  if (typeof window === 'undefined') return false;
  return Boolean(window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches);
}

export function createThemeStore(initial: ThemeMode = 'auto'): ThemeStore {
  let mode = $state<ThemeMode>(initial);
  let systemDark = $state(false);

  if (typeof window !== 'undefined') {
    systemDark = getSystemPrefersDark();
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    mq.addEventListener?.('change', (e) => {
      systemDark = e.matches;
      if (mode === 'auto') {
        syncDom(e.matches ? 'dark' : 'light');
      }
    });
  }

  function resolve(m: ThemeMode): ThemeName {
    if (m === 'auto') {
      return systemDark ? 'dark' : 'light';
    }
    return m;
  }

  let value = $derived<ThemeName>(resolve(mode));

  function syncDom(resolved: ThemeName) {
    if (typeof document !== 'undefined') {
      document.documentElement.dataset.theme = resolved;
      const metaTheme = document.querySelector('meta[name="theme-color"]');
      if (metaTheme) {
        metaTheme.setAttribute('content', resolved === 'dark' ? '#15120d' : '#FAF1E4');
      }
      void syncNativeSystemBars(resolved === 'dark', resolved === 'dark' ? '#15120d' : '#FAF1E4');
    }
  }

  const apply = (next: ThemeMode | ThemeName) => {
    mode = next;
    const resolved = resolve(next);
    syncDom(resolved);
    try {
      if (typeof localStorage !== 'undefined') localStorage.setItem('tutam_dark_mode', next === 'dark' ? '1' : next === 'light' ? '0' : 'auto');
    } catch { /* The live theme remains usable when persistence is unavailable. */ }
  };

  return {
    get mode() { return mode; },
    get value() { return value; },
    apply,
    toggle() {
      const next: ThemeName = value === 'dark' ? 'light' : 'dark';
      apply(next);
      triggerHaptic('selection');
    }
  };
}

export function setThemeContext(initial: ThemeMode = 'auto'): ThemeStore {
  const store = createThemeStore(initial);
  setContext(THEME_CONTEXT, store);
  return store;
}

export function getThemeContext(): ThemeStore {
  const store = getContext<ThemeStore | undefined>(THEME_CONTEXT);
  if (!store) throw new Error('Theme context is unavailable outside the root layout.');
  return store;
}
