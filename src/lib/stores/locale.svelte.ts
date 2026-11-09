import { getContext, setContext } from 'svelte';
import { translations, type AppLocale, type TranslationSchema } from '$lib/i18n/translations';

const LOCALE_CONTEXT = Symbol('quangtu-locale');
const LOCALE_STORAGE_KEY = 'tutam_locale';

export interface LocaleStore {
  readonly current: AppLocale;
  readonly t: TranslationSchema;
  setLocale(next: AppLocale): void;
  toggle(): void;
}

/**
 * Mặc định ứng dụng là Tiếng Việt ('vi').
 * Người dùng có thể chuyển sang Tiếng Anh ('en') bất kỳ lúc nào trong phần Cài đặt / Cá nhân.
 */
export function detectDeviceLocale(): AppLocale {
  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === 'en' || saved === 'vi') return saved;
    } catch {}
  }
  return 'vi';
}

function syncHtmlLang(lang: AppLocale) {
  if (typeof document !== 'undefined') {
    document.documentElement.lang = lang;
  }
}

export function createLocaleStore(initial?: AppLocale): LocaleStore {
  let detectedLocale: AppLocale = initial ?? 'vi';

  if (typeof window !== 'undefined') {
    try {
      const saved = localStorage.getItem(LOCALE_STORAGE_KEY);
      if (saved === 'en' || saved === 'vi') {
        detectedLocale = saved;
      } else {
        detectedLocale = detectDeviceLocale();
      }
    } catch {
      detectedLocale = detectDeviceLocale();
    }
  }

  let current = $state<AppLocale>(detectedLocale);
  syncHtmlLang(detectedLocale);

  const t = $derived<TranslationSchema>(translations[current] as TranslationSchema);

  const setLocale = (next: AppLocale) => {
    current = next;
    syncHtmlLang(next);
    if (typeof localStorage !== 'undefined') {
      try {
        localStorage.setItem(LOCALE_STORAGE_KEY, next);
      } catch {}
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(new CustomEvent('quangtu:locale-changed', { detail: next }));
    }
  };

  const toggle = () => {
    setLocale(current === 'vi' ? 'en' : 'vi');
  };

  return {
    get current() {
      return current;
    },
    get t() {
      return t;
    },
    setLocale,
    toggle,
  };
}

export function setLocaleContext(initial?: AppLocale): LocaleStore {
  const store = createLocaleStore(initial);
  setContext(LOCALE_CONTEXT, store);
  return store;
}

export function getLocaleContext(): LocaleStore {
  const store = getContext<LocaleStore | undefined>(LOCALE_CONTEXT);
  if (!store) {
    return createLocaleStore('vi');
  }
  return store;
}
